"""Playback on a TV: the routes proven in /shared/user/tv-tests (see PLAN.md)."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import (BTN_RESTART, BTN_WATCH, PLEX_PKG, TV_ADB, TV_NAME, TV_PIPUP, TV_PLEX, TV_POWER, TV_POWER_OFF, TV_POWER_ON,
                    TV_READY, TV_READY_S, TV_REMOTE, TV_STATUS, TV_USER)
from .media import SAFE_LINK
from .tvs import room_ready, route_for, tv_on, tv_playing

_LOGGER = logging.getLogger(__name__)
_BUSY: set[str] = set()


class Steps:
    """Debug log of a Play: one line per step with its time and the total (Enable debug logging on Plex Center)."""

    def __init__(self, tv: dict[str, Any], what: str) -> None:
        self.name, self.t0 = tv.get(TV_NAME) or tv.get("id") or "TV", time.monotonic()
        self.t = self.t0
        _LOGGER.debug("plex_center play on %s: start %s", self.name, what)

    def mark(self, step: str) -> None:
        now = time.monotonic()
        _LOGGER.debug("plex_center play on %s: %-34s %5.1f s  (total %5.1f s)", self.name, step, now - self.t, now - self.t0)
        self.t = now


def _tap(button: str) -> str:
    """Shell: tap a Plex button by its resource id (from a screen dump); 'none' when it isn't on screen."""
    return ("uiautomator dump /sdcard/plc.xml >/dev/null 2>&1; "
            f"b=$(grep -oE 'resource-id=\"{button}\"[^>]*bounds=\"[^\"]*\"' /sdcard/plc.xml | grep -oE '[0-9]+' | tail -4 | tr '\\n' ' '); "
            "if [ -z \"$b\" ]; then echo none; else set -- $b; input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 )); echo tapped; fi")


def _playing(hass: HomeAssistant, tv: dict[str, Any]) -> bool:
    """Something really plays: the TV is on and a player says so (a stale paused Plex session doesn't count)."""
    return tv_playing(hass, tv)


def _has(hass: HomeAssistant, entity_id: str | None) -> bool:
    return bool(entity_id and hass.states.get(entity_id))


def _name(tv: dict[str, Any]) -> str:
    return tv.get(TV_NAME) or "This TV"


async def _svc(hass: HomeAssistant, domain: str, service: str, data: dict[str, Any], entity_id: str) -> None:
    await hass.services.async_call(domain, service, {**data, "entity_id": entity_id}, blocking=True)


# ------------------------------------------------------------------------------------------- room power (optional)

SELECTS = ("input_select", "select")
ON_ONLY = ("script", "scene")


def _room_value(tv: dict[str, Any], on: bool) -> str:
    return str(tv.get(TV_POWER_ON if on else TV_POWER_OFF) or ("on" if on else "off"))


def _room_is(hass: HomeAssistant, tv: dict[str, Any], on: bool) -> bool:
    st = hass.states.get(tv.get(TV_POWER) or "")
    return bool(st) and st.state == _room_value(tv, on)


async def set_room(hass: HomeAssistant, tv: dict[str, Any], on: bool) -> bool:
    """Set the TV's power entity on / off (your automation turns the room's devices on or off). False if it can't."""
    ent = tv.get(TV_POWER)
    if not ent or not hass.states.get(ent):
        return False
    domain = ent.split(".", 1)[0]
    if domain in SELECTS:
        await hass.services.async_call(domain, "select_option", {"entity_id": ent, "option": _room_value(tv, on)}, blocking=True)
    elif domain in ON_ONLY:
        if not on:
            return False
        await hass.services.async_call(domain, "turn_on", {"entity_id": ent}, blocking=True)
    else:
        await hass.services.async_call("homeassistant", "turn_on" if on else "turn_off", {"entity_id": ent}, blocking=True)
    return True


