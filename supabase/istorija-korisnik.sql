-- Evidentory: veza istorije prometa sa nalogom korisnika
-- Pokreni jednom u Supabase dashboardu: SQL Editor → New query → zalijepi → Run.
-- Bezbjedno je pokrenuti više puta.

-- 1) Nova kolona: ko je napravio unos (nalog). Popunjava se sama za svaki novi unos
--    prijavljenog korisnika, pa aplikaciju za to nije trebalo mijenjati.
--    Ako se korisnik obriše, njegovi unosi ostaju (veza se samo isprazni, ime u tekstu ostaje).
alter table public.istorija
  add column if not exists korisnik_id uuid
  default auth.uid()
  references auth.users (id) on delete set null;

create index if not exists istorija_korisnik_id_idx on public.istorija (korisnik_id);

-- 2) Postojeće unose povezujemo sa nalozima po korisničkom imenu
--    ("admin" u istoriji ↔ nalog "admin@evidentory.com").
update public.istorija i
set korisnik_id = p.id
from public.profili p
where i.korisnik_id is null
  and lower(i.korisnik) = lower(split_part(p.email, '@', 1));

-- Provjera: koliko unosa je ostalo bez veze (npr. korisnici koji su ranije obrisani).
select count(*) as unosi_bez_korisnika from public.istorija where korisnik_id is null;
