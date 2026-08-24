"""Correo transaccional por HTTP (Resend). Sin SDK, sin dependencias nuevas."""
from __future__ import annotations

import html
import logging
import os
from urllib.parse import quote

import httpx

from obs import log_kv

logger = logging.getLogger(__name__)

BRAND_INK = "#86675B"
PAGE_BG = "#f7f6f3"
INK = "#171717"
BODY = "#404040"
MUTED = "#737373"
FAINT = "#a3a3a3"
CARD_BORDER = "#e5e5e5"
BTN_BG = "#272321"
FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
INVITE_TTL_DAYS = 14
ANON_INVITER = "Una persona"


def _env(*names: str, default: str = "") -> str:
    for name in names:
        v = (os.getenv(name) or "").strip()
        if v:
            return v
    return default


def _require_auth() -> bool:
    return _env("REQUIRE_AUTH", "REQUIRE_AUTH").lower() in ("1", "true", "yes")


def _site_url() -> str:
    return _env("SITE_URL", "SITE_URL", default="https://wanderplanner.ai").rstrip("/")


def _from_addr() -> str:
    return _env(
        "INVITE_EMAIL_FROM",
        "INVITE_EMAIL_FROM",
        default="WanderPlanner <hola@wanderplanner.ai>",
    )


def invite_url(token: str) -> str:
    return f"{_site_url()}/invite/{token}"


def invite_cta_url(token: str, *, existing_account: bool = False) -> str:
    """Quien ya tiene cuenta entra por `/login`; el resto acepta en `/invite`."""
    path = f"/invite/{token}"
    if existing_account:
        return f"{_site_url()}/login?next={quote(path, safe='')}"
    return f"{_site_url()}{path}"


def _clip(text: str, n: int) -> str:
    t = " ".join((text or "").split())
    if len(t) <= n:
        return t
    return t[: n - 1].rstrip() + "…"


def configured_inviter_name(*candidates: object) -> str:
    """Nombre real del invitante: nunca el local-part del email."""
    for raw in candidates:
        if not isinstance(raw, str):
            continue
        text = " ".join(raw.split())
        if text:
            return text
    return ""


def inviter_label(name: str | None) -> str:
    return _clip(configured_inviter_name(name), 80) or ANON_INVITER


def _privacy_url() -> str:
    return f"{_site_url()}/legal/privacidad"


def _legal_notice_url() -> str:
    return f"{_site_url()}/legal/aviso-legal"


