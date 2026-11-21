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
        if call.service == "launch_app" and hass.data.get("not_on_screen", 0) > 0:
            hass.data["not_on_screen"] -= 1
            raise HomeAssistantError("launch failed (404): launched, but com.plexapp.android is not on screen within 45 s")
        if call.service == "turn_on" and hass.data.get("wakes"):
            ent = call.data["entity_id"]
            hass.states.async_set(ent, "on", dict(hass.states.get(ent).attributes))
    for dom, svc in [("pipup", "launch_app"), ("pipup", "send_key"), ("pipup", "seek"), ("androidtv", "adb_command"),
                     ("media_player", "play_media"), ("media_player", "media_pause"), ("media_player", "media_play"),
                     ("media_player", "media_seek"), ("media_player", "volume_up"), ("media_player", "volume_mute"),
                     ("media_player", "turn_on"), ("media_player", "turn_off")]:
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


async def test_play_logs_each_step(hass, calls):
    import logging
    got = []

    class H(logging.Handler):
        def emit(self, record):
            got.append(record.getMessage())
    log = logging.getLogger("custom_components.plex_center.play")
    h, old = H(), log.level
    log.addHandler(h); log.setLevel(logging.DEBUG)
    try:
        _pip(hass)
        await play.start(hass, {"name": "LR", "pipup": "media_player.pip"}, MOVIE)
    finally:
        log.removeHandler(h); log.setLevel(old)
    lines = [m for m in got if "plex_center play on LR" in m]
    assert "start" in lines[0] and "route pipup" in lines[0]
    assert any("PiPup open + press watch" in x and "total" in x for x in lines) and "done" in lines[-1]


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
    assert cmds[0].startswith("input keyevent KEYCODE_WAKEUP") and "CLOSE_SYSTEM_DIALOGS" in cmds[0]   # screensaver / boxes
    assert "am start" in cmds[1] and MOVIE["link"] in cmds[1] and cmds[2] == "input keyevent KEYCODE_DPAD_CENTER"


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
    assert [c[1] for c in calls[-1:]] == ["adb_command"]
    await play.trailer(hass, tv, url="https://www.youtube.com/watch?v=abcdefghijk")
    assert calls[-1][1] == "launch_app" and calls[-1][2]["uri"].startswith("https://www.youtube.com/")
    await play.trailer(hass, tv, url="https://www.youtube.com/results?search_query=Bill%20%26%20Ted%201989%20trailer")
    assert "search_query" in calls[-1][2]["uri"]
    with pytest.raises(HomeAssistantError):
        await play.trailer(hass, tv, url="https://evil.example/x'; reboot")
    with pytest.raises(HomeAssistantError):
        await play.trailer(hass, tv, url="https://www.youtube.com/watch?v=x'; reboot")


async def test_power_off_is_never_a_deep_sleep(hass, calls):
    """Only ADB's sleep key or the Android TV Remote's Power key: never turn_off on PiPup (deep sleep on TCLs)."""
    _pip(hass)
    with pytest.raises(HomeAssistantError, match="only be turned off with its remote"):
        await play.control(hass, {"name": "LR", "pipup": "media_player.pip", "plex_client": "media_player.plex"}, "power_off")
    assert calls == []
    hass.states.async_set("media_player.atvr", "on", {})
    await play.control(hass, {"pipup": "media_player.pip", "remote": "media_player.atvr"}, "power_off")
    assert calls[-1][:2] == ("media_player", "turn_off") and calls[-1][2]["entity_id"] == "media_player.atvr"
    hass.states.async_set("media_player.adb", "idle", {})
    await play.control(hass, {"pipup": "media_player.pip", "adb": "media_player.adb", "remote": "media_player.atvr"}, "power_off")
    assert calls[-1][2]["command"] == "input keyevent KEYCODE_SLEEP"
    assert not any(c[1] == "turn_off" and c[2]["entity_id"] == "media_player.pip" for c in calls)
    assert play.can_power_off({"pipup": "x"}) is False and play.can_power_off({"adb": "x"}) is True


