'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ucitajMojeDozvole } from '@/lib/dozvole';
import {
  TIPOVI, STATUSI, SLAVE, NAZIVI_MJESECI, danasUCrnojGori, dodajDane, danUSedmici, vrstaDana,
  radniDani, stanjeKorisnika, provjeriKvotu, formatirajDatum, formatirajSlavu, seKlapaju, radnihDanaTekst,
  periodZaDatum, nazivPerioda,
} from '@/lib/odsustvo';

const imeIz = (email) => (email || '').split('@')[0];

// Jedan stil fokusa za tastaturu na cijelom ekranu.
const FOKUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

const PUTANJE_IKONA = {
  lijevo: 'M15 18l-6-6 6-6',
  desno: 'M9 18l6-6-6-6',
  nazad: 'M19 12H5m6-7l-7 7 7 7',
  zatvori: 'M6 6l12 12M18 6L6 18',
  slava: 'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z',
  upozorenje: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  kvacica: 'M5 13l4 4L19 7',
};

function Ikona({ ime, className = 'w-4 h-4', puna = false }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={puna ? 'currentColor' : 'none'} stroke={puna ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PUTANJE_IKONA[ime]} />
    </svg>
  );
}

async function pozoviApi(tijelo) {
  const { data: { session } } = await supabase.auth.getSession();
  const odgovor = await fetch('/api/odsustvo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(tijelo),
  });
  const rezultat = await odgovor.json().catch(() => ({}));
  return { ok: odgovor.ok, poruka: rezultat.error, upozorenja: rezultat.upozorenja || [], podaci: rezultat };
}

