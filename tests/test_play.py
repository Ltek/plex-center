"""Playback routes: the exact HA calls each route makes."""

from unittest.mock import AsyncMock, patch

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
    hass.states.async_set("media_player.web", "idle", {"supported_features": 1 | 512 | 4096 | 16384})
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
        play._LAST_SEEK.clear(); keys.clear(); await play.control(hass, tv, "skip", 10)
        assert keys == ["fast_forward", "rewind", "rewind"], "+10 with skips of 30 / 10"
        play._LAST_SEEK.clear(); keys.clear(); await play.control(hass, tv, "seek", 720)          # 600 → 720: 4 × 30 s
        assert keys == ["fast_forward"] * 4
        play._LAST_SEEK.clear(); keys.clear(); await play.control(hass, {**tv, "skip_back": 30}, "seek", 300)   # back 300 s at 30 s a press
        assert keys == ["rewind"] * 10
    adb = []

    async def adb_cmd(call):
        adb.append(call.data["command"])
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    hass.states.async_set("media_player.adb", "idle")
    keys.clear(); play._LAST_SEEK.clear()
    with patch("asyncio.sleep"):
        await play.control(hass, {**tv, "adb": "media_player.adb"}, "seek", 720)
    assert keys == [] and adb == ["input keyevent " + " ".join(["KEYCODE_MEDIA_FAST_FORWARD"] * 4)], "with ADB: one command"


def test_skip_plan():
    assert play.skip_plan(10, 30, 10) == (1, 2)
    assert play.skip_plan(30, 30, 10) == (1, 0)
    assert play.skip_plan(-30, 30, 10) == (0, 3)
    assert play.skip_plan(130, 30, 10) == (5, 2)
    assert play.skip_plan(4, 30, 10) == (0, 0), "nearer to stay put"


async def test_back_falls_back_to_adb(hass, calls):
    """PiPup's Back needs its accessibility service (off on the SHIELD): ADB presses it."""
    from homeassistant.exceptions import HomeAssistantError
    adb = []

    async def no_access(call):
        raise HomeAssistantError("Shield: back needs the accessibility service")

    async def adb_cmd(call):
        adb.append(call.data["command"])
    _pip(hass)
    hass.services.async_register("pipup", "send_key", no_access)
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    hass.states.async_set("media_player.adb", "idle")
    await play.control(hass, {"name": "Theater", "pipup": "media_player.pip", "adb": "media_player.adb"}, "stop")
    assert adb == ["input keyevent KEYCODE_BACK"]


async def test_volume_goes_to_the_volume_player(hass, calls):
    """A TV with a volume player (StormAudio): the volume buttons change its volume, not the TV's."""
    _pip(hass)
    hass.states.async_set("media_player.storm", "on", {"is_volume_muted": False})
    tv = {"name": "Theater", "pipup": "media_player.pip", "volume_entity": "media_player.storm"}
    await play.control(hass, tv, "volume_up")
    await play.control(hass, tv, "mute")
    assert [(c[1], c[2]["entity_id"]) for c in calls[-2:]] == [("volume_up", "media_player.storm"), ("volume_mute", "media_player.storm")]
    assert calls[-1][2]["is_volume_muted"] is True


async def test_volume_set(hass, calls):
    got = []

    async def vs(call):
        got.append(dict(call.data))
    hass.services.async_register("media_player", "volume_set", vs)
    hass.states.async_set("media_player.storm", "on")
    await play.control(hass, {"name": "Theater", "pipup": "media_player.pip", "volume_entity": "media_player.storm"}, "volume_set", 0.42)
    assert got == [{"volume_level": 0.42, "entity_id": "media_player.storm"}]


