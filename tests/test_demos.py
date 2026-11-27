"""Demos: settings, the session entity, sequences, and a run (each clip paused before its end, then the next)."""

import asyncio
from types import SimpleNamespace as NS
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.plex_center import demos as dm


def _fake(fn):
    """A service handler that runs on the event loop, in call order (a plain function would run on a worker thread)."""
    async def handler(call):
        fn(call)
    return handler

TV = {"id": "th", "name": "Theater", "plex_client": "media_player.plex_th", "adb": "media_player.th_adb", "plex_user": ""}


def clip(key, title, secs=10):
    return NS(ratingKey=key, type="movie", title=title, duration=secs * 1000, viewOffset=None, viewCount=0, addedAt=None,
              _server=NS(machineIdentifier="abc"))


A, B, C = clip(1, "Gravity - Opening"), clip(2, "Dune - Worm"), clip(3, "Top Gun - Jets")
COL = NS(ratingKey=50, title="Atmos showcase", childCount=2, items=lambda: [B, A])
SEC = NS(title="Demos", key=9, totalSize=3, all=lambda: [A, B, C], collections=lambda: [COL])
SERVER = NS(library=NS(sections=lambda: [SEC]))


def test_settings_checked() -> None:
    s = dm.check_settings({}, {"end": "stop", "gap_s": "5", "start_entity": "input_boolean.lights_bypass", "enabled": True})
    assert s == {"end": "stop", "gap_s": 5.0, "start_entity": "input_boolean.lights_bypass", "enabled": True}
    assert dm.check_settings(s, {"end": "pause", "gap_s": ""}) == {"start_entity": "input_boolean.lights_bypass", "enabled": True}, "defaults drop"
    for bad in ({"end": "x"}, {"gap_s": 999}, {"start_entity": "nope; rm"}, {"what": 1}):
        with pytest.raises(ValueError):
            dm.check_settings({}, bad)


def test_sequences_and_clips() -> None:
    assert dm.sequences(SERVER, "Demos") == [{"id": "all", "title": "All of Demos", "count": 3}, {"id": "50", "title": "Atmos showcase", "count": 2}]
    assert [c.title for c in dm.clips(SERVER, "Demos", "all")] == ["Gravity - Opening", "Dune - Worm", "Top Gun - Jets"]
    assert [c.title for c in dm.clips(SERVER, "Demos", "Atmos showcase")] == ["Dune - Worm", "Gravity - Opening"], "the collection's order"
    with pytest.raises(Exception):
        dm.clips(SERVER, "Nope", "all")


async def test_set_entity_by_kind(hass: HomeAssistant) -> None:
    got = []
    for dom, svc in [("homeassistant", "turn_on"), ("homeassistant", "turn_off"), ("script", "turn_on"), ("input_select", "select_option"),
                     ("input_number", "set_value")]:
        hass.services.async_register(dom, svc, _fake(lambda call, d=dom, s=svc: got.append((d, s, dict(call.data)))))
    await dm.set_entity(hass, "input_boolean.bypass", "", start=True)
    await dm.set_entity(hass, "input_boolean.bypass", "", start=False)
    await dm.set_entity(hass, "script.demo_lights", "", start=True)
    await dm.set_entity(hass, "input_select.mode", "Demo", start=True)
    await dm.set_entity(hass, "input_number.level", "30", start=True)
    await hass.async_block_till_done()
    assert [(d, s) for d, s, _ in got] == [("homeassistant", "turn_on"), ("homeassistant", "turn_off"), ("script", "turn_on"),
                                           ("input_select", "select_option"), ("input_number", "set_value")]
    assert got[3][2]["option"] == "Demo" and got[4][2]["value"] == 30.0


class FakeConn:
    async def async_call(self, user, fn):
        return fn(SERVER)


