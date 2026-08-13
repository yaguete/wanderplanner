#!/usr/bin/env python3
"""
Precalienta article_extractions con las URLs curadas de la landing.

Uso (desde backend/):
  python scripts/seed_landing_sources.py
  API_URL=https://api.wanderplanner.ai python scripts/seed_landing_sources.py

El prewarm es público; en local sin TURNSTILE_SECRET_KEY no pide captcha.
En producción respeta PARTNER_PREWARM_MAX_IP_DAY (default 10) y
PARTNER_PREWARM_MAX_DAY (200): o subes el tope un rato o lo corres en tandas.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import httpx

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from landing_source_domains import LANDING_SEED_URLS  # noqa: E402


def _parse_sse_result(body: str) -> str:
    for block in body.split("\n\n"):
        if "event: error" in block:
            for line in block.split("\n"):
                if line.startswith("data:"):
                    return f"error:{line[5:].strip()}"
        if "event: result" in block:
            for line in block.split("\n"):
                if line.startswith("data:"):
                    try:
                        data = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        return "ok"
                    return str(data.get("status") or "ok")
    return "empty"


def main() -> int:
    parser = argparse.ArgumentParser(description="Precalienta fuentes de la landing")
    parser.add_argument(
        "--api",
        default=(os.getenv("API_URL") or "http://localhost:8000").rstrip("/"),
    )
    parser.add_argument("--sleep", type=float, default=1.5, help="Pausa entre URLs")
    parser.add_argument("--limit", type=int, default=0, help="Máximo de URLs (0 = todas)")
    args = parser.parse_args()

    urls = list(LANDING_SEED_URLS)
    if args.limit > 0:
        urls = urls[: args.limit]

    endpoint = urljoin(args.api + "/", "partners/prewarm")
    ok = 0
    failed = 0
    print(f"Prewarm {len(urls)} URLs → {endpoint}")

    with httpx.Client(timeout=180.0) as client:
        for i, url in enumerate(urls, start=1):
            try:
                r = client.post(
                    endpoint,
                    json={"url": url, "captcha_token": None},
                    headers={"Accept": "text/event-stream"},
                )
            except httpx.HTTPError as e:
                failed += 1
                print(f"[{i}/{len(urls)}] FAIL {url} ({e})")
                continue
            if r.status_code == 429:
                print(f"[{i}/{len(urls)}] 429 tope de prewarm. Para y reanuda otro día.")
                return 2
            if r.status_code >= 400:
                failed += 1
                print(f"[{i}/{len(urls)}] HTTP {r.status_code} {url} {r.text[:180]}")
                continue
            status = _parse_sse_result(r.text)
            if status.startswith("error"):
                failed += 1
                print(f"[{i}/{len(urls)}] {status} {url}")
            else:
                ok += 1
                print(f"[{i}/{len(urls)}] {status} {url}")
            if args.sleep > 0 and i < len(urls):
                time.sleep(args.sleep)

    print(f"Listo: {ok} ok, {failed} fallos")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
