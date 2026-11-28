"""Plex Center's log: what failed, why, and what to do; workarounds noted as handled; repeats counted."""

from unittest.mock import patch

import pytest

from homeassistant.exceptions import HomeAssistantError

from custom_components.plex_center import eventlog, play
from custom_components.plex_center.eventlog import entries, explain, record


def test_explain_known_causes():
    cause, fix = explain("Shield: back needs the accessibility service (install.sh --accessibility)")
    assert "accessibility service" in cause and "PiPupAccessibilityService" in fix
    assert "Fast forward" in explain("media/seek failed (404): com.plexapp.android has no media session")[1]
    assert explain("value must be at most 30 at 'wait'")[0]
    assert explain("something new") == ("", "")


def test_repeats_are_counted(hass):
    entries(hass).clear()
    tv = {"name": "Theater"}
    record(hass, tv, "stop", "back needs the accessibility service")
    record(hass, tv, "stop", "back needs the accessibility service")
    record(hass, tv, "home", "back needs the accessibility service")
    log = list(entries(hass))
    assert [(e["action"], e["count"]) for e in log] == [("stop", 2), ("home", 1)]


async def test_workaround_is_logged_as_handled(hass):
    entries(hass).clear()
    eventlog.set_level(hass, "info")

    async def refuse(call):
        raise HomeAssistantError("Shield: back needs the accessibility service")

    async def ok(call):
        pass
    hass.states.async_set("media_player.pip", "on", {"click_service": True, "click_packages": ["com.plexapp.android"]})
    hass.states.async_set("media_player.adb", "idle")
    hass.services.async_register("pipup", "send_key", refuse)
    hass.services.async_register("androidtv", "adb_command", ok)
    await play.control(hass, {"name": "Theater", "pipup": "media_player.pip", "adb": "media_player.adb"}, "stop")
    (e,) = entries(hass)
    assert e["level"] == "info" and "ADB" in e["handled"] and e["tv"] == "Theater" and e["cause"]
    eventlog.set_level(hass, "error")
    assert list(entries(hass)) == [], "Errors only: the workaround is dropped"
    await play.control(hass, {"name": "Theater", "pipup": "media_player.pip", "adb": "media_player.adb"}, "stop")
    assert list(entries(hass)) == [], "and new ones aren't kept"


async def test_service_failure_is_logged(hass):
    from custom_components.plex_center.services import _logged
    entries(hass).clear()

    async def boom(call):
        raise HomeAssistantError("Theater has no usable player")
    with patch("custom_components.plex_center.services.find_tv", return_value=(None, {"name": "Theater"})):
        with pytest.raises(HomeAssistantError):
            await _logged(hass, "control", boom)(type("C", (), {"data": {"tv": "theater", "action": "seek"}})())
    (e,) = entries(hass)
    assert e["action"] == "seek" and e["level"] == "error" and "Configure" in e["fix"]
    _ = eventlog


async def test_log_is_saved_and_loaded(hass, hass_storage):
    entries(hass).clear()
    hass_storage["plex_center.log"] = {"version": 1, "key": "plex_center.log",
                                       "data": {"entries": [{"at": 1, "last": 1, "count": 1, "tv": "Theater", "action": "stop", "message": "old"}]}}
    hass.data.pop("plex_center_log_loaded", None)
    await eventlog.async_load(hass)
    assert [e["message"] for e in entries(hass)] == ["old"]
    import asyncio
    with patch.object(eventlog, "SAVE_DELAY_S", 0):
        eventlog.set_level(hass, "info")
        record(hass, {"name": "Theater"}, "seek", "has no media session", handled="skip keys")
        for _ in range(5):
            await asyncio.sleep(0.05)
            await hass.async_block_till_done()
    saved = hass_storage["plex_center.log"]["data"]
    assert [e["message"] for e in saved["entries"]] == ["old", "has no media session"] and saved["level"] == "info"
    eventlog.set_level(hass, "error")



def test_home_assistant_log_options_apart_from_this_log(hass):
    import logging
    from types import SimpleNamespace
    from custom_components.plex_center import eventlog as el

    class Keep(logging.Handler):
        def emit(self, record):
            caplog.records.append(SimpleNamespace(levelno=record.levelno, message=record.getMessage()))
    caplog = SimpleNamespace(records=[])
    lg = logging.getLogger("custom_components.plex_center")
    h = Keep(level=logging.DEBUG)
    lg.addHandler(h)
    old = lg.level
    lg.setLevel(logging.DEBUG)
    tv = {"name": "Theater"}
    el.set_level(hass, "info")
    el.set_ha_log(hass, errors=False, info=False)
    el.record(hass, tv, "pause", "boom 1")
    el.record(hass, tv, "seek", "worked 1", handled="skip keys")
    assert len(el.entries(hass)) == 2, "kept in this log"
    assert not [r for r in caplog.records if r.levelno >= logging.INFO and "boom 1" in r.message], "not in Home Assistant's log"
    el.set_ha_log(hass, errors=True, info=True)
    el.record(hass, tv, "pause", "boom 2")
    el.record(hass, tv, "seek", "worked 2", handled="skip keys")
    assert any(r.levelno == logging.WARNING and "boom 2" in r.message for r in caplog.records)
    assert any(r.levelno == logging.INFO and "worked 2" in r.message for r in caplog.records)
    el.set_level(hass, "error")
    el.record(hass, tv, "seek", "worked 3", handled="skip keys")
    assert not any(e["message"] == "worked 3" for e in el.entries(hass)), "info not kept at error level..."
    assert any(r.levelno == logging.INFO and "worked 3" in r.message for r in caplog.records), "...but still in Home Assistant's log"
    lg.removeHandler(h)
    lg.setLevel(old)
