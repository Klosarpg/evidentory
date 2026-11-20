// Pravila i računanje slobodnih dana. Koristi se i u browseru i na serveru, da brojevi uvijek budu isti.
// Datumi su stringovi 'YYYY-MM-DD'; računamo u UTC da vremenska zona ne pomjera dane.

export const GODISNJA_KVOTA = 20;
// Period godišnjeg odmora: od 1. jula do 30. juna. Svakog 1. jula 20 novih dana; neiskorišćeni ističu 30. juna.
export const POCETAK_PERIODA = '07-01';
export const KRAJ_PERIODA = '06-30';
export const MAKS_DANA_ZAHTJEVA = 90; // najduži raspon jednog zahtjeva (kalendarskih dana)

export const TIPOVI = {
  godisnji: 'Godišnji odmor',
  neplaceno: 'Plaćeno odsustvo', // interni ključ ostaje 'neplaceno' zbog postojećih podataka
};

export const STATUSI = {
  na_cekanju: 'Na čekanju',
  odobreno: 'Odobreno',
  odbijeno: 'Odbijeno',
  otkazano: 'Otkazano',
};

// Najčešće slave (fiksni datumi po novom kalendaru). Ostale se biraju ručno.
export const SLAVE = [
  { datum: '01-20', naziv: 'Sveti Jovan (Jovanjdan)' },
  { datum: '01-27', naziv: 'Sveti Sava' },
  { datum: '05-06', naziv: 'Đurđevdan' },
  { datum: '05-22', naziv: 'Sveti Nikola (Letnji)' },
  { datum: '07-12', naziv: 'Petrovdan' },
  { datum: '08-02', naziv: 'Ilindan' },
  { datum: '08-28', naziv: 'Velika Gospojina' },
  { datum: '09-21', naziv: 'Mala Gospojina' },
  { datum: '10-27', naziv: 'Sveta Petka' },
  { datum: '10-31', naziv: 'Sveti Luka' },
  { datum: '11-08', naziv: 'Mitrovdan' },
  { datum: '11-16', naziv: 'Đurđic' },
  { datum: '11-21', naziv: 'Aranđelovdan' },
  { datum: '12-19', naziv: 'Sveti Nikola (Nikoljdan)' },
];

const MJESECI = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
export const NAZIVI_MJESECI = MJESECI;

// ---------- Datumi ----------

export function danasUCrnojGori() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Podgorica' }).format(new Date());
}

