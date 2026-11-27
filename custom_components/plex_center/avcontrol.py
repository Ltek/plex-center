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
