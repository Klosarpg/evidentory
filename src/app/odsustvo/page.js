'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ucitajMojeDozvole } from '@/lib/dozvole';
import {
  TIPOVI, STATUSI, SLAVE, NAZIVI_MJESECI, danasUCrnojGori, dodajDane, danUSedmici, vrstaDana,
  radniDani, stanjeKorisnika, provjeriKvotu, formatirajDatum, formatirajSlavu, seKlapaju,
} from '@/lib/odsustvo';

const imeIz = (email) => (email || '').split('@')[0];

async function pozoviApi(tijelo) {
  const { data: { session } } = await supabase.auth.getSession();
  const odgovor = await fetch('/api/odsustvo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(tijelo),
  });
  const rezultat = await odgovor.json().catch(() => ({}));
  return { ok: odgovor.ok, poruka: rezultat.error };
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
  const [poruka, setPoruka] = useState(null); // { tip: 'uspjeh' | 'greska', tekst }

  const danas = danasUCrnojGori();
  const godina = Number(danas.slice(0, 4));

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
    const upitProfili = supabase.from('profili').select('id, email, kontakt_email, slava_datum, slava_naziv').order('email');
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
    const { ok, poruka: tekst } = await pozoviApi(tijelo);
    setPoruka(ok ? { tip: 'uspjeh', tekst: uspjeh } : { tip: 'greska', tekst: tekst || 'Došlo je do greške. Pokušaj ponovo.' });
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
    return <main className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">Učitavanje…</main>;
  }

  const d = ja.dozvole;
  const naCekanju = odsustva.filter((o) => o.status === 'na_cekanju');
  const tabovi = [
    d.includes('odsustvo_zahtjev') && { kljuc: 'moji', naziv: 'Moji slobodni dani' },
    d.includes('odsustvo_odobravanje') && { kljuc: 'odobravanje', naziv: 'Na odobravanju', broj: naCekanju.length },
    d.includes('odsustvo_pregled_svih') && { kljuc: 'svi', naziv: 'Svi korisnici' },
  ].filter(Boolean);

  const zajedno = { ja, praznici, odsustva, profili, korekcije, danas, godina, akcija };

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
              {t.broj > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs">{t.broj}</span>}
            </button>
          ))}
        </div>
      )}

      {poruka && (
        <div role={poruka.tip === 'greska' ? 'alert' : 'status'} className={`mb-5 p-3 rounded-xl border text-sm font-medium flex justify-between gap-4 ${poruka.tip === 'greska' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-900'}`}>
          <span>{poruka.tekst}</span>
          <button onClick={() => setPoruka(null)} className="font-bold opacity-70 hover:opacity-100" aria-label="Zatvori poruku">✕</button>
        </div>
      )}

      {tab === 'moji' && <MojiDani {...zajedno} />}
      {tab === 'odobravanje' && <Odobravanje {...zajedno} />}
      {tab === 'svi' && <SviKorisnici {...zajedno} />}
    </Okvir>
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
            <button onClick={() => router.push('/pocetna')} className="text-sm font-semibold text-slate-300 hover:text-white">← Početna</button>
            <h1 className="text-lg font-bold tracking-wide">Slobodni dani</h1>
          </div>
          <div className="flex items-center gap-4">
            {ja && <span className="text-sm text-slate-300">{ja.korisnickoIme}</span>}
            <button onClick={odjava} className="text-sm font-semibold text-slate-300 hover:text-white">Odjavi se</button>
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </main>
  );
}

// ================= Moji slobodni dani =================