async def _run(hass, settings, mode="all", start=1, act=None):
    """A demo with fake playback: each start() plays from 0, each position() read moves 1 s on."""
    events, pos = [], {"v": None, "key": None}

    async def fake_start(h, tv, item, mode="play", **kw):
        events.append(("play", item["title"]))
        pos.update(v=0.0, key=item["key"])
        hass.states.async_set("media_player.plex_th", "playing", {"media_content_id": item["key"], "media_duration": 10})

    def fake_position(h, tv):
        if pos["v"] is None:
            return None
        pos["v"] += 1.0
        return pos["v"]

    async def fake_control(h, tv, action, value=None):
        events.append(("control", action))

    for dom, svc in [("homeassistant", "turn_on"), ("homeassistant", "turn_off"), ("pipup", "show")]:
        hass.services.async_register(dom, svc, _fake(lambda call, d=dom, s=svc: events.append((d, s, call.data.get("title") or call.data.get("entity_id")))))
    d = dm.Demos(hass, "e1", FakeConn())
    await d.async_load([TV])
    d.data["tvs"]["th"] = dm.check_settings({}, {"enabled": True, "gap_s": 0, "last_pause_s": 0, **settings})
    real = asyncio.sleep

    async def fast(_s):
        await real(0)
    with patch("custom_components.plex_center.play.start", fake_start), patch("custom_components.plex_center.play.position", fake_position), \
            patch("custom_components.plex_center.play.control", fake_control), patch("custom_components.plex_center.demos.asyncio.sleep", fast), \
            patch("custom_components.plex_center.demos._popup_target", lambda h, tv: "binary_sensor.th_popup"):
        await d.async_play(TV, "all", start, mode)
        if act:
            await act(d)
        r = d.runs["th"]
        await asyncio.wait_for(r.task, 5)
    await hass.async_block_till_done()
    return events, d


async def test_a_whole_run(hass: HomeAssistant) -> None:
    events, d = await _run(hass, {"start_entity": "input_boolean.bypass", "popup_label": True, "popup_number": True,
                                  "popup_start": "Atmos demo", "popup_end": "That's all"})
    plays = [e[1] for e in events if e[0] == "play"]
    assert plays == ["Gravity - Opening", "Dune - Worm", "Top Gun - Jets"]
    assert [e[1] for e in events if e[0] == "control"] == ["pause", "pause", "pause", "stop"], "each clip paused before its end; stopped after the last"
    assert ("homeassistant", "turn_on", "input_boolean.bypass") in events and events[-2:][-1][:2] in (("homeassistant", "turn_off"), ("pipup", "show"))
    on = events.index(("homeassistant", "turn_on", "input_boolean.bypass"))
    off = next(i for i, e in enumerate(events) if e[:2] == ("homeassistant", "turn_off"))
    assert on < events.index(("play", "Gravity - Opening")) and off > events.index(("play", "Top Gun - Jets")), "the session entity wraps the demo"
    pops = [e[2] for e in events if e[:2] == ("pipup", "show")]
    assert pops[0] == "Atmos demo" and "Gravity - Opening" in pops and pops[-1] == "That's all"
    assert d.status("th")["state"] == "idle" and not d.data["active"]
    t = d.runs["th"].last_timing
    assert t["clip"] == 3 and t["aim"] == 9.0 and t["at"] >= 9.0


async def test_one_clip_and_stop_mode(hass: HomeAssistant) -> None:
    events, _d = await _run(hass, {"end": "stop"}, mode="one", start=2)
    assert [e[1] for e in events if e[0] == "play"] == ["Dune - Worm"]
    assert [e[1] for e in events if e[0] == "control"] == ["stop", "stop"]


async def test_restart_mid_demo_ends_the_session(hass: HomeAssistant) -> None:
    got = []
    hass.services.async_register("homeassistant", "turn_off", _fake(lambda call: got.append(call.data["entity_id"])))
    d = dm.Demos(hass, "e2", FakeConn())
    await d.async_load([TV])
    d.data["tvs"]["th"] = {"enabled": True, "start_entity": "input_boolean.bypass"}
    d.data["active"] = {"th": True}
    await d._store.async_save(d.data)
    d2 = dm.Demos(hass, "e2", FakeConn())
    await d2.async_load([TV])
    await hass.async_block_till_done()
    assert got == ["input_boolean.bypass"] and d2.data["active"] == {}
    assert d2.demo_libraries() == {"Demos"}


async def test_status_action(hass: HomeAssistant) -> None:
    from custom_components.plex_center import services
    d = dm.Demos(hass, "e3", FakeConn())
    await d.async_load([TV])
    entry = NS(runtime_data=NS(demos=d))
    with patch.object(services, "find_tv", lambda h, name: (entry, TV)):
        services.async_register(hass)
        r = await hass.services.async_call("plex_center", "demo_status", {"tv": "Theater"}, blocking=True, return_response=True)
    assert r == {"state": "idle"}
