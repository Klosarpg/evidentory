'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ucitajMojeDozvole, DOZVOLE } from '@/lib/dozvole';
import { GODISNJA_KVOTA, SLAVE, NAZIVI_MJESECI, danasUCrnojGori, danUSedmici, formatirajDatum, formatirajSlavu, periodZaDatum, nazivPerioda, granicePerioda } from '@/lib/odsustvo';
import { FOKUS, POLJE, DUGME, Ikona, Poruka, Potvrda, Sekcija } from '../_komponente/ui';
import { dativImena } from '@/lib/dativ';

// Administracija: jedno mjesto za cijeli program (korisnici, uloge), zalihe (komitenti, istorija)
// i slobodne dane (praznici). Dostupno samo ulogama sa dozvolom "admin".

const SEKCIJE = [
  { kljuc: 'korisnici', naziv: 'Korisnici', ikona: 'korisnici', grupa: 'Program' },
  { kljuc: 'uloge', naziv: 'Uloge i dozvole', ikona: 'stit', grupa: 'Program' },
  { kljuc: 'komitenti', naziv: 'Komitenti', ikona: 'partneri', grupa: 'Zalihe' },
  { kljuc: 'istorija', naziv: 'Istorija prometa', ikona: 'istorija', grupa: 'Zalihe' },
  { kljuc: 'praznici', naziv: 'Praznici', ikona: 'kalendar', grupa: 'Slobodni dani' },
];

const DOMEN = '@evidentory.com';
const korisnickoIme = (email) => (email || '').replace(DOMEN, '');
const DANI = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];
const TIPOVI_PROMETA = {
  ULAZ: 'Prijem',
  BRZI_ULAZ: 'Prijem',
  IZLAZ_OTPREMNICA: 'Otpremnica',
  REZERVACIJA: 'Rezervacija',
  OTKAZANA_REZERVACIJA: 'Otkazana rezervacija',
};
const TIPOVI_KOMITENTA = { Dobavljac: 'Dobavljač', Kupac: 'Kupac', Oboje: 'Dobavljač i kupac' };

async function pozoviApi(adresa, metoda, tijelo) {
  const { data: { session } } = await supabase.auth.getSession();
  const odgovor = await fetch(adresa, {
    method: metoda,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(tijelo),
  });
  const rezultat = await odgovor.json().catch(() => ({}));
  return { ok: odgovor.ok, poruka: rezultat.error, upozorenja: rezultat.upozorenja || [], podaci: rezultat };
}

function procitajAdresu() {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  return { sekcija: p.get('sekcija'), korisnik: p.get('korisnik') };
}

function upisiAdresu(sekcija, korisnik) {
  const p = new URLSearchParams();
  if (sekcija) p.set('sekcija', sekcija);
  if (korisnik) p.set('korisnik', korisnik);
  window.history.replaceState(null, '', `/admin?${p.toString()}`);
}

// ================= Stranica =================

