"""
POST /share-summary — resumen inspirador de la ruta para compartir (DeepSeek).
JSON one-shot. Auth: require_verified_user (anónimo → 403).
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from auth import AuthUser, VerifiedUser, require_verified_user
from obs import log_kv
from usage import enforce_usage, record_event

logger = logging.getLogger(__name__)

router = APIRouter()

PROMPT_PATH = Path(__file__).parent / "agents" / "share_summary.md"
SHARE_TEXT_MAX = 1800
ItemType = Literal["transport", "stay", "food", "activity"]


class SharePlanRoute(BaseModel):
    from_label: str | None = Field(default=None, alias="from", max_length=120)
    to: str | None = Field(default=None, max_length=120)
    mode: str | None = Field(default=None, max_length=40)

    model_config = {"populate_by_name": True}


class SharePlanItem(BaseModel):
    type: ItemType
    name: str = Field(min_length=1, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    route: SharePlanRoute | None = None
    via: str | None = Field(default=None, max_length=120)


class SharePlanDay(BaseModel):
    index: int = Field(ge=1, le=60)
    label: str | None = Field(default=None, max_length=120)
    items: list[SharePlanItem] = Field(default_factory=list, max_length=8)


class SharePlanSource(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    author: str = Field(default="", max_length=120)
    url: str = Field(default="", max_length=500)


class ShareSummaryRequest(BaseModel):
    trip_name: str = Field(min_length=1, max_length=120)
    countries: list[str] = Field(default_factory=list, max_length=12)
    start_date: str | None = Field(default=None, max_length=32)
    num_days: int = Field(ge=1, le=60)
    origin: str | None = Field(default=None, max_length=120)
    days: list[SharePlanDay] = Field(min_length=1, max_length=30)
    sources: list[SharePlanSource] = Field(default_factory=list, max_length=5)


class ShareSummaryResponse(BaseModel):
    summary: str


def share_length_target(num_days: int) -> tuple[int, int, int]:
    """(min_chars, max_chars, max_tokens) según la duración del viaje."""
    n = max(1, int(num_days))
    if n <= 4:
        return 350, 600, 320
    if n <= 9:
        return 700, 1100, 520
    return 1200, 1800, 800


def _load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def _model() -> str:
    return (
        os.getenv("SHARE_SUMMARY_MODEL") or os.getenv("ASSISTANT_MODEL") or "deepseek-v4-flash"
    ).strip()


def _as_usage_user(user: VerifiedUser) -> AuthUser:
    return AuthUser(id=user.id, email=user.email, is_anonymous=False)


def sanitize_share_summary(raw: str) -> str:
    text = (raw or "").replace("\x00", "").strip()
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"^```(?:\w+)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = re.sub(
        r"^(aquí tienes(?: tu)? resumen(?: de(?:l viaje)?)?|resumen(?: del viaje)?)\s*[:.—–-]\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\*\*|__", "", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    if len(text) <= SHARE_TEXT_MAX:
        return text
    cut = text[:SHARE_TEXT_MAX]
    nl = cut.rfind("\n")
    if nl >= int(SHARE_TEXT_MAX * 0.6):
        cut = cut[:nl]
    else:
        cut = cut.rsplit(" ", 1)[0]
    return cut.strip()


def _build_user_message(body: ShareSummaryRequest) -> str:
    min_c, max_c, _tokens = share_length_target(body.num_days)
    payload = body.model_dump(by_alias=True)
    return (
        f"Escribe entre {min_c} y {max_c} caracteres. Nunca pases de {SHARE_TEXT_MAX}.\n\n"
        f"Plan del viaje (JSON):\n{json.dumps(payload, ensure_ascii=False)}"
    )


async def _call_deepseek(user_message: str, max_tokens: int) -> tuple[str, int | None]:
    key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY no configurada")

    client = AsyncOpenAI(
        api_key=key,
        base_url="https://api.deepseek.com",
        timeout=45.0,
    )
    completion = await client.chat.completions.create(
        model=_model(),
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": _load_prompt()},
            {"role": "user", "content": user_message},
        ],
        # v4-flash piensa por defecto y el razonamiento consume max_tokens:
        # 320/520/800 se iban enteros en CoT y content quedaba vacío (502).
        extra_body={"thinking": {"type": "disabled"}},
    )
    choice = completion.choices[0] if completion.choices else None
    raw = (choice.message.content if choice and choice.message else None) or ""
    usage = completion.usage
    output_tokens = getattr(usage, "completion_tokens", None) if usage else None
    if not raw.strip():
        log_kv(
            logger,
            event="share_summary_empty",
            finish_reason=getattr(choice, "finish_reason", None),
            output_tokens=output_tokens,
        )
    return raw.strip(), output_tokens


@router.post("/share-summary", response_model=ShareSummaryResponse)
async def post_share_summary(
    body: ShareSummaryRequest,
    user: VerifiedUser = Depends(require_verified_user),
) -> ShareSummaryResponse:
    await enforce_usage(_as_usage_user(user), "share_summary")
    _min_c, _max_c, max_tokens = share_length_target(body.num_days)

    try:
        raw, output_tokens = await _call_deepseek(_build_user_message(body), max_tokens)
    except HTTPException:
        raise
    except Exception as e:
        log_kv(
            logger,
            event="share_summary_failed",
            error=type(e).__name__,
            detail=str(e)[:240],
        )
        raise HTTPException(
            status_code=502,
            detail="No hemos podido escribir el resumen. Inténtalo otra vez.",
        ) from e

    summary = sanitize_share_summary(raw)
    if not summary:
        raise HTTPException(
            status_code=502,
            detail="La IA no devolvió un resumen usable.",
        )

    await record_event(user.id, "share_summary", cost_hint=output_tokens)
    return ShareSummaryResponse(summary=summary)
