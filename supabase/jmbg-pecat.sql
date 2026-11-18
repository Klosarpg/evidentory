-- Evidentory: JMBG zaposlenih i privatno skladište za pečat i potpis
-- Pokreni jednom u Supabase dashboardu (projekat drmvkzsnzhrzfpoycstx):
-- SQL Editor → New query → zalijepi → Run. Bezbjedno je pokrenuti više puta.

-- 1) JMBG u posebnoj, zaključanoj tabeli.
--    RLS je uključen BEZ ijedne politike: iz browsera ga niko ne može ni čitati ni pisati,
--    čak ni admin. Čita ga i upisuje samo server (service ključ) kad pravi rješenje ili kad admin sačuva JMBG.
create table if not exists public.zaposleni_jmbg (
  korisnik_id uuid primary key references auth.users (id) on delete cascade,
  jmbg text not null check (jmbg ~ '^[0-9]{13}$'),
  azurirano_at timestamptz not null default now()
);
alter table public.zaposleni_jmbg enable row level security;
revoke all on public.zaposleni_jmbg from anon, authenticated;
grant select, insert, update, delete on public.zaposleni_jmbg to service_role;

-- 2) Privatni bucket "firma" za pečat i potpis (public = false: nema javnog linka).
--    Slike postavljaš u Storage → firma: potpis.png i pecat.png.
insert into storage.buckets (id, name, public)
values ('firma', 'firma', false)
on conflict (id) do update set public = false;

notify pgrst, 'reload schema';
