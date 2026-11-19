"""Other apps (HBO Max, Prime Video...): the title from PiPup / ADB / Cast, and the poster lookup."""

from homeassistant.helpers import entity_registry as er

from custom_components.plex_center import app_media
from custom_components.plex_center.app_media import async_artwork, async_now_title, norm_title, parse_media_session
from custom_components.plex_center.tvs import fill_remotes

DUMP = """package=com.wbd.stream
      metadata: size=5, description=Despicable Me, , null
      package=com.android.bluetooth
      metadata: null"""
TV = {"id": "lr", "name": "Living Room TV", "pipup": "media_player.living_room_tv",
      "adb": "media_player.lr_adb", "cast": "media_player.googletv_livingroom"}


def test_parse_and_norm():
    assert parse_media_session(DUMP) == "Despicable Me"
    assert parse_media_session(DUMP, "com.wbd.stream") == "Despicable Me"
    assert parse_media_session(DUMP, "com.android.bluetooth") is None
    assert parse_media_session("package=x\n metadata: size=1, description=null, , null") is None
    assert norm_title("The Office (US)") == norm_title("office: US") == "office us"


async def test_title_priority_pipup_adb_cast(hass):
    hass.states.async_set(TV["cast"], "playing", {"media_title": "From Cast", "app_name": "HBO Max"})
    hass.states.async_set(TV["adb"], "playing", {"app_id": "com.wbd.stream", "app_name": "com.wbd.stream", "adb_response": DUMP})
    hass.states.async_set(TV["pipup"], "playing", {"media_title": "From PiPup", "app_name": "HBO Max", "app_id": "com.wbd.stream"})
    got = await async_now_title(hass, TV)
    assert got["title"] == "From PiPup" and got["source"] == "pipup" and got["app"] == "HBO Max"
    hass.states.async_set(TV["pipup"], "playing", {"app_name": "HBO Max"})         # PiPup has no title: ADB's media session
    got = await async_now_title(hass, TV)
    assert got["title"] == "Despicable Me" and got["source"] == "adb" and got["app"] == "HBO Max"
    hass.states.async_set(TV["adb"], "playing", {"app_id": "com.wbd.stream"})      # nothing from ADB either: Cast
    got = await async_now_title(hass, TV, read_session=False)
    assert got["title"] == "From Cast" and got["source"] == "cast"
    hass.states.async_set(TV["pipup"], "unavailable", {})                           # PiPup not working: still Cast
    assert (await async_now_title(hass, TV, read_session=False))["title"] == "From Cast"
    hass.states.async_set(TV["cast"], "playing", {"media_series_title": "The Office", "media_title": "Pilot"})
    got = await async_now_title(hass, TV, read_session=False)
    assert got["title"] == "The Office" and got["series"] and got["episode"] == "Pilot"


async def test_adb_reads_the_media_session(hass):
    hass.states.async_set(TV["adb"], "playing", {"app_id": "com.wbd.stream"})
    calls = []

    async def adb(call):
        calls.append(call.data["command"])
        hass.states.async_set(TV["adb"], "playing", {"app_id": "com.wbd.stream", "adb_response": DUMP})
    hass.services.async_register("androidtv", "adb_command", adb)
    app_media._DUMPED.clear()
    got = await async_now_title(hass, {"id": "x", "adb": TV["adb"]})
    assert got["title"] == "Despicable Me" and "dumpsys media_session" in calls[0]
    hass.states.async_set(TV["adb"], "playing", {"app_id": "com.wbd.stream"})
    await async_now_title(hass, {"id": "x", "adb": TV["adb"]})
    assert len(calls) == 1, "rate limited"


class _Conn:
    def __init__(self, result=None, fail=False):
        self.result, self.fail, self.calls = result, fail, 0

    async def async_call(self, user, fn):
        self.calls += 1
        if self.fail:
            raise RuntimeError("Plex down")
        return self.result


async def test_artwork_falls_through_and_caches(hass, monkeypatch):
    app_media._CACHE.clear()
    arr = []

    async def fake_arr(hass_, title, series):
        arr.append(title)
        return {"type": "movie", "title": title, "poster": "https://image.tmdb.org/p.jpg", "found": "radarr"}
    monkeypatch.setattr(app_media, "arr_lookup", fake_arr)
    got = await async_artwork(hass, _Conn(fail=True), "", "Despicable Me", False, None)   # Plex fails: Radarr answers
    assert got["found"] == "radarr" and arr == ["Despicable Me"]
    await async_artwork(hass, _Conn(fail=True), "", "despicable me", False, None)
    assert arr == ["Despicable Me"], "cached"
    plex = _Conn({"title": "Up", "poster": "/p", "found": "plex"})
    assert (await async_artwork(hass, plex, "", "Up", False, None))["found"] == "plex" and "Up" not in arr


async def test_arr_lookup_exact_title(hass, monkeypatch):
    rows = [{"title": "Despicable Me 2", "images": [{"coverType": "poster", "remoteUrl": "https://x/2.jpg"}]},
            {"title": "Despicable Me", "year": 2010, "images": [{"coverType": "poster", "remoteUrl": "https://x/1.jpg"},
                                                                {"coverType": "fanart", "remoteUrl": "https://x/f.jpg"}]}]
    monkeypatch.setattr(app_media, "arr_entries", lambda h: {"radarr": [object()]})

    async def fetch(h, entry, path, params):
        return rows
    monkeypatch.setattr(app_media, "_fetch", fetch)
    got = await app_media.arr_lookup(hass, "Despicable Me", False)
    assert got["poster"] == "https://x/1.jpg" and got["art"] == "https://x/f.jpg" and got["year"] == 2010
    assert await app_media.arr_lookup(hass, "Minions", False) is None


def test_fill_finds_the_cast_player(hass):
    reg = er.async_get(hass)
    cast = reg.async_get_or_create("media_player", "cast", "c1", suggested_object_id="googletv_livingroom").entity_id
    out = fill_remotes(hass, [{"id": "lr", "name": "Living Room TV", "pipup": "media_player.living_room_tv"}])
    assert out[0]["cast"] == cast
    assert fill_remotes(hass, out) is None
