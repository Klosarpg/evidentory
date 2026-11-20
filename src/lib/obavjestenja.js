import { posaljiEmail, problemSaPodesavanjem } from '@/lib/email';
import { napraviRjesenje, nazivFajlaRjesenja } from '@/lib/rjesenje';
import { GODISNJA_KVOTA, TIPOVI, formatirajDatum, formatirajSlavu, periodZaDatum, granicePerioda, nazivPerioda } from '@/lib/odsustvo';
import { ucitajSlikeFirme, ucitajJmbg } from '@/lib/slikeFirme';

// Ko dobija koji email za slobodne dane.
// obavijesti* funkcije rade u dva koraka, da korisnik ne čeka Gmail:
//   1) odmah: nađu primaoce i vrate { upozorenja, posalji }  (upozorenja = ono što se zna unaprijed)
//   2) posalji() se zove poslije odgovora (after), šalje emailove i vraća upozorenja o slanju za log.

function pripremi(upozorenja, poslovi) {
  const problem = problemSaPodesavanjem();
  if (problem && poslovi.length) upozorenja.push(problem);
  return {
    upozorenja,
    posalji: async () => {
      if (problem) return [];
      const rezultati = await Promise.all(poslovi.map((p) => p()));
      return rezultati.flat();
    },
  };
}

