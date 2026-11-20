import { NextResponse, after } from 'next/server';
import { provjeriPrijavu, greska } from '@/lib/serverAdmin';
import {
  TIPOVI, MAKS_DANA_ZAHTJEVA, danasUCrnojGori, jeIspravanDatum, razlikaDana,
  radniDani, provjeriKvotu, seKlapaju, formatirajDatum,
} from '@/lib/odsustvo';
import {
  adresaAplikacije, obavijestiNoviZahtjev, obavijestiObradjen, obavijestiOtkazanOdobren, pripremiRjesenje,
} from '@/lib/obavjestenja';
import { jeIspravanJmbg, maskirajJmbg } from '@/lib/slikeFirme';

// POST /api/odsustvo  { akcija, ... }
//   zahtjev    { tip, datumOd, datumDo, napomena }      dozvola: odsustvo_zahtjev
//   otkazi     { id }                                   vlasnik (na čekanju) ili odobravač
//   odobri     { id, komentar }                         dozvola: odsustvo_odobravanje
//   odbij      { id, komentar }                         dozvola: odsustvo_odobravanje
//   slava      { slavaDatum, slavaNaziv, korisnikId? }  sam jednom; admin bilo kad i bilo kome
//   korekcija  { korisnikId, godina, dana, prenos, napomena }  dozvola: admin
//   podaci     { korisnikId, imePrezime, radnoMjesto, pol, radniOdnos }  dozvola: admin (podaci za rješenje)
//   jmbg       { korisnikId, jmbg }   dozvola: admin; prazan jmbg briše upis
//   jmbg_pregled                      dozvola: admin; vraća samo maskirane JMBG-ove
//   praznik    { datum, naziv }       dozvola: admin; dodaje ili mijenja praznik
//   praznik_obrisi { datum }          dozvola: admin
// GET /api/odsustvo?rjesenje=ID  → PDF rješenja (vlasnik, odobravač, pregled svih ili prima dokument)
//
// Odgovor može imati "upozorenja": akcija je uspjela, ali npr. email nije poslat.

const imeIz = (email) => (email || '').split('@')[0];

// Emailovi se šalju poslije odgovora; ovoliko sekundi smiju trajati (Vercel).
export const maxDuration = 60;

// Pokreće slanje emailova u pozadini, a odmah vraća upozorenja koja se znaju unaprijed.
function uPozadini(obavjestenje, oznaka) {
  after(async () => {
    try {
      const problemi = await obavjestenje.posalji();
      if (problemi.length) console.warn(`${oznaka}: emailovi nisu svi poslati:`, problemi);
    } catch (e) {
      console.error(`${oznaka}: slanje emailova nije uspjelo:`, e);
    }
  });
  return obavjestenje.upozorenja;
}

async function ucitajPraznike(supabase) {
  const { data, error } = await supabase.from('praznici').select('datum, naziv');
  if (error) throw new Error(`Praznici nisu učitani: ${error.message}`);
  return new Map((data || []).map((p) => [p.datum, p.naziv]));
}

async function ucitajKontekst(supabase, korisnikId) {
  const [{ data: profil }, { data: odsustva, error: oGreska }, { data: korekcije }, praznici] = await Promise.all([
    supabase.from('profili').select('slava_datum').eq('id', korisnikId).maybeSingle(),
    supabase.from('odsustva').select('*').eq('korisnik_id', korisnikId).in('status', ['na_cekanju', 'odobreno']),
    supabase.from('odsustvo_korekcije').select('*').eq('korisnik_id', korisnikId),
    ucitajPraznike(supabase),
  ]);
  if (oGreska) throw new Error(`Zahtjevi nisu učitani: ${oGreska.message}`);
  return { slava: profil?.slava_datum || null, odsustva: odsustva || [], korekcije: korekcije || [], praznici };
}

