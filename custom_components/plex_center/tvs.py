"""TVs for Plex Center: detection, matching to Plex Home users, and the playback route."""

from __future__ import annotations

import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify

from .const import PLEX_PKG, PREVIEW_MAX_S, TV_ADB, TV_ID, TV_NAME, TV_PIPUP, TV_PLEX, TV_REMOTE, TV_ROUTE, TV_USER

OFF_STATES = ("off", "standby")
GONE_STATES = ("unavailable", "unknown")


def norm(text: str | None) -> str:
    """Lower-case letters and digits only: 'Living Room TV' -> 'livingroomtv'."""
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


def _key(name: str) -> str:
    k = norm(name)
    return k[:-2] if k.endswith("tv") and len(k) > 4 else k


def players(hass: HomeAssistant, platform: str) -> list[str]:
    """Enabled media players of an integration."""
    reg = er.async_get(hass)
    return sorted(e.entity_id for e in reg.entities.values()
                  if e.platform == platform and e.domain == "media_player" and not e.disabled_by)


def area_of(hass: HomeAssistant, entity_id: str) -> str | None:
    ent = er.async_get(hass).async_get(entity_id)
    if not ent:
        return None
    if ent.area_id:
        return ent.area_id
    dev = dr.async_get(hass).async_get(ent.device_id) if ent.device_id else None
    return dev.area_id if dev else None


def friendly(hass: HomeAssistant, entity_id: str) -> str:
    st = hass.states.get(entity_id)
    return (st and st.attributes.get("friendly_name")) or entity_id


def match_user(name: str, users: list[dict[str, Any]]) -> str:
    """The Plex Home user whose name matches the TV's ('Living Room TV' -> 'LivingRoom'); '' = the owner."""
    k = _key(name)
    for u in users:
        if u.get("username") and k and (norm(u["username"]) == k or norm(u["username"]) in k or k in norm(u["username"])):
            return u["username"]
    return ""


