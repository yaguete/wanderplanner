import assert from "node:assert/strict"
import { curateArticleHtml, splitTopLevelBlocks } from "./chronicle-html"

function curated(html: string): string {
  return curateArticleHtml(html)
}

function assertKeeps(html: string, needle: string, msg?: string) {
  const out = curated(html)
  assert.ok(out.includes(needle), msg ?? `expected to keep ${JSON.stringify(needle)}\n---\n${out}`)
}

function assertDrops(html: string, needle: string, msg?: string) {
  const out = curated(html)
  assert.ok(!out.includes(needle), msg ?? `expected to drop ${JSON.stringify(needle)}\n---\n${out}`)
}

const BODY =
  "<p>Sabemos que vas a viajar a Granada para visitar la Alhambra. Es lo normal, lo que hicimos nosotros y lo que hace todo el mundo. Lo que tal vez no sepas es que hay monumentos y museos gratis.</p>"

{
  const html = `
    <img src="" alt="">
    <p><a href="https://www.iatiseguros.com/x">5% de descuento en tu seguro IATI por ser lector de Salta Conmigo</a></p>
    <p><a href="/europa">Europa</a> | <a href="/espana">España</a> | <a href="/andalucia">Andalucia</a> | <a href="/granada">Granada</a></p>
    <h1>Monumentos y museos gratis en Granada</h1>
    ${BODY}
  `
  assertDrops(html, "IATI")
  assertDrops(html, "Europa")
  assertDrops(html, 'src=""')
  assertKeeps(html, "Monumentos y museos gratis en Granada")
  assertKeeps(html, "viajar a Granada")
}

{
  const html = `
    <p>3,9K</p>
    <p>Actualizado el 9 agosto 2025</p>
    <p>Granada es cultural, histórica, diversa y sorprendente. Una ciudad para perderse, para comer, para que ver en Granada sin prisa y volver a mirar el mismo patio diez veces.</p>
    <img src="https://www.sinmapa.net/wp-content/uploads/granada.jpg" alt="Granada">
  `
  assertDrops(html, "3,9K")
  assertDrops(html, "Actualizado el 9 agosto 2025")
  assertKeeps(html, "Granada es cultural")
  assertKeeps(html, "sinmapa.net")
}

{
  const html = `
    <h1>Mejores Bares de Tapas por Granada ❤️ Guía de una Granaína [2026]</h1>
    <ul>
      <li>
        <a href="https://lacosmopolilla.com/author/cosmopolilla-wp/">
          <img alt="Imagen de cosmopolilla" src="https://secure.gravatar.com/avatar/abc?s=96&amp;d=retro&amp;r=g">
          cosmopolilla
        </a>
      </li>
      <li>16 diciembre, 2025</li>
    </ul>
    <p>⚠️ Yo siempre viajo con seguro médico e internet en el móvil. Empieza a planificar el tuyo con estos descuentos:</p>
    <ul>
      <li>🛟<a href="https://heymondo.es/x"><strong>-5% en tu seguro de viaje</strong></a> Heymondo (-20% si viajáis en familia, o en grupo).</li>
      <li>📶<a href="https://holafly.com/x"><strong>-5% en tu eSIM de Holafly</strong></a></li>
    </ul>
    <p>Recuerdo cuando me fui a vivir a Madrid. Mis nuevos amigos me contaban la sorpresa de su primer viaje a Granada. Ese momento de entrar a un bar, pedir una «Alhambra» y que a la cerveza le acompañe una generosa tapa.</p>
  `
  assertKeeps(html, "Mejores Bares de Tapas")
  assertDrops(html, "gravatar.com")
  assertDrops(html, "16 diciembre, 2025")
  assertDrops(html, "Heymondo")
  assertDrops(html, "Holafly")
  assertDrops(html, "seguro médico e internet")
  assertKeeps(html, "Recuerdo cuando me fui a vivir a Madrid")
}

{
  const html = `
    <h1>Ruta por Japón</h1>
    <h2>Día 1 · Tokio</h2>
    <p>Empezamos en Shinjuku, con un café y el cruce de Shibuya un poco más tarde, cuando baja la luz y la ciudad se enciende.</p>
  `
  const out = curated(html)
  assert.ok(out.includes("Ruta por Japón"))
  assert.ok(out.includes("Día 1"))
  assert.ok(out.includes("Shinjuku"))
}

{
  const html = `
    <p>Granada es cultural, histórica, diversa y sorprendente, y por eso esta guía recorre el centro, el Albayzín y el Sacromonte con calma.</p>
    <p>Más adelante te cuento también el truco de Heymondo que uso yo siempre, pero primero vamos con los imprescindibles del primer día.</p>
  `
  assertKeeps(html, "Heymondo", "no recortar un afiliado que aparece ya en el cuerpo")
}

{
  const html = `<p>Solo un párrafo corto.</p>`
  assert.equal(curated(html), html, "un solo bloque se deja igual")
}

{
  const html = ""
  assert.equal(curated(html), html)
}

{
  const blocks = splitTopLevelBlocks(
    `<p>Uno</p><ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><img src="https://x.test/a.jpg" alt="">`,
  )
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0]!.tag, "p")
  assert.equal(blocks[1]!.tag, "ul")
  assert.ok(blocks[1]!.html.includes("<ul>"))
  assert.equal(blocks[2]!.tag, "img")
}

{
  const html = `<p>3,9K</p><p>Actualizado el 9 agosto 2025</p>`
  assert.equal(curated(html), html, "sin cuerpo real, no vaciar la crónica")
}

{
  const html = `
    <h1>Blog</h1>
    <ol>
      <li><a href="/">Home</a></li>
      <li>RELATOS DE VIAJES &gt; América</li>
      <li>Hoja de ruta de un viaje a Alaska en autocaravana</li>
    </ol>
    <h2>Hoja de ruta de un viaje a Alaska en autocaravana</h2>
    <p>
      <a href="javascript:print()">Print</a>
      <a href="/alaska.pdf">PDF</a>
      <a href="mailto:x">Email</a>
    </p>
    <p>Hoy os traigo la hoja de ruta de un viaje a Alaska en autocaravana, con la autocaravana con la que viajamos por Alaska entre paisajes radiantes de montañas y osos que se sienten libres.</p>
  `
  assertDrops(html, "<h1>Blog</h1>")
  assertDrops(html, "RELATOS DE VIAJES")
  assertDrops(html, ">Home</a>")
  assertDrops(html, "Print")
  assertKeeps(html, "Hoja de ruta de un viaje a Alaska en autocaravana")
  assertKeeps(html, "osos que se sienten libres")
}

console.log("chronicle-html: ok")
