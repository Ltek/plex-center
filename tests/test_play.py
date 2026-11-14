"""Playback routes: the exact HA calls each route makes."""

from unittest.mock import patch

import pytest
from homeassistant.core import ServiceCall
from homeassistant.exceptions import HomeAssistantError

from custom_components.plex_center import play

SID = "6d60735f617529a9a566eff288ef0f94d063ff80"
MOVIE = {"key": "720622", "type": "movie", "link": f"plex://libraries/{SID}/movie/x/720622"}


@pytest.fixture
def calls(hass):
    got = []
    async def handler(call: ServiceCall):
        got.append((call.domain, call.service, dict(call.data)))
        if call.service == "launch_app" and call.data.get("click") == "action-button-watchFromStart" and hass.data.get("no_restart"):
            raise HomeAssistantError("launch failed (404): action-button-watchFromStart not found")
    for dom, svc in [("pipup", "launch_app"), ("pipup", "send_key"), ("pipup", "seek"), ("androidtv", "adb_command"),
                     ("media_player", "play_media"), ("media_player", "media_pause"), ("media_player", "media_play"),
                     ("media_player", "media_seek"), ("media_player", "volume_up"), ("media_player", "volume_mute"),
                     ("media_player", "turn_on")]:
        hass.services.async_register(dom, svc, handler)
    return got


def _pip(hass, playing=False):
    hass.states.async_set("media_player.pip", "playing" if playing else "on",
                          {"click_service": True, "click_packages": ["com.plexapp.android"], **({"media_duration": 5000} if playing else {})})


async def test_pipup_play_and_restart_fallback(hass, calls):
    _pip(hass)
    tv = {"name": "LR", "pipup": "media_player.pip"}
    assert await play.start(hass, tv, MOVIE) == "pipup"
    assert calls[-1][1] == "launch_app" and calls[-1][2]["click"] == "action-button-watch" and calls[-1][2]["method"] == "ok"
    hass.data["no_restart"] = True
    await play.start(hass, tv, MOVIE, "restart")
    assert [c[2].get("click") for c in calls[-2:]] == ["action-button-watchFromStart", "action-button-watch"]


async def test_pipup_sends_back_first_when_playing(hass, calls):
    _pip(hass, playing=True)
    with patch("asyncio.sleep"):
        await play.start(hass, {"pipup": "media_player.pip"}, MOVIE)
    assert [c[1] for c in calls] == ["send_key", "launch_app"] and calls[0][2]["key"] == "back"


async def test_plex_route_uses_play_media_with_user(hass, calls):
    hass.states.async_set("media_player.web", "idle", {"supported_features": 1 | 512 | 4096})
    await play.start(hass, {"plex_client": "media_player.web", "plex_user": "LivingRoom"}, MOVIE, "restart")
    dom, svc, data = calls[-1]
    assert (dom, svc) == ("media_player", "play_media")
    assert data["media_content_id"] == 'plex://{"plex_key": 720622, "username": "LivingRoom", "offset": 0}'


async def test_adb_route(hass, calls):
    hass.states.async_set("media_player.adb", "idle", {})
    with patch("asyncio.sleep"):
        await play.start(hass, {"adb": "media_player.adb"}, MOVIE)
    cmds = [c[2]["command"] for c in calls]
    assert "am start" in cmds[0] and MOVIE["link"] in cmds[0] and cmds[1] == "input keyevent KEYCODE_DPAD_CENTER"


async def test_unsafe_link_refused(hass, calls):
    _pip(hass)
    with pytest.raises(HomeAssistantError):
        await play.start(hass, {"pipup": "media_player.pip"}, {**MOVIE, "link": "plex://libraries/x/movie/x/1'; reboot"})
    assert calls == []


async def test_controls(hass, calls):
    _pip(hass)
    tv = {"pipup": "media_player.pip"}
    await play.control(hass, tv, "stop")
    await play.control(hass, tv, "seek", 600)
    await play.control(hass, tv, "skip", -10)
    assert [(c[1], c[2].get("key") or c[2].get("seek_position") or c[2].get("offset")) for c in calls] == [
        ("send_key", "back"), ("media_seek", 600), ("seek", -10)]
    hass.states.async_set("media_player.adb", "idle", {})
    with pytest.raises(HomeAssistantError):
        await play.control(hass, {"adb": "media_player.adb"}, "seek", 600)


async def test_volume_power_and_trailer(hass, calls):
    _pip(hass)
    tv = {"pipup": "media_player.pip"}
    await play.control(hass, tv, "volume_up")
    await play.control(hass, tv, "mute")
    await play.control(hass, tv, "power_on")
    assert [c[1] for c in calls] == ["volume_up", "volume_mute", "turn_on"] and calls[1][2]["is_volume_muted"] is True
    hass.states.async_set("media_player.adb", "idle", {})
    await play.control(hass, {"adb": "media_player.adb"}, "power_off")
    assert calls[-1][2]["command"] == "input keyevent KEYCODE_SLEEP"
    await play.trailer(hass, tv, url="https://www.youtube.com/watch?v=abcdefghijk")
    assert calls[-1][1] == "launch_app" and calls[-1][2]["uri"].startswith("https://www.youtube.com/")
    with pytest.raises(HomeAssistantError):
        await play.trailer(hass, tv, url="https://evil.example/x'; reboot")
