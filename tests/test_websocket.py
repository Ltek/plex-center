"""Websocket API against fake plexapi objects (no Plex server needed)."""

from datetime import datetime
from types import SimpleNamespace as NS
from unittest.mock import patch

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plex_center.const import DOMAIN
from custom_components.plex_center.media import SAFE_LINK, app_link

SID = "6d60735f617529a9a566eff288ef0f94d063ff80"
SERVER = NS(machineIdentifier=SID)


def movie(key, title, **kw):
    return NS(ratingKey=key, type="movie", title=title, year=kw.get("year", 1989), duration=5391000, viewOffset=kw.get("offset", 0),
              viewCount=kw.get("views", 0), thumb=f"/library/metadata/{key}/thumb/1", art=f"/library/metadata/{key}/art/1",
              summary="Two dudes.", genres=[NS(tag="Comedy")], addedAt=datetime(2026, 11, kw.get("day", 1)), _server=SERVER,
              roles=[NS(tag="Keanu Reeves")], directors=[NS(tag="Stephen Herek")], extras=lambda: [NS(subtype="trailer", ratingKey=9)])


def episode(key, title, season, ep, offset=0):
    return NS(ratingKey=key, type="episode", title=title, grandparentTitle="Fallout", grandparentRatingKey=715098, parentIndex=season,
              parentRatingKey=715099, index=ep, duration=3930000, viewOffset=offset, viewCount=0, thumb=f"/library/metadata/{key}/thumb/1",
              grandparentThumb="/library/metadata/715098/thumb/1", art=None, grandparentArt="/library/metadata/715098/art/1", _server=SERVER,
              addedAt=datetime(2026, 11, 10))


EP2 = episode(715101, "The Target", 1, 2, offset=1200000)
EP1 = episode(715100, "The End", 1, 1)
BILL = movie(720622, "Bill & Ted's Excellent Adventure", offset=786000, day=3)
SEASON = NS(ratingKey=715099, type="season", title="Season 1", index=1, parentTitle="Fallout", parentRatingKey=715098, leafCount=8,
            viewedLeafCount=1, thumb=None, art=None, _server=SERVER, episodes=lambda: [EP1, EP2])
EP1.season = lambda: SEASON
SHOW = NS(ratingKey=715098, type="show", title="Fallout", year=2024, leafCount=16, viewedLeafCount=1, thumb="/library/metadata/715098/thumb/1",
          art=None, _server=SERVER, seasons=lambda: [SEASON], onDeck=lambda: EP2, roles=[], directors=[])


class Section:
    def __init__(self, key, title, type_, items):
        self.key, self.title, self.type, self._items = key, title, type_, items
        self.searches = []

    def search(self, **kw):
        self.searches.append(kw)
        items = [i for i in self._items if not kw.get("title") or kw["title"].lower() in i.title.lower()]
        if (kw.get("filters") or {}).get("unwatched"):
            items = [i for i in items if not getattr(i, "viewCount", 0)]
        return items[kw.get("container_start", 0):][: kw.get("maxresults") or None]

    def all(self):
        return self._items

    def recentlyAdded(self, maxresults=50):
        return self._items[:maxresults]

    def continueWatching(self):
        return [i for i in self._items if getattr(i, "viewOffset", 0)]


MOVIES = Section(2, "Kids Movies", "movie", [BILL, movie(1285, "The Princess Bride", views=1), movie(7718, "The Princess Bride")])
MOVIES.listFilterChoices = lambda field: {"genre": [NS(key="12", title="Comedy")], "decade": [NS(key="1980", title="1980s")],
                                          "contentRating": [NS(key="PG", title="PG")]}[field]
MOVIES.firstCharacter = lambda: [NS(title="B", size=1), NS(title="T", size=2)]
BILL.media = [NS(videoResolution="4k", audioChannels=8, parts=[NS(videoStreams=lambda: [NS(DOVIPresent=True)],
                                                                  audioStreams=lambda: [NS(displayTitle="TrueHD Atmos 7.1")])])]
BILL.audienceRating, BILL.audienceRatingImage = 9.1, "rottentomatoes://image.rating.upright"
MOVIES.hubs = lambda: [NS(hubIdentifier="movie.similar.720622", title="Because you watched Bill & Ted", type="movie", items=lambda: [BILL])]
TV = Section(3, "TV", "show", [SHOW])
MUSIC = Section(4, "Music", "artist", [])
BILL.librarySectionTitle = "Kids Movies"
LR_SERVER = NS(library=NS(sections=lambda: [MOVIES, TV, MUSIC], hubs=lambda: [NS(hubIdentifier="home.top", title="Top", type="mixed", items=lambda: [BILL, SHOW])]),
               search=lambda q, limit=None: [BILL, NS(type="artist", title="x")], continueWatching=lambda: [EP2, BILL],
               fetchItem=lambda k: {715098: SHOW, 720622: BILL, 715099: SEASON}[k],
               sessions=lambda: [NS(**{**vars(BILL), "usernames": ["LivingRoom"], "players": [NS(title="Living Room", product="Plex for Android (TV)", state="playing")]})])


