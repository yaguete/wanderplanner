-- Onboarding de primer impacto: una vez por cuenta registrada, no por navegador.
--
-- Hasta ahora vivía solo en `localStorage` (`wp-onboarding-seen:{userId}`): en
-- incógnito, al cambiar de dispositivo o tras borrar datos del sitio volvía a
-- salir. Esta columna es la marca durable. La escribe el propio usuario con su
-- sesión (`profiles_update_own` ya cubre `auth.uid() = id`).
--
-- Cuentas registradas que ya existían: se marcan para no reabrirles el tour.
-- Los invitados (anónimos) se dejan en null — el auto-show de invitado sigue
-- yendo por sessionStorage + sello corto, no por esta columna.

alter table public.profiles
  add column if not exists onboarding_seen_at timestamptz;

comment on column public.profiles.onboarding_seen_at is
  'Cuándo vio (o se le reclamó) el onboarding de primer impacto. Null = nunca. Las cuentas registradas previas se marcan al añadir la columna.';

update public.profiles p
set onboarding_seen_at = coalesce(p.created_at, now())
from auth.users u
where u.id = p.id
  and coalesce(u.is_anonymous, false) = false
  and p.onboarding_seen_at is null;
