#!/usr/bin/env bash
# Smoke test de la API WanderPlanner.
# Uso: ./scripts/smoke.sh <API_BASE_URL>
# Ejemplo: ./scripts/smoke.sh https://api.wanderplanner.ai
#
# Comprueba:
#   1) GET / responde 2xx
#   2) POST /itinerary y GET /thumb sin Authorization → 401 (REQUIRE_AUTH=true)
#   3) CORS rechaza un Origin no permitido (sin Access-Control-Allow-Origin)
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

echo
echo "Resultado: $PASS pass, $FAIL fail"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