async def ensure_ready(hass: HomeAssistant, tv: dict[str, Any], *, poll: float = 1.0) -> None:
    """Before playing or turning on: if the TV has a status entity that isn't ready, set its power entity on and wait
    until the status says ready (up to ready_wait seconds). Without a status entity, just set the power entity on."""
    ready, ent = room_ready(hass, tv), tv.get(TV_POWER)
    if ready or (ready is None and not ent):
        return
    if ready is None:   # no status entity: set the power entity on (unless it already is), then go on
        if (tv_on(hass, tv) is False) if ent.split(".", 1)[0] in ON_ONLY else not _room_is(hass, tv, True):
            await set_room(hass, tv, True)
        return
    if ent:
        await set_room(hass, tv, True)
    wait = float(tv.get(TV_READY_S) or 120)
    waited = 0.0
    while waited < wait:
        await asyncio.sleep(poll)
        waited += poll
        if room_ready(hass, tv):
            await asyncio.sleep(min(2.0, poll * 2))   # let the TV's players catch up
            return
    st = hass.states.get(tv[TV_STATUS])
    raise HomeAssistantError(f"{_name(tv)} isn't ready after {int(wait)} s ({tv[TV_STATUS]} is {st.state if st else 'missing'}, "
                             f"waiting for {tv.get(TV_READY) or 'on'})")


# ------------------------------------------------------------------------------------------- power

async def power_on(hass: HomeAssistant, tv: dict[str, Any]) -> None:
    """Turn the TV on: its room first (power / status entities), then PiPup, Android TV Remote or ADB's wake key."""
    await ensure_ready(hass, tv)
    pip, rem, adb = tv.get(TV_PIPUP), tv.get(TV_REMOTE), tv.get(TV_ADB)
    if _has(hass, pip):
        await _svc(hass, "media_player", "turn_on", {}, pip)
    elif _has(hass, rem):
        await _svc(hass, "media_player", "turn_on", {}, rem)
    elif _has(hass, adb):
        await _svc(hass, "androidtv", "adb_command", {"command": "input keyevent KEYCODE_WAKEUP"}, adb)
    else:
        raise HomeAssistantError(f"{_name(tv)} has no player that can turn it on")


async def power_off(hass: HomeAssistant, tv: dict[str, Any]) -> None:
    """Turn the TV off the way its remote does (standby), so it can be woken again from Home Assistant.

    Only ADB's sleep key or the Android TV Remote's Power key. Never media_player.turn_off on PiPup, Cast or
    Plex: on TCL Google TVs PiPup's turn off is a deep sleep that nothing but the remote wakes from.
    """
    adb, rem = tv.get(TV_ADB), tv.get(TV_REMOTE)
    room = await set_room(hass, tv, False)   # the room's automation turns its devices off
    if _has(hass, adb):
        await _svc(hass, "androidtv", "adb_command", {"command": "input keyevent KEYCODE_SLEEP"}, adb)
    elif _has(hass, rem):
        await _svc(hass, "media_player", "turn_off", {}, rem)
    elif not room:
        raise HomeAssistantError(f"{_name(tv)} can only be turned off with its remote (Plex Center needs its ADB or Android TV Remote player)")


def can_power_off(tv: dict[str, Any]) -> bool:
    room = tv.get(TV_POWER)
    return bool(tv.get(TV_ADB) or tv.get(TV_REMOTE) or (room and room.split(".", 1)[0] not in ON_ONLY))


