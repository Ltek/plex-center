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
    assert dm.sequences(SERVER, "Demos") == [{"id": "all", "title": "All of Demos", "count": 3}, {"id": "50", "title": "Atmos showcase", "count": 2, "summary": ""}]
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


async def _run(hass, settings, mode="all", start=1, act=None, skip=None):
    """A demo with fake playback: each start() plays from 0, each position() read moves 1 s on."""
    events, pos = [], {"v": None, "key": None}

    async def fake_start(h, tv, item, mode="play", **kw):
        assert kw.get("back_first") is False, "a demo opens each clip over the paused one, no Back first"
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
        await d.async_play(TV, "all", start, mode, skip)
        if act:
            await act(d)
        r = d.runs["th"]
        await asyncio.wait_for(r.task, 5)
    await hass.async_block_till_done()
    return events, d


async def test_a_whole_run(hass: HomeAssistant) -> None:
    events, d = await _run(hass, {"lead_auto": False, "lead_s": 1, "start_entity": "input_boolean.bypass", "popup_label": True, "popup_number": True,
                                  "popup_start": "Atmos demo", "popup_end": "That's all"})
    plays = [e[1] for e in events if e[0] == "play"]
    assert plays == ["Gravity - Opening", "Dune - Worm", "Top Gun - Jets"]
    assert [e[1] for e in events if e[0] == "control"] == ["pause", "pause", "pause"], "each clip paused before its end; the last stays paused (no Back at the end)"
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
    assert [e[1] for e in events if e[0] == "control"] == ["stop"]


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


async def test_clips_left_out(hass: HomeAssistant) -> None:
    events, d = await _run(hass, {}, skip=["2"])
    assert [e[1] for e in events if e[0] == "play"] == ["Gravity - Opening", "Top Gun - Jets"], "clip 2 left out from the start"
    assert d.runs["th"].played == ["1", "3"] and d.runs["th"].skip == {"2"}
    with pytest.raises(Exception):
        await d.async_play(TV, "all", 1, "all", ["1", "2", "3"])


async def test_left_out_while_running(hass: HomeAssistant) -> None:
    async def act(d):
        await d.async_control(TV, "skip:3")     # the last clip: left out on the fly
        st = d.status("th")
        assert st["skip"] == ["3"] and st["index"] == 1
    events, d = await _run(hass, {}, act=act)
    assert [e[1] for e in events if e[0] == "play"] == ["Gravity - Opening", "Dune - Worm"]


async def test_leaving_out_the_current_clip_moves_on(hass: HomeAssistant) -> None:
    async def act(d):
        await asyncio.sleep(0)
        await d.async_control(TV, "skip:1")
    events, _d = await _run(hass, {}, act=act)
    plays = [e[1] for e in events if e[0] == "play"]
    assert plays[-2:] == ["Dune - Worm", "Top Gun - Jets"] and plays.count("Gravity - Opening") <= 1


async def test_order_at_start_and_while_running(hass: HomeAssistant) -> None:
    async def act(d):
        st = d.status("th")
        assert st["keys"] == ["3", "2", "1"] and st["key"] == "3", "the order given at the start"
        await d.async_control(TV, "move:1:3")   # while clip 3 plays: clip 1 up next
        st = d.status("th")
        assert st["keys"] == ["3", "1", "2"] and st["index"] == 1 and st["key"] == "3"
    real = dm.Demos.async_play

    async def ordered(self, tv, seq="all", start=1, mode="all", skip=None, order=None):
        return await real(self, tv, seq, start, mode, skip, ["3", "2"])
    with patch.object(dm.Demos, "async_play", ordered):
        events, _d = await _run(hass, {}, act=act)
    assert [e[1] for e in events if e[0] == "play"] == ["Top Gun - Jets", "Gravity - Opening", "Dune - Worm"]


