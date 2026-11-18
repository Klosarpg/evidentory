-- Evidentory: modul Slobodni dani
-- Pokreni jednom u Supabase dashboardu (projekat drmvkzsnzhrzfpoycstx):
-- SQL Editor → New query → zalijepi → Run. Bezbjedno je pokrenuti više puta.
-- Pokreni ga POSLIJE "uloge-dozvole.sql".

-- 1) Praznici: dani koji se ne računaju u slobodne dane. Admin ih može dopunjavati.
create table if not exists public.praznici (
  datum date primary key,
  naziv text not null
);

-- 2) Zahtjevi za odsustvo.
create table if not exists public.odsustva (
  id bigint generated always as identity primary key,
  korisnik_id uuid not null references auth.users (id) on delete cascade,
  korisnik_ime text not null,
  tip text not null check (tip in ('godisnji', 'neplaceno')),
  datum_od date not null,
  datum_do date not null,
  radnih_dana integer not null,
  napomena text,
  status text not null default 'na_cekanju'
    check (status in ('na_cekanju', 'odobreno', 'odbijeno', 'otkazano')),
  obradio_id uuid references auth.users (id) on delete set null,
  obradio_ime text,
  obradjeno_at timestamptz,
  komentar text,
  created_at timestamptz not null default now(),
  check (datum_do >= datum_od)
);
create index if not exists odsustva_korisnik_idx on public.odsustva (korisnik_id, datum_od);
create index if not exists odsustva_status_idx on public.odsustva (status);

-- 3) Korekcije po korisniku i godini (upisuje admin):
--    dana   = dani godišnjeg iskorišćeni van aplikacije (npr. prije njenog uvođenja)
--    prenos = dodatno prenesenih dana iz ranijih godina (važe do 30. juna te godine)
create table if not exists public.odsustvo_korekcije (
  korisnik_id uuid not null references auth.users (id) on delete cascade,
  godina integer not null,
  dana integer not null default 0,
  prenos integer not null default 0,
  napomena text,
  primary key (korisnik_id, godina)
);
alter table public.odsustvo_korekcije add column if not exists prenos integer not null default 0;

-- 4) Slava korisnika (format 'MM-DD', npr. '12-19' za Svetog Nikolu).
alter table public.profili add column if not exists slava_datum text;
alter table public.profili add column if not exists slava_naziv text;

-- 5) Ko šta smije da čita. Upisi idu samo preko serverske rute (service ključ).
alter table public.praznici enable row level security;
drop policy if exists "praznici_citanje" on public.praznici;
create policy "praznici_citanje" on public.praznici for select to authenticated using (true);

alter table public.odsustva enable row level security;
drop policy if exists "odsustva_citanje" on public.odsustva;
create policy "odsustva_citanje" on public.odsustva for select to authenticated
  using (korisnik_id = auth.uid()
         or public.ima_dozvolu('odsustvo_odobravanje')
         or public.ima_dozvolu('odsustvo_pregled_svih'));

alter table public.odsustvo_korekcije enable row level security;
drop policy if exists "korekcije_citanje" on public.odsustvo_korekcije;
create policy "korekcije_citanje" on public.odsustvo_korekcije for select to authenticated
  using (korisnik_id = auth.uid()
         or public.ima_dozvolu('odsustvo_odobravanje')
         or public.ima_dozvolu('odsustvo_pregled_svih'));

-- Odobravači i pregled svih vide listu korisnika (ako je RLS na "profili" uključen).
drop policy if exists "profili_pregled_odsustva" on public.profili;
create policy "profili_pregled_odsustva" on public.profili for select to authenticated
  using (id = auth.uid()
         or public.ima_dozvolu('odsustvo_odobravanje')
         or public.ima_dozvolu('odsustvo_pregled_svih')
         or public.ima_dozvolu('admin'));

-- 6) Ulogu, email i slavu korisnik ne može sam mijenjati direktno (slavu bira preko aplikacije).
create or replace function public.zastiti_ulogu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.uloga is distinct from old.uloga
      or new.kontakt_email is distinct from old.kontakt_email
      or new.slava_datum is distinct from old.slava_datum
      or new.slava_naziv is distinct from old.slava_naziv)
     and auth.uid() is not null
     and not public.ima_dozvolu('admin')
  then
    raise exception 'Ovu izmjenu može napraviti samo administrator.';
  end if;
  return new;
end;
$$;