async def test_off_tv_with_stale_plex_session_wakes_and_never_presses_back(hass, calls):
    """TV off, Plex still says paused (the app is gone): turn on, close the screensaver, launch. No Back."""
    hass.data["wakes"] = True
    hass.states.async_set("media_player.pip", "off", {"click_service": True, "click_packages": ["com.plexapp.android"]})
    hass.states.async_set("media_player.plex", "paused", {"media_duration": 2626, "media_content_id": "721605"})
    tv = {"name": "LR", "pipup": "media_player.pip", "plex_client": "media_player.plex"}
    with patch("asyncio.sleep"):
        await play.start(hass, tv, MOVIE)
    assert [(c[1], c[2].get("key")) for c in calls] == [("turn_on", None), ("turn_on", None), ("launch_app", None)]
    assert calls[-1][2]["wait"] == 30


async def test_plex_not_on_screen_retries_after_home_then_says_so(hass, calls):
    _pip(hass)
    tv = {"name": "Living Room TV", "pipup": "media_player.pip"}
    hass.data["not_on_screen"] = 1
    with patch("asyncio.sleep"):
        await play.start(hass, tv, MOVIE)
    assert [c[1] for c in calls] == ["turn_on", "launch_app", "send_key", "launch_app"] and calls[2][2]["key"] == "home"
    calls.clear()
    hass.data["not_on_screen"] = 2
    with patch("asyncio.sleep"), pytest.raises(HomeAssistantError, match="Plex didn't open on Living Room TV. Try again."):
        await play.start(hass, tv, MOVIE)


async def test_resume_records(hass):
    """Saved when the TV goes off while something plays; kept while the stale paused session shows; dropped
    when something really plays again."""
    from custom_components.plex_center.resume import Resumes

    tv = {"id": "living_room_tv", "pipup": "media_player.pip", "adb": "media_player.adb", "plex_client": "media_player.plex"}
    hass.states.async_set("media_player.pip", "on", {})
    hass.states.async_set("media_player.adb", "on", {})
    hass.states.async_set("media_player.plex", "paused", {"media_content_id": "721605", "media_duration": 2626, "media_position": 389,
                                                          "media_series_title": "The Daily Show", "media_title": "November 16, 2026",
                                                          "media_season": 31, "media_episode": 131})
    res = Resumes(hass, "e1")
    await res.async_load()
    res.track([tv])
    hass.states.async_set("media_player.pip", "off", {})
    hass.states.async_set("media_player.adb", "off", {})
    await hass.async_block_till_done()
    rec = res.get("living_room_tv")
    assert rec and rec["kind"] == "plex" and rec["key"] == "721605" and rec["position"] == 389 and rec["show"] == "The Daily Show"
    hass.states.async_set("media_player.pip", "on", {})          # woken: Plex still shows the same paused session
    await hass.async_block_till_done()
    assert res.get("living_room_tv")
    hass.states.async_set("media_player.plex", "playing", {"media_content_id": "721605", "media_duration": 2626})
    await hass.async_block_till_done()
    assert res.get("living_room_tv") is None
    # another app: kept with its package when the TV goes off
    hass.states.async_set("media_player.plex", "idle", {})
    hass.states.async_set("media_player.pip", "playing", {"app_name": "HBO Max", "media_title": "Dune", "media_duration": 9000})
    hass.states.async_set("media_player.adb", "playing", {"app_id": "com.hbo.hbonow"})
    await hass.async_block_till_done()
    hass.states.async_set("media_player.pip", "off", {})
    hass.states.async_set("media_player.adb", "off", {})
    await hass.async_block_till_done()
    rec = res.get("living_room_tv")
    assert rec["kind"] == "app" and rec["app"] == "HBO Max" and rec["app_id"] == "com.hbo.hbonow"
    res.forget_key("1")
    assert res.get("living_room_tv")
    res.forget("living_room_tv")
    assert res.all() == {}
    res.stop()