async function preuzmiRjesenje(id) {
  const { data: { session } } = await supabase.auth.getSession();
  const odgovor = await fetch(`/api/odsustvo?rjesenje=${id}`, {
    headers: { Authorization: `Bearer ${session?.access_token || ''}` },
  });
  if (!odgovor.ok) {
    const r = await odgovor.json().catch(() => ({}));
    return r.error || 'Rješenje nije preuzeto.';
  }
  const naziv = /filename="([^"]+)"/.exec(odgovor.headers.get('Content-Disposition') || '')?.[1] || 'rjesenje.pdf';
  const url = URL.createObjectURL(await odgovor.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = naziv;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

const STIL_STATUSA = {
  na_cekanju: 'bg-amber-100 text-amber-900',
  odobreno: 'bg-green-100 text-green-900',
  odbijeno: 'bg-red-100 text-red-800',
  otkazano: 'bg-slate-100 text-slate-700',
};

function Status({ status }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STIL_STATUSA[status]}`}>{STATUSI[status]}</span>;
}

function Period({ o }) {
  return o.datum_od === o.datum_do
    ? <>{formatirajDatum(o.datum_od)}</>
    : <>{formatirajDatum(o.datum_od)} – {formatirajDatum(o.datum_do)}</>;
}

// ================= Stranica =================

export default function Odsustvo() {
  const router = useRouter();
  const [ja, setJa] = useState(null);
  const [greskaUcitavanja, setGreskaUcitavanja] = useState('');
  const [praznici, setPraznici] = useState(new Map());
  const [odsustva, setOdsustva] = useState([]);
  const [profili, setProfili] = useState([]);
  const [korekcije, setKorekcije] = useState([]);
  const [tab, setTab] = useState(null);
  const [poruka, setPoruka] = useState(null); // { tip: 'uspjeh' | 'greska', tekst, upozorenja? }

  const danas = danasUCrnojGori();
  const godina = periodZaDatum(danas); // tekući period godišnjeg (1. 7. – 30. 6.), označen godinom početka

  const ucitaj = useCallback(async () => {
    const mojeDozvole = await ucitajMojeDozvole(supabase);
    if (!mojeDozvole) return router.replace('/');
    const d = mojeDozvole.dozvole;
    if (!d.some((x) => x.startsWith('odsustvo_'))) return router.replace('/pocetna');
    setJa(mojeDozvole);

    const vidiSve = d.includes('odsustvo_pregled_svih') || d.includes('odsustvo_odobravanje');
    const id = mojeDozvole.user.id;

    const upitOdsustva = supabase.from('odsustva').select('*').order('datum_od', { ascending: false });
    const upitKorekcije = supabase.from('odsustvo_korekcije').select('*');
    const upitProfili = supabase.from('profili').select('*').order('email');
    const [p, o, k, pr] = await Promise.all([
      supabase.from('praznici').select('datum, naziv'),
      vidiSve ? upitOdsustva : upitOdsustva.eq('korisnik_id', id),
      vidiSve ? upitKorekcije : upitKorekcije.eq('korisnik_id', id),
      vidiSve ? upitProfili : upitProfili.eq('id', id),
    ]);
    const prva = [p, o, k, pr].find((r) => r.error);
    if (prva) {
      setGreskaUcitavanja(/(does not exist|schema cache|not find)/i.test(prva.error.message)
        ? 'Tabele za slobodne dane ne postoje. Pokreni SQL "odsustvo.sql" u Supabase-u pa osvježi stranicu.'
        : `Podaci nisu učitani: ${prva.error.message}`);
      return;
    }
    setGreskaUcitavanja('');
    setPraznici(new Map((p.data || []).map((x) => [x.datum, x.naziv])));
    setOdsustva(o.data || []);
    setKorekcije(k.data || []);
    setProfili(pr.data || []);
    setTab((t) => t || (d.includes('odsustvo_zahtjev') ? 'moji' : d.includes('odsustvo_odobravanje') ? 'odobravanje' : 'svi'));
  }, [router]);

  useEffect(() => { ucitaj(); }, [ucitaj]);

  const akcija = async (tijelo, uspjeh) => {
    const { ok, poruka: tekst, upozorenja } = await pozoviApi(tijelo);
    setPoruka(ok ? { tip: 'uspjeh', tekst: uspjeh, upozorenja } : { tip: 'greska', tekst: tekst || 'Došlo je do greške. Pokušaj ponovo.' });
    if (ok) await ucitaj();
    return ok;
  };

  if (greskaUcitavanja) {
    return (
      <Okvir ja={ja}>
        <p role="alert" className="text-sm text-slate-800 bg-amber-50 border border-amber-200 rounded-xl p-4">{greskaUcitavanja}</p>
      </Okvir>
    );
  }
  if (!ja || !tab) {
    return (
      <Okvir ja={ja}>
        <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Učitavanje">
          <div className="h-28 rounded-2xl bg-slate-200/70" />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
            <div className="h-96 rounded-2xl bg-slate-200/70" />
            <div className="h-64 rounded-2xl bg-slate-200/70" />
          </div>
        </div>
      </Okvir>
    );
  }

  const d = ja.dozvole;
  const naCekanju = odsustva.filter((o) => o.status === 'na_cekanju');
  const tabovi = [
    d.includes('odsustvo_zahtjev') && { kljuc: 'moji', naziv: 'Moji slobodni dani' },
    d.includes('odsustvo_odobravanje') && { kljuc: 'odobravanje', naziv: 'Na odobravanju', broj: naCekanju.length },
    d.includes('odsustvo_pregled_svih') && { kljuc: 'svi', naziv: 'Svi korisnici' },
  ].filter(Boolean);

  const javiGresku = (tekst) => setPoruka({ tip: 'greska', tekst });
  const zajedno = { ja, praznici, odsustva, profili, korekcije, danas, godina, akcija, javiGresku };

  return (
    <Okvir ja={ja}>
      {tabovi.length > 1 && (
        <div role="tablist" aria-label="Slobodni dani" className="flex gap-1 border-b border-slate-200 mb-6">
          {tabovi.map((t) => (
            <button
              key={t.kljuc}
              role="tab"
              aria-selected={tab === t.kljuc}
              onClick={() => { setTab(t.kljuc); setPoruka(null); }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.kljuc ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
            >
              {t.naziv}
              {t.broj > 0 && <span className={`ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs ${FOKUS}`}>{t.broj}</span>}
            </button>
          ))}
        </div>
      )}

      {poruka && <Poruka poruka={poruka} zatvori={() => setPoruka(null)} />}

      {tab === 'moji' && <MojiDani {...zajedno} />}
      {tab === 'odobravanje' && <Odobravanje {...zajedno} />}
      {tab === 'svi' && <SviKorisnici {...zajedno} />}
    </Okvir>
  );
}

function Poruka({ poruka, zatvori }) {
  const imaUpozorenja = poruka.tip === 'uspjeh' && poruka.upozorenja?.length > 0;
  const stil = poruka.tip === 'greska'
    ? 'bg-red-50 border-red-200 text-red-900'
    : imaUpozorenja ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-green-50 border-green-200 text-green-950';
  return (
    <div role={poruka.tip === 'greska' ? 'alert' : 'status'} className={`mb-6 p-4 rounded-xl border text-sm flex items-start gap-3 ${stil}`}>
      <Ikona ime={poruka.tip === 'greska' || imaUpozorenja ? 'upozorenje' : 'kvacica'} className="w-5 h-5 shrink-0 mt-px" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{poruka.tekst}</p>
        {imaUpozorenja && (
          <>
            <p className="mt-1">Akcija je sačuvana, ali:</p>
            <ul className="mt-1 space-y-1 list-disc pl-5">
              {poruka.upozorenja.map((u) => <li key={u}>{u}</li>)}
            </ul>
          </>
        )}
      </div>
      <button onClick={zatvori} className={`p-1 -m-1 rounded-md opacity-70 hover:opacity-100 ${FOKUS}`} aria-label="Zatvori poruku">
        <Ikona ime="zatvori" />
      </button>
    </div>
  );
}

function Okvir({ ja, children }) {
  const router = useRouter();
  const odjava = async () => { await supabase.auth.signOut(); router.push('/'); };
  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-[#0F172A] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/pocetna')} className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-white rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"><Ikona ime="nazad" /> Početna</button>
            <h1 className="text-lg font-bold tracking-wide">Slobodni dani</h1>
          </div>
          <div className="flex items-center gap-4">
            {ja && <span className="text-sm text-slate-300">{ja.korisnickoIme}</span>}
            <button onClick={odjava} className={`text-sm font-semibold text-slate-300 hover:text-white ${FOKUS}`}>Odjavi se</button>
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </main>
  );
}

// ================= Moji slobodni dani =================

function MojiDani({ ja, praznici, odsustva, profili, korekcije, danas, godina, akcija, javiGresku }) {
  const mojProfil = profili.find((p) => p.id === ja.user.id) || {};
  const slava = mojProfil.slava_datum || null;
  const moja = odsustva.filter((o) => o.korisnik_id === ja.user.id);
  const mojeKorekcije = korekcije.filter((k) => k.korisnik_id === ja.user.id);
  const aktivna = moja.filter((o) => ['na_cekanju', 'odobreno'].includes(o.status));

  const stanje = stanjeKorisnika({ odsustva: aktivna, korekcije: mojeKorekcije, praznici, slava, period: godina });

  const [mjesec, setMjesec] = useState(danas.slice(0, 7));
  const [odabir, setOdabir] = useState({ od: null, do: null });
  const [tip, setTip] = useState('godisnji');
  const [napomena, setNapomena] = useState('');
  const [slanje, setSlanje] = useState(false);

  const kraj = odabir.do || odabir.od;
  const dani = odabir.od ? radniDani(odabir.od, kraj, praznici, slava) : [];
  const preklapanje = odabir.od && aktivna.find((o) => seKlapaju(o, { datum_od: odabir.od, datum_do: kraj }));
  const poslije = odabir.od && tip === 'godisnji' && dani.length > 0
    ? stanjeKorisnika({
        odsustva: [...aktivna, { tip, status: 'na_cekanju', datum_od: odabir.od, datum_do: kraj }],
        korekcije: mojeKorekcije, praznici, slava, period: godina,
      }).dostupno
    : null;
  const kvota = odabir.od && tip === 'godisnji'
    ? provjeriKvotu({ postojeca: aktivna, novi: { tip, datum_od: odabir.od, datum_do: kraj }, korekcije: mojeKorekcije, praznici, slava, danas })
    : { ok: true };

  const klikNaDan = (datum) => {
    setOdabir((o) => {
      if (!o.od || o.do) return { od: datum, do: null };
      if (datum < o.od) return { od: datum, do: null };
      return { od: o.od, do: datum };
    });
  };

  const posalji = async (e) => {
    e.preventDefault();
    if (slanje || !odabir.od) return;
    setSlanje(true);
    const ok = await akcija(
      { akcija: 'zahtjev', tip, datumOd: odabir.od, datumDo: kraj, napomena },
      `Zahtjev (${radnihDanaTekst(dani.length)}) je poslat na odobravanje.`
    );
    setSlanje(false);
    if (ok) { setOdabir({ od: null, do: null }); setNapomena(''); }
  };

  return (
    <div className="space-y-8">
      <StanjePregled stanje={stanje} godina={godina} napomena={mojeKorekcije.find((k) => k.godina === godina)?.napomena} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <section aria-labelledby="naslov-kalendar" className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 id="naslov-kalendar" className="sr-only">Kalendar</h2>
          <Kalendar
            mjesec={mjesec}
            setMjesec={setMjesec}
            praznici={praznici}
            slava={slava}
            odsustva={aktivna}
            odabir={odabir}
            onKlik={klikNaDan}
            danas={danas}
          />
        </section>

        <section aria-labelledby="naslov-zahtjev" className="bg-white border border-slate-200 rounded-2xl p-5 h-fit">
          <h2 id="naslov-zahtjev" className="text-base font-bold text-slate-900">Novi zahtjev</h2>
          {!odabir.od ? (
            <p className="mt-2 text-sm text-slate-600">Klikni na prvi pa na posljednji dan u kalendaru. Za jedan dan klikni samo jednom.</p>
          ) : (
            <form onSubmit={posalji} className="mt-3 space-y-4">
              <div className="text-sm">
                <p className="font-semibold text-slate-900">
                  {formatirajDatum(odabir.od)}{kraj !== odabir.od && <> – {formatirajDatum(kraj)}</>}
                </p>
                <p className="text-slate-700 mt-0.5"><strong>{radnihDanaTekst(dani.length)}</strong> (vikendi, praznici i slava se ne računaju)</p>
              </div>
              <div>
                <label htmlFor="tip" className="block text-xs font-bold text-slate-600 mb-1">Vrsta odsustva</label>
                <select id="tip" value={tip} onChange={(e) => setTip(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
                  {Object.entries(TIPOVI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {tip === 'neplaceno' && <p className="text-xs text-slate-600 mt-1">Plaćeno odsustvo ne troši dane godišnjeg odmora.</p>}
              </div>
              <div>
                <label htmlFor="napomena" className="block text-xs font-bold text-slate-600 mb-1">Napomena (nije obavezno)</label>
                <textarea id="napomena" rows={2} maxLength={500} value={napomena} onChange={(e) => setNapomena(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" />
              </div>

              {preklapanje && <p role="alert" className="text-sm text-red-700">Već imaš zahtjev koji se preklapa sa ovim periodom.</p>}
              {!preklapanje && dani.length === 0 && <p role="alert" className="text-sm text-red-700">U ovom periodu nema radnih dana.</p>}
              {!preklapanje && dani.length > 0 && !kvota.ok && (
                <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Tražiš {radnihDanaTekst(dani.length)}, a slobodno ti je {dani.length - kvota.fali}. Zahtjev možeš poslati; odobravač će vidjeti da fali {kvota.fali} i odlučiti.
                </p>
              )}
              {!preklapanje && kvota.ok && poslije !== null && periodZaDatum(kraj) === godina && (
                <p className="text-sm text-slate-700">Poslije ovog zahtjeva ostaje ti <strong className="tabular-nums">{poslije}</strong> {poslije === 1 ? 'dan' : 'dana'}.</p>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => setOdabir({ od: null, do: null })} className={`px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 ${FOKUS}`}>Poništi</button>
                <button type="submit" disabled={slanje || dani.length === 0 || !!preklapanje} className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed ${FOKUS}`}>
                  {slanje ? 'Slanje…' : 'Pošalji zahtjev'}
                </button>
              </div>
            </form>
          )}

          <SlavaPolje profil={mojProfil} akcija={akcija} />
        </section>
      </div>

      <section aria-labelledby="naslov-moji" className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 id="naslov-moji" className="text-base font-bold text-slate-900 mb-3">Moji zahtjevi</h2>
        <ListaZahtjeva zahtjevi={moja} akcija={akcija} javiGresku={javiGresku} mojId={ja.user.id} mozeOtkazatiOdobreno={ja.dozvole.includes('odsustvo_odobravanje')} prazno="Još nemaš nijedan zahtjev. Izaberi dane u kalendaru iznad i pošalji ga na odobravanje." />
      </section>
    </div>
  );
}