-- 7) Praznici Crne Gore 2026–2030: državni i drugi praznici, uključujući Njegošev dan (dva dana,
--    uz pomjeranje kad padnu u nedjelju) i pravoslavni Badnji dan, Božić, Veliki petak i Vaskrs.
insert into public.praznici (datum, naziv) values
  ('2026-01-01', 'Nova godina'),
  ('2026-01-02', 'Nova godina'),
  ('2026-01-06', 'Badnji dan'),
  ('2026-01-07', 'Božić'),
  ('2026-01-08', 'Božić (drugi dan)'),
  ('2026-04-10', 'Veliki petak'),
  ('2026-04-12', 'Vaskrs'),
  ('2026-04-13', 'Vaskrs (drugi dan)'),
  ('2026-05-01', 'Praznik rada'),
  ('2026-05-02', 'Praznik rada'),
  ('2026-05-21', 'Dan nezavisnosti'),
  ('2026-05-22', 'Dan nezavisnosti'),
  ('2026-07-13', 'Dan državnosti'),
  ('2026-07-14', 'Dan državnosti'),
  ('2027-01-01', 'Nova godina'),
  ('2027-01-02', 'Nova godina'),
  ('2027-01-06', 'Badnji dan'),
  ('2027-01-07', 'Božić'),
  ('2027-01-08', 'Božić (drugi dan)'),
  ('2027-04-30', 'Veliki petak'),
  ('2027-05-01', 'Praznik rada'),
  ('2027-05-02', 'Praznik rada'),
  ('2027-05-03', 'Praznik rada (neradni dan)'),
  ('2027-05-21', 'Dan nezavisnosti'),
  ('2027-05-22', 'Dan nezavisnosti'),
  ('2027-07-13', 'Dan državnosti'),
  ('2027-07-14', 'Dan državnosti'),
  ('2028-01-01', 'Nova godina'),
  ('2028-01-02', 'Nova godina'),
  ('2028-01-03', 'Nova godina (neradni dan)'),
  ('2028-01-06', 'Badnji dan'),
  ('2028-01-07', 'Božić'),
  ('2028-01-08', 'Božić (drugi dan)'),
  ('2028-04-14', 'Veliki petak'),
  ('2028-04-16', 'Vaskrs'),
  ('2028-04-17', 'Vaskrs (drugi dan)'),
  ('2028-05-01', 'Praznik rada'),
  ('2028-05-02', 'Praznik rada'),
  ('2028-05-21', 'Dan nezavisnosti'),
  ('2028-05-22', 'Dan nezavisnosti'),
  ('2028-05-23', 'Dan nezavisnosti (neradni dan)'),
  ('2028-07-13', 'Dan državnosti'),
  ('2028-07-14', 'Dan državnosti'),
  ('2029-01-01', 'Nova godina'),
  ('2029-01-02', 'Nova godina'),
  ('2029-01-06', 'Badnji dan'),
  ('2029-01-07', 'Božić'),
  ('2029-01-08', 'Božić (drugi dan)'),
  ('2029-04-06', 'Veliki petak'),
  ('2029-04-08', 'Vaskrs'),
  ('2029-04-09', 'Vaskrs (drugi dan)'),
  ('2029-05-01', 'Praznik rada'),
  ('2029-05-02', 'Praznik rada'),
  ('2029-05-21', 'Dan nezavisnosti'),
  ('2029-05-22', 'Dan nezavisnosti'),
  ('2029-07-13', 'Dan državnosti'),
  ('2029-07-14', 'Dan državnosti'),
  ('2030-01-01', 'Nova godina'),
  ('2030-01-02', 'Nova godina'),
  ('2030-01-06', 'Badnji dan'),
  ('2030-01-07', 'Božić'),
  ('2030-01-08', 'Božić (drugi dan)'),
  ('2030-04-26', 'Veliki petak'),
  ('2030-04-28', 'Vaskrs'),
  ('2030-04-29', 'Vaskrs (drugi dan)'),
  ('2030-05-01', 'Praznik rada'),
  ('2030-05-02', 'Praznik rada'),
  ('2030-05-21', 'Dan nezavisnosti'),
  ('2030-05-22', 'Dan nezavisnosti'),
  ('2030-07-13', 'Dan državnosti'),
  ('2030-07-14', 'Dan državnosti'),
  ('2030-07-15', 'Dan državnosti (neradni dan)'),
  ('2026-11-13', 'Njegošev dan'),
  ('2026-11-14', 'Njegošev dan'),
  ('2027-11-13', 'Njegošev dan'),
  ('2027-11-14', 'Njegošev dan'),
  ('2027-11-15', 'Njegošev dan (neradni dan)'),
  ('2028-11-13', 'Njegošev dan'),
  ('2028-11-14', 'Njegošev dan'),
  ('2029-11-13', 'Njegošev dan'),
  ('2029-11-14', 'Njegošev dan'),
  ('2030-11-13', 'Njegošev dan'),
  ('2030-11-14', 'Njegošev dan')
on conflict (datum) do nothing;

-- 8) Dozvole za API i osvježavanje API-ja.
grant select on public.praznici, public.odsustva, public.odsustvo_korekcije to authenticated;
grant select, insert, update, delete on public.praznici, public.odsustva, public.odsustvo_korekcije to service_role;
notify pgrst, 'reload schema';
