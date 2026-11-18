import { NextResponse } from 'next/server';
import { provjeriDozvolu, greska } from '@/lib/serverAdmin';

// Upravljanje korisnicima iz Kontrolnog panela (dozvola "admin"), bez slanja emailova.
// Korisnik se prijavljuje korisničkim imenom; u Supabase-u nalog ima adresu "ime@evidentory.com".
// Pravi email za obavještenja čuva se posebno, u profili.kontakt_email.

const DOMEN = 'evidentory.com';
const MIN_LOZINKA = 6;
const IME_REGEX = /^[a-z0-9._-]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PORUKA_IME = 'Korisničko ime: 3–30 znakova, samo slova bez kvačica, brojevi, tačka, crtica i donja crta.';

function jeZauzeto(error) {
  const m = (error?.message || '').toLowerCase();
  return m.includes('already') || m.includes('registered') || m.includes('exists');
}

// Prazan string = bez emaila; inače mora biti ispravna adresa.
function ocistiKontaktEmail(vrijednost) {
  const email = String(vrijednost || '').trim().toLowerCase();
  if (!email) return { email: null };
  if (!EMAIL_REGEX.test(email)) return { problem: 'Email za obavještenja nije ispravan.' };
  return { email };
}

async function postojiUloga(supabase, uloga) {
  const { data, error } = await supabase.from('uloge').select('naziv').eq('naziv', uloga).maybeSingle();
  if (error) return ['Korisnik', 'Korisnik sa pravom povlacenja', 'Admin'].includes(uloga); // SQL još nije pokrenut
  return Boolean(data);
}

// POST /api/korisnici  { korisnickoIme, lozinka, uloga, kontaktEmail? }  → kreira novi nalog
export async function POST(request) {
  const { supabase, odgovor } = await provjeriDozvolu(request, 'admin');
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const ime = String(tijelo.korisnickoIme || '').trim().toLowerCase();
  const lozinka = String(tijelo.lozinka || '');
  const uloga = String(tijelo.uloga || 'Korisnik');
  const kontakt = ocistiKontaktEmail(tijelo.kontaktEmail);

  if (!IME_REGEX.test(ime)) return greska(PORUKA_IME);
  if (lozinka.length < MIN_LOZINKA) return greska(`Lozinka mora imati najmanje ${MIN_LOZINKA} znakova.`);
  if (kontakt.problem) return greska(kontakt.problem);
  if (!(await postojiUloga(supabase, uloga))) return greska(`Uloga "${uloga}" ne postoji.`);

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

  const red = { id: data.user.id, email, uloga };
  if (kontakt.email) red.kontakt_email = kontakt.email;
  const { error: profilGreska } = await supabase.from('profili').upsert(red, { onConflict: 'id' });
  if (profilGreska) {
    console.error('Profil nije upisan:', profilGreska.message);
    const kolonaFali = profilGreska.message.includes('kontakt_email');
    return greska(
      kolonaFali
        ? 'Nalog je kreiran, ali email nije sačuvan: pokreni SQL "uloge-dozvole.sql" pa uredi korisnika.'
        : 'Nalog je kreiran, ali uloga nije upisana. Postavi je u listi korisnika.',
      500
    );
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/korisnici  { id, korisnickoIme?, lozinka?, kontaktEmail? }  → mijenja ime, lozinku i/ili email
export async function PATCH(request) {
  const { supabase, odgovor } = await provjeriDozvolu(request, 'admin');
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
  let kontakt = null;
  if (tijelo.kontaktEmail !== undefined) {
    kontakt = ocistiKontaktEmail(tijelo.kontaktEmail);
    if (kontakt.problem) return greska(kontakt.problem);
  }

  const { data: postojeci, error: citanjeGreska } = await supabase.auth.admin.getUserById(id);
  if (citanjeGreska || !postojeci?.user) return greska('Korisnik nije pronađen.', 404);

  if (noviEmail && noviEmail !== postojeci.user.email) {
    izmjene.email = noviEmail;
    izmjene.email_confirm = true; // bez emaila za potvrdu
  }

  if (Object.keys(izmjene).length > 0) {
    const { error } = await supabase.auth.admin.updateUserById(id, izmjene);
    if (error) {
      if (jeZauzeto(error)) return greska('To korisničko ime je već zauzeto.');
      console.error('Izmjena korisnika nije uspjela:', error.message);
      return greska('Izmjena nije sačuvana. Pokušaj ponovo.', 500);
    }
  }

  // Profil: novo korisničko ime i/ili email za obavještenja.
  const profilIzmjene = {};
  if (izmjene.email) profilIzmjene.email = izmjene.email;
  if (kontakt) profilIzmjene.kontakt_email = kontakt.email;
  if (Object.keys(profilIzmjene).length > 0) {
    const { error: profilGreska } = await supabase.from('profili').update(profilIzmjene).eq('id', id);
    if (profilGreska) {
      console.error('Profil nije ažuriran:', profilGreska.message);
      return greska(
        profilGreska.message.includes('kontakt_email')
          ? 'Email za obavještenja nije sačuvan: pokreni SQL "uloge-dozvole.sql".'
          : 'Profil nije ažuriran. Pokušaj ponovo.',
        500
      );
    }
  }

  if (izmjene.email) {
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
  const { supabase, adminId, odgovor } = await provjeriDozvolu(request, 'admin');
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
