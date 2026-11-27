"""Easy AV Control: each TV's room and the activities that use the TV.

Read from Easy AV Control's own coordinators (nothing is copied or stored). A room belongs to a TV when one of its
activities uses one of the TV's own players (PiPup, ADB, Android TV Remote, Cast, Plex) or a device of the same Home
Assistant device; else a room in the TV's area; or the one picked in the TV's settings (`av_room`: "none" switches it
off). Only the activities that use the TV are offered; with an area or a picked room and no such activity, all of them.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import TV_ADB, TV_AV, TV_CAST, TV_PIPUP, TV_PLEX, TV_REMOTE

AV_DOMAIN = "easy_av_control"


def _coordinators(hass: HomeAssistant) -> list[Any]:
    return [c for c in (hass.data.get(AV_DOMAIN) or {}).values() if isinstance(getattr(c, "rooms", None), dict)]


def available(hass: HomeAssistant) -> bool:
    return bool(_coordinators(hass))


def _tv_entities(tv: dict[str, Any]) -> set[str]:
    return {e for e in (tv.get(k) for k in (TV_PIPUP, TV_ADB, TV_REMOTE, TV_CAST, TV_PLEX)) if e}


def _device_of(hass: HomeAssistant, entity_id: str | None) -> str | None:
    ent = entity_id and er.async_get(hass).async_get(entity_id)
    return ent.device_id if ent else None


def _area_of(hass: HomeAssistant, entity_id: str) -> str | None:
    ent = er.async_get(hass).async_get(entity_id)
    if not ent:
        return None
    if ent.area_id:
        return ent.area_id
    dev = ent.device_id and dr.async_get(hass).async_get(ent.device_id)
    return dev.area_id if dev else None


def _activities(room: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {a: d for a, d in (room.get("activities") or {}).items() if isinstance(d, dict) and d.get("enabled", True)}


def _uses_tv(hass: HomeAssistant, room: dict[str, Any], activity: dict[str, Any], ents: set[str], devs: set[str]) -> bool:
    devices = room.get("devices") or {}
    for key in activity.get("devices") or []:
        dev = devices.get(key) or {}
        for e in (dev.get("entity_id"), dev.get("remote_entity")):
            if e and (e in ents or (devs and _device_of(hass, e) in devs)):
                return True
    return False


def _view(coord: Any, room_id: str, activities: list[str], how: str) -> dict[str, Any]:
    room = coord.rooms[room_id]
    acts = _activities(room)
    names = {k: (coord.device_name(d) if hasattr(coord, "device_name") else k) for k, d in (room.get("devices") or {}).items()}
    return {
        "entry_id": coord.entry.entry_id, "room": room_id, "name": room.get("name") or room_id, "how": how,
        "activities": [{"id": a, "name": acts[a].get("name") or a, "icon": acts[a].get("icon"),
                        "devices": [{"id": d, "name": names.get(d, d)} for d in (acts[a].get("devices") or [])]}
                       for a in activities if a in acts],
    }


def room_for(hass: HomeAssistant, tv: dict[str, Any]) -> dict[str, Any]:
    """{available, room?, entry_id?, name?, how: devices|area|picked, activities: [{id, name, icon, devices}],
    candidates: [{entry_id, room, name}] (more than one room matched: pick one in the TV's settings)}."""
    coords = _coordinators(hass)
    out: dict[str, Any] = {"available": bool(coords), "room": None, "activities": [], "candidates": []}
    if not coords:
        return out
    pick = str(tv.get(TV_AV) or "").strip()
    if pick == "none":
        out["how"] = "off"
        return out
    ents = _tv_entities(tv)
    devs = {d for d in (_device_of(hass, e) for e in ents) if d}
    found = []   # (coordinator, room, the activities that use the TV)
    for c in coords:
        for room_id, room in c.rooms.items():
            uses = [a for a, d in _activities(room).items() if _uses_tv(hass, room, d, ents, devs)]
            found.append((c, room_id, uses))
    if pick:
        entry_id, _, room_id = pick.rpartition("/")
        for c, rid, uses in found:
            if rid == room_id and (not entry_id or c.entry.entry_id == entry_id):
                return {**out, **_view(c, rid, uses or list(_activities(c.rooms[rid])), "picked")}
        out["how"] = "missing"
        return out
    by_devices = [(c, rid, uses) for c, rid, uses in found if uses]
    if len(by_devices) == 1:
        c, rid, uses = by_devices[0]
        return {**out, **_view(c, rid, uses, "devices")}
    if len(by_devices) > 1:
        out["candidates"] = [{"entry_id": c.entry.entry_id, "room": rid, "name": c.rooms[rid].get("name") or rid} for c, rid, _ in by_devices]
        return out
    areas = {a for a in (_area_of(hass, e) for e in ents) if a}
    by_area = [(c, rid) for c, rid, _ in found if c.rooms[rid].get("area_id") in areas]
    if len(by_area) == 1:
        c, rid = by_area[0]
        return {**out, **_view(c, rid, list(_activities(c.rooms[rid])), "area")}
    if len(by_area) > 1:
        out["candidates"] = [{"entry_id": c.entry.entry_id, "room": rid, "name": c.rooms[rid].get("name") or rid} for c, rid in by_area]
    return out


def rooms(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Every room, for the TV setting's choices."""
    return [{"id": f"{c.entry.entry_id}/{rid}", "room": rid, "name": room.get("name") or rid}
            for c in _coordinators(hass) for rid, room in c.rooms.items()]


# ---------------------------------------------------------------- play when ready

TV_AV_PLAY = "av_play"   # False: Play doesn't turn the room on (default: it does)
AV_WAIT_S = 300          # how long a room gets to turn on (the TV's Wait for ready, if set)
_PENDING: dict[str, dict[str, Any]] = {}   # tv id -> {title, activity, room, at, cancel: asyncio.Event}


def pending(tv_id: str) -> dict[str, Any] | None:
    p = _PENDING.get(tv_id)
    return {k: v for k, v in p.items() if k != "cancel"} if p else None


def cancel(tv_id: str) -> bool:
    p = _PENDING.get(tv_id)
    if p:
        p["cancel"].set()
    return bool(p)


def _find(hass: HomeAssistant, info: dict[str, Any]) -> Any:
    return next((c for c in _coordinators(hass) if c.entry.entry_id == info.get("entry_id") and info.get("room") in c.rooms), None)


def applies(hass: HomeAssistant, tv: dict[str, Any]) -> dict[str, Any] | None:
    """The TV's room when Play should turn it on: Easy AV Control has one for the TV, Play turning it on isn't switched
    off, and the TV has no room hook of its own (Room power / status entities win)."""
    from .const import TV_POWER, TV_STATUS  # noqa: PLC0415
    if tv.get(TV_POWER) or tv.get(TV_STATUS) or tv.get(TV_AV_PLAY) is False:
        return None
    info = room_for(hass, tv)
    return info if info.get("room") and info.get("activities") else None


async def ensure_on(hass: HomeAssistant, tv: dict[str, Any], info: dict[str, Any], title: str = "",
                    activity: str | None = None, *, poll: float = 1.0) -> bool:
    """Make the TV's room ready to play: nothing when it's on with an activity that uses the TV; else start one (the
    given one, the only one, the room's default if it uses the TV, or the first) and wait until it's on. Raises
    HomeAssistantError when it fails, takes too long or is cancelled. True when it had to start the room."""
    import asyncio  # noqa: PLC0415

    from homeassistant.exceptions import HomeAssistantError  # noqa: PLC0415

    from .const import TV_ID, TV_READY_S  # noqa: PLC0415
    coord = _find(hass, info)
    if coord is None:
        return False
    room, ids = info["room"], [a["id"] for a in info["activities"]]
    rt = coord.runtime(room)
    if rt.state == "active" and rt.activity in ids:
        return False
    if rt.state == "starting" and rt.activity in ids:
        act = rt.activity   # on its way already: just wait
    else:
        default = coord.default_activity(room) if hasattr(coord, "default_activity") else None
        act = activity if activity in ids else ids[0] if len(ids) == 1 else default if default in ids else ids[0]
        hass.async_create_task(coord.async_start_activity(room, act))
    tv_id = tv[TV_ID]
    old = _PENDING.get(tv_id)
    if old:
        old["cancel"].set()
    me = {"title": title, "activity": act, "room": info.get("name") or room, "at": __import__("time").time(), "cancel": asyncio.Event()}
    _PENDING[tv_id] = me
    wait = float(tv.get(TV_READY_S) or AV_WAIT_S)
    name = info.get("name") or room
    try:
        for _ in range(max(1, int(wait / poll))):
            await asyncio.sleep(poll)
            if me["cancel"].is_set():
                raise HomeAssistantError(f"Cancelled: {title or 'the title'} won't play")
            rt = coord.runtime(room)
            if rt.state == "active":
                return True
            if rt.state == "error":
                raise HomeAssistantError(f"{name} didn't turn on: {rt.error or 'it failed'}")
            if rt.state == "idle" and _ > 3:   # stopped (by hand) while waiting
                raise HomeAssistantError(f"{name} was turned off before it was ready")
        raise HomeAssistantError(f"{name} didn't turn on within {int(wait)} s")
    finally:
        if _PENDING.get(tv_id) is me:
            _PENDING.pop(tv_id, None)