export default function Administracija() {
  const router = useRouter();
  const [ja, setJa] = useState(null);
  const [podaci, setPodaci] = useState(null);
  const [greskaUcitavanja, setGreskaUcitavanja] = useState('');
  const [sekcija, setSekcija] = useState('korisnici');
  const [izabraniId, setIzabraniId] = useState(null);
  const [poruka, setPoruka] = useState(null);
  const [potvrda, setPotvrda] = useState(null);
  const [radiPotvrda, setRadiPotvrda] = useState(false);

  const danas = danasUCrnojGori();
  const godina = Number(danas.slice(0, 4));
  const period = periodZaDatum(danas); // tekuća godina godišnjeg odmora

  const ucitaj = useCallback(async () => {
    const mojeDozvole = await ucitajMojeDozvole(supabase);
    if (!mojeDozvole) return router.replace('/');
    if (!mojeDozvole.dozvole.includes('admin')) return router.replace('/pocetna');
    setJa(mojeDozvole);

    const [profili, uloge, komitenti, istorija, oprema, praznici, korekcije, jmbg] = await Promise.all([
      supabase.from('profili').select('*').order('email'),
      supabase.from('uloge').select('*').order('naziv'),
      supabase.from('komitenti').select('*').order('naziv'),
      supabase.from('istorija').select('*').order('created_at', { ascending: false }),
      supabase.from('oprema').select('id, naziv, kolicina'),
      supabase.from('praznici').select('*').order('datum'),
      supabase.from('odsustvo_korekcije').select('*'),
      pozoviApi('/api/odsustvo', 'POST', { akcija: 'jmbg_pregled' }),
    ]);
    const prva = [profili, uloge, komitenti, istorija, oprema].find((r) => r.error);
    if (prva) {
      setGreskaUcitavanja(`Podaci nisu učitani: ${prva.error.message}`);
      return;
    }
    setGreskaUcitavanja('');
    setPodaci({
      profili: profili.data || [],
      uloge: uloge.data || [],
      komitenti: komitenti.data || [],
      istorija: istorija.data || [],
      oprema: oprema.data || [],
      praznici: praznici.error ? null : praznici.data || [],
      korekcije: korekcije.error ? [] : korekcije.data || [],
      jmbg: jmbg.ok ? jmbg.podaci.jmbg || {} : {},
    });
  }, [router]);

  useEffect(() => {
    const a = procitajAdresu();
    if (SEKCIJE.some((s) => s.kljuc === a.sekcija)) setSekcija(a.sekcija);
    if (a.korisnik) setIzabraniId(a.korisnik);
    ucitaj();
  }, [ucitaj]);

  const idiNa = (kljuc) => {
    setSekcija(kljuc);
    setPoruka(null);
    upisiAdresu(kljuc, kljuc === 'korisnici' ? izabraniId : null);
  };
  const izaberiKorisnika = (id) => {
    setIzabraniId(id);
    setPoruka(null);
    upisiAdresu('korisnici', id);
  };

  // Izvrši akciju, prikaži poruku i osvježi podatke.
  const izvrsi = async (posao, uspjeh) => {
    const r = await posao();
    const ok = r === undefined || r.ok;
    setPoruka(ok
      ? { tip: 'uspjeh', tekst: uspjeh, upozorenja: r?.upozorenja }
      : { tip: 'greska', tekst: r.poruka || 'Došlo je do greške. Pokušaj ponovo.' });
    if (ok) await ucitaj();
    return { ok, podaci: r?.podaci };
  };

  const potvrdiAkciju = async () => {
    if (!potvrda) return;
    setRadiPotvrda(true);
    await potvrda.izvrsi();
    setRadiPotvrda(false);
    setPotvrda(null);
  };

  if (greskaUcitavanja) {
    return (
      <Okvir ja={ja}>
        <p role="alert" className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl p-4">{greskaUcitavanja}</p>
      </Okvir>
    );
  }
  if (!ja || !podaci) {
    return (
      <Okvir ja={ja}>
        <div className="animate-pulse grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8" aria-busy="true" aria-label="Učitavanje">
          <div className="h-64 rounded-2xl bg-slate-200/70" />
          <div className="h-[28rem] rounded-2xl bg-slate-200/70" />
        </div>
      </Okvir>
    );
  }

  const zajedno = { ja, podaci, danas, godina, period, izvrsi, potvrdi: setPotvrda };
  const grupe = [...new Set(SEKCIJE.map((s) => s.grupa))];

  return (
    <Okvir ja={ja}>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
        <nav aria-label="Administracija" className="lg:sticky lg:top-6 space-y-5">
          {grupe.map((g) => (
            <div key={g}>
              <p className="px-3 mb-1.5 text-xs font-semibold text-slate-600">{g}</p>
              <ul className="space-y-0.5">
                {SEKCIJE.filter((s) => s.grupa === g).map((s) => (
                  <li key={s.kljuc}>
                    <button
                      onClick={() => idiNa(s.kljuc)}
                      aria-current={sekcija === s.kljuc ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${FOKUS} ${sekcija === s.kljuc ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-700 hover:bg-white/70 hover:text-slate-900'}`}
                    >
                      <Ikona ime={s.ikona} className="w-[18px] h-[18px]" />
                      {s.naziv}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <Poruka poruka={poruka} zatvori={() => setPoruka(null)} />
          {sekcija === 'korisnici' && <Korisnici {...zajedno} izabraniId={izabraniId} izaberi={izaberiKorisnika} />}
          {sekcija === 'uloge' && <Uloge {...zajedno} />}
          {sekcija === 'komitenti' && <Komitenti {...zajedno} />}
          {sekcija === 'istorija' && <Istorija {...zajedno} />}
          {sekcija === 'praznici' && <Praznici {...zajedno} />}
        </div>
      </div>

      <Potvrda
        potvrda={potvrda && { ...potvrda, akcija: potvrdiAkciju }}
        zatvori={() => !radiPotvrda && setPotvrda(null)}
        radi={radiPotvrda}
      />
    </Okvir>
  );
}

function Okvir({ ja, children }) {
  const router = useRouter();
  const odjava = async () => { await supabase.auth.signOut(); router.push('/'); };
  return (
    <main className="min-h-screen bg-slate-100 font-sans text-slate-800">
      <header className="bg-[#0F172A] text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/pocetna')} className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-white rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <Ikona ime="nazad" /> Početna
            </button>
            <h1 className="text-lg font-bold tracking-wide">Administracija</h1>
          </div>
          <div className="flex items-center gap-4">
            {ja && <span className="text-sm text-slate-300">{ja.korisnickoIme}</span>}
            <button onClick={odjava} className="text-sm font-semibold text-slate-300 hover:text-white rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">Odjavi se</button>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
    </main>
  );
}

function Polje({ id, label, pomoc, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800 mb-1">{label}</label>
      {children}
      {pomoc && <p className="mt-1 text-xs text-slate-600">{pomoc}</p>}
    </div>
  );
}

// ================= Korisnici =================

function Korisnici({ ja, podaci, period, izvrsi, potvrdi, izabraniId, izaberi }) {
  const [pretraga, setPretraga] = useState('');
  const [noviOtvoren, setNoviOtvoren] = useState(false);

  const lista = useMemo(() => {
    const q = pretraga.trim().toLowerCase();
    return podaci.profili.filter((p) => !q
      || korisnickoIme(p.email).includes(q)
      || (p.ime_prezime || '').toLowerCase().includes(q)
      || (p.kontakt_email || '').toLowerCase().includes(q));
  }, [podaci.profili, pretraga]);

  const izabran = podaci.profili.find((p) => p.id === izabraniId);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
      <section aria-label="Lista korisnika" className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Korisnici <span className="text-slate-600 font-medium tabular-nums">({podaci.profili.length})</span></h2>
            <button onClick={() => { setNoviOtvoren(true); izaberi(null); }} className={DUGME.glavno}>
              <Ikona ime="plus" /> Novi
            </button>
          </div>
          <div className="relative">
            <label htmlFor="pretraga-korisnika" className="sr-only">Pretraži korisnike</label>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Ikona ime="pretraga" /></span>
            <input id="pretraga-korisnika" type="search" placeholder="Ime, korisničko ime ili email" value={pretraga} onChange={(e) => setPretraga(e.target.value)} className={`${POLJE} pl-9`} />
          </div>
        </div>
        <ul className="max-h-[calc(100vh-260px)] overflow-y-auto divide-y divide-slate-100">
          {lista.map((p) => {
            const aktivan = p.id === izabraniId;
            const nedostaje = [!p.kontakt_email && 'email', !p.ime_prezime && 'ime i prezime'].filter(Boolean);
            return (
              <li key={p.id}>
                <button
                  onClick={() => { setNoviOtvoren(false); izaberi(p.id); }}
                  aria-current={aktivan ? 'true' : undefined}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors focus-visible:outline-none focus-visible:bg-blue-50 ${aktivan ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold uppercase ${aktivan ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {(p.ime_prezime || korisnickoIme(p.email)).slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{p.ime_prezime || korisnickoIme(p.email)}</span>
                    <span className="block text-xs text-slate-600 truncate">{korisnickoIme(p.email)} · {p.uloga}</span>
                    {nedostaje.length > 0 && <span className="block text-xs text-amber-800 truncate">Nedostaje: {nedostaje.join(', ')}</span>}
                  </span>
                  <Ikona ime="desno" className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-4 py-6 text-sm text-slate-600">Nijedan korisnik ne odgovara pretrazi.</li>}
        </ul>
      </section>

      <div className="min-w-0">
        {noviOtvoren ? (
          <NoviKorisnik podaci={podaci} izvrsi={izvrsi} odustani={() => setNoviOtvoren(false)} gotovo={(id) => { setNoviOtvoren(false); izaberi(id); }} />
        ) : izabran ? (
          <ProfilKorisnika key={izabran.id} profil={izabran} ja={ja} podaci={podaci} period={period} izvrsi={izvrsi} potvrdi={potvrdi} izaberi={izaberi} />
        ) : (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
            <p className="text-base font-semibold text-slate-900">Izaberi korisnika</p>
            <p className="mt-1 text-sm text-slate-600">Klikni na korisnika lijevo da urediš nalog, podatke za rješenje, slavu i slobodne dane, ili dodaj novog.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NoviKorisnik({ podaci, izvrsi, odustani, gotovo }) {
  const [ime, setIme] = useState('');
  const [lozinka, setLozinka] = useState('');
  const [email, setEmail] = useState('');
  const [uloga, setUloga] = useState(podaci.uloge.find((u) => u.naziv === 'Korisnik') ? 'Korisnik' : podaci.uloge[0]?.naziv || 'Korisnik');
  const [slanje, setSlanje] = useState(false);

  const posalji = async (e) => {
    e.preventDefault();
    setSlanje(true);
    const r = await izvrsi(
      () => pozoviApi('/api/korisnici', 'POST', { korisnickoIme: ime.trim().toLowerCase(), lozinka, uloga, kontaktEmail: email }),
      `Korisnik "${ime.trim().toLowerCase()}" je kreiran. Dopuni mu podatke za rješenje.`
    );
    setSlanje(false);
    if (r.ok) gotovo(r.podaci?.id || null);
  };

  return (
    <Sekcija naslov="Novi korisnik" opis="Korisnik se prijavljuje korisničkim imenom i lozinkom. Ostale podatke dopuniš u profilu.">
      <form onSubmit={posalji} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <Polje id="n-ime" label="Korisničko ime" pomoc="3–30 znakova: slova bez kvačica, brojevi, tačka, crtica.">
          <input id="n-ime" required minLength={3} maxLength={30} pattern="[A-Za-z0-9._\-]+" autoComplete="off" value={ime} onChange={(e) => setIme(e.target.value)} className={POLJE} />
        </Polje>
        <Polje id="n-lozinka" label="Lozinka" pomoc="Najmanje 6 znakova. Javi je korisniku.">
          <input id="n-lozinka" type="text" required minLength={6} autoComplete="off" value={lozinka} onChange={(e) => setLozinka(e.target.value)} className={POLJE} />
        </Polje>
        <Polje id="n-email" label="Email za obavještenja" pomoc="Na njega stižu obavještenja o slobodnim danima.">
          <input id="n-email" type="email" autoComplete="off" placeholder="ime@firma.com" value={email} onChange={(e) => setEmail(e.target.value)} className={POLJE} />
        </Polje>
        <Polje id="n-uloga" label="Uloga">
          <select id="n-uloga" value={uloga} onChange={(e) => setUloga(e.target.value)} className={POLJE}>
            {podaci.uloge.map((u) => <option key={u.naziv} value={u.naziv}>{u.naziv}</option>)}
          </select>
        </Polje>
        <div className="md:col-span-2 flex gap-3">
          <button type="submit" disabled={slanje} className={DUGME.glavno}>{slanje ? 'Kreiranje…' : 'Kreiraj korisnika'}</button>
          <button type="button" onClick={odustani} className={DUGME.sporedno}>Odustani</button>
        </div>
      </form>
    </Sekcija>
  );
}

function Blok({ naslov, opis, children }) {
  return (
    <div className="py-6 first:pt-0 last:pb-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-x-8 gap-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{naslov}</h3>
        {opis && <p className="mt-1 text-xs text-slate-600 leading-relaxed">{opis}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ProfilKorisnika({ profil, ja, podaci, period, izvrsi, potvrdi, izaberi }) {
  const ime = korisnickoIme(profil.email);
  const jaSam = profil.id === ja.user.id;

  return (
    <section aria-labelledby="profil-naslov" className="bg-white border border-slate-200 rounded-2xl">
      <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-center gap-4">
        <span className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold uppercase">{(profil.ime_prezime || ime).slice(0, 2)}</span>
        <div className="min-w-0">
          <h2 id="profil-naslov" className="text-lg font-bold text-slate-900 truncate">{profil.ime_prezime || ime}{jaSam && <span className="ml-2 text-xs font-semibold text-slate-600">(ti)</span>}</h2>
          <p className="text-sm text-slate-600 truncate">{ime} · {profil.uloga}{profil.kontakt_email ? ` · ${profil.kontakt_email}` : ''}</p>
        </div>
      </div>

      <div className="px-6 py-6 divide-y divide-slate-200">
        <Blok naslov="Nalog" opis="Prijava, uloga i email za obavještenja.">
          <NalogForma profil={profil} podaci={podaci} izvrsi={izvrsi} />
        </Blok>
        <Blok naslov="Podaci za rješenje" opis="Upisuju se na rješenje o godišnjem odmoru.">
          <PodaciForma profil={profil} izvrsi={izvrsi} />
          <div className="mt-6 pt-5 border-t border-slate-100">
            <JmbgForma korisnikId={profil.id} maskiran={podaci.jmbg[profil.id]} izvrsi={izvrsi} potvrdi={potvrdi} />
          </div>
        </Blok>
        <Blok naslov="Slava" opis="Taj dan je svake godine slobodan i ne troši godišnji; 5 dana ranije stiže podsjetnik.">
          <SlavaForma profil={profil} izvrsi={izvrsi} />
        </Blok>
        <Blok naslov={`Slobodni dani za ${nazivPerioda(period)} godinu`} opis={`Svako dobija 20 dana 1. januara ${period}. Neiskorišćeni dani iz ${period - 1}. troše se prvi i važe do 30. 6. ${period}.`}>
          <KorekcijaForma korisnikId={profil.id} period={period} postojeca={podaci.korekcije.find((k) => k.korisnik_id === profil.id && k.godina === period)} izvrsi={izvrsi} />
        </Blok>
        {!jaSam && (
          <Blok naslov="Brisanje naloga" opis="Korisnik se više ne može prijaviti. Unosi u istoriji prometa ostaju.">
            <button
              onClick={() => potvrdi({
                naslov: `Obriši korisnika "${ime}"?`,
                tekst: 'Nalog i njegovi zahtjevi za slobodne dane se trajno brišu. Unosi u istoriji prometa ostaju sa njegovim imenom. Ova akcija se ne može poništiti.',
                dugme: 'Obriši korisnika',
                izvrsi: async () => {
                  const r = await izvrsi(() => pozoviApi('/api/korisnici', 'DELETE', { id: profil.id }), `Korisnik "${ime}" je obrisan.`);
                  if (r.ok) izaberi(null);
                },
              })}
              className={DUGME.opasnoSporedno}
            >
              Obriši korisnika
            </button>
          </Blok>
        )}
      </div>
    </section>
  );
}

function NalogForma({ profil, podaci, izvrsi }) {
  const [ime, setIme] = useState(korisnickoIme(profil.email));
  const [email, setEmail] = useState(profil.kontakt_email || '');
  const [uloga, setUloga] = useState(profil.uloga || '');
  const [lozinka, setLozinka] = useState('');
  const [slanje, setSlanje] = useState(false);

  const posalji = async (e) => {
    e.preventDefault();
    setSlanje(true);
    const r = await izvrsi(
      () => pozoviApi('/api/korisnici', 'PATCH', {
        id: profil.id, korisnickoIme: ime.trim().toLowerCase(), kontaktEmail: email, uloga, lozinka: lozinka || undefined,
      }),
      lozinka ? 'Nalog je sačuvan, sa novom lozinkom.' : 'Nalog je sačuvan.'
    );
    setSlanje(false);
    if (r.ok) setLozinka('');
  };

  return (
    <form onSubmit={posalji} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Polje id="p-ime" label="Korisničko ime" pomoc="Promjena važi i za istoriju prometa i zahtjeve.">
        <input id="p-ime" required minLength={3} maxLength={30} pattern="[A-Za-z0-9._\-]+" autoComplete="off" value={ime} onChange={(e) => setIme(e.target.value)} className={POLJE} />
      </Polje>
      <Polje id="p-email" label="Email za obavještenja">
        <input id="p-email" type="email" autoComplete="off" placeholder="ime@firma.com" value={email} onChange={(e) => setEmail(e.target.value)} className={POLJE} />
      </Polje>
      <Polje id="p-uloga" label="Uloga">
        <select id="p-uloga" value={uloga} onChange={(e) => setUloga(e.target.value)} className={POLJE}>
          {podaci.uloge.map((u) => <option key={u.naziv} value={u.naziv}>{u.naziv}</option>)}
        </select>
      </Polje>
      <Polje id="p-lozinka" label="Nova lozinka" pomoc="Ostavi prazno ako se ne mijenja.">
        <input id="p-lozinka" type="text" minLength={6} autoComplete="off" value={lozinka} onChange={(e) => setLozinka(e.target.value)} className={POLJE} />
      </Polje>
      <div className="md:col-span-2">
        <button type="submit" disabled={slanje} className={DUGME.glavno}>{slanje ? 'Čuvanje…' : 'Sačuvaj nalog'}</button>
      </div>
    </form>
  );
}

function PodaciForma({ profil, izvrsi }) {
  const [imePrezime, setImePrezime] = useState(profil.ime_prezime || '');
  const [imePrezimeDativ, setImePrezimeDativ] = useState(profil.ime_prezime_dativ || '');
  const [radnoMjesto, setRadnoMjesto] = useState(profil.radno_mjesto || '');
  const [pol, setPol] = useState(profil.pol || '');
  const [radniOdnos, setRadniOdnos] = useState(profil.radni_odnos || 'neodređeno');
  const [slanje, setSlanje] = useState(false);

  const posalji = async (e) => {
    e.preventDefault();
    setSlanje(true);
    await izvrsi(
      () => pozoviApi('/api/odsustvo', 'POST', { akcija: 'podaci', korisnikId: profil.id, imePrezime, imePrezimeDativ, radnoMjesto, pol, radniOdnos }),
      'Podaci za rješenje su sačuvani.'
    );
    setSlanje(false);
  };

  return (
    <form onSubmit={posalji} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Polje id="r-ime" label="Ime i prezime">
        <input id="r-ime" value={imePrezime} onChange={(e) => setImePrezime(e.target.value)} placeholder="npr. Marko Marković" className={POLJE} />
      </Polje>
      <Polje id="r-dativ" label="Ime i prezime u dativu (kome?)" pomoc={`Za obrazloženje rješenja. Ako ostane prazno, piše se: ${dativImena(imePrezime, pol) || '…'}`}>
        <input id="r-dativ" value={imePrezimeDativ} onChange={(e) => setImePrezimeDativ(e.target.value)} placeholder={dativImena(imePrezime, pol) || 'npr. Marku Markoviću'} className={POLJE} />
      </Polje>
      <Polje id="r-mjesto" label="Radno mjesto">
        <input id="r-mjesto" value={radnoMjesto} onChange={(e) => setRadnoMjesto(e.target.value)} className={POLJE} />
      </Polje>
      <Polje id="r-pol" label="Pol" pomoc="Za oblike riječi na rješenju (raspoređenom / raspoređenoj).">
        <select id="r-pol" value={pol} onChange={(e) => setPol(e.target.value)} className={POLJE}>
          <option value="">Nije izabrano</option>
          <option value="M">Muški</option>
          <option value="Ž">Ženski</option>
        </select>
      </Polje>
      <Polje id="r-odnos" label="Radni odnos">
        <select id="r-odnos" value={radniOdnos} onChange={(e) => setRadniOdnos(e.target.value)} className={POLJE}>
          <option value="neodređeno">Na neodređeno vrijeme</option>
          <option value="određeno">Na određeno vrijeme</option>
        </select>
      </Polje>
      <div className="md:col-span-2">
        <button type="submit" disabled={slanje} className={DUGME.glavno}>{slanje ? 'Čuvanje…' : 'Sačuvaj podatke'}</button>
      </div>
    </form>
  );
}

function JmbgForma({ korisnikId, maskiran, izvrsi, potvrdi }) {
  const [unos, setUnos] = useState('');
  const [uredjujem, setUredjujem] = useState(!maskiran);
  const [slanje, setSlanje] = useState(false);

  const sacuvaj = async (e) => {
    e.preventDefault();
    setSlanje(true);
    const r = await izvrsi(() => pozoviApi('/api/odsustvo', 'POST', { akcija: 'jmbg', korisnikId, jmbg: unos }), 'JMBG je sačuvan.');
    setSlanje(false);
    if (r.ok) { setUnos(''); setUredjujem(false); }
  };

  if (maskiran && !uredjujem) {
    return (
      <div>
        <p className="text-sm font-medium text-slate-800">JMBG</p>
        <p className="mt-1 text-base font-semibold tabular-nums tracking-wider text-slate-900">{maskiran}</p>
        <div className="mt-2 flex gap-4">
          <button onClick={() => setUredjujem(true)} className={DUGME.link}>Promijeni</button>
          <button
            onClick={() => potvrdi({
              naslov: 'Ukloniti JMBG?',
              tekst: 'Na novim rješenjima ostaće prazna linija za ručni upis.',
              dugme: 'Ukloni JMBG',
              izvrsi: () => izvrsi(() => pozoviApi('/api/odsustvo', 'POST', { akcija: 'jmbg', korisnikId, jmbg: '' }), 'JMBG je uklonjen.'),
            })}
            className={DUGME.linkOpasno}
          >
            Ukloni
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={sacuvaj} className="flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="sm:w-64">
        <Polje id={`jmbg-${korisnikId}`} label="JMBG" pomoc="Poslije čuvanja vidi se samo zadnje 4 cifre.">
          <input
            id={`jmbg-${korisnikId}`}
            inputMode="numeric"
            autoComplete="off"
            required
            pattern="[0-9]{13}"
            maxLength={13}
            title="13 cifara"
            value={unos}
            onChange={(e) => setUnos(e.target.value.replace(/[^0-9]/g, ''))}
            className={`${POLJE} tabular-nums tracking-wider`}
          />
        </Polje>
      </div>
      <div className="flex gap-3 sm:mb-6">
        <button type="submit" disabled={slanje || unos.length !== 13} className={DUGME.glavno}>{slanje ? 'Čuvanje…' : 'Sačuvaj JMBG'}</button>
        {maskiran && <button type="button" onClick={() => setUredjujem(false)} className={DUGME.sporedno}>Odustani</button>}
      </div>
    </form>
  );
}

function SlavaForma({ profil, izvrsi }) {
  const poznata = SLAVE.find((s) => s.datum === profil.slava_datum && s.naziv === profil.slava_naziv);
  const pocetni = !profil.slava_datum ? 'bez' : poznata ? poznata.datum : 'drugo';
  const [izbor, setIzbor] = useState(pocetni);
  const [mjesec, setMjesec] = useState(profil.slava_datum?.slice(0, 2) || '01');
  const [dan, setDan] = useState(profil.slava_datum ? String(Number(profil.slava_datum.slice(3))) : '1');
  const [naziv, setNaziv] = useState(poznata ? '' : profil.slava_naziv || '');
  const [slanje, setSlanje] = useState(false);

  const posalji = async (e) => {
    e.preventDefault();
    let slavaDatum = null;
    let slavaNaziv = null;
    if (izbor === 'drugo') {
      slavaDatum = `${mjesec}-${String(dan).padStart(2, '0')}`;
      slavaNaziv = naziv;
    } else if (izbor !== 'bez') {
      const s = SLAVE.find((x) => x.datum === izbor);
      slavaDatum = s.datum;
      slavaNaziv = s.naziv;
    }
    setSlanje(true);
    await izvrsi(
      () => pozoviApi('/api/odsustvo', 'POST', { akcija: 'slava', korisnikId: profil.id, slavaDatum, slavaNaziv }),
      slavaDatum ? 'Slava je sačuvana.' : 'Slava je uklonjena.'
    );
    setSlanje(false);
  };

  return (
    <form onSubmit={posalji} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Polje id={`slava-${profil.id}`} label="Slava">
        <select id={`slava-${profil.id}`} value={izbor} onChange={(e) => setIzbor(e.target.value)} className={POLJE}>
          <option value="bez">Bez slave</option>
          {SLAVE.map((s) => <option key={s.datum} value={s.datum}>{s.naziv} ({formatirajSlavu(s.datum)})</option>)}
          <option value="drugo">Druga slava (upiši datum)</option>
        </select>
      </Polje>
      {izbor === 'drugo' && (
        <>
          <Polje id="slava-naziv" label="Naziv slave">
            <input id="slava-naziv" required value={naziv} onChange={(e) => setNaziv(e.target.value)} className={POLJE} />
          </Polje>
          <div className="grid grid-cols-[1fr_96px] gap-3 md:col-start-2">
            <Polje id="slava-mjesec" label="Mjesec">
              <select id="slava-mjesec" value={mjesec} onChange={(e) => setMjesec(e.target.value)} className={POLJE}>
                {NAZIVI_MJESECI.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
              </select>
            </Polje>
            <Polje id="slava-dan" label="Dan">
              <input id="slava-dan" type="number" min={1} max={31} required value={dan} onChange={(e) => setDan(e.target.value)} className={`${POLJE} tabular-nums`} />
            </Polje>
          </div>
        </>
      )}
      <div className="md:col-span-2">
        <button type="submit" disabled={slanje} className={DUGME.glavno}>{slanje ? 'Čuvanje…' : 'Sačuvaj slavu'}</button>
      </div>
    </form>
  );
}

function KorekcijaForma({ korisnikId, period, postojeca, izvrsi }) {
  const [dana, setDana] = useState(String(postojeca?.dana ?? 0));
  const [dodatno, setDodatno] = useState(String(postojeca?.prenos ?? 0));
  const [napomena, setNapomena] = useState(postojeca?.napomena || '');
  const [slanje, setSlanje] = useState(false);
  const pripada = GODISNJA_KVOTA + (Number(dodatno) || 0) - (Number(dana) || 0);

  const posalji = async (e) => {
    e.preventDefault();
    setSlanje(true);
    await izvrsi(
      () => pozoviApi('/api/odsustvo', 'POST', { akcija: 'korekcija', korisnikId, godina: period, dana: Number(dana), prenos: Number(dodatno), napomena }),
      'Korekcija dana je sačuvana.'
    );
    setSlanje(false);
  };

  return (
    <form onSubmit={posalji} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Polje id={`kor-d-${korisnikId}`} label="Umanjenje dana" pomoc="Oduzima se od 20: dani iskorišćeni van aplikacije ili srazmjerno umanjenje za novog radnika.">
        <input id={`kor-d-${korisnikId}`} type="number" min={0} max={365} value={dana} onChange={(e) => setDana(e.target.value)} className={`${POLJE} tabular-nums`} />
      </Polje>
      <Polje id={`kor-p-${korisnikId}`} label="Dodatni dani" pomoc="Dodaje se na 20, npr. po ugovoru ili stažu.">
        <input id={`kor-p-${korisnikId}`} type="number" min={0} max={365} value={dodatno} onChange={(e) => setDodatno(e.target.value)} className={`${POLJE} tabular-nums`} />
      </Polje>
      <div className="md:col-span-2">
        <Polje id={`kor-n-${korisnikId}`} label="Napomena (nije obavezno)" pomoc="Vidi je i zaposleni, uz stanje svojih dana. Npr. „5 dana iskorišćeno u julu, prije aplikacije“.">
          <input id={`kor-n-${korisnikId}`} maxLength={200} value={napomena} onChange={(e) => setNapomena(e.target.value)} className={POLJE} />
        </Polje>
      </div>
      <p className="md:col-span-2 text-sm text-slate-700">
        Pripada za {nazivPerioda(period)} godinu: <strong className="tabular-nums">{pripada}</strong> dana ({GODISNJA_KVOTA}{Number(dodatno) ? ` + ${Number(dodatno)}` : ''}{Number(dana) ? ` − ${Number(dana)}` : ''}). Što od toga ostane neiskorišćeno, prenosi se u {period + 1}. i važi do 30. 6. {period + 1}.
      </p>
      <div className="md:col-span-2">
        <button type="submit" disabled={slanje} className={DUGME.glavno}>{slanje ? 'Čuvanje…' : 'Sačuvaj korekciju'}</button>
      </div>
    </form>
  );
}

// ================= Uloge i dozvole =================

function Uloge({ ja, podaci, izvrsi, potvrdi }) {
  const [uloge, setUloge] = useState(podaci.uloge);
  const [nova, setNova] = useState('');
  useEffect(() => setUloge(podaci.uloge), [podaci.uloge]);

  const brojKorisnika = (naziv) => podaci.profili.filter((p) => p.uloga === naziv).length;

  const promijeni = async (naziv, kljuc, ukljuceno) => {
    const u = uloge.find((x) => x.naziv === naziv);
    const stare = u.dozvole || [];
    const nove = ukljuceno ? [...new Set([...stare, kljuc])] : stare.filter((d) => d !== kljuc);
    setUloge((l) => l.map((x) => (x.naziv === naziv ? { ...x, dozvole: nove } : x)));
    const r = await izvrsi(() => pozoviApi('/api/uloge', 'PATCH', { naziv, dozvole: nove }), `Dozvole uloge "${naziv}" su sačuvane.`);
    if (!r.ok) setUloge((l) => l.map((x) => (x.naziv === naziv ? { ...x, dozvole: stare } : x)));
  };

  const dodaj = async (e) => {
    e.preventDefault();
    const r = await izvrsi(() => pozoviApi('/api/uloge', 'POST', { naziv: nova.trim(), dozvole: ['zalihe_pregled', 'odsustvo_zahtjev'] }), `Uloga "${nova.trim()}" je dodata.`);
    if (r.ok) setNova('');
  };

  const grupe = [...new Set(DOZVOLE.map((d) => d.grupa))];

  return (
    <Sekcija naslov="Uloge i dozvole" opis="Čekiraj šta svaka uloga smije. Promjena odmah važi za sve korisnike sa tom ulogom.">
      {uloge.length === 0 ? (
        <p className="text-sm text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Uloge nisu učitane. Pokreni SQL "uloge-dozvole.sql" u Supabase-u pa osvježi stranicu.</p>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-600">
                <th rowSpan={2} className="pb-2 pr-4 font-semibold align-bottom">Uloga</th>
                {grupe.map((g) => (
                  <th key={g} colSpan={DOZVOLE.filter((d) => d.grupa === g).length} className="px-2 pb-1 font-semibold text-center border-b border-slate-200">{g}</th>
                ))}
                <th rowSpan={2}><span className="sr-only">Akcije</span></th>
              </tr>
              <tr className="text-xs text-slate-700">
                {DOZVOLE.map((d) => <th key={d.kljuc} className="px-2 pt-2 pb-2 font-medium text-center align-bottom max-w-28">{d.naziv}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-200">
              {uloge.map((u) => {
                const broj = brojKorisnika(u.naziv);
                return (
                  <tr key={u.naziv}>
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-slate-900 whitespace-nowrap">{u.naziv}</span>
                      <span className="block text-xs text-slate-600">{broj} {broj === 1 ? 'korisnik' : 'korisnika'}</span>
                    </td>
                    {DOZVOLE.map((d) => (
                      <td key={d.kljuc} className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${u.naziv}: ${d.naziv}`}
                          checked={(u.dozvole || []).includes(d.kljuc)}
                          onChange={(e) => promijeni(u.naziv, d.kljuc, e.target.checked)}
                          className={`w-4 h-4 accent-blue-600 cursor-pointer rounded ${FOKUS}`}
                        />
                      </td>
                    ))}
                    <td className="py-3 pl-2 text-right">
                      {u.naziv !== ja.uloga && broj === 0 && (
                        <button
                          onClick={() => potvrdi({
                            naslov: `Obriši ulogu "${u.naziv}"?`,
                            tekst: 'Uloga se trajno briše. Nijedan korisnik je trenutno nema.',
                            dugme: 'Obriši ulogu',
                            izvrsi: () => izvrsi(() => pozoviApi('/api/uloge', 'DELETE', { naziv: u.naziv }), `Uloga "${u.naziv}" je obrisana.`),
                          })}
                          className={DUGME.linkOpasno}
                        >
                          Obriši
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={dodaj} className="mt-6 flex flex-col sm:flex-row sm:items-end gap-3 max-w-xl">
        <div className="flex-1">
          <Polje id="nova-uloga" label="Nova uloga" pomoc="Npr. Office manager ili Direktor. Dobija osnovna prava, pa ih čekiraj.">
            <input id="nova-uloga" required minLength={2} maxLength={50} value={nova} onChange={(e) => setNova(e.target.value)} className={POLJE} />
          </Polje>
        </div>
        <button type="submit" className={`${DUGME.glavno} sm:mb-6`}><Ikona ime="plus" /> Dodaj ulogu</button>
      </form>
    </Sekcija>
  );
}

// ================= Komitenti =================

function Komitenti({ podaci, izvrsi, potvrdi }) {
  const [urediId, setUrediId] = useState(null);
  const [naziv, setNaziv] = useState('');
  const [grad, setGrad] = useState('');
  const [tip, setTip] = useState('Dobavljac');
  const [pretraga, setPretraga] = useState('');
  const [slanje, setSlanje] = useState(false);

  const ocisti = () => { setUrediId(null); setNaziv(''); setGrad(''); setTip('Dobavljac'); };
  const lista = podaci.komitenti.filter((k) => !pretraga.trim() || `${k.naziv} ${k.grad || ''}`.toLowerCase().includes(pretraga.trim().toLowerCase()));

  const posalji = async (e) => {
    e.preventDefault();
    setSlanje(true);
    const red = { naziv: naziv.trim(), grad: grad.trim() || null, tip };
    const r = await izvrsi(async () => {
      const { error } = urediId
        ? await supabase.from('komitenti').update(red).eq('id', urediId)
        : await supabase.from('komitenti').insert([red]);
      return { ok: !error, poruka: error && `Komitent nije sačuvan: ${error.message}` };
    }, urediId ? `Komitent "${red.naziv}" je izmijenjen.` : `Komitent "${red.naziv}" je dodat.`);
    setSlanje(false);
    if (r.ok) ocisti();
  };

  return (
    <Sekcija naslov="Komitenti" opis="Dobavljači i kupci za prijem robe, otpremnice i rezervacije.">
      <form onSubmit={posalji} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-4 items-end">
        <Polje id="k-naziv" label={urediId ? 'Naziv (izmjena)' : 'Naziv'}>
          <input id="k-naziv" required value={naziv} onChange={(e) => setNaziv(e.target.value)} className={POLJE} />
        </Polje>
        <Polje id="k-grad" label="Grad">
          <input id="k-grad" value={grad} onChange={(e) => setGrad(e.target.value)} className={POLJE} />
        </Polje>
        <Polje id="k-tip" label="Vrsta">
          <select id="k-tip" value={tip} onChange={(e) => setTip(e.target.value)} className={POLJE}>
            {Object.entries(TIPOVI_KOMITENTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Polje>
        <div className="flex gap-2">
          <button type="submit" disabled={slanje} className={DUGME.glavno}>{urediId ? 'Sačuvaj' : <><Ikona ime="plus" /> Dodaj</>}</button>
          {urediId && <button type="button" onClick={ocisti} className={DUGME.sporedno}>Odustani</button>}
        </div>
      </form>

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 tabular-nums">{podaci.komitenti.length} komitenata</p>
        <div className="relative w-64">
          <label htmlFor="k-pretraga" className="sr-only">Pretraži komitente</label>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Ikona ime="pretraga" /></span>
          <input id="k-pretraga" type="search" placeholder="Pretraži" value={pretraga} onChange={(e) => setPretraga(e.target.value)} className={`${POLJE} pl-9`} />
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-600 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-4 font-semibold">Naziv</th>
              <th className="py-2 pr-4 font-semibold">Grad</th>
              <th className="py-2 pr-4 font-semibold">Vrsta</th>
              <th className="py-2"><span className="sr-only">Akcije</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((k) => (
              <tr key={k.id} className={urediId === k.id ? 'bg-blue-50' : ''}>
                <td className="py-2.5 pr-4 font-medium text-slate-900">{k.naziv}</td>
                <td className="py-2.5 pr-4 text-slate-700">{k.grad || '—'}</td>
                <td className="py-2.5 pr-4 text-slate-700">{TIPOVI_KOMITENTA[k.tip] || k.tip}</td>
                <td className="py-2.5 text-right whitespace-nowrap space-x-4">
                  <button onClick={() => { setUrediId(k.id); setNaziv(k.naziv); setGrad(k.grad || ''); setTip(k.tip || 'Dobavljac'); }} className={DUGME.link}>Uredi</button>
                  <button
                    onClick={() => potvrdi({
                      naslov: `Obriši komitenta "${k.naziv}"?`,
                      tekst: 'Komitent se uklanja iz liste. Postojeći unosi u istoriji prometa ostaju.',
                      dugme: 'Obriši komitenta',
                      izvrsi: () => izvrsi(async () => {
                        const { error } = await supabase.from('komitenti').delete().eq('id', k.id);
                        return { ok: !error, poruka: error && `Komitent nije obrisan: ${error.message}` };
                      }, `Komitent "${k.naziv}" je obrisan.`),
                    })}
                    className={DUGME.linkOpasno}
                  >
                    Obriši
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={4} className="py-6 text-sm text-slate-600">{podaci.komitenti.length ? 'Nijedan komitent ne odgovara pretrazi.' : 'Još nema komitenata. Dodaj prvog iznad.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </Sekcija>
  );
}

// ================= Istorija prometa =================

function Istorija({ podaci, izvrsi, potvrdi }) {
  const [pretraga, setPretraga] = useState('');

  const q = pretraga.trim().toLowerCase();
  const lista = podaci.istorija.filter((l) => !q || `${l.artikal} ${l.korisnik || ''} ${TIPOVI_PROMETA[l.tip] || l.tip}`.toLowerCase().includes(q));
  const prikaz = lista.slice(0, 200);

  const obrisiStavku = (log) => {
    const otpremnica = log.tip === 'IZLAZ_OTPREMNICA';
    potvrdi({
      naslov: 'Obriši stavku iz istorije?',
      tekst: `${TIPOVI_PROMETA[log.tip] || log.tip}: ${log.artikal}, ${log.kolicina} kom, ${formatirajDatum(String(log.created_at).slice(0, 10))}. Stavka se trajno briše.`,
      sadrzaj: otpremnica ? <VratiNaStanje log={log} /> : null,
      dugme: 'Obriši stavku',
      izvrsi: () => izvrsi(async () => {
        const vratiKolicinu = otpremnica && document.getElementById('vrati-na-stanje')?.checked;
        if (vratiKolicinu) {
          const art = podaci.oprema.find((o) => o.naziv === log.artikal);
          if (art) {
            const { error } = await supabase.from('oprema').update({ kolicina: art.kolicina + log.kolicina }).eq('id', art.id);
            if (error) return { ok: false, poruka: `Količina nije vraćena: ${error.message}` };
          }
        }
        const { error } = await supabase.from('istorija').delete().eq('id', log.id);
        return { ok: !error, poruka: error && `Stavka nije obrisana: ${error.message}` };
      }, 'Stavka je obrisana iz istorije.'),
    });
  };

  const obrisiSve = () => {
    potvrdi({
      naslov: 'Obrisati kompletnu istoriju prometa?',
      tekst: `Briše se svih ${podaci.istorija.length} stavki (prijemi, otpremnice, rezervacije). Stanje zaliha se ne mijenja. Ovo se ne može poništiti.`,
      sadrzaj: <PotvrdaUnosom />,
      dugme: 'Obriši sve',
      izvrsi: () => {
        if (document.getElementById('potvrda-unos')?.value !== 'OBRIŠI') {
          return izvrsi(async () => ({ ok: false, poruka: 'Za brisanje cijele istorije upiši OBRIŠI velikim slovima.' }), '');
        }
        return izvrsi(async () => {
          const { error } = await supabase.from('istorija').delete().neq('id', 0);
          return { ok: !error, poruka: error && `Istorija nije obrisana: ${error.message}` };
        }, 'Kompletna istorija prometa je obrisana.');
      },
    });
  };

  return (
    <div className="space-y-6">
      <Sekcija
        naslov="Istorija prometa"
        opis="Brisanje pogrešnih unosa. Za otpremnicu možeš vratiti količinu na zalihe."
        akcija={
          <div className="relative w-64">
            <label htmlFor="i-pretraga" className="sr-only">Pretraži istoriju</label>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Ikona ime="pretraga" /></span>
            <input id="i-pretraga" type="search" placeholder="Artikal, korisnik, vrsta" value={pretraga} onChange={(e) => setPretraga(e.target.value)} className={`${POLJE} pl-9`} />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2 pr-4 font-semibold">Datum</th>
                <th className="py-2 pr-4 font-semibold">Vrsta</th>
                <th className="py-2 pr-4 font-semibold">Artikal</th>
                <th className="py-2 pr-4 font-semibold text-right">Količina</th>
                <th className="py-2 pr-4 font-semibold">Korisnik</th>
                <th className="py-2"><span className="sr-only">Akcije</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prikaz.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums text-slate-700">{formatirajDatum(String(l.created_at).slice(0, 10))}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-slate-700">{TIPOVI_PROMETA[l.tip] || l.tip}</td>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">{l.artikal}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{l.kolicina}</td>
                  <td className="py-2.5 pr-4 text-slate-700">{l.korisnik || '—'}</td>
                  <td className="py-2.5 text-right"><button onClick={() => obrisiStavku(l)} className={DUGME.linkOpasno}>Obriši</button></td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={6} className="py-6 text-sm text-slate-600">{podaci.istorija.length ? 'Nijedna stavka ne odgovara pretrazi.' : 'Istorija prometa je prazna.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {lista.length > prikaz.length && (
          <p className="mt-3 text-sm text-slate-600">Prikazano je prvih {prikaz.length} od {lista.length} stavki. Suzi pretragu da nađeš starije.</p>
        )}
      </Sekcija>

      <section className="border border-red-200 bg-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-red-800">Obriši kompletnu istoriju prometa</h2>
          <p className="mt-0.5 text-sm text-slate-700">Briše sve stavke istorije. Stanje zaliha ostaje kakvo jeste.</p>
        </div>
        <button onClick={obrisiSve} disabled={podaci.istorija.length === 0} className={DUGME.opasno}>Obriši cijelu istoriju</button>
      </section>
    </div>
  );
}

function VratiNaStanje({ log }) {
  return (
    <label className="mt-4 flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 cursor-pointer">
      <input id="vrati-na-stanje" type="checkbox" defaultChecked className="mt-0.5 w-4 h-4 accent-blue-600" />
      <span className="text-sm">
        <span className="block font-semibold text-slate-900">Vrati količinu na zalihe</span>
        <span className="block text-slate-700">Stanje artikla „{log.artikal}“ se povećava za {log.kolicina}.</span>
      </span>
    </label>
  );
}

function PotvrdaUnosom() {
  return (
    <div className="mt-4">
      <label htmlFor="potvrda-unos" className="block text-sm font-medium text-slate-800 mb-1">Za potvrdu upiši <strong>OBRIŠI</strong></label>
      <input id="potvrda-unos" autoComplete="off" className={POLJE} />
    </div>
  );
}

// ================= Praznici =================

function Praznici({ podaci, godina, izvrsi, potvrdi }) {
  const [prikazGodina, setPrikazGodina] = useState(godina);
  const [datum, setDatum] = useState('');
  const [naziv, setNaziv] = useState('');
  const [slanje, setSlanje] = useState(false);

  if (podaci.praznici === null) {
    return (
      <Sekcija naslov="Praznici">
        <p className="text-sm text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Tabela praznika ne postoji. Pokreni SQL "odsustvo.sql" u Supabase-u pa osvježi stranicu.</p>
      </Sekcija>
    );
  }

  const godine = [...new Set([godina, godina + 1, ...podaci.praznici.map((p) => Number(p.datum.slice(0, 4)))])].sort();
  const lista = podaci.praznici.filter((p) => p.datum.startsWith(String(prikazGodina)));

  const dodaj = async (e) => {
    e.preventDefault();
    setSlanje(true);
    const r = await izvrsi(() => pozoviApi('/api/odsustvo', 'POST', { akcija: 'praznik', datum, naziv }), `Praznik ${formatirajDatum(datum)} je sačuvan.`);
    setSlanje(false);
    if (r.ok) { setDatum(''); setNaziv(''); }
  };

  return (
    <Sekcija
      naslov="Praznici"
      opis="Neradni dani koji se ne računaju u slobodne dane. Dodaj i dodatne neradne dane koje odredi Vlada."
      akcija={
        <div className="flex items-center gap-1" role="group" aria-label="Godina">
          {godine.map((g) => (
            <button key={g} onClick={() => setPrikazGodina(g)} aria-pressed={prikazGodina === g} className={`px-3 py-1.5 rounded-lg text-sm font-semibold tabular-nums ${FOKUS} ${prikazGodina === g ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{g}</button>
          ))}
        </div>
      }
    >
      <form onSubmit={dodaj} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-4 items-end">
        <Polje id="pr-datum" label="Datum">
          <input id="pr-datum" type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} className={POLJE} />
        </Polje>
        <Polje id="pr-naziv" label="Naziv">
          <input id="pr-naziv" required maxLength={80} placeholder="npr. Dodatni neradni dan" value={naziv} onChange={(e) => setNaziv(e.target.value)} className={POLJE} />
        </Polje>
        <button type="submit" disabled={slanje} className={DUGME.glavno}><Ikona ime="plus" /> Dodaj</button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-600 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-4 font-semibold">Datum</th>
              <th className="py-2 pr-4 font-semibold">Dan</th>
              <th className="py-2 pr-4 font-semibold">Naziv</th>
              <th className="py-2"><span className="sr-only">Akcije</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((p) => {
              const d = danUSedmici(p.datum);
              return (
                <tr key={p.datum}>
                  <td className="py-2.5 pr-4 tabular-nums whitespace-nowrap text-slate-900">{formatirajDatum(p.datum)}</td>
                  <td className={`py-2.5 pr-4 ${d === 0 || d === 6 ? 'text-slate-500' : 'text-slate-700'}`}>{DANI[d]}</td>
                  <td className="py-2.5 pr-4 text-slate-900">{p.naziv}</td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => potvrdi({
                        naslov: `Ukloniti praznik ${formatirajDatum(p.datum)}?`,
                        tekst: `„${p.naziv}“ će se ubuduće računati kao radni dan. Već podnijeti zahtjevi se ne preračunavaju.`,
                        dugme: 'Ukloni praznik',
                        izvrsi: () => izvrsi(() => pozoviApi('/api/odsustvo', 'POST', { akcija: 'praznik_obrisi', datum: p.datum }), `Praznik ${formatirajDatum(p.datum)} je uklonjen.`),
                      })}
                      className={DUGME.linkOpasno}
                    >
                      Ukloni
                    </button>
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={4} className="py-6 text-sm text-slate-600">Za {prikazGodina}. nema upisanih praznika. Dodaj ih iznad.</td></tr>}
          </tbody>
        </table>
      </div>
    </Sekcija>
  );
}
