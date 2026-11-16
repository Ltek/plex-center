"""Calendar: Sonarr / Radarr through HA's own entries; episodes, one entry per movie release, de-duplicated."""

from datetime import datetime, timezone

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plex_center import arr

SONARR = [{"seriesId": 1, "seasonNumber": 2, "episodeNumber": 1, "title": "Rafter", "airDateUtc": "2026-03-10T02:00:00Z", "hasFile": False,
           "monitored": True, "series": {"title": "ONE PIECE", "tvdbId": 392276, "year": 2023, "network": "Netflix",
           "images": [{"coverType": "poster", "remoteUrl": "https://img/p.jpg", "url": "/MediaCover/1/poster.jpg"}]}}]
RADARR = [{"title": "Dune: Part Three", "year": 2026, "tmdbId": 1170608, "inCinemas": "2026-03-18T00:00:00Z", "digitalRelease": "2026-04-30T00:00:00Z",
           "physicalRelease": None, "hasFile": False, "monitored": True, "youTubeTrailerId": "abc", "images": [{"coverType": "fanart", "remoteUrl": "https://img/f.jpg"}]}]


def test_normalise():
    ev = arr.episode_event(SONARR[0])
    assert ev["title"] == "ONE PIECE" and ev["season"] == 2 and ev["premiere"] == "season" and ev["poster"] == "https://img/p.jpg" and ev["release"] == "episode"
    mv = arr.movie_events(RADARR[0])
    assert [(m["release"], m["at"]) for m in mv] == [("cinema", "2026-03-18"), ("digital", "2026-04-30")] and mv[0]["trailer"] == "abc"


async def test_calendar_from_ha_entries(hass, aioclient_mock):
    for app, url, key in (("sonarr", "http://s:8989", "S"), ("radarr", "http://r:7878", "R")):
        MockConfigEntry(domain=app, data={"url": url, "api_key": key, "verify_ssl": False}, title=app).add_to_hass(hass)
    MockConfigEntry(domain="radarr", data={"url": "http://r4k:7878", "api_key": "R4", "verify_ssl": False}, title="radarr 4k").add_to_hass(hass)
    aioclient_mock.get("http://s:8989/api/v3/calendar", json=SONARR)
    aioclient_mock.get("http://r:7878/api/v3/calendar", json=RADARR)
    aioclient_mock.get("http://r4k:7878/api/v3/calendar", json=RADARR)
    arr._CACHE.clear()
    res = await arr.async_calendar(hass, datetime(2026, 3, 1, tzinfo=timezone.utc), datetime(2026, 3, 31, tzinfo=timezone.utc))
    assert res["sources"] == {"sonarr": "ok", "radarr": "ok"}
    assert [(e["kind"], e["release"]) for e in res["events"]] == [("episode", "episode"), ("movie", "cinema")], "4K duplicate gone, April release out of range"
    assert all(c[3].get("X-Api-Key") in ("S", "R", "R4") for c in aioclient_mock.mock_calls), "key sent to the app only"
    assert arr.arr_available(hass) == {"sonarr": True, "radarr": True}


async def test_calendar_one_source_down(hass, aioclient_mock):
    MockConfigEntry(domain="sonarr", data={"url": "http://s:8989", "api_key": "S"}, title="s").add_to_hass(hass)
    aioclient_mock.get("http://s:8989/api/v3/calendar", status=500)
    arr._CACHE.clear()
    res = await arr.async_calendar(hass, datetime(2026, 3, 1, tzinfo=timezone.utc), datetime(2026, 3, 2, tzinfo=timezone.utc))
    assert res == {"events": [], "sources": {"sonarr": "error", "radarr": "missing"}}


def test_plex_status_in_plex_and_watched():
    from types import SimpleNamespace as NS

    ep = NS(ratingKey=11, viewCount=1)
    show = NS(ratingKey=10, episode=lambda season, episode: ep if (season, episode) == (2, 1) else (_ for _ in ()).throw(KeyError()))
    movie = NS(ratingKey=20, viewCount=0)

    def get_guid(kind):
        def g(guid):
            if kind == "show" and guid == "tvdb://5":
                return show
            if kind == "movie" and guid == "tmdb://7":
                return movie
            raise KeyError(guid)
        return g
    server = NS(library=NS(sections=lambda: [NS(type="movie", getGuid=get_guid("movie")), NS(type="show", getGuid=get_guid("show"))]))
    evs = [{"key": "a", "kind": "episode", "tvdb": 5, "season": 2, "episode": 1}, {"key": "b", "kind": "episode", "tvdb": 5, "season": 2, "episode": 2},
           {"key": "c", "kind": "movie", "tmdb": 7}, {"key": "d", "kind": "movie", "tmdb": 8}]
    out = arr.plex_status(server, evs)
    assert out["a"] == {"plex_key": "11", "plex_show": "10", "watched": True}
    assert out["b"] == {"plex_show": "10"} and out["c"] == {"plex_key": "20", "watched": False} and "d" not in out
