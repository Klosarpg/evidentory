-- Evidentory: ime i prezime u dativu za obrazloženje rješenja ("Zaposlenoj Katarini Živković").
-- Pokreni jednom u Supabase dashboardu (projekat drmvkzsnzhrzfpoycstx): SQL Editor → New query → zalijepi → Run.
-- Ako ostane prazno, aplikacija sama pravi oblik iz imena i prezimena.
alter table public.profili add column if not exists ime_prezime_dativ text;

-- Samo admin može mijenjati i ovaj podatak.
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
      or new.ime_prezime_dativ is distinct from old.ime_prezime_dativ
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
