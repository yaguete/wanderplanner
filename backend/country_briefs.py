"""
Fichas país del Ministerio de Asuntos Exteriores (PDFs).
Cache en disco: `data/country_briefs/{ISO}.txt` + `index.json`.
Sin embeddings: se inyecta el texto completo de la ficha del país del viaje.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import httpx
from pypdf import PdfReader

DATA_DIR = Path(__file__).parent / "data" / "country_briefs"
INDEX_PATH = DATA_DIR / "index.json"
FICHA_BASE = "https://www.exteriores.gob.es/documents/fichaspais"

# Nombre en español (mismo catálogo que frontend/lib/countries.ts) para generar slug.
# Solo países con ficha diplomática habitual; territorios/dependencias quedan fuera.
ISO_TO_NAME: dict[str, str] = {
    "AF": "Afganistán", "AL": "Albania", "DE": "Alemania", "AD": "Andorra",
    "AO": "Angola", "SA": "Arabia Saudí", "DZ": "Argelia", "AR": "Argentina",
    "AM": "Armenia", "AU": "Australia", "AT": "Austria", "AZ": "Azerbaiyán",
    "BS": "Bahamas", "BD": "Bangladés", "BB": "Barbados", "BH": "Baréin",
    "BE": "Bélgica", "BZ": "Belice", "BJ": "Benín", "BY": "Bielorrusia",
    "BO": "Bolivia", "BA": "Bosnia y Herzegovina", "BW": "Botsuana", "BR": "Brasil",
    "BN": "Brunéi", "BG": "Bulgaria", "BF": "Burkina Faso", "BI": "Burundi",
    "BT": "Bután", "CV": "Cabo Verde", "KH": "Camboya", "CM": "Camerún",
    "CA": "Canadá", "QA": "Catar", "TD": "Chad", "CZ": "Chequia",
    "CL": "Chile", "CN": "China", "CY": "Chipre", "CO": "Colombia",
    "KM": "Comoras", "CG": "Congo", "KP": "Corea del Norte", "KR": "Corea del Sur",
    "CR": "Costa Rica", "CI": "Costa de Marfil", "HR": "Croacia", "CU": "Cuba",
    "DK": "Dinamarca", "DM": "Dominica", "EC": "Ecuador", "EG": "Egipto",
    "SV": "El Salvador", "AE": "Emiratos Árabes Unidos", "ER": "Eritrea",
    "SK": "Eslovaquia", "SI": "Eslovenia", "ES": "España", "US": "Estados Unidos",
    "EE": "Estonia", "SZ": "Esuatini", "ET": "Etiopía", "PH": "Filipinas",
    "FI": "Finlandia", "FJ": "Fiyi", "FR": "Francia", "GA": "Gabón",
    "GM": "Gambia", "GE": "Georgia", "GH": "Ghana", "GR": "Grecia",
    "GT": "Guatemala", "GN": "Guinea", "GQ": "Guinea Ecuatorial", "GW": "Guinea-Bisáu",
    "GY": "Guyana", "HT": "Haití", "HN": "Honduras", "HU": "Hungría",
    "IN": "India", "ID": "Indonesia", "IQ": "Irak", "IR": "Irán",
    "IE": "Irlanda", "IS": "Islandia", "IL": "Israel", "IT": "Italia",
    "JM": "Jamaica", "JP": "Japón", "JO": "Jordania", "KZ": "Kazajistán",
    "KE": "Kenia", "KG": "Kirguistán", "KI": "Kiribati", "KW": "Kuwait",
    "LA": "Laos", "LS": "Lesoto", "LV": "Letonia", "LB": "Líbano",
    "LR": "Liberia", "LY": "Libia", "LI": "Liechtenstein", "LT": "Lituania",
    "LU": "Luxemburgo", "MK": "Macedonia del Norte", "MG": "Madagascar",
    "MY": "Malasia", "MW": "Malaui", "MV": "Maldivas", "ML": "Mali",
    "MT": "Malta", "MA": "Marruecos", "MU": "Mauricio", "MR": "Mauritania",
    "MX": "México", "MD": "Moldavia", "MC": "Mónaco", "MN": "Mongolia",
    "ME": "Montenegro", "MZ": "Mozambique", "MM": "Myanmar", "NA": "Namibia",
    "NR": "Nauru", "NP": "Nepal", "NI": "Nicaragua", "NE": "Níger",
    "NG": "Nigeria", "NO": "Noruega", "NZ": "Nueva Zelanda", "OM": "Omán",
    "NL": "Países Bajos", "PK": "Pakistán", "PW": "Palaos", "PA": "Panamá",
    "PG": "Papúa Nueva Guinea", "PY": "Paraguay", "PE": "Perú", "PL": "Polonia",
    "PT": "Portugal", "GB": "Reino Unido", "CF": "República Centroafricana",
    "CD": "República Democrática del Congo", "DO": "República Dominicana",
    "RW": "Ruanda", "RO": "Rumanía", "RU": "Rusia", "WS": "Samoa",
    "SM": "San Marino", "ST": "Santo Tomé y Príncipe", "SN": "Senegal",
    "RS": "Serbia", "SC": "Seychelles", "SL": "Sierra Leona", "SG": "Singapur",
    "SY": "Siria", "SO": "Somalia", "LK": "Sri Lanka", "ZA": "Sudáfrica",
    "SD": "Sudán", "SS": "Sudán del Sur", "SE": "Suecia", "CH": "Suiza",
    "SR": "Surinam", "TH": "Tailandia", "TW": "Taiwán", "TZ": "Tanzania",
    "TJ": "Tayikistán", "TL": "Timor-Leste", "TG": "Togo", "TO": "Tonga",
    "TT": "Trinidad y Tobago", "TN": "Túnez", "TM": "Turkmenistán",
    "TR": "Turquía", "TV": "Tuvalu", "UA": "Ucrania", "UG": "Uganda",
    "UY": "Uruguay", "UZ": "Uzbekistán", "VU": "Vanuatu", "VE": "Venezuela",
    "VN": "Vietnam", "YE": "Yemen", "DJ": "Yibuti", "ZM": "Zambia",
    "ZW": "Zimbabue",
}

# Overrides cuando el slug del MAE no coincide con el nombre normalizado.
_SLUG_OVERRIDES: dict[str, str] = {
    "AE": "emiratosarabesunidos",
    "BA": "bosniaherzegovina",
    "BN": "brunei",
    "CD": "republicademocraticadelcongo",
    "CF": "republicacentroafricana",
    "CI": "costademarfil",
    "CZ": "chequia",
    "DO": "republicadominicana",
    "GB": "reinounido",
    "GQ": "guineaecuatorial",
    "GW": "guineabissau",
    "KP": "coreadelnorte",
    "KR": "coreadelsur",
    "MK": "macedoniadelnorte",
    "MM": "myanmar",
    "NL": "paisesbajos",
    "PG": "papuanuevaguinea",
    "SA": "arabiasaudi",
    "SS": "sudandelsur",
    "ST": "santotomeprincipe",
    "TL": "timorleste",
    "TT": "trinidadytobago",
    "US": "estadosunidos",
    "VA": "vaticano",
}


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def name_to_slug(name: str) -> str:
    s = _strip_accents(name).lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def iso_to_slug(code: str) -> str | None:
    c = code.upper().strip()
    if c in _SLUG_OVERRIDES:
        return _SLUG_OVERRIDES[c]
    name = ISO_TO_NAME.get(c)
    if not name:
        return None
    return name_to_slug(name)


def ficha_url(code: str) -> str | None:
    urls = ficha_url_candidates(code)
    return urls[0] if urls else None


def ficha_url_candidates(code: str) -> list[str]:
    """Variantes de URL conocidas del MAE (minúsculas y Documents/FichasPais)."""
    slug = iso_to_slug(code)
    if not slug:
        return []
    lower = f"{FICHA_BASE}/{quote(f'{slug}_ficha pais.pdf')}"
    upper = (
        "https://www.exteriores.gob.es/Documents/FichasPais/"
        + quote(f"{slug.upper()}_FICHA PAIS.pdf")
    )
    # Dedup preservando orden
    out: list[str] = []
    for u in (lower, upper):
        if u not in out:
            out.append(u)
    return out


def _load_index() -> dict:
    if not INDEX_PATH.exists():
        return {}
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_index(index: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    from io import BytesIO

    reader = PdfReader(BytesIO(pdf_bytes))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text() or ""
        if t.strip():
            parts.append(t)
    text = "\n\n".join(parts)
    # Normaliza espacios excesivos
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def fetch_and_cache(code: str, *, force: bool = False) -> dict:
    """
    Descarga la ficha PDF, extrae texto y guarda en caché.
    Devuelve metadatos: {code, url, fetched_at, sha256, path, chars} o error.
    """
    c = code.upper().strip()
    candidates = ficha_url_candidates(c)
    if not candidates:
        return {"code": c, "error": f"No hay mapeo de ficha para {c}"}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    txt_path = DATA_DIR / f"{c}.txt"
    index = _load_index()

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/pdf,*/*",
    }
    pdf_bytes: bytes | None = None
    url = candidates[0]
    last_err = ""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=45) as client:
            for candidate in candidates:
                url = candidate
                try:
                    r = await client.get(url, headers=headers)
                except Exception as e:
                    last_err = f"Error de red: {e}"
                    continue
                if r.status_code == 200 and r.headers.get("content-type", "").startswith(
                    ("application/pdf", "application/octet-stream")
                ):
                    pdf_bytes = r.content
                    break
                if r.status_code == 200 and r.content[:4] == b"%PDF":
                    pdf_bytes = r.content
                    break
                last_err = f"HTTP {r.status_code}"
    except Exception as e:
        return {"code": c, "url": url, "error": f"Error de red: {e}"}

    if pdf_bytes is None:
        return {"code": c, "url": url, "error": last_err or "Ficha no encontrada"}

    sha = hashlib.sha256(pdf_bytes).hexdigest()
    prev = index.get(c) or {}
    if not force and prev.get("sha256") == sha and txt_path.exists():
        return {
            "code": c,
            "url": url,
            "fetched_at": prev.get("fetched_at"),
            "sha256": sha,
            "path": str(txt_path),
            "chars": txt_path.stat().st_size,
            "unchanged": True,
        }

    try:
        text = _extract_pdf_text(pdf_bytes)
    except Exception as e:
        return {"code": c, "url": url, "error": f"Error extrayendo PDF: {e}"}
    if not text:
        return {"code": c, "url": url, "error": "PDF sin texto extraíble"}

    txt_path.write_text(text, encoding="utf-8")
    meta = {
        "code": c,
        "name": ISO_TO_NAME.get(c, c),
        "url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "sha256": sha,
        "chars": len(text),
    }
    index[c] = meta
    _save_index(index)
    return {**meta, "path": str(txt_path), "unchanged": False}


def get_cached_brief(code: str) -> str | None:
    """Lee el texto cacheado; None si no existe."""
    c = code.upper().strip()
    path = DATA_DIR / f"{c}.txt"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


async def ensure_briefs(codes: list[str]) -> dict[str, str]:
    """
    Devuelve {ISO: texto} para los códigos pedidos.
    Usa caché si existe; si no, descarga.
    """
    out: dict[str, str] = {}
    for code in codes:
        c = code.upper().strip()
        if not c:
            continue
        text = get_cached_brief(c)
        if text is None:
            result = await fetch_and_cache(c)
            if result.get("error"):
                out[c] = f"[Ficha país {c} no disponible: {result['error']}]"
                continue
            text = get_cached_brief(c)
        if text:
            out[c] = text
    return out


def format_briefs_for_prompt(briefs: dict[str, str]) -> str:
    if not briefs:
        return "(No hay fichas país cargadas para este viaje.)"
    blocks: list[str] = []
    index = _load_index()
    for code, text in briefs.items():
        name = ISO_TO_NAME.get(code, code)
        meta = index.get(code) or {}
        fetched = meta.get("fetched_at", "desconocida")
        url = meta.get("url") or ficha_url(code) or ""
        blocks.append(
            f"### Ficha país: {name} ({code})\n"
            f"Fuente: {url}\n"
            f"Descargada: {fetched}\n\n"
            f"{text}"
        )
    return "\n\n---\n\n".join(blocks)


def list_known_codes() -> list[str]:
    return sorted(ISO_TO_NAME.keys())