def test_collection_description() -> None:
    said = []
    col = NS(ratingKey=50, title="Atmos showcase", childCount=2, summary="Loud ones", items=lambda: [B, A],
             editSummary=lambda s: said.append(s))
    sec = NS(title="Demos", key=9, totalSize=3, all=lambda: [A, B, C], collections=lambda: [col])
    server = NS(library=NS(sections=lambda: [sec]))
    assert dm.sequences(server, "Demos")[1]["summary"] == "Loud ones"
    assert dm.collection_edit(server, "Demos", "describe", {"collection": "50", "summary": "  For the Atmos demo  "}) == {"id": "50"}
    assert said == ["For the Atmos demo"]


async def test_room_power_action(hass: HomeAssistant) -> None:
    from custom_components.plex_center import services
    got = []
    hass.services.async_register("homeassistant", "turn_on", _fake(lambda call: got.append(("on", call.data["entity_id"]))))
    hass.services.async_register("homeassistant", "turn_off", _fake(lambda call: got.append(("off", call.data["entity_id"]))))
    hass.states.async_set("input_boolean.theater", "off")
    tv = {**TV, "power_entity": "input_boolean.theater"}
    with patch.object(services, "find_tv", lambda h, name: (None, tv)):
        services.async_register(hass)
        await hass.services.async_call("plex_center", "room_power", {"tv": "Theater", "on": True}, blocking=True)
        await hass.services.async_call("plex_center", "room_power", {"tv": "Theater", "on": False}, blocking=True)
    assert got == [("on", "input_boolean.theater"), ("off", "input_boolean.theater")]


async def test_demo_sequences_action(hass: HomeAssistant) -> None:
    from custom_components.plex_center import services
    d = dm.Demos(hass, "e4", FakeConn())
    await d.async_load([TV])
    entry = NS(runtime_data=NS(demos=d, conn=FakeConn()))
    with patch.object(services, "find_tv", lambda h, name: (entry, TV)):
        services.async_register(hass)
        r = await hass.services.async_call("plex_center", "demo_sequences", {"tv": "Theater"}, blocking=True, return_response=True)
    assert r["library"] == "Demos" and r["titles"] == ["All of Demos", "Atmos showcase"] and r["sequences"][1]["count"] == 2


async def test_each_clip_starts_the_way_its_page_allows(hass: HomeAssistant) -> None:
    modes = []
    fresh = {1: 0, 2: 42000, 3: 0}   # clip 2 is partly watched: Play from start; the others only have Play
    SERVER.fetchItem = lambda k: NS(viewOffset=fresh[k])
    real = dm.Runner._clip

    async def spy(self, s):
        from custom_components.plex_center import play as pl
        orig = pl.start

        async def rec(h, tv, item, mode="play", **kw):
            modes.append(mode)
            return await orig(h, tv, item, mode, **kw)
        with patch.object(pl, "start", rec):
            return await real(self, s)
    try:
        with patch.object(dm.Runner, "_clip", spy):
            await _run(hass, {})
    finally:
        del SERVER.fetchItem
    assert modes == ["play", "restart", "play"]



async def test_the_lead_learns_how_late_pauses_land(hass: HomeAssistant) -> None:
    d = dm.Demos(hass, "e5", FakeConn())
    await d.async_load([TV])
    assert dm.DEFAULTS["lead_s"] == 3.0 and d.lag("th") == 0.0
    assert d.learn_lag("th", 2.0) == 2.0 and d.learn_lag("th", 1.0) == 1.5
    assert d.learn_lag("th", 30) == 3.25, "capped at 5 s a measurement"


def test_sequences_by_title() -> None:
    assert dm.resolve(SERVER, "Demos", "All of Demos")[0] == "all"
    assert dm.resolve(SERVER, "Demos", "atmos showcase")[0] == "50"
    info = dm.sequence_info(SERVER, "Demos")
    assert [x["title"] for x in info["sequences"]] == ["All of Demos", "Atmos showcase"] and info["sequences"][1]["seconds"] == 20
