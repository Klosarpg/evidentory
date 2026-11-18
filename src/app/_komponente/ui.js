'use client';

import { useEffect, useRef } from 'react';

// Zajednički sitni elementi za ekrane Administracija i dalje.

export const FOKUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

export const POLJE = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:bg-slate-100';

export const DUGME = {
  glavno: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors ${FOKUS}`,
  sporedno: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 disabled:opacity-50 transition-colors ${FOKUS}`,
  opasno: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors ${FOKUS}`,
  opasnoSporedno: `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-red-300 hover:bg-red-50 text-red-700 disabled:opacity-50 transition-colors ${FOKUS}`,
  link: `text-sm font-semibold text-blue-700 hover:underline rounded ${FOKUS}`,
  linkOpasno: `text-sm font-semibold text-red-700 hover:underline rounded ${FOKUS}`,
};

const PUTANJE = {
  nazad: 'M19 12H5m6-7l-7 7 7 7',
  zatvori: 'M6 6l12 12M18 6L6 18',
  upozorenje: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  kvacica: 'M5 13l4 4L19 7',
  plus: 'M12 5v14M5 12h14',
  korisnici: 'M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  stit: 'M9 12l2 2 4-4m5.6-4A12 12 0 0112 3a12 12 0 01-8.6 3A12 12 0 003 9c0 5.6 3.8 10.3 9 11.6 5.2-1.3 9-6 9-11.6 0-1-.1-2-.4-3z',
  partneri: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  istorija: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  kalendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  pretraga: 'M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
  desno: 'M9 18l6-6-6-6',
};

export function Ikona({ ime, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PUTANJE[ime]} />
    </svg>
  );
}

// poruka: { tip: 'uspjeh' | 'greska', tekst, upozorenja? }
export function Poruka({ poruka, zatvori }) {
  if (!poruka) return null;
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
          <ul className="mt-1 space-y-1 list-disc pl-5">
            {poruka.upozorenja.map((u) => <li key={u}>{u}</li>)}
          </ul>
        )}
      </div>
      <button onClick={zatvori} className={`p-1 -m-1 rounded-md opacity-70 hover:opacity-100 ${FOKUS}`} aria-label="Zatvori poruku">
        <Ikona ime="zatvori" />
      </button>
    </div>
  );
}

// Potvrda za nepovratne akcije: pravi <dialog> (fokus ostaje unutra, Esc zatvara).
// potvrda: { naslov, tekst, dugme, akcija, sadrzaj? } ili null
export function Potvrda({ potvrda, zatvori, radi }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (potvrda && !d.open) d.showModal();
    if (!potvrda && d.open) d.close();
  }, [potvrda]);

  return (
    <dialog
      ref={ref}
      onClose={zatvori}
      className="rounded-2xl p-0 w-full max-w-md shadow-2xl backdrop:bg-slate-900/50 m-auto"
      aria-labelledby="potvrda-naslov"
    >
      {potvrda && (
        <div className="p-6">
          <h2 id="potvrda-naslov" className="text-lg font-bold text-slate-900">{potvrda.naslov}</h2>
          <p className="mt-2 text-sm text-slate-700 leading-relaxed">{potvrda.tekst}</p>
          {potvrda.sadrzaj}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={zatvori} className={DUGME.sporedno} autoFocus>Odustani</button>
            <button type="button" onClick={potvrda.akcija} disabled={radi} className={DUGME.opasno}>
              {radi ? 'Radim…' : potvrda.dugme}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

export function Sekcija({ naslov, opis, akcija, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl">
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">{naslov}</h2>
          {opis && <p className="mt-0.5 text-sm text-slate-600">{opis}</p>}
        </div>
        {akcija}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
