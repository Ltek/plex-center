"""Playback on a TV: the routes proven in /shared/user/tv-tests (see PLAN.md)."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import BTN_RESTART, BTN_WATCH, PLEX_PKG, TV_ADB, TV_NAME, TV_PIPUP, TV_PLEX, TV_USER
from .media import SAFE_LINK
from .tvs import real_playback, route_for

_LOGGER = logging.getLogger(__name__)
_BUSY: set[str] = set()


def _tap(button: str) -> str:
    """Shell: tap a Plex button by its resource id (from a screen dump); 'none' when it isn't on screen."""
    return ("uiautomator dump /sdcard/plc.xml >/dev/null 2>&1; "
            f"b=$(grep -oE 'resource-id=\"{button}\"[^>]*bounds=\"[^\"]*\"' /sdcard/plc.xml | grep -oE '[0-9]+' | tail -4 | tr '\\n' ' '); "
            "if [ -z \"$b\" ]; then echo none; else set -- $b; input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 )); echo tapped; fi")


def _playing(hass: HomeAssistant, tv: dict[str, Any]) -> bool:
    return any(real_playback(hass.states.get(e)) for e in (tv.get(TV_PIPUP), tv.get(TV_PLEX), tv.get(TV_ADB)) if e)


async def _svc(hass: HomeAssistant, domain: str, service: str, data: dict[str, Any], entity_id: str) -> None:
    await hass.services.async_call(domain, service, {**data, "entity_id": entity_id}, blocking=True)


async def start(hass: HomeAssistant, tv: dict[str, Any], item: dict[str, Any], mode: str = "play") -> str:
    """Start an item on a TV. mode: play (Watch / Resume) | restart (Start over). Returns the route used."""
    link = item.get("link")
    if not link or not SAFE_LINK.match(link):
        raise HomeAssistantError("This title has no Plex link")
    route = route_for(hass, tv)
    if route is None:
        raise HomeAssistantError(f"{tv.get(TV_NAME) or 'This TV'} has no usable player (PiPup, ADB or Plex)")
    key = tv.get(TV_PIPUP) or tv.get(TV_ADB) or tv.get(TV_PLEX)
    if key in _BUSY:
        raise HomeAssistantError("Still starting the last title on this TV")
    _BUSY.add(key)
    try:
        if route == "plex":
            payload = {"plex_key": int(item["key"]), **({"username": tv[TV_USER]} if tv.get(TV_USER) else {}),
                       **({"offset": 0} if mode == "restart" else {"resume": True})}
            import json  # noqa: PLC0415

            await _svc(hass, "media_player", "play_media", {"media_content_type": item.get("type") or "movie",
                                                            "media_content_id": "plex://" + json.dumps(payload)}, tv[TV_PLEX])
        elif route in ("pipup", "open"):
            pip = tv[TV_PIPUP]
            if _playing(hass, tv):
                await _svc(hass, "pipup", "send_key", {"key": "back"}, pip)
                await asyncio.sleep(1.5)
            data = {"package": PLEX_PKG, "uri": link}
            if route == "open":
                await _svc(hass, "pipup", "launch_app", data, pip)
            else:
                try:
                    await _svc(hass, "pipup", "launch_app", {**data, "click": BTN_RESTART if mode == "restart" else BTN_WATCH,
                                                             "method": "ok", "wait": 25}, pip)
                except HomeAssistantError as err:
                    # Never started: no Restart button on the page; Watch starts from the beginning anyway.
                    if mode == "restart" and ("404" in str(err) or "not found" in str(err).lower()):
                        await _svc(hass, "pipup", "launch_app", {**data, "click": BTN_WATCH, "method": "ok", "wait": 25}, pip)
                    else:
                        raise
        else:  # adb
            adb = tv[TV_ADB]
            cmd = lambda c: _svc(hass, "androidtv", "adb_command", {"command": c}, adb)  # noqa: E731
            if _playing(hass, tv):
                await cmd("input keyevent KEYCODE_BACK")
                await asyncio.sleep(1.5)
            await cmd(f"input keyevent KEYCODE_WAKEUP; am start -a android.intent.action.VIEW -d '{link}' {PLEX_PKG}")
            await asyncio.sleep(7)
            if mode == "restart":
                await cmd(f"{_tap(BTN_RESTART)} | grep -q tapped || input keyevent KEYCODE_DPAD_CENTER")
            else:
                await cmd("input keyevent KEYCODE_DPAD_CENTER")
                await asyncio.sleep(10)
                if not _playing(hass, tv):   # the page was still loading: one more OK
                    await cmd("input keyevent KEYCODE_DPAD_CENTER")
        return route
    finally:
        _BUSY.discard(key)


VOLUME_ACTIONS = {"volume_up", "volume_down", "mute", "power_on", "power_off"}