async def wake(hass: HomeAssistant, tv: dict[str, Any], tries: int = 40, steps: Steps | None = None) -> bool:
    """Make the TV ready for a title: on, screensaver closed, no 'not responding' box. True if it was off."""
    mark = steps.mark if steps else (lambda _s: None)
    was_off = tv_on(hass, tv) is False
    if was_off:
        await power_on(hass, tv)
        mark("turn on sent")
        for _ in range(tries):          # up to ~20 s for its players to say on
            await asyncio.sleep(0.5)
            if tv_on(hass, tv):
                break
        mark("TV says on" if tv_on(hass, tv) else "TV still not on (gave up waiting)")
        await asyncio.sleep(2)
        mark("settle after turning on")
    if not was_off and _playing(hass, tv):
        return was_off
    pip, adb = tv.get(TV_PIPUP), tv.get(TV_ADB)
    if _has(hass, adb):   # wake key closes the screensaver without pressing anything; then close system boxes
        await _svc(hass, "androidtv", "adb_command",
                   {"command": "input keyevent KEYCODE_WAKEUP; am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS"}, adb)
        mark("ADB wake + close dialogs")
    elif _has(hass, pip):  # PiPup's turn on also closes the screensaver
        await _svc(hass, "media_player", "turn_on", {}, pip)
        mark("PiPup turn on (wake)")
    return was_off


async def open_app(hass: HomeAssistant, tv: dict[str, Any], rec: dict[str, Any]) -> None:
    """Best effort for another app (HBO Max, Netflix ...): wake the TV, open the app, press Play.

    These apps can't be told which title to play; if the TV closed the app, it opens on its home screen."""
    pkg = str(rec.get("app_id") or "")
    if not re.match(r"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$", pkg):
        raise HomeAssistantError(f"Plex Center doesn't know how to open {rec.get('app') or 'that app'} on {_name(tv)}")
    pip, adb = tv.get(TV_PIPUP), tv.get(TV_ADB)
    await wake(hass, tv)
    if _has(hass, pip):
        await _svc(hass, "pipup", "launch_app", {"package": pkg}, pip)
    elif _has(hass, adb):
        await _svc(hass, "androidtv", "adb_command", {"command": f"monkey -p {pkg} -c android.intent.category.LAUNCHER 1"}, adb)
    else:
        raise HomeAssistantError(f"{_name(tv)} needs PiPup or ADB to open {rec.get('app') or 'that app'}")
    await asyncio.sleep(8)
    try:
        await _svc(hass, "media_player", "media_play", {}, pip if _has(hass, pip) else adb)
    except HomeAssistantError:
        pass


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
    steps = Steps(tv, f"{item.get('title') or item.get('key')} ({mode}, route {route})")
    try:
        if tv.get(TV_POWER) or tv.get(TV_STATUS):
            await ensure_ready(hass, tv)   # a room (theater) first: its power entity, then wait for its status
            steps.mark("room ready")
        if route == "plex":
            payload = {"plex_key": int(item["key"]), **({"username": tv[TV_USER]} if tv.get(TV_USER) else {}),
                       **({"offset": 0} if mode == "restart" else {"resume": True})}
            import json  # noqa: PLC0415

            await _svc(hass, "media_player", "play_media", {"media_content_type": item.get("type") or "movie",
                                                            "media_content_id": "plex://" + json.dumps(payload)}, tv[TV_PLEX])
            steps.mark("Plex remote: play_media")
        elif route in ("pipup", "open"):
            pip = tv[TV_PIPUP]
            was_off = await wake(hass, tv, steps=steps)
            if not was_off and _playing(hass, tv):   # the TV closed its apps in standby: nothing to leave
                await _svc(hass, "pipup", "send_key", {"key": "back"}, pip)
                await asyncio.sleep(1.5)
                steps.mark("Back (something was playing)")
            data = {"package": PLEX_PKG, "uri": link}
            if route == "open":
                await _svc(hass, "pipup", "launch_app", data, pip)
                steps.mark("PiPup opened the title")
            else:
                async def launch(button: str) -> None:
                    try:
                        await _svc(hass, "pipup", "launch_app", {**data, "click": button, "method": "ok", "wait": 45}, pip)
                    except HomeAssistantError as err:
                        steps.mark(f"PiPup open + press {button.rsplit('-', 1)[-1]} FAILED: {err}")
                        raise
                    steps.mark(f"PiPup open + press {button.rsplit('-', 1)[-1]}")

                async def launch_retry(button: str) -> None:
                    try:
                        await launch(button)
                    except HomeAssistantError as err:
                        if "not on screen" not in str(err):
                            raise
                        # Plex opened behind the screensaver (or was slow to start): Home closes it, then once more
                        await _svc(hass, "pipup", "send_key", {"key": "home"}, pip)
                        await asyncio.sleep(2)
                        steps.mark("Home (screensaver?), then retry")
                        try:
                            await launch(button)
                        except HomeAssistantError as err2:
                            if "not on screen" in str(err2):
                                raise HomeAssistantError(f"Plex didn't open on {_name(tv)}. Try again.") from err2
                            raise

                try:
                    await launch_retry(BTN_RESTART if mode == "restart" else BTN_WATCH)
                except HomeAssistantError as err:
                    # Never started: no Restart button on the page; Watch starts from the beginning anyway.
                    if mode == "restart" and "not on screen" not in str(err) and "didn't open" not in str(err) \
                            and ("404" in str(err) or "not found" in str(err).lower()):
                        await launch_retry(BTN_WATCH)
                    else:
                        raise
        else:  # adb
            adb = tv[TV_ADB]
            cmd = lambda c: _svc(hass, "androidtv", "adb_command", {"command": c}, adb)  # noqa: E731
            was_off = await wake(hass, tv, steps=steps)
            if not was_off and _playing(hass, tv):
                await cmd("input keyevent KEYCODE_BACK")
                await asyncio.sleep(1.5)
                steps.mark("ADB Back (something was playing)")
            await cmd(f"input keyevent KEYCODE_WAKEUP; am start -a android.intent.action.VIEW -d '{link}' {PLEX_PKG}")
            steps.mark("ADB open the title")
            await asyncio.sleep(7)
            if mode == "restart":
                await cmd(f"{_tap(BTN_RESTART)} | grep -q tapped || input keyevent KEYCODE_DPAD_CENTER")
                steps.mark("wait 7 s + ADB press Start over")
            else:
                await cmd("input keyevent KEYCODE_DPAD_CENTER")
                steps.mark("wait 7 s + ADB press OK")
                await asyncio.sleep(10)
                if not _playing(hass, tv):   # the page was still loading: one more OK
                    await cmd("input keyevent KEYCODE_DPAD_CENTER")
                    steps.mark("wait 10 s, not playing: OK again")
                else:
                    steps.mark("wait 10 s: playing")
        steps.mark("done")
        return route
    finally:
        _BUSY.discard(key)


