import { jsPDF } from 'jspdf';
import { LIBERATION_REGULAR, LIBERATION_BOLD } from '@/lib/fontovi';
import { FIRMA } from '@/lib/firma';
import { GODISNJA_KVOTA } from '@/lib/odsustvo';
import { dativImena } from '@/lib/dativ';

// PDF "Rješenje o korišćenju godišnjeg odmora" po šablonu firme.
// JMBG se upisuje ako je unesen u aplikaciji, inače ostaje prazna linija.
// Pečat i potpis se stavljaju ako su postavljeni u Supabase Storage (bucket "firma"), inače ostaje prazna linija za potpis.

const MJESECI_GENITIV = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
const REDNI = ['prvi', 'drugi', 'treći', 'četvrti', 'peti', 'šesti', 'sedmi', 'osmi', 'deveti', 'deseti'];

function datumSaTackama(s) {
  const [g, m, d] = s.split('-');
  return `${d}.${m}.${g}`;
}

function datumRijecima(s, saGodinom) {
  const [g, m, d] = s.split('-').map(Number);
  return `${d}. ${MJESECI_GENITIV[m - 1]}${saGodinom ? ` ${g}.` : ''}`;
}

// "od 18. avgusta do 30. avgusta 2025. godine" / "od 29. decembra 2025. do 9. januara 2026. godine"
export function periodRijecima(od, doDatuma) {
  const istaGodina = od.slice(0, 4) === doDatuma.slice(0, 4);
  return `od ${datumRijecima(od, !istaGodina)} do ${datumRijecima(doDatuma, true)} godine`;
}

// 1 radnog dana, 2–4 radna dana, 5+ radnih dana
export function radnihDana(n) {
  const j = n % 10;
  const d = n % 100;
  if (j === 1 && d !== 11) return `${n} radnog dana`;
  if (j >= 2 && j <= 4 && (d < 12 || d > 14)) return `${n} radna dana`;
  return `${n} radnih dana`;
}

export function redniDio(n) {
  return REDNI[n - 1] || `${n}.`;
}

