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
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN, TV_ADB, TV_ID, TV_NAME, TV_PIPUP, TV_PLEX, TV_REMOTE, TV_ROUTE, TV_USER, TV_CAST, VERSION
from .media import details, image_url, item_dict
from .play import can_power_off
from .tvs import real_playback, route_for, tv_on

_LOGGER = logging.getLogger(__name__)

SORTS = {"title": "titleSort:asc", "added": "addedAt:desc", "year": "year:desc", "rating": "audienceRating:desc",
         "viewed": "lastViewedAt:desc", "released": "originallyAvailableAt:desc"}
KINDS = ("movie", "show")
INTEGRATIONS = ["plex", "pipup", "androidtv", "androidtv_remote", "cast", "tautulli", "tautulli_active_streams",
                "sonarr", "radarr", "plex_recently_added", "upcoming_media"]


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the commands and the image view (once)."""
    for fn in (ws_config, ws_items, ws_hubs, ws_item, ws_random, ws_sessions, ws_search, ws_filters, ws_plex_hubs, ws_letters, ws_calendar,
               ws_resumes, ws_resume_forget, ws_app_media, ws_log, ws_log_clear, ws_tv_update, ws_sleep, ws_markers, ws_av, ws_av_pending,
               ws_demos, ws_demos_clips, ws_demos_settings, ws_demos_label, ws_demos_collection, ws_demos_subscribe):
        websocket_api.async_register_command(hass, fn)
    hass.http.register_view(PlexImageView())


# ------------------------------------------------------------------------------------------- TV settings (card editor)

from .const import (TV_BUSY, TV_CREDITS, TV_FAIL, TV_POWER, TV_POWER_OFF, TV_POWER_ON, TV_READY, TV_READY_S, TV_ROOM_OFF,  # noqa: E402
                    TV_SKIP_BACK, TV_SKIP_FWD, TV_STATUS, TV_VOLUME, TV_AV)

ROOM_DOMAINS = ("input_boolean", "input_select", "select", "switch", "script", "scene")
EDIT_ENTITY = {TV_PIPUP: ("media_player",), TV_ADB: ("media_player",), TV_REMOTE: ("media_player",), TV_CAST: ("media_player",),
               TV_PLEX: ("media_player",), TV_VOLUME: ("media_player",), TV_POWER: ROOM_DOMAINS, TV_STATUS: (),
               TV_CREDITS: ("scene", "script")}
EDIT_TEXT = (TV_NAME, TV_USER, TV_POWER_ON, TV_POWER_OFF, TV_READY, TV_BUSY, TV_FAIL)
EDIT_NUM = {TV_SKIP_FWD: (5, 600, 30), TV_SKIP_BACK: (5, 600, 10), TV_READY_S: (10, 900, 120)}
EDIT_BOOL = (TV_ROOM_OFF,)
EDITABLE = (*EDIT_ENTITY, *EDIT_TEXT, *EDIT_NUM, *EDIT_BOOL, TV_ROUTE, TV_AV, "av_play")


def apply_tv_changes(tv: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """A TV with `changes` applied, checked like the Configure dialog does (ValueError with the reason).
    An empty value clears the setting (back to its default)."""
    import re  # noqa: PLC0415

    from .const import ROUTES  # noqa: PLC0415

    out = dict(tv)
    for k, v in changes.items():
        if k not in EDITABLE:
            raise ValueError(f"{k} can't be changed here")
        empty = v is None or (isinstance(v, str) and not v.strip())
        if k in EDIT_ENTITY:
            if empty:
                out.pop(k, None)
                continue
            v = str(v).strip()
            if not re.match(r"^[a-z_]+\.[a-z0-9_]+$", v):
                raise ValueError(f"{v} isn't an entity id")
            if EDIT_ENTITY[k] and v.split(".", 1)[0] not in EDIT_ENTITY[k]:
                raise ValueError(f"{v}: this needs a {' / '.join(EDIT_ENTITY[k])} entity")
            out[k] = v
        elif k in EDIT_TEXT:
            if k == TV_NAME and empty:
                raise ValueError("A TV needs a name")
            if empty:
                out[k] = "" if k == TV_USER else None
                if out[k] is None:
                    out.pop(k)
            else:
                out[k] = str(v).strip()[:100]
        elif k in EDIT_NUM:
            lo, hi, default = EDIT_NUM[k]
            if empty:
                out.pop(k, None)
                continue
            n = int(float(v))
            if not lo <= n <= hi:
                raise ValueError(f"{k} must be {lo}–{hi}")
            if n == default:
                out.pop(k, None)
            else:
                out[k] = n
        elif k in EDIT_BOOL:
            if v:
                out[k] = True
            else:
                out.pop(k, None)
        elif k == "av_play":   # Play turns the room on (default); off is kept as False
            if v in (False, "false", "off", 0):
                out[k] = False
            else:
                out.pop(k, None)
        elif k == TV_AV:   # Easy AV Control room: empty = find it by itself, none = off, <entry>/<room>
            v = "" if empty else str(v).strip()
            if v and v != "none" and not re.match(r"^([A-Za-z0-9_-]+/)?[A-Za-z0-9_.-]+$", v):
                raise ValueError(f"{v} isn't an AV Control room")
            if v:
                out[k] = v
            else:
                out.pop(k, None)
        elif k == TV_ROUTE:
            if empty or v == "auto":
                out.pop(k, None)
            elif v in ROUTES:
                out[k] = v
            else:
                raise ValueError(f"route must be one of {', '.join(ROUTES)}")
    if not any(out.get(k) for k in (TV_PIPUP, TV_ADB, TV_PLEX)):
        raise ValueError("A TV needs a PiPup, ADB or Plex player")
    return out


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/tv_update", vol.Optional("entry_id"): str,
                                  vol.Required("tv"): str, vol.Required("changes"): dict})
@websocket_api.require_admin
@callback
def ws_tv_update(hass: HomeAssistant, connection, msg) -> None:
    """Change a TV's settings from the card editor (admins): the same settings as Configure → the TV."""
    from .const import CONF_TVS  # noqa: PLC0415

    try:
        entry = _entry(hass, msg.get("entry_id"))
    except LookupError as err:
        connection.send_error(msg["id"], "not_set_up", str(err))
        return
    tvs = [dict(t) for t in entry.options.get(CONF_TVS, [])]
    i = next((n for n, t in enumerate(tvs) if t.get(TV_ID) == msg["tv"]), None)
    if i is None:
        connection.send_error(msg["id"], "not_found", f"No Plex Center TV {msg['tv']}")
        return
    try:
        tvs[i] = apply_tv_changes(tvs[i], msg["changes"])
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_TVS: tvs})
    connection.send_result(msg["id"], {k: tvs[i][k] for k in EDITABLE if k in tvs[i]})


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
    on = tv_on(hass, tv)
    states = [hass.states.get(e) for e in (tv.get(TV_PIPUP), tv.get(TV_ADB), tv.get(TV_REMOTE), tv.get(TV_CAST), tv.get(TV_PLEX)) if e]
    states = [s for s in states if s]
    if on is False:
        out["state"] = "off"
    elif states:
        out["state"] = next((s.state for s in states if s.state not in ("unavailable", "unknown", "off")), states[0].state)
    if on is not False and (live := next((s for s in states if real_playback(s)), None)):
        out["playing"] = {"state": live.state, "title": live.attributes.get("media_title")}
    return out