function porukaZaBazu(e) {
  const m = e?.message || String(e);
  if (/zaposleni_jmbg/.test(m) && /(does not exist|schema cache|not find)/i.test(m)) {
    return 'Tabela za JMBG ne postoji. Pokreni SQL "jmbg-pecat.sql" u Supabase-u.';
  }
  if (/ime_prezime_dativ/.test(m) && /(does not exist|schema cache|not find)/i.test(m)) {
    return 'Kolona za ime u dativu ne postoji. Pokreni SQL "rjesenje-dativ.sql" u Supabase-u.';
  }
  if (/odsustva|praznici|korekcije|slava_datum|ime_prezime|radno_mjesto|broj_rjesenja/.test(m) && /(does not exist|schema cache|not find)/i.test(m)) {
    return 'Tabele za slobodne dane ne postoje. Pokreni SQL "odsustvo.sql" u Supabase-u.';
  }
  return null;
}

export async function POST(request) {
  const prijava = await provjeriPrijavu(request);
  if (prijava.odgovor) return prijava.odgovor;
  const { supabase, korisnik, dozvole } = prijava;
  const ja = { id: korisnik.id, ime: imeIz(korisnik.email) };

  const tijelo = await request.json().catch(() => ({}));
  const adresa = adresaAplikacije(request);
  try {
    switch (tijelo.akcija) {
      case 'zahtjev': return await noviZahtjev(supabase, ja, dozvole, tijelo, adresa);
      case 'otkazi': return await otkazi(supabase, ja, dozvole, tijelo);
      case 'odobri':
      case 'odbij': return await obradi(supabase, ja, dozvole, tijelo, adresa);
      case 'slava': return await postaviSlavu(supabase, ja, dozvole, tijelo);
      case 'korekcija': return await postaviKorekciju(supabase, dozvole, tijelo);
      case 'podaci': return await postaviPodatke(supabase, dozvole, tijelo);
      case 'jmbg': return await postaviJmbg(supabase, dozvole, tijelo);
      case 'jmbg_pregled': return await pregledJmbg(supabase, dozvole);
      case 'praznik': return await sacuvajPraznik(supabase, dozvole, tijelo);
      case 'praznik_obrisi': return await obrisiPraznik(supabase, dozvole, tijelo);
      default: return greska('Nepoznata akcija.');
    }
  } catch (e) {
    console.error('Slobodni dani, greška:', e);
    return greska(porukaZaBazu(e) || 'Došlo je do greške na serveru. Pokušaj ponovo.', 500);
  }
}

async function noviZahtjev(supabase, ja, dozvole, t, adresa) {
  if (!dozvole.includes('odsustvo_zahtjev')) return greska('Tvoja uloga nema pravo da podnosi zahtjeve.', 403);

  const tip = t.tip;
  const datumOd = t.datumOd;
  const datumDo = t.datumDo;
  const napomena = String(t.napomena || '').trim().slice(0, 500) || null;

  if (!TIPOVI[tip]) return greska('Izaberi vrstu odsustva.');
  if (!jeIspravanDatum(datumOd) || !jeIspravanDatum(datumDo)) return greska('Izaberi ispravne datume.');
  if (datumDo < datumOd) return greska('Datum završetka je prije datuma početka.');
  const danas = danasUCrnojGori();
  if (datumOd < danas) return greska('Zahtjev ne može početi u prošlosti.');
  if (razlikaDana(datumOd, datumDo) + 1 > MAKS_DANA_ZAHTJEVA) {
    return greska(`Jedan zahtjev može obuhvatiti najviše ${MAKS_DANA_ZAHTJEVA} dana.`);
  }

  const k = await ucitajKontekst(supabase, ja.id);
  const dani = radniDani(datumOd, datumDo, k.praznici, k.slava);
  if (dani.length === 0) return greska('U izabranom periodu nema radnih dana (vikend, praznik ili slava).');

  const novi = { tip, datum_od: datumOd, datum_do: datumDo };
  const preklapanje = k.odsustva.find((o) => seKlapaju(o, novi));
  if (preklapanje) {
    return greska(`Već imaš zahtjev za period ${formatirajDatum(preklapanje.datum_od)} – ${formatirajDatum(preklapanje.datum_do)}.`);
  }

  // Zahtjev preko broja slobodnih dana je dozvoljen; korisnik i odobravači dobijaju napomenu.
  let manjak = 0;
  if (tip === 'godisnji') {
    const kvota = provjeriKvotu({ postojeca: k.odsustva, novi, korekcije: k.korekcije, praznici: k.praznici, slava: k.slava });
    manjak = kvota.fali;
  }

  const { data, error } = await supabase.from('odsustva').insert({
    korisnik_id: ja.id,
    korisnik_ime: ja.ime,
    tip,
    datum_od: datumOd,
    datum_do: datumDo,
    radnih_dana: dani.length,
    napomena,
  }).select().single();
  if (error) throw error;

  const upozorenja = uPozadini(await obavijestiNoviZahtjev(supabase, data, adresa, { manjak }), 'Novi zahtjev');
  if (manjak > 0) {
    upozorenja.unshift(`Tražiš ${dani.length} radnih dana, a slobodno ti je ${dani.length - manjak}. Odobravač će vidjeti da fali ${manjak} i odlučiće da li odobrava.`);
  }
  return NextResponse.json({ success: true, zahtjev: data, upozorenja });
}

