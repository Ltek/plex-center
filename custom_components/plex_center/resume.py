"""Resume where you left off: what was playing when a TV was turned off.

The TVs close their apps in standby, so Plex's paused session can't be continued with Play. While a TV is
on, the latest playback of each TV is kept in memory; when the TV goes off with something playing or
paused, it is saved (Home Assistant storage, so it survives restarts). It is forgotten when something
plays on that TV again, when it's dismissed, when the episode is marked watched, or after MAX_AGE.
"""

from __future__ import annotations

from datetime import timedelta
import re
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import TV_ADB, TV_ID, TV_PIPUP, TV_PLEX, TV_REMOTE
from .tvs import real_playback, tv_on

MAX_AGE = timedelta(hours=48)      # the card can forget sooner (its own setting)
PACKAGE = re.compile(r"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$")


def _position(st) -> float | None:
    """The position now: Plex / PiPup report it with the time it was taken."""
    pos = st.attributes.get("media_position")
    if pos is None:
        return None
    try:
        pos = float(pos)
    except (TypeError, ValueError):
        return None
    at = dt_util.parse_datetime(str(st.attributes.get("media_position_updated_at") or ""))
    if st.state == "playing" and at:
        pos += max(0.0, (dt_util.utcnow() - at).total_seconds())
    return round(pos)


def snapshot(hass: HomeAssistant, tv: dict[str, Any]) -> dict[str, Any] | None:
    """What plays on the TV right now (Plex first, else another app), or None."""
    plex = tv.get(TV_PLEX) and hass.states.get(tv[TV_PLEX])
    if real_playback(plex) and str(plex.attributes.get("media_content_id") or "").isdigit():
        a = plex.attributes
        series = a.get("media_series_title")
        return {"kind": "plex", "key": str(a["media_content_id"]), "type": "episode" if series else "movie",
                "title": a.get("media_title"), "show": series, "season": a.get("media_season"), "episode": a.get("media_episode"),
                "duration": a.get("media_duration"), "position": _position(plex), "state": plex.state}
    for ent in (tv.get(TV_PIPUP), tv.get(TV_ADB)):
        st = ent and hass.states.get(ent)
        if not real_playback(st):
            continue
        a = st.attributes
        app = a.get("app_name") or ""
        if "plex" in app.lower():
            continue   # Plex without a Plex player: nothing to resume from
        adb = tv.get(TV_ADB) and hass.states.get(tv[TV_ADB])
        app_id = a.get("app_id") or (adb and adb.attributes.get("app_id")) or ""
        return {"kind": "app", "app": app, "app_id": app_id if PACKAGE.match(str(app_id)) else "",
                "title": a.get("media_title"), "duration": a.get("media_duration"), "position": _position(st), "state": st.state}
    return None


def _same(a: dict[str, Any] | None, b: dict[str, Any] | None) -> bool:
    if not a or not b or a["kind"] != b["kind"]:
        return False
    return a.get("key") == b.get("key") if a["kind"] == "plex" else (a.get("app"), a.get("title")) == (b.get("app"), b.get("title"))


class Resumes:
    """The saved 'resume' records of one Plex Center entry: {tv_id: record}."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self.hass = hass
        self._store: Store = Store(hass, 1, f"plex_center.resume.{entry_id}")
        self.data: dict[str, dict[str, Any]] = {}
        self._last: dict[str, dict[str, Any] | None] = {}
        self._unsub = None
        self._tvs: list[dict[str, Any]] = []

    async def async_load(self) -> None:
        self.data = (await self._store.async_load()) or {}
        self._prune()

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1)

    def _prune(self) -> bool:
        now, gone = dt_util.utcnow(), []
        for tv_id, rec in self.data.items():
            at = dt_util.parse_datetime(rec.get("at") or "")
            if not at or now - at > MAX_AGE:
                gone.append(tv_id)
        for tv_id in gone:
            self.data.pop(tv_id, None)
        return bool(gone)

    @callback
    def track(self, tvs: list[dict[str, Any]]) -> None:
        """Watch the TVs' players (again, after the TV list changed)."""
        self.stop()
        self._tvs = list(tvs)
        ents = [e for tv in self._tvs for e in (tv.get(TV_PIPUP), tv.get(TV_ADB), tv.get(TV_REMOTE), tv.get(TV_PLEX)) if e]
        for tv in self._tvs:
            self._observe(tv)
        if ents:
            self._unsub = async_track_state_change_event(self.hass, ents, self._changed)

    @callback
    def stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def _changed(self, event: Event) -> None:
        ent = event.data.get("entity_id")
        for tv in self._tvs:
            if ent in (tv.get(TV_PIPUP), tv.get(TV_ADB), tv.get(TV_REMOTE), tv.get(TV_PLEX)):
                self._observe(tv)

    @callback
    def _observe(self, tv: dict[str, Any]) -> None:
        tv_id, on = tv[TV_ID], tv_on(self.hass, tv)
        if on is None:
            return     # only a Plex player: can't tell whether the TV is off
        snap = snapshot(self.hass, tv) if on else None
        if on:
            rec = self.data.get(tv_id)
            # something new plays (or it really plays again): the saved record is done. The stale paused Plex
            # session of the same title, seen right after waking, is not.
            if rec and snap and (snap["state"] == "playing" or not _same(snap, rec)):
                self.forget(tv_id)
            self._last[tv_id] = snap
            return
        last = self._last.get(tv_id)
        if last and tv_id not in self.data:
            self.data[tv_id] = {**last, "tv": tv_id, "at": dt_util.utcnow().isoformat()}
            self._save()
        self._last[tv_id] = None

    def get(self, tv_id: str) -> dict[str, Any] | None:
        if self._prune():
            self._save()
        return self.data.get(tv_id)

    def all(self) -> dict[str, dict[str, Any]]:
        if self._prune():
            self._save()
        return dict(self.data)

    @callback
    def forget(self, tv_id: str) -> None:
        if self.data.pop(tv_id, None) is not None:
            self._save()

    @callback
    def forget_key(self, key: str) -> None:
        """An episode / movie marked watched: nothing to resume."""
        for tv_id in [t for t, r in self.data.items() if r.get("key") == str(key)]:
            self.forget(tv_id)