function StanjePregled({ stanje, godina, napomena }) {
  const stavke = [
    { naziv: 'Pripada', vrijednost: stanje.kvota, opis: stanje.dodatno ? `za period ${nazivPerioda(godina)}, od toga ${stanje.dodatno} dodatno` : `za period ${nazivPerioda(godina)}` },
    { naziv: 'Iskorišćeno', vrijednost: stanje.iskoristeno, opis: stanje.umanjenje ? `od toga ${stanje.umanjenje} van aplikacije` : 'odobreni zahtjevi' },
    { naziv: 'Na čekanju', vrijednost: stanje.naCekanju, opis: stanje.naCekanju ? 'čeka odobrenje' : 'nema zahtjeva' },
    { naziv: 'Ističe', vrijednost: formatirajDatum(stanje.istice), opis: 'neiskorišćeni dani propadaju', datum: true },
  ];

  return (
    <section aria-label="Stanje slobodnih dana" className="bg-white border border-slate-200 rounded-2xl">
      <div className="flex flex-col md:flex-row">
        <div className="p-6 md:w-64 md:border-r border-b md:border-b-0 border-slate-200">
          <p className="text-sm font-semibold text-slate-700">Preostalo slobodnih dana</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight tabular-nums text-slate-900">{stanje.preostalo}</span>
            <span className="text-sm text-slate-600">{stanje.preostalo === 1 ? 'dan' : 'dana'}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {stanje.naCekanju > 0 ? `${stanje.dostupno} slobodno za nove zahtjeve` : 'Sve je slobodno za nove zahtjeve.'}
          </p>
        </div>
        <dl className="flex-1 grid grid-cols-2 lg:grid-cols-4">
          {stavke.map((s, i) => (
            <div key={s.naziv} className={`p-5 ${i > 0 ? 'lg:border-l' : ''} ${i % 2 === 1 ? 'border-l lg:border-l' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} border-slate-200`}>
              <dt className="text-sm text-slate-700">{s.naziv}</dt>
              <dd className={`mt-1 font-semibold tabular-nums text-slate-900 ${s.datum ? 'text-xl' : 'text-2xl'}`}>{s.vrijednost}</dd>
              <dd className="text-xs mt-0.5 text-slate-600">{s.opis}</dd>
            </div>
          ))}
        </dl>
      </div>
      {napomena && (
        <p className="px-6 py-3 border-t border-slate-200 text-sm text-slate-700">
          <span className="font-semibold">Napomena administratora:</span> {napomena}
        </p>
      )}
      {stanje.prekoracenje > 0 && (
        <p className="px-6 py-3 border-t border-slate-200 text-sm text-red-800 bg-red-50 rounded-b-2xl">
          Odobreno je {stanje.prekoracenje} {stanje.prekoracenje === 1 ? 'dan' : 'dana'} više nego što pripada za ovaj period.
        </p>
      )}
    </section>
  );
}