export function jeIspravanDatum(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function dodajDane(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function razlikaDana(od, doDatuma) {
  return Math.round((new Date(`${doDatuma}T00:00:00Z`) - new Date(`${od}T00:00:00Z`)) / 86400000);
}

// 0 = nedjelja … 6 = subota
export function danUSedmici(s) {
  return new Date(`${s}T00:00:00Z`).getUTCDay();
}

export function formatirajDatum(s) {
  if (!s) return '';
  const [g, m, d] = s.split('-');
  return `${Number(d)}. ${Number(m)}. ${g}.`;
}

// 1 radni dan, 2–4 radna dana, 5+ radnih dana
export function radnihDanaTekst(n) {
  const j = n % 10;
  const d = n % 100;
  if (j === 1 && d !== 11) return `${n} radni dan`;
  if (j >= 2 && j <= 4 && (d < 12 || d > 14)) return `${n} radna dana`;
  return `${n} radnih dana`;
}

export function formatirajSlavu(mmdd) {
  if (!mmdd) return '';
  const [m, d] = mmdd.split('-').map(Number);
  return `${d}. ${MJESECI[m - 1]}`;
}

// ---------- Radni dani ----------

// praznici: Map datum → naziv (ili Set datuma); slava: 'MM-DD' ili null
export function vrstaDana(s, praznici, slava) {
  // Praznik ima prednost u prikazu, i kad padne na vikend (npr. Vaskrs je uvijek nedjelja).
  if (praznici?.has(s)) return { radni: false, razlog: 'praznik', naziv: praznici.get?.(s) };
  const dan = danUSedmici(s);
  if (dan === 0 || dan === 6) return { radni: false, razlog: 'vikend' };
  if (slava && s.slice(5) === slava) return { radni: false, razlog: 'slava' };
  return { radni: true };
}

export function radniDani(od, doDatuma, praznici, slava) {
  const dani = [];
  for (let s = od; s <= doDatuma; s = dodajDane(s, 1)) {
    if (vrstaDana(s, praznici, slava).radni) dani.push(s);
  }
  return dani;
}

// ---------- Period i stanje dana ----------

// Period se označava godinom u kojoj počinje: period 2026 = 1. 7. 2026 – 30. 6. 2027.
export function periodZaDatum(datum) {
  const g = Number(datum.slice(0, 4));
  return datum.slice(5) >= POCETAK_PERIODA ? g : g - 1;
}

export function granicePerioda(period) {
  return { od: `${period}-${POCETAK_PERIODA}`, do: `${period + 1}-${KRAJ_PERIODA}` };
}

// "2026/27"
export function nazivPerioda(period) {
  return `${period}/${String(period + 1).slice(2)}`;
}

// Stanje godišnjeg za jedan period (bez prenosa: svaki period ima svojih 20 dana).
// odsustva: [{ tip, status, datum_od, datum_do }]  (računaju se odobrena; sa saNaCekanju i ona na čekanju)
// korekcije: [{ godina, dana, prenos }]  godina = period; dana = umanjenje (iskorišćeno van aplikacije ili srazmjerno ugovoru);
//   prenos = dodatni dani preko 20 u tom periodu (kolona se zove "prenos" iz ranije verzije, sada znači "dodatno").
// period: godina početka perioda. ukupnoPrekoracenje sabira prekoračenja u svim periodima (za provjeru zahtjeva).
export function izracunajStanje({ odsustva = [], korekcije = [], praznici, slava, period, saNaCekanju = false }) {
  const statusi = saNaCekanju ? ['odobreno', 'na_cekanju'] : ['odobreno'];
  const daniPoPeriodu = {};
  for (const o of odsustva) {
    if (o.tip !== 'godisnji' || !statusi.includes(o.status)) continue;
    for (const d of radniDani(o.datum_od, o.datum_do, praznici, slava)) {
      const p = periodZaDatum(d);
      daniPoPeriodu[p] = (daniPoPeriodu[p] || 0) + 1;
    }
  }
  const umanjenje = {};
  const dodatno = {};
  for (const k of korekcije) {
    umanjenje[k.godina] = (umanjenje[k.godina] || 0) + Number(k.dana || 0);
    dodatno[k.godina] = (dodatno[k.godina] || 0) + Number(k.prenos || 0);
  }
  const kvotaPerioda = (p) => GODISNJA_KVOTA + (dodatno[p] || 0);

  const stanjePerioda = (p) => {
    const iskoristeno = (daniPoPeriodu[p] || 0) + (umanjenje[p] || 0);
    const kvota = kvotaPerioda(p);
    return { iskoristeno, preostalo: Math.max(0, kvota - iskoristeno), prekoracenje: Math.max(0, iskoristeno - kvota) };
  };

  const periodi = new Set([period, ...Object.keys(daniPoPeriodu).map(Number), ...Object.keys(umanjenje).map(Number)]);
  let ukupnoPrekoracenje = 0;
  for (const p of periodi) ukupnoPrekoracenje += stanjePerioda(p).prekoracenje;

  const s = stanjePerioda(period);
  const g = granicePerioda(period);
  return {
    period,
    kvota: kvotaPerioda(period),
    dodatno: dodatno[period] || 0,
    umanjenje: umanjenje[period] || 0,
    iskoristeno: s.iskoristeno,
    preostalo: s.preostalo,
    prekoracenje: s.prekoracenje,
    pocetak: g.od,
    istice: g.do,
    ukupnoPrekoracenje,
  };
}

// Puno stanje za prikaz: odobreno + koliko je na čekanju + koliko je još slobodno za nove zahtjeve.
export function stanjeKorisnika({ odsustva, korekcije, praznici, slava, period }) {
  const odobreno = izracunajStanje({ odsustva, korekcije, praznici, slava, period });
  const saCekanjem = izracunajStanje({ odsustva, korekcije, praznici, slava, period, saNaCekanju: true });
  return {
    ...odobreno,
    naCekanju: saCekanjem.iskoristeno - odobreno.iskoristeno,
    dostupno: saCekanjem.preostalo,
  };
}

// Da li se zahtjev može podnijeti/odobriti bez prekoračenja. postojeca = odobrena + na čekanju (bez ovog zahtjeva).
export function provjeriKvotu({ postojeca, novi, korekcije, praznici, slava }) {
  const period = periodZaDatum(novi.datum_od);
  const prije = izracunajStanje({ odsustva: postojeca, korekcije, praznici, slava, period, saNaCekanju: true });
  const poslije = izracunajStanje({
    odsustva: [...postojeca, { ...novi, status: 'na_cekanju' }],
    korekcije, praznici, slava, period, saNaCekanju: true,
  });
  const novoPrekoracenje = poslije.ukupnoPrekoracenje - prije.ukupnoPrekoracenje;
  return { ok: novoPrekoracenje <= 0, fali: Math.max(0, novoPrekoracenje) };
}

export function seKlapaju(a, b) {
  return a.datum_od <= b.datum_do && b.datum_od <= a.datum_do;
}
