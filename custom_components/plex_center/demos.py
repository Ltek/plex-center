"""Demos: play a library of trimmed clips (the user's "Demos" library), one at a time or in sequence.

A sequence is the whole library (Plex's order) or one of its collections (their custom order). Each clip plays from
its start; just before its end it's paused (the last frame stays on screen) or stopped, then after a gap the next one
starts. After the last clip it stays paused for a while, then stops. Optional: an entity set at the start and at the
end of a demo session (a lighting-automation bypass), PiPup popups (the clip's label / number, a start and an end
message). Settings are per TV, in Home Assistant's storage (admins change them).
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .const import TV_ID, TV_NAME, TV_PIPUP, TV_PLEX, TV_USER

_LOGGER = logging.getLogger(__name__)
SIGNAL = "plex_center_demos"
ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")

DEFAULTS: dict[str, Any] = {
    "enabled": False,      # Demos on this TV (the card shows the Demos button)
    "library": "Demos",    # the library of clips
    "end": "pause",        # pause | stop: what happens just before a clip's end
    "lead_s": 1.0,         # how long before the end it's paused / stopped (keeps Plex's post-play screen away)
    "gap_s": 3,            # between clips
    "last_pause_s": 10,    # after the last clip: paused this long, then stopped
    "start_entity": "",    # set when a demo session starts …
    "start_value": "",     # … to this (on / an option / a number; scripts and scenes just run)
    "stop_entity": "",     # set when it ends (empty: the start entity)
    "stop_value": "",
    "popup_label": False,  # PiPup: the clip's label
    "popup_number": False,  # PiPup: "3 / 8"
    "popup_start": "",     # PiPup: a message when the session starts (empty: none)
    "popup_end": "",       # … and when it ends
    "popup_s": 5,
}
NUMS = {"lead_s": (0.0, 10.0), "gap_s": (0, 120), "last_pause_s": (0, 3600), "popup_s": (1, 60)}
BOOLS = ("enabled", "popup_label", "popup_number")
TEXTS = ("library", "start_value", "stop_value", "popup_start", "popup_end")
ENTITIES = ("start_entity", "stop_entity")


def check_settings(cur: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """`cur` with `changes`, checked (ValueError with the reason). An empty value goes back to the default."""
    out = dict(cur)
    for k, v in changes.items():
        if k not in DEFAULTS:
            raise ValueError(f"{k} isn't a demo setting")
        if v is None or v == "":
            out.pop(k, None)
        elif k in BOOLS:
            out[k] = bool(v)
        elif k == "end":
            if v not in ("pause", "stop"):
                raise ValueError("end must be pause or stop")
            out[k] = v
        elif k in NUMS:
            lo, hi = NUMS[k]
            n = float(v)
            if not lo <= n <= hi:
                raise ValueError(f"{k} must be {lo:g}–{hi:g}")
            out[k] = n
        elif k in ENTITIES:
            v = str(v).strip()
            if not ENTITY_RE.match(v):
                raise ValueError(f"{v} isn't an entity id")
            out[k] = v
        elif k in TEXTS:
            out[k] = str(v).strip()[:200]
        if out.get(k) == DEFAULTS[k]:
            out.pop(k, None)
    return out


async def set_entity(hass: HomeAssistant, entity: str, value: str, *, start: bool) -> None:
    """Set an entity the way its kind is set: scripts / scenes / automations / buttons run; selects take an option;
    numbers and texts a value; anything else (input_boolean, switch, light …) on or off (default on at the start,
    off at the end)."""
    if not entity or not ENTITY_RE.match(entity):
        return
    d = entity.split(".", 1)[0]
    v = str(value or "").strip()
    if d in ("script", "scene"):
        await hass.services.async_call(d, "turn_on", {"entity_id": entity}, blocking=False)
    elif d == "automation":
        await hass.services.async_call(d, "trigger", {"entity_id": entity}, blocking=False)
    elif d in ("button", "input_button"):
        await hass.services.async_call(d, "press", {"entity_id": entity}, blocking=True)
    elif d in ("input_select", "select"):
        if v:
            await hass.services.async_call(d, "select_option", {"entity_id": entity, "option": v}, blocking=True)
    elif d in ("input_number", "number"):
        if v:
            await hass.services.async_call(d, "set_value", {"entity_id": entity, "value": float(v)}, blocking=True)
    elif d in ("input_text", "text"):
        await hass.services.async_call(d, "set_value", {"entity_id": entity, "value": v}, blocking=True)
    else:
        on = (v.lower() in ("on", "true", "1", "yes")) if v else start
        await hass.services.async_call("homeassistant", "turn_on" if on else "turn_off", {"entity_id": entity}, blocking=True)


def _popup_target(hass: HomeAssistant, tv: dict[str, Any]) -> str | None:
    """PiPup's popups go to a binary sensor of the TV's PiPup device."""
    pip = tv.get(TV_PIPUP)
    reg = er.async_get(hass)
    ent = pip and reg.async_get(pip)
    if not ent or not ent.device_id:
        return None
    sensors = [e.entity_id for e in er.async_entries_for_device(reg, ent.device_id) if e.domain == "binary_sensor"]
    return next((s for s in sensors if s.endswith("_popup")), None) or next((s for s in sensors if s.endswith("_connectivity")), None) \
        or (sensors[0] if sensors else None)


async def popup(hass: HomeAssistant, tv: dict[str, Any], title: str, message: str = "", seconds: float = 5) -> None:
    target = _popup_target(hass, tv)
    if not target or not hass.services.has_service("pipup", "show"):
        return
    try:
        await hass.services.async_call("pipup", "show", {"entity_id": target, "title": title, "message": message,
                                                         "duration": int(seconds)}, blocking=False)
    except Exception as err:  # noqa: BLE001 - a popup is a nicety
        _LOGGER.debug("Demo popup failed: %s", err)


# ---------------------------------------------------------------------------------------------- the clips

def _section(server, title: str):
    for s in server.library.sections():
        if s.title == title or str(s.key) == str(title):
            return s
    raise HomeAssistantError(f"There's no Plex library called {title}")


def sequences(server, library: str) -> list[dict[str, Any]]:
    """The library as a whole, then its collections (each with its clip count)."""
    sec = _section(server, library)
    out = [{"id": "all", "title": f"All of {sec.title}", "count": getattr(sec, "totalSize", None) or len(sec.all())}]
    for c in sec.collections():
        out.append({"id": str(c.ratingKey), "title": c.title, "count": getattr(c, "childCount", None) or len(c.items())})
    return out


def clips(server, library: str, seq: str) -> list:
    """The clips of a sequence, in order ("all": the library in Plex's order; else a collection, by key or title)."""
    sec = _section(server, library)
    if seq in ("", "all", None):
        return [i for i in sec.all() if getattr(i, "type", None) in ("movie", "clip", "episode")]
    for c in sec.collections():
        if str(c.ratingKey) == str(seq) or c.title == seq:
            return [i for i in c.items() if getattr(i, "type", None) in ("movie", "clip", "episode")]
    raise HomeAssistantError(f"{library} has no collection {seq}")


def collection_edit(server, library: str, op: str, data: dict[str, Any]) -> dict[str, Any]:
    """The Demo builder (as the server owner): create / add / remove / move / rename / delete a collection.
    New collections keep the order clips are added in (custom sort)."""
    sec = _section(server, library)
    fetch = lambda keys: [server.fetchItem(int(k)) for k in keys]  # noqa: E731
    if op == "create":
        items = fetch(data.get("keys") or [])
        if not items:
            raise HomeAssistantError("Pick at least one clip")
        col = sec.createCollection(str(data.get("title") or "Demo").strip()[:100] or "Demo", items=items)
        try:
            col.sortUpdate(sort="custom")
        except Exception:  # noqa: BLE001 - an older plexapi / server: Plex's default order
            pass
        return {"id": str(col.ratingKey)}
    col = next((c for c in sec.collections() if str(c.ratingKey) == str(data.get("id"))), None)
    if col is None:
        raise HomeAssistantError("That collection isn't there any more")
    if op == "add":
        col.addItems(fetch(data.get("keys") or []))
    elif op == "remove":
        col.removeItems(fetch(data.get("keys") or []))
    elif op == "move":   # one clip, after another (None: to the top)
        item = server.fetchItem(int(data["key"]))
        after = server.fetchItem(int(data["after"])) if data.get("after") else None
        col.moveItem(item, after=after)
    elif op == "rename":
        col.editTitle(str(data.get("title") or "").strip()[:100] or col.title)
    elif op == "delete":
        col.delete()
    else:
        raise HomeAssistantError(f"Unknown change {op}")
    return {"id": str(col.ratingKey)}


# ---------------------------------------------------------------------------------------------- the runner

class Demos:
    """Per-TV settings, clip labels, and the demo running on each TV."""

    def __init__(self, hass: HomeAssistant, entry_id: str, conn) -> None:
        self.hass, self.conn = hass, conn
        self._store: Store = Store(hass, 1, f"plex_center.demos.{entry_id}")
        self.data: dict[str, Any] = {"tvs": {}, "labels": {}, "active": {}}
        self.runs: dict[str, Runner] = {}
        self.tvs: list[dict[str, Any]] = []

    async def async_load(self, tvs: list[dict[str, Any]]) -> None:
        self.tvs = tvs
        self.data = {"tvs": {}, "labels": {}, "active": {}, **((await self._store.async_load()) or {})}
        # Home Assistant stopped during a demo: end that session (the lighting bypass back off)
        for tv_id in list(self.data.get("active") or {}):
            tv = next((t for t in tvs if t.get(TV_ID) == tv_id), None)
            if tv:
                s = self.settings(tv_id)
                try:
                    await set_entity(self.hass, s["stop_entity"] or s["start_entity"], s["stop_value"], start=False)
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning("Plex Center: ending the demo session on %s after a restart failed: %s", tv.get(TV_NAME), err)
        self.data["active"] = {}
        self._save()

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1)

    def settings(self, tv_id: str) -> dict[str, Any]:
        return {**DEFAULTS, **(self.data["tvs"].get(tv_id) or {})}

    def set_settings(self, tv_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        self.data["tvs"][tv_id] = check_settings(self.data["tvs"].get(tv_id) or {}, changes)
        self._save()
        self.notify(tv_id)
        return self.settings(tv_id)

    def label(self, key: str, title: str) -> str:
        return (self.data.get("labels") or {}).get(str(key)) or title

    def set_label(self, key: str, label: str) -> None:
        labels = self.data.setdefault("labels", {})
        if label.strip():
            labels[str(key)] = label.strip()[:120]
        else:
            labels.pop(str(key), None)
        self._save()

    def demo_libraries(self) -> set[str]:
        """The demo libraries of the TVs that use Demos: left out of Home, the library tabs and Surprise me."""
        return {self.settings(t[TV_ID])["library"] for t in self.tvs if self.settings(t[TV_ID])["enabled"]}

    def status(self, tv_id: str) -> dict[str, Any]:
        r = self.runs.get(tv_id)
        return r.status() if r else {"state": "idle"}

    @callback
    def notify(self, tv_id: str) -> None:
        async_dispatcher_send(self.hass, SIGNAL, tv_id)

    def mark_active(self, tv_id: str, on: bool) -> None:
        if on:
            self.data.setdefault("active", {})[tv_id] = True
        else:
            (self.data.get("active") or {}).pop(tv_id, None)
        self._save()

    async def async_play(self, tv: dict[str, Any], seq: str = "all", start: int = 1, mode: str = "all",
                         skip: list[str] | None = None, order: list[str] | None = None) -> dict[str, Any]:
        s = self.settings(tv[TV_ID])
        from .media import item_dict  # noqa: PLC0415

        items = await self.conn.async_call(tv.get(TV_USER), lambda srv: [item_dict(i) for i in clips(srv, s["library"], seq)])
        if not items:
            raise HomeAssistantError(f"No clips in {seq if seq not in ('', 'all') else s['library']}")
        old = self.runs.get(tv[TV_ID])
        if old:
            await old.async_cancel(quiet=True)
        if order:   # this demo's own order (the collection keeps its own); clips not named keep theirs, after
            rank = {str(k): n for n, k in enumerate(order)}
            items = sorted(items, key=lambda x: (rank.get(str(x.get("key")), len(rank)), items.index(x)))
        left_out = {str(k) for k in (skip or [])} & {str(x.get("key")) for x in items}
        if len(left_out) >= len(items):
            raise HomeAssistantError("Every clip is left out")
        r = Runner(self, tv, items, seq or "all", max(0, min(len(items) - 1, int(start) - 1)), mode, left_out)
        self.runs[tv[TV_ID]] = r
        r.task = self.hass.async_create_background_task(r.run(), f"plex_center demo {tv[TV_ID]}")
        return r.status()

    async def async_control(self, tv: dict[str, Any], action: str) -> dict[str, Any]:
        r = self.runs.get(tv[TV_ID])
        if r is None or r.done:
            raise HomeAssistantError(f"No demo is running on {tv.get(TV_NAME)}")
        await r.control(action)
        return r.status()

    async def async_stop_all(self) -> None:
        for r in list(self.runs.values()):
            await r.async_cancel(quiet=False)


class Runner:
    """One demo on one TV."""

    def __init__(self, demos: Demos, tv: dict[str, Any], items: list[dict[str, Any]], seq: str, start: int, mode: str,
                 skip: set[str] | None = None) -> None:
        self.demos, self.hass, self.tv, self.items, self.seq, self.mode = demos, demos.hass, tv, items, seq, mode
        self.skip: set[str] = set(skip or ())     # clips left out of this session (can change while it runs)
        self.played: list[str] = []               # clips played to their end (this round, for a loop)
        self.i, self.state, self.done, self.task = start, "starting", False, None
        if self._left_out(self.i):
            self.i = self._step(self.i, 1, wrap=True) or 0
        self.ends_at: float | None = None
        self._jump: int | None = None
        self._kick = asyncio.Event()
        self._stopped = False
        self.last_timing: dict[str, Any] | None = None

    def status(self) -> dict[str, Any]:
        it = self.items[self.i] if 0 <= self.i < len(self.items) else {}
        return {"state": "idle" if self.done else self.state, "sequence": self.seq, "mode": self.mode, "index": self.i + 1,
                "total": len(self.items), "key": it.get("key"), "title": it.get("title"),
                "label": self.demos.label(it.get("key", ""), it.get("title", "")),
                "ends_at": self.ends_at, "timing": self.last_timing,
                "keys": [x.get("key") for x in self.items], "played": list(self.played), "skip": sorted(self.skip)}

    def _key(self, i: int) -> str:
        return str(self.items[i].get("key"))

    def _left_out(self, i: int) -> bool:
        return 0 <= i < len(self.items) and self._key(i) in self.skip

    def _step(self, i: int, d: int, *, wrap: bool) -> int | None:
        """The next (d=1) or previous (d=-1) clip from i that isn't left out; None at the end (unless it wraps)."""
        n = len(self.items)
        for k in range(1, n + 1):
            j = i + d * k
            if wrap:
                j %= n
            elif not 0 <= j < n:
                return None
            if not self._left_out(j):
                return None if j == i and k == n else j
        return None

    def _set(self, state: str) -> None:
        self.state = state
        self.demos.notify(self.tv[TV_ID])

    async def control(self, action: str) -> None:
        from .play import control  # noqa: PLC0415
        if action in ("next", "previous"):
            n = self._step(self.i, 1 if action == "next" else -1, wrap=self.mode == "loop")
            if n is not None:
                self._jump = n
                self._kick.set()
        elif action.startswith("move:"):   # this demo's order: move a clip to just after another (or first)
            _, key, after = action.split(":", 2)
            keys = [self._key(j) for j in range(len(self.items))]
            if key not in keys or (after != "first" and after not in keys) or after == key:
                raise HomeAssistantError("No such clip in this demo")
            cur, jump = keys[self.i], (keys[self._jump] if self._jump is not None else None)
            it = self.items.pop(keys.index(key))
            pos = 0 if after == "first" else [self._key(j) for j in range(len(self.items))].index(after) + 1
            self.items.insert(pos, it)
            keys = [self._key(j) for j in range(len(self.items))]
            self.i = keys.index(cur)
            if jump is not None:
                self._jump = keys.index(jump)
            self.demos.notify(self.tv[TV_ID])
        elif action.startswith(("skip:", "unskip:")):   # leave a clip out of this session, or put it back
            what, key = action.split(":", 1)
            if what == "unskip":
                self.skip.discard(key)
                self.demos.notify(self.tv[TV_ID])
                return
            if all(self._key(j) == key or self._key(j) in self.skip for j in range(len(self.items))):
                raise HomeAssistantError("That would leave every clip out")
            self.skip.add(key)
            if self._key(self.i) == key and self.state in ("starting", "playing", "paused"):
                n = self._step(self.i, 1, wrap=self.mode == "loop")
                if n is None:
                    await self.async_cancel(quiet=False)
                    return
                self._jump = n
                self._kick.set()
            self.demos.notify(self.tv[TV_ID])
        elif action == "stop":
            await self.async_cancel(quiet=False)
        elif action == "pause":
            self._set("paused")
            await control(self.hass, self.tv, "pause")
        elif action == "resume":
            await control(self.hass, self.tv, "play")
            self._set("playing")
        elif action.isdigit():   # play that clip now (1-based)
            n = int(action) - 1
            if 0 <= n < len(self.items):
                self.skip.discard(self._key(n))   # picked by hand: it's back in
                self._jump = n
                self._kick.set()
        else:
            raise HomeAssistantError(f"Unknown demo action {action}")

    async def async_cancel(self, *, quiet: bool) -> None:
        self._stopped = True
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if not quiet:
            from .play import control  # noqa: PLC0415
            try:
                await control(self.hass, self.tv, "stop")
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("Demo stop: %s", err)

    async def _wait(self, seconds: float) -> bool:
        """Wait, or less when Next / Previous / a clip is picked. True when it was cut short."""
        self._kick.clear()
        try:
            await asyncio.wait_for(self._kick.wait(), timeout=max(0.0, seconds))
            return True
        except asyncio.TimeoutError:
            return False

    async def run(self) -> None:
        from .eventlog import record  # noqa: PLC0415
        s = self.demos.settings(self.tv[TV_ID])
        tv_id = self.tv[TV_ID]
        self.demos.mark_active(tv_id, True)
        try:
            await set_entity(self.hass, s["start_entity"], s["start_value"], start=True)
            if s["popup_start"]:
                await popup(self.hass, self.tv, s["popup_start"], "", s["popup_s"])
            while True:
                await self._clip(s)
                if self._jump is not None:
                    self.i, self._jump = self._jump, None
                    continue
                if self._key(self.i) not in self.played:
                    self.played.append(self._key(self.i))
                    self.demos.notify(tv_id)
                if self.mode == "one":
                    break
                nxt = self._step(self.i, 1, wrap=False)
                if nxt is None:
                    if self.mode != "loop":
                        break
                    nxt = self._step(-1, 1, wrap=False)
                    if nxt is None:
                        break
                    self.played = []   # a new round
                self._set("gap")
                self.ends_at = time.time() + float(s["gap_s"])
                if await self._wait(float(s["gap_s"])) and self._jump is not None:
                    self.i, self._jump = self._jump, None
                    continue
                self.i = nxt
            # after the last clip: paused on its last frame for a while, then stopped
            if s["end"] == "pause":
                self._set("ending")
                self.ends_at = time.time() + float(s["last_pause_s"])
                await self._wait(float(s["last_pause_s"]))
            from .play import control  # noqa: PLC0415
            await control(self.hass, self.tv, "stop")
        except asyncio.CancelledError:
            raise
        except Exception as err:  # noqa: BLE001 - in the log, and the session still ends
            record(self.hass, self.tv, "demo", err)
            _LOGGER.warning("Plex Center demo on %s stopped: %s", self.tv.get(TV_NAME), err)
        finally:
            self.done = True
            self.ends_at = None
            try:
                await set_entity(self.hass, s["stop_entity"] or s["start_entity"], s["stop_value"], start=False)
            except Exception as err:  # noqa: BLE001
                record(self.hass, self.tv, "demo: end of session", err)
            if s["popup_end"]:
                await popup(self.hass, self.tv, s["popup_end"], "", s["popup_s"])
            self.demos.mark_active(tv_id, False)
            self._set("idle")

    async def _clip(self, s: dict[str, Any]) -> bool:
        """Play the current clip from its start; pause / stop it just before its end. True when cut short."""
        from .eventlog import record  # noqa: PLC0415
        from .play import control, position, start  # noqa: PLC0415
        it = self.items[self.i]
        label = self.demos.label(it.get("key", ""), it.get("title", ""))
        self._set("starting")
        if s["popup_label"] or s["popup_number"]:
            title = label if s["popup_label"] else f"{self.i + 1} / {len(self.items)}"
            msg = f"{self.i + 1} / {len(self.items)}" if s["popup_label"] and s["popup_number"] else ""
            await popup(self.hass, self.tv, title, msg, s["popup_s"])
        await start(self.hass, self.tv, it, "restart")
        # playing: the TV's players report a position for it (up to 60 s: the room may be starting)
        key = str(it.get("key"))
        for _ in range(240):
            if self._jump is not None:
                return True
            st = self.tv.get(TV_PLEX) and self.hass.states.get(self.tv[TV_PLEX])
            mine = not st or str(st.attributes.get("media_content_id") or key) == key
            if mine and position(self.hass, self.tv) is not None and (not st or st.state in ("playing", "buffering")):
                break
            await asyncio.sleep(0.25)
        else:
            raise HomeAssistantError(f"{label} didn't start playing")
        dur = float(it.get("duration") or 0)
        if not dur and st:
            dur = float(st.attributes.get("media_duration") or 0)
        if not dur:
            raise HomeAssistantError(f"{label}: Plex didn't say how long it is")
        aim = max(0.5, dur - float(s["lead_s"]))
        self._set("playing")
        idle_since = None
        while True:
            if self._jump is not None:
                return True
            pos = position(self.hass, self.tv)
            self.ends_at = time.time() + max(0.0, aim - (pos or 0)) if pos is not None and self.state == "playing" else self.ends_at
            if pos is not None and pos >= aim:
                break
            st = self.tv.get(TV_PLEX) and self.hass.states.get(self.tv[TV_PLEX])
            if st and st.state in ("idle", "off", "unavailable"):   # it ended (or was stopped) before we got there
                idle_since = idle_since or time.time()
                if time.time() - idle_since > 4:
                    return False
            else:
                idle_since = None
            await asyncio.sleep(0.25)
        await control(self.hass, self.tv, "pause" if s["end"] == "pause" else "stop")
        self.last_timing = {"clip": self.i + 1, "at": round(pos, 1), "aim": round(aim, 1), "length": round(dur, 1)}
        record(self.hass, self.tv, "demo timing", f"clip {self.i + 1}: {s['end']}d at {pos:.1f} s, aimed for {aim:.1f} s of {dur:.1f} s",
               handled="timing note")
        self.ends_at = None
        return False
