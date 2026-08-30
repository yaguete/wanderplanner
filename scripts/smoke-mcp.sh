#!/usr/bin/env bash
# Smoke test del servidor MCP de WanderPlanner (complemento de ChatGPT).
# Uso: ./scripts/smoke-mcp.sh <SITE_URL>
# Ejemplo: ./scripts/smoke-mcp.sh https://wanderplanner.ai
#
# Hermano de scripts/smoke.sh, que cubre la API de Fly. Aquí solo va lo que
# producción puede decir y los tests no: la forma del 401, el contenido de los
# well-known y que el kill switch no se haya quedado apagado tras un deploy.
#
# Comprueba:
#   1) POST /mcp sin Bearer → 401 con WWW-Authenticate y resource_metadata.
#      Es LA comprobación: sin esa cabecera ChatGPT no sabe dónde empezar el
#      OAuth y el conector no arranca.
#   2) /mcp no responde 503 (MCP_ENABLED sigue puesto).
#   3) POST /mcp con Bearer inválido → 401, no 500.
#   4) Las DOS rutas RFC 9728 → 200 con el `resource` y el issuer correctos.
#      La de /mcp existe porque un cliente puede derivar la URL en vez de
#      seguir la cabecera.
#   5) OPTIONS en los well-known → CORS (metadataCorsOptionsRequestHandler).
#   6) /.well-known/openai-apps-challenge no revienta (404 mientras no esté
#      OPENAI_APPS_CHALLENGE; 200 con el token durante el envío al directorio).
#
# Token caducado o revocado NO se prueban aquí: fabricarlos en bash es un lío y
# ya están cubiertos en frontend/lib/mcp/trip-access.test.ts.
#
# Sale con código != 0 si algo no cuadra.

set -euo pipefail

TIMEOUT_S="${SMOKE_TIMEOUT:-15}"
SUPABASE_ISSUER_HINT="${SMOKE_SUPABASE_ISSUER:-}"

usage() {
  echo "Uso: $0 <SITE_URL>" >&2
  echo "Ejemplo: $0 https://wanderplanner.ai" >&2
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

MCP_URL="$BASE/mcp"
PRM_ROOT="$BASE/.well-known/oauth-protected-resource"
PRM_MCP="$BASE/.well-known/oauth-protected-resource/mcp"
CHALLENGE="$BASE/.well-known/openai-apps-challenge"

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

echo "Smoke MCP → $BASE (timeout ${TIMEOUT_S}s)"
echo

# ── 1 y 2) Sin Bearer: 401 con WWW-Authenticate, y no 503 ────────────────────
NOAUTH_HDRS="$TMPDIR/noauth.hdrs"
NOAUTH_BODY="$TMPDIR/noauth.body"
NOAUTH_CODE="$(mcp_post "$NOAUTH_HDRS" "$NOAUTH_BODY" || true)"

if [[ "$NOAUTH_CODE" == "503" ]]; then
  bad "POST /mcp → 503: el kill switch está apagado (MCP_ENABLED != 'true'). Recuerda que un cambio de env exige redeploy"
elif [[ "$NOAUTH_CODE" == "401" ]]; then
  ok "POST /mcp sin Authorization → 401"

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
  bad "POST /mcp sin Authorization esperaba 401, obtuvo '${NOAUTH_CODE:-error de red}'"
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
  ok "POST /mcp con Bearer inválido → 401"
elif [[ "$BADTOK_CODE" == "503" ]]; then
  bad "POST /mcp con Bearer inválido → 503 (MCP_ENABLED apagado)"
else
  bad "POST /mcp con Bearer inválido esperaba 401, obtuvo '${BADTOK_CODE:-error de red}'"
  if [[ -s "$BADTOK_BODY" ]]; then
    echo "  body: $(head -c 200 "$BADTOK_BODY")" >&2
  fi
fi

# ── 4) Metadatos RFC 9728, en las dos rutas ──────────────────────────────────
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
# RFC 9728 inserta la ruta del recurso: un cliente que derive la URL en vez de
# seguir la cabecera busca aquí. Por eso se sirven las dos.
check_prm "mcp" "/.well-known/oauth-protected-resource/mcp" "$PRM_MCP"

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

echo
echo "Resultado: $PASS pass, $FAIL fail"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