def _recent_in(sec, n: int) -> list:
    """Recently added in a library. TV libraries: episodes (the newest per show), not Plex's grouped shows / seasons,
    so every TV item opens as an episode like Continue watching does."""
    if getattr(sec, "type", None) != "show":
        return sec.recentlyAdded(maxresults=n)
    try:
        eps = sec.search(libtype="episode", sort="addedAt:desc", maxresults=n * 4)
    except Exception:  # noqa: BLE001 - an older server: Plex's own list
        return sec.recentlyAdded(maxresults=n)
    out, shows = [], set()
    for e in eps:
        show = str(getattr(e, "grandparentRatingKey", "") or getattr(e, "ratingKey", ""))
        if show in shows:
            continue
        shows.add(show)
        out.append(e)
        if len(out) >= n:
            break
    return out


def _safe(fn) -> list:
    if fn is None:
        return []
    try:
        return list(fn() or [])
    except Exception:  # noqa: BLE001 - an older server without On Deck
        return []


def _progress(item) -> float:
    dur, off = getattr(item, "duration", None) or 0, getattr(item, "viewOffset", None) or 0
    return 100.0 * off / dur if dur else 0.0


def _next_episode(ep):
    """The episode after this one (the next in its season, else the next season's first), unwatched; or None."""
    try:
        eps = [e for e in ep.show().episodes() if getattr(e, "parentIndex", None) is not None and getattr(e, "index", None) is not None]
    except Exception:  # noqa: BLE001
        return None
    eps.sort(key=lambda e: (e.parentIndex, e.index))
    after = [e for e in eps if (e.parentIndex, e.index) > (ep.parentIndex, ep.index) and e.parentIndex > 0]
    return next((e for e in after if not getattr(e, "viewCount", 0)), None)


