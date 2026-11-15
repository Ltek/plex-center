"""Websocket API and image proxy for the Plex Center card.

Every command takes the TV (`tv`: its id) and answers for that TV's Plex Home user, so the card shows
the libraries, Continue Watching and watched marks of the user the TV's Plex app uses.
"""

from __future__ import annotations

from datetime import datetime
import logging
import random
from typing import Any

from aiohttp import web
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN, TV_ADB, TV_ID, TV_NAME, TV_PIPUP, TV_PLEX, TV_ROUTE, TV_USER, VERSION
from .media import details, image_url, item_dict
from .tvs import real_playback, route_for

_LOGGER = logging.getLogger(__name__)

SORTS = {"title": "titleSort:asc", "added": "addedAt:desc", "year": "year:desc", "rating": "audienceRating:desc",
         "viewed": "lastViewedAt:desc", "released": "originallyAvailableAt:desc"}
KINDS = ("movie", "show")
INTEGRATIONS = ["plex", "pipup", "androidtv", "androidtv_remote", "cast", "tautulli", "tautulli_active_streams",
                "sonarr", "radarr", "plex_recently_added", "upcoming_media"]


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the commands and the image view (once)."""
    for fn in (ws_config, ws_items, ws_hubs, ws_item, ws_random, ws_sessions, ws_search, ws_filters, ws_plex_hubs, ws_letters):
        websocket_api.async_register_command(hass, fn)
    hass.http.register_view(PlexImageView())


# ------------------------------------------------------------------------------------------- helpers

def _entry(hass: HomeAssistant, entry_id: str | None = None):
    from . import loaded_entries  # noqa: PLC0415

    entries = loaded_entries(hass)
    if entry_id:
        entries = [e for e in entries if e.entry_id == entry_id]
    if not entries:
        raise LookupError("Plex Center is not set up")
    return entries[0]


def _tv(entry, tv_id: str | None) -> dict[str, Any]:
    tvs = entry.runtime_data.tvs
    if not tvs:
        return {TV_ID: "", TV_NAME: "", TV_USER: ""}
    return next((t for t in tvs if t[TV_ID] == tv_id), tvs[0])


def _signer(hass: HomeAssistant, server_id: str):
    return lambda path, width=300: image_url(hass, server_id, path, width)


async def _run(hass, conn, connection, msg, user: str | None, fn) -> None:
    try:
        result = await conn.async_call(user, fn)
    except Exception as err:  # noqa: BLE001 - shown in the card as a message
        _LOGGER.debug("plex_center %s failed: %s", msg["type"], err, exc_info=True)
        connection.send_error(msg["id"], "plex_error", str(err))
        return
    connection.send_result(msg["id"], result)


def _sections(server) -> list:
    return [s for s in server.library.sections() if s.type in KINDS]


def _section(server, library: str):
    return next(s for s in _sections(server) if str(s.key) == str(library) or s.title == library)


def tv_state(hass: HomeAssistant, tv: dict[str, Any]) -> dict[str, Any]:
    """Live state of a TV for the card: route, power, and what plays (from its players)."""
    out: dict[str, Any] = {"route": route_for(hass, tv), "state": "unavailable"}
    states = [hass.states.get(e) for e in (tv.get(TV_PIPUP), tv.get(TV_PLEX), tv.get(TV_ADB)) if e]
    states = [s for s in states if s]
    if states:
        out["state"] = next((s.state for s in states if s.state not in ("unavailable", "unknown")), states[0].state)
    if live := next((s for s in states if real_playback(s)), None):
        out["playing"] = {"state": live.state, "title": live.attributes.get("media_title")}
    return out


# ------------------------------------------------------------------------------------------- commands

@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/config", vol.Optional("entry_id"): str})
@websocket_api.async_response
async def ws_config(hass: HomeAssistant, connection, msg) -> None:
    """TVs (with live state), each TV user's libraries, the integrations found, and the version."""
    try:
        entry = _entry(hass, msg.get("entry_id"))
    except LookupError as err:
        connection.send_error(msg["id"], "not_set_up", str(err))
        return
    conn = entry.runtime_data.conn
    tvs, libraries = [], {}
    for tv in entry.runtime_data.tvs:
        user = tv.get(TV_USER) or ""
        if user not in libraries:
            try:
                libraries[user] = await conn.async_call(user, lambda s: [{"key": str(x.key), "title": x.title, "type": x.type} for x in _sections(s)])
            except Exception as err:  # noqa: BLE001
                libraries[user] = {"error": str(err)}
        tvs.append({"id": tv[TV_ID], "name": tv[TV_NAME], "user": user, "route_setting": tv.get(TV_ROUTE, "auto"),
                    **{k: tv[k] for k in (TV_PIPUP, TV_ADB, TV_PLEX) if tv.get(k)}, **tv_state(hass, tv)})
    reg = er.async_get(hass)
    found = {p for p in (e.platform for e in reg.entities.values()) if p in INTEGRATIONS}
    upcoming = sorted(s.entity_id for s in hass.states.async_all("sensor") if isinstance(s.attributes.get("data"), (list, str))
                      and str(s.attributes.get("data")).lstrip().startswith(("[", "[{")))
    card_version = ""
    try:
        from pathlib import Path  # noqa: PLC0415

        from .card_view import card_file  # noqa: PLC0415

        card_version = (await hass.async_add_executor_job(card_file, Path(__file__).parent / "frontend" / "plex-center-card.js"))[2]
    except OSError:
        pass
    connection.send_result(msg["id"], {"version": VERSION, "card_version": card_version, "entry_id": entry.entry_id, "server_id": conn.server_id, "tvs": tvs,
                                       "libraries": libraries, "integrations": sorted(found), "upcoming_sensors": upcoming})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/items", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
    vol.Required("library"): str, vol.Optional("start", default=0): vol.All(int, vol.Range(min=0)),
    vol.Optional("size", default=60): vol.All(int, vol.Range(min=1, max=200)),
    vol.Optional("sort", default="title"): vol.In(list(SORTS)), vol.Optional("query"): str,
    vol.Optional("unwatched"): bool, vol.Optional("genre"): str, vol.Optional("year"): int,
    vol.Optional("decade"): int, vol.Optional("content_rating"): str, vol.Optional("max_minutes"): vol.All(int, vol.Range(min=1, max=1000)),
})
@websocket_api.async_response
async def ws_items(hass: HomeAssistant, connection, msg) -> None:
    """A page of a library for the TV's user: sort, search, unwatched / genre / year."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)

    def fetch(server):
        sec = _section(server, msg["library"])
        kw: dict[str, Any] = {"sort": SORTS[msg["sort"]], "container_start": msg["start"], "container_size": msg["size"], "maxresults": msg["size"]}
        if msg.get("query"):
            kw["title"] = msg["query"]
        filters = {}
        if msg.get("unwatched"):
            filters["unwatched"] = True
        if msg.get("genre"):
            filters["genre"] = msg["genre"]
        if msg.get("year"):
            filters["year"] = msg["year"]
        if msg.get("decade"):
            filters["decade"] = msg["decade"]
        if msg.get("content_rating"):
            filters["contentRating"] = msg["content_rating"]
        if msg.get("max_minutes") and sec.type == "movie":
            filters["duration<<"] = msg["max_minutes"] * 60 * 1000
        if filters:
            kw["filters"] = filters
        items = sec.search(**kw)
        return {"library": str(sec.key), "start": msg["start"], "items": [item_dict(i, sign) for i in items],
                "more": len(items) >= msg["size"]}

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/letters", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Required("library"): str})
@websocket_api.async_response
async def ws_letters(hass: HomeAssistant, connection, msg) -> None:
    """First letters of a library's titles with how many titles start with each (for the A-Z jump bar)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))

    def fetch(server):
        sec = _section(server, msg["library"])
        out, start = [], 0
        for fc in sec.firstCharacter():
            size = int(getattr(fc, "size", 0) or 0)
            out.append({"letter": str(getattr(fc, "title", "") or getattr(fc, "key", "")), "size": size, "start": start})
            start += size
        return {"library": str(sec.key), "letters": out}

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/hubs", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Optional("library"): str, vol.Optional("size", default=20): vol.All(int, vol.Range(min=1, max=100))})
@websocket_api.async_response
async def ws_hubs(hass: HomeAssistant, connection, msg) -> None:
    """Continue Watching and Recently Added for the TV's user (whole server, or one library)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)
    n = msg["size"]

    def fetch(server):
        if msg.get("library"):
            sec = _section(server, msg["library"])
            cont, recent = sec.continueWatching(), sec.recentlyAdded(maxresults=n)
        else:
            cont = server.continueWatching()
            recent = [i for s in _sections(server) for i in s.recentlyAdded(maxresults=n)]
            recent.sort(key=lambda i: getattr(i, "addedAt", None) or datetime.min, reverse=True)
        return {"continue": [item_dict(i, sign) for i in cont[:n]], "recent": [item_dict(i, sign) for i in recent[:n]]}

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/item", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Required("key"): vol.All(str, vol.Match(r"^\d+$"))})
@websocket_api.async_response
async def ws_item(hass: HomeAssistant, connection, msg) -> None:
    """Full details of one title for the TV's user (seasons, episodes, next episode, trailer)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)
    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), lambda s: details(s.fetchItem(int(msg["key"])), sign))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/random", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Required("library"): str, vol.Optional("unwatched", default=True): bool})
