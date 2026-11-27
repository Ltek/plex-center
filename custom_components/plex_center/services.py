"""Actions: plex_center.play and plex_center.control (usable from the card, scripts, automations and voice)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import HomeAssistantError
import homeassistant.helpers.config_validation as cv

from .const import DOMAIN, TV_ID, TV_NAME, TV_USER
from .media import item_dict
from .media import app_link
from .play import control, open_app, start, trailer

PLAY_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                          vol.Optional("title"): cv.string, vol.Optional("mode", default="play"): vol.In(["play", "restart", "next"]),
                          vol.Optional("activity"): cv.string, vol.Optional("start_room", default=True): cv.boolean})
MARK_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Required("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                          vol.Required("watched"): cv.boolean})
TRAILER_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                             vol.Optional("url"): cv.string})
RESUME_SCHEMA = vol.Schema({vol.Required("tv"): cv.string})
ROOM_POWER_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Required("on"): cv.boolean})
DEMO_PLAY_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("sequence", default="all"): cv.string,
                               vol.Optional("start", default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=10000)),
                               vol.Optional("mode", default="all"): vol.In(["one", "all", "loop"]),
                               vol.Optional("skip", default=list): vol.All(cv.ensure_list, [vol.All(cv.string, vol.Match(r"^\d{1,12}$"))]),
                               vol.Optional("order", default=list): vol.All(cv.ensure_list, [vol.All(cv.string, vol.Match(r"^\d{1,12}$"))])})
DEMO_CONTROL_SCHEMA = vol.Schema({vol.Required("tv"): cv.string,
                                  vol.Required("action"): vol.Any(vol.In(["next", "previous", "stop", "pause", "resume"]), vol.Match(r"^\d{1,4}$"), vol.Match(r"^(skip|unskip):\d{1,12}$"),
                                                                  vol.Match(r"^move:\d{1,12}:(\d{1,12}|first)$"))})
SEARCH_SCHEMA = vol.Schema({vol.Required("query"): vol.All(cv.string, vol.Length(min=1, max=100)), vol.Optional("tv"): cv.string,
                            vol.Optional("type", default="any"): vol.In(["any", "movie", "show", "episode"]),
                            vol.Optional("limit", default=10): vol.All(vol.Coerce(int), vol.Range(min=1, max=50))})
SLEEP_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("minutes", default=0): vol.All(vol.Coerce(int), vol.Range(min=0, max=600)),
                           vol.Optional("after", default=False): cv.boolean})
CONTROL_SCHEMA = vol.Schema({vol.Required("tv"): cv.string,
                             vol.Required("action"): vol.In(["play", "pause", "play_pause", "stop", "home", "seek", "skip",
                                                             "volume_up", "volume_down", "volume_set", "mute", "power_on", "power_off"]),
                             vol.Optional("value"): vol.Coerce(float)})


def find_tv(hass: HomeAssistant, wanted: str):
    """(entry, tv) by TV id or name (case-insensitive)."""
    from . import loaded_entries  # noqa: PLC0415

    w = wanted.strip().lower()
    for entry in loaded_entries(hass):
        for tv in entry.runtime_data.tvs:
            if w in (tv[TV_ID].lower(), tv[TV_NAME].lower()):
                return entry, tv
    raise HomeAssistantError(f"No Plex Center TV called {wanted}")


async def _resolve(hass: HomeAssistant, entry, tv: dict[str, Any], key: str | None, title: str | None, mode: str) -> dict[str, Any]:
    """The item to play for the TV's user: by key, or the first search hit for a title; 'next' = a show's next episode."""
    def fetch(server):
        if key:
            item = server.fetchItem(int(key))
        else:
            hits = [h for h in server.search(title or "", limit=10) if getattr(h, "type", None) in ("movie", "show", "episode")]
            if not hits:
                raise HomeAssistantError(f"Nothing in Plex matches {title}")
            item = hits[0]
        if item.type == "show":   # a show plays its next episode (Plex's On Deck for the TV's user), else the first
            nxt = None
            try:
                nxt = item.onDeck()
            except Exception:  # noqa: BLE001
                nxt = None
            if nxt is None:
                eps = item.episodes()
                if not eps:
                    raise HomeAssistantError(f"{item.title} has no episodes")
                nxt = eps[0]
            return item_dict(nxt)
        return item_dict(item)

    return await entry.runtime_data.conn.async_call(tv.get(TV_USER), fetch)


def _logged(hass: HomeAssistant, name: str, fn):
    """Run an action; a failure goes to Plex Center's log (and Home Assistant's) with its cause, then on to the caller."""
    async def run(call: ServiceCall) -> None:
        try:
            await fn(call)
        except Exception as err:
            from .eventlog import record  # noqa: PLC0415
            try:
                _entry, tv = find_tv(hass, call.data.get("tv", ""))
            except HomeAssistantError:
                tv = {TV_NAME: call.data.get("tv")}
            what = name if name != "control" else f"{call.data.get('action')}"
            record(hass, tv, what, err)
            raise
    return run


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the actions once."""
    if hass.services.has_service(DOMAIN, "play"):
        return

    async def play(call: ServiceCall) -> None:
        entry, tv = find_tv(hass, call.data["tv"])
        if not call.data.get("key") and not call.data.get("title"):
            raise HomeAssistantError("Give a key or a title")
        item = await _resolve(hass, entry, tv, call.data.get("key"), call.data.get("title"), call.data["mode"])
        await start(hass, tv, item, "restart" if call.data["mode"] == "restart" else "play",
                    activity=call.data.get("activity"), start_room=call.data["start_room"])

    async def ctl(call: ServiceCall) -> None:
        _entry, tv = find_tv(hass, call.data["tv"])
        await control(hass, tv, call.data["action"], call.data.get("value"))

    async def mark(call: ServiceCall) -> None:
        entry, tv = find_tv(hass, call.data["tv"])

        def run(server):
            item = server.fetchItem(int(call.data["key"]))
            if call.data["watched"]:
                item.markPlayed()
            else:
                item.markUnplayed()
        await entry.runtime_data.conn.async_call(tv.get(TV_USER), run)
        if call.data["watched"] and entry.runtime_data.resumes:
            entry.runtime_data.resumes.forget_key(call.data["key"])

    async def resume(call: ServiceCall) -> None:
        """Turn the TV on and carry on with what was playing when it was turned off."""
        entry, tv = find_tv(hass, call.data["tv"])
        res = entry.runtime_data.resumes
        rec = res.get(tv[TV_ID]) if res else None
        if not rec:
            raise HomeAssistantError(f"Nothing to resume on {tv[TV_NAME]}")
        if rec["kind"] == "plex":
            item = await _resolve(hass, entry, tv, rec["key"], None, "play")
            await start(hass, tv, item, "play")      # Plex starts it at its saved position
        else:
            await open_app(hass, tv, rec)
        res.forget(tv[TV_ID])

    async def play_trailer(call: ServiceCall) -> None:
        entry, tv = find_tv(hass, call.data["tv"])
        if call.data.get("url"):
            await trailer(hass, tv, url=call.data["url"])
            return
        if not call.data.get("key"):
            raise HomeAssistantError("Give a trailer link or the Plex key of a title")

        def find(server):
            item = server.fetchItem(int(call.data["key"]))
            extra = next((x for x in item.extras() if getattr(x, "subtype", None) == "trailer"), None)
            if extra is None:
                raise HomeAssistantError(f"{item.title} has no trailer in Plex")
            d = item_dict(extra)
            d["link"] = app_link(server.machineIdentifier, {"type": "clip", "key": str(extra.ratingKey)})
            return d
        await trailer(hass, tv, item=await entry.runtime_data.conn.async_call(tv.get(TV_USER), find))

    hass.services.async_register(DOMAIN, "mark", _logged(hass, "mark", mark), schema=MARK_SCHEMA)
    hass.services.async_register(DOMAIN, "play_trailer", _logged(hass, "play_trailer", play_trailer), schema=TRAILER_SCHEMA)
    hass.services.async_register(DOMAIN, "play", _logged(hass, "play", play), schema=PLAY_SCHEMA)

    async def demo_play(call: ServiceCall) -> None:
        entry, tv = find_tv(hass, call.data["tv"])
        await entry.runtime_data.demos.async_play(tv, call.data["sequence"], call.data["start"], call.data["mode"], call.data["skip"], call.data["order"])

    async def demo_control(call: ServiceCall) -> None:
        entry, tv = find_tv(hass, call.data["tv"])
        await entry.runtime_data.demos.async_control(tv, str(call.data["action"]))
    async def room_power(call: ServiceCall) -> None:
        """The TV's own Room power entity on / off (TVs in an Easy AV Control room use that integration instead)."""
        from .play import set_room  # noqa: PLC0415
        _entry, tv = find_tv(hass, call.data["tv"])
        if not await set_room(hass, tv, call.data["on"]):
            raise HomeAssistantError(f"{tv.get('name')} has no Room power entity that can turn it {'on' if call.data['on'] else 'off'}")
    hass.services.async_register(DOMAIN, "room_power", _logged(hass, "room power", room_power), schema=ROOM_POWER_SCHEMA)

    async def demo_status(call: ServiceCall) -> ServiceResponse:
        entry, tv = find_tv(hass, call.data["tv"])
        return entry.runtime_data.demos.status(tv["id"])
    hass.services.async_register(DOMAIN, "demo_status", demo_status, schema=RESUME_SCHEMA, supports_response=SupportsResponse.ONLY)

    async def demo_sequences(call: ServiceCall) -> ServiceResponse:
        """The TV's demo library and its collections (to fill a dropdown, for example)."""
        from . import demos as dm  # noqa: PLC0415
        entry, tv = find_tv(hass, call.data["tv"])
        lib = entry.runtime_data.demos.settings(tv["id"])["library"]
        seqs = await entry.runtime_data.conn.async_call(tv.get("plex_user"), lambda srv: dm.sequences(srv, lib))
        return {"library": lib, "sequences": seqs, "titles": [x["title"] for x in seqs]}
    hass.services.async_register(DOMAIN, "demo_sequences", demo_sequences, schema=RESUME_SCHEMA, supports_response=SupportsResponse.ONLY)
    hass.services.async_register(DOMAIN, "demo_play", _logged(hass, "demo_play", demo_play), schema=DEMO_PLAY_SCHEMA)
    hass.services.async_register(DOMAIN, "demo_control", _logged(hass, "demo_control", demo_control), schema=DEMO_CONTROL_SCHEMA)
    hass.services.async_register(DOMAIN, "control", _logged(hass, "control", ctl), schema=CONTROL_SCHEMA)
    hass.services.async_register(DOMAIN, "resume", _logged(hass, "resume", resume), schema=RESUME_SCHEMA)

    async def search(call: ServiceCall) -> ServiceResponse:
        """Find movies / shows / episodes by title, as the TV's Plex user sees them (watched or not)."""
        from . import loaded_entries  # noqa: PLC0415

        if call.data.get("tv"):
            entry, tv = find_tv(hass, call.data["tv"])
        else:
            entry = next(iter(loaded_entries(hass)), None)
            if entry is None:
                raise HomeAssistantError("Plex Center isn't set up")
            tv = entry.runtime_data.tvs[0] if entry.runtime_data.tvs else {}
        want = call.data["type"]

        def run(server):
            out = []
            for hit in server.search(call.data["query"], limit=max(call.data["limit"] * 2, 10)):
                t = getattr(hit, "type", None)
                if t not in ("movie", "show", "episode") or (want != "any" and t != want):
                    continue
                d = item_dict(hit)
                row = {k: d[k] for k in ("key", "type", "title", "year", "watched", "duration", "offset", "show", "season",
                                         "episode", "show_key", "rating", "episodes", "watched_episodes") if k in d}
                row["library"] = getattr(hit, "librarySectionTitle", None) or ""
                out.append(row)
                if len(out) >= call.data["limit"]:
                    break
            return out
        results = await entry.runtime_data.conn.async_call(tv.get(TV_USER), run)
        return {"results": results}

    hass.services.async_register(DOMAIN, "search", search, schema=SEARCH_SCHEMA, supports_response=SupportsResponse.ONLY)

    async def sleep_timer(call: ServiceCall) -> None:
        """Turn the TV (and its room) off after `minutes`, or when what's playing ends (`after`); neither cancels."""
        from .sleep import start as sleep_start  # noqa: PLC0415

        _entry, tv = find_tv(hass, call.data["tv"])
        sleep_start(hass, tv, call.data["minutes"], call.data["after"])
    hass.services.async_register(DOMAIN, "sleep_timer", _logged(hass, "sleep timer", sleep_timer), schema=SLEEP_SCHEMA)