def split_continue(items: list, pct: float, next_of) -> tuple[list, list]:
    """Plex's Continue Watching + On Deck → (continue, next).

    continue: movies and episodes in progress below `pct` %, one per show (its latest episode);
    next: per show without one in progress, the next episode not started yet (an episode watched past `pct` %
    counts as watched: the one after it). Order kept as Plex gives it (most recent first).
    """
    seen: set[str] = set()
    cont, nxt, shows_cont, shows_next = [], [], {}, {}
    for it in items:
        key = str(getattr(it, "ratingKey", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        t, prog = getattr(it, "type", None), _progress(it)
        watched = bool(getattr(it, "viewCount", 0)) and not getattr(it, "viewOffset", 0)
        if t == "movie":
            if 0 < prog < pct and not watched:
                cont.append(it)
            continue
        if t != "episode":
            continue
        show = str(getattr(it, "grandparentRatingKey", "") or getattr(it, "grandparentTitle", ""))
        order = (getattr(it, "parentIndex", 0) or 0, getattr(it, "index", 0) or 0)
        if prog >= pct:
            it = next_of(it)          # watched, as far as the card is concerned: the one after it is next
            if it is None:
                continue
            prog, order = 0.0, (getattr(it, "parentIndex", 0) or 0, getattr(it, "index", 0) or 0)
        if prog > 0 and not watched:
            if show not in shows_cont or order > shows_cont[show][0]:
                shows_cont[show] = (order, it)
        elif not getattr(it, "viewCount", 0):
            if show not in shows_next or order < shows_next[show][0]:
                shows_next[show] = (order, it)
    for it in items:   # keep Plex's order (most recent first)
        if getattr(it, "type", None) != "episode":
            continue
        show = str(getattr(it, "grandparentRatingKey", "") or getattr(it, "grandparentTitle", ""))
        if show in shows_cont and shows_cont[show][1] not in cont:
            cont.append(shows_cont[show][1])
        elif show in shows_next and show not in shows_cont and shows_next[show][1] not in nxt:
            nxt.append(shows_next[show][1])
    rank = {id(x): i for i, x in enumerate(items)}
    return sorted(cont, key=lambda x: rank.get(id(x), len(items))), nxt


def _show_of(it) -> str:
    return str(getattr(it, "grandparentRatingKey", "") or getattr(it, "grandparentTitle", ""))


def verify_next(fetch_fresh, items: list, next_of) -> list:
    """Next Episode picks re-read from Plex (hub entries can be stale): a pick that is watched now gives way to the
    episode after it; one per show."""
    keys = [str(getattr(i, "ratingKey", "")) for i in items if getattr(i, "ratingKey", None)]
    try:
        fresh = {str(f.ratingKey): f for f in fetch_fresh(keys)} if keys else {}
    except Exception:  # noqa: BLE001 - keep Plex's list
        fresh = {}
    out, shows = [], set()
    for it in items:
        f = fresh.get(str(getattr(it, "ratingKey", "")), it)
        if getattr(f, "viewCount", 0) and not getattr(f, "viewOffset", 0):
            f = next_of(f)
        if f is None or _show_of(f) in shows:
            continue
        shows.add(_show_of(f))
        out.append(f)
    return out


def next_from_recent(recent: list, have: set[str], limit: int) -> list:
    """New episodes of shows you watch (Plex leaves some off On Deck: season premieres, shows not watched for weeks):
    per show in Recently Added that you've watched some of, the first unwatched episode after the last watched one."""
    out = []
    for ep in recent:
        if len(out) >= limit:
            break
        if getattr(ep, "type", None) != "episode" or getattr(ep, "viewCount", 0) or (show := _show_of(ep)) in have:
            continue
        have.add(show)
        try:
            eps = [e for e in ep.show().episodes() if getattr(e, "parentIndex", None) is not None and getattr(e, "index", None) is not None
                   and e.parentIndex > 0]
        except Exception:  # noqa: BLE001
            continue
        watched = [(e.parentIndex, e.index) for e in eps if getattr(e, "viewCount", 0)]
        if not watched:
            continue          # a show you haven't started: Recently Added only
        last = max(watched)
        nxt = min((e for e in eps if (e.parentIndex, e.index) > last and not getattr(e, "viewCount", 0)
                   and not getattr(e, "viewOffset", 0)), key=lambda e: (e.parentIndex, e.index), default=None)
        if nxt is not None:
            out.append(nxt)
    return out


def order_next(deck: list, new: list, recent_keys: set[str]) -> list:
    """Next Episode order: episodes added recently first (newest first; new ones from Recently Added and On Deck picks
    that are in it), then the rest of On Deck in Plex's order (most recently watched first)."""
    fresh = [*new, *(x for x in deck if str(getattr(x, "ratingKey", "")) in recent_keys)]
    fresh.sort(key=lambda x: getattr(x, "addedAt", None) or datetime.min, reverse=True)
    return [*fresh, *(x for x in deck if x not in fresh)]


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
                skip = entry.runtime_data.demos.demo_libraries() if entry.runtime_data.demos else set()   # Demos: only in Demos
                libraries[user] = await conn.async_call(user, lambda s, skip=skip: [{"key": str(x.key), "title": x.title, "type": x.type}
                                                                                    for x in _sections(s) if x.title not in skip])
            except Exception as err:  # noqa: BLE001
                libraries[user] = {"error": str(err)}
        tvs.append({"id": tv[TV_ID], "name": tv[TV_NAME], "user": user, "route_setting": tv.get(TV_ROUTE, "auto"),
                    **{k: tv[k] for k in (TV_PIPUP, TV_ADB, TV_PLEX, TV_REMOTE, TV_CAST, "volume_entity", "status_entity", "ready_value", "busy_value", "fail_value") if tv.get(k)},
                    "power_off": can_power_off(tv), "settings": {k: tv[k] for k in EDITABLE if k in tv}, **tv_state(hass, tv)})
    reg = er.async_get(hass)
    found = {p for p in (e.platform for e in reg.entities.values()) if p in INTEGRATIONS}
    upcoming = sorted(s.entity_id for s in hass.states.async_all("sensor") if isinstance(s.attributes.get("data"), (list, str))
                      and str(s.attributes.get("data")).lstrip().startswith(("[", "[{")))
    card_version = ""
    try:
        from . import async_refresh_card  # noqa: PLC0415

        await async_refresh_card(hass)
    except Exception as err:  # noqa: BLE001 - the version check below still works
        _LOGGER.debug("Plex Center card refresh failed: %s", err)
    try:
        from pathlib import Path  # noqa: PLC0415

        from .card_view import card_file  # noqa: PLC0415

        card_version = (await hass.async_add_executor_job(card_file, Path(__file__).parent / "frontend" / "plex-center-card.js"))[2]
    except OSError:
        pass
    from .arr import arr_available  # noqa: PLC0415

    connection.send_result(msg["id"], {"version": VERSION, "card_version": card_version, "arr": arr_available(hass), "entry_id": entry.entry_id, "server_id": conn.server_id, "tvs": tvs,
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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/calendar", vol.Required("start"): str, vol.Required("end"): str,
                                  vol.Optional("tv"): str, vol.Optional("entry_id"): str})
@websocket_api.async_response
async def ws_calendar(hass: HomeAssistant, connection, msg) -> None:
    """Upcoming episodes and movie releases between start and end, from Home Assistant's Sonarr / Radarr."""
    from .arr import async_calendar, parse_range  # noqa: PLC0415

    try:
        start, end = parse_range(msg["start"], msg["end"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    result = await async_calendar(hass, start, end)
    if msg.get("tv"):   # in Plex / watched for this TV's Plex user
        from .arr import async_mark_plex  # noqa: PLC0415

        try:
            entry = _entry(hass, msg.get("entry_id"))
            result = await async_mark_plex(hass, entry.runtime_data.conn, _tv(entry, msg["tv"]).get(TV_USER), result)
        except Exception as err:  # noqa: BLE001 - marks are extra; the calendar still shows
            _LOGGER.debug("calendar marks: %s", err)
    connection.send_result(msg["id"], result)


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
                                  vol.Optional("library"): str, vol.Optional("size", default=20): vol.All(int, vol.Range(min=1, max=100)),
                                  vol.Optional("watched_pct", default=95): vol.All(vol.Coerce(float), vol.Range(min=50, max=100))})
@websocket_api.async_response
async def ws_hubs(hass: HomeAssistant, connection, msg) -> None:
    """Continue Watching and Recently Added for the TV's user (whole server, or one library)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    sign = _signer(hass, entry.runtime_data.conn.server_id)
    n = msg["size"]

    pct = msg.get("watched_pct", 95)
    skip = entry.runtime_data.demos.demo_libraries() if entry.runtime_data.demos else set()

    def fetch(server):
        if msg.get("library"):
            sec = _section(server, msg["library"])
            cont, recent = sec.continueWatching(), _recent_in(sec, n)
            deck = _safe(getattr(sec, "onDeck", None))
        else:
            cont = [i for i in server.continueWatching() if getattr(i, "librarySectionTitle", None) not in skip]
            recent = [i for s in _sections(server) if s.title not in skip for i in _recent_in(s, n)]
            recent.sort(key=lambda i: getattr(i, "addedAt", None) or datetime.min, reverse=True)
            deck = _safe(getattr(server.library, "onDeck", None))
        cw, nxt = split_continue([*cont, *deck], pct, lambda ep: _next_episode(ep))
        nxt = verify_next(lambda keys: server.fetchItems(f"/library/metadata/{','.join(keys)}"), nxt, _next_episode)
        nxt = order_next(nxt, next_from_recent(recent, {_show_of(i) for i in [*cw, *nxt] if getattr(i, "type", None) == "episode"}, len(recent)),
                         {str(getattr(r, "ratingKey", "")) for r in recent})
        return {"continue": [item_dict(i, sign) for i in cw[:n]], "next": [item_dict(i, sign) for i in nxt[:n]],
                "recent": [item_dict(i, sign) for i in recent[:n]]}

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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/av", vol.Optional("entry_id"): str, vol.Required("tv"): str})
@callback
def ws_av(hass: HomeAssistant, connection, msg) -> None:
    """The TV's Easy AV Control room and the activities that use the TV (see avcontrol.py), with every room for the
    TV setting's choices."""
    from . import avcontrol  # noqa: PLC0415
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    connection.send_result(msg["id"], {**avcontrol.room_for(hass, tv), "rooms": avcontrol.rooms(hass),
                                       "pending": avcontrol.pending(tv["id"]), "play_turns_on": tv.get("av_play") is not False})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/av_pending", vol.Optional("entry_id"): str, vol.Required("tv"): str,
                                  vol.Optional("cancel", default=False): bool})
