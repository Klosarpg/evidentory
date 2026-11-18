// Pravila i računanje slobodnih dana. Koristi se i u browseru i na serveru, da brojevi uvijek budu isti.
// Datumi su stringovi 'YYYY-MM-DD'; računamo u UTC da vremenska zona ne pomjera dane.

export const GODISNJA_KVOTA = 20;
export const ROK_PRENOSA = '06-30'; // neiskorišćeni dani iz prošle godine važe do 30. juna
export const MAKS_DANA_ZAHTJEVA = 90;
// Prva godina vođenja u aplikaciji: u nju se ne prenosi ništa automatski.
// Dane prenesene iz ranijih godina admin upisuje kao korekciju (polje "prenos").
export const POCETNA_GODINA = 2026; // najduži raspon jednog zahtjeva (kalendarskih dana)

export const TIPOVI = {
  godisnji: 'Godišnji odmor',
  neplaceno: 'Neplaćeno odsustvo',
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
  const dan = danUSedmici(s);
  if (dan === 0 || dan === 6) return { radni: false, razlog: 'vikend' };
  if (praznici?.has(s)) return { radni: false, razlog: 'praznik', naziv: praznici.get?.(s) };
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

// ---------- Stanje dana ----------

// Raspoređuje iskorišćene dane godišnjeg po godinama:
// dan do 30. juna prvo troši prenos iz prošle godine, zatim kvotu tekuće godine;
// neiskorišćen prenos propada poslije 30. juna, neiskorišćena kvota se prenosi u sljedeću godinu.
//
// odsustva: [{ tip, status, datum_od, datum_do }]   (računaju se odobrena; sa saNaCekanju i ona na čekanju)
// korekcije: [{ godina, dana, prenos }]  dana = iskorišćeno van aplikacije, prenos = dodatno prenesenih dana
// Vraća stanje za traženu godinu.
export function izracunajStanje({ odsustva = [], korekcije = [], praznici, slava, godina, danas, saNaCekanju = false }) {
  const statusi = saNaCekanju ? ['odobreno', 'na_cekanju'] : ['odobreno'];
  const daniPoGodini = {};
  for (const o of odsustva) {
    if (o.tip !== 'godisnji' || !statusi.includes(o.status)) continue;
    for (const d of radniDani(o.datum_od, o.datum_do, praznici, slava)) {
      const g = Number(d.slice(0, 4));
      (daniPoGodini[g] ||= []).push(d);
    }
  }
  const korekcijaPoGodini = {};
  const dodatniPrenos = {};
  for (const k of korekcije) {
    korekcijaPoGodini[k.godina] = (korekcijaPoGodini[k.godina] || 0) + Number(k.dana || 0);
    dodatniPrenos[k.godina] = (dodatniPrenos[k.godina] || 0) + Number(k.prenos || 0);
  }

  const godine = [...Object.keys(daniPoGodini), ...Object.keys(korekcijaPoGodini)].map(Number);
  const pocetna = Math.min(POCETNA_GODINA, godina, ...godine);
  const krajnja = Math.max(godina, ...godine);

  let prenos = 0;
  let rezultat = null;
  let prekoracenje = 0;

  for (let g = pocetna; g <= krajnja; g++) {
    let kvotaOstalo = GODISNJA_KVOTA;
    if (g <= POCETNA_GODINA) prenos = 0; // prije i u prvoj godini nema automatskog prenosa
    prenos += dodatniPrenos[g] || 0;
    let prenosOstalo = prenos;
    const prenosUlaz = prenos;
    const rok = `${g}-${ROK_PRENOSA}`;
    let iskoristenoPrenos = 0;
    let iskoristenoKvota = 0;
    let prekoracenjeGodine = 0;

    // Korekcija = dani već iskorišćeni van aplikacije; troše prvo prenos.
    let korekcija = korekcijaPoGodini[g] || 0;
    const izPrenosa = Math.min(korekcija, prenosOstalo);
    prenosOstalo -= izPrenosa;
    iskoristenoPrenos += izPrenosa;
    korekcija -= izPrenosa;
    const izKvote = Math.min(korekcija, kvotaOstalo);
    kvotaOstalo -= izKvote;
    iskoristenoKvota += izKvote;
    prekoracenjeGodine += korekcija - izKvote;

    for (const d of (daniPoGodini[g] || []).sort()) {
      if (d <= rok && prenosOstalo > 0) {
        prenosOstalo--;
        iskoristenoPrenos++;
      } else if (kvotaOstalo > 0) {
        kvotaOstalo--;
        iskoristenoKvota++;
      } else {
        prekoracenjeGodine++;
      }
    }

    prekoracenje += prekoracenjeGodine;
    if (g === godina) {
      const prenosAktivan = (danas || '') <= rok;
      rezultat = {
        godina: g,
        kvota: GODISNJA_KVOTA,
        prenos: prenosUlaz,
        prenosPreostalo: prenosAktivan ? prenosOstalo : 0,
        prenosIsteklo: prenosAktivan ? 0 : prenosOstalo,
        rokPrenosa: rok,
        kvotaPreostalo: kvotaOstalo,
        iskoristeno: iskoristenoPrenos + iskoristenoKvota,
        preostalo: kvotaOstalo + (prenosAktivan ? prenosOstalo : 0),
        prekoracenje: prekoracenjeGodine,
      };
    }
    prenos = kvotaOstalo; // ostatak kvote prelazi u sljedeću godinu (važi do 30. juna)
  }

  return { ...rezultat, ukupnoPrekoracenje: prekoracenje };
}

// Puno stanje za prikaz: odobreno + koliko je na čekanju + koliko je još slobodno za nove zahtjeve.
export function stanjeKorisnika({ odsustva, korekcije, praznici, slava, godina, danas }) {
  const odobreno = izracunajStanje({ odsustva, korekcije, praznici, slava, godina, danas });
  const saCekanjem = izracunajStanje({ odsustva, korekcije, praznici, slava, godina, danas, saNaCekanju: true });
  const naCekanju = odsustva
    .filter((o) => o.tip === 'godisnji' && o.status === 'na_cekanju')
    .reduce((zbir, o) => zbir + radniDani(o.datum_od, o.datum_do, praznici, slava).filter((d) => d.startsWith(String(godina))).length, 0);
  return {
    ...odobreno,
    naCekanju,
    dostupno: Math.max(0, saCekanjem.preostalo),
  };
}

// Da li se zahtjev može podnijeti/odobriti bez prekoračenja. postojeca = odobrena + na čekanju (bez ovog zahtjeva).
export function provjeriKvotu({ postojeca, novi, korekcije, praznici, slava, danas }) {
  const prije = izracunajStanje({ odsustva: postojeca, korekcije, praznici, slava, godina: Number(novi.datum_do.slice(0, 4)), danas, saNaCekanju: true });
  const poslije = izracunajStanje({
    odsustva: [...postojeca, { ...novi, status: 'na_cekanju' }],
    korekcije, praznici, slava, godina: Number(novi.datum_do.slice(0, 4)), danas, saNaCekanju: true,
  });
  const novoPrekoracenje = poslije.ukupnoPrekoracenje - prije.ukupnoPrekoracenje;
  return { ok: novoPrekoracenje <= 0, fali: Math.max(0, novoPrekoracenje) };
}

export function seKlapaju(a, b) {
  return a.datum_od <= b.datum_do && b.datum_od <= a.datum_do;
}