def detect_tvs(hass: HomeAssistant, users: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """TVs found in the registry: each PiPup player, then each ADB player not paired with one.

    A TV's ADB / Plex players are the ones in the same area, else the first whose entity id contains
    the TV's name.
    """
    pipups, adbs, plexes = players(hass, "pipup"), players(hass, "androidtv"), players(hass, "plex")
    remotes = players(hass, "androidtv_remote")
    used: set[str] = set()

    def pick(cands: list[str], anchor: str, name: str) -> str | None:
        area, k = area_of(hass, anchor), _key(name)
        for c in cands:
            if c not in used and area and area_of(hass, c) == area:
                return c
        for c in cands:
            if c not in used and len(k) >= 3 and k in norm(c):
                return c
        return None

    out: list[dict[str, Any]] = []
    for anchor, kind in [*((p, TV_PIPUP) for p in pipups), *((a, TV_ADB) for a in adbs)]:
        if anchor in used:
            continue
        used.add(anchor)
        name = friendly(hass, anchor)
        tv: dict[str, Any] = {TV_ID: slugify(name) or slugify(anchor), TV_NAME: name, kind: anchor}
        if kind == TV_PIPUP and (adb := pick(adbs, anchor, name)):
            tv[TV_ADB] = adb
            used.add(adb)
        if remote := pick(remotes, anchor, name):
            tv[TV_REMOTE] = remote
            used.add(remote)
        if plex := pick(plexes, anchor, name):
            tv[TV_PLEX] = plex
            used.add(plex)
        tv[TV_USER] = match_user(name, users or [])
        out.append(tv)
    ids: set[str] = set()
    for tv in out:  # unique ids
        base, n = tv[TV_ID], 2
        while tv[TV_ID] in ids:
            tv[TV_ID] = f"{base}_{n}"
            n += 1
        ids.add(tv[TV_ID])
    return out


def fill_remotes(hass: HomeAssistant, tvs: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """TVs set up before Plex Center knew Android TV Remote: add each one's player (same area, else its name
    in the entity id). Returns the new list, or None when nothing changed."""
    remotes = players(hass, "androidtv_remote")
    used = {tv.get(TV_REMOTE) for tv in tvs}
    out, changed = [], False
    for tv in tvs:
        tv = dict(tv)
        if not tv.get(TV_REMOTE):
            anchor = tv.get(TV_PIPUP) or tv.get(TV_ADB)
            area, k = (area_of(hass, anchor) if anchor else None), _key(tv.get(TV_NAME) or "")
            hit = next((r for r in remotes if r not in used and area and area_of(hass, r) == area), None) \
                or next((r for r in remotes if r not in used and len(k) >= 3 and k in norm(r)), None)
            if hit:
                tv[TV_REMOTE], changed = hit, True
                used.add(hit)
        out.append(tv)
    return out if changed else None


def pipup_ready(hass: HomeAssistant, entity_id: str | None) -> bool:
    """PiPup can press Plex's buttons: control service on and Plex on its allowlist (app >= 0.32)."""
    st = entity_id and hass.states.get(entity_id)
    if not st:
        return False
    pk = st.attributes.get("click_packages") or []
    return st.attributes.get("click_service") is True and PLEX_PKG in pk


def plex_remote_ok(hass: HomeAssistant, entity_id: str | None) -> bool:
    """A Plex client that accepts remote control (Plex Web, Plex HTPC): more than browse + play_media."""
    st = entity_id and hass.states.get(entity_id)
    if not st or st.state == "unavailable":
        return False
    from homeassistant.components.media_player import MediaPlayerEntityFeature as F  # noqa: PLC0415

    feats = int(st.attributes.get("supported_features") or 0)
    return bool(feats & F.PAUSE) and bool(feats & F.PLAY_MEDIA)


def route_for(hass: HomeAssistant, tv: dict[str, Any]) -> str | None:
    """'pipup' | 'adb' | 'plex' | 'open' (PiPup without clicks: open the page only) | None."""
    want = tv.get(TV_ROUTE) or "auto"
    pip, adb, plex = tv.get(TV_PIPUP), tv.get(TV_ADB), tv.get(TV_PLEX)
    has = lambda e: bool(e and hass.states.get(e))  # noqa: E731
    if want == "pipup":
        return ("pipup" if pipup_ready(hass, pip) else "open") if has(pip) else None
    if want == "adb":
        return "adb" if has(adb) else None
    if want == "plex":
        return "plex" if has(plex) else None
    if plex_remote_ok(hass, plex):
        return "plex"
    if pipup_ready(hass, pip):
        return "pipup"
    if has(adb):
        return "adb"
    return "open" if has(pip) else None


def tv_on(hass: HomeAssistant, tv: dict[str, Any]) -> bool | None:
    """Is the TV itself on? From its own players (PiPup, ADB, Android TV Remote), never the Plex client:
    Plex keeps a paused session for a long time after the TV is turned off. None = no way to tell."""
    states = [hass.states.get(e) for e in (tv.get(TV_PIPUP), tv.get(TV_ADB), tv.get(TV_REMOTE)) if e]
    states = [s for s in states if s and s.state not in GONE_STATES]
    if not states:
        return None
    return any(s.state not in OFF_STATES for s in states)


def tv_playing(hass: HomeAssistant, tv: dict[str, Any]) -> bool:
    """Something really plays on the TV: it is on (or can't tell) and one of its players says playing / paused."""
    if tv_on(hass, tv) is False:
        return False
    return any(real_playback(hass.states.get(e)) for e in (tv.get(TV_PIPUP), tv.get(TV_PLEX), tv.get(TV_ADB)) if e)


def real_playback(state) -> bool:
    """Playing / paused, and not Plex's 30-second title-page preview."""
    if not state or state.state not in ("playing", "paused", "buffering"):
        return False
    d = state.attributes.get("media_duration")
    try:
        return not (d is not None and 0 < float(d) <= PREVIEW_MAX_S)
    except (TypeError, ValueError):
        return True