@callback
def ws_av_pending(hass: HomeAssistant, connection, msg) -> None:
    """The title waiting for the TV's room to turn on ({title, activity, room, at} or null); cancel=True drops it."""
    from . import avcontrol  # noqa: PLC0415
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    if msg["cancel"]:
        avcontrol.cancel(tv["id"])
    connection.send_result(msg["id"], {"pending": avcontrol.pending(tv["id"])})


# ------------------------------------------------------------------------------------------- demos

def _demos(entry):
    d = entry.runtime_data.demos
    if d is None:
        raise HomeAssistantError("Demos aren't set up")
    return d


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/demos", vol.Optional("entry_id"): str, vol.Required("tv"): str})
@websocket_api.async_response
async def ws_demos(hass: HomeAssistant, connection, msg) -> None:
    """The TV's demo settings, its sequences (the library, then its collections), what's running, and (admins) the
    video libraries to choose from."""
    from . import demos as dm  # noqa: PLC0415
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    d = _demos(entry)
    s = d.settings(tv["id"])
    out: dict[str, Any] = {"settings": s, "status": d.status(tv["id"]), "sequences": [], "error": None, "libraries": []}
    try:
        out["sequences"] = await entry.runtime_data.conn.async_call(tv.get(TV_USER), lambda srv: dm.sequences(srv, s["library"]))
    except Exception as err:  # noqa: BLE001 - shown in the pane (the library isn't there, Plex is off)
        out["error"] = str(err)
    if connection.user.is_admin:
        try:
            out["libraries"] = await entry.runtime_data.conn.async_call(tv.get(TV_USER), lambda srv: [x.title for x in srv.library.sections()
                                                                                                     if x.type in ("movie", "show")])
        except Exception:  # noqa: BLE001
            pass
    connection.send_result(msg["id"], out)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/demos/clips", vol.Optional("entry_id"): str, vol.Required("tv"): str,
                                  vol.Optional("sequence", default="all"): str})
