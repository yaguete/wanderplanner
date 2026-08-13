"""
Dominios curados para GET /sources/suggest (pestaña «Busca un destino»).

Solo hosts, nunca nombres en UI. El escalón de caché solo expone extracciones
cuyo host está aquí: así el buscador público no indexa URLs privadas pegadas
por usuarios. Ampliar esta tupla es el catálogo.

LANDING_SEED_URLS alimenta `python -m scripts.seed_landing_sources`.
"""

from __future__ import annotations

LANDING_SOURCE_DOMAINS: tuple[str, ...] = (
    "unblogdeviajes.com",
    "japonismo.com",
    "elrincondemiki.com",
    "losviajesdedomi.com",
    "viajablog.com",
    "mochileros.org",
    "3dosisdeviaje.com",
    "guiadeviaje.es",
    "traveler.es",
    "viajes.nationalgeographic.com.es",
)

# Itinerarios reales (o lo más cerca) de esos dominios. El script de semilla
# sigue si una URL 404; editar esta lista es el mantenimiento del catálogo.
LANDING_SEED_URLS: tuple[str, ...] = (
    "https://unblogdeviajes.com/ruta-por-japon/",
    "https://unblogdeviajes.com/que-ver-en-vietnam/",
    "https://unblogdeviajes.com/islandia-en-coche/",
    "https://unblogdeviajes.com/marruecos-itinerario/",
    "https://unblogdeviajes.com/tailandia-itinerario/",
    "https://unblogdeviajes.com/portugal-itinerario/",
    "https://unblogdeviajes.com/nueva-zelanda-en-furgoneta/",
    "https://unblogdeviajes.com/peru-itinerario/",
    "https://unblogdeviajes.com/italia-norte-itinerario/",
    "https://unblogdeviajes.com/grecia-itinerario/",
    "https://unblogdeviajes.com/croacia-itinerario/",
    "https://unblogdeviajes.com/canada-rockies/",
    "https://www.japonismo.com/blog/itinerario-japon-15-dias",
    "https://www.japonismo.com/blog/itinerario-japon-7-dias",
    "https://www.japonismo.com/blog/itinerario-tokio",
    "https://www.japonismo.com/blog/itinerario-osaka-kyoto",
    "https://elrincondemiki.com/itinerario-japon/",
    "https://elrincondemiki.com/itinerario-vietnam/",
    "https://elrincondemiki.com/itinerario-islandia/",
    "https://elrincondemiki.com/itinerario-tailandia/",
    "https://losviajesdedomi.com/japon-15-dias/",
    "https://losviajesdedomi.com/vietnam-itinerario/",
    "https://losviajesdedomi.com/marruecos-10-dias/",
    "https://viajablog.com/que-ver-en-portugal/",
    "https://viajablog.com/itinerario-andalucia/",
    "https://viajablog.com/que-ver-en-sicilia/",
    "https://mochileros.org/ruta-sudeste-asiatico/",
    "https://mochileros.org/mochilero-en-patagonia/",
    "https://www.traveler.es/viajes/viajes-de-novios/articulos/itinerario-japon-dos-semanas",
    "https://www.traveler.es/escapadas/articulos/itinerario-azores",
    "https://viajes.nationalgeographic.com.es/a/itinerario-islandia-10-dias",
    "https://viajes.nationalgeographic.com.es/a/ruta-por-vietnam",
    "https://guiadeviaje.es/japon/",
    "https://guiadeviaje.es/islandia/",
    "https://3dosisdeviaje.com/itinerario-georgia/",
    "https://3dosisdeviaje.com/itinerario-sri-lanka/",
)
