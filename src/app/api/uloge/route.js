import { NextResponse } from 'next/server';
import { provjeriDozvolu, greska } from '@/lib/serverAdmin';
import { KLJUCEVI_DOZVOLA } from '@/lib/dozvole';

// Upravljanje ulogama i njihovim dozvolama (samo dozvola "admin").

function ocistiDozvole(lista) {
  return [...new Set((Array.isArray(lista) ? lista : []).filter((d) => KLJUCEVI_DOZVOLA.includes(d)))];
}

function ocistiNaziv(vrijednost) {
  return String(vrijednost || '').trim().replace(/\s+/g, ' ');
}

function nemaTabele(error) {
  return error && /uloge/.test(error.message) && /(does not exist|not find|schema cache)/i.test(error.message);
}

const PORUKA_SQL = 'Tabela uloga ne postoji. Pokreni SQL "uloge-dozvole.sql" u Supabase-u.';

// POST /api/uloge  { naziv, dozvole }  → nova uloga
export async function POST(request) {
  const { supabase, odgovor } = await provjeriDozvolu(request, 'admin');
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const naziv = ocistiNaziv(tijelo.naziv);
  if (naziv.length < 2 || naziv.length > 50) return greska('Naziv uloge mora imati 2–50 znakova.');

  const { error } = await supabase.from('uloge').insert({ naziv, dozvole: ocistiDozvole(tijelo.dozvole) });
  if (error) {
    if (nemaTabele(error)) return greska(PORUKA_SQL, 500);
    if (error.code === '23505') return greska(`Uloga "${naziv}" već postoji.`);
    console.error('Uloga nije kreirana:', error.message);
    return greska('Uloga nije kreirana. Pokušaj ponovo.', 500);
  }
  return NextResponse.json({ success: true });
}

// PATCH /api/uloge  { naziv, dozvole }  → nove dozvole uloge
export async function PATCH(request) {
  const { supabase, adminUloga, odgovor } = await provjeriDozvolu(request, 'admin');
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const naziv = ocistiNaziv(tijelo.naziv);
  const dozvole = ocistiDozvole(tijelo.dozvole);

  // Zaštita od zaključavanja: ne možeš sebi oduzeti administraciju.
  if (naziv === adminUloga && !dozvole.includes('admin')) {
    return greska('Ne možeš ukloniti administraciju sa sopstvene uloge. Prvo sebi dodijeli drugu ulogu sa administracijom.');
  }

  const { data, error } = await supabase.from('uloge').update({ dozvole }).eq('naziv', naziv).select('naziv');
  if (error) {
    if (nemaTabele(error)) return greska(PORUKA_SQL, 500);
    console.error('Dozvole nisu sačuvane:', error.message);
    return greska('Dozvole nisu sačuvane. Pokušaj ponovo.', 500);
  }
  if (!data?.length) return greska('Uloga nije pronađena.', 404);
  return NextResponse.json({ success: true });
}

// DELETE /api/uloge  { naziv }  → briše ulogu koju niko ne koristi
export async function DELETE(request) {
  const { supabase, adminUloga, odgovor } = await provjeriDozvolu(request, 'admin');
  if (odgovor) return odgovor;

  const tijelo = await request.json().catch(() => ({}));
  const naziv = ocistiNaziv(tijelo.naziv);
  if (naziv === adminUloga) return greska('Ne možeš obrisati sopstvenu ulogu.');

  const { count } = await supabase.from('profili').select('id', { count: 'exact', head: true }).eq('uloga', naziv);
  if (count > 0) return greska(`Ulogu "${naziv}" koristi ${count} korisnik(a). Prvo im dodijeli drugu ulogu.`);

  const { error } = await supabase.from('uloge').delete().eq('naziv', naziv);
  if (error) {
    if (nemaTabele(error)) return greska(PORUKA_SQL, 500);
    console.error('Uloga nije obrisana:', error.message);
    return greska('Uloga nije obrisana. Pokušaj ponovo.', 500);
  }
  return NextResponse.json({ success: true });
}
