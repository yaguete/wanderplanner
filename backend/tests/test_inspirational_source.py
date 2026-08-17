from inspirational_source import is_inspirational_source_url, is_institutional_source_url

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
    "https://www.getyourguide.com/vienna-l26/",
    "https://en.wikipedia.org/wiki/Belvedere,_Vienna",
    "https://www.tripadvisor.es/Attraction_Review-g190454-d195147",
    "not-a-url",
    "ftp://lacosmopolilla.com/ruta-islandia-en-10-dias/",
    "https://lacosmopolilla.com/",
)


def test_articles_are_inspirational():
    for url in ARTICLES:
        assert is_inspirational_source_url(url), url


def test_official_ticket_and_homepages_are_not():
    for url in NOISE:
        assert not is_inspirational_source_url(url), url


def test_institutional_flag():
    assert is_institutional_source_url("https://www.exteriores.gob.es/fichas")
    assert not is_institutional_source_url(
        "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/"
    )
