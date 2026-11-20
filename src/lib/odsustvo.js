// Pravila i računanje slobodnih dana. Koristi se i u browseru i na serveru, da brojevi uvijek budu isti.
// Datumi su stringovi 'YYYY-MM-DD'; računamo u UTC da vremenska zona ne pomjera dane.

export const GODISNJA_KVOTA = 20;
// Godišnji odmor ide po kalendarskoj godini: svakog 1. januara 20 novih dana.
// Neiskorišćeni dani iz prethodne godine mogu se koristiti do 30. juna i troše se PRVI.
export const POCETAK_PERIODA = '01-01';
export const KRAJ_PERIODA = '06-30'; // do kada važe preneseni dani iz prethodne godine
// Prva godina koju aplikacija vodi. Za ranije godine nema dana (pa ni prenosa), osim ako admin upiše korekciju za tu godinu.
export const PRVA_GODINA = 2026;
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

// Period = kalendarska godina. Dani godine 2026 važe od 1. 1. 2026. do 30. 6. 2027.
export function periodZaDatum(datum) {
  return Number(datum.slice(0, 4));
}

export function granicePerioda(period) {
  return { od: `${period}-${POCETAK_PERIODA}`, do: `${period + 1}-${KRAJ_PERIODA}` };
}

// "2026."
export function nazivPerioda(period) {
  return `${period}.`;
}

// Raspoređuje dane odmora po godinama kojima pripadaju. Svaki radni dan odmora (redom po datumu) troši:
//  1) preostale dane prethodne godine, ako je dan najkasnije 30. juna,
//  2) inače dane svoje godine,
//  3) ako ni toga nema, to je prekoračenje te godine.
// korekcije: [{ godina, dana, prenos }]; dana = umanjenje (iskorišćeno van aplikacije ili srazmjerno ugovoru) i troši
//   dane te godine; prenos = dodatni dani preko 20 te godine (kolona se zove "prenos" iz ranije verzije, sada znači "dodatno").
function rasporedi({ odsustva, korekcije, praznici, slava, saNaCekanju }) {
  const statusi = saNaCekanju ? ['odobreno', 'na_cekanju'] : ['odobreno'];
  const dani = [];
  for (const o of odsustva) {
    if (o.tip !== 'godisnji' || !statusi.includes(o.status)) continue;
    dani.push(...radniDani(o.datum_od, o.datum_do, praznici, slava));
  }
  dani.sort();

  const umanjenje = {};
  const dodatno = {};
  for (const k of korekcije) {
    umanjenje[k.godina] = (umanjenje[k.godina] || 0) + Number(k.dana || 0);
    dodatno[k.godina] = (dodatno[k.godina] || 0) + Number(k.prenos || 0);
  }
  const imaKorekciju = new Set(korekcije.map((k) => Number(k.godina)));
  const kvota = (g) => (g >= PRVA_GODINA || imaKorekciju.has(g) ? GODISNJA_KVOTA + (dodatno[g] || 0) : 0);

  const preostalo = {}; // godina → koliko je još ostalo
  const potroseno = {}; // godina → dana odmora iz aplikacije koji su potrošili tu godinu
  const prekoracenje = {}; // godina (datuma odmora) → dana bez pokrića
  const ostalo = (g) => {
    if (!(g in preostalo)) preostalo[g] = kvota(g) - (umanjenje[g] || 0);
    return preostalo[g];
  };

  for (const d of dani) {
    const g = periodZaDatum(d);
    if (d.slice(5) <= KRAJ_PERIODA && ostalo(g - 1) > 0) {
      preostalo[g - 1]--;
      potroseno[g - 1] = (potroseno[g - 1] || 0) + 1;
    } else if (ostalo(g) > 0) {
      preostalo[g]--;
      potroseno[g] = (potroseno[g] || 0) + 1;
    } else {
      prekoracenje[g] = (prekoracenje[g] || 0) + 1;
    }
  }

  const godine = new Set([...Object.keys(umanjenje), ...Object.keys(preostalo)].map(Number));
  let ukupnoPrekoracenje = Object.values(prekoracenje).reduce((a, b) => a + b, 0);
  for (const g of godine) ukupnoPrekoracenje += Math.max(0, -ostalo(g)); // umanjenje veće od kvote

  return { kvota, umanjenje, dodatno, ostalo, potroseno, prekoracenje, ukupnoPrekoracenje };
}

// Stanje godišnjeg za jednu godinu (period).
// odsustva: [{ tip, status, datum_od, datum_do }]  (računaju se odobrena; sa saNaCekanju i ona na čekanju)
// danas: ako je zadat i najkasnije 30. jun, preostali dani prethodne godine se prikazuju kao "preneseno".
// ukupnoPrekoracenje sabira prekoračenja u svim godinama (za provjeru zahtjeva).
export function izracunajStanje({ odsustva = [], korekcije = [], praznici, slava, period, saNaCekanju = false, danas = null }) {
  const r = rasporedi({ odsustva, korekcije, praznici, slava, saNaCekanju });
  const g = granicePerioda(period);
  const ove = Math.max(0, r.ostalo(period));
  const prenosVazi = Boolean(danas) && danas <= `${period}-${KRAJ_PERIODA}`;
  const preneseno = prenosVazi ? Math.max(0, r.ostalo(period - 1)) : 0;
  return {
    period,
    kvota: r.kvota(period),
    dodatno: r.dodatno[period] || 0,
    umanjenje: r.umanjenje[period] || 0,
    iskoristeno: (r.potroseno[period] || 0) + (r.umanjenje[period] || 0),
    preostaloOveGodine: ove,
    preneseno, // preostali dani prethodne godine koji još važe
    prenosIstice: `${period}-${KRAJ_PERIODA}`,
    preostalo: ove + preneseno,
    prekoracenje: (r.prekoracenje[period] || 0) + Math.max(0, -r.ostalo(period)),
    pocetak: g.od,
    istice: g.do,
    ukupnoPrekoracenje: r.ukupnoPrekoracenje,
  };
}

// Puno stanje za prikaz: odobreno + koliko je na čekanju + koliko je još slobodno za nove zahtjeve.
// danas: podrazumijevano današnji datum u Crnoj Gori (za preneseni dio do 30. juna).
export function stanjeKorisnika({ odsustva, korekcije, praznici, slava, period, danas = danasUCrnojGori() }) {
  const odobreno = izracunajStanje({ odsustva, korekcije, praznici, slava, period, danas });
  const saCekanjem = izracunajStanje({ odsustva, korekcije, praznici, slava, period, danas, saNaCekanju: true });
  return {
    ...odobreno,
    naCekanju: odobreno.preostalo - saCekanjem.preostalo,
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
