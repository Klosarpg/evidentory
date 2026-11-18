import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dozvoleStareUloge } from '@/lib/dozvole';

// Pomoćne funkcije za serverske rute koje smije koristiti samo administrator.
// Service role ključ postoji samo na serveru (Vercel / .env.local), nikad u browseru.

export function adminKlijent() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function greska(poruka, status = 400) {
  return NextResponse.json({ error: poruka }, { status });
}

// Dozvole uloge; ako tabela uloge još ne postoji, koriste se stara pravila.
export async function dozvoleUloge(supabase, uloga) {
  const { data, error } = await supabase.from('uloge').select('dozvole').eq('naziv', uloga).maybeSingle();
  if (!error && data) return data.dozvole || [];
  return dozvoleStareUloge(uloga);
}

// Provjerava ko šalje zahtjev. Vraća { supabase, korisnik, profil, dozvole } ili { odgovor } sa greškom.
// supabase je klijent sa service ključem (zaobilazi RLS) — koristi ga samo nakon provjere dozvola.
export async function provjeriPrijavu(request) {
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

  // 2) Profil i dozvole se čitaju service role ključem.
  const supabase = adminKlijent();
  const { data: profil, error: profilGreska } = await supabase
    .from('profili').select('*').eq('id', data.user.id).single();
  if (profilGreska) {
    console.error('Čitanje profila service ključem nije uspjelo:', profilGreska.message);
    return { odgovor: greska(`SUPABASE_SERVICE_ROLE_KEY nije ispravan ili nije iz ovog projekta (${profilGreska.message}).`, 500) };
  }

  const dozvole = await dozvoleUloge(supabase, profil?.uloga || 'Korisnik');
  return { supabase, korisnik: data.user, profil, dozvole };
}

// Vraća { supabase, adminId, adminUloga, korisnik, profil, dozvole } ako pošiljalac ima dozvolu,
// inače { odgovor } sa greškom.
export async function provjeriDozvolu(request, dozvola = 'admin') {
  const rezultat = await provjeriPrijavu(request);
  if (rezultat.odgovor) return rezultat;
  if (!rezultat.dozvole.includes(dozvola)) return { odgovor: greska('Nemaš dozvolu za ovu akciju.', 403) };
  return { ...rezultat, adminId: rezultat.korisnik.id, adminUloga: rezultat.profil?.uloga };
}
