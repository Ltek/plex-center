"""Playback on a TV: the routes proven in /shared/user/tv-tests (see PLAN.md)."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import (BTN_RESTART, BTN_WATCH, PLEX_PKG, TV_ADB, TV_NAME, TV_PIPUP, TV_PLEX, TV_POWER, TV_POWER_OFF, TV_POWER_ON,
                    TV_BUSY, TV_FAIL, TV_READY, TV_READY_S, TV_REMOTE, TV_ROOM_OFF, TV_SKIP_BACK, TV_SKIP_FWD, TV_STATUS, TV_USER, TV_VOLUME)
from .media import SAFE_LINK
from .tvs import room_ready, route_for, tv_on, tv_playing, values

_LOGGER = logging.getLogger(__name__)
_BUSY: set[str] = set()
PIPUP_WAIT = [30]   # seconds PiPup waits for Plex's Watch button (PiPup allows at most 30)


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
    busy, fail = values(tv.get(TV_BUSY), "starting"), values(tv.get(TV_FAIL), "error")
    state = lambda: (hass.states.get(tv[TV_STATUS]).state if hass.states.get(tv[TV_STATUS]) else None)  # noqa: E731
    if ent and state() not in busy:   # already starting (by a wall button, another Play): just wait
        await set_room(hass, tv, True)
    wait = float(tv.get(TV_READY_S) or 120)
    waited, moved = 0.0, state() not in fail   # a failure left over from last time doesn't count until it changes
    while waited < wait:
        await asyncio.sleep(poll)
        waited += poll
        if room_ready(hass, tv):
            await asyncio.sleep(min(2.0, poll * 2))   # let the TV's players catch up
            return
        now = state()
        if now in fail and (moved or waited >= 10):
            raise HomeAssistantError(f"{_name(tv)} didn't start: {_room_error(hass, tv) or now}")
        moved = moved or now not in fail
    st = hass.states.get(tv[TV_STATUS])
    raise HomeAssistantError(f"{_name(tv)} isn't ready after {int(wait)} s ({tv[TV_STATUS]} is {st.state if st else 'missing'}, "
                             f"waiting for {tv.get(TV_READY) or 'on'})")


def _room_error(hass: HomeAssistant, tv: dict[str, Any]) -> str:
    """The reason a room gives for a failed start (an `error` / `reason` attribute, e.g. AV Scenes' sensor)."""
    st = hass.states.get(tv.get(TV_STATUS) or "")
    at = st.attributes if st else {}
    return str(at.get("error") or at.get("reason") or at.get("message") or "")


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
    if room and tv.get(TV_ROOM_OFF):
        return                                 # the room turns the TV off in its own order
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


async def start(hass: HomeAssistant, tv: dict[str, Any], item: dict[str, Any], mode: str = "play",
                activity: str | None = None, start_room: bool = True, back_first: bool = True) -> str:
    """Start an item on a TV. mode: play (Watch / Resume) | restart (Start over). Returns the route used.
    With an Easy AV Control room (and no room hook of its own), the room is turned on first: `activity` picks which
    (else the only / default one that uses the TV); start_room=False skips it.
    back_first=False (Demos): open the title over what's on screen (a paused clip's last frame stays until the next
    one starts), without pressing Back first; Back only when that doesn't work."""
    link = item.get("link")
    if not link or not SAFE_LINK.match(link):
        raise HomeAssistantError("This title has no Plex link")
    from . import avcontrol  # noqa: PLC0415
    av = avcontrol.applies(hass, tv) if start_room else None
    if av and await avcontrol.ensure_on(hass, tv, av, item.get("title") or "", activity):
        for _ in range(60):   # the room just came on: up to 30 s for the TV's players to be there
            if route_for(hass, tv) is not None:
                break
            await asyncio.sleep(0.5)
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
            over = not was_off and _playing(hass, tv)   # something on screen (the TV closed its apps in standby)

            async def back() -> None:
                await _svc(hass, "pipup", "send_key", {"key": "back"}, pip)
                await asyncio.sleep(1.5)
                steps.mark("Back (something was playing)")
            if over and back_first:
                await back()
            data = {"package": PLEX_PKG, "uri": link}
            if route == "open":
                await _svc(hass, "pipup", "launch_app", data, pip)
                steps.mark("PiPup opened the title")
            else:
                async def launch(button: str) -> None:
                    try:
                        try:
                            await _svc(hass, "pipup", "launch_app", {**data, "click": button, "method": "ok", "wait": PIPUP_WAIT[0]}, pip)
                        except (vol.Invalid, HomeAssistantError) as err:   # PiPup's limit for "wait": use it, try again
                            m = re.search(r"at most (\d+)\D*'?wait", str(err))
                            if not m or int(m.group(1)) >= PIPUP_WAIT[0]:
                                if isinstance(err, HomeAssistantError):
                                    raise
                                raise HomeAssistantError(str(err)) from err
                            PIPUP_WAIT[0] = int(m.group(1))
                            await _svc(hass, "pipup", "launch_app", {**data, "click": button, "method": "ok", "wait": PIPUP_WAIT[0]}, pip)
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

                async def launch_first(button: str) -> None:
                    """Over the paused player (back_first=False): if the title doesn't open there, Back, then again."""
                    if not (over and not back_first):
                        await launch_retry(button)
                        return
                    try:
                        await launch(button)
                        steps.mark("opened over the paused player")
                    except HomeAssistantError:
                        await back()
                        await launch_retry(button)

                try:
                    await launch_first(BTN_RESTART if mode == "restart" else BTN_WATCH)
                except HomeAssistantError as err:
                    # Never started: no Restart button on the page; Watch starts from the beginning anyway.
                    # Or the title isn't partly watched any more (played to its end: only Watch shows): Watch.
                    if mode == "restart" and "not on screen" not in str(err) and "didn't open" not in str(err) \
                            and ("404" in str(err) or "not found" in str(err).lower()):
                        await launch_retry(BTN_WATCH)
                    elif mode == "restart" and "didn't open" in str(err) and not item.get("offset"):
                        steps.mark("no Play from start button: Watch")
                        await launch(BTN_WATCH)
                    else:
                        raise
        else:  # adb
            adb = tv[TV_ADB]
            cmd = lambda c: _svc(hass, "androidtv", "adb_command", {"command": c}, adb)  # noqa: E731
            was_off = await wake(hass, tv, steps=steps)
            if not was_off and _playing(hass, tv) and back_first:
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


def _no_session(err: Exception) -> bool:
    """PiPup can't seek: the app publishes no media session (Plex on the SHIELD), or none is playing."""
    return bool(re.search(r"no media session|nothing is playing", str(err), re.I))


def position(hass: HomeAssistant, tv: dict[str, Any]) -> float | None:
    """Where playback is now (seconds): from the TV's Plex player, else PiPup / ADB, moved on while playing."""
    from datetime import datetime  # noqa: PLC0415

    last = _LAST_SEEK.get(_tv_key(tv))
    for ent in (tv.get(TV_PLEX), tv.get(TV_PIPUP), tv.get(TV_ADB)):
        st = ent and hass.states.get(ent)
        pos = st and st.attributes.get("media_position")
        if st and pos is not None and st.state in ("playing", "paused", "buffering"):
            pos = float(pos)
            at = st.attributes.get("media_position_updated_at")
            try:
                at_ts = (at if isinstance(at, datetime) else datetime.fromisoformat(str(at))).timestamp() if at else 0.0
            except (TypeError, ValueError):
                at_ts = 0.0
            if last and time.time() - last[1] < 60 and at_ts < last[1]:   # the TV hasn't reported since our last seek
                return last[0] + (time.time() - last[1] if st.state == "playing" else 0.0)
            if st.state == "playing" and at:
                try:
                    when = at if isinstance(at, datetime) else datetime.fromisoformat(str(at))
                    pos += max(0.0, (datetime.now(when.tzinfo) - when).total_seconds())
                except (TypeError, ValueError):
                    pass
            return pos
    return None


_SEEK_LOCKS: dict[str, asyncio.Lock] = {}


def skip_plan(delta: float, fwd: float, back: float, cap: int = 180) -> tuple[int, int]:
    """Fast forward and Rewind presses that land nearest `delta` seconds, with the fewest presses: a +10 with skips of
    30 / 10 is one Fast forward and two Rewinds."""
    best = (abs(delta), 0, 0, 0)
    for a in range(0, min(cap, int(max(0.0, delta) // fwd) + 3) + 1):
        b = max(0, round((a * fwd - delta) / back))
        if a + b > cap:
            continue
        cand = (abs(a * fwd - b * back - delta), a + b, a, b)
        if cand < best:
            best = cand
    return best[2], best[3]


_SEEK_LOCKS: dict[str, asyncio.Lock] = {}
_LAST_SEEK: dict[str, tuple[float, float]] = {}   # tv → (where it was sent, when: time.time())


def _remote_entity(hass: HomeAssistant, tv: dict[str, Any]) -> str | None:
    """The Android TV Remote's remote.* entity for the TV (beside its media player): it sends keys in about 0.1 s."""
    mp = tv.get(TV_REMOTE)
    if not mp or not hass.states.get(mp):
        return None
    from homeassistant.helpers import entity_registry as er  # noqa: PLC0415

    reg = er.async_get(hass)
    ent = reg.async_get(mp)
    if not ent or not ent.device_id:
        return None
    for e in er.async_entries_for_device(reg, ent.device_id):
        st = e.domain == "remote" and hass.states.get(e.entity_id)
        if st and st.state not in ("unavailable", "unknown"):
            return e.entity_id
    return None


def media_session(hass: HomeAssistant, tv: dict[str, Any]) -> bool:
    """PiPup's player reports what plays: the app shares its playback with Android (PiPup's play / pause / seek
    work). The Plex app on the SHIELD doesn't: PiPup stays "on" while it plays."""
    st = tv.get(TV_PIPUP) and hass.states.get(tv[TV_PIPUP])
    return bool(st) and st.state in ("playing", "paused", "buffering")


REMOTE_KEYS = {"media_play": "MEDIA_PLAY", "media_pause": "MEDIA_PAUSE", "media_play_pause": "MEDIA_PLAY_PAUSE",
               "fast_forward": "MEDIA_FAST_FORWARD", "rewind": "MEDIA_REWIND", "back": "BACK", "home": "HOME"}


def _tv_key(tv: dict[str, Any]) -> str:
    return tv.get(TV_NAME) or tv.get(TV_PIPUP) or tv.get(TV_ADB) or ""


async def _skip_keys(hass: HomeAssistant, tv: dict[str, Any], key, delta: float, start: float | None = None) -> None:
    """Move by `delta` seconds with Fast forward / Rewind presses (each skips as far as the Plex app is set to),
    mixed to land as near as possible. With ADB every press goes in one command; else one PiPup key at a time.
    One seek at a time per TV, so presses never interleave."""
    fwd, back = float(tv.get(TV_SKIP_FWD) or 30), float(tv.get(TV_SKIP_BACK) or 10)
    a, b = skip_plan(delta, fwd, back)
    if not a and not b:
        return
    async with _SEEK_LOCKS.setdefault(_tv_key(tv), asyncio.Lock()):
        adb = tv.get(TV_ADB)
        presses = ["fast_forward"] * a + ["rewind"] * b
        rem = _remote_entity(hass, tv)
        if rem:   # the Android TV Remote: every press in one call
            await _svc(hass, "remote", "send_command", {"command": [REMOTE_KEYS[k] for k in presses], "delay_secs": 0.15}, rem)
        elif _has(hass, adb) and hass.states.get(adb).state not in ("off", "unavailable"):
            codes = [{"fast_forward": "KEYCODE_MEDIA_FAST_FORWARD", "rewind": "KEYCODE_MEDIA_REWIND"}[k] for k in presses]
            for i in range(0, len(codes), 60):   # Android's input takes many key codes at once
                await _svc(hass, "androidtv", "adb_command", {"command": "input keyevent " + " ".join(codes[i:i + 60])}, adb)
        else:
            for i, k in enumerate(presses):
                await key(k)
                if i < len(presses) - 1:
                    await asyncio.sleep(0.12)
        if start is not None:
            _LAST_SEEK[_tv_key(tv)] = (max(0.0, start + a * fwd - b * back), time.time())


VOLUME_ACTIONS = {"volume_up", "volume_down", "volume_set", "mute", "power_on", "power_off"}


async def _volume_power(hass: HomeAssistant, tv: dict[str, Any], route: str, action: str, value: float | None = None) -> None:
    """Volume through the player that controls the TV (PiPup, ADB or the Plex client); power through power_on / power_off."""
    if action == "power_on":
        await power_on(hass, tv)
        return
    if action == "power_off":
        await power_off(hass, tv)
        return
    pip, adb, own = tv.get(TV_PIPUP), tv.get(TV_ADB), tv.get(TV_VOLUME)
    if own:   # the TV's volume player (an AV processor): its volume, not the TV's
        if not hass.states.get(own):
            raise HomeAssistantError(f"{_name(tv)}: the volume player {own} isn't there")
        ent = own
    else:
        from .tvs import plex_volume_ok  # noqa: PLC0415
        ent = pip if pip and hass.states.get(pip) else adb if adb and hass.states.get(adb) \
            else tv.get(TV_PLEX) if plex_volume_ok(hass, tv.get(TV_PLEX)) else None
    if not ent:
        raise HomeAssistantError("No player to change the volume with")
    if action == "volume_set":   # 0–1 (the fill bar's drag)
        if ent == adb:
            raise HomeAssistantError(f"{_name(tv)}: setting the volume to a level needs PiPup or a Volume player")
        await _svc(hass, "media_player", "volume_set", {"volume_level": max(0.0, min(1.0, float(value or 0)))}, ent)
        return
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


# ---------------------------------------------------------------- did playback respond? (then retry over ADB)

RESPOND_S = 2.0      # how long a play / pause gets to show on the TV's players
MOVE_S = 6.0         # … and a skip / seek: the Plex player reports its position only every few seconds
_POLL_S = 0.25


def _adb_on(hass: HomeAssistant, tv: dict[str, Any]) -> bool:
    adb = tv.get(TV_ADB)
    return _has(hass, adb) and hass.states.get(adb).state not in ("off", "unavailable")


def _snap(hass: HomeAssistant, tv: dict[str, Any]) -> dict[str, tuple[str, float | None, str, float]]:
    """What the TV's players report now: {entity: (state, position, position updated at, when read)}."""
    out = {}
    for ent in (tv.get(TV_PLEX), tv.get(TV_PIPUP), tv.get(TV_ADB)):
        st = ent and hass.states.get(ent)
        if st and st.state in ("playing", "paused", "buffering"):
            pos = st.attributes.get("media_position")
            out[ent] = (st.state, float(pos) if pos is not None else None, str(st.attributes.get("media_position_updated_at")), time.time())
    return out


def _toggled(before: dict, now: dict, want: str | None) -> bool:
    """Play / pause took: a player went from playing to paused or back (to `want` when given)."""
    for ent, (s0, *_rest) in before.items():
        s1 = now.get(ent, (None,))[0]
        if s0 in ("playing", "paused") and s1 in ("playing", "paused") and s1 != s0 and (want is None or s1 == want):
            return True
    return False


def _moved(before: dict, now: dict, delta: float | None = None, target: float | None = None) -> bool:
    """A skip / seek took: a player reported a new position near where it should be, not where playback would be anyway."""
    for ent, (s0, p0, at0, t0) in before.items():
        s1, p1, at1, t1 = now.get(ent, (None, None, None, None))
        if p0 is None or p1 is None or at1 == at0:
            continue
        drift = (t1 - t0) if s0 == "playing" else 0.0
        anyway = p0 + drift
        if target is not None:
            if abs(p1 - target) < max(5.0, abs(anyway - target) * 0.5):
                return True
        elif delta and abs(p1 - anyway) >= max(3.0, abs(delta) * 0.5) and (p1 - anyway) * delta > 0:
            return True
    return False


async def _responded(hass: HomeAssistant, tv: dict[str, Any], before: dict, check, wait: float = RESPOND_S) -> bool:
    """Wait up to `wait` s for `check(before, now)`; also True when the players can't tell (no state to compare)."""
    if not before:
        return True
    for _ in range(int(wait / _POLL_S)):
        await asyncio.sleep(_POLL_S)
        if check(before, _snap(hass, tv)):
            return True
    return False


def _retrying(hass: HomeAssistant, tv: dict[str, Any], what: str, wait: float = RESPOND_S, how: str = "sent again over ADB") -> None:
    from .eventlog import record  # noqa: PLC0415
    record(hass, tv, what, HomeAssistantError(f"{what}: the TV didn't respond within {wait:g} s"), handled=how)


def _fresh(before: dict, now: dict) -> tuple[str, float, float] | None:
    """A player's position reported since `before` (state, position, when read), else None."""
    for ent, (s1, p1, at1, t1) in now.items():
        b = before.get(ent)
        if p1 is not None and (b is None or at1 != b[2]):
            return s1, p1, t1
    return None


async def control(hass: HomeAssistant, tv: dict[str, Any], action: str, value: float | None = None) -> None:
    """play | pause | play_pause | stop (= Back) | home | seek (seconds) | skip (± seconds) | volume_up | volume_down | mute | power_on | power_off."""
    route = route_for(hass, tv)
    if route is None and action not in VOLUME_ACTIONS:
        raise HomeAssistantError(f"{tv.get(TV_NAME) or 'This TV'} has no usable player")
    if action in VOLUME_ACTIONS:
        await _volume_power(hass, tv, route, action, value)
        return
    before = _snap(hass, tv)
    adb = tv.get(TV_ADB)
    retry = route != "adb" and _adb_on(hass, tv)   # the command went another way: ADB can press it if nothing happened

    async def adb_key(k: str) -> None:
        code = {"fast_forward": "MEDIA_FAST_FORWARD", "rewind": "MEDIA_REWIND"}.get(k, k.upper())
        await _svc(hass, "androidtv", "adb_command", {"command": f"input keyevent KEYCODE_{code}"}, adb)

    async def checked_toggle() -> None:
        """Play / pause didn't show on the TV within 2 s: press the media key over ADB."""
        was = next((v[0] for v in before.values() if v[0] in ("playing", "paused")), None)
        want = {"play": "playing", "pause": "paused"}.get(action) or {"playing": "paused", "paused": "playing"}.get(was)
        if not retry or was is None or (action != "play_pause" and was == want):   # can't tell, or nothing to change
            return
        if not await _responded(hass, tv, before, lambda b, n: _toggled(b, n, want)):
            _retrying(hass, tv, action.replace("_", " "))
            # the key for the state wanted, never the toggle: a late first command plus this one still end there
            await adb_key("media_play" if want == "playing" else "media_pause")

    async def checked_move(delta: float | None, target: float | None) -> None:
        """A skip / seek didn't show within 2 s: Fast forward / Rewind presses over ADB instead (10 s and 30 s alike)."""
        known = [v for v in before.values() if v[1] is not None]
        if not retry or not known or not (delta or target is not None):
            return
        if await _responded(hass, tv, before, lambda b, n: _moved(b, n, delta, target), MOVE_S):
            return
        # Where is it really? Only a position reported since the command counts; without one, pressing could
        # overshoot a command that was just slow, so nothing is pressed.
        fresh = _fresh(before, _snap(hass, tv))
        what = f"skip {delta:+g} s" if delta is not None else f"seek to {target:g} s"
        if fresh is None:
            _retrying(hass, tv, what, MOVE_S, "not sent again: the TV didn't report where it is")
            return
        state0, pos0, _at0, read0 = known[0]
        aim = target if target is not None else pos0 + ((time.time() - read0) if state0 == "playing" else 0.0) + delta
        s1, p1, t1 = fresh
        now = p1 + ((time.time() - t1) if s1 == "playing" else 0.0)
        missing = aim - now
        if abs(missing) < 3:
            return
        _retrying(hass, tv, what, MOVE_S, f"pressed over ADB for the {missing:+.0f} s still missing")
        await _skip_keys(hass, tv, adb_key, missing, now)

    if route == "plex":
        ent = tv[TV_PLEX]
        mp = {"play": "media_play", "pause": "media_pause", "play_pause": "media_play_pause", "stop": "media_stop"}
        if action in mp:
            await _svc(hass, "media_player", mp[action], {}, ent)
            if action != "stop":
                await checked_toggle()
        elif action == "seek":
            await _svc(hass, "media_player", "media_seek", {"seek_position": max(0.0, float(value or 0))}, ent)
            await checked_move(None, max(0.0, float(value or 0)))
        elif action == "skip":
            st = hass.states.get(ent)
            pos = float((st and st.attributes.get("media_position")) or 0)
            await _svc(hass, "media_player", "media_seek", {"seek_position": max(0.0, pos + float(value or 0))}, ent)
            await checked_move(float(value or 0), None)
        return
    pip = route in ("pipup", "open")
    ent = tv[TV_PIPUP] if pip else tv[TV_ADB]
    rem = _remote_entity(hass, tv)

    async def fast_key(k: str) -> None:
        """A key the quickest way the TV has: the Android TV Remote (about 0.1 s), else ADB, else PiPup."""
        if rem:
            await _svc(hass, "remote", "send_command", {"command": REMOTE_KEYS.get(k, k.upper())}, rem)
        elif _adb_on(hass, tv):
            await adb_key(k)
        else:
            await key(k)

    # The app on screen doesn't share its playback (PiPup's player doesn't report it): PiPup's play / pause / seek
    # do nothing there, so send the media keys at once instead of waiting for them to fail.
    keys_only = pip and not media_session(hass, tv) and bool(rem or _adb_on(hass, tv)) \
        and any(v[0] in ("playing", "paused", "buffering") for v in before.values())   # something plays (the Plex player says)

    async def key(k: str) -> None:
        if not pip:
            await adb_key(k)
            return
        try:
            await _svc(hass, "pipup", "send_key", {"key": k}, ent)
        except HomeAssistantError as err:
            # Back / Home need PiPup's accessibility service (off on the SHIELD): ADB presses them instead
            if not _has(hass, adb):
                raise
            from .eventlog import record  # noqa: PLC0415
            record(hass, tv, f"{k} key (PiPup)", err, handled="pressed with ADB instead")
            await adb_key(k)

    if action in ("play", "pause", "play_pause") and keys_only:
        was = next((v[0] for v in before.values() if v[0] in ("playing", "paused")), None)
        want = {"play": "playing", "pause": "paused"}.get(action) or {"playing": "paused", "paused": "playing"}.get(was)
        await fast_key("media_play" if want == "playing" else "media_pause" if want == "paused" else "media_play_pause")
    elif action in ("play", "pause", "play_pause"):
        await _svc(hass, "media_player", {"play": "media_play", "pause": "media_pause", "play_pause": "media_play_pause"}[action], {}, ent)
        await checked_toggle()
    elif action == "stop":
        await (fast_key if keys_only else key)("back")   # the Plex app ignores Stop; Back leaves the player for the title's page
    elif action == "home":
        await key("home")
    elif action == "seek":
        target = max(0.0, float(value or 0))
        if pip and not keys_only:
            try:
                await _svc(hass, "media_player", "media_seek", {"seek_position": target}, ent)
                await checked_move(None, target)
                return
            except HomeAssistantError as err:
                if not _no_session(err):
                    raise
                from .eventlog import record  # noqa: PLC0415
                record(hass, tv, "seek (PiPup)", err, handled="seeked with Fast forward / Rewind presses")
        pos = position(hass, tv)
        if pos is None:
            raise HomeAssistantError(f"{_name(tv)}: can't seek, the Plex app isn't saying where it is")
        await _skip_keys(hass, tv, fast_key if keys_only else key, target - pos, pos)
    elif action == "skip":
        if pip and not keys_only:
            try:
                await _svc(hass, "pipup", "seek", {"offset": float(value or 0)}, ent)
                await checked_move(float(value or 0), None)
                return
            except HomeAssistantError as err:
                if not _no_session(err):
                    raise
                from .eventlog import record  # noqa: PLC0415
                record(hass, tv, "skip (PiPup)", err, handled="skipped with Fast forward / Rewind presses")
        await _skip_keys(hass, tv, fast_key if keys_only else key, float(value or 0), position(hass, tv))
    else:
        raise HomeAssistantError(f"Unknown action {action}")
