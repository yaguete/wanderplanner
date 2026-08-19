import assert from "node:assert/strict"
import {
  isInspirationalSourceUrl,
  isInstitutionalSourceUrl,
} from "./inspirational-source"

function yes(url: string) {
  assert.equal(isInspirationalSourceUrl(url), true, `expected inspirational: ${url}`)
}

function no(url: string) {
  assert.equal(isInspirationalSourceUrl(url), false, `expected not inspirational: ${url}`)
}

yes("https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/")
yes("https://www.losviajesdeclaudia.com/japon/guia-ruta-por-japon-3-semanas-21-dias/")
yes("https://japonismo.com/blog/itinerario-tokio-kioto-osaka")
yes("https://theperpetualtraveler.com/eisriesenwelt-ice-caves-salzburg/")
yes("https://lacosmopolilla.com/japon/")

no("https://www.exteriores.gob.es/fichas")
no("https://www.gov.uk/foreign-travel-advice")
assert.equal(isInstitutionalSourceUrl("https://www.exteriores.gob.es/fichas"), true)

no("https://eisriesenwelt.axess.shop/en")
no("https://belvedere.at")
no("https://www.belvedere.at/en")
no("https://belvedere.at/en/tickets")
no("https://mozarteum.at")
no("https://www.mozarteum.at/en/")
no("https://festung-hohensalzburg.at")
no("https://www.burg-hohenwerfen.at/")
no("https://sisimuseum-hofburg.at")
no("https://www.stephansdom.at")
no("https://tickets.belvedere.at/vienna")
no("https://www.booking.com/hotel/at/sacher.html")
no("https://www.getyourguide.com/vienna-l26/")
no("https://en.wikipedia.org/wiki/Belvedere,_Vienna")
no("https://www.tripadvisor.es/Attraction_Review-g190454-d195147")
no("not-a-url")
no("ftp://lacosmopolilla.com/ruta-islandia-en-10-dias/")

yes("https://www.instagram.com/p/DblDYKZjOhx/")
yes("https://www.instagram.com/reel/DbYAsLVM7Yd/")
yes("https://www.instagram.com/reels/DbYAsLVM7Yd/")
yes("https://www.instagram.com/lacosmopolilla/p/DblDYKZjOhx/")
yes("https://www.instagram.com/lacosmopolilla/reel/DbYAsLVM7Yd/")
no("https://www.instagram.com/lacosmopolilla")
no("https://www.instagram.com/stories/lacosmopolilla/123")
no("https://www.instagram.com/explore/tags/cornwall")

assert.equal(
  isInspirationalSourceUrl("https://lacosmopolilla.com/"),
  false,
  "blog homepage is not an article",
)

console.log("inspirational-source: ok")
