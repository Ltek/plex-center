"""TV detection, user matching and routes."""

from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er

from custom_components.plex_center.tvs import detect_tvs, match_user, real_playback, route_for

USERS = [{"username": "", "title": "Owner"}, {"username": "LivingRoom"}, {"username": "PlayRoom"}, {"username": "MediaRoom"}]


async def _setup(hass):
    reg, areas = er.async_get(hass), ar.async_get(hass)
    lr = areas.async_create("Living Room").id
    def add(platform, uid, object_id, area=None, name=None):
        e = reg.async_get_or_create("media_player", platform, uid, suggested_object_id=object_id)
        if area:
            reg.async_update_entity(e.entity_id, area_id=area)
        hass.states.async_set(e.entity_id, "on", {"friendly_name": name or object_id})
        return e.entity_id
    ids = {
        "pip_lr": add("pipup", "p1", "living_room_tv", lr, "Living Room TV"),
        "pip_pr": add("pipup", "p2", "play_room_2", None, "Play Room"),
        "adb_lr": add("androidtv", "a1", "living_room_adb_living_room_tv_192_168_2_53", lr, "Living Room ADB"),
        "adb_th": add("androidtv", "a2", "theater_shield", None, "Theater SHIELD"),
        "plex_lr": add("plex", "x1", "plex_livingroom_plex_for_android_tv_living_room"),
        "plex_pr": add("plex", "x2", "plex_playroom_plex_for_android_tv_smart_tv_pro"),
    }
    return ids


async def test_detect_pairs_by_area_then_name(hass):
    ids = await _setup(hass)
    tvs = detect_tvs(hass, USERS)
    got = {t["name"]: t for t in tvs}
    assert got["Living Room TV"]["adb"] == ids["adb_lr"]
    assert got["Living Room TV"]["plex_client"] == ids["plex_lr"]
    assert got["Living Room TV"]["plex_user"] == "LivingRoom"
    assert got["Play Room"]["plex_client"] == ids["plex_pr"]
    assert got["Play Room"]["plex_user"] == "PlayRoom"
    assert got["Theater SHIELD"]["adb"] == ids["adb_th"] and "pipup" not in got["Theater SHIELD"]
    assert len({t["id"] for t in tvs}) == 3


def test_match_user():
    assert match_user("Living Room TV", USERS) == "LivingRoom"
    assert match_user("Media Room Shield", USERS) == "MediaRoom"
    assert match_user("Kitchen", USERS) == ""


async def test_routes(hass):
    hass.states.async_set("media_player.p", "on", {"click_service": True, "click_packages": ["com.plexapp.android"]})
    hass.states.async_set("media_player.p0", "on", {"click_service": False})
    hass.states.async_set("media_player.a", "idle", {})
    hass.states.async_set("media_player.web", "idle", {"supported_features": 1 | 512 | 4096})
    hass.states.async_set("media_player.tvplex", "idle", {"supported_features": 131584})
    assert route_for(hass, {"pipup": "media_player.p", "adb": "media_player.a", "plex_client": "media_player.tvplex"}) == "pipup"
    assert route_for(hass, {"pipup": "media_player.p0", "adb": "media_player.a"}) == "adb"
    assert route_for(hass, {"pipup": "media_player.p0"}) == "open"
    assert route_for(hass, {"plex_client": "media_player.web"}) == "plex"
    assert route_for(hass, {"pipup": "media_player.p", "adb": "media_player.a", "route": "adb"}) == "adb"
    assert route_for(hass, {"plex_client": "media_player.tvplex"}) is None


def test_real_playback():
    class S:
        def __init__(self, state, d=None):
            self.state, self.attributes = state, ({"media_duration": d} if d is not None else {})
    assert not real_playback(S("playing", 30))
    assert real_playback(S("playing", 5391))
    assert real_playback(S("paused"))
    assert not real_playback(S("idle", 5391))


def test_fill_remotes_by_name(hass):
    from homeassistant.helpers import entity_registry as er

    from custom_components.plex_center.tvs import fill_remotes, tv_on, tv_playing

    reg = er.async_get(hass)
    reg.async_get_or_create("media_player", "androidtv_remote", "lr-remote", suggested_object_id="androidtv_livingroom")
    tvs = [{"id": "living_room_tv", "name": "Living Room TV", "pipup": "media_player.living_room_tv"},
           {"id": "shield", "name": "Shield", "adb": "media_player.theater_shield", "remote": "media_player.x"}]
    out = fill_remotes(hass, tvs)
    assert out[0]["remote"] == "media_player.androidtv_livingroom" and out[1]["remote"] == "media_player.x"
    assert fill_remotes(hass, out) is None
    # power comes from the TV's own players, never the Plex player
    tv = {**out[0], "plex_client": "media_player.plex"}
    hass.states.async_set("media_player.living_room_tv", "off", {})
    hass.states.async_set("media_player.androidtv_livingroom", "off", {})
    hass.states.async_set("media_player.plex", "paused", {"media_duration": 2626})
    assert tv_on(hass, tv) is False and tv_playing(hass, tv) is False
    hass.states.async_set("media_player.androidtv_livingroom", "on", {})
    assert tv_on(hass, tv) is True
    assert tv_on(hass, {"plex_client": "media_player.plex"}) is None
