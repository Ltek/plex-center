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
