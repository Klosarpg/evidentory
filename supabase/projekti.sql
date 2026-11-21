-- Evidentory: projekti u kalendaru slobodnih dana + uloga "Project manager".
-- Pokreni jednom u Supabase dashboardu (projekat drmvkzsnzhrzfpoycstx): SQL Editor → New query → zalijepi → Run.
-- Zaposleni vide projekte u kalendaru (slovo P); projekti ne brane zakazivanje slobodnih dana.

create table if not exists public.projekti (
  id uuid primary key default gen_random_uuid(),
  naziv text not null check (char_length(naziv) between 1 and 120),
  opis text check (opis is null or char_length(opis) <= 1000),
  datum_od date not null,
  datum_do date not null,
  napravio uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint projekti_raspon check (datum_do >= datum_od)
);

create index if not exists projekti_datumi on public.projekti (datum_od, datum_do);

alter table public.projekti enable row level security;

-- Svi prijavljeni vide projekte.
drop policy if exists "projekti_citanje" on public.projekti;
create policy "projekti_citanje" on public.projekti for select to authenticated using (true);

-- Unos, izmjena i brisanje: dozvola "projekti_unos" ili administrator.
drop policy if exists "projekti_unos" on public.projekti;
create policy "projekti_unos" on public.projekti for insert to authenticated
  with check (public.ima_dozvolu('projekti_unos') or public.ima_dozvolu('admin'));
drop policy if exists "projekti_izmjena" on public.projekti;
create policy "projekti_izmjena" on public.projekti for update to authenticated
  using (public.ima_dozvolu('projekti_unos') or public.ima_dozvolu('admin'))
  with check (public.ima_dozvolu('projekti_unos') or public.ima_dozvolu('admin'));
drop policy if exists "projekti_brisanje" on public.projekti;
create policy "projekti_brisanje" on public.projekti for delete to authenticated
  using (public.ima_dozvolu('projekti_unos') or public.ima_dozvolu('admin'));

grant select, insert, update, delete on public.projekti to authenticated;
grant select, insert, update, delete on public.projekti to service_role;

-- Nova uloga. Dozvole joj možeš kasnije mijenjati u Administraciji → Uloge i dozvole.
insert into public.uloge (naziv, dozvole)
values ('Project manager', array['zalihe_pregled', 'odsustvo_zahtjev', 'projekti_unos'])
on conflict (naziv) do nothing;

notify pgrst, 'reload schema';
