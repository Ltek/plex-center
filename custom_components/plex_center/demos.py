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
INFO_SIGNAL = "plex_center_demos_info"   # a TV's collections changed (the sensor / select entities)
INFO_EVERY_S = 300                       # and they're asked again this often (changes made in Plex itself)
STALL_S = 12.0                           # a clip whose position doesn't move this long has stalled
ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")

DEFAULTS: dict[str, Any] = {
    "enabled": False,      # Demos on this TV (the card shows the Demos button)
    "library": "Demos",    # the library of clips
    "end": "pause",        # pause | stop: what happens just before a clip's end
    "lead_s": 3.0,         # how long before the end it's paused / stopped (keeps Plex's post-play screen away)
    "lead_auto": True,     # … plus how late this TV's pauses land, learned from each clip (see Demos.lag)
    "gap_s": 3,            # between clips
    "last_pause_s": 10,    # after the last clip: the session ends this long later (the clip stays paused on its last frame)
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
BOOLS = ("enabled", "popup_label", "popup_number", "lead_auto")
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
        out.append({"id": str(c.ratingKey), "title": c.title, "count": getattr(c, "childCount", None) or len(c.items()),
                    "summary": getattr(c, "summary", "") or ""})
    return out


_KINDS = ("movie", "clip", "episode")


def resolve(server, library: str, seq: str | None) -> tuple[str, list]:
    """A sequence's id ("all" or the collection's key) and its clips, in order. `seq` is "all" (or empty, or the
    library's own name, or "All of <library>": the whole library in Plex's order), or a collection's key or title."""
    sec = _section(server, library)
    s = str(seq or "").strip()
    if s.lower() in ("", "all", sec.title.lower(), f"all of {sec.title}".lower()):
        return "all", [i for i in sec.all() if getattr(i, "type", None) in _KINDS]
    for c in sec.collections():
        if str(c.ratingKey) == s or c.title == s or c.title.lower() == s.lower():
            return str(c.ratingKey), [i for i in c.items() if getattr(i, "type", None) in _KINDS]
    raise HomeAssistantError(f"{library} has no collection {seq}")


def clips(server, library: str, seq: str) -> list:
    """The clips of a sequence, in order (see resolve)."""
    return resolve(server, library, seq)[1]


def sequence_info(server, library: str) -> dict[str, Any]:
    """The library and its collections with their clips' running time (for the sensor / select entities)."""
    sec = _section(server, library)
    secs = lambda items: round(sum((getattr(i, "duration", None) or 0) for i in items) / 1000)  # noqa: E731
    every = [i for i in sec.all() if getattr(i, "type", None) in _KINDS]
    out = [{"id": "all", "title": f"All of {sec.title}", "clips": len(every), "seconds": secs(every), "description": ""}]
    for c in sec.collections():
        items = [i for i in c.items() if getattr(i, "type", None) in _KINDS]
        out.append({"id": str(c.ratingKey), "title": c.title, "clips": len(items), "seconds": secs(items),
                    "description": getattr(c, "summary", "") or ""})
    return {"library": sec.title, "sequences": out}


def collection_edit(server, library: str, op: str, data: dict[str, Any]) -> dict[str, Any]:
    """The Demo builder (as the server owner): create / add / remove / move / rename / describe / delete a collection.
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
        if data.get("summary"):
            col.editSummary(str(data["summary"]).strip()[:2000])
        return {"id": str(col.ratingKey)}
    col = next((c for c in sec.collections() if str(c.ratingKey) == str(data.get("collection"))), None)
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
    elif op == "describe":   # the collection's description (Plex's summary)
        col.editSummary(str(data.get("summary") or "").strip()[:2000])
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
        self.info: dict[str, dict[str, Any]] = {}   # tv → {library, sequences, at, error}: for the entities

    async def async_load(self, tvs: list[dict[str, Any]]) -> None:
        self.tvs = tvs
        self.data = {"tvs": {}, "labels": {}, "active": {}, "picked": {}, "lag": {}, **((await self._store.async_load()) or {})}
        if self.data.get("lag_v") != 2:   # learned before pauses went straight to the media keys (.167): too long
            self.data["lag"], self.data["lag_v"] = {}, 2
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
        if {"enabled", "library"} & set(changes):
            self.info.pop(tv_id, None)
            async_dispatcher_send(self.hass, INFO_SIGNAL, tv_id)
        return self.settings(tv_id)

    # ---- the collections for the entities (sensor, select)
    def enabled_tvs(self) -> list[dict[str, Any]]:
        return [t for t in self.tvs if self.settings(t.get(TV_ID))["enabled"]]

    async def async_refresh_info(self, tv_id: str) -> dict[str, Any]:
        """Ask Plex for the TV's collections (and their running time); the entities update."""
        tv = next((t for t in self.tvs if t.get(TV_ID) == tv_id), None)
        if tv is None:
            return {}
        lib = self.settings(tv_id)["library"]
        try:
            got = await self.conn.async_call(tv.get(TV_USER), lambda srv: sequence_info(srv, lib))
            self.info[tv_id] = {**got, "at": time.time(), "error": None}
        except Exception as err:  # noqa: BLE001 - shown on the sensor; the last list stays
            self.info[tv_id] = {**(self.info.get(tv_id) or {"library": lib, "sequences": []}), "at": time.time(), "error": str(err)}
        async_dispatcher_send(self.hass, INFO_SIGNAL, tv_id)
        return self.info[tv_id]

    def picked(self, tv_id: str) -> str | None:
        """The collection chosen in the TV's select entity (its title)."""
        titles = [x["title"] for x in (self.info.get(tv_id) or {}).get("sequences", [])]
        cur = (self.data.get("picked") or {}).get(tv_id)
        return cur if cur in titles else (titles[0] if titles else None)

    def set_picked(self, tv_id: str, title: str) -> None:
        self.data.setdefault("picked", {})[tv_id] = title
        self._save()
        async_dispatcher_send(self.hass, INFO_SIGNAL, tv_id)

    def over_ok(self, tv_id: str) -> bool:
        """Whether a clip can open over the paused one on this TV (False once that stalled)."""
        return (self.data.get("over") or {}).get(tv_id, True)

    def set_over_ok(self, tv_id: str, ok: bool) -> None:
        self.data.setdefault("over", {})[tv_id] = bool(ok)
        self._save()

    def lag(self, tv_id: str) -> float:
        """How late this TV's pauses land (s), learned from the clips played: added to the lead."""
        return float((self.data.get("lag") or {}).get(tv_id) or 0.0)

    def learn_lag(self, tv_id: str, late: float) -> float:
        """One measurement: where playback really stopped minus where the pause was sent (capped 0–5 s)."""
        late = max(0.0, min(5.0, late))
        old = (self.data.get("lag") or {}).get(tv_id)
        new = late if old is None else round(0.5 * float(old) + 0.5 * late, 2)
        self.data.setdefault("lag", {})[tv_id] = new
        self._save()
        return new

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

        seq, items = await self.conn.async_call(
            tv.get(TV_USER), lambda srv: (lambda r: (r[0], [item_dict(i) for i in r[1]]))(resolve(srv, s["library"], seq)))
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
        self._opened = 0   # clips started in this session
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
            # after the last clip: it stays paused on its last frame; the session ends after last_pause_s (no Back)
            if s["end"] == "pause":
                self._set("ending")
                self.ends_at = time.time() + float(s["last_pause_s"])
                await self._wait(float(s["last_pause_s"]))
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
        # Plex shows "Play from start" only for a partly watched title; a clip played to its end counts as
        # watched (only "Play"). So ask Plex where the clip is now, and start it the way its page allows.
        offset = it.get("offset")
        try:
            fresh = await self.demos.conn.async_call(self.tv.get(TV_USER), lambda srv: srv.fetchItem(int(it["key"])))
            offset = (getattr(fresh, "viewOffset", None) or 0) / 1000
        except Exception as err:  # noqa: BLE001 - keep what we had
            _LOGGER.debug("Demo: couldn't read %s's progress: %s", label, err)
        how = "restart" if offset and offset > 1 else "play"
        record(self.hass, self.tv, "demo start", f"clip {self.i + 1} ({label}): {'Play from start' if how == 'restart' else 'Play'}"
               f" (progress {offset or 0:.0f} s)", handled="timing note")
        # Between clips the last frame stays paused and the next clip opens over it (no Back) where the TV allows
        # that. Not for a session's first clip (whatever is on screen may be stuck), nor on a TV where opening over
        # the player has stalled before: then Back first.
        over = self._opened > 0 and self.demos.over_ok(self.tv[TV_ID])
        key = str(it.get("key"))
        for attempt in (0, 1):
            if attempt:
                record(self.hass, self.tv, "demo start", f"clip {self.i + 1} ({label}) stalled: starting it again, Back first",
                       handled="sent again")
            await start(self.hass, self.tv, {**it, "offset": offset or None}, how, back_first=not over)
            self._opened += 1
            got = await self._play_through(s, it, label, key, record, control, position, start)
            if got != "stalled":
                return got
            if over:   # opening over the paused player hung this TV: from now on, Back first
                self.demos.set_over_ok(self.tv[TV_ID], False)
                record(self.hass, self.tv, "demo start", "opening a clip over the paused one stalls on this TV: Back first from now on",
                       handled="learned")
            over = False
        record(self.hass, self.tv, "demo", f"clip {self.i + 1} ({label}) stalled twice: on to the next clip")
        return False

    async def _play_through(self, s, it, label, key, record, control, position, start):
        """Wait for the clip to play, then pause / stop it just before its end. True (cut short), False (done), or
        "stalled": its position stopped moving (a still frame with Plex's loading circle)."""
        # playing: the TV's players report a position for it (up to 60 s: the room may be starting)
        for n in range(240):
            if self._jump is not None:
                return True
            st = self.tv.get(TV_PLEX) and self.hass.states.get(self.tv[TV_PLEX])
            if n == 80 and not (st and str(st.attributes.get("media_content_id") or "") == key and st.state in ("playing", "buffering")):
                # 20 s and not playing: start it once more, with Play (from where Plex has it: a demo clip that
                # isn't partly watched starts at its beginning)
                record(self.hass, self.tv, "demo start", f"clip {self.i + 1} ({label}) not playing after 20 s: starting it again with Play",
                       handled="sent again")
                try:
                    await start(self.hass, self.tv, {**it, "offset": None}, "play")
                except HomeAssistantError as err:
                    record(self.hass, self.tv, "demo start (again)", err)
            if n in (40, 120):   # 10 s and 30 s: say what the TV reports, so a start that doesn't take can be traced
                record(self.hass, self.tv, "demo start", f"clip {self.i + 1} not playing after {n // 4} s: Plex player "
                       f"{(st.state + ' ' + str(st.attributes.get('media_content_id') or '-')) if st else 'none'}, position "
                       f"{position(self.hass, self.tv)}, waiting for {key}", handled="timing note")
            mine = not st or str(st.attributes.get("media_content_id") or key) == key
            if mine and position(self.hass, self.tv) is not None and (not st or st.state == "playing"):
                break
            await asyncio.sleep(0.25)
        else:
            raise HomeAssistantError(f"{label} didn't start playing")
        dur = float(it.get("duration") or 0)
        if not dur and st:
            dur = float(st.attributes.get("media_duration") or 0)
        if not dur:
            raise HomeAssistantError(f"{label}: Plex didn't say how long it is")
        lag = self.demos.lag(self.tv[TV_ID]) if s.get("lead_auto", True) else 0.0
        aim = max(0.5, dur - float(s["lead_s"]) - lag)
        self._set("playing")
        idle_since = None
        moved_pos, moved_at = None, time.time()
        while True:
            if self._jump is not None:
                return True
            pos = position(self.hass, self.tv)
            # stalled: the position hasn't moved for STALL_S while we wait for the end (a paused demo doesn't count)
            if pos is not None and (moved_pos is None or abs(pos - moved_pos) > 0.5):
                moved_pos, moved_at = pos, time.time()
            if self.state == "paused":
                moved_at = time.time()
            elif time.time() - moved_at > STALL_S:
                st = self.tv.get(TV_PLEX) and self.hass.states.get(self.tv[TV_PLEX])
                record(self.hass, self.tv, "demo", f"clip {self.i + 1} ({label}) stalled at {moved_pos} s for {STALL_S:g} s "
                       f"(Plex player {st.state if st else 'none'})")
                return "stalled"
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
        sent_at = time.time()
        await control(self.hass, self.tv, "pause" if s["end"] == "pause" else "stop")
        self.last_timing = {"clip": self.i + 1, "at": round(pos, 1), "aim": round(aim, 1), "length": round(dur, 1),
                            "lead": round(float(s["lead_s"]) + lag, 1), "ended": None, "result": "checking"}
        record(self.hass, self.tv, "demo timing", f"clip {self.i + 1}: {s['end']} sent at {pos:.1f} s (aimed {aim:.1f} s of {dur:.1f} s, "
               f"lead {float(s['lead_s']):g} s + learned {lag:g} s)", handled="timing note")
        if s["end"] == "pause":
            self.hass.async_create_background_task(self._check_end(dict(self.last_timing), key, pos, sent_at, dur, s),
                                                   f"plex_center demo end check {self.tv[TV_ID]}")
        else:
            self.last_timing["result"] = "stopped"
        self.ends_at = None
        return False

    async def _check_end(self, timing: dict[str, Any], key: str, sent_pos: float, sent_at: float, dur: float, s: dict[str, Any]) -> None:
        """Where playback really ended after the pause: the Plex player's next report (it reports every few seconds).
        paused: at what position, and how late that was; ran out: the clip reached its end first (a miss)."""
        from .eventlog import record  # noqa: PLC0415
        ent = self.tv.get(TV_PLEX)
        if not ent:
            return
        first = self.hass.states.get(ent)
        first_at = first and first.attributes.get("media_position_updated_at")
        result, ended = "unknown", None
        for _ in range(40):   # up to 10 s
            await asyncio.sleep(0.25)
            st = self.hass.states.get(ent)
            if not st:
                continue
            if st.state in ("idle", "off", "unavailable") or str(st.attributes.get("media_content_id") or key) != key:
                result = "ran out"
                break
            if st.state == "paused" and st.attributes.get("media_position") is not None \
                    and (st.attributes.get("media_position_updated_at") != first_at or time.time() - sent_at > 3):
                ended, result = float(st.attributes["media_position"]), "paused"
                break
        if self.last_timing and self.last_timing.get("clip") == timing["clip"] and self.last_timing.get("result") == "checking":
            self.last_timing.update(ended=None if ended is None else round(ended, 1), result=result)
            self.demos.notify(self.tv[TV_ID])
        learned = None
        if s.get("lead_auto", True):
            if result == "paused" and ended is not None:
                learned = self.demos.learn_lag(self.tv[TV_ID], ended - sent_pos)
            elif result == "ran out":
                learned = self.demos.learn_lag(self.tv[TV_ID], self.demos.lag(self.tv[TV_ID]) + 1.5)   # it was too late: 1.5 s more
        where = f"paused at {ended:.1f} s ({ended - sent_pos:+.1f} s after the pause was sent, {dur - ended:.1f} s before the end)" \
            if ended is not None else ("ran out to its end: the pause came too late" if result == "ran out" else "the TV didn't say")
        record(self.hass, self.tv, "demo timing", f"clip {timing['clip']}: {where}" + (f"; learned lead now +{learned:g} s" if learned is not None else ""),
               handled="timing note")