async function ucitajZahtjev(supabase, id) {
  const { data, error } = await supabase.from('odsustva').select('*').eq('id', Number(id)).maybeSingle();
  if (error) throw error;
  return data;
}

async function otkazi(supabase, ja, dozvole, t) {
  const z = await ucitajZahtjev(supabase, t.id);
  if (!z) return greska('Zahtjev nije pronađen.', 404);

  const jeVlasnik = z.korisnik_id === ja.id;
  const jeOdobravac = dozvole.includes('odsustvo_odobravanje');

  if (z.status === 'na_cekanju' && !jeVlasnik && !jeOdobravac) return greska('Ne možeš otkazati tuđi zahtjev.', 403);
  if (z.status === 'odobreno' && !jeOdobravac) {
    return greska('Odobreni zahtjev može otkazati samo odobravač. Javi mu se.', 403);
  }
  if (!['na_cekanju', 'odobreno'].includes(z.status)) return greska('Ovaj zahtjev je već zatvoren.');

  const { data: azuriran, error } = await supabase.from('odsustva').update({
    status: 'otkazano',
    obradio_id: ja.id,
    obradio_ime: ja.ime,
    obradjeno_at: new Date().toISOString(),
  }).eq('id', z.id).in('status', ['na_cekanju', 'odobreno']).select().single();
  if (error) throw error;

  const upozorenja = z.status === 'odobreno' ? uPozadini(await obavijestiOtkazanOdobren(supabase, azuriran), 'Otkazivanje') : [];
  return NextResponse.json({ success: true, upozorenja });
}

async function obradi(supabase, ja, dozvole, t, adresa) {
  if (!dozvole.includes('odsustvo_odobravanje')) return greska('Nemaš dozvolu za odobravanje.', 403);
  const z = await ucitajZahtjev(supabase, t.id);
  if (!z) return greska('Zahtjev nije pronađen.', 404);
  if (z.status !== 'na_cekanju') return greska('Ovaj zahtjev je već obrađen.');
  if (z.korisnik_id === ja.id && !dozvole.includes('admin')) {
    return greska('Ne možeš odobriti sopstveni zahtjev. Neka ga obradi drugi odobravač.', 403);
  }

  // Odobravač smije odobriti i zahtjev preko broja slobodnih dana (upozorenje vidi na ekranu prije odluke).
  const odobri = t.akcija === 'odobri';

  const { data, error } = await supabase.from('odsustva').update({
    status: odobri ? 'odobreno' : 'odbijeno',
    obradio_id: ja.id,
    obradio_ime: ja.ime,
    obradjeno_at: new Date().toISOString(),
    komentar: String(t.komentar || '').trim().slice(0, 500) || null,
  }).eq('id', z.id).eq('status', 'na_cekanju').select();
  if (error) throw error;
  if (!data?.length) return greska('Zahtjev je u međuvremenu obradio neko drugi. Osvježi stranicu.');

  let obradjen = data[0];
  const upozorenja = [];
  let rjesenje = null;
  if (odobri && obradjen.tip === 'godisnji') {
    try {
      rjesenje = await pripremiRjesenje(supabase, obradjen, danasUCrnojGori());
      const { data: saBrojem } = await supabase.from('odsustva')
        .update({ broj_rjesenja: rjesenje.broj, datum_rjesenja: rjesenje.datum })
        .eq('id', obradjen.id).select().single();
      if (saBrojem) obradjen = saBrojem;
      if (rjesenje.nedostajuPodaci) {
        upozorenja.push(`Za ${obradjen.korisnik_ime} nisu upisani ime i prezime ili radno mjesto, pa rješenje ima prazna mjesta. Upiši ih u Administracija → Korisnici.`);
      }
    } catch (e) {
      console.error('Rješenje nije napravljeno:', e);
      upozorenja.push(`Zahtjev je odobren, ali rješenje nije napravljeno: ${e.message}`);
    }
  }
  upozorenja.push(...uPozadini(await obavijestiObradjen(supabase, obradjen, adresa, { rjesenje }), odobri ? 'Odobravanje' : 'Odbijanje'));
  return NextResponse.json({ success: true, upozorenja });
}

