#!/usr/bin/env python3
"""
Actualiza las fichas país del MAE en `data/country_briefs/`.
Uso:
  python scripts/refresh_country_briefs.py              # todos los países conocidos
  python scripts/refresh_country_briefs.py ES CO JP      # solo estos
  python scripts/refresh_country_briefs.py --force ES    # fuerza reescritura
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Permite ejecutar desde backend/ o desde la raíz del repo.
BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from country_briefs import fetch_and_cache, list_known_codes  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description="Refresca fichas país del MAE")
    parser.add_argument("codes", nargs="*", help="Códigos ISO (default: todos)")
    parser.add_argument("--force", action="store_true", help="Reescribe aunque el hash no cambie")
    args = parser.parse_args()

    codes = [c.upper() for c in args.codes] if args.codes else list_known_codes()
    ok = 0
    fail = 0
    for code in codes:
        result = await fetch_and_cache(code, force=args.force)
        if result.get("error"):
            print(f"FAIL {code}: {result['error']}")
            fail += 1
        elif result.get("unchanged"):
            print(f"SKIP {code}: sin cambios ({result.get('chars')} chars)")
            ok += 1
        else:
            print(f"OK   {code}: {result.get('chars')} chars → {result.get('path')}")
            ok += 1
    print(f"\nHecho: {ok} ok, {fail} fallos")
    return 1 if fail and not ok else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
