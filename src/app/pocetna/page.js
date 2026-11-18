'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ucitajMojeDozvole } from '@/lib/dozvole';

// Početni ekran poslije prijave: izbor modula. Svako vidi samo module za koje ima dozvolu.

const MODULI = [
  {
    kljuc: 'zalihe',
    naslov: 'Evidencija zaliha',
    opis: 'Stanje artikala, prijem, otpremnice, rezervacije i promet.',
    adresa: '/dashboard',
    vidljivo: (d) => d.includes('zalihe_pregled'),
    ikona: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  {
    kljuc: 'odsustvo',
    naslov: 'Slobodni dani',
    opis: 'Zahtjevi za godišnji odmor, preostali dani i odobravanje.',
    adresa: '/odsustvo',
    vidljivo: (d) => d.some((x) => x.startsWith('odsustvo_')),
    ikona: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    kljuc: 'admin',
    naslov: 'Administracija',
    opis: 'Korisnici, uloge i dozvole, komitenti, istorija prometa i praznici.',
    adresa: '/admin',
    vidljivo: (d) => d.includes('admin'),
    ikona: 'M10.3 4.3c.4-1.8 2.9-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.4 1.8 2.9 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.4 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.6c-.9-1.5.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
];

export default function Pocetna() {
  const [ja, setJa] = useState(null);
  const router = useRouter();

  useEffect(() => {
    ucitajMojeDozvole(supabase).then((rezultat) => {
      if (!rezultat) router.replace('/');
      else setJa(rezultat);
    });
  }, [router]);

  const odjava = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (!ja) {
    return <main className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">Učitavanje…</main>;
  }

  const dostupni = MODULI.filter((m) => m.vidljivo(ja.dozvole));

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-[#0F172A] text-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-wide">EVIDENTORY</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300">{ja.korisnickoIme}</span>
            <button onClick={odjava} className="text-sm font-semibold text-slate-300 hover:text-white">Odjavi se</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-slate-900">Zdravo, {ja.korisnickoIme}</h2>
        <p className="text-sm text-slate-600 mt-1">Izaberi sa čim radiš.</p>

        {dostupni.length === 0 ? (
          <p className="mt-8 text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-5">
            Tvoja uloga trenutno nema pristup nijednom modulu. Javi se administratoru.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {dostupni.map((m) => {
              const sadrzaj = (
                <>
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.ikona} />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900 flex items-center gap-2">
                    {m.naslov}
                    {m.uIzradi && <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">U izradi</span>}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">{m.opis}</p>
                </>
              );
              return m.uIzradi ? (
                <div key={m.kljuc} aria-disabled="true" className="text-left bg-white border border-slate-200 rounded-2xl p-6 opacity-70">
                  {sadrzaj}
                </div>
              ) : (
                <button
                  key={m.kljuc}
                  onClick={() => router.push(m.adresa)}
                  className="text-left bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all"
                >
                  {sadrzaj}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
