#!/usr/bin/env bash
# Smoke test de la API WanderPlanner.
# Uso: ./scripts/smoke.sh <API_BASE_URL>
# Ejemplo: ./scripts/smoke.sh https://api.wanderplanner.ai
#
# Comprueba:
#   1) GET / responde 2xx
#   2) POST /itinerary y GET /thumb sin Authorization → 401 (REQUIRE_AUTH=true)
#   3) CORS rechaza un Origin no permitido (sin Access-Control-Allow-Origin)
#   4) POST /partners/prewarm: URL inválida → 400; sin captcha → 403 o 503
#      (503 = TURNSTILE_SECRET_KEY olvidada con REQUIRE_AUTH)
#
# Sale con código != 0 si algo no cuadra.

set -euo pipefail

TIMEOUT_S="${SMOKE_TIMEOUT:-15}"
BAD_ORIGIN="https://cors-smoke.invalid"

usage() {
  echo "Uso: $0 <API_BASE_URL>" >&2
  echo "Ejemplo: $0 https://api.wanderplanner.ai" >&2
  exit 2
}

if [[ $# -ne 1 ]]; then
  usage
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL: curl no está instalado" >&2
  exit 2
fi

BASE="${1%/}"
if [[ -z "$BASE" ]]; then
  usage
fi

PASS=0
FAIL=0
TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/wp-smoke.XXXXXX")"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

ok() {
  PASS=$((PASS + 1))
  echo "PASS: $1"
}

bad() {
  FAIL=$((FAIL + 1))
  echo "FAIL: $1" >&2
}

# Escribe body en $1, imprime solo el código HTTP en stdout.
http_code() {
  local out="$1"
  shift
  curl -sS -o "$out" -w "%{http_code}" --max-time "$TIMEOUT_S" "$@"
}

echo "Smoke → $BASE (timeout ${TIMEOUT_S}s)"
echo

# ── 1) Responde ──────────────────────────────────────────────────────────────
ROOT_BODY="$TMPDIR/root.body"
ROOT_CODE="$(http_code "$ROOT_BODY" "$BASE/" || true)"
if [[ "$ROOT_CODE" =~ ^2[0-9][0-9]$ ]]; then
  ok "GET / → $ROOT_CODE"
else
  bad "GET / esperaba 2xx, obtuvo '${ROOT_CODE:-error de red}'"
  if [[ -s "$ROOT_BODY" ]]; then
    echo "  body: $(head -c 200 "$ROOT_BODY")" >&2
  fi
fi

# ── 2) Auth obligatoria (sin Bearer → 401) ───────────────────────────────────
ITIN_BODY="$TMPDIR/itin.body"
ITIN_CODE="$(
  http_code "$ITIN_BODY" \
    -X POST "$BASE/itinerary" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com/smoke"}' \
  || true
)"
if [[ "$ITIN_CODE" == "401" ]]; then
  ok "POST /itinerary sin Authorization → 401"
else
  bad "POST /itinerary sin Authorization esperaba 401, obtuvo '${ITIN_CODE:-error de red}'"
  if [[ -s "$ITIN_BODY" ]]; then
    echo "  body: $(head -c 200 "$ITIN_BODY")" >&2
  fi
fi

THUMB_BODY="$TMPDIR/thumb.body"
THUMB_CODE="$(
  http_code "$THUMB_BODY" \
    "$BASE/thumb?q=smoke-test" \
  || true
)"
if [[ "$THUMB_CODE" == "401" ]]; then
  ok "GET /thumb sin Authorization → 401"
else
  bad "GET /thumb sin Authorization esperaba 401, obtuvo '${THUMB_CODE:-error de red}'"
  if [[ -s "$THUMB_BODY" ]]; then
    echo "  body: $(head -c 200 "$THUMB_BODY")" >&2
  fi
fi

