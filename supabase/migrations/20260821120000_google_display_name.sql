-- Google OAuth manda `full_name` / `name` en raw_user_meta_data, no `display_name`.
-- Sin este coalesce, todo usuario de Google nacería con profiles.display_name a null.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, signup_referrer)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    ),
    nullif(new.raw_user_meta_data ->> 'signup_referrer', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
