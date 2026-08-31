#!/usr/bin/env bash
# Smoke test del servidor MCP de WanderPlanner (complemento de ChatGPT).
# Uso: ./scripts/smoke-mcp.sh <MCP_ENDPOINT_URL>
# Ejemplo: ./scripts/smoke-mcp.sh https://mcp.wanderplanner.ai
#          ./scripts/smoke-mcp.sh https://wanderplanner.ai/mcp   # path legado
#
# $1 es el endpoint al que se POST-ea, no el origen del producto. Apuntarlo a
# https://wanderplanner.ai (la landing) tiene que FALLAR: POST / no es MCP.
#
# Hermano de scripts/smoke.sh, que cubre la API de Fly. Aquí solo va lo que
# producción puede decir y los tests no: la forma del 401, el contenido de los
# well-known y que el kill switch no se haya quedado apagado tras un deploy.
#
# Comprueba:
#   1) POST al endpoint sin Bearer → 401 con WWW-Authenticate y resource_metadata.
#      Es LA comprobación: sin esa cabecera ChatGPT no sabe dónde empezar el
#      OAuth y el conector no arranca.
#   2) El endpoint no responde 503 (MCP_ENABLED sigue puesto).
#   3) POST con Bearer inválido → 401, no 500.
#   4) RFC 9728: well-known de raíz siempre; el de /mcp solo si el endpoint
#      lleva path /mcp (un cliente puede derivar la URL en vez de seguir la
#      cabecera). En mcp.wanderplanner.ai el relevante es el de la raíz.
#   5) OPTIONS en el well-known de raíz → CORS (metadataCorsOptionsRequestHandler).
#   6) /.well-known/openai-apps-challenge no revienta (404 mientras no esté
#      OPENAI_APPS_CHALLENGE; 200 con el token durante el envío al directorio).
#   7) Si el host es mcp.wanderplanner.ai: cierre de host (GET /trips → 308 al
#      dominio principal) y robots.txt Disallow: / sin Allow: /.
#
# Token caducado o revocado NO se prueban aquí: fabricarlos en bash es un lío y
# ya están cubiertos en frontend/lib/mcp/trip-access.test.ts.
#
# Sale con código != 0 si algo no cuadra.

set -euo pipefail

TIMEOUT_S="${SMOKE_TIMEOUT:-15}"
SUPABASE_ISSUER_HINT="${SMOKE_SUPABASE_ISSUER:-}"
SITE_ORIGIN="https://wanderplanner.ai"
MCP_DEDICATED_HOST="mcp.wanderplanner.ai"

usage() {
  echo "Uso: $0 <MCP_ENDPOINT_URL>" >&2
  echo "Ejemplo: $0 https://mcp.wanderplanner.ai" >&2
  echo "         $0 https://wanderplanner.ai/mcp" >&2
  exit 2
}

