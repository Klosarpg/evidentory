'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthOkvir, Polje, Poruka, Dugme, prevediGresku } from '../_komponente/AuthOkvir';

const MIN_DUZINA = 8;

// Prva prijava: korisnik zamjenjuje lozinku koju mu je dao admin svojom.
// Stranica radi i kasnije, za svakoga ko želi da promijeni lozinku.
export default function PromjenaLozinke() {
  const router = useRouter();
  const [korisnik, setKorisnik] = useState(null);
  const [lozinka, setLozinka] = useState('');
  const [ponovo, setPonovo] = useState('');
  const [greska, setGreska] = useState('');
  const [slanje, setSlanje] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/');
      else setKorisnik(session.user);
    });
  }, [router]);

  const obavezno = Boolean(korisnik?.user_metadata?.mora_promijeniti_lozinku);

  const posalji = async (e) => {
    e.preventDefault();
    setGreska('');
    if (lozinka.length < MIN_DUZINA) return setGreska(`Lozinka mora imati najmanje ${MIN_DUZINA} znakova.`);
    if (lozinka !== ponovo) return setGreska('Lozinke se ne poklapaju. Upiši istu lozinku u oba polja.');

    setSlanje(true);
    const { error } = await supabase.auth.updateUser({ password: lozinka, data: { mora_promijeniti_lozinku: false } });
    if (error) {
      setGreska(prevediGresku(error));
      setSlanje(false);
      return;
    }
    // Osvježavamo sesiju da i ostale stranice odmah vide da je lozinka postavljena.
    await supabase.auth.refreshSession();
    router.replace('/pocetna');
  };

  const odjava = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (!korisnik) {
    return <AuthOkvir podnaslov="Promjena lozinke"><p className="text-center text-sm text-slate-600">Učitavanje…</p></AuthOkvir>;
  }

  return (
    <AuthOkvir podnaslov={obavezno ? 'Postavi svoju lozinku' : 'Promjena lozinke'}>
      {obavezno && (
        <p className="mb-6 text-sm text-slate-700 text-center">
          Ovo ti je prva prijava, pa lozinku koju ti je dao administrator zamijeni svojom. Znaćeš je samo ti.
        </p>
      )}
      <Poruka>{greska}</Poruka>

      <form onSubmit={posalji} className="space-y-5">
        <Polje
          id="nova-lozinka"
          label="Nova lozinka"
          type="password"
          autoComplete="new-password"
          minLength={MIN_DUZINA}
          value={lozinka}
          onChange={(e) => setLozinka(e.target.value)}
        />
        <Polje
          id="ponovo-lozinka"
          label="Ponovi novu lozinku"
          type="password"
          autoComplete="new-password"
          minLength={MIN_DUZINA}
          value={ponovo}
          onChange={(e) => setPonovo(e.target.value)}
        />
        <p className="text-xs text-slate-600">Najmanje {MIN_DUZINA} znakova. Mora biti drugačija od lozinke koju ti je dao administrator.</p>
        <Dugme ucitavanje={slanje} tekstUcitavanja="Čuvanje…">Sačuvaj lozinku</Dugme>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {obavezno ? (
          <button type="button" onClick={odjava} className="font-semibold text-slate-700 hover:underline">Odjavi se</button>
        ) : (
          <button type="button" onClick={() => router.back()} className="font-semibold text-slate-700 hover:underline">Nazad</button>
        )}
      </p>
    </AuthOkvir>
  );
}
