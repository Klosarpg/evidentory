-- Evidentory: automatski profil za nove korisnike + zaštita uloga
-- Pokreni jednom u Supabase dashboardu: SQL Editor → New query → zalijepi → Run.
-- Bezbjedno je pokrenuti više puta.

-- 1) Svaki novi korisnik (registracija preko emaila) automatski dobija red u "profili"
--    sa najnižom ulogom "Korisnik" (samo pregled).
create or replace function public.novi_korisnik_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profili (id, email, uloga)
  values (new.id, new.email, 'Korisnik')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists na_novog_korisnika on auth.users;
create trigger na_novog_korisnika
  after insert on auth.users
  for each row execute function public.novi_korisnik_profil();

-- 2) Postojeći nalozi koji još nemaju profil dobijaju ga sada (ulogu kasnije mijenjaš u Kontrolnom panelu).
insert into public.profili (id, email, uloga)
select u.id, u.email, 'Korisnik'
from auth.users u
where not exists (select 1 from public.profili p where p.id = u.id);

-- 3) Ulogu može promijeniti samo Admin. Bez ovoga bi novi korisnik, ako RLS to dozvoljava,
--    mogao sam sebi dodijeliti "Admin" direktnim pozivom API-ja.
--    Promjene iz SQL Editora (bez prijavljenog korisnika) i dalje su dozvoljene.
create or replace function public.zastiti_ulogu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.uloga is distinct from old.uloga
     and auth.uid() is not null
     and not exists (
       select 1 from public.profili
       where id = auth.uid() and uloga = 'Admin'
     )
  then
    raise exception 'Samo administrator može mijenjati uloge.';
  end if;
  return new;
end;
$$;

drop trigger if exists zastita_uloge on public.profili;
create trigger zastita_uloge
  before update on public.profili
  for each row execute function public.zastiti_ulogu();