@websocket_api.async_response
async def ws_demos_clips(hass: HomeAssistant, connection, msg) -> None:
    """The clips of a sequence, in order, with their labels."""
    from . import demos as dm  # noqa: PLC0415
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    d = _demos(entry)
    sign = _signer(hass, entry.runtime_data.conn.server_id)
    lib = d.settings(tv["id"])["library"]

    def fetch(server):
        return [{**item_dict(i, sign), "label": d.label(str(i.ratingKey), i.title)} for i in dm.clips(server, lib, msg["sequence"])]
    await _run(hass, entry.runtime_data.conn, connection, msg, tv.get(TV_USER), fetch)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/demos/settings", vol.Optional("entry_id"): str, vol.Required("tv"): str,
                                  vol.Required("changes"): dict})
@websocket_api.require_admin
@callback
def ws_demos_settings(hass: HomeAssistant, connection, msg) -> None:
    """Change the TV's demo settings (admins)."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    try:
        connection.send_result(msg["id"], _demos(entry).set_settings(tv["id"], msg["changes"]))
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid", str(err))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/demos/label", vol.Optional("entry_id"): str,
                                  vol.Required("key"): vol.All(str, vol.Match(r"^\d+$")), vol.Required("label"): str})
@websocket_api.require_admin
@callback
def ws_demos_label(hass: HomeAssistant, connection, msg) -> None:
    """A clip's label (empty: its Plex title)."""
    entry = _entry(hass, msg.get("entry_id"))
    _demos(entry).set_label(msg["key"], msg["label"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/demos/collection", vol.Optional("entry_id"): str, vol.Required("tv"): str,
                                  vol.Required("op"): vol.In(["create", "add", "remove", "move", "rename", "describe", "delete"]),
                                  vol.Optional("summary"): vol.All(str, vol.Length(max=2000)),
                                  vol.Optional("collection"): str, vol.Optional("title"): str,
                                  vol.Optional("keys"): [vol.All(str, vol.Match(r"^\d+$"))],
                                  vol.Optional("key"): vol.All(str, vol.Match(r"^\d+$")), vol.Optional("after"): vol.Any(None, vol.All(str, vol.Match(r"^\d+$")))})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_demos_collection(hass: HomeAssistant, connection, msg) -> None:
    """The Demo builder: make and edit the demo library's collections (as the server owner)."""
    from . import demos as dm  # noqa: PLC0415
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    lib = _demos(entry).settings(tv["id"])["library"]
    await _run(hass, entry.runtime_data.conn, connection, msg, "", lambda srv: dm.collection_edit(srv, lib, msg["op"], msg))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/demos/subscribe", vol.Optional("entry_id"): str, vol.Required("tv"): str})