if [[ $# -ne 1 ]]; then
  usage
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL: curl no está instalado" >&2
  exit 2
fi

ENDPOINT="${1%/}"
if [[ -z "$ENDPOINT" ]]; then
  usage
fi

REST="${ENDPOINT#https://}"
SCHEME="https"
if [[ "$REST" == "$ENDPOINT" ]]; then
  REST="${ENDPOINT#http://}"
  SCHEME="http"
fi
HOSTPORT="${REST%%/*}"
PATHPART="${REST#"$HOSTPORT"}"
ORIGIN="${SCHEME}://${HOSTPORT}"
MCP_URL="$ENDPOINT"
HOST_ONLY="$(printf '%s' "${HOSTPORT%%:*}" | tr '[:upper:]' '[:lower:]')"

PRM_ROOT="$ORIGIN/.well-known/oauth-protected-resource"
PRM_MCP="$ORIGIN/.well-known/oauth-protected-resource/mcp"
CHALLENGE="$ORIGIN/.well-known/openai-apps-challenge"

CHECK_PRM_MCP=0
if [[ "$PATHPART" == "/mcp" ]]; then
  CHECK_PRM_MCP=1
fi

PASS=0
FAIL=0
TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/wp-smoke-mcp.XXXXXX")"
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

# Cuerpo JSON-RPC mínimo: initialize. No necesita sesión para provocar el 401.
INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'

# Cabeceras en $1, body en $2; imprime el código HTTP.
mcp_post() {
  local hdrs="$1" body="$2"
  shift 2
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --max-time "$TIMEOUT_S" \
    -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    "$@" \
    -d "$INIT_BODY"
}

# Cabecera HTTP (case-insensitive) → valor de la primera coincidencia.
header_value() {
  tr '[:upper:]' '[:lower:]' <"$1" \
    | sed -n "s/^$2:[[:space:]]*//p" \
    | tr -d '\r' \
    | head -n 1
}

echo "Smoke MCP → $MCP_URL (timeout ${TIMEOUT_S}s)"
echo

# ── 1 y 2) Sin Bearer: 401 con WWW-Authenticate, y no 503 ────────────────────
NOAUTH_HDRS="$TMPDIR/noauth.hdrs"
NOAUTH_BODY="$TMPDIR/noauth.body"
NOAUTH_CODE="$(mcp_post "$NOAUTH_HDRS" "$NOAUTH_BODY" || true)"

if [[ "$NOAUTH_CODE" == "503" ]]; then
  bad "POST $MCP_URL → 503: el kill switch está apagado (MCP_ENABLED != 'true'). Recuerda que un cambio de env exige redeploy"
elif [[ "$NOAUTH_CODE" == "401" ]]; then
  ok "POST sin Authorization → 401"

  WWW="$(header_value "$NOAUTH_HDRS" "www-authenticate")"
  if [[ -z "$WWW" ]]; then
    bad "401 sin cabecera WWW-Authenticate: ChatGPT no sabrá dónde empezar el OAuth"
  elif [[ "$WWW" != *"resource_metadata"* ]]; then
    bad "WWW-Authenticate sin resource_metadata: '$WWW'"
  else
    ok "WWW-Authenticate trae resource_metadata"
    if [[ "$WWW" != *"/.well-known/oauth-protected-resource"* ]]; then
      bad "resource_metadata no apunta al well-known esperado: '$WWW'"
    else
      ok "resource_metadata apunta a /.well-known/oauth-protected-resource"
    fi
  fi
else
  bad "POST sin Authorization esperaba 401, obtuvo '${NOAUTH_CODE:-error de red}'"
  if [[ -s "$NOAUTH_BODY" ]]; then
    echo "  body: $(head -c 200 "$NOAUTH_BODY")" >&2
  fi
fi

# ── 3) Bearer inválido → 401, nunca 500 ──────────────────────────────────────
BADTOK_HDRS="$TMPDIR/badtok.hdrs"
BADTOK_BODY="$TMPDIR/badtok.body"
BADTOK_CODE="$(
  mcp_post "$BADTOK_HDRS" "$BADTOK_BODY" \
    -H "Authorization: Bearer no-es-un-jwt.smoke.test" \
  || true
)"
if [[ "$BADTOK_CODE" == "401" ]]; then
  ok "POST con Bearer inválido → 401"
elif [[ "$BADTOK_CODE" == "503" ]]; then
  bad "POST con Bearer inválido → 503 (MCP_ENABLED apagado)"
else
  bad "POST con Bearer inválido esperaba 401, obtuvo '${BADTOK_CODE:-error de red}'"
  if [[ -s "$BADTOK_BODY" ]]; then
    echo "  body: $(head -c 200 "$BADTOK_BODY")" >&2
  fi
fi

# ── 4) Metadatos RFC 9728 ────────────────────────────────────────────────────
check_prm() {
  local slug="$1" label="$2" url="$3"
  local body="$TMPDIR/prm-$slug.body"
  local code
  code="$(curl -sS -o "$body" -w "%{http_code}" --max-time "$TIMEOUT_S" "$url" || true)"

  if [[ "$code" != "200" ]]; then
    bad "GET $label esperaba 200, obtuvo '${code:-error de red}'"
    return
  fi
  ok "GET $label → 200"

  if grep -q "\"resource\"[[:space:]]*:[[:space:]]*\"$MCP_URL\"" "$body"; then
    ok "$label declara resource = $MCP_URL"
  else
    bad "$label no declara resource = $MCP_URL · body: $(head -c 200 "$body")"
  fi

  if grep -q '"authorization_servers"' "$body"; then
    if [[ -n "$SUPABASE_ISSUER_HINT" ]] && ! grep -q "$SUPABASE_ISSUER_HINT" "$body"; then
      bad "$label no lista el issuer esperado ($SUPABASE_ISSUER_HINT) · body: $(head -c 200 "$body")"
    elif grep -q '/auth/v1' "$body"; then
      ok "$label lista un authorization_server de Supabase"
    else
      bad "$label tiene authorization_servers sin pinta de Supabase · body: $(head -c 200 "$body")"
    fi
  else
    bad "$label sin authorization_servers · body: $(head -c 200 "$body")"
  fi
}

check_prm "root" "/.well-known/oauth-protected-resource" "$PRM_ROOT"
if [[ "$CHECK_PRM_MCP" == "1" ]]; then
  # RFC 9728 inserta la ruta del recurso: un cliente que derive la URL en vez de
  # seguir la cabecera busca aquí. Por eso se sirve también en /mcp.
  check_prm "mcp" "/.well-known/oauth-protected-resource/mcp" "$PRM_MCP"
fi

# ── 5) CORS de los metadatos ─────────────────────────────────────────────────
CORS_HDRS="$TMPDIR/cors.hdrs"
CORS_CODE="$(
  curl -sS -D "$CORS_HDRS" -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_S" \
    -X OPTIONS "$PRM_ROOT" \
    -H "Origin: https://chatgpt.com" \
    -H "Access-Control-Request-Method: GET" \
  || true
)"
CORS_ACAO="$(header_value "$CORS_HDRS" "access-control-allow-origin")"
if [[ -n "$CORS_ACAO" ]]; then
  ok "OPTIONS del well-known → CORS ($CORS_ACAO)"
