import assert from "node:assert/strict"
import {
  EXTRACTION_GENERIC_FAILURE,
  EXTRACTION_PROVIDER_BUSY,
  friendlyExtractionMessage,
  looksLikeProviderDump,
} from "./extraction-errors"

const DUMP =
  "{'type': 'error', 'error': {'details': None, 'type': 'overloaded_error', 'message': 'Overloaded'}, 'request_id': 'req_011CeedFxiV3BCuyDjMb6hWE'}"

assert.equal(looksLikeProviderDump(DUMP), true)
assert.equal(friendlyExtractionMessage(DUMP), EXTRACTION_PROVIDER_BUSY)
assert.equal(
  friendlyExtractionMessage(
    '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_011abc"}',
  ),
  EXTRACTION_PROVIDER_BUSY,
)

assert.equal(friendlyExtractionMessage(EXTRACTION_PROVIDER_BUSY), EXTRACTION_PROVIDER_BUSY)
assert.equal(friendlyExtractionMessage(""), EXTRACTION_GENERIC_FAILURE)
assert.equal(
  friendlyExtractionMessage("El artículo no se pudo descargar."),
  "El artículo no se pudo descargar.",
)
assert.equal(looksLikeProviderDump(EXTRACTION_PROVIDER_BUSY), false)

console.log("extraction-errors: ok")