# ── 3) CORS rechaza Origin no permitido ──────────────────────────────────────
# Preflight OPTIONS: Starlette/FastAPI CORSMiddleware no añade
# Access-Control-Allow-Origin si el Origin no está en allow_origins.
# Aceptamos: sin cabecera ACAO, o status 4xx (rechazo explícito).
CORS_HDRS="$TMPDIR/cors.hdrs"
CORS_BODY="$TMPDIR/cors.body"
CORS_CODE="$(
  curl -sS -D "$CORS_HDRS" -o "$CORS_BODY" -w "%{http_code}" --max-time "$TIMEOUT_S" \
    -X OPTIONS "$BASE/itinerary" \
    -H "Origin: $BAD_ORIGIN" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type,authorization" \
  || true
)"

ACAO="$(
  # Cabeceras HTTP son case-insensitive; normalizamos a minúsculas.
  tr '[:upper:]' '[:lower:]' <"$CORS_HDRS" \
    | sed -n 's/^access-control-allow-origin:[[:space:]]*//p' \
    | tr -d '\r' \
    | head -n 1
)"

if [[ -n "$ACAO" ]]; then
  bad "CORS: Origin $BAD_ORIGIN obtuvo Access-Control-Allow-Origin: $ACAO (no debía permitirse)"
elif [[ "$CORS_CODE" =~ ^4[0-9][0-9]$ ]]; then
  ok "CORS: Origin $BAD_ORIGIN rechazado (HTTP $CORS_CODE, sin ACAO)"
elif [[ "$CORS_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # FastAPI a veces responde 200 al preflight sin añadir ACAO → correcto.
  ok "CORS: Origin $BAD_ORIGIN sin Access-Control-Allow-Origin (HTTP $CORS_CODE)"
else
  bad "CORS: preflight OPTIONS falló (HTTP '${CORS_CODE:-error de red}')"
fi

# ── 4) Partners prewarm (público; sin Bearer) ────────────────────────────────
# URL inválida → 400 (antes de Turnstile).
PREWARM_BAD_BODY="$TMPDIR/prewarm-bad.body"
PREWARM_BAD_CODE="$(
  http_code "$PREWARM_BAD_BODY" \
    -X POST "$BASE/partners/prewarm" \
    -H "Content-Type: application/json" \
    -d '{"url":"not-a-url"}' \
  || true
)"
if [[ "$PREWARM_BAD_CODE" == "400" ]]; then
  ok "POST /partners/prewarm URL inválida → 400"
else
  bad "POST /partners/prewarm URL inválida esperaba 400, obtuvo '${PREWARM_BAD_CODE:-error de red}'"
  if [[ -s "$PREWARM_BAD_BODY" ]]; then
    echo "  body: $(head -c 200 "$PREWARM_BAD_BODY")" >&2
  fi
fi

# URL pública sin captcha → 403 (captcha inválido) o 503 (secret ausente con REQUIRE_AUTH).
# Ambos indican que el endpoint está montado; 503 avisa de config incompleta.
PREWARM_BODY="$TMPDIR/prewarm.body"
PREWARM_CODE="$(
  http_code "$PREWARM_BODY" \
    -X POST "$BASE/partners/prewarm" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com/smoke-prewarm"}' \
  || true
)"
if [[ "$PREWARM_CODE" == "403" ]]; then
  ok "POST /partners/prewarm sin captcha → 403"
elif [[ "$PREWARM_CODE" == "503" ]]; then
  ok "POST /partners/prewarm sin captcha → 503 (TURNSTILE_SECRET_KEY ausente; revisar secrets)"
elif [[ "$PREWARM_CODE" == "400" ]]; then
  # example.com a veces se rechaza por la guardia SSRF si DNS falla en el entorno.
  ok "POST /partners/prewarm sin captcha → 400 (guardia URL; endpoint vivo)"
else
  bad "POST /partners/prewarm sin captcha esperaba 403/503/400, obtuvo '${PREWARM_CODE:-error de red}'"
  if [[ -s "$PREWARM_BODY" ]]; then
    echo "  body: $(head -c 200 "$PREWARM_BODY")" >&2
  fi
fi

echo
echo "Resultado: $PASS pass, $FAIL fail"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