export function adresaAplikacije(request) {
  const izZahtjeva = request?.headers.get('origin');
  if (izZahtjeva) return izZahtjeva;
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

// Emailovi svih korisnika čija uloga ima datu dozvolu.
export async function emailoviSaDozvolom(supabase, dozvola, osimId) {
  const { data: uloge } = await supabase.from('uloge').select('naziv').contains('dozvole', [dozvola]);
  const nazivi = (uloge || []).map((u) => u.naziv);
  if (nazivi.length === 0) return [];
  const { data: profili } = await supabase.from('profili').select('id, kontakt_email').in('uloga', nazivi);
  return (profili || []).filter((p) => p.kontakt_email && p.id !== osimId).map((p) => p.kontakt_email);
}

async function emailKorisnika(supabase, id) {
  const { data } = await supabase.from('profili').select('kontakt_email').eq('id', id).maybeSingle();
  return data?.kontakt_email || null;
}

// U emailovima se umjesto korisničkog imena piše ime i prezime (ako je upisano u Administraciji).
async function saPunimImenima(supabase, z) {
  const idovi = [z.korisnik_id, z.obradio_id].filter(Boolean);
  if (idovi.length === 0) return z;
  const { data } = await supabase.from('profili').select('id, ime_prezime').in('id', idovi);
  const ime = (id, rezerva) => (data || []).find((p) => p.id === id)?.ime_prezime || rezerva;
  return { ...z, korisnik_ime: ime(z.korisnik_id, z.korisnik_ime), obradio_ime: ime(z.obradio_id, z.obradio_ime) };
}

const period = (z) => (z.datum_od === z.datum_do
  ? formatirajDatum(z.datum_od)
  : `${formatirajDatum(z.datum_od)} – ${formatirajDatum(z.datum_do)}`);

function detalji(z) {
  return [
    ['Zaposleni', z.korisnik_ime],
    ['Vrsta', TIPOVI[z.tip]],
    ['Period', period(z)],
    ['Radnih dana', String(z.radnih_dana)],
    ...(z.napomena ? [['Napomena', z.napomena]] : []),
  ];
}

const upozorenje = (rezultat, kome) => (rezultat.ok ? [] : [`${kome}: ${rezultat.greska}`]);

// Novi zahtjev → svi odobravači.
export async function obavijestiNoviZahtjev(supabase, zahtjevIzBaze, adresa, { manjak = 0 } = {}) {
  const zahtjev = await saPunimImenima(supabase, zahtjevIzBaze);
  const prima = await emailoviSaDozvolom(supabase, 'odsustvo_odobravanje', zahtjev.korisnik_id);
  if (prima.length === 0) {
    return pripremi(['Nema drugog odobravača sa upisanim emailom (podnosilac zahtjeva ne dobija obavještenje o sopstvenom zahtjevu), pa obavještenje nije poslato.'], []);
  }
  return pripremi([], [async () => upozorenje(await posaljiEmail({
    prima,
    naslov: `Novi zahtjev za slobodne dane: ${zahtjev.korisnik_ime}`,
    sadrzaj: {
      naslov: 'Novi zahtjev čeka odobrenje',
      uvod: manjak > 0
        ? `${zahtjev.korisnik_ime} traži ${zahtjev.radnih_dana} radnih dana, a slobodno ima ${zahtjev.radnih_dana - manjak}. Zahtjev svejedno možeš odobriti.`
        : `${zahtjev.korisnik_ime} traži slobodne dane.`,
      redovi: [...detalji(zahtjev), ...(manjak > 0 ? [['Slobodno ima', `${zahtjev.radnih_dana - manjak} (fali ${manjak})`]] : [])],
      dugme: { tekst: 'Otvori zahtjeve na odobravanju', adresa: `${adresa}/odsustvo` },
    },
  }), 'Odobravači')]);
}

// Odobreno / odbijeno → korisnik; odobren godišnji → i rješenje (korisniku i za štampu).
export async function obavijestiObradjen(supabase, zahtjevIzBaze, adresa, { rjesenje } = {}) {
  const zahtjev = await saPunimImenima(supabase, zahtjevIzBaze);
  const upozorenja = [];
  const poslovi = [];
  const odobreno = zahtjev.status === 'odobreno';
  const emailZaposlenog = await emailKorisnika(supabase, zahtjev.korisnik_id);
  const prilozi = rjesenje ? [{ filename: rjesenje.naziv, content: rjesenje.pdf, contentType: 'application/pdf' }] : [];

  const redovi = [
    ...detalji(zahtjev),
    ['Obradio', zahtjev.obradio_ime || ''],
    ...(zahtjev.komentar ? [['Komentar', zahtjev.komentar]] : []),
  ];

  if (emailZaposlenog) {
    poslovi.push(async () => upozorenje(await posaljiEmail({
      prima: emailZaposlenog,
      naslov: odobreno ? `Slobodni dani su odobreni (${period(zahtjev)})` : `Zahtjev za slobodne dane je odbijen (${period(zahtjev)})`,
      sadrzaj: {
        naslov: odobreno ? 'Zahtjev je odobren' : 'Zahtjev je odbijen',
        uvod: odobreno
          ? `Tvoj zahtjev za ${TIPOVI[zahtjev.tip].toLowerCase()} je odobren.${rjesenje ? ' Rješenje je u prilogu, za tvoju evidenciju.' : ''}`
          : 'Tvoj zahtjev za slobodne dane je odbijen.',
        redovi,
        dugme: { tekst: 'Otvori slobodne dane', adresa: `${adresa}/odsustvo` },
      },
      prilozi,
    }), 'Zaposleni'));
  } else {
    upozorenja.push(`${zahtjev.korisnik_ime} nema upisan email, pa nije obaviješten.`);
  }

  if (odobreno && rjesenje) {
    const zaStampu = await emailoviSaDozvolom(supabase, 'odsustvo_dokument');
    if (zaStampu.length === 0) {
      upozorenja.push('Niko nema dozvolu "Prima dokument za štampu" sa upisanim emailom, pa rješenje nije poslato na štampu.');
    } else {
      poslovi.push(async () => upozorenje(await posaljiEmail({
        prima: zaStampu,
        naslov: `Rješenje za štampu: ${zahtjev.korisnik_ime}, ${period(zahtjev)}`,
        sadrzaj: {
          naslov: 'Rješenje o godišnjem odmoru za štampu',
          uvod: rjesenje.imaPecat
            ? `U prilogu je rješenje br. ${rjesenje.broj}, sa pečatom i potpisom. Odštampaj ga za dosije.`
            : `U prilogu je rješenje br. ${rjesenje.broj}. Odštampaj ga, potpiši i ovjeri pečatom.`,
          redovi,
        },
        prilozi,
      }), 'Dokument za štampu'));
    }
  }
  return pripremi(upozorenja, poslovi);
}

// Odobravač otkazao već odobren zahtjev → korisnik i oni koji primaju dokument (da ponište rješenje).
export async function obavijestiOtkazanOdobren(supabase, zahtjevIzBaze) {
  const zahtjev = await saPunimImenima(supabase, zahtjevIzBaze);
  const prima = [await emailKorisnika(supabase, zahtjev.korisnik_id), ...(await emailoviSaDozvolom(supabase, 'odsustvo_dokument'))].filter(Boolean);
  return pripremi([], prima.length ? [async () => upozorenje(await posaljiEmail({
    prima,
    naslov: `Odobreni slobodni dani su otkazani: ${zahtjev.korisnik_ime}, ${period(zahtjev)}`,
    sadrzaj: {
      naslov: 'Odobreni slobodni dani su otkazani',
      uvod: `${zahtjev.obradio_ime} je otkazao/la odobreni zahtjev.${zahtjev.broj_rjesenja ? ` Rješenje br. ${zahtjev.broj_rjesenja} više ne važi.` : ''}`,
      redovi: detalji(zahtjev),
    },
  }), 'Otkazivanje')] : []);
}

// Rješenje za odobren godišnji: broj, redni dio u godini i PDF.
export async function pripremiRjesenje(supabase, zahtjev, datum) {
  const { data: profil } = await supabase
    .from('profili').select('*').eq('id', zahtjev.korisnik_id).maybeSingle();

  let broj = zahtjev.broj_rjesenja;
  if (!broj) {
    const { count } = await supabase.from('odsustva').select('id', { count: 'exact', head: true })
      .eq('datum_rjesenja', datum).not('broj_rjesenja', 'is', null);
    const [g, m, d] = datum.split('-');
    broj = count > 0 ? `${d}${m}-${count + 1}/${g}` : `${d}${m}/${g}`;
  }
  const datumRjesenja = zahtjev.datum_rjesenja || datum;

  const periodZahtjeva = periodZaDatum(zahtjev.datum_od);
  const g = granicePerioda(periodZahtjeva);
  // Pravo na godišnji u tom periodu: 20 + dodatni dani iz korekcije (ako ih je admin upisao).
  const { data: korekcija } = await supabase.from('odsustvo_korekcije').select('prenos')
    .eq('korisnik_id', zahtjev.korisnik_id).eq('godina', periodZahtjeva).maybeSingle();
  const pravo = GODISNJA_KVOTA + Number(korekcija?.prenos || 0);
  const { data: raniji } = await supabase.from('odsustva').select('id, datum_od')
    .eq('korisnik_id', zahtjev.korisnik_id).eq('tip', 'godisnji').eq('status', 'odobreno')
    .gte('datum_od', g.od).lte('datum_od', g.do);
  const redni = (raniji || []).filter((o) => o.id !== zahtjev.id && o.datum_od < zahtjev.datum_od).length + 1;

  const [jmbg, slike] = await Promise.all([
    ucitajJmbg(supabase, zahtjev.korisnik_id),
    ucitajSlikeFirme(supabase).catch((e) => { console.warn('Pečat/potpis nisu učitani:', e.message); return {}; }),
  ]);
  const pdf = napraviRjesenje({ zahtjev, profil: profil || {}, broj, datum: datumRjesenja, redni, jmbg, slike, pravo });
  return { broj, datum: datumRjesenja, pdf, naziv: nazivFajlaRjesenja(zahtjev, broj), nedostajuPodaci: !profil?.ime_prezime || !profil?.radno_mjesto, imaPecat: Boolean(slike.pecat && slike.potpis) };
}

// Podsjetnik za slavu (5 dana ranije).
export async function podsjetnikSlava(korisnik, datumSlave, adresa) {
  const r = await posaljiEmail({
    prima: korisnik.kontakt_email,
    naslov: `Podsjetnik: ${formatirajDatum(datumSlave)} si slobodan/na za slavu`,
    sadrzaj: {
      naslov: 'Ne zaboravi: slobodan dan za slavu',
      uvod: `Za 5 dana, ${formatirajDatum(datumSlave)}, je tvoja slava${korisnik.slava_naziv ? ` (${korisnik.slava_naziv})` : ''}. Taj dan si slobodan/na i ne troši se godišnji odmor.`,
      napomena: `Slava upisana u aplikaciji: ${formatirajSlavu(korisnik.slava_datum)}.`,
      dugme: { tekst: 'Otvori slobodne dane', adresa: `${adresa}/odsustvo` },
    },
  });
  return upozorenje(r, korisnik.kontakt_email);
}

// Podsjetnik 30. decembra, 6 mjeseci prije isteka (30. juna sledeće godine): neiskorišćeni dani tada propadaju.
export async function podsjetnikPrenos(korisnik, stanje, adresa) {
  const r = await posaljiEmail({
    prima: korisnik.kontakt_email,
    naslov: `Imaš ${stanje.preostalo} neiskorišćenih dana godišnjeg koji ističu ${formatirajDatum(stanje.istice)}`,
    sadrzaj: {
      naslov: 'Iskoristi preostale slobodne dane',
      uvod: `Od godišnjeg odmora za ${nazivPerioda(stanje.period)} godinu ostalo ti je ${stanje.preostalo} dana. Možeš ih koristiti do ${formatirajDatum(stanje.istice)} i troše se prije novih ${GODISNJA_KVOTA} koje dobijaš 1. januara. Poslije toga propadaju.`,
      redovi: [
        ['Preostalo', String(stanje.preostalo)],
        ['Iskorišćeno', `${stanje.iskoristeno} od ${stanje.kvota}`],
        ['Važi do', formatirajDatum(stanje.istice)],
      ],
      dugme: { tekst: 'Zatraži slobodne dane', adresa: `${adresa}/odsustvo` },
    },
  });
  return upozorenje(r, korisnik.kontakt_email);
}