@callback
def ws_demos_subscribe(hass: HomeAssistant, connection, msg) -> None:
    """What the TV's demo is doing, now and whenever it changes."""
    from homeassistant.helpers.dispatcher import async_dispatcher_connect  # noqa: PLC0415

    from . import demos as dm  # noqa: PLC0415
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    d = _demos(entry)

    @callback
    def _send(tv_id: str | None = None) -> None:
        if tv_id in (None, tv["id"]):
            connection.send_message(websocket_api.event_message(msg["id"], d.status(tv["id"])))
    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, dm.SIGNAL, _send)
    connection.send_result(msg["id"])
    _send()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/markers", vol.Optional("entry_id"): str, vol.Required("tv"): str})
@websocket_api.async_response
async def ws_markers(hass: HomeAssistant, connection, msg) -> None:
    """The intro / credits of what the TV's Plex player has on: {key, intro: [s, e] | None, credits: [s, e] | None}."""
    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg.get("tv"))
    st = tv.get(TV_PLEX) and hass.states.get(tv[TV_PLEX])
    key = str((st and st.attributes.get("media_content_id")) or "")
    mk = entry.runtime_data.markers
    if not key.isdigit() or mk is None or st.state not in ("playing", "paused"):
        connection.send_result(msg["id"], {"key": None, "intro": None, "credits": None})
        return
    found = await mk.async_get(tv, key)
    connection.send_result(msg["id"], {"key": key, **found})


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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/resumes", vol.Optional("entry_id"): str})
@callback
def ws_resumes(hass: HomeAssistant, connection, msg) -> None:
    """What was playing when each TV was turned off: {tv_id: record}."""
    try:
        entry = _entry(hass, msg.get("entry_id"))
    except LookupError as err:
        connection.send_error(msg["id"], "not_set_up", str(err))
        return
    res = entry.runtime_data.resumes
    connection.send_result(msg["id"], res.all() if res else {})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/resume_forget", vol.Optional("entry_id"): str,
                                  vol.Required("tv"): str})
