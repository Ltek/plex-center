"""The room hook: a power entity Plex Center sets, and a status entity it waits for, before playing."""

import asyncio

import pytest

from homeassistant.exceptions import HomeAssistantError

from custom_components.plex_center import play
from custom_components.plex_center.tvs import tv_on

TV = {"id": "th", "name": "Theater", "adb": "media_player.theater_shield", "power_entity": "input_boolean.theater",
      "status_entity": "binary_sensor.theater_ready", "ready_wait": 5}


def _svc(hass, domain, service, log, then=None):
    async def handler(call):
        log.append((domain, service, dict(call.data)))
        if then:
            then(call)
    hass.services.async_register(domain, service, handler)


async def test_turns_the_room_on_and_waits(hass):
    log = []
    hass.states.async_set("media_player.theater_shield", "off")
    hass.states.async_set("input_boolean.theater", "off")
    hass.states.async_set("binary_sensor.theater_ready", "off")

    def room_on(call):
        hass.states.async_set("input_boolean.theater", "on")
        hass.loop.call_later(0.05, lambda: hass.states.async_set("binary_sensor.theater_ready", "on"))
    _svc(hass, "homeassistant", "turn_on", log, room_on)
    assert tv_on(hass, TV) is False
    await play.ensure_ready(hass, TV, poll=0.02)
    assert log[0][:2] == ("homeassistant", "turn_on") and log[0][2]["entity_id"] == "input_boolean.theater"
    assert tv_on(hass, TV) is True, "ready counts as on"
    log.clear()
    await play.ensure_ready(hass, TV, poll=0.02)
    assert log == [], "already ready: nothing sent"


async def test_not_ready_in_time(hass):
    hass.states.async_set("input_boolean.theater", "off")
    hass.states.async_set("binary_sensor.theater_ready", "off")
    _svc(hass, "homeassistant", "turn_on", [])
    with pytest.raises(HomeAssistantError, match="isn't ready"):
        await play.ensure_ready(hass, {**TV, "ready_wait": 0.1}, poll=0.02)


async def test_select_values_and_power_off(hass):
    log = []
    tv = {**TV, "power_entity": "input_select.theater", "power_on": "Movie", "power_off": "Off", "status_entity": None, "adb": None}
    hass.states.async_set("input_select.theater", "Off")
    _svc(hass, "input_select", "select_option", log)
    await play.ensure_ready(hass, tv)
    assert log[-1][2] == {"entity_id": "input_select.theater", "option": "Movie"}
    assert play.can_power_off(tv)
    await play.power_off(hass, tv)
    assert log[-1][2] == {"entity_id": "input_select.theater", "option": "Off"}


async def test_script_runs_only_when_off(hass):
    log = []
    tv = {"id": "th", "name": "Theater", "adb": "media_player.theater_shield", "power_entity": "script.theater_on"}
    hass.states.async_set("script.theater_on", "off")
    hass.states.async_set("media_player.theater_shield", "playing")
    _svc(hass, "script", "turn_on", log)
    await play.ensure_ready(hass, tv)
    assert log == [], "the TV is on: the script isn't run again"
    hass.states.async_set("media_player.theater_shield", "off")
    await play.ensure_ready(hass, tv)
    assert log and log[0][2]["entity_id"] == "script.theater_on"
    assert play.can_power_off({**tv, "adb": None}) is False, "a script can't turn the room off"


async def test_no_room_entities_nothing_changes(hass):
    await play.ensure_ready(hass, {"id": "lr", "name": "Living Room TV"})
    await asyncio.sleep(0)


AVS = {"id": "th", "name": "Theater", "adb": "media_player.theater_shield", "power_entity": "select.theater_scene",
       "power_on": "Movie", "power_off": "idle", "status_entity": "sensor.theater_activity", "ready_value": "active", "ready_wait": 5}


async def test_already_starting_just_waits(hass):
    log = []
    hass.states.async_set("select.theater_scene", "starting")
    hass.states.async_set("sensor.theater_activity", "starting")
    _svc(hass, "select", "select_option", log)
    hass.loop.call_later(0.05, lambda: hass.states.async_set("sensor.theater_activity", "active"))
    await play.ensure_ready(hass, AVS, poll=0.02)
    assert log == [], "not selected again while starting"


async def test_failure_stops_at_once_with_the_rooms_error(hass):
    hass.states.async_set("select.theater_scene", "idle")
    hass.states.async_set("sensor.theater_activity", "idle")

    def start(call):
        hass.states.async_set("sensor.theater_activity", "starting")
        hass.loop.call_later(0.05, lambda: hass.states.async_set("sensor.theater_activity", "error", {"error": "projector not ready after 60 s"}))
    _svc(hass, "select", "select_option", [], start)
    t0 = hass.loop.time()
    with pytest.raises(HomeAssistantError, match="projector not ready"):
        await play.ensure_ready(hass, {**AVS, "ready_wait": 30}, poll=0.02)
    assert hass.loop.time() - t0 < 2, "didn't wait out the timeout"


async def test_leftover_error_starts_again(hass):
    log = []
    hass.states.async_set("select.theater_scene", "error")
    hass.states.async_set("sensor.theater_activity", "error", {"error": "old"})

    def start(call):
        log.append(call.data["option"])
        hass.states.async_set("sensor.theater_activity", "starting")
        hass.loop.call_later(0.05, lambda: hass.states.async_set("sensor.theater_activity", "active"))
    hass.services.async_register("select", "select_option", start)
    await play.ensure_ready(hass, AVS, poll=0.02)
    assert log == ["Movie"]


async def test_room_turns_the_tv_off(hass):
    log = []
    hass.states.async_set("select.theater_scene", "Movie")
    hass.states.async_set("media_player.theater_shield", "playing")
    _svc(hass, "select", "select_option", log)
    _svc(hass, "androidtv", "adb_command", log)
    await play.power_off(hass, {**AVS, "room_off": True})
    assert [x[:2] for x in log] == [("select", "select_option")], "no ADB sleep: the room does it"
    log.clear()
    await play.power_off(hass, AVS)
    assert [x[:2] for x in log] == [("select", "select_option"), ("androidtv", "adb_command")]