@pytest.fixture
async def ws(hass, hass_ws_client):
    entry = MockConfigEntry(domain=DOMAIN, data={"server_id": SID}, unique_id=SID,
                            options={"tvs": [{"id": "living_room_tv", "name": "Living Room TV", "plex_user": "LivingRoom",
                                              "pipup": "media_player.living_room_tv"}]})
    entry.add_to_hass(hass)
    hass.states.async_set("media_player.living_room_tv", "on", {"click_service": True, "click_packages": ["com.plexapp.android"]})
    users = []

    async def fake_call(self, user, fn):
        users.append(user)
        return fn(LR_SERVER)

    with patch("custom_components.plex_center.plex.PlexConnections.async_call", fake_call):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        client = await hass_ws_client(hass)
        n = iter(range(1, 1000))

        async def send(**msg):
            await client.send_json({"id": next(n), **msg})
            return await client.receive_json()
        send.users = users
        yield send


async def test_config_lists_tvs_libraries_and_route(ws):
    r = await ws(type="plex_center/config")
    assert r["success"], r
    res = r["result"]
    assert res["tvs"][0]["id"] == "living_room_tv" and res["tvs"][0]["route"] == "pipup" and res["tvs"][0]["user"] == "LivingRoom"
    assert [lib["title"] for lib in res["libraries"]["LivingRoom"]] == ["Kids Movies", "TV"]  # music left out
    assert res["card_version"].startswith("v20")


async def test_items_page_search_unwatched_for_the_tvs_user(ws):
    r = await ws(type="plex_center/items", tv="living_room_tv", library="2", size=2)
    assert r["success"], r
    items = r["result"]["items"]
    assert len(items) == 2 and r["result"]["more"] is True
    bill = items[0]
    assert bill["link"] == f"plex://libraries/{SID}/movie/x/720622"
    assert bill["offset"] == 786 and bill["progress"] == 15 and bill["watched"] is False
    assert bill["poster"].startswith(f"/api/plex_center/image/{SID}?") and "authSig=" in bill["poster"]
    assert "token" not in str(items).lower()
    r = await ws(type="plex_center/items", tv="living_room_tv", library="Kids Movies", query="princess", unwatched=True)
    assert [i["key"] for i in r["result"]["items"]] == ["7718"]
    assert ws.users and set(ws.users) == {"LivingRoom"}


async def test_hubs_continue_watching_with_episode_links(ws):
    r = await ws(type="plex_center/hubs", tv="living_room_tv")
    assert r["success"], r
    cont = r["result"]["continue"]
    assert cont[0]["link"] == f"plex://libraries/{SID}/show/x/715098/s/1/715099/e/2/715101"
    assert cont[0]["show"] == "Fallout" and cont[0]["offset"] == 1200
    assert r["result"]["recent"][0]["key"] == "720622"


async def test_item_details_show_and_movie(ws):
    r = await ws(type="plex_center/item", tv="living_room_tv", key="715098")
    show = r["result"]
    assert show["seasons"][0]["title"] == "Season 1" and show["next"]["key"] == "715101"
    r = await ws(type="plex_center/item", tv="living_room_tv", key="720622")
    assert r["result"]["trailer_key"] == "9" and r["result"]["cast"] == ["Keanu Reeves"]
    r = await ws(type="plex_center/item", tv="living_room_tv", key="715099")
    assert [e["episode"] for e in r["result"]["episodes"]] == [1, 2]


async def test_sessions_and_random(ws):
    r = await ws(type="plex_center/sessions")
    s = r["result"][0]
    assert s["user"] == "LivingRoom" and s["player"] == "Living Room" and s["title"].startswith("Bill")
    r = await ws(type="plex_center/random", tv="living_room_tv", library="2")
    assert r["result"]["key"] in ("720622", "7718")


async def test_bad_key_is_rejected(ws):
    r = await ws(type="plex_center/item", tv="living_room_tv", key="1; drop")
    assert not r["success"]


