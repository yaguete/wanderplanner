"""Consultas Unsplash de portada: destino primero, genérico solo como fallback."""
from covers import GENERIC_COVER_PREFIX, GENERIC_COVER_QUERIES, unsplash_cover_search_query


def test_destination_search_keeps_place_landscape():
    q = unsplash_cover_search_query("austria")
    assert q == "austria travel landscape"


def test_generic_prefix_uses_suitcase_pool_not_landscape():
    q = unsplash_cover_search_query(f"{GENERIC_COVER_PREFIX}costa vasca")
    assert q in GENERIC_COVER_QUERIES
    assert "landscape" not in q
    assert "costa vasca" not in q


def test_generic_search_is_stable():
    seed = f"{GENERIC_COVER_PREFIX}cornualles, reino unido"
    assert unsplash_cover_search_query(seed) == unsplash_cover_search_query(seed)