async def test_resume_service(hass, calls):
    from types import SimpleNamespace

    from custom_components.plex_center import services
    from custom_components.plex_center.resume import Resumes

    res = Resumes(hass, "e2")
    res.data = {"lr": {"kind": "plex", "key": "721605", "at": "2099-01-01T00:00:00+00:00"}}
    entry = SimpleNamespace(runtime_data=SimpleNamespace(resumes=res))
    tv = {"id": "lr", "name": "Living Room TV", "pipup": "media_player.pip"}
    started = []

    async def fake_start(_h, _tv, item, mode):
        started.append((item["key"], mode))

    async def fake_resolve(_h, _e, _tv, key, _title, _mode):
        return {"key": key}

    with patch.object(services, "find_tv", return_value=(entry, tv)), patch.object(services, "start", fake_start), \
            patch.object(services, "_resolve", fake_resolve):
        services.async_register(hass)
        await hass.services.async_call("plex_center", "resume", {"tv": "lr"}, blocking=True)
        assert started == [("721605", "play")] and res.data == {}
        with pytest.raises(HomeAssistantError, match="Nothing to resume"):
            await hass.services.async_call("plex_center", "resume", {"tv": "lr"}, blocking=True)


async def test_pipup_wait_limit_is_followed(hass, calls):
    """PiPup allows "wait" up to some limit: a lower one than ours is read from its error and used."""
    import voluptuous as vol
    got = []

    async def launch(call):
        got.append(call.data["wait"])
    _pip(hass)
    hass.services.async_register("pipup", "launch_app", launch,
                                 schema=vol.Schema({vol.Optional("wait"): vol.All(int, vol.Range(max=20))}, extra=vol.ALLOW_EXTRA))
    old = play.PIPUP_WAIT[0]
    try:
        assert await play.start(hass, {"name": "LR", "pipup": "media_player.pip"}, MOVIE) == "pipup"
        assert got == [20] and play.PIPUP_WAIT[0] == 20
    finally:
        play.PIPUP_WAIT[0] = old


async def test_no_media_session_falls_back_to_skip_keys(hass, calls):
    """Plex on the SHIELD publishes no media session: PiPup can't seek, so Fast forward / Rewind presses do it."""
    from homeassistant.exceptions import HomeAssistantError
    keys = []

    async def no_session(call):
        raise HomeAssistantError("Shield: media/seek failed (404): nothing is playing")

    async def send_key(call):
        keys.append(call.data["key"])
    _pip(hass)
    for svc in ("seek", "media_seek"):
        hass.services.async_register("pipup" if svc == "seek" else "media_player", svc, no_session)
    hass.services.async_register("pipup", "send_key", send_key)
    hass.states.async_set("media_player.plex", "paused", {"media_position": 600, "media_duration": 3600})
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": "media_player.plex"}
    with patch("asyncio.sleep"):
        await play.control(hass, tv, "skip", 30)
        assert keys == ["fast_forward"], "+30 = one press (Plex's default 30 s)"
        keys.clear(); await play.control(hass, tv, "skip", -10)
        assert keys == ["rewind"]
        keys.clear(); await play.control(hass, tv, "seek", 720)          # 600 → 720: 4 × 30 s
        assert keys == ["fast_forward"] * 4
        keys.clear(); await play.control(hass, {**tv, "skip_back": 30}, "seek", 300)   # back 300 s at 30 s a press
        assert keys == ["rewind"] * 10
    adb = []

    async def adb_cmd(call):
        adb.append(call.data["command"])
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    hass.states.async_set("media_player.adb", "idle")
    keys.clear()
    with patch("asyncio.sleep"):
        await play.control(hass, {**tv, "adb": "media_player.adb"}, "seek", 720)
    assert keys == [] and adb == ["input keyevent " + " ".join(["KEYCODE_MEDIA_FAST_FORWARD"] * 4)], "with ADB: one command"
