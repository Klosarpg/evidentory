import { posaljiEmail } from '@/lib/email';
import { napraviRjesenje, nazivFajlaRjesenja } from '@/lib/rjesenje';
import { TIPOVI, formatirajDatum, formatirajSlavu } from '@/lib/odsustvo';

// Ko dobija koji email za slobodne dane. Sve funkcije vraćaju listu upozorenja (prazna = sve poslato).

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
export async function obavijestiNoviZahtjev(supabase, zahtjev, adresa) {
  const prima = await emailoviSaDozvolom(supabase, 'odsustvo_odobravanje', zahtjev.korisnik_id);
  if (prima.length === 0) {
    return ['Nema drugog odobravača sa upisanim emailom (podnosilac zahtjeva ne dobija obavještenje o sopstvenom zahtjevu), pa obavještenje nije poslato.'];
  }
  const r = await posaljiEmail({
    prima,
    naslov: `Novi zahtjev za slobodne dane: ${zahtjev.korisnik_ime}`,
    sadrzaj: {
      naslov: 'Novi zahtjev čeka odobrenje',
      uvod: `${zahtjev.korisnik_ime} traži slobodne dane.`,
      redovi: detalji(zahtjev),
      dugme: { tekst: 'Otvori zahtjeve na odobravanju', adresa: `${adresa}/odsustvo` },
    },
  });
  return upozorenje(r, 'Odobravači');
}

// Odobreno / odbijeno → korisnik; odobren godišnji → i rješenje (korisniku i za štampu).
export async function obavijestiObradjen(supabase, zahtjev, adresa, { rjesenje } = {}) {
  const upozorenja = [];
  const odobreno = zahtjev.status === 'odobreno';
  const emailZaposlenog = await emailKorisnika(supabase, zahtjev.korisnik_id);
  const prilozi = rjesenje ? [{ filename: rjesenje.naziv, content: rjesenje.pdf, contentType: 'application/pdf' }] : [];

  const redovi = [
    ...detalji(zahtjev),
    ['Obradio', zahtjev.obradio_ime || ''],
    ...(zahtjev.komentar ? [['Komentar', zahtjev.komentar]] : []),
  ];

  if (emailZaposlenog) {
    const r = await posaljiEmail({
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
    });
    upozorenja.push(...upozorenje(r, 'Zaposleni'));
  } else {
    upozorenja.push(`${zahtjev.korisnik_ime} nema upisan email, pa nije obaviješten.`);
  }

  if (odobreno && rjesenje) {
    const zaStampu = await emailoviSaDozvolom(supabase, 'odsustvo_dokument');
    if (zaStampu.length === 0) {
      upozorenja.push('Niko nema dozvolu "Prima dokument za štampu" sa upisanim emailom, pa rješenje nije poslato na štampu.');
    } else {
      const r = await posaljiEmail({
        prima: zaStampu,
        naslov: `Rješenje za štampu: ${zahtjev.korisnik_ime}, ${period(zahtjev)}`,
        sadrzaj: {
          naslov: 'Rješenje o godišnjem odmoru za štampu',
          uvod: `U prilogu je rješenje br. ${rjesenje.broj}. Odštampaj ga, upiši JMBG, potpiši i ovjeri pečatom.`,
          redovi,
        },
        prilozi,
      });
      upozorenja.push(...upozorenje(r, 'Dokument za štampu'));
    }
  }
  return upozorenja;
}

// Odobravač otkazao već odobren zahtjev → korisnik i oni koji primaju dokument (da ponište rješenje).
export async function obavijestiOtkazanOdobren(supabase, zahtjev) {
  const prima = [await emailKorisnika(supabase, zahtjev.korisnik_id), ...(await emailoviSaDozvolom(supabase, 'odsustvo_dokument'))];
  const r = await posaljiEmail({
    prima,
    naslov: `Odobreni slobodni dani su otkazani: ${zahtjev.korisnik_ime}, ${period(zahtjev)}`,
    sadrzaj: {
      naslov: 'Odobreni slobodni dani su otkazani',
      uvod: `${zahtjev.obradio_ime} je otkazao/la odobreni zahtjev.${zahtjev.broj_rjesenja ? ` Rješenje br. ${zahtjev.broj_rjesenja} više ne važi.` : ''}`,
      redovi: detalji(zahtjev),
    },
  });
  return upozorenje(r, 'Otkazivanje');
}

// Rješenje za odobren godišnji: broj, redni dio u godini i PDF.
export async function pripremiRjesenje(supabase, zahtjev, datum) {
  const { data: profil } = await supabase
    .from('profili').select('ime_prezime, radno_mjesto, pol, radni_odnos').eq('id', zahtjev.korisnik_id).maybeSingle();

  let broj = zahtjev.broj_rjesenja;
  if (!broj) {
    const { count } = await supabase.from('odsustva').select('id', { count: 'exact', head: true })
      .eq('datum_rjesenja', datum).not('broj_rjesenja', 'is', null);
    const [g, m, d] = datum.split('-');
    broj = count > 0 ? `${d}${m}-${count + 1}/${g}` : `${d}${m}/${g}`;
  }
  const datumRjesenja = zahtjev.datum_rjesenja || datum;

  const godina = zahtjev.datum_od.slice(0, 4);
  const { data: raniji } = await supabase.from('odsustva').select('id, datum_od')
    .eq('korisnik_id', zahtjev.korisnik_id).eq('tip', 'godisnji').eq('status', 'odobreno')
    .gte('datum_od', `${godina}-01-01`).lte('datum_od', `${godina}-12-31`);
  const redni = (raniji || []).filter((o) => o.id !== zahtjev.id && o.datum_od < zahtjev.datum_od).length + 1;

  const pdf = napraviRjesenje({ zahtjev, profil: profil || {}, broj, datum: datumRjesenja, redni });
  return { broj, datum: datumRjesenja, pdf, naziv: nazivFajlaRjesenja(zahtjev, broj), nedostajuPodaci: !profil?.ime_prezime || !profil?.radno_mjesto };
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

// Podsjetnik 1. maja: neiskorišćeni dani iz prošle godine ističu 30. juna.
export async function podsjetnikPrenos(korisnik, stanje, adresa) {
  const r = await posaljiEmail({
    prima: korisnik.kontakt_email,
    naslov: `Imaš ${stanje.prenosPreostalo} neiskorišćenih dana koji ističu ${formatirajDatum(stanje.rokPrenosa)}`,
    sadrzaj: {
      naslov: 'Iskoristi preostale slobodne dane',
      uvod: `Imaš ${stanje.prenosPreostalo} neiskorišćenih dana godišnjeg odmora iz ${stanje.godina - 1}. godine. Iskoristi ih do ${formatirajDatum(stanje.rokPrenosa)}, inače propadaju.`,
      redovi: [
        ['Iz prošle godine', String(stanje.prenosPreostalo)],
        [`Godišnji ${stanje.godina}`, `${stanje.kvotaPreostalo} od ${stanje.kvota}`],
        ['Ukupno preostalo', String(stanje.preostalo)],
      ],
      dugme: { tekst: 'Zatraži slobodne dane', adresa: `${adresa}/odsustvo` },
    },
  });
  return upozorenje(r, korisnik.kontakt_email);
}