def _card_html(
    *,
    title: str,
    preheader: str,
    body_html: str,
    cta_label: str,
    cta_url: str,
    expiry: str = "",
    footer: str,
) -> str:
    """Misma tarjeta que el correo de confirmación de cuenta (Auth)."""
    title_esc = html.escape(title)
    pre_esc = html.escape(preheader)
    cta_esc = html.escape(cta_label)
    url_esc = html.escape(cta_url)
    expiry_esc = html.escape(expiry)
    footer_esc = html.escape(footer)
    privacy = html.escape(_privacy_url())
    notice = html.escape(_legal_notice_url())
    pad = "&#8199;&#847;" * 10
    expiry_block = (
        f'<p style="margin:24px 0 0 0;font-family:{FONT};font-size:13px;line-height:1.6;color:{MUTED};">{expiry_esc}</p>'
        if expiry
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{title_esc}</title>
</head>
<body style="margin:0;padding:0;background-color:{PAGE_BG};">
<div style="display:none;font-size:1px;color:{PAGE_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{pre_esc}{pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{PAGE_BG};">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr>
<td align="left" style="padding:0 4px 20px 4px;">
<span style="font-family:{FONT};font-size:16px;font-weight:600;letter-spacing:-0.02em;color:{BRAND_INK};">WanderPlanner</span>
</td>
</tr>
<tr>
<td style="background-color:#ffffff;border:1px solid {CARD_BORDER};border-radius:10px;padding:40px 36px;">
<h1 style="margin:0 0 14px 0;font-family:{FONT};font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.025em;color:{INK};">{title_esc}</h1>
{body_html}
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="{BTN_BG}" style="border-radius:10px;">
<a href="{url_esc}" style="display:inline-block;padding:13px 26px;font-family:{FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">{cta_esc}</a>
</td>
</tr>
</table>
{expiry_block}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:24px 0 0 0;border-bottom:1px solid #f0efed;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
<p style="margin:24px 0 6px 0;font-family:{FONT};font-size:13px;line-height:1.6;color:{MUTED};">¿No te funciona el botón? Copia este enlace en tu navegador:</p>
<p style="margin:0;font-family:{FONT};font-size:12px;line-height:1.5;word-break:break-all;">
<a href="{url_esc}" style="color:{BRAND_INK};text-decoration:underline;">{url_esc}</a>
</p>
</td>
</tr>
<tr>
<td style="padding:24px 4px 0 4px;">
<p style="margin:0 0 14px 0;font-family:{FONT};font-size:13px;line-height:1.6;color:{MUTED};">{footer_esc}</p>
<p style="margin:0;font-family:{FONT};font-size:12px;line-height:1.7;color:{FAINT};">
WanderPlanner · <a href="mailto:hola@wanderplanner.ai" style="color:{FAINT};text-decoration:underline;">hola@wanderplanner.ai</a><br>
<a href="{privacy}" style="color:{FAINT};text-decoration:underline;">Privacidad</a> &nbsp;·&nbsp; <a href="{notice}" style="color:{FAINT};text-decoration:underline;">Aviso legal</a>
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>"""


def _invite_bodies(
    *,
    inviter_name: str,
    trip_name: str,
    token: str,
    existing_account: bool = False,
) -> tuple[str, str, str]:
    who = inviter_label(inviter_name)
    trip = _clip(trip_name, 80) or "un viaje"
    url = invite_cta_url(token, existing_account=existing_account)
    subject = f"{who} te invita a editar «{trip}»"
    cta_label = "Entrar y unirme" if existing_account else "Aceptar invitación"
    cta_text = "Entra en tu cuenta para unirte:" if existing_account else "Acepta la invitación:"

    who_esc = html.escape(who)
    trip_esc = html.escape(trip)

    text = (
        f"{who} te invita a editar «{trip}» en WanderPlanner.\n\n"
        f"{cta_text} {url}\n\n"
        f"El enlace caduca en {INVITE_TTL_DAYS} días.\n"
        "Si no conoces a esta persona, ignora este correo; "
        "no se ha creado ninguna cuenta a tu nombre."
    )
    extra = (
        "Ya tienes cuenta: entra para unirte al viaje."
        if existing_account
        else "Podréis editar el plan a la vez. El asistente de cada uno sigue siendo privado."
    )
    body_html = (
        f'<p style="margin:0 0 8px 0;font-family:{FONT};font-size:15px;line-height:1.6;color:{BODY};">'
        f"<strong>{who_esc}</strong> te invita a editar <strong>{trip_esc}</strong> en WanderPlanner."
        f"</p>"
        f'<p style="margin:0 0 28px 0;font-family:{FONT};font-size:15px;line-height:1.6;color:{BODY};">'
        f"{html.escape(extra)}"
        "</p>"
    )
    html_body = _card_html(
        title="Te invitan a un viaje",
        preheader=f"{who} te invita a editar «{trip}»",
        body_html=body_html,
        cta_label=cta_label,
        cta_url=url,
        expiry=f"El enlace caduca en {INVITE_TTL_DAYS} días.",
        footer=(
            "Si no conoces a esta persona, ignora este correo; "
            "no se ha creado ninguna cuenta a tu nombre."
        ),
    )
    return subject, text, html_body


def _added_bodies(
    *,
    inviter_name: str,
    trip_name: str,
) -> tuple[str, str, str]:
    who = inviter_label(inviter_name)
    trip = _clip(trip_name, 80) or "un viaje"
    url = f"{_site_url()}/trips"
    subject = f"{who} te ha añadido a «{trip}»"
    who_esc = html.escape(who)
    trip_esc = html.escape(trip)
    text = (
        f"{who} te ha añadido a «{trip}» en WanderPlanner.\n\n"
        f"Ábrelo en: {url}\n"
    )
    inner = (
        f'<p style="margin:0 0 8px 0;font-family:{FONT};font-size:15px;line-height:1.6;color:{BODY};">'
        f"<strong>{who_esc}</strong> te ha añadido a <strong>{trip_esc}</strong> en WanderPlanner."
        f"</p>"
        f'<p style="margin:0 0 28px 0;font-family:{FONT};font-size:15px;line-height:1.6;color:{BODY};">'
        "Podréis editar el plan a la vez. El asistente de cada uno sigue siendo privado."
        "</p>"
    )
    html_body = _card_html(
        title="Te han añadido a un viaje",
        preheader=f"{who} te ha añadido a «{trip}»",
        body_html=inner,
        cta_label="Abrir WanderPlanner",
        cta_url=url,
        footer="Si no esperabas este mensaje, puedes ignorarlo.",
    )
    return subject, text, html_body


async def send_invite_email(
    *,
    to: str,
    inviter_name: str,
    trip_name: str,
    token: str,
    existing_account: bool = False,
) -> bool:
    """
    Envía el correo de invitación. Sin clave: log en local y False; en producción (REQUIRE_AUTH) falla.
    """
    subject, text, html_body = _invite_bodies(
        inviter_name=inviter_name,
        trip_name=trip_name,
        token=token,
        existing_account=existing_account,
    )
    api_key = _env("RESEND_API_KEY", "RESEND_API_KEY")
    if not api_key:
        log_kv(
            logger,
            event="invite_email_skipped",
            to=to,
            reason="no_resend_key",
        )
        if _require_auth():
            raise RuntimeError("RESEND_API_KEY is required in production")
        return False

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": _from_addr(),
                "to": [to],
                "subject": subject,
                "text": text,
                "html": html_body,
            },
        )
    if r.status_code >= 300:
        snippet = (r.text or "")[:400]
        logger.warning("invite_email_failed status=%s body=%s", r.status_code, snippet)
        if _require_auth():
            raise RuntimeError(f"Resend HTTP {r.status_code}")
        return False
    log_kv(logger, event="invite_email_sent", to=to)
    return True


async def send_added_email(
    *,
    to: str,
    inviter_name: str,
    trip_name: str,
) -> None:
    """Aviso a un compañero añadido directamente (sin token de invitación)."""
    subject, text, html_body = _added_bodies(
        inviter_name=inviter_name,
        trip_name=trip_name,
    )
    api_key = _env("RESEND_API_KEY", "RESEND_API_KEY")
    if not api_key:
        log_kv(logger, event="added_email_skipped", to=to, reason="no_resend_key")
        if _require_auth():
            raise RuntimeError("RESEND_API_KEY is required in production")
        return
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": _from_addr(),
                "to": [to],
                "subject": subject,
                "text": text,
                "html": html_body,
            },
        )
    if r.status_code >= 300:
        logger.warning("added_email_failed status=%s body=%s", r.status_code, (r.text or "")[:400])
        if _require_auth():
            raise RuntimeError(f"Resend HTTP {r.status_code}")
        return

