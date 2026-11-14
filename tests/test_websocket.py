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
BILL = movie(720622, "Bill & Ted's Excellent Adventure", offset=786000, day=3)
SEASON = NS(ratingKey=715099, type="season", title="Season 1", index=1, parentTitle="Fallout", parentRatingKey=715098, leafCount=8,
            viewedLeafCount=1, thumb=None, art=None, _server=SERVER, episodes=lambda: [episode(715100, "The End", 1, 1), EP2])
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
TV = Section(3, "TV", "show", [SHOW])
MUSIC = Section(4, "Music", "artist", [])
LR_SERVER = NS(library=NS(sections=lambda: [MOVIES, TV, MUSIC]), continueWatching=lambda: [EP2, BILL],
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