async def test_no_response_retries_over_adb(hass):
    """Play / pause, skips (10 s and 30 s alike) and seek: nothing changed on the TV within 2 s → sent again over ADB."""
    from datetime import datetime, timezone
    adb, sent, respond = [], [], {"on": False}
    plex = "media_player.plex"

    def set_plex(state, pos):
        hass.states.async_set(plex, state, {"media_position": pos, "media_duration": 3600,
                                             "media_position_updated_at": datetime.now(timezone.utc).isoformat()})

    async def svc(call):
        sent.append(call.service)
        st = hass.states.get(plex)
        if not respond["on"]:
            if st and "media_position" in st.attributes:   # the Plex player reports again a moment later: nothing moved
                set_plex(st.state, st.attributes["media_position"])
            return
        if call.service == "media_play_pause":
            set_plex("playing" if st.state == "paused" else "paused", st.attributes["media_position"])
        elif call.service == "seek":
            set_plex(st.state, st.attributes["media_position"] + call.data["offset"])
        elif call.service == "media_seek":
            set_plex(st.state, call.data["seek_position"])

    async def adb_cmd(call):
        adb.append(call.data["command"])
    hass.services.async_register("media_player", "media_play_pause", svc)
    hass.services.async_register("media_player", "media_seek", svc)
    hass.services.async_register("pipup", "seek", svc)
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    _pip(hass, playing=True)   # PiPup reports the playback (a TCL): its own commands, retried over ADB
    hass.states.async_set("media_player.adb", "idle")
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": plex, "adb": "media_player.adb"}
    with patch("asyncio.sleep"):
        set_plex("paused", 600)
        await play.control(hass, tv, "play_pause")
        assert adb == ["input keyevent KEYCODE_MEDIA_PLAY"], "play / pause ignored while paused → the explicit Play key, never the toggle"
        for delta, keys in [(30, ["KEYCODE_MEDIA_FAST_FORWARD"]), (-30, ["KEYCODE_MEDIA_REWIND"] * 3),
                            (10, ["KEYCODE_MEDIA_FAST_FORWARD", "KEYCODE_MEDIA_REWIND", "KEYCODE_MEDIA_REWIND"]), (-10, ["KEYCODE_MEDIA_REWIND"])]:
            adb.clear(); play._LAST_SEEK.clear(); set_plex("paused", 600)
            await play.control(hass, tv, "skip", delta)
            assert adb == ["input keyevent " + " ".join(keys)], f"skip {delta:+} ignored → ADB presses"
        adb.clear(); play._LAST_SEEK.clear(); set_plex("paused", 600)
        await play.control(hass, tv, "seek", 720)
        assert adb == ["input keyevent " + " ".join(["KEYCODE_MEDIA_FAST_FORWARD"] * 4)], "seek ignored → ADB presses"
        assert play.keys_first(hass, tv), "learned: PiPup's commands don't take here"
        hass.data.pop(play._KEYS_KEY, None)   # a TV where PiPup works (the TCLs)
        respond["on"] = True
        for action, value in [("play_pause", None), ("skip", 30), ("skip", -10), ("seek", 900)]:
            adb.clear(); play._LAST_SEEK.clear(); set_plex("paused", 600)
            await play.control(hass, tv, action, value)
            assert adb == [], f"{action} {value}: the TV responded, nothing sent again"
    hass.data.pop(play._KEYS_KEY, None)
    hass.states.async_set(plex, "on", {})   # nothing playing: can't tell, no retry
    _pip(hass)
    adb.clear(); respond["on"] = False
    with patch("asyncio.sleep"):
        await play.control(hass, tv, "play_pause")
    assert adb == []



async def test_move_retry_presses_only_what_is_missing(hass):
    """A slow skip that half landed: only the rest is pressed. No fresh report: nothing is pressed (no overshoot)."""
    from datetime import datetime, timezone
    adb, plex, mode = [], "media_player.plex", {"v": "half"}

    def set_plex(state, pos):
        hass.states.async_set(plex, state, {"media_position": pos, "media_duration": 3600,
                                             "media_position_updated_at": datetime.now(timezone.utc).isoformat()})

    async def seek(call):
        st = hass.states.get(plex)
        if mode["v"] == "half":
            set_plex(st.state, st.attributes["media_position"] + 30)   # +30 of a +90 skip landed

    async def adb_cmd(call):
        adb.append(call.data["command"])
    hass.services.async_register("pipup", "seek", seek)
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    _pip(hass, playing=True)   # PiPup reports the playback (a TCL): its own commands, retried over ADB
    hass.states.async_set("media_player.adb", "idle")
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": plex, "adb": "media_player.adb"}
    with patch("asyncio.sleep"):
        set_plex("paused", 600)
        await play.control(hass, tv, "skip", 90)
        assert adb == ["input keyevent KEYCODE_MEDIA_FAST_FORWARD KEYCODE_MEDIA_FAST_FORWARD"], adb
        adb.clear(); play._LAST_SEEK.clear(); mode["v"] = "silent"; set_plex("paused", 600)
        await play.control(hass, tv, "skip", 90)
        assert adb == [], "no new report from the TV: nothing pressed"


