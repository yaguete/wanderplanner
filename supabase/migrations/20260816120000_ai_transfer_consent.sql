-- Constancia del consentimiento del art. 49.1.a RGPD (envío del contexto del viaje
-- a proveedores de IA en países sin decisión de adecuación).
--
-- Hasta ahora vivía solo en `localStorage` del navegador: servía para la UI pero no
-- para demostrar nada (arts. 5.2 y 7.1: responsabilidad proactiva). Estas dos columnas
-- son el registro. `version` es la fecha del texto que se le enseñó al usuario: si
-- cambian los países del aviso, se sube la versión en el front y se vuelve a preguntar,
-- porque un consentimiento informado solo cubre lo que se leyó.
--
-- Lo escribe el propio usuario con su sesión: `profiles_update_own` ya permite
-- `auth.uid() = id`, así que no hacen falta políticas nuevas. Los invitados también
-- tienen fila (la crea `handle_new_user`).

alter table public.profiles
  add column if not exists ai_transfer_consent_at timestamptz,
  add column if not exists ai_transfer_consent_version text;

comment on column public.profiles.ai_transfer_consent_at is
  'Cuándo aceptó el envío a proveedores de IA fuera de la UE. Null = nunca.';
comment on column public.profiles.ai_transfer_consent_version is
  'Versión del texto aceptado (AI_TRANSFER_CONSENT_VERSION en el front).';