def test_links_are_safe():
    assert app_link(SID, {"type": "movie", "key": "1"}) == f"plex://libraries/{SID}/movie/x/1"
    assert app_link(SID, {"type": "movie", "key": "1'; reboot"}) is None
    assert SAFE_LINK.match(app_link(SID, {"type": "episode", "key": "5"}))


async def test_search_filters_and_plex_hubs(ws):
    r = await ws(type="plex_center/search", tv="living_room_tv", query="bill")
    assert r["success"], r
    assert r["result"][0]["library"] == "Kids Movies" and r["result"][0]["items"][0]["key"] == "720622"
    r = await ws(type="plex_center/filters", tv="living_room_tv", library="2")
    assert r["result"]["genres"] == [{"value": "Comedy", "title": "Comedy"}] and r["result"]["decades"][0]["value"] == "1980"
    r = await ws(type="plex_center/plex_hubs", tv="living_room_tv", library="2")
    assert r["result"] == [{"id": "movie.similar.720622", "title": "Because you watched Bill & Ted"}]
    r = await ws(type="plex_center/plex_hubs", tv="living_room_tv", library="2", hub="movie.similar.720622")
    assert r["result"]["items"][0]["key"] == "720622"
    r = await ws(type="plex_center/plex_hubs", tv="living_room_tv", hub="home.top")
    assert [i["key"] for i in r["result"]["items"]] == ["720622", "715098"]


async def test_items_extra_filters(ws):
    await ws(type="plex_center/items", tv="living_room_tv", library="2", genre="Comedy", decade=1980, content_rating="PG", max_minutes=120)
    kw = MOVIES.searches[-1]
    assert kw["filters"] == {"genre": "Comedy", "decade": 1980, "contentRating": "PG", "duration<<": 7200000}


async def test_details_badges_ratings_next_episode_and_letters(ws):
    m = await ws(type="plex_center/item", tv="living_room_tv", key="720622")
    assert m["result"]["badges"] == ["4K", "Dolby Vision", "Atmos"]
    assert m["result"]["ratings"] == [{"source": "Rotten Tomatoes", "kind": "audience", "value": 9.1, "fresh": True}]
    from custom_components.plex_center.media import details
    assert details(EP1)["next"]["key"] == "715101"
    m = await ws(type="plex_center/letters", tv="living_room_tv", library="2")
    assert m["result"]["letters"] == [{"letter": "B", "size": 1, "start": 0}, {"letter": "T", "size": 2, "start": 1}]


def test_split_continue_next_episode():
    """Continue: in progress below the watched %, the latest per show; Next: the next unstarted episode per show."""
    from custom_components.plex_center.websocket import split_continue

    def ep(key, show, season, n, offset=0, views=0):
        return NS(ratingKey=key, type="episode", grandparentRatingKey=show, grandparentTitle=str(show), parentIndex=season, index=n,
                  duration=1000, viewOffset=offset, viewCount=views)

    a2, a3 = ep(1, "A", 1, 2, offset=300), ep(2, "A", 1, 3, offset=200)        # two in progress: keep the latest (S1E3)
    b5 = ep(3, "B", 2, 5, offset=970)                                          # 97 %: watched -> its next episode
    b6 = ep(4, "B", 2, 6)
    c1 = ep(5, "C", 1, 1)                                                      # not started: next episode
    film_done = NS(ratingKey=6, type="movie", duration=1000, viewOffset=960, viewCount=0)
    film = NS(ratingKey=7, type="movie", duration=1000, viewOffset=400, viewCount=0)
    a4 = ep(8, "A", 1, 4)                                                      # A is in progress: not in Next
    cont, nxt = split_continue([a2, b5, film_done, a3, c1, film, a4], 95, lambda e: b6 if e is b5 else None)
    assert [x.ratingKey for x in cont] == [2, 7]
    assert [x.ratingKey for x in nxt] == [4, 5]
    cont, nxt = split_continue([b5], 98, lambda e: b6)                        # 97 % < 98 %: still continue
    assert [x.ratingKey for x in cont] == [3] and nxt == []


def test_recently_added_tv_gives_episodes_newest_per_show():
    from custom_components.plex_center.websocket import _recent_in

    def ep(key, show):
        return NS(ratingKey=key, type="episode", grandparentRatingKey=show)

    calls = []

    class TVSec:
        type = "show"

        def search(self, **kw):
            calls.append(kw)
            return [ep(1, "A"), ep(2, "A"), ep(3, "B"), ep(4, "C")]

    assert [e.ratingKey for e in _recent_in(TVSec(), 2)] == [1, 3]
    assert calls[0]["libtype"] == "episode" and calls[0]["sort"] == "addedAt:desc"
    assert _recent_in(MOVIES, 1)[0] is BILL