else
  bad "OPTIONS del well-known sin Access-Control-Allow-Origin (HTTP '${CORS_CODE:-error de red}')"
fi

# ── 6) Desafío de verificación de dominio ────────────────────────────────────
# 404 mientras OPENAI_APPS_CHALLENGE no esté puesta: correcto, no anunciamos un
# desafío vacío. 200 con el token durante el envío. Cualquier 5xx es un fallo.
CH_BODY="$TMPDIR/challenge.body"
CH_CODE="$(curl -sS -o "$CH_BODY" -w "%{http_code}" --max-time "$TIMEOUT_S" "$CHALLENGE" || true)"
case "$CH_CODE" in
  200)
    if [[ -s "$CH_BODY" ]]; then
      ok "GET /.well-known/openai-apps-challenge → 200 con token ($(wc -c <"$CH_BODY" | tr -d ' ') bytes)"
    else
      bad "El desafío responde 200 pero vacío"
    fi
    ;;
  404)
    ok "GET /.well-known/openai-apps-challenge → 404 (OPENAI_APPS_CHALLENGE sin poner; normal fuera del envío)"
    ;;
  *)
    bad "GET /.well-known/openai-apps-challenge esperaba 200 o 404, obtuvo '${CH_CODE:-error de red}'"
    ;;
esac

# ── 7) Cierre de host (solo el alias MCP) ────────────────────────────────────
if [[ "$HOST_ONLY" == "$MCP_DEDICATED_HOST" ]]; then
  TRIPS_HDRS="$TMPDIR/trips.hdrs"
  TRIPS_CODE="$(
    curl -sS -D "$TRIPS_HDRS" -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_S" \
      "$ORIGIN/trips" \
    || true
  )"
  TRIPS_LOC="$(header_value "$TRIPS_HDRS" "location")"
  EXPECT_TRIPS="$SITE_ORIGIN/trips"
  if [[ "$TRIPS_CODE" == "308" && "$TRIPS_LOC" == "$EXPECT_TRIPS" ]]; then
    ok "GET /trips → 308 $EXPECT_TRIPS"
  else
    bad "GET /trips esperaba 308 $EXPECT_TRIPS, obtuvo '${TRIPS_CODE:-error}' Location='${TRIPS_LOC}'"
  fi

  ROBOTS_BODY="$TMPDIR/robots.body"
  ROBOTS_CODE="$(
    curl -sS -o "$ROBOTS_BODY" -w "%{http_code}" --max-time "$TIMEOUT_S" \
      "$ORIGIN/robots.txt" \
    || true
  )"
  if [[ "$ROBOTS_CODE" != "200" ]]; then
    bad "GET /robots.txt esperaba 200, obtuvo '${ROBOTS_CODE:-error de red}'"
  elif grep -Eq '^Allow:' "$ROBOTS_BODY"; then
    bad "/robots.txt en el host MCP no debe tener Allow: · $(head -c 200 "$ROBOTS_BODY")"
  elif grep -Eq '^Disallow: /[[:space:]]*$' "$ROBOTS_BODY"; then
    ok "/robots.txt → Disallow: / (sin Allow: /)"
  else
    bad "/robots.txt sin Disallow: / · $(head -c 200 "$ROBOTS_BODY")"
  fi
fi

echo
echo "Resultado: $PASS pass, $FAIL fail"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