// ================= Kalendar =================

const DANI_SEDMICE = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

function Kalendar({ mjesec, setMjesec, praznici, slava, odsustva, odabir, onKlik, danas }) {
  const [lebdi, setLebdi] = useState(null);
  const [g, m] = mjesec.split('-').map(Number);
  const prvi = `${mjesec}-01`;
  const brojDana = new Date(Date.UTC(g, m, 0)).getUTCDate();
  const pomak = (danUSedmici(prvi) + 6) % 7;
  const pomjeri = (n) => {
    const d = new Date(Date.UTC(g, m - 1 + n, 1));
    setMjesec(d.toISOString().slice(0, 7));
  };
  // Dok bira kraj raspona, prikaži raspon do dana iznad kojeg je miš.
  const birakraj = odabir.od && !odabir.do && lebdi && lebdi > odabir.od;
  const kraj = odabir.do || (birakraj ? lebdi : odabir.od);

  const celije = [];
  for (let i = 0; i < pomak; i++) celije.push(null);
  for (let dan = 1; dan <= brojDana; dan++) celije.push(dodajDane(prvi, dan - 1));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-lg font-bold text-slate-900 capitalize" aria-live="polite">{NAZIVI_MJESECI[m - 1]} {g}.</p>
        <div className="flex items-center gap-1">
          {mjesec !== danas.slice(0, 7) && (
            <button onClick={() => setMjesec(danas.slice(0, 7))} className={`px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 ${FOKUS}`}>Danas</button>
          )}
          <button onClick={() => pomjeri(-1)} className={`p-2 rounded-lg text-slate-700 hover:bg-slate-100 ${FOKUS}`} aria-label="Prethodni mjesec"><Ikona ime="lijevo" className="w-5 h-5" /></button>
          <button onClick={() => pomjeri(1)} className={`p-2 rounded-lg text-slate-700 hover:bg-slate-100 ${FOKUS}`} aria-label="Sljedeći mjesec"><Ikona ime="desno" className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" onMouseLeave={() => setLebdi(null)}>
        {DANI_SEDMICE.map((d) => <div key={d} className="text-xs font-semibold text-slate-600 py-1">{d}</div>)}
        {celije.map((datum, i) => {
          if (!datum) return <div key={`p${i}`} />;
          const vrsta = vrstaDana(datum, praznici, slava);
          const zahtjev = odsustva.find((o) => o.datum_od <= datum && datum <= o.datum_do);
          const prosao = datum < danas;
          const krajnji = datum === odabir.od || datum === kraj;
          const uOdabiru = odabir.od && datum > odabir.od && datum < kraj;

          let stil = 'bg-white text-slate-900 hover:bg-blue-50 border border-slate-200';
          let opis = '';
          if (!vrsta.radni) {
            stil = 'bg-slate-100 text-slate-600 border border-transparent';
            opis = vrsta.razlog === 'praznik' ? `praznik: ${vrsta.naziv}` : vrsta.razlog === 'slava' ? 'slava' : 'vikend';
          }
          if (zahtjev) {
            stil = zahtjev.status === 'odobreno'
              ? 'bg-green-100 text-green-900 border border-green-300'
              : 'bg-amber-100 text-amber-900 border border-dashed border-amber-400';
            opis = `${TIPOVI[zahtjev.tip]}, ${STATUSI[zahtjev.status].toLowerCase()}`;
          }
          if (uOdabiru) stil = birakraj ? 'bg-blue-50 text-blue-900 border border-dashed border-blue-300' : 'bg-blue-100 text-blue-900 border border-blue-200';
          if (krajnji) stil = 'bg-blue-600 text-white border border-blue-600';
          if (prosao && !zahtjev) stil += ' opacity-40';

          return (
            <button
              key={datum}
              type="button"
              disabled={prosao}
              onClick={() => onKlik(datum)}
              onMouseEnter={() => setLebdi(datum)}
              onFocus={() => setLebdi(datum)}
              aria-pressed={krajnji || uOdabiru}
              aria-label={`${formatirajDatum(datum)}${opis ? `, ${opis}` : ''}${datum === danas ? ', danas' : ''}`}
              title={opis || undefined}
              className={`relative h-12 rounded-lg text-sm font-semibold tabular-nums transition-colors duration-150 disabled:cursor-not-allowed ${FOKUS} ${stil}`}
            >
              {Number(datum.slice(8))}
              {vrsta.razlog === 'praznik' && !zahtjev && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" aria-hidden="true" />}
              {vrsta.razlog === 'slava' && !zahtjev && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-red-600"><Ikona ime="slava" puna className="w-2.5 h-2.5" /></span>}
              {datum === danas && !krajnji && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-slate-700">
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Odobreno</li>
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-dashed border-amber-400" /> Na čekanju</li>
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100" /> Vikend / praznik</li>
        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Praznik</li>
        <li className="flex items-center gap-1.5"><span className="text-red-600"><Ikona ime="slava" puna className="w-2.5 h-2.5" /></span> Slava</li>
      </ul>
    </div>
  );
}

// ================= Slava =================

function SlavaPolje({ profil, akcija, korisnikId, jeAdmin = false }) {
  const [izbor, setIzbor] = useState('');
  const [mjesec, setMjesec] = useState('01');
  const [dan, setDan] = useState('1');
  const [naziv, setNaziv] = useState('');
  const [slanje, setSlanje] = useState(false);
  const [uredjujem, setUredjujem] = useState(false);

  if (profil.slava_datum && !uredjujem) {
    return (
      <div className={`${korisnikId ? '' : 'mt-6 pt-5 border-t border-slate-200'} text-sm`}>
        <p className="text-xs font-bold text-slate-600">{korisnikId ? 'Slava' : 'Moja slava'}</p>
        <p className="text-slate-900 mt-1"><strong>{profil.slava_naziv || 'Slava'}</strong>, {formatirajSlavu(profil.slava_datum)}</p>
        {!jeAdmin && <p className="text-xs text-slate-600 mt-1">Taj dan je slobodan i ne troši godišnji. Promjenu radi administrator.</p>}
        {jeAdmin && <button onClick={() => setUredjujem(true)} className={`text-xs font-bold text-blue-700 hover:underline mt-1 ${FOKUS}`}>Promijeni slavu</button>}
      </div>
    );
  }

  const posalji = async (e) => {
    e.preventDefault();
    let slavaDatum;
    let slavaNaziv;
    if (izbor === 'drugo') {
      slavaDatum = `${mjesec}-${String(dan).padStart(2, '0')}`;
      slavaNaziv = naziv;
    } else if (izbor === 'bez') {
      slavaDatum = null;
    } else {
      const s = SLAVE.find((x) => x.datum === izbor);
      if (!s) return;
      slavaDatum = s.datum;
      slavaNaziv = s.naziv;
    }
    setSlanje(true);
    const ok = await akcija({ akcija: 'slava', slavaDatum, slavaNaziv, korisnikId }, slavaDatum ? 'Slava je sačuvana.' : 'Slava je uklonjena.');
    setSlanje(false);
    if (ok) setUredjujem(false);
  };

  return (
    <form onSubmit={posalji} className={`${korisnikId ? '' : 'mt-6 pt-5 border-t border-slate-200'} space-y-2`}>
      <label htmlFor={`slava-${korisnikId || 'ja'}`} className="block text-xs font-bold text-slate-600">{korisnikId ? 'Slava' : 'Moja slava'}</label>
      {!korisnikId && <p className="text-xs text-slate-600">Biraš je jednom. Svake godine taj dan je slobodan i ne troši godišnji, a 5 dana ranije stiže podsjetnik.</p>}
      <select id={`slava-${korisnikId || 'ja'}`} required value={izbor} onChange={(e) => setIzbor(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
        <option value="" disabled>Izaberi…</option>
        {SLAVE.map((s) => <option key={s.datum} value={s.datum}>{s.naziv} ({formatirajSlavu(s.datum)})</option>)}
        <option value="drugo">Druga slava (upiši datum)</option>
        {jeAdmin && <option value="bez">Bez slave</option>}
      </select>
      {izbor === 'drugo' && (
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div>
            <label htmlFor="slava-naziv" className="sr-only">Naziv slave</label>
            <input id="slava-naziv" required placeholder="Naziv slave" value={naziv} onChange={(e) => setNaziv(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div />
          <div>
            <label htmlFor="slava-mjesec" className="sr-only">Mjesec</label>
            <select id="slava-mjesec" value={mjesec} onChange={(e) => setMjesec(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              {NAZIVI_MJESECI.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="slava-dan" className="sr-only">Dan</label>
            <input id="slava-dan" type="number" min={1} max={31} required value={dan} onChange={(e) => setDan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm tabular-nums" />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        {uredjujem && <button type="button" onClick={() => setUredjujem(false)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 ${FOKUS}`}>Odustani</button>}
        <button type="submit" disabled={slanje || !izbor} className={`px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white disabled:bg-slate-300 ${FOKUS}`}>{slanje ? 'Čuvanje…' : 'Sačuvaj slavu'}</button>
      </div>
    </form>
  );
}

// ================= Lista zahtjeva =================

function ListaZahtjeva({ zahtjevi, akcija, javiGresku, mojId, mozeOtkazatiOdobreno, prazno, saImenom = false }) {
  const [radi, setRadi] = useState(null);
  const [preuzimam, setPreuzimam] = useState(null);

  const pdf = async (z) => {
    setPreuzimam(z.id);
    const greskaPdf = await preuzmiRjesenje(z.id);
    setPreuzimam(null);
    if (greskaPdf) javiGresku?.(greskaPdf);
  };
  if (zahtjevi.length === 0) return <p className="text-sm text-slate-600">{prazno}</p>;

  const otkazi = async (z) => {
    setRadi(z.id);
    await akcija({ akcija: 'otkazi', id: z.id }, 'Zahtjev je otkazan.');
    setRadi(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-600 border-b border-slate-200">
          <tr>
            {saImenom && <th className="py-2 pr-4 font-semibold">Korisnik</th>}
            <th className="py-2 pr-4 font-semibold">Period</th>
            <th className="py-2 pr-4 font-semibold">Vrsta</th>
            <th className="py-2 pr-4 font-semibold text-right">Radnih dana</th>
            <th className="py-2 pr-4 font-semibold">Status</th>
            <th className="py-2 pr-4 font-semibold">Obradio / komentar</th>
            <th className="py-2"><span className="sr-only">Akcije</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {zahtjevi.map((z) => {
            const mozeOtkazati = (z.status === 'na_cekanju' && (z.korisnik_id === mojId || mozeOtkazatiOdobreno))
              || (z.status === 'odobreno' && mozeOtkazatiOdobreno);
            return (
              <tr key={z.id}>
                {saImenom && <td className="py-2.5 pr-4 font-medium text-slate-900">{z.korisnik_ime}</td>}
                <td className="py-2.5 pr-4 whitespace-nowrap"><Period o={z} /></td>
                <td className="py-2.5 pr-4">{TIPOVI[z.tip]}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{z.radnih_dana}</td>
                <td className="py-2.5 pr-4"><Status status={z.status} /></td>
                <td className="py-2.5 pr-4 text-slate-700">
                  {z.obradio_ime && <span>{z.obradio_ime}</span>}
                  {z.komentar && <span className="block text-xs text-slate-600">„{z.komentar}“</span>}
                  {z.napomena && <span className="block text-xs text-slate-600">Napomena: {z.napomena}</span>}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap space-x-3">
                  {z.status === 'odobreno' && z.tip === 'godisnji' && (
                    <button onClick={() => pdf(z)} disabled={preuzimam === z.id} className={`text-sm font-semibold text-blue-700 hover:underline disabled:opacity-50 ${FOKUS}`}>
                      {preuzimam === z.id ? 'Preuzimanje…' : 'Rješenje (PDF)'}
                    </button>
                  )}
                  {mozeOtkazati && (
                    <button onClick={() => otkazi(z)} disabled={radi === z.id} className={`text-sm font-semibold text-red-700 hover:underline disabled:opacity-50 ${FOKUS}`}>
                      {radi === z.id ? 'Otkazivanje…' : 'Otkaži'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ================= Odobravanje =================

function Odobravanje({ ja, praznici, odsustva, profili, korekcije, danas, godina, akcija }) {
  const jeAdmin = ja.dozvole.includes('admin');
  const naCekanju = odsustva.filter((o) => o.status === 'na_cekanju').sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const [komentari, setKomentari] = useState({});
  const [radi, setRadi] = useState(null);

  if (naCekanju.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="text-base font-semibold text-slate-900">Nema zahtjeva na čekanju</p>
        <p className="mt-1 text-sm text-slate-600">Kad neko pošalje zahtjev, pojaviće se ovdje, a odobravačima sa upisanim emailom stiže obavještenje.</p>
      </div>
    );
  }

  const obradi = async (z, vrsta) => {
    setRadi(`${z.id}-${vrsta}`);
    await akcija(
      { akcija: vrsta, id: z.id, komentar: komentari[z.id] || '' },
      vrsta === 'odobri' ? `Zahtjev korisnika ${z.korisnik_ime} je odobren.` : `Zahtjev korisnika ${z.korisnik_ime} je odbijen.`
    );
    setRadi(null);
  };

  return (
    <div className="space-y-4">
      {naCekanju.map((z) => {
        const profil = profili.find((p) => p.id === z.korisnik_id) || {};
        const njegova = odsustva.filter((o) => o.korisnik_id === z.korisnik_id && ['na_cekanju', 'odobreno'].includes(o.status));
        const stanje = stanjeKorisnika({
          odsustva: njegova, korekcije: korekcije.filter((k) => k.korisnik_id === z.korisnik_id),
          praznici, slava: profil.slava_datum, period: godina,
        });
        const kvotaZahtjeva = z.tip === 'godisnji'
          ? provjeriKvotu({
              postojeca: njegova.filter((o) => o.id !== z.id),
              novi: z,
              korekcije: korekcije.filter((k) => k.korisnik_id === z.korisnik_id),
              praznici, slava: profil.slava_datum,
            })
          : { ok: true, fali: 0 };
        const istovremeno = odsustva.filter((o) => o.korisnik_id !== z.korisnik_id && ['na_cekanju', 'odobreno'].includes(o.status) && seKlapaju(o, z));
        const svoj = z.korisnik_id === ja.user.id && !ja.dozvole.includes('admin');

        return (
          <article key={z.id} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">{z.korisnik_ime}</h3>
                <p className="text-sm text-slate-800 mt-0.5">
                  {TIPOVI[z.tip]}: <strong><Period o={z} /></strong>, {radnihDanaTekst(z.radnih_dana)}
                </p>
                {z.napomena && <p className="text-sm text-slate-600 mt-1">Napomena: {z.napomena}</p>}
                <p className="text-xs text-slate-600 mt-1">Podnijeto {formatirajDatum(z.created_at.slice(0, 10))}</p>
              </div>
              <div className="text-sm text-right">
                <p className="text-slate-600">Preostalo korisniku</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{stanje.preostalo}</p>
                <p className="text-xs text-slate-600">od toga {stanje.naCekanju} na čekanju</p>
              </div>
            </div>

            {z.tip === 'godisnji' && (!profil.ime_prezime || !profil.radno_mjesto) && (
              <p className="mt-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Za rješenje nedostaje {!profil.ime_prezime ? 'ime i prezime' : 'radno mjesto'}.{' '}
                {jeAdmin ? 'Upiši ga u "Svi korisnici" → Detalji prije odobravanja.' : 'Javi administratoru da ga upiše.'}
              </p>
            )}
            {!kvotaZahtjeva.ok && (
              <p className="mt-3 text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Traži {radnihDanaTekst(z.radnih_dana)}, a slobodno ima {z.radnih_dana - kvotaZahtjeva.fali}: fali {kvotaZahtjeva.fali}. Možeš ga svejedno odobriti.
              </p>
            )}
            {istovremeno.length > 0 && (
              <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                U istom periodu odsutni: {istovremeno.map((o) => `${o.korisnik_ime} (${STATUSI[o.status].toLowerCase()})`).join(', ')}
              </p>
            )}

            {svoj ? (
              <p className="mt-4 text-sm text-slate-600">Ovo je tvoj zahtjev; obrađuje ga drugi odobravač.</p>
            ) : (
              <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label htmlFor={`kom-${z.id}`} className="block text-xs font-bold text-slate-600 mb-1">Komentar (nije obavezno)</label>
                  <input id={`kom-${z.id}`} maxLength={500} value={komentari[z.id] || ''} onChange={(e) => setKomentari((k) => ({ ...k, [z.id]: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => obradi(z, 'odbij')} disabled={!!radi} className={`px-4 py-2 rounded-lg text-sm font-bold bg-white border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 ${FOKUS}`}>
                    {radi === `${z.id}-odbij` ? 'Odbijanje…' : 'Odbij'}
                  </button>
                  <button onClick={() => obradi(z, 'odobri')} disabled={!!radi} className={`px-4 py-2 rounded-lg text-sm font-bold bg-green-700 hover:bg-green-800 text-white disabled:opacity-50 ${FOKUS}`}>
                    {radi === `${z.id}-odobri` ? 'Odobravanje…' : 'Odobri'}
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ================= Svi korisnici =================

function SviKorisnici({ ja, praznici, odsustva, profili, korekcije, danas, godina, akcija, javiGresku }) {
  const [otvoren, setOtvoren] = useState(null);
  const [pretraga, setPretraga] = useState('');
  const jeAdmin = ja.dozvole.includes('admin');
  const jeOdobravac = ja.dozvole.includes('odsustvo_odobravanje');

  const redovi = useMemo(() => profili
    .map((p) => {
      const njegova = odsustva.filter((o) => o.korisnik_id === p.id);
      const stanje = stanjeKorisnika({
        odsustva: njegova.filter((o) => ['na_cekanju', 'odobreno'].includes(o.status)),
        korekcije: korekcije.filter((k) => k.korisnik_id === p.id),
        praznici, slava: p.slava_datum, period: godina,
      });
      const sada = njegova.find((o) => o.status === 'odobreno' && o.datum_od <= danas && danas <= o.datum_do);
      return { p, ime: imeIz(p.email), njegova, stanje, sada };
    })
    .filter((r) => r.ime.includes(pretraga.trim().toLowerCase())), [profili, odsustva, korekcije, praznici, godina, danas, pretraga]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-slate-900">Slobodni dani svih korisnika, period {nazivPerioda(godina)}</h2>
        <div>
          <label htmlFor="pretraga-korisnika" className="sr-only">Pretraga korisnika</label>
          <input id="pretraga-korisnika" type="search" placeholder="Pretraži korisnika…" value={pretraga} onChange={(e) => setPretraga(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-600 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-4 font-semibold">Korisnik</th>
              <th className="py-2 pr-4 font-semibold text-right">Iskorišćeno</th>
              <th className="py-2 pr-4 font-semibold text-right">Na čekanju</th>
              <th className="py-2 pr-4 font-semibold text-right">Preostalo</th>
              <th className="py-2"><span className="sr-only">Detalji</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {redovi.map(({ p, ime, njegova, stanje, sada }) => (
              <FragmentRed key={p.id}>
                <tr>
                  <td className="py-2.5 pr-4">
                    <span className="font-semibold text-slate-900">{ime}</span>
                    {p.ime_prezime && <span className="block text-xs text-slate-600">{p.ime_prezime}</span>}
                    {sada && <span className="ml-2 text-xs font-semibold text-green-900 bg-green-100 px-2 py-0.5 rounded-full">danas odsutan</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{stanje.iskoristeno}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{stanje.naCekanju}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-bold text-slate-900">{stanje.preostalo}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => setOtvoren(otvoren === p.id ? null : p.id)} aria-expanded={otvoren === p.id} className={`text-sm font-semibold text-blue-700 hover:underline ${FOKUS}`}>
                      {otvoren === p.id ? 'Sakrij' : 'Detalji'}
                    </button>
                  </td>
                </tr>
                {otvoren === p.id && (
                  <tr>
                    <td colSpan={5} className="bg-slate-50 px-4 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
                        <ListaZahtjeva zahtjevi={njegova} akcija={akcija} javiGresku={javiGresku} mojId={ja.user.id} mozeOtkazatiOdobreno={jeOdobravac} prazno="Ovaj korisnik još nema zahtjeva." />
                        <div className="space-y-3 text-sm">
                          <dl className="space-y-2">
                            <div><dt className="text-xs text-slate-600">Ime i prezime</dt><dd className="text-slate-900">{p.ime_prezime || '—'}</dd></div>
                            <div><dt className="text-xs text-slate-600">Radno mjesto</dt><dd className="text-slate-900">{p.radno_mjesto || '—'}</dd></div>
                            <div><dt className="text-xs text-slate-600">Slava</dt><dd className="text-slate-900">{p.slava_datum ? `${p.slava_naziv || 'Slava'}, ${formatirajSlavu(p.slava_datum)}` : '—'}</dd></div>
                          </dl>
                          {jeAdmin && (
                            <a href={`/admin?sekcija=korisnici&korisnik=${p.id}`} className={`inline-block font-semibold text-blue-700 hover:underline rounded ${FOKUS}`}>
                              Uredi u Administraciji
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </FragmentRed>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRed({ children }) {
  return <>{children}</>;
}