@websocket_api.async_response
async def ws_random(hass: HomeAssistant, connection, msg) -> None:
    """Surprise me: a random title from a library (unwatched by the TV's user by default)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)

    def fetch(server):
        sec = _section(server, msg["library"])
        pool = sec.search(filters={"unwatched": True}) if msg["unwatched"] else sec.all()
        if not pool:
            pool = sec.all()
        return item_dict(random.choice(pool), sign) if pool else None

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/sessions", vol.Optional("entry_id"): str})
@websocket_api.async_response
async def ws_sessions(hass: HomeAssistant, connection, msg) -> None:
    """Who is watching what, on which player (every user; admin connection)."""
    entry = _entry(hass, msg.get("entry_id"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)

    def fetch(server):
        out = []
        for s in server.sessions():
            d = item_dict(s, sign)
            player = (s.players or [None])[0]
            d.update({"user": (s.usernames or [None])[0], "player": getattr(player, "title", None),
                      "device": getattr(player, "product", None), "player_state": getattr(player, "state", None)})
            out.append({k: v for k, v in d.items() if v is not None})
        return out

    await _run(hass, entry.runtime_data.conn, connection, msg, "", fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/search", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Required("query"): vol.All(str, vol.Length(min=1, max=100)),
                                  vol.Optional("limit", default=12): vol.All(int, vol.Range(min=1, max=50))})
@websocket_api.async_response
async def ws_search(hass: HomeAssistant, connection, msg) -> None:
    """Search every library the TV's user can see: [{library, items}] (movies, shows, episodes)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)

    def fetch(server):
        groups: dict[str, list] = {}
        allowed = {s.title for s in _sections(server)}
        for hit in server.search(msg["query"], limit=msg["limit"]):
            if getattr(hit, "type", None) not in ("movie", "show", "episode"):
                continue
            lib = getattr(hit, "librarySectionTitle", None) or ""
            if lib and lib not in allowed:
                continue
            groups.setdefault(lib or "Other", []).append(item_dict(hit, sign))
        return [{"library": k, "items": v} for k, v in groups.items()]

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/filters", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Required("library"): str})
@websocket_api.async_response
async def ws_filters(hass: HomeAssistant, connection, msg) -> None:
    """Choices for a library's filters: genres, decades, content ratings."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))

    def fetch(server):
        sec = _section(server, msg["library"])
        out = {"type": sec.type}
        for field, key in (("genre", "genres"), ("decade", "decades"), ("contentRating", "content_ratings")):
            try:
                out[key] = [{"value": c.key if field != "genre" else c.title, "title": c.title} for c in sec.listFilterChoices(field)]
            except Exception:  # noqa: BLE001 - a library type without that filter
                out[key] = []
        return out

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/plex_hubs", vol.Optional("entry_id"): str, vol.Optional("tv"): str,
                                  vol.Optional("library"): str, vol.Optional("hub"): str,
                                  vol.Optional("size", default=20): vol.All(int, vol.Range(min=1, max=100))})
@websocket_api.async_response
async def ws_plex_hubs(hass: HomeAssistant, connection, msg) -> None:
    """Plex's own rows ("Because you watched…", "Top rated", …) for the TV's user. Without `hub`: the list of
    hubs (id + title); with `hub`: that hub's items."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)

    def fetch(server):
        hubs = _section(server, msg["library"]).hubs() if msg.get("library") else server.library.hubs()
        if not msg.get("hub"):
            return [{"id": h.hubIdentifier, "title": h.title} for h in hubs if h.type in ("movie", "show", "episode", "mixed", None)]
        hub = next((h for h in hubs if h.hubIdentifier == msg["hub"] or h.title == msg["hub"]), None)
        if hub is None:
            return {"title": "", "items": []}
        items = [i for i in hub.items() if getattr(i, "type", None) in ("movie", "show", "episode")][: msg["size"]]
        return {"title": hub.title, "items": [item_dict(i, sign) for i in items]}

    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