async function postaviSlavu(supabase, ja, dozvole, t) {
  const jeAdmin = dozvole.includes('admin');
  const korisnikId = t.korisnikId && jeAdmin ? String(t.korisnikId) : ja.id;
  const datum = t.slavaDatum ? String(t.slavaDatum) : null;
  const naziv = String(t.slavaNaziv || '').trim().slice(0, 80) || null;

  if (datum && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(datum)) return greska('Datum slave nije ispravan.');
  if (datum && !jeIspravanDatum(`2024-${datum}`)) return greska('Datum slave nije ispravan.');
  if (!datum && !jeAdmin) return greska('Izaberi datum slave.');

  if (!jeAdmin) {
    const { data: profil } = await supabase.from('profili').select('slava_datum').eq('id', ja.id).maybeSingle();
    if (profil?.slava_datum) return greska('Slava je već izabrana. Promjenu može uraditi administrator.');
  }

  const { error } = await supabase.from('profili').update({ slava_datum: datum, slava_naziv: datum ? naziv : null }).eq('id', korisnikId);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function postaviKorekciju(supabase, dozvole, t) {
  if (!dozvole.includes('admin')) return greska('Korekcije može upisati samo administrator.', 403);
  const korisnikId = String(t.korisnikId || '');
  const godina = Number(t.godina);
  const dana = Number(t.dana || 0);
  const prenos = Number(t.prenos || 0);
  if (!korisnikId) return greska('Izaberi korisnika.');
  if (!Number.isInteger(godina) || godina < 2020 || godina > 2100) return greska('Godina nije ispravna.');
  if (!Number.isInteger(dana) || dana < 0 || dana > 365) return greska('Iskorišćeni dani moraju biti cijeli broj od 0 do 365.');
  if (!Number.isInteger(prenos) || prenos < 0 || prenos > 365) return greska('Dodatni dani moraju biti cijeli broj od 0 do 365.');

  const { error } = await supabase.from('odsustvo_korekcije').upsert(
    { korisnik_id: korisnikId, godina, dana, prenos, napomena: String(t.napomena || '').trim().slice(0, 200) || null },
    { onConflict: 'korisnik_id,godina' }
  );
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function postaviPodatke(supabase, dozvole, t) {
  if (!dozvole.includes('admin')) return greska('Podatke za rješenje može upisati samo administrator.', 403);
  const korisnikId = String(t.korisnikId || '');
  if (!korisnikId) return greska('Izaberi korisnika.');
  const pol = ['M', 'Ž'].includes(t.pol) ? t.pol : null;
  const radniOdnos = ['neodređeno', 'određeno'].includes(t.radniOdnos) ? t.radniOdnos : 'neodređeno';
  const { error } = await supabase.from('profili').update({
    ime_prezime: String(t.imePrezime || '').trim().slice(0, 100) || null,
    ime_prezime_dativ: String(t.imePrezimeDativ || '').trim().slice(0, 100) || null,
    radno_mjesto: String(t.radnoMjesto || '').trim().slice(0, 200) || null,
    pol,
    radni_odnos: radniOdnos,
  }).eq('id', korisnikId);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function postaviJmbg(supabase, dozvole, t) {
  if (!dozvole.includes('admin')) return greska('JMBG može upisati samo administrator.', 403);
  const korisnikId = String(t.korisnikId || '');
  if (!korisnikId) return greska('Izaberi korisnika.');
  const jmbg = String(t.jmbg || '').replace(/\s+/g, '');

  if (!jmbg) {
    const { error } = await supabase.from('zaposleni_jmbg').delete().eq('korisnik_id', korisnikId);
    if (error) throw error;
    return NextResponse.json({ success: true, maskiran: '' });
  }
  if (!/^\d{13}$/.test(jmbg)) return greska('JMBG mora imati tačno 13 cifara.');
  if (!jeIspravanJmbg(jmbg)) return greska('JMBG nije ispravan (kontrolna cifra se ne slaže). Provjeri da li je dobro prekucan.');

  const { error } = await supabase.from('zaposleni_jmbg')
    .upsert({ korisnik_id: korisnikId, jmbg, azurirano_at: new Date().toISOString() }, { onConflict: 'korisnik_id' });
  if (error) throw error;
  return NextResponse.json({ success: true, maskiran: maskirajJmbg(jmbg) });
}

// Samo maskirano (zadnje 4 cifre), da se pun JMBG nikad ne šalje u browser.
async function pregledJmbg(supabase, dozvole) {
  if (!dozvole.includes('admin')) return greska('Nemaš dozvolu.', 403);
  const { data, error } = await supabase.from('zaposleni_jmbg').select('korisnik_id, jmbg');
  if (error) throw error;
  return NextResponse.json({ success: true, jmbg: Object.fromEntries((data || []).map((r) => [r.korisnik_id, maskirajJmbg(r.jmbg)])) });
}

async function sacuvajPraznik(supabase, dozvole, t) {
  if (!dozvole.includes('admin')) return greska('Praznike mijenja samo administrator.', 403);
  const datum = String(t.datum || '');
  const naziv = String(t.naziv || '').trim().slice(0, 80);
  if (!jeIspravanDatum(datum)) return greska('Izaberi ispravan datum.');
  if (!naziv) return greska('Upiši naziv praznika.');
  const { error } = await supabase.from('praznici').upsert({ datum, naziv }, { onConflict: 'datum' });
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function obrisiPraznik(supabase, dozvole, t) {
  if (!dozvole.includes('admin')) return greska('Praznike mijenja samo administrator.', 403);
  const datum = String(t.datum || '');
  if (!jeIspravanDatum(datum)) return greska('Datum nije ispravan.');
  const { error } = await supabase.from('praznici').delete().eq('datum', datum);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

// GET /api/odsustvo?rjesenje=ID → PDF rješenja
export async function GET(request) {
  const prijava = await provjeriPrijavu(request);
  if (prijava.odgovor) return prijava.odgovor;
  const { supabase, korisnik, dozvole } = prijava;

  const id = new URL(request.url).searchParams.get('rjesenje');
  try {
    const z = await ucitajZahtjev(supabase, id);
    if (!z) return greska('Zahtjev nije pronađen.', 404);
    const smije = z.korisnik_id === korisnik.id
      || ['odsustvo_odobravanje', 'odsustvo_pregled_svih', 'odsustvo_dokument'].some((d) => dozvole.includes(d));
    if (!smije) return greska('Nemaš pristup ovom rješenju.', 403);
    if (z.status !== 'odobreno' || z.tip !== 'godisnji') return greska('Rješenje postoji samo za odobren godišnji odmor.');

    const datum = z.datum_rjesenja || (z.obradjeno_at ? z.obradjeno_at.slice(0, 10) : danasUCrnojGori());
    const rjesenje = await pripremiRjesenje(supabase, z, datum);
    if (!z.broj_rjesenja) {
      await supabase.from('odsustva').update({ broj_rjesenja: rjesenje.broj, datum_rjesenja: rjesenje.datum }).eq('id', z.id);
    }
    return new NextResponse(rjesenje.pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${rjesenje.naziv}"`,
      },
    });
  } catch (e) {
    console.error('Rješenje, greška:', e);
    return greska(porukaZaBazu(e) || `Rješenje nije napravljeno: ${e.message}`, 500);
  }
}
