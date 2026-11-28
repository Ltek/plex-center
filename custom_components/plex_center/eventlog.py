"""Plex Center's log: commands a TV didn't take, with the cause and what to do about it.

Each entry is written to Home Assistant's log (a warning; info when Plex Center worked around it) and kept,
the last 100, for the card's Log panel (editor → Apps & devices → Log), in `.storage/plex_center.log` so it
survives a restart (saved 30 s after the last change: a burst of entries is one write). The same failure on the
same TV within 10 minutes adds to the count of the entry instead of a new one (and isn't logged again).

Two levels for this log: **error** (the default: commands that failed) and **info** (also the times Plex Center
worked around a refusal, such as Back pressed with ADB or a seek done with skip keys, and the Demos timing notes).

Home Assistant's own log is set apart: errors (a warning each, on by default) and info (off by default). Anything
not written there goes to its debug log.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import logging
import re
import time
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, TV_ADB, TV_NAME, TV_PIPUP

_LOGGER = logging.getLogger(__package__)
KEEP = 100
SAME_S = 600
PIPUP_A11Y = "nl.rogro82.pipup/nl.rogro82.pipup.PiPupAccessibilityService"


@dataclass(frozen=True)
class Cause:
    pattern: str
    cause: str
    fix: str


# What a TV's players say when they can't do something, and why (what each command needs).
CAUSES: tuple[Cause, ...] = (
    Cause(r"needs the accessibility service|accessibility", "PiPup's keys (Back, Home, the D-pad) need its accessibility service "
          "(PiPupAccessibilityService), which is off on this TV.",
          "Run PiPup's install.sh --accessibility, or turn it on with ADB (androidtv.adb_command): settings put secure "
          f"enabled_accessibility_services <current value>:{PIPUP_A11Y}. Until then Plex Center presses those keys with ADB."),
    Cause(r"no media session|nothing is playing", "The app on screen doesn't tell Android what it plays (Plex on the NVIDIA SHIELD), "
          "so PiPup can't seek to an exact time.",
          "Nothing to fix: Plex Center seeks with Fast forward / Rewind presses. Set the TV's \"Plex's Skip forward / back\" to "
          "what its Plex app uses (Plex: Settings → Player) so the seek bar lands where you let go."),
    Cause(r"at most \d+.*wait", "PiPup refused how long Plex Center asked it to wait for Plex's Watch button.",
          "Update Plex Center (it follows PiPup's limit)."),
    Cause(r"not on screen|didn't open", "Plex's Watch button didn't appear in time: the screensaver was on, or Plex was slow to start.",
          "Try again. If it keeps happening, wake the TV first or check that Plex opens on it."),
    Cause(r"click", "PiPup isn't allowed to press buttons in Plex on this TV.",
          "In the PiPup app on the TV, allow clicks for Plex (com.plexapp.android). Until then Plex Center opens the title only."),
    Cause(r"service_not_found|ServiceNotFound|Action \w+\.\w+ not found",
          "A Home Assistant integration Plex Center uses for this isn't loaded (PiPup or Android TV).",
          "Check Settings → Devices & services: the PiPup or Android TV entry may have failed to start."),
    Cause(r"adb.*(connect|offline|unauthori|refused|timed out)|Unable to connect|device offline",
          "Home Assistant can't reach the TV over ADB.",
          "On the TV, turn on Network debugging (Developer options) and allow Home Assistant's key; check the TV's IP."),
    Cause(r"unavailable|isn't reachable|not reachable|timed out|Timeout", "The TV's player didn't answer (off, asleep or not on the network).",
          "Check the TV is on and on the network; Plex Center turns it on first when it can."),
    Cause(r"no usable player|no reachable player|has no player", "This TV has no player Plex Center can use for this.",
          "Settings → Plex Center → Configure: set the TV's PiPup and / or ADB player."),
    Cause(r"turned off with its remote", "Turning off needs ADB or the Android TV Remote (never PiPup: its off is a deep sleep).",
          "Set the TV's ADB or Android TV Remote player in Plex Center's TV settings."),
    Cause(r"isn't ready|didn't start", "The room (theater) didn't say it was ready in time.",
          "Check the room's automation and its status entity; set a longer \"Wait for ready\" if it needs one."),
)


def explain(message: str) -> tuple[str, str]:
    """The cause and the fix for an error message ('' when it isn't one we know)."""
    for c in CAUSES:
        if re.search(c.pattern, message, re.I):
            return c.cause, c.fix
    return "", ""


SAVE_DELAY_S = 30
LEVELS = ("error", "info")


def level(hass: HomeAssistant) -> str:
    return hass.data.get(f"{DOMAIN}_log_level", "error")


def set_level(hass: HomeAssistant, value: str) -> None:
    hass.data[f"{DOMAIN}_log_level"] = value if value in LEVELS else "error"
    if value != "info":   # leave only errors
        log = entries(hass)
        keep = [e for e in log if e.get("level") != "info"]
        log.clear(); log.extend(keep)
    _save_later(hass)


def ha_log(hass: HomeAssistant) -> dict[str, bool]:
    """What goes to Home Assistant's log: {errors, info}."""
    return {"errors": True, "info": False, **(hass.data.get(f"{DOMAIN}_ha_log") or {})}


def set_ha_log(hass: HomeAssistant, errors: bool | None = None, info: bool | None = None) -> dict[str, bool]:
    cur = ha_log(hass)
    if errors is not None:
        cur["errors"] = bool(errors)
    if info is not None:
        cur["info"] = bool(info)
    hass.data[f"{DOMAIN}_ha_log"] = cur
    _follow_level(cur)
    _save_later(hass)
    return cur


def _follow_level(cur: dict[str, bool]) -> None:
    """Info to Home Assistant's log: our logger lets info through (Home Assistant's default is warning)."""
    if cur.get("info") and _LOGGER.getEffectiveLevel() > logging.INFO:
        _LOGGER.setLevel(logging.INFO)


def entries(hass: HomeAssistant) -> deque:
    return hass.data.setdefault(f"{DOMAIN}_log", deque(maxlen=KEEP))


def _store(hass: HomeAssistant) -> Store:
    key = f"{DOMAIN}_log_store"
    if key not in hass.data:
        hass.data[key] = Store(hass, 1, f"{DOMAIN}.log")
    return hass.data[key]


async def async_load(hass: HomeAssistant) -> None:
    """Load the saved log (once, at setup)."""
    if hass.data.get(f"{DOMAIN}_log_loaded"):
        return
    hass.data[f"{DOMAIN}_log_loaded"] = True
    try:
        data = await _store(hass).async_load()
    except Exception as err:  # noqa: BLE001 - start with an empty log
        _LOGGER.debug("Plex Center log not loaded: %s", err)
        return
    log = entries(hass)
    if (data or {}).get("level") in LEVELS:
        hass.data[f"{DOMAIN}_log_level"] = data["level"]
    if isinstance((data or {}).get("ha_log"), dict):
        hass.data[f"{DOMAIN}_ha_log"] = {k: bool(v) for k, v in data["ha_log"].items() if k in ("errors", "info")}
        _follow_level(ha_log(hass))
    saved = [e for e in (data or {}).get("entries", []) if isinstance(e, dict) and "message" in e]
    log.extendleft(reversed(saved[-KEEP:]))   # before anything logged while loading


def _save_later(hass: HomeAssistant) -> None:
    _store(hass).async_delay_save(lambda: {"level": level(hass), "ha_log": ha_log(hass), "entries": list(entries(hass))}, SAVE_DELAY_S)


def clear(hass: HomeAssistant) -> None:
    entries(hass).clear()
    _save_later(hass)


def record(hass: HomeAssistant, tv: dict[str, Any] | None, action: str, err: Exception | str, *, handled: str = "") -> dict[str, Any]:
    """Note a command the TV didn't take. `handled`: what Plex Center did instead (then it's not an error)."""
    msg = str(err) or err.__class__.__name__
    cause, fix = explain(msg)
    name = (tv or {}).get(TV_NAME) or "Plex Center"
    text = f"Plex Center: {name}: {action} {'needed a workaround' if handled else 'failed'}: {msg}"
    if cause:
        text += f". Cause: {cause} Fix: {fix}"
    if handled:
        text += f" ({handled})"
    ha = ha_log(hass)
    to_ha = ha["info"] if handled else ha["errors"]
    keep = not handled or level(hass) == "info"
    log, now = entries(hass), time.time()
    if keep:
        for e in reversed(log):
            if e["tv"] == name and e["action"] == action and e["cause"] == cause and e["message"] == msg and now - e["last"] < SAME_S:
                e["count"] += 1   # the same again within 10 minutes: counted, not logged again
                e["last"] = now
                _save_later(hass)
                return e
    else:
        seen = hass.data.setdefault(f"{DOMAIN}_ha_seen", {})
        k = (name, action, msg)
        if now - seen.get(k, 0) < SAME_S:
            return {}
        seen[k] = now
    if to_ha:
        (_LOGGER.info if handled else _LOGGER.warning)(text)
    else:
        _LOGGER.debug(text)
    if not keep:
        return {}
    e = {"at": now, "last": now, "count": 1, "tv": name, "action": action, "message": msg, "cause": cause, "fix": fix,
         "handled": handled, "level": "info" if handled else "error",
         "players": {k: v for k, v in ((k, (tv or {}).get(k)) for k in (TV_PIPUP, TV_ADB)) if v}}
    log.append(e)
    _save_later(hass)
    return e
