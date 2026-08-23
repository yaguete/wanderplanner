import assert from "node:assert/strict"
import {
  COLLAPSED_CHROME_SCROLL_PX,
  collapsedChromePin,
} from "./mobile-browser-chrome"

const pin = collapsedChromePin(844)
assert.equal(pin.scrollY, COLLAPSED_CHROME_SCROLL_PX)
assert.equal(pin.minHeight, 844 + COLLAPSED_CHROME_SCROLL_PX)
assert.ok(pin.scrollY >= 40, "iOS ignora un scroll de 1–2 px como toque")

const short = collapsedChromePin(500)
assert.equal(short.minHeight - short.scrollY, 500)

console.log("mobile-browser-chrome: ok")