def test_auto_route_skips_the_plex_remote_when_pipup_or_adb_is_there(hass):
    from homeassistant.components.media_player import MediaPlayerEntityFeature as F
    from custom_components.plex_center.tvs import route_for
    hass.states.async_set("media_player.plex", "playing", {"supported_features": int(F.PAUSE | F.PLAY | F.PLAY_MEDIA)})
    hass.states.async_set("media_player.adb", "idle")
    assert route_for(hass, {"plex_client": "media_player.plex", "adb": "media_player.adb"}) == "adb"
    assert route_for(hass, {"plex_client": "media_player.plex"}) == "plex", "nothing else: the Plex remote"


def test_plex_player_gets_no_commands_it_doesnt_claim(hass):
    from homeassistant.components.media_player import MediaPlayerEntityFeature as F
    from custom_components.plex_center.tvs import route_for
    shield = int(F.PLAY_MEDIA | F.BROWSE_MEDIA)   # what the SHIELD's Plex app claims
    hass.states.async_set("media_player.plex", "playing", {"supported_features": shield})
    assert route_for(hass, {"plex_client": "media_player.plex"}) is None, "Auto: nothing to control it with"
    assert route_for(hass, {"plex_client": "media_player.plex", "route": "plex"}) is None, "chosen in TV settings: still not"
    hass.states.async_set("media_player.plex", "playing", {"supported_features": int(F.PAUSE | F.PLAY | F.PLAY_MEDIA)})
    assert route_for(hass, {"plex_client": "media_player.plex", "route": "plex"}) == "plex"


async def test_volume_never_goes_to_a_plex_player_without_volume(hass):
    from homeassistant.components.media_player import MediaPlayerEntityFeature as F
    hass.states.async_set("media_player.plex", "playing", {"supported_features": int(F.PLAY_MEDIA)})
    with pytest.raises(Exception, match="No player to change the volume"):
        await play.control(hass, {"name": "T", "plex_client": "media_player.plex", "route": "plex"}, "volume_up")



async def test_back_first_false_opens_over_the_paused_player(hass):
    """Demos: no Back before the next clip; Back only if opening over the paused player fails."""
    calls, fail = [], {"n": 0}

    async def svc(call):
        calls.append((call.service, call.data.get("key") or call.data.get("click")))
        if call.service == "launch_app" and fail["n"]:
            fail["n"] -= 1
            raise HomeAssistantError("launch failed (404): launched, but com.plexapp.android is not on screen within 45 s")
    for s_ in ("launch_app", "send_key"):
        hass.services.async_register("pipup", s_, svc)
    _pip(hass)
    hass.states.async_set("media_player.plex", "paused", {"media_position": 63, "media_content_id": "1"})
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": "media_player.plex"}
    item = {"key": "2", "title": "Clip 2", "link": f"plex://libraries/{SID}/movie/x/2"}
    with patch("asyncio.sleep"), patch.object(play, "wake", AsyncMock(return_value=False)):
        await play.start(hass, tv, item, "play", start_room=False, back_first=False)
        assert ("send_key", "back") not in calls, calls
        calls.clear(); fail["n"] = 1
        await play.start(hass, tv, item, "play", start_room=False, back_first=False)
        assert ("send_key", "back") in calls, "it didn't open over the player: Back, then again"



