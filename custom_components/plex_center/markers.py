"""Plex markers of what plays on each TV: intros and credits.

* The card shows Skip intro / Skip credits from them, and Up next once the credits start.
* When the final credits start on a TV, Home Assistant gets a ``plex_center_credits_started`` event (TV, title,
  user), and the TV's "At the credits" scene or script runs (its setting, optional): the theater's lights come up.

Markers are read once per item (``includeMarkers``) and cached. The position is worked out from the Plex player's
``media_position`` and when it was reported, checked once a second while something with credits plays: Plex isn't
polled. The event fires when the position crosses the start of the credits, so a title resumed inside its credits
doesn't fire it.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import timedelta
import logging
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval

from .const import DOMAIN, TV_CREDITS, TV_ID, TV_NAME, TV_PLEX, TV_USER

_LOGGER = logging.getLogger(__name__)
EVENT_CREDITS = f"{DOMAIN}_credits_started"
CACHE_SIZE = 256
TICK = timedelta(seconds=1)
CREDIT_DOMAINS = ("scene", "script")


def _secs(ms: Any) -> int | None:
    try:
        return int(int(ms) / 1000)
    except (TypeError, ValueError):
        return None


def parse_markers(item: Any) -> dict[str, Any]:
    """{intro: [start, end] | None, credits: [start, end] | None} in seconds, from a plexapi item with markers.

    Credits: the final credits (Plex marks them ``final``), else the last credits marker.
    """
    intro = credits = final = None
    for m in getattr(item, "markers", None) or []:
        kind = getattr(m, "type", None)
        span = [_secs(getattr(m, "start", None)), _secs(getattr(m, "end", None))]
        if None in span or span[1] <= span[0]:
            continue
        if kind == "intro" and intro is None:
            intro = span
        elif kind == "credits":
            credits = span if credits is None or span[0] > credits[0] else credits
            if getattr(m, "final", False):
                final = span
    return {"intro": intro, "credits": final or credits}


def _playing_key(st) -> str | None:
    if st is None or st.state != "playing":
        return None
    key = str(st.attributes.get("media_content_id") or "")
    return key if key.isdigit() else None


class Markers:
    """The markers of one Plex Center entry's TVs, and the credits event."""

    def __init__(self, hass: HomeAssistant, conn: Any) -> None:
        self.hass = hass
        self.conn = conn
        self.cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._pending: set[str] = set()
        self._tvs: list[dict[str, Any]] = []
        self._last: dict[str, tuple[str, float]] = {}   # tv id: (key, position at the last check)
        self._fired: dict[str, str] = {}                # tv id: key the event fired for
        self._unsubs: list[Any] = []

    @callback
    def track(self, tvs: list[dict[str, Any]]) -> None:
        """Watch the TVs' Plex players (again, after the TV list changed)."""
        self.stop()
        self._tvs = [tv for tv in tvs if tv.get(TV_PLEX)]
        ents = [tv[TV_PLEX] for tv in self._tvs]
        if not ents:
            return
        self._unsubs.append(async_track_state_change_event(self.hass, ents, self._changed))
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, TICK))
        for tv in self._tvs:
            self._want(tv)

    @callback
    def stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs = []

    def get(self, key: str | None) -> dict[str, Any] | None:
        return self.cache.get(str(key)) if key else None

    async def async_get(self, tv: dict[str, Any], key: str) -> dict[str, Any]:
        """The item's markers (fetched once, then cached)."""
        key = str(key)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]

        def fetch(server):
            item = server.fetchItem(int(key))
            item.reload(includeMarkers=True)
            return parse_markers(item)

        try:
            found = await self.conn.async_call(tv.get(TV_USER), fetch)
        except Exception as err:  # noqa: BLE001 - no markers: no Skip buttons, no event
            _LOGGER.debug("Plex Center: no markers for %s: %s", key, err)
            found = {"intro": None, "credits": None}
        self.cache[key] = found
        while len(self.cache) > CACHE_SIZE:
            self.cache.popitem(last=False)
        return found

    @callback
    def _changed(self, event: Event) -> None:
        ent = event.data.get("entity_id")
        for tv in self._tvs:
            if tv[TV_PLEX] == ent:
                self._want(tv)

    @callback
    def _want(self, tv: dict[str, Any]) -> None:
        key = _playing_key(self.hass.states.get(tv[TV_PLEX]))
        if key and key not in self.cache and key not in self._pending:
            self._pending.add(key)

            async def load() -> None:
                try:
                    await self.async_get(tv, key)
                finally:
                    self._pending.discard(key)
            self.hass.async_create_task(load())

    @callback
    def _tick(self, _now=None) -> None:
        from .resume import _position  # noqa: PLC0415

        for tv in self._tvs:
            st = self.hass.states.get(tv[TV_PLEX])
            key = _playing_key(st)
            mk = self.cache.get(key or "")
            if not key or not mk or not mk.get("credits"):
                continue
            pos = _position(st)
            if pos is None:
                continue
            prev = self._last.get(tv[TV_ID])
            self._last[tv[TV_ID]] = (key, pos)
            start = mk["credits"][0]
            crossed = prev is not None and prev[0] == key and prev[1] < start <= pos
            if crossed and self._fired.get(tv[TV_ID]) != key:
                self._fired[tv[TV_ID]] = key
                self.hass.async_create_task(self._credits(tv, st, key, mk))

    async def _credits(self, tv: dict[str, Any], st, key: str, mk: dict[str, Any]) -> None:
        a = st.attributes
        self.hass.bus.async_fire(EVENT_CREDITS, {
            "tv": tv[TV_ID], "tv_name": tv.get(TV_NAME), "key": key, "title": a.get("media_title"),
            "show": a.get("media_series_title"), "user": tv.get(TV_USER) or "", "credits_start": mk["credits"][0],
            "credits_end": mk["credits"][1]})
        _LOGGER.info("Plex Center: credits started on %s (%s)", tv.get(TV_NAME), a.get("media_title"))
        ent = tv.get(TV_CREDITS)
        if not ent or ent.split(".", 1)[0] not in CREDIT_DOMAINS:
            return
        try:
            await self.hass.services.async_call(ent.split(".", 1)[0], "turn_on", {"entity_id": ent}, blocking=False)
        except Exception as err:  # noqa: BLE001 - say so in Plex Center's log
            from .eventlog import record  # noqa: PLC0415

            record(self.hass, tv, "credits scene", err)