@callback
def ws_resume_forget(hass: HomeAssistant, connection, msg) -> None:
    """Forget a TV's resume record (the card's ✕)."""
    try:
        entry = _entry(hass, msg.get("entry_id"))
    except LookupError as err:
        connection.send_error(msg["id"], "not_set_up", str(err))
        return
    if entry.runtime_data.resumes:
        entry.runtime_data.resumes.forget(msg["tv"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/app_media", vol.Optional("entry_id"): str, vol.Required("tv"): str})
@websocket_api.async_response
async def ws_app_media(hass: HomeAssistant, connection, msg) -> None:
    """What another app plays on the TV ({title, app, episode, source}) with its poster / fanart when a source knows
    the title (Plex library, Plex Discover, Radarr, Sonarr). null when no player reports a title."""
    from .app_media import async_artwork, async_now_title  # noqa: PLC0415

    entry = _entry(hass, msg.get("entry_id"))
    tv = _tv(entry, msg["tv"])
    now = await async_now_title(hass, tv)
    if not now:
        connection.send_result(msg["id"], None)
        return
    art = await async_artwork(hass, entry.runtime_data.conn, tv.get(TV_USER), now["title"], now["series"],
                              _signer(hass, entry.runtime_data.conn.server_id))
    connection.send_result(msg["id"], {**now, **({"meta": art} if art else {})})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/log", vol.Optional("level"): vol.In(["error", "info"])})
@callback
def ws_log(hass: HomeAssistant, connection, msg) -> None:
    """Plex Center's log, newest first: {level, entries: [{at, last, count, tv, action, message, cause, fix, handled, level}]}.
    With `level` (admins): set what is logged first (error = failures only, info = also workarounds)."""
    from .eventlog import entries, level, set_level  # noqa: PLC0415

    if msg.get("level"):
        if not connection.user or not connection.user.is_admin:
            connection.send_error(msg["id"], "unauthorized", "Only an administrator can change the log level")
            return
        set_level(hass, msg["level"])
    connection.send_result(msg["id"], {"level": level(hass), "entries": list(reversed(entries(hass)))})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/log_clear"})
@websocket_api.require_admin
@callback
def ws_log_clear(hass: HomeAssistant, connection, msg) -> None:
    from .eventlog import clear  # noqa: PLC0415

    clear(hass)
    connection.send_result(msg["id"], True)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/sleep_timers"})
@callback
def ws_sleep(hass: HomeAssistant, connection, msg) -> None:
    """The TVs' sleep timers: {tv id: {mode: minutes | after, at}}."""
    from .sleep import status  # noqa: PLC0415

    connection.send_result(msg["id"], status(hass))
