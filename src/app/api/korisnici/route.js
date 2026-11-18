import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Upravljanje korisnicima iz Kontrolnog panela (samo Admin), bez slanja emailova.
// Korisnik se prijavljuje korisničkim imenom; u Supabase-u nalog ima adresu "ime@evidentory.com".

const DOMEN = 'evidentory.com';
const DOZVOLJENE_ULOGE = ['Korisnik', 'Korisnik sa pravom povlacenja', 'Admin'];
const MIN_LOZINKA = 6;

function adminKlijent() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function greska(poruka, status = 400) {
  return NextResponse.json({ error: poruka }, { status });
}

// Vraća admin klijent ako je pošiljalac prijavljeni Admin, inače odgovor sa greškom.
async function provjeriAdmina(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { odgovor: greska('Na serveru nije podešen SUPABASE_SERVICE_ROLE_KEY.', 500) };
  }
  const supabase = adminKlijent();
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { odgovor: greska('Nisi prijavljen. Prijavi se ponovo.', 401) };

  const { data: profil } = await supabase.from('profili').select('uloga').eq('id', data.user.id).single();
  if (profil?.uloga !== 'Admin') return { odgovor: greska('Samo administrator može upravljati korisnicima.', 403) };

  return { supabase };
}

// POST /api/korisnici  { korisnickoIme, lozinka, uloga }  → kreira novi nalog
export async function POST(request) {
  const { supabase, odgovor } = await provjeriAdmina(request);
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const ime = String(tijelo.korisnickoIme || '').trim().toLowerCase();
  const lozinka = String(tijelo.lozinka || '');
  const uloga = DOZVOLJENE_ULOGE.includes(tijelo.uloga) ? tijelo.uloga : 'Korisnik';

  if (!/^[a-z0-9._-]{3,30}$/.test(ime)) {
    return greska('Korisničko ime: 3–30 znakova, samo slova bez kvačica, brojevi, tačka, crtica i donja crta.');
  }
  if (lozinka.length < MIN_LOZINKA) return greska(`Lozinka mora imati najmanje ${MIN_LOZINKA} znakova.`);

  const email = `${ime}@${DOMEN}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: lozinka,
    email_confirm: true, // nalog je odmah aktivan, ne šalje se nikakav email
  });

  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return greska(`Korisničko ime "${ime}" je već zauzeto.`);
    }
    if (m.includes('password')) return greska('Lozinka nije prihvaćena. Probaj dužu lozinku.');
    console.error('Kreiranje korisnika nije uspjelo:', error.message);
    return greska('Korisnik nije kreiran. Pokušaj ponovo.', 500);
  }

  const { error: profilGreska } = await supabase
    .from('profili')
    .upsert({ id: data.user.id, email, uloga }, { onConflict: 'id' });
  if (profilGreska) {
    console.error('Profil nije upisan:', profilGreska.message);
    return greska('Nalog je kreiran, ali uloga nije upisana. Postavi je u listi korisnika.', 500);
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/korisnici  { id, lozinka }  → admin postavlja novu lozinku korisniku
export async function PATCH(request) {
  const { supabase, odgovor } = await provjeriAdmina(request);
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const id = String(tijelo.id || '');
  const lozinka = String(tijelo.lozinka || '');
  if (!id) return greska('Izaberi korisnika.');
  if (lozinka.length < MIN_LOZINKA) return greska(`Lozinka mora imati najmanje ${MIN_LOZINKA} znakova.`);

  const { error } = await supabase.auth.admin.updateUserById(id, { password: lozinka });
  if (error) {
    console.error('Promjena lozinke nije uspjela:', error.message);
    return greska('Lozinka nije promijenjena. Pokušaj ponovo.', 500);
  }
  return NextResponse.json({ success: true });
}
