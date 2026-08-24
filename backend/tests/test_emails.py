"""Cuerpo del correo de invitación: nombre real, nunca el email."""
from emails import ANON_INVITER, _invite_bodies, inviter_label


def test_inviter_label_blank_is_una_persona():
    assert inviter_label("") == ANON_INVITER
    assert inviter_label("  ") == ANON_INVITER
    assert inviter_label(None) == ANON_INVITER
    assert inviter_label("María") == "María"


def test_invite_body_uses_name_and_omits_email():
    subject, text, html_body = _invite_bodies(
        inviter_name="María López",
        trip_name="Austria — 10 días",
        token="tok",
    )
    assert "María López" in subject
    assert "María López" in text
    assert "María López" in html_body
    assert "gmail.com" not in text
    assert "gmail.com" not in html_body
    assert "(" not in text.split("te invita")[0]


def test_invite_body_anonymous_when_no_name():
    subject, text, html_body = _invite_bodies(
        inviter_name="",
        trip_name="Alaska",
        token="tok",
    )
    assert subject.startswith("Una persona te invita")
    assert text.startswith("Una persona te invita a editar")
    assert "Una persona" in html_body
    assert "@" not in text.split("WanderPlanner")[0]


def test_invite_html_matches_confirmation_layout():
    _subject, text, html_body = _invite_bodies(
        inviter_name="María López",
        trip_name="Austria — 10 días",
        token="tok",
    )
    assert "Te invitan a un viaje" in html_body
    assert "Aceptar invitación" in html_body
    assert "#f7f6f3" in html_body
    assert "#86675B" in html_body
    assert "Acepta la invitación:" in text
    assert "/invite/tok" in html_body
    assert "/legal/privacidad" in html_body
    assert "/legal/aviso-legal" in html_body
    assert "hola@wanderplanner.ai" in html_body
    assert "caduca en 14 días" in html_body


def test_added_html_matches_confirmation_layout():
    from emails import _added_bodies

    subject, text, html_body = _added_bodies(
        inviter_name="Yago",
        trip_name="Verano 2027 - Tenerife",
    )
    assert "Yago te ha añadido" in subject
    assert "Te han añadido a un viaje" in html_body
    assert "Abrir WanderPlanner" in html_body
    assert "#f7f6f3" in html_body
    assert "/trips" in html_body
    assert "/legal/privacidad" in html_body
    assert "caduca" not in html_body
    assert "Ábrelo en:" in text


def test_invite_existing_account_cta_is_login():
    from emails import invite_cta_url, _invite_bodies

    assert "/invite/tok" in invite_cta_url("tok")
    assert "/login?next=" in invite_cta_url("tok", existing_account=True)
    assert "%2Finvite%2Ftok" in invite_cta_url("tok", existing_account=True)

    _subject, text, html_body = _invite_bodies(
        inviter_name="María López",
        trip_name="Austria — 10 días",
        token="tok",
        existing_account=True,
    )
    assert "Entrar y unirme" in html_body
    assert "Aceptar invitación" not in html_body
    assert "/login?next=" in html_body
    assert "/login?next=" in text
    assert "Entra en tu cuenta para unirte:" in text
    assert "Ya tienes cuenta" in html_body
