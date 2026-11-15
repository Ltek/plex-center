"""The bundled card is served with no-cache + ETag, and its version is reported."""

from pathlib import Path

from custom_components.plex_center.card_view import card_file

JS = Path(__file__).parent.parent / "custom_components" / "plex_center" / "frontend" / "plex-center-card.js"


def test_card_file_version_and_etag():
    body, etag, version = card_file(JS)
    assert body.startswith(b"/") and etag.startswith('"') and version.startswith("v20")
    assert card_file(JS)[1] == etag


async def test_card_view_no_cache_and_304(hass, hass_client_no_auth):
    from homeassistant.setup import async_setup_component

    from custom_components.plex_center.card_view import PlexCardView

    assert await async_setup_component(hass, "http", {})
    hass.http.register_view(PlexCardView(JS))
    client = await hass_client_no_auth()
    r = await client.get("/plex_center/plex-center-card.js?v=x")
    assert r.status == 200 and r.headers["Cache-Control"] == "no-cache" and "javascript" in r.headers["Content-Type"]
    r2 = await client.get("/plex_center/plex-center-card.js", headers={"If-None-Match": r.headers["ETag"]})
    assert r2.status == 304