async def _volume_power(hass: HomeAssistant, tv: dict[str, Any], route: str, action: str) -> None:
    """Volume and power: through the player that controls the TV (PiPup, ADB or the Plex client)."""
    pip, adb = tv.get(TV_PIPUP), tv.get(TV_ADB)
    ent = pip if pip and hass.states.get(pip) else adb if adb and hass.states.get(adb) else tv.get(TV_PLEX)
    if not ent:
        raise HomeAssistantError("No player to change the volume or power with")
    if ent == adb and action in ("volume_up", "volume_down", "mute", "power_on", "power_off"):
        key = {"volume_up": "VOLUME_UP", "volume_down": "VOLUME_DOWN", "mute": "VOLUME_MUTE", "power_on": "WAKEUP", "power_off": "SLEEP"}[action]
        await _svc(hass, "androidtv", "adb_command", {"command": f"input keyevent KEYCODE_{key}"}, ent)
        return
    if action == "mute":
        st = hass.states.get(ent)
        await _svc(hass, "media_player", "volume_mute", {"is_volume_muted": not bool(st and st.attributes.get("is_volume_muted"))}, ent)
    else:
        await _svc(hass, "media_player", {"volume_up": "volume_up", "volume_down": "volume_down", "power_on": "turn_on", "power_off": "turn_off"}[action], {}, ent)




async def trailer(hass: HomeAssistant, tv: dict[str, Any], url: str | None = None, item: dict[str, Any] | None = None) -> None:
    """A trailer on the TV: a YouTube link opens in the TV's YouTube app; a Plex trailer (an extra) opens in Plex."""
    route = route_for(hass, tv)
    if route is None:
        raise HomeAssistantError(f"{tv.get(TV_NAME) or 'This TV'} has no usable player")
    if url:
        if not re.match(r"^https://(www\.)?(youtube\.com|youtu\.be)/[A-Za-z0-9_?=&./%+-]+$", url):
            raise HomeAssistantError("Only YouTube trailer links can be opened on the TV")
        if tv.get(TV_PIPUP) and hass.states.get(tv[TV_PIPUP]):
            await _svc(hass, "pipup", "launch_app", {"uri": url}, tv[TV_PIPUP])
        elif tv.get(TV_ADB):
            await _svc(hass, "androidtv", "adb_command", {"command": f"input keyevent KEYCODE_WAKEUP; am start -a android.intent.action.VIEW -d '{url}'"}, tv[TV_ADB])
        else:
            raise HomeAssistantError("Opening YouTube on this TV needs PiPup or ADB")
        return
    if item:
        await start(hass, tv, item, "play")
        return
    raise HomeAssistantError("Give a trailer link or a Plex title with a trailer")


async def control(hass: HomeAssistant, tv: dict[str, Any], action: str, value: float | None = None) -> None:
    """play | pause | play_pause | stop (= Back) | home | seek (seconds) | skip (± seconds) | volume_up | volume_down | mute | power_on | power_off."""
    route = route_for(hass, tv)
    if route is None and action not in VOLUME_ACTIONS:
        raise HomeAssistantError(f"{tv.get(TV_NAME) or 'This TV'} has no usable player")
    if action in VOLUME_ACTIONS:
        await _volume_power(hass, tv, route, action)
        return
    if route == "plex":
        ent = tv[TV_PLEX]
        mp = {"play": "media_play", "pause": "media_pause", "play_pause": "media_play_pause", "stop": "media_stop"}
        if action in mp:
            await _svc(hass, "media_player", mp[action], {}, ent)
        elif action == "seek":
            await _svc(hass, "media_player", "media_seek", {"seek_position": max(0.0, float(value or 0))}, ent)
        elif action == "skip":
            st = hass.states.get(ent)
            pos = float((st and st.attributes.get("media_position")) or 0)
            await _svc(hass, "media_player", "media_seek", {"seek_position": max(0.0, pos + float(value or 0))}, ent)
        return
    pip = route in ("pipup", "open")
    ent = tv[TV_PIPUP] if pip else tv[TV_ADB]

    async def key(k: str) -> None:
        if pip:
            await _svc(hass, "pipup", "send_key", {"key": k}, ent)
        else:
            await _svc(hass, "androidtv", "adb_command", {"command": f"input keyevent KEYCODE_{k.upper()}"}, ent)

    if action in ("play", "pause", "play_pause"):
        await _svc(hass, "media_player", {"play": "media_play", "pause": "media_pause", "play_pause": "media_play_pause"}[action], {}, ent)
    elif action == "stop":
        await key("back")            # the Plex app ignores Stop; Back leaves the player for the title's page
    elif action == "home":
        await key("home")
    elif action == "seek":
        if not pip:
            raise HomeAssistantError("Exact seek needs PiPup on this TV")
        await _svc(hass, "media_player", "media_seek", {"seek_position": max(0.0, float(value or 0))}, ent)
    elif action == "skip":
        if pip:
            await _svc(hass, "pipup", "seek", {"offset": float(value or 0)}, ent)
        else:
            await key("media_fast_forward" if float(value or 0) > 0 else "media_rewind")
    else:
        raise HomeAssistantError(f"Unknown action {action}")
