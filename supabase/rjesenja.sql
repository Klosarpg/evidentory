-- Evidentory: podaci za rješenje o godišnjem odmoru
-- Pokreni jednom u Supabase dashboardu (projekat drmvkzsnzhrzfpoycstx):
-- SQL Editor → New query → zalijepi → Run. Bezbjedno je pokrenuti više puta.
-- Pokreni ga POSLIJE "odsustvo.sql".

-- 1) Podaci zaposlenog za rješenje (upisuje admin). JMBG se namjerno NE čuva: upisuje se ručno na odštampano rješenje.
alter table public.profili add column if not exists ime_prezime text;
alter table public.profili add column if not exists radno_mjesto text;
alter table public.profili add column if not exists pol text check (pol in ('M', 'Ž'));
alter table public.profili add column if not exists radni_odnos text not null default 'neodređeno'
  check (radni_odnos in ('neodređeno', 'određeno'));

-- 2) Broj i datum rješenja za odobren godišnji odmor.
alter table public.odsustva add column if not exists broj_rjesenja text;
alter table public.odsustva add column if not exists datum_rjesenja date;

-- 3) Ove podatke korisnik ne može sam mijenjati; samo admin (preko aplikacije).
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
      or new.slava_naziv is distinct from old.slava_naziv
      or new.ime_prezime is distinct from old.ime_prezime
      or new.radno_mjesto is distinct from old.radno_mjesto
      or new.pol is distinct from old.pol
      or new.radni_odnos is distinct from old.radni_odnos)
     and auth.uid() is not null
     and not public.ima_dozvolu('admin')
  then
    raise exception 'Ovu izmjenu može napraviti samo administrator.';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
