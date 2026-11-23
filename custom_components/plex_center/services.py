"""Actions: plex_center.play and plex_center.control (usable from the card, scripts, automations and voice)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
import homeassistant.helpers.config_validation as cv

from .const import DOMAIN, TV_ID, TV_NAME, TV_USER
from .media import item_dict
from .media import app_link
from .play import control, open_app, start, trailer

PLAY_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                          vol.Optional("title"): cv.string, vol.Optional("mode", default="play"): vol.In(["play", "restart", "next"])})
MARK_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Required("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                          vol.Required("watched"): cv.boolean})
TRAILER_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                             vol.Optional("url"): cv.string})
RESUME_SCHEMA = vol.Schema({vol.Required("tv"): cv.string})
CONTROL_SCHEMA = vol.Schema({vol.Required("tv"): cv.string,
                             vol.Required("action"): vol.In(["play", "pause", "play_pause", "stop", "home", "seek", "skip",
                                                             "volume_up", "volume_down", "mute", "power_on", "power_off"]),
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
        await start(hass, tv, item, "restart" if call.data["mode"] == "restart" else "play")

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
    hass.services.async_register(DOMAIN, "control", _logged(hass, "control", ctl), schema=CONTROL_SCHEMA)
    hass.services.async_register(DOMAIN, "resume", _logged(hass, "resume", resume), schema=RESUME_SCHEMA)