// zahtjev: red iz "odsustva"; profil: { ime_prezime, radno_mjesto, pol, radni_odnos }
// broj: broj rješenja; datum: 'YYYY-MM-DD'; redni: koji je ovo dio odmora u godini (1, 2, …)
// jmbg: string ili null; slike: { potpis?, pecat? } iz ucitajSlikeFirme
export function napraviRjesenje({ zahtjev, profil, broj, datum, redni, jmbg = null, slike = {}, pravo = GODISNJA_KVOTA }) {
  const zenski = profil.pol === 'Ž';
  const ime = profil.ime_prezime || zahtjev.korisnik_ime;
  const imeDativ = profil.ime_prezime_dativ || (profil.ime_prezime ? dativImena(profil.ime_prezime, profil.pol) : ime);
  const rasporedjen = zenski ? 'raspoređenoj' : 'raspoređenom';
  const radnoMjesto = profil.radno_mjesto || '________________________________';
  const odnos = profil.radni_odnos === 'određeno' ? 'određeno' : 'neodređeno';
  // Rješenje se piše za tekuću godinu: godinu datuma rješenja.
  const godina = datum.slice(0, 4);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('LiberationSans-Regular.ttf', LIBERATION_REGULAR);
  doc.addFont('LiberationSans-Regular.ttf', 'Liberation', 'normal');
  doc.addFileToVFS('LiberationSans-Bold.ttf', LIBERATION_BOLD);
  doc.addFont('LiberationSans-Bold.ttf', 'Liberation', 'bold');

  const lijevo = 20;
  const sirina = 170;
  const desno = lijevo + sirina;
  const visinaReda = 5.0;
  let y = 20;

  const novaStranaAkoTreba = (potrebno) => {
    if (y + potrebno > 280) {
      doc.addPage();
      y = 25;
    }
  };

  const pasus = (tekst, { bold = false, align = 'justify', razmak = 4, velicina = 11, uvlaka = 0 } = {}) => {
    doc.setFont('Liberation', bold ? 'bold' : 'normal');
    doc.setFontSize(velicina);
    const redovi = doc.splitTextToSize(tekst, sirina - uvlaka);
    novaStranaAkoTreba(redovi.length * visinaReda);
    redovi.forEach((red, i) => {
      const posljednji = i === redovi.length - 1;
      if (align === 'center') {
        doc.text(red, lijevo + sirina / 2, y, { align: 'center' });
      } else if (align === 'justify' && !posljednji) {
        doc.text(red, lijevo + uvlaka, y, { align: 'justify', maxWidth: sirina - uvlaka });
      } else {
        doc.text(red, lijevo + uvlaka, y);
      }
      y += visinaReda;
    });
    y += razmak;
  };

  // Zaglavlje
  pasus(FIRMA.naziv, { align: 'left', razmak: 0 });
  pasus(`BROJ ${broj}`, { align: 'left', razmak: 0 });
  pasus(`${FIRMA.mjesto.toUpperCase()}, ${datumSaTackama(datum)}. godine`, { align: 'left', razmak: 6 });

  pasus(`Na osnovu Zakona o radu ${FIRMA.zakonORadu} direktor društva ${FIRMA.nazivUTekstu} donosi`, { razmak: 3 });

  pasus('R J E Š E NJ E', { align: 'center', bold: true, razmak: 0 });
  pasus('O KORIŠĆENJU GODIŠNJEG ODMORA', { align: 'center', bold: true, razmak: 5 });

  pasus(
    `1. ${ime}, JMBG ${jmbg || '____________________'}, ${rasporedjen} na radno mjesto ${radnoMjesto}, ` +
    `ima pravo na godišnji odmor za ${godina}. godinu u ukupnom trajanju od ${radnihDana(pravo)}.`,
    { razmak: 4 }
  );
  pasus(
    `2. Zaposlen${zenski ? 'a' : 'i'} će dio godišnjeg odmora u ukupnom trajanju od ` +
    `${radnihDana(zahtjev.radnih_dana)} koristiti ${periodRijecima(zahtjev.datum_od, zahtjev.datum_do)}.`,
    { razmak: 4 }
  );
  pasus(
    'O eventualnom prekidu korišćenja godišnjeg odmora i razlozima zbog kojih je to uslijedilo, ' +
    'zaposleni je dužan da obavijesti Poslodavca.',
    { razmak: 5 }
  );

  pasus('Obrazloženje', { align: 'center', razmak: 3 });
  pasus(
    `Zaposlen${zenski ? 'oj' : 'om'} ${imeDativ}, ${zenski ? 'koja' : 'koji'} je u radnom odnosu na ${odnos} vrijeme u ` +
    `${FIRMA.nazivUTekstu} ${FIRMA.mjesto}, ${rasporedjen} na radnom mjestu ${radnoMjesto}, ` +
    `Poslodavac obezbjeđuje korišćenje odmora za ${godina}. godinu, u periodu kako je navedeno u dispozitivu ovog Rješenja.`,
    { razmak: 3 }
  );
  pasus(
    'U zavisnosti od potreba procesa rada Poslodavac je na osnovu Plana korišćenja godišnjih odmora, odlučio o ' +
    'vremenu korišćenja godišnjeg odmora. Godišnji odmor zaposlenom utvrđen je brojem radnih dana zavisno od ' +
    'sedmičnog rasporeda radnog vremena Zaposlenog, pri čemu se radna sedmica računa kao pet radnih dana, shodno ' +
    'članu 80 stav 2 Zakona o radu. Dužina godišnjeg odmora utvrđena je tako što se broj radnih dana iz ' +
    'člana 65 stav 1 Zakona o radu (20 radnih dana).',
    { razmak: 4 }
  );
  pasus(
    'PRAVNA POUKA: Zaposleni koji smatra da mu je povrijeđeno pravo iz rada i po osnovu rada, prije pokretanja ' +
    'postupka pred nadležnim sudom, dužan je da podnese predlog za mirno rješavanje spora pred Agencijom za mirno ' +
    'rješavanje radnih sporova ili pred Centrom za alternativno rješavanje sporova.',
    { razmak: 0 }
  );
  pasus(
    'Ako se radni spor ne riješi pred organima iz stava 1 ove pravne pouke zaposleni može da pokrene spor pred ' +
    'nadležnim sudom. Postupak pred sudom može da se pokrene u roku od 15 dana od dana dostavljanja odluke kojom je ' +
    'obustavljen postupak mirnog rješavanja spora.',
    { razmak: 6 }
  );

  // Dostavljeno (lijevo) i potpis (desno), u istoj visini
  novaStranaAkoTreba(30);
  const yDostavljeno = y;
  pasus('Dostavljeno:', { align: 'left', razmak: 0 });
  pasus(zenski ? 'Zaposlenoj' : 'Zaposlenom', { align: 'left', razmak: 0 });
  pasus('U dosije', { align: 'left', razmak: 0 });

  const sirinaPotpisa = 70;
  const sredinaPotpisa = desno - sirinaPotpisa / 2;
  const yFirma = yDostavljeno + 4;
  const yLinija = yFirma + 16;
  doc.setFont('Liberation', 'normal');
  doc.setFontSize(11);
  doc.text(FIRMA.nazivUTekstu, sredinaPotpisa, yFirma, { align: 'center' });
  doc.setLineWidth(0.3);
  doc.line(desno - sirinaPotpisa, yLinija, desno, yLinija);

  const slika = (s) => `data:image/${s.format === 'PNG' ? 'png' : 'jpeg'};base64,${s.base64}`;
  // Pečat lijevo od potpisa, preko početka linije (kao na originalu). Bez pečata ostaje samo linija, kao na šablonu.
  if (slike.pecat) {
    const sirina = 34;
    const visina = Math.min(34, (sirina * slike.pecat.visina) / slike.pecat.sirina);
    const s = (visina * slike.pecat.sirina) / slike.pecat.visina;
    doc.addImage(slika(slike.pecat), slike.pecat.format, desno - sirinaPotpisa - s / 2, yLinija - visina / 2 - 4, s, visina);
  }
  // Potpis centriran na liniji, malo spušten preko nje.
  if (slike.potpis) {
    const maksSirina = 55;
    const maksVisina = 20;
    const odnos = slike.potpis.sirina / slike.potpis.visina;
    const s = Math.min(maksSirina, maksVisina * odnos);
    const v = s / odnos;
    doc.addImage(slika(slike.potpis), slike.potpis.format, sredinaPotpisa - s / 2, yLinija - v + 3, s, v);
  }

  return Buffer.from(doc.output('arraybuffer'));
}

export function nazivFajlaRjesenja(zahtjev, broj) {
  const ime = (zahtjev.korisnik_ime || 'zaposleni').replace(/[^a-z0-9._-]/gi, '_');
  return `Rjesenje_godisnji_${ime}_${broj.replace(/\//g, '-')}.pdf`;
}
