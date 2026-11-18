-- Evidentory: uloge sa dozvolama + email korisnika za obavještenja
-- Pokreni jednom u Supabase dashboardu: SQL Editor → New query → zalijepi → Run.
-- Bezbjedno je pokrenuti više puta. Pokreni ga POSLIJE "novi-korisnici.sql".

-- 1) Tabela uloga. Svaka uloga ima listu dozvola (čekiraju se u Kontrolnom panelu).
create table if not exists public.uloge (
  naziv text primary key,
  dozvole text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Postojeće uloge dobijaju ista prava kao do sada (+ podnošenje zahtjeva za slobodne dane).
insert into public.uloge (naziv, dozvole) values
  ('Korisnik', array['zalihe_pregled', 'odsustvo_zahtjev']),
  ('Korisnik sa pravom povlacenja', array['zalihe_pregled', 'zalihe_knjizenje', 'odsustvo_zahtjev']),
  ('Admin', array['zalihe_pregled', 'zalihe_knjizenje', 'odsustvo_zahtjev', 'odsustvo_odobravanje',
                  'odsustvo_pregled_svih', 'odsustvo_dokument', 'admin'])
on conflict (naziv) do nothing;

-- Svaka uloga koju korisnici već imaju, a nije gore navedena, dobija osnovna prava.
insert into public.uloge (naziv, dozvole)
select distinct p.uloga, array['zalihe_pregled', 'odsustvo_zahtjev']
from public.profili p
where p.uloga is not null
on conflict (naziv) do nothing;

-- Svi prijavljeni korisnici mogu da čitaju uloge; mijenjaju se samo preko serverske rute (service ključ).
alter table public.uloge enable row level security;
drop policy if exists "uloge_citanje" on public.uloge;
create policy "uloge_citanje" on public.uloge for select to authenticated using (true);

-- 2) Uloga korisnika mora postojati u tabeli uloga (preimenovanje uloge se prenosi na korisnike).
alter table public.profili drop constraint if exists profili_uloga_fk;
alter table public.profili
  add constraint profili_uloga_fk foreign key (uloga) references public.uloge (naziv)
  on update cascade not valid;

-- 3) Pravi email korisnika za obavještenja (prijava i dalje ide korisničkim imenom).
alter table public.profili add column if not exists kontakt_email text;

-- 4) Pomoćna funkcija: da li prijavljeni korisnik ima dozvolu.
create or replace function public.ima_dozvolu(d text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profili p
    join public.uloge u on u.naziv = p.uloga
    where p.id = auth.uid() and d = any (u.dozvole)
  );
$$;

-- 5) Ulogu i email za obavještenja može mijenjati samo korisnik sa dozvolom "admin".
--    Promjene iz SQL Editora i serverskih ruta (bez prijavljenog korisnika) su dozvoljene.
create or replace function public.zastiti_ulogu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.uloga is distinct from old.uloga or new.kontakt_email is distinct from old.kontakt_email)
     and auth.uid() is not null
     and not public.ima_dozvolu('admin')
  then
    raise exception 'Samo administrator može mijenjati uloge i email korisnika.';
  end if;
  return new;
end;
$$;

drop trigger if exists zastita_uloge on public.profili;
create trigger zastita_uloge
  before update on public.profili
  for each row execute function public.zastiti_ulogu();
