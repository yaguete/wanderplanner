#!/usr/bin/env python3
"""
Mide la tasa de propuestas del asistente (SSE action) en escenarios positivos y negativos.

Escenarios (default --scenario all):
  recommendations  — pide 5 sitios para el día 3 (esperado actions_item ≈ 5)
  informative      — pregunta factual (esperado 0)
  country_brief    — visado / ficha país (esperado 0 ítems)
  plan_opinion     — opinión sobre el plan (esperado 0)
  existing_item    — pregunta por un ítem ya en el plan (esperado 0)
  institutional    — pregunta que deriva a web de visados (esperado 0 add_source)

Uso (backend en :8000):
  cd backend && ./venv/bin/python scripts/measure_proposal_rate.py
  ./venv/bin/python scripts/measure_proposal_rate.py --runs 10 --scenario recommendations
  ./venv/bin/python scripts/measure_proposal_rate.py --runs 10 --scenario all

Límites de uso (T1.2):
  Con REQUIRE_AUTH=false (default local) y sin Bearer, require_user deja pasar
  user=None y enforce_usage no aplica cuota. Si mides con JWT de un usuario real,
  N×escenarios conversaciones pueden agotar USER_MAX_ASSISTANT_MESSAGES_DAY (429).
  Para repetir con auth: desactiva límites en .env o usa un user_id de pruebas.

Coste: cada run son hasta 8 rondas DeepSeek + posibles búsquedas Tavily. No dejar
en bucle desatendido. Con --scenario all y --runs 10 son ~60 llamadas.

Regresión: un escenario negativo con media de actions (métrica del escenario) > 0.5
bloquea el merge. Si max rounds == 8, avisar (corte del bucle).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None  # type: ignore[assignment]

BACKEND = Path(__file__).resolve().parent.parent
MAX_ROUNDS = 8

# UUIDs fijos del escenario (reproducible).
DAY1_ID = "11111111-1111-4111-8111-111111111111"
DAY2_ID = "22222222-2222-4222-8222-222222222222"
DAY3_ID = "33333333-3333-4333-8333-333333333333"
VALID_DAY_IDS = {DAY1_ID, DAY2_ID, DAY3_ID}

Metric = Literal["add_item", "add_source"]


@dataclass(frozen=True)
class Scenario:
    id: str
    description: str
    countries: list[str]
    trip_briefing: str
    user_message: str
    expected_mean_max: float  # media ≤ esto pasa (positivos: usar umbral aparte)
    metric: Metric
    # Solo recommendations: umbrales de aceptación positivos
    positive: bool = False


KYOTO_BRIEFING = f"""# Viaje: Kyoto en primavera
- id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
- países (ISO): JP (Japón)
- fechas: 2026-04-10 → 2026-04-16
- días aprox. (numDays): 6

## Qué espera el usuario de este viaje
Viaje cultural a ritmo tranquilo: templos, jardines y buena comida local. Sin prisas.

## Plan del usuario (días e ítems)
### Día 1 — id=`{DAY1_ID}` — Llegada
- (sin ítems)

### Día 2 — id=`{DAY2_ID}` — Gion
- (sin ítems)

### Día 3 — id=`{DAY3_ID}` — Higashiyama
- (sin ítems)

## Básicos del viaje
(ninguno)

## Fuentes de inspiración
(ninguna fuente añadida)
"""

BUDAPEST_BRIEFING = f"""# Viaje: Budapest en otoño
- id: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
- países (ISO): HU (Hungría)
- fechas: 2026-10-05 → 2026-10-10
- días aprox. (numDays): 5

## Qué espera el usuario de este viaje
Ciudad + termas a ritmo medio. Interés en historia y comida local.

## Plan del usuario (días e ítems)
### Día 1 — id=`{DAY1_ID}` — Llegada y Pest
- [Actividad] **Full Moon Budapest** · Pest — Paseo nocturno por el centro (vía @demo; sourceId=src-demo)

### Día 2 — id=`{DAY2_ID}` — Buda
- (sin ítems)

### Día 3 — id=`{DAY3_ID}` — Isla Margarita
- (sin ítems)

## Básicos del viaje
(ninguno)

