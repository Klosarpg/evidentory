import { NextResponse } from 'next/server';
import { adminKlijent, dozvoleUloge } from '@/lib/serverAdmin';
import { danasUCrnojGori, dodajDane, stanjeKorisnika } from '@/lib/odsustvo';
import { adresaAplikacije, podsjetnikSlava, podsjetnikPrenos } from '@/lib/obavjestenja';

// Dnevni podsjetnici (Vercel Cron, vidi vercel.json):
//  - 5 dana prije slave: podsjetnik korisniku
//  - 30. decembra (6 mjeseci prije isteka): ko ima neiskorišćene dane iz ove godine (ističu 30. juna sljedeće)
// Ručni test: /api/cron/podsjetnici?danas=2026-12-30 (sa Authorization: Bearer CRON_SECRET)

export async function GET(request) {
  const tajna = process.env.CRON_SECRET;
  if (tajna && request.headers.get('authorization') !== `Bearer ${tajna}`) {
    return NextResponse.json({ error: 'Nije dozvoljeno' }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY nije podešen.' }, { status: 500 });
  }

  const zadato = new URL(request.url).searchParams.get('danas');
  const danas = /^\d{4}-\d{2}-\d{2}$/.test(zadato || '') ? zadato : danasUCrnojGori();
  const godina = Number(danas.slice(0, 4));
  const adresa = adresaAplikacije(null);
  const supabase = adminKlijent();
  const izvjestaj = { danas, slava: 0, prenos: 0, upozorenja: [] };

  try {
    const { data: profili, error } = await supabase.from('profili')
      .select('id, email, uloga, kontakt_email, slava_datum, slava_naziv');
    if (error) throw error;
    const saEmailom = (profili || []).filter((p) => p.kontakt_email);

    // 1) Slava za 5 dana
    const zaPet = dodajDane(danas, 5);
    for (const p of saEmailom.filter((x) => x.slava_datum === zaPet.slice(5))) {
      izvjestaj.upozorenja.push(...await podsjetnikSlava(p, zaPet, adresa));
      izvjestaj.slava++;
    }

    // 2) 30. decembar: neiskorišćeni dani ove godine prelaze u sljedeću i važe do 30. juna
    if (danas.slice(5) === '12-30') {
      const { data: praznici } = await supabase.from('praznici').select('datum, naziv');
      const mapaPraznika = new Map((praznici || []).map((x) => [x.datum, x.naziv]));
      const { data: odsustva } = await supabase.from('odsustva').select('*').in('status', ['odobreno', 'na_cekanju']);
      const { data: korekcije } = await supabase.from('odsustvo_korekcije').select('*');
      const dozvolePoUlozi = {};

      for (const p of saEmailom) {
        dozvolePoUlozi[p.uloga] ||= await dozvoleUloge(supabase, p.uloga || 'Korisnik');
        if (!dozvolePoUlozi[p.uloga].includes('odsustvo_zahtjev')) continue;
        const stanje = stanjeKorisnika({
          odsustva: (odsustva || []).filter((o) => o.korisnik_id === p.id),
          korekcije: (korekcije || []).filter((k) => k.korisnik_id === p.id),
          praznici: mapaPraznika, slava: p.slava_datum, godina: godina + 1, danas,
        });
        if (stanje.prenosPreostalo > 0) {
          izvjestaj.upozorenja.push(...await podsjetnikPrenos(p, stanje, adresa));
          izvjestaj.prenos++;
        }
      }
    }
  } catch (e) {
    console.error('Podsjetnici, greška:', e);
    return NextResponse.json({ ...izvjestaj, error: e.message }, { status: 500 });
  }

  if (izvjestaj.upozorenja.length) console.warn('Podsjetnici, upozorenja:', izvjestaj.upozorenja);
  return NextResponse.json(izvjestaj);
}