VOLUME_ACTIONS = {"volume_up", "volume_down", "mute", "power_on", "power_off"}


async def _volume_power(hass: HomeAssistant, tv: dict[str, Any], route: str, action: str) -> None:
    """Volume through the player that controls the TV (PiPup, ADB or the Plex client); power through power_on / power_off."""
    if action == "power_on":
        await power_on(hass, tv)
        return
    if action == "power_off":
        await power_off(hass, tv)
        return
    pip, adb = tv.get(TV_PIPUP), tv.get(TV_ADB)
    ent = pip if pip and hass.states.get(pip) else adb if adb and hass.states.get(adb) else tv.get(TV_PLEX)
    if not ent:
        raise HomeAssistantError("No player to change the volume with")
    if ent == adb:
        key = {"volume_up": "VOLUME_UP", "volume_down": "VOLUME_DOWN", "mute": "VOLUME_MUTE"}[action]
        await _svc(hass, "androidtv", "adb_command", {"command": f"input keyevent KEYCODE_{key}"}, ent)
        return
    if action == "mute":
        st = hass.states.get(ent)
        await _svc(hass, "media_player", "volume_mute", {"is_volume_muted": not bool(st and st.attributes.get("is_volume_muted"))}, ent)
    else:
        await _svc(hass, "media_player", {"volume_up": "volume_up", "volume_down": "volume_down"}[action], {}, ent)




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