## Fuentes de inspiración
(ninguna fuente añadida)
"""

SCENARIOS: dict[str, Scenario] = {
    "recommendations": Scenario(
        id="recommendations",
        description="5 recomendaciones concretas para el día 3",
        countries=["JP"],
        trip_briefing=KYOTO_BRIEFING,
        user_message=(
            "Para el día 3 (Higashiyama), dame exactamente 5 recomendaciones concretas "
            "de sitios o actividades con nombre propio que pueda añadir al plan. "
            "Quiero poder aceptarlas desde la interfaz."
        ),
        expected_mean_max=0.0,  # no aplica; ver positive
        metric="add_item",
        positive=True,
    ),
    "informative": Scenario(
        id="informative",
        description="pregunta factual (horarios)",
        countries=["HU"],
        trip_briefing=BUDAPEST_BRIEFING,
        user_message="¿El Parlamento de Budapest abre los lunes?",
        expected_mean_max=0.5,
        metric="add_item",
    ),
    "country_brief": Scenario(
        id="country_brief",
        description="visado / ficha país",
        countries=["HU"],
        trip_briefing=BUDAPEST_BRIEFING,
        user_message="¿Necesito visado para Hungría?",
        expected_mean_max=0.5,
        metric="add_item",
    ),
    "plan_opinion": Scenario(
        id="plan_opinion",
        description="opinión sobre el itinerario",
        countries=["HU"],
        trip_briefing=BUDAPEST_BRIEFING,
        user_message="¿Me sobra algún día en el itinerario?",
        expected_mean_max=0.5,
        metric="add_item",
    ),
    "existing_item": Scenario(
        id="existing_item",
        description="pregunta por ítem ya en el plan",
        countries=["HU"],
        trip_briefing=BUDAPEST_BRIEFING,
        user_message="¿Qué tal está el Full Moon Budapest?",
        expected_mean_max=0.5,
        metric="add_item",
    ),
    "institutional": Scenario(
        id="institutional",
        description="derivación a web institucional de visados",
        countries=["HU"],
        trip_briefing=BUDAPEST_BRIEFING,
        user_message=(
            "Necesito la web oficial del gobierno húngaro o del MAE español "
            "donde consultar requisitos de visado y entrada. ¿Me pasas el enlace?"
        ),
        expected_mean_max=0.5,
        metric="add_source",
    ),
}

# Heurística aproximada de sitios en prosa (no es la métrica principal).
_LIST_ITEM_RE = re.compile(
    r"(?m)^(?:\s*[-*•]|\s*\d+[.)])\s+(?:\*\*([^*]+)\*\*|([A-ZÁÉÍÓÚÑÜ][^\n]{2,80}))"
)


def _assistant_model() -> str:
    if load_dotenv is not None:
        load_dotenv(BACKEND / ".env")
    return (os.getenv("ASSISTANT_MODEL") or "deepseek-v4-flash").strip()


def _parse_sse(raw: str) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    event_name = "message"
    data_lines: list[str] = []
    for line in raw.splitlines():
        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif line == "":
            if data_lines:
                payload = "\n".join(data_lines)
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    data = {"raw": payload}
                if isinstance(data, dict):
                    events.append((event_name, data))
            event_name = "message"
            data_lines = []
    if data_lines:
        payload = "\n".join(data_lines)
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            data = {"raw": payload}
        if isinstance(data, dict):
            events.append((event_name, data))
    return events


def _count_sitios(text: str) -> int:
    names: list[str] = []
    for m in _LIST_ITEM_RE.finditer(text):
        name = (m.group(1) or m.group(2) or "").strip()
        name = re.split(r"\s+[—–-]\s+", name, maxsplit=1)[0].strip()
        if len(name) < 3:
            continue
        low = name.casefold()
        if any(x in low for x in ("recomend", "día ", "propuesta", "aquí", "también")):
            continue
        names.append(name)
    seen: set[str] = set()
    unique = 0
    for n in names:
        k = n.casefold()
        if k in seen:
            continue
        seen.add(k)
        unique += 1
    return unique


def run_once(
    client: httpx.Client,
    base_url: str,
    scenario: Scenario,
    timeout: float,
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/assistant/chat"
    body = {
        "trip_briefing": scenario.trip_briefing,
        "countries": scenario.countries,
        "messages": [{"role": "user", "content": scenario.user_message}],
        "user_profile": None,
        "preferred_domains": [],
    }
    t0 = time.monotonic()
    with client.stream("POST", url, json=body, timeout=timeout) as resp:
        if resp.status_code != 200:
            err_body = resp.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {resp.status_code}: {err_body[:500]}")
        raw = "".join(chunk.decode("utf-8", errors="replace") for chunk in resp.iter_bytes())
    elapsed = time.monotonic() - t0

    events = _parse_sse(raw)
    text_parts: list[str] = []
    add_item = 0
    add_source = 0
    actions_invalid = 0
    rounds = 0
    errors: list[str] = []
    for name, data in events:
        if name == "status" and data.get("label") == "Pensando…":
            rounds += 1
        elif name == "delta":
            text_parts.append(str(data.get("text") or ""))
        elif name == "action":
            kind = data.get("kind")
            if kind == "add_item":
                add_item += 1
                day_id = str(data.get("day_id") or "").strip()
                if day_id not in VALID_DAY_IDS:
                    actions_invalid += 1
            elif kind == "add_source":
                add_source += 1
        elif name == "error":
            errors.append(str(data.get("message") or data))

    text = "".join(text_parts)
    metric_count = add_item if scenario.metric == "add_item" else add_source
    return {
        "actions": metric_count,
        "add_item": add_item,
        "add_source": add_source,
        "actions_invalid": actions_invalid,
        "rounds": rounds,
        "sitios": _count_sitios(text),
        "elapsed_s": round(elapsed, 1),
        "errors": errors,
        "text_preview": text[:200].replace("\n", " "),
    }


def _run_scenario(
    client: httpx.Client,
    scenario: Scenario,
    *,
    runs: int,
    base_url: str,
    timeout: float,
) -> dict[str, Any]:
    print(f"=== scenario={scenario.id} metric={scenario.metric} ===")
    print(f"description={scenario.description}")
    print(f"user_message={scenario.user_message!r}")
    if scenario.positive:
        print("acceptance=mean>=4.5 min>=3 actions_invalid==0")
    else:
        print(f"acceptance=mean<={scenario.expected_mean_max} (regression if mean>0.5)")
    print("---")

    results: list[dict[str, Any]] = []
    for i in range(1, runs + 1):
        try:
            r = run_once(client, base_url, scenario, timeout)
        except Exception as e:
            print(f"run={i}/{runs} FAIL {type(e).__name__}: {e}")
            results.append(
                {
                    "actions": 0,
                    "add_item": 0,
                    "add_source": 0,
                    "actions_invalid": 0,
                    "rounds": 0,
                    "sitios": 0,
                    "elapsed_s": 0,
                    "errors": [str(e)],
                    "failed": True,
                }
            )
            continue
        results.append(r)
        err = f" errors={r['errors']}" if r["errors"] else ""
        warn_rounds = " ROUNDS_MAX" if r["rounds"] >= MAX_ROUNDS else ""
        print(
            f"run={i}/{runs} actions={r['actions']} "
            f"add_item={r['add_item']} add_source={r['add_source']} "
            f"actions_invalid={r['actions_invalid']} rounds={r['rounds']} "
            f"sitios≈{r['sitios']} elapsed_s={r['elapsed_s']}{err}{warn_rounds}"
        )
        if r.get("text_preview"):
            print(f"  preview: {r['text_preview'][:120]}…")

    actions = [int(r["actions"]) for r in results]
    invalids = [int(r["actions_invalid"]) for r in results]
    rounds_l = [int(r["rounds"]) for r in results]
    failed = sum(1 for r in results if r.get("failed"))
    mean_a = statistics.mean(actions) if actions else 0.0
    min_a = min(actions) if actions else 0
    max_a = max(actions) if actions else 0
    mean_r = statistics.mean(rounds_l) if rounds_l else 0.0
    max_r = max(rounds_l) if rounds_l else 0

    if scenario.positive:
        ok = mean_a >= 4.5 and min_a >= 3 and sum(invalids) == 0 and failed == 0
    else:
        ok = mean_a <= scenario.expected_mean_max and failed == 0

    rounds_warn = max_r >= MAX_ROUNDS
    print("---")
    print(
        f"summary scenario={scenario.id} runs={len(results)} failed={failed} "
        f"actions_mean={mean_a:.2f} actions_min={min_a} actions_max={max_a} "
        f"actions_invalid_total={sum(invalids)} "
        f"rounds_mean={mean_r:.2f} rounds_max={max_r} "
        f"ok={'yes' if ok else 'NO'}{' ROUNDS_HIT_MAX' if rounds_warn else ''}"
    )
    print()
    return {
        "scenario": scenario.id,
        "ok": ok,
        "rounds_warn": rounds_warn,
        "actions_mean": mean_a,
        "actions_min": min_a,
        "actions_max": max_a,
        "actions_invalid_total": sum(invalids),
        "rounds_mean": mean_r,
        "rounds_max": max_r,
        "failed": failed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Mide tasa de propuestas del asistente")
    parser.add_argument("--runs", type=int, default=10, help="Repeticiones por escenario")
    parser.add_argument(
        "--scenario",
        default="all",
        help=f"id de escenario o 'all' ({', '.join(SCENARIOS)})",
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--timeout", type=float, default=180.0)
    args = parser.parse_args()

    if args.runs < 1:
        print("--runs debe ser >= 1", file=sys.stderr)
        return 2

    if args.scenario == "all":
        selected = list(SCENARIOS.values())
    elif args.scenario in SCENARIOS:
        selected = [SCENARIOS[args.scenario]]
    else:
        print(f"Escenario desconocido: {args.scenario}", file=sys.stderr)
        print(f"Opciones: all, {', '.join(SCENARIOS)}", file=sys.stderr)
        return 2

    model = _assistant_model()
    print(f"model={model} base_url={args.base_url} runs={args.runs}")
    print(f"scenarios={[s.id for s in selected]}")
    print()

    summaries: list[dict[str, Any]] = []
    with httpx.Client() as client:
        for sc in selected:
            summaries.append(
                _run_scenario(
                    client,
                    sc,
                    runs=args.runs,
                    base_url=args.base_url,
                    timeout=args.timeout,
                )
            )

    print("=== TOTAL ===")
    print(f"model={model}")
    all_ok = True
    for s in summaries:
        flag = "PASS" if s["ok"] else "FAIL"
        rw = " rounds_max=8!" if s["rounds_warn"] else ""
        print(
            f"{flag} {s['scenario']}: actions_mean={s['actions_mean']:.2f} "
            f"min={s['actions_min']} max={s['actions_max']} "
            f"invalid={s['actions_invalid_total']} "
            f"rounds_mean={s['rounds_mean']:.2f} rounds_max={s['rounds_max']}{rw}"
        )
        if not s["ok"]:
            all_ok = False
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
