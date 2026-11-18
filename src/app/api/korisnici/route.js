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

const IME_REGEX = /^[a-z0-9._-]{3,30}$/;
const PORUKA_IME = 'Korisničko ime: 3–30 znakova, samo slova bez kvačica, brojevi, tačka, crtica i donja crta.';

function jeZauzeto(error) {
  const m = (error?.message || '').toLowerCase();
  return m.includes('already') || m.includes('registered') || m.includes('exists');
}

function greska(poruka, status = 400) {
  return NextResponse.json({ error: poruka }, { status });
}

// Vraća admin klijent ako je pošiljalac prijavljeni Admin, inače odgovor sa greškom.
async function provjeriAdmina(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { odgovor: greska('Na serveru nije podešen SUPABASE_SERVICE_ROLE_KEY.', 500) };
  }

  // 1) Prijavu provjeravamo istim (anon) ključem koji koristi i aplikacija.
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { odgovor: greska('Nisi prijavljen (sesija nije poslata). Osvježi stranicu i probaj ponovo.', 401) };

  const obican = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await obican.auth.getUser(token);
  if (error || !data?.user) {
    console.error('Provjera prijave nije uspjela:', error?.message);
    return { odgovor: greska(`Prijava nije potvrđena: ${error?.message || 'nepoznat korisnik'}. Odjavi se i prijavi ponovo.`, 401) };
  }

  // 2) Uloga se čita service role ključem. Ako ovdje pukne, ključ nije ispravan.
  const supabase = adminKlijent();
  const { data: profil, error: profilGreska } = await supabase
    .from('profili').select('uloga').eq('id', data.user.id).single();
  if (profilGreska) {
    console.error('Čitanje profila service ključem nije uspjelo:', profilGreska.message);
    return { odgovor: greska(`SUPABASE_SERVICE_ROLE_KEY nije ispravan ili nije iz ovog projekta (${profilGreska.message}).`, 500) };
  }
  if (profil?.uloga !== 'Admin') return { odgovor: greska('Samo administrator može upravljati korisnicima.', 403) };

  return { supabase, adminId: data.user.id };
}

// POST /api/korisnici  { korisnickoIme, lozinka, uloga }  → kreira novi nalog
export async function POST(request) {
  const { supabase, odgovor } = await provjeriAdmina(request);
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const ime = String(tijelo.korisnickoIme || '').trim().toLowerCase();
  const lozinka = String(tijelo.lozinka || '');
  const uloga = DOZVOLJENE_ULOGE.includes(tijelo.uloga) ? tijelo.uloga : 'Korisnik';

  if (!IME_REGEX.test(ime)) return greska(PORUKA_IME);
  if (lozinka.length < MIN_LOZINKA) return greska(`Lozinka mora imati najmanje ${MIN_LOZINKA} znakova.`);

  const email = `${ime}@${DOMEN}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: lozinka,
    email_confirm: true, // nalog je odmah aktivan, ne šalje se nikakav email
  });

  if (error) {
    if (jeZauzeto(error)) return greska(`Korisničko ime "${ime}" je već zauzeto.`);
    if ((error.message || '').toLowerCase().includes('password')) return greska('Lozinka nije prihvaćena. Probaj dužu lozinku.');
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

// PATCH /api/korisnici  { id, korisnickoIme?, lozinka? }  → mijenja korisničko ime i/ili lozinku
export async function PATCH(request) {
  const { supabase, odgovor } = await provjeriAdmina(request);
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const id = String(tijelo.id || '');
  if (!id) return greska('Izaberi korisnika.');

  const izmjene = {};
  let noviEmail = null;

  if (tijelo.korisnickoIme !== undefined) {
    const ime = String(tijelo.korisnickoIme).trim().toLowerCase();
    if (!IME_REGEX.test(ime)) return greska(PORUKA_IME);
    noviEmail = `${ime}@${DOMEN}`;
  }
  if (tijelo.lozinka) {
    const lozinka = String(tijelo.lozinka);
    if (lozinka.length < MIN_LOZINKA) return greska(`Lozinka mora imati najmanje ${MIN_LOZINKA} znakova.`);
    izmjene.password = lozinka;
  }

  const { data: postojeci, error: citanjeGreska } = await supabase.auth.admin.getUserById(id);
  if (citanjeGreska || !postojeci?.user) return greska('Korisnik nije pronađen.', 404);

  if (noviEmail && noviEmail !== postojeci.user.email) {
    izmjene.email = noviEmail;
    izmjene.email_confirm = true; // bez emaila za potvrdu
  }
  if (Object.keys(izmjene).length === 0) return NextResponse.json({ success: true });

  const { error } = await supabase.auth.admin.updateUserById(id, izmjene);
  if (error) {
    if (jeZauzeto(error)) return greska('To korisničko ime je već zauzeto.');
    console.error('Izmjena korisnika nije uspjela:', error.message);
    return greska('Izmjena nije sačuvana. Pokušaj ponovo.', 500);
  }

  if (izmjene.email) {
    const { error: profilGreska } = await supabase.from('profili').update({ email: izmjene.email }).eq('id', id);
    if (profilGreska) console.error('Email u profilu nije ažuriran:', profilGreska.message);

    // Novo ime upisujemo i u sve unose ovog korisnika u istoriji prometa.
    const staroIme = (postojeci.user.email || '').split('@')[0];
    const novoIme = izmjene.email.split('@')[0];
    const { error: istorijaGreska } = await supabase.from('istorija').update({ korisnik: novoIme }).eq('korisnik_id', id);
    // Stariji unosi koji još nisu povezani sa nalogom: po starom imenu, i odmah ih povezujemo.
    const { error: stariGreska } = await supabase
      .from('istorija')
      .update({ korisnik: novoIme, korisnik_id: id })
      .is('korisnik_id', null)
      .eq('korisnik', staroIme);
    const greskaIstorije = istorijaGreska || stariGreska;
    if (greskaIstorije) {
      console.error('Istorija nije ažurirana:', greskaIstorije.message);
      return greska(
        `Korisnik je preimenovan, ali istorija nije ažurirana (${greskaIstorije.message}). Provjeri da li je pokrenut SQL "istorija-korisnik.sql".`,
        500
      );
    }
  }
  return NextResponse.json({ success: true });
}

// DELETE /api/korisnici  { id }  → briše nalog i profil
export async function DELETE(request) {
  const { supabase, adminId, odgovor } = await provjeriAdmina(request);
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const id = String(tijelo.id || '');
  if (!id) return greska('Izaberi korisnika.');
  if (id === adminId) return greska('Ne možeš obrisati sopstveni nalog.');

  // Profil čuvamo sa strane da ga vratimo ako brisanje naloga ne uspije.
  const { data: profil } = await supabase.from('profili').select('*').eq('id', id).maybeSingle();
  await supabase.from('profili').delete().eq('id', id);

  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) {
    console.error('Brisanje korisnika nije uspjelo:', error.message);
    if (profil) await supabase.from('profili').upsert(profil, { onConflict: 'id' });
    return greska('Korisnik nije obrisan. Pokušaj ponovo.', 500);
  }
  return NextResponse.json({ success: true });
}
