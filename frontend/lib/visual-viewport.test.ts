import assert from "node:assert/strict"
import {
  DIALOG_FULLSCREEN_MAX_PX,
  FXIOS_OVERLAY_BOTTOM_PX,
  isDialogFullscreenViewport,
  overlayChromeInset,
  visualViewportFillBox,
} from "./visual-viewport"

const FXIOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/129.0 Mobile/15E148 Safari/604.1"
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

assert.equal(isDialogFullscreenViewport(390), true)
assert.equal(isDialogFullscreenViewport(DIALOG_FULLSCREEN_MAX_PX), false)
assert.equal(isDialogFullscreenViewport(1280), false)

assert.equal(overlayChromeInset(SAFARI, 0), 0)
assert.equal(overlayChromeInset(SAFARI, 80), 0)
assert.equal(overlayChromeInset(FXIOS, 0), FXIOS_OVERLAY_BOTTOM_PX)
assert.equal(overlayChromeInset(FXIOS, 40), 0)

const full = { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 }

assert.deepEqual(
  visualViewportFillBox(full, { layoutHeight: 844, userAgent: SAFARI }),
  { top: 0, left: 0, width: 390, height: 844 },
)

assert.deepEqual(
  visualViewportFillBox({ ...full, height: 760 }, { layoutHeight: 844, userAgent: SAFARI }),
  { top: 0, left: 0, width: 390, height: 760 },
)

assert.deepEqual(
  visualViewportFillBox(full, { layoutHeight: 844, userAgent: FXIOS }),
  { top: 0, left: 0, width: 390, height: 844 - FXIOS_OVERLAY_BOTTOM_PX },
)

assert.equal(visualViewportFillBox(null, { layoutHeight: 844, userAgent: FXIOS }), null)

const zoomed = { offsetTop: 40, offsetLeft: 12, width: 320, height: 520 }
assert.deepEqual(
  visualViewportFillBox(zoomed, { layoutHeight: 844, userAgent: SAFARI }),
  { top: 40, left: 12, width: 320, height: 520 },
)

console.log("visual-viewport: ok")
