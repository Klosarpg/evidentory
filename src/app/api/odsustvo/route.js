import { NextResponse } from 'next/server';
import { provjeriPrijavu, greska } from '@/lib/serverAdmin';
import {
  TIPOVI, MAKS_DANA_ZAHTJEVA, danasUCrnojGori, jeIspravanDatum, razlikaDana,
  radniDani, provjeriKvotu, seKlapaju, formatirajDatum,
} from '@/lib/odsustvo';

// POST /api/odsustvo  { akcija, ... }
//   zahtjev    { tip, datumOd, datumDo, napomena }      dozvola: odsustvo_zahtjev
//   otkazi     { id }                                   vlasnik (na čekanju) ili odobravač
//   odobri     { id, komentar }                         dozvola: odsustvo_odobravanje
//   odbij      { id, komentar }                         dozvola: odsustvo_odobravanje
//   slava      { slavaDatum, slavaNaziv, korisnikId? }  sam jednom; admin bilo kad i bilo kome
//   korekcija  { korisnikId, godina, dana, prenos, napomena }  dozvola: admin

const imeIz = (email) => (email || '').split('@')[0];

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
  if (/odsustva|praznici|korekcije|slava_datum/.test(m) && /(does not exist|schema cache|not find)/i.test(m)) {
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
  try {
    switch (tijelo.akcija) {
      case 'zahtjev': return await noviZahtjev(supabase, ja, dozvole, tijelo);
      case 'otkazi': return await otkazi(supabase, ja, dozvole, tijelo);
      case 'odobri':
      case 'odbij': return await obradi(supabase, ja, dozvole, tijelo);
      case 'slava': return await postaviSlavu(supabase, ja, dozvole, tijelo);
      case 'korekcija': return await postaviKorekciju(supabase, dozvole, tijelo);
      default: return greska('Nepoznata akcija.');
    }
  } catch (e) {
    console.error('Slobodni dani, greška:', e);
    return greska(porukaZaBazu(e) || 'Došlo je do greške na serveru. Pokušaj ponovo.', 500);
  }
}

async function noviZahtjev(supabase, ja, dozvole, t) {
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

  if (tip === 'godisnji') {
    const kvota = provjeriKvotu({ postojeca: k.odsustva, novi, korekcije: k.korekcije, praznici: k.praznici, slava: k.slava, danas });
    if (!kvota.ok) {
      return greska(`Nemaš dovoljno slobodnih dana: zahtjev traži ${dani.length} radnih dana, fali ti ${kvota.fali}. Računaju se i zahtjevi na čekanju.`);
    }
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

  // Faza 4: ovdje se šalje email odobravačima.
  return NextResponse.json({ success: true, zahtjev: data });
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

  const { error } = await supabase.from('odsustva').update({
    status: 'otkazano',
    obradio_id: ja.id,
    obradio_ime: ja.ime,
    obradjeno_at: new Date().toISOString(),
  }).eq('id', z.id).in('status', ['na_cekanju', 'odobreno']);
  if (error) throw error;
  return NextResponse.json({ success: true });
}

async function obradi(supabase, ja, dozvole, t) {
  if (!dozvole.includes('odsustvo_odobravanje')) return greska('Nemaš dozvolu za odobravanje.', 403);
  const z = await ucitajZahtjev(supabase, t.id);
  if (!z) return greska('Zahtjev nije pronađen.', 404);
  if (z.status !== 'na_cekanju') return greska('Ovaj zahtjev je već obrađen.');
  if (z.korisnik_id === ja.id && !dozvole.includes('admin')) {
    return greska('Ne možeš odobriti sopstveni zahtjev. Neka ga obradi drugi odobravač.', 403);
  }

  const odobri = t.akcija === 'odobri';
  if (odobri && z.tip === 'godisnji') {
    // Ponovna provjera: od podnošenja su se mogli promijeniti praznici ili drugi zahtjevi.
    const k = await ucitajKontekst(supabase, z.korisnik_id);
    const ostali = k.odsustva.filter((o) => o.id !== z.id);
    const kvota = provjeriKvotu({ postojeca: ostali, novi: z, korekcije: k.korekcije, praznici: k.praznici, slava: k.slava, danas: danasUCrnojGori() });
    if (!kvota.ok) return greska(`Korisniku fali ${kvota.fali} slobodnih dana za ovaj zahtjev. Odbij ga ili traži izmjenu.`);
  }

  const { data, error } = await supabase.from('odsustva').update({
    status: odobri ? 'odobreno' : 'odbijeno',
    obradio_id: ja.id,
    obradio_ime: ja.ime,
    obradjeno_at: new Date().toISOString(),
    komentar: String(t.komentar || '').trim().slice(0, 500) || null,
  }).eq('id', z.id).eq('status', 'na_cekanju').select();
  if (error) throw error;
  if (!data?.length) return greska('Zahtjev je u međuvremenu obradio neko drugi. Osvježi stranicu.');

  // Faza 4: ovdje ide email korisniku i, ako je odobreno, PDF dokument.
  return NextResponse.json({ success: true });
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
  if (!Number.isInteger(prenos) || prenos < 0 || prenos > 365) return greska('Preneseni dani moraju biti cijeli broj od 0 do 365.');

  const { error } = await supabase.from('odsustvo_korekcije').upsert(
    { korisnik_id: korisnikId, godina, dana, prenos, napomena: String(t.napomena || '').trim().slice(0, 200) || null },
    { onConflict: 'korisnik_id,godina' }
  );
  if (error) throw error;
  return NextResponse.json({ success: true });
}