async def test_shield_media_keys_at_once(hass):
    """PiPup doesn't report the playback (the SHIELD's Plex app): play / pause / skip go straight to media keys."""
    from datetime import datetime, timezone
    adb, pip_calls = [], []

    async def adb_cmd(call):
        adb.append(call.data["command"])

    async def pip_svc(call):
        pip_calls.append(call.service)
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    for d, s_ in (("media_player", "media_pause"), ("media_player", "media_play"), ("pipup", "seek"), ("media_player", "media_seek")):
        hass.services.async_register(d, s_, pip_svc)
    _pip(hass)   # PiPup "on" while Plex plays
    hass.states.async_set("media_player.adb", "idle")
    hass.states.async_set("media_player.plex", "playing", {"media_position": 600, "media_duration": 3600,
                                                            "media_position_updated_at": datetime.now(timezone.utc).isoformat()})
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": "media_player.plex", "adb": "media_player.adb"}
    with patch("asyncio.sleep"):
        await play.control(hass, tv, "pause")
        await play.control(hass, tv, "play_pause")
        await play.control(hass, tv, "skip", 30)
        await play.control(hass, tv, "skip", -10)
    assert pip_calls == [], "nothing sent to PiPup's player, which can't do it here"
    assert adb == ["input keyevent KEYCODE_MEDIA_PAUSE", "input keyevent KEYCODE_MEDIA_PAUSE",
                   "input keyevent KEYCODE_MEDIA_FAST_FORWARD", "input keyevent KEYCODE_MEDIA_REWIND"], adb


async def test_shield_keys_through_the_android_tv_remote(hass):
    from homeassistant.helpers import device_registry as dr, entity_registry as er
    from pytest_homeassistant_custom_component.common import MockConfigEntry
    sent = []

    async def send(call):
        sent.append(call.data["command"])
    hass.services.async_register("remote", "send_command", send)
    hass.services.async_register("androidtv", "adb_command", lambda call: sent.append(("adb", call.data["command"])))
    entry = MockConfigEntry(domain="androidtv_remote")
    entry.add_to_hass(hass)
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("androidtv_remote", "shield")})
    reg = er.async_get(hass)
    mp = reg.async_get_or_create("media_player", "androidtv_remote", "shield_mp", device_id=dev.id, config_entry=entry)
    rm = reg.async_get_or_create("remote", "androidtv_remote", "shield_rm", device_id=dev.id, config_entry=entry)
    hass.states.async_set(mp.entity_id, "on")
    hass.states.async_set(rm.entity_id, "on")
    _pip(hass)
    hass.states.async_set("media_player.adb", "idle")
    hass.states.async_set("media_player.plex", "paused", {"media_position": 600, "media_duration": 3600})
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": "media_player.plex", "adb": "media_player.adb", "remote": mp.entity_id}
    with patch("asyncio.sleep"):
        await play.control(hass, tv, "play_pause")
        await play.control(hass, tv, "skip", 30)
    assert sent == ["MEDIA_PLAY", ["MEDIA_FAST_FORWARD"]], sent


async def test_learns_keys_first_after_one_retry(hass):
    """The SHIELD with a PiPup that reports the playback but ignores pause: one slow retry, then keys at once."""
    from datetime import datetime, timezone
    adb, pip_calls = [], []
    plex = "media_player.plex"

    def set_plex(state):
        hass.states.async_set(plex, state, {"media_position": 600, "media_duration": 3600,
                                             "media_position_updated_at": datetime.now(timezone.utc).isoformat()})

    async def adb_cmd(call):
        adb.append(call.data["command"])
        set_plex("paused" if "PAUSE" in call.data["command"] else "playing")

    async def pip_svc(call):
        pip_calls.append(call.service)
        set_plex(hass.states.get(plex).state)   # reported again, nothing changed
    hass.services.async_register("androidtv", "adb_command", adb_cmd)
    hass.services.async_register("media_player", "media_pause", pip_svc)
    hass.services.async_register("media_player", "media_play", pip_svc)
    _pip(hass, playing=True)
    hass.states.async_set("media_player.adb", "idle")
    tv = {"name": "Theater", "pipup": "media_player.pip", "plex_client": plex, "adb": "media_player.adb"}
    with patch("asyncio.sleep"):
        set_plex("playing")
        await play.control(hass, tv, "pause")
        assert pip_calls == ["media_pause"] and adb == ["input keyevent KEYCODE_MEDIA_PAUSE"], "first: PiPup, then the ADB retry"
        assert play.keys_first(hass, tv)
        pip_calls.clear(); adb.clear()
        await play.control(hass, tv, "play")
    assert pip_calls == [] and adb == ["input keyevent KEYCODE_MEDIA_PLAY"], "then: the key at once"
