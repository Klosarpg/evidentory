// Spisak dozvola koje se čekiraju po ulozi, i učitavanje dozvola prijavljenog korisnika.

export const DOZVOLE = [
  { kljuc: 'zalihe_pregled', naziv: 'Pregled zaliha', grupa: 'Evidencija zaliha' },
  { kljuc: 'zalihe_knjizenje', naziv: 'Prijem, otpremnice i rezervacije', grupa: 'Evidencija zaliha' },
  { kljuc: 'odsustvo_zahtjev', naziv: 'Podnošenje zahtjeva', grupa: 'Slobodni dani' },
  { kljuc: 'odsustvo_odobravanje', naziv: 'Odobravanje zahtjeva', grupa: 'Slobodni dani' },
  { kljuc: 'odsustvo_pregled_svih', naziv: 'Pregled svih korisnika', grupa: 'Slobodni dani' },
  { kljuc: 'odsustvo_dokument', naziv: 'Prima dokument za štampu', grupa: 'Slobodni dani' },
  { kljuc: 'projekti_unos', naziv: 'Unos projekata u kalendar', grupa: 'Slobodni dani' },
  { kljuc: 'admin', naziv: 'Administracija (korisnici, uloge, artikli, komitenti)', grupa: 'Administracija' },
];

export const KLJUCEVI_DOZVOLA = DOZVOLE.map((d) => d.kljuc);

// Dok SQL za uloge nije pokrenut, stare uloge zadržavaju svoja prava.
const STARE_ULOGE = {
  Korisnik: ['zalihe_pregled', 'odsustvo_zahtjev'],
  'Korisnik sa pravom povlacenja': ['zalihe_pregled', 'zalihe_knjizenje', 'odsustvo_zahtjev'],
  Admin: KLJUCEVI_DOZVOLA,
};

export function dozvoleStareUloge(uloga) {
  return STARE_ULOGE[uloga] || STARE_ULOGE.Korisnik;
}

// Vraća { user, korisnickoIme, uloga, kontaktEmail, dozvole: string[] } ili null ako niko nije prijavljen.
export async function ucitajMojeDozvole(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profil } = await supabase.from('profili').select('*').eq('id', user.id).maybeSingle();
  const uloga = profil?.uloga || 'Korisnik';

  let dozvole = null;
  const { data: ulogaRed, error: ulogeGreska } = await supabase
    .from('uloge').select('dozvole').eq('naziv', uloga).maybeSingle();
  if (!ulogeGreska && ulogaRed) dozvole = ulogaRed.dozvole || [];
  if (dozvole === null) dozvole = dozvoleStareUloge(uloga);

  return {
    user,
    korisnickoIme: (user.email || '').split('@')[0],
    uloga,
    kontaktEmail: profil?.kontakt_email || '',
    dozvole,
  };
}
