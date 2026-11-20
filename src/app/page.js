'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthOkvir, Polje, Poruka, Dugme, prevediGresku } from './_komponente/AuthOkvir';

export default function Login() {
  const [prijava, setPrijava] = useState('');
  const [password, setPassword] = useState('');
  const [greska, setGreska] = useState('');
  const [loading, setLoading] = useState(false);
  const [provjera, setProvjera] = useState(true);
  const router = useRouter();

  // Ako je korisnik već prijavljen, sesija je sačuvana u browseru, pa ide direktno na početni ekran.
  useEffect(() => {

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(session.user.user_metadata?.mora_promijeniti_lozinku ? '/promjena-lozinke' : '/pocetna');
      else setProvjera(false);
    });
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setGreska('');

    // Korisničko ime pretvaramo u "ime@evidentory.com", kako je nalog upisan u Supabase.
    // Ako neko ipak upiše punu email adresu, koristimo je takvu kakva jeste.
    const unos = prijava.toLowerCase().trim();
    const email = unos.includes('@') ? unos : `${unos}@evidentory.com`;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setGreska(prevediGresku(error));
      setLoading(false);
    } else {
      // Nalog koji je napravio admin (ili mu je admin promijenio lozinku) prvo postavlja svoju lozinku.
      router.push(data.user?.user_metadata?.mora_promijeniti_lozinku ? '/promjena-lozinke' : '/pocetna');
    }
  };

  if (provjera) {
    return <AuthOkvir podnaslov="Sistem za upravljanje zalihama"><p className="text-center text-sm text-slate-600">Učitavanje…</p></AuthOkvir>;
  }

  return (
    <AuthOkvir podnaslov="Sistem za upravljanje zalihama">
      <Poruka>{greska}</Poruka>

      <form onSubmit={handleLogin} className="space-y-5">
        <Polje
          id="prijava"
          label="Korisničko ime"
          type="text"
          autoComplete="username"
          placeholder="npr. marko"
          value={prijava}
          onChange={(e) => setPrijava(e.target.value)}
        />
        <div>
          <Polje
            id="lozinka"
            label="Lozinka"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Dugme ucitavanje={loading} tekstUcitavanja="Prijavljivanje…">Prijavi se</Dugme>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Nemaš nalog ili si zaboravio lozinku? Javi se administratoru.
      </p>
    </AuthOkvir>
  );
}