function MojiDani({ ja, praznici, odsustva, profili, korekcije, danas, godina, akcija }) {
  const mojProfil = profili.find((p) => p.id === ja.user.id) || {};
  const slava = mojProfil.slava_datum || null;
  const moja = odsustva.filter((o) => o.korisnik_id === ja.user.id);
  const mojeKorekcije = korekcije.filter((k) => k.korisnik_id === ja.user.id);
  const aktivna = moja.filter((o) => ['na_cekanju', 'odobreno'].includes(o.status));

  const stanje = stanjeKorisnika({ odsustva: aktivna, korekcije: mojeKorekcije, praznici, slava, godina, danas });

  const [mjesec, setMjesec] = useState(danas.slice(0, 7));
  const [odabir, setOdabir] = useState({ od: null, do: null });
  const [tip, setTip] = useState('godisnji');
  const [napomena, setNapomena] = useState('');
  const [slanje, setSlanje] = useState(false);

  const kraj = odabir.do || odabir.od;
  const dani = odabir.od ? radniDani(odabir.od, kraj, praznici, slava) : [];
  const preklapanje = odabir.od && aktivna.find((o) => seKlapaju(o, { datum_od: odabir.od, datum_do: kraj }));
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
      `Zahtjev za ${dani.length} radnih dana je poslat na odobravanje.`
    );
    setSlanje(false);
    if (ok) { setOdabir({ od: null, do: null }); setNapomena(''); }
  };

  return (
    <div className="space-y-8">
      <StanjeKartice stanje={stanje} godina={godina} />

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
                <p className="text-slate-700 mt-0.5"><strong>{dani.length}</strong> radnih dana (vikendi, praznici i slava se ne računaju)</p>
              </div>
              <div>
                <label htmlFor="tip" className="block text-xs font-bold text-slate-600 mb-1">Vrsta odsustva</label>
                <select id="tip" value={tip} onChange={(e) => setTip(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
                  {Object.entries(TIPOVI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {tip === 'neplaceno' && <p className="text-xs text-slate-600 mt-1">Neplaćeno odsustvo ne troši dane godišnjeg odmora.</p>}
              </div>
              <div>
                <label htmlFor="napomena" className="block text-xs font-bold text-slate-600 mb-1">Napomena (nije obavezno)</label>
                <textarea id="napomena" rows={2} maxLength={500} value={napomena} onChange={(e) => setNapomena(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" />
              </div>

              {preklapanje && <p role="alert" className="text-sm text-red-700">Već imaš zahtjev koji se preklapa sa ovim periodom.</p>}
              {!preklapanje && dani.length === 0 && <p role="alert" className="text-sm text-red-700">U ovom periodu nema radnih dana.</p>}
              {!preklapanje && dani.length > 0 && !kvota.ok && <p role="alert" className="text-sm text-red-700">Nemaš dovoljno dana: fali ti {kvota.fali}.</p>}

              <div className="flex gap-2">
                <button type="button" onClick={() => setOdabir({ od: null, do: null })} className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800">Poništi</button>
                <button type="submit" disabled={slanje || dani.length === 0 || !!preklapanje || !kvota.ok} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed">
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
        <ListaZahtjeva zahtjevi={moja} akcija={akcija} mojId={ja.user.id} mozeOtkazatiOdobreno={ja.dozvole.includes('odsustvo_odobravanje')} prazno="Još nemaš nijedan zahtjev." />
      </section>
    </div>
  );
}

function StanjeKartice({ stanje, godina }) {
  const kartice = [
    { naslov: 'Preostalo', vrijednost: stanje.preostalo, opis: stanje.naCekanju ? `${stanje.dostupno} slobodno za nove zahtjeve` : 'za korišćenje', istaknuto: true },
    { naslov: `Godišnji ${godina}`, vrijednost: `${stanje.kvotaPreostalo} / ${stanje.kvota}`, opis: 'preostalo od ovogodišnjih' },
    stanje.prenosIsteklo > 0
      ? { naslov: 'Iz prošle godine', vrijednost: 0, opis: `${stanje.prenosIsteklo} dana je isteklo ${formatirajDatum(stanje.rokPrenosa)}` }
      : { naslov: 'Iz prošle godine', vrijednost: stanje.prenosPreostalo, opis: stanje.prenos ? `važi do ${formatirajDatum(stanje.rokPrenosa)}` : 'nema prenesenih dana' },
    { naslov: 'Iskorišćeno', vrijednost: stanje.iskoristeno, opis: `u ${godina}. godini` },
    { naslov: 'Na čekanju', vrijednost: stanje.naCekanju, opis: 'čeka odobrenje' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {kartice.map((k) => (
        <div key={k.naslov} className={`rounded-2xl border p-4 ${k.istaknuto ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-semibold ${k.istaknuto ? 'text-blue-100' : 'text-slate-600'}`}>{k.naslov}</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${k.istaknuto ? 'text-white' : 'text-slate-900'}`}>{k.vrijednost}</p>
          <p className={`text-xs mt-1 ${k.istaknuto ? 'text-blue-100' : 'text-slate-600'}`}>{k.opis}</p>
        </div>
      ))}
      {stanje.prekoracenje > 0 && (
        <p className="col-span-full text-sm text-red-700">Upisano je {stanje.prekoracenje} dana više nego što pripada. Javi se administratoru da provjeri korekciju.</p>
      )}
    </div>
  );
}

// ================= Kalendar =================

const DANI_SEDMICE = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

function Kalendar({ mjesec, setMjesec, praznici, slava, odsustva, odabir, onKlik, danas }) {
  const [g, m] = mjesec.split('-').map(Number);
  const prvi = `${mjesec}-01`;
  const brojDana = new Date(Date.UTC(g, m, 0)).getUTCDate();
  const pomak = (danUSedmici(prvi) + 6) % 7;
  const pomjeri = (n) => {
    const d = new Date(Date.UTC(g, m - 1 + n, 1));
    setMjesec(d.toISOString().slice(0, 7));
  };
  const kraj = odabir.do || odabir.od;

  const celije = [];
  for (let i = 0; i < pomak; i++) celije.push(null);
  for (let dan = 1; dan <= brojDana; dan++) celije.push(dodajDane(prvi, dan - 1));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => pomjeri(-1)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100" aria-label="Prethodni mjesec">‹</button>
        <p className="text-base font-bold text-slate-900 capitalize" aria-live="polite">{NAZIVI_MJESECI[m - 1]} {g}.</p>
        <button onClick={() => pomjeri(1)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100" aria-label="Sljedeći mjesec">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
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
            stil = 'bg-slate-100 text-slate-500 border border-transparent';
            opis = vrsta.razlog === 'praznik' ? `praznik: ${vrsta.naziv}` : vrsta.razlog === 'slava' ? 'slava' : 'vikend';
          }
          if (zahtjev) {
            stil = zahtjev.status === 'odobreno'
              ? 'bg-green-100 text-green-900 border border-green-300'
              : 'bg-amber-100 text-amber-900 border border-dashed border-amber-400';
            opis = `${TIPOVI[zahtjev.tip]}, ${STATUSI[zahtjev.status].toLowerCase()}`;
          }
          if (uOdabiru) stil = 'bg-blue-100 text-blue-900 border border-blue-200';
          if (krajnji) stil = 'bg-blue-600 text-white border border-blue-600';
          if (prosao && !zahtjev) stil += ' opacity-40';

          return (
            <button
              key={datum}
              type="button"
              disabled={prosao}
              onClick={() => onKlik(datum)}
              aria-pressed={krajnji || uOdabiru}
              aria-label={`${formatirajDatum(datum)}${opis ? `, ${opis}` : ''}${datum === danas ? ', danas' : ''}`}
              title={opis || undefined}
              className={`relative h-11 rounded-lg text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${stil}`}
            >
              {Number(datum.slice(8))}
              {vrsta.razlog === 'praznik' && !zahtjev && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" aria-hidden="true" />}
              {vrsta.razlog === 'slava' && !zahtjev && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] leading-none text-red-600" aria-hidden="true">✦</span>}
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
        <li className="flex items-center gap-1.5"><span className="text-red-600 text-[10px]">✦</span> Slava</li>
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
        {jeAdmin && <button onClick={() => setUredjujem(true)} className="text-xs font-bold text-blue-700 hover:underline mt-1">Promijeni slavu</button>}
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
        {uredjujem && <button type="button" onClick={() => setUredjujem(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200">Odustani</button>}
        <button type="submit" disabled={slanje || !izbor} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white disabled:bg-slate-300">{slanje ? 'Čuvanje…' : 'Sačuvaj slavu'}</button>
      </div>
    </form>
  );
}

// ================= Lista zahtjeva =================

function ListaZahtjeva({ zahtjevi, akcija, mojId, mozeOtkazatiOdobreno, prazno, saImenom = false }) {
  const [radi, setRadi] = useState(null);
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
                <td className="py-2.5 text-right">
                  {mozeOtkazati && (
                    <button onClick={() => otkazi(z)} disabled={radi === z.id} className="text-sm font-semibold text-red-700 hover:underline disabled:opacity-50">
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
  const naCekanju = odsustva.filter((o) => o.status === 'na_cekanju').sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const [komentari, setKomentari] = useState({});
  const [radi, setRadi] = useState(null);

  if (naCekanju.length === 0) {
    return <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-2xl p-6">Nema zahtjeva na čekanju.</p>;
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
          praznici, slava: profil.slava_datum, godina, danas,
        });
        const istovremeno = odsustva.filter((o) => o.korisnik_id !== z.korisnik_id && ['na_cekanju', 'odobreno'].includes(o.status) && seKlapaju(o, z));
        const svoj = z.korisnik_id === ja.user.id && !ja.dozvole.includes('admin');

        return (
          <article key={z.id} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">{z.korisnik_ime}</h3>
                <p className="text-sm text-slate-800 mt-0.5">
                  {TIPOVI[z.tip]}: <strong><Period o={z} /></strong>, {z.radnih_dana} radnih dana
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
                  <button onClick={() => obradi(z, 'odbij')} disabled={!!radi} className="px-4 py-2 rounded-lg text-sm font-bold bg-white border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">
                    {radi === `${z.id}-odbij` ? 'Odbijanje…' : 'Odbij'}
                  </button>
                  <button onClick={() => obradi(z, 'odobri')} disabled={!!radi} className="px-4 py-2 rounded-lg text-sm font-bold bg-green-700 hover:bg-green-800 text-white disabled:opacity-50">
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

function SviKorisnici({ ja, praznici, odsustva, profili, korekcije, danas, godina, akcija }) {
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
        praznici, slava: p.slava_datum, godina, danas,
      });
      const sada = njegova.find((o) => o.status === 'odobreno' && o.datum_od <= danas && danas <= o.datum_do);
      return { p, ime: imeIz(p.email), njegova, stanje, sada };
    })
    .filter((r) => r.ime.includes(pretraga.trim().toLowerCase())), [profili, odsustva, korekcije, praznici, godina, danas, pretraga]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-slate-900">Slobodni dani svih korisnika, {godina}.</h2>
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
              <th className="py-2 pr-4 font-semibold text-right">Iz prošle god.</th>
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
                    {sada && <span className="ml-2 text-xs font-semibold text-green-900 bg-green-100 px-2 py-0.5 rounded-full">danas odsutan</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{stanje.prenosPreostalo}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{stanje.iskoristeno}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{stanje.naCekanju}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-bold text-slate-900">{stanje.preostalo}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => setOtvoren(otvoren === p.id ? null : p.id)} aria-expanded={otvoren === p.id} className="text-sm font-semibold text-blue-700 hover:underline">
                      {otvoren === p.id ? 'Sakrij' : 'Detalji'}
                    </button>
                  </td>
                </tr>
                {otvoren === p.id && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 px-4 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6">
                        <ListaZahtjeva zahtjevi={njegova} akcija={akcija} mojId={ja.user.id} mozeOtkazatiOdobreno={jeOdobravac} prazno="Nema zahtjeva." />
                        <div className="space-y-5">
                          <SlavaPolje profil={p} akcija={akcija} korisnikId={p.id} jeAdmin={jeAdmin} />
                          {jeAdmin && <KorekcijaForma korisnikId={p.id} godina={godina} postojeca={korekcije.find((k) => k.korisnik_id === p.id && k.godina === godina)} akcija={akcija} />}
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

function KorekcijaForma({ korisnikId, godina, postojeca, akcija }) {
  const [dana, setDana] = useState(String(postojeca?.dana ?? 0));
  const [prenos, setPrenos] = useState(String(postojeca?.prenos ?? 0));
  const [slanje, setSlanje] = useState(false);

  const posalji = async (e) => {
    e.preventDefault();
    setSlanje(true);
    await akcija({ akcija: 'korekcija', korisnikId, godina, dana: Number(dana), prenos: Number(prenos) }, 'Korekcija je sačuvana.');
    setSlanje(false);
  };

  return (
    <form onSubmit={posalji} className="space-y-2">
      <p className="text-xs font-bold text-slate-600">Korekcija za {godina}.</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`kor-dana-${korisnikId}`} className="block text-xs text-slate-700 mb-1">Iskorišćeno van aplikacije</label>
          <input id={`kor-dana-${korisnikId}`} type="number" min={0} max={365} value={dana} onChange={(e) => setDana(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm tabular-nums" />
        </div>
        <div>
          <label htmlFor={`kor-prenos-${korisnikId}`} className="block text-xs text-slate-700 mb-1">Preneseno iz prošle god.</label>
          <input id={`kor-prenos-${korisnikId}`} type="number" min={0} max={365} value={prenos} onChange={(e) => setPrenos(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm tabular-nums" />
        </div>
      </div>
      <button type="submit" disabled={slanje} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white disabled:bg-slate-300">{slanje ? 'Čuvanje…' : 'Sačuvaj korekciju'}</button>
    </form>
  );
}
