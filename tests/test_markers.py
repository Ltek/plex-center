"""Markers: intro / credits read once; the credits event fires when the position crosses the credits; the TV's
scene runs; resuming inside the credits doesn't fire it. And the search action returns results."""

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.plex_center.markers import EVENT_CREDITS, Markers, parse_markers

TV = {"id": "th", "name": "Theater", "plex_client": "media_player.plex_th", "plex_user": "Theater",
      "credits_entity": "scene.lights_up"}


def m(kind, start, end, final=False):
    return SimpleNamespace(type=kind, start=start * 1000, end=end * 1000, final=final)


def test_parse_markers() -> None:
    item = SimpleNamespace(markers=[m("intro", 30, 90), m("credits", 100, 120), m("credits", 3400, 3600, final=True),
                                    m("commercial", 10, 20), m("intro", 50, 40)])
    assert parse_markers(item) == {"intro": [30, 90], "credits": [3400, 3600]}
    assert parse_markers(SimpleNamespace(markers=[m("credits", 100, 120), m("credits", 3000, 3100)]))["credits"] == [3000, 3100]
    assert parse_markers(SimpleNamespace()) == {"intro": None, "credits": None}


def _player(hass: HomeAssistant, pos: float, state: str = "playing", key: str = "42") -> None:
    hass.states.async_set("media_player.plex_th", state, {"media_content_id": key, "media_title": "Ratatouille",
                                                         "media_position": pos, "media_duration": 3600,
                                                         "media_position_updated_at": dt_util.utcnow().isoformat()})


async def test_credits_event_and_scene(hass: HomeAssistant) -> None:
    conn = MagicMock()
    conn.async_call = AsyncMock(return_value={"intro": None, "credits": [3400, 3600]})
    events: list[Any] = []
    hass.bus.async_listen(EVENT_CREDITS, lambda e: events.append(e.data))
    scene = []
    hass.services.async_register("scene", "turn_on", lambda call: scene.append(call.data["entity_id"]))
    _player(hass, 3390)
    mk = Markers(hass, conn)
    mk.track([TV])
    await hass.async_block_till_done()
    assert conn.async_call.await_count == 1 and mk.get("42")["credits"] == [3400, 3600], "read once, cached"
    mk._tick()
    assert events == [], "not yet"
    _player(hass, 3401)
    mk._tick()
    await hass.async_block_till_done()
    assert len(events) == 1 and events[0]["tv"] == "th" and events[0]["key"] == "42" and events[0]["title"] == "Ratatouille"
    assert scene == ["scene.lights_up"]
    _player(hass, 3402)
    mk._tick()
    await hass.async_block_till_done()
    assert len(events) == 1, "once per title"
    mk.stop()


async def test_resumed_inside_the_credits_does_not_fire(hass: HomeAssistant) -> None:
    conn = MagicMock()
    conn.async_call = AsyncMock(return_value={"intro": None, "credits": [3400, 3600]})
    events: list[Any] = []
    hass.bus.async_listen(EVENT_CREDITS, lambda e: events.append(e))
    _player(hass, 3500)
    mk = Markers(hass, conn)
    mk.track([{**TV, "credits_entity": None}])
    await hass.async_block_till_done()
    mk._tick()
    _player(hass, 3501)
    mk._tick()
    await hass.async_block_till_done()
    assert events == []
    mk.stop()


async def test_search_action(hass: HomeAssistant, monkeypatch) -> None:
    from custom_components.plex_center import services

    hit = SimpleNamespace(ratingKey=7, type="movie", title="Ratatouille", year=2007, viewCount=1, librarySectionTitle="Movies",
                          duration=6660000, viewOffset=None, addedAt=None)
    show = SimpleNamespace(ratingKey=8, type="show", title="Rat Patrol", year=1966, leafCount=4, viewedLeafCount=0,
                           librarySectionTitle="TV Shows", duration=None, viewOffset=None, addedAt=None)
    server = MagicMock()
    server.search.return_value = [hit, show, SimpleNamespace(type="artist", title="x")]
    conn = MagicMock()

    async def call(user, fn):
        assert user == "Theater"
        return fn(server)
    conn.async_call = call
    entry = SimpleNamespace(runtime_data=SimpleNamespace(conn=conn, tvs=[TV]))
    monkeypatch.setattr(services, "find_tv", lambda h, w: (entry, TV))
    services.async_register(hass)
    out = await hass.services.async_call("plex_center", "search", {"query": "rat", "tv": "Theater"}, blocking=True, return_response=True)
    assert [r["key"] for r in out["results"]] == ["7", "8"] and out["results"][0]["watched"] is True and out["results"][0]["library"] == "Movies"
    out = await hass.services.async_call("plex_center", "search", {"query": "rat", "tv": "Theater", "type": "show"}, blocking=True, return_response=True)
    assert [r["title"] for r in out["results"]] == ["Rat Patrol"]
