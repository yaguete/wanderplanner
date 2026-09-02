from inspirational_source import (
    host_is_feedable,
    is_inspirational_source_url,
    is_institutional_source_url,
)

ARTICLES = (
    "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/",
    "https://www.losviajesdeclaudia.com/japon/guia-ruta-por-japon-3-semanas-21-dias/",
    "https://japonismo.com/blog/itinerario-tokio-kioto-osaka",
    "https://theperpetualtraveler.com/eisriesenwelt-ice-caves-salzburg/",
    "https://lacosmopolilla.com/japon/",
)

NOISE = (
    "https://www.exteriores.gob.es/fichas",
    "https://www.gov.uk/foreign-travel-advice",
    "https://eisriesenwelt.axess.shop/en",
    "https://belvedere.at",
    "https://www.belvedere.at/en",
    "https://belvedere.at/en/tickets",
    "https://mozarteum.at",
    "https://www.mozarteum.at/en/",
    "https://festung-hohensalzburg.at",
    "https://www.burg-hohenwerfen.at/",
    "https://sisimuseum-hofburg.at",
    "https://www.stephansdom.at",
    "https://tickets.belvedere.at/vienna",
    "https://www.booking.com/hotel/at/sacher.html",
    "https://www.airbnb.es/s/Vienna/homes",
    "https://www.homeexchange.com/search-v2/Vienna",
    "https://www.getyourguide.com/vienna-l26/",
    "https://en.wikipedia.org/wiki/Belvedere,_Vienna",
    "https://www.tripadvisor.es/Attraction_Review-g190454-d195147",
    "not-a-url",
    "ftp://lacosmopolilla.com/ruta-islandia-en-10-dias/",
    "https://lacosmopolilla.com/",
    "https://www.instagram.com/lacosmopolilla",
    "https://www.instagram.com/stories/lacosmopolilla/123",
    "https://www.instagram.com/explore/tags/cornwall",
)

IG_POSTS = (
    "https://www.instagram.com/p/DblDYKZjOhx/",
    "https://www.instagram.com/reel/DbYAsLVM7Yd/",
    "https://www.instagram.com/reels/DbYAsLVM7Yd/",
    "https://www.instagram.com/lacosmopolilla/p/DblDYKZjOhx/",
    "https://www.instagram.com/lacosmopolilla/reel/DbYAsLVM7Yd/",
)


def test_articles_are_inspirational():
    for url in ARTICLES:
        assert is_inspirational_source_url(url), url
    for url in IG_POSTS:
        assert is_inspirational_source_url(url), url


def test_official_ticket_and_homepages_are_not():
    for url in NOISE:
        assert not is_inspirational_source_url(url), url


def test_institutional_flag():
    assert is_institutional_source_url("https://www.exteriores.gob.es/fichas")
    assert not is_institutional_source_url(
        "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/"
    )


def test_host_is_feedable():
    assert host_is_feedable("lacosmopolilla.com")
    assert host_is_feedable("sinmapa.net")
    assert not host_is_feedable("booking.com")
    assert not host_is_feedable("instagram.com")
    assert not host_is_feedable("exteriores.gob.es")
    assert not host_is_feedable("")