# ------------------------------------------------------------------------------------------- images

class PlexImageView(HomeAssistantView):
    """Plex images through HA: signed URLs only, the Plex token stays here."""

    url = "/api/plex_center/image/{server_id}"
    name = "api:plex_center:image"
    requires_auth = True

    async def get(self, request: web.Request, server_id: str) -> web.Response:
        from homeassistant.helpers.http import KEY_HASS  # noqa: PLC0415

        hass: HomeAssistant = request.app[KEY_HASS]
        path = request.query.get("p", "")
        try:
            width = max(40, min(1920, int(request.query.get("w", "300"))))
        except ValueError:
            width = 300
        if not path.startswith("/library/") or ".." in path:
            return web.Response(status=400)
        entry = next((e for e in _entries(hass) if e.runtime_data.conn.server_id == server_id), None)
        if entry is None:
            return web.Response(status=404)

        def url(server):
            return server.transcodeImage(path, height=int(width * 1.5), width=width, minSize=1, upscale=1)

        try:
            src = await entry.runtime_data.conn.async_call("", url)
            from homeassistant.helpers.aiohttp_client import async_get_clientsession  # noqa: PLC0415

            async with async_get_clientsession(hass, verify_ssl=False).get(src, timeout=15) as res:
                if res.status != 200:
                    return web.Response(status=res.status)
                body = await res.read()
                return web.Response(body=body, content_type=res.content_type or "image/jpeg",
                                    headers={"Cache-Control": "private, max-age=86400"})
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("plex_center image %s failed: %s", path, err)
            return web.Response(status=502)


def _entries(hass):
    from . import loaded_entries  # noqa: PLC0415

    return loaded_entries(hass)
