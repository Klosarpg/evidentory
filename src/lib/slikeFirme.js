// Pečat i potpis za rješenja. Čuvaju se u PRIVATNOM Supabase Storage bucketu "firma"
// (nikad u kodu ni u javnom folderu), a čita ih samo server sa service ključem.
// Očekivani fajlovi: potpis.png i pecat.png (može i .jpg). Najbolje PNG sa providnom pozadinom.

const BUCKET = 'firma';
const IMENA = {
  potpis: ['potpis.png', 'potpis.jpg', 'potpis.jpeg'],
  pecat: ['pecat.png', 'pecat.jpg', 'pecat.jpeg'],
};
const TRAJANJE_KESA = 2 * 60 * 1000; // nova slika se vidi najkasnije 2 minuta poslije postavljanja

let kes = { vrijeme: 0, slike: null };

// Širina i visina slike u pikselima (PNG ili JPEG), bez dodatnih paketa.
function dimenzije(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { format: 'PNG', sirina: b.readUInt32BE(16), visina: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const duzina = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'JPEG', visina: b.readUInt16BE(i + 5), sirina: b.readUInt16BE(i + 7) };
      }
      i += 2 + duzina;
    }
  }
  return null;
}

// Vraća { potpis?, pecat? }, svaka sa { base64, format, sirina, visina }. Ako slika ne postoji, ključa nema.
export async function ucitajSlikeFirme(supabase) {
  if (kes.slike && Date.now() - kes.vrijeme < TRAJANJE_KESA) return kes.slike;
  const slike = {};
  for (const [kljuc, imena] of Object.entries(IMENA)) {
    for (const ime of imena) {
      const { data, error } = await supabase.storage.from(BUCKET).download(ime);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      const info = dimenzije(buf);
      if (!info || !info.sirina || !info.visina) {
        console.warn(`Slika ${ime} u bucketu "${BUCKET}" nije PNG ni JPEG, preskačem je.`);
        continue;
      }
      slike[kljuc] = { base64: buf.toString('base64'), ...info };
      break;
    }
  }
  kes = { vrijeme: Date.now(), slike };
  return slike;
}

// ---------- JMBG ----------

// Provjera kontrolne cifre JMBG-a (13 cifara).
export function jeIspravanJmbg(jmbg) {
  if (!/^\d{13}$/.test(jmbg || '')) return false;
  const d = jmbg.split('').map(Number);
  const zbir = 7 * (d[0] + d[6]) + 6 * (d[1] + d[7]) + 5 * (d[2] + d[8]) + 4 * (d[3] + d[9]) + 3 * (d[4] + d[10]) + 2 * (d[5] + d[11]);
  let k = 11 - (zbir % 11);
  if (k > 9) k = 0;
  return k === d[12];
}

export function maskirajJmbg(jmbg) {
  return jmbg ? `•••••••••${jmbg.slice(-4)}` : '';
}

// JMBG zaposlenog iz zaštićene tabele (samo service ključ). Ako tabela ne postoji, vraća null.
export async function ucitajJmbg(supabase, korisnikId) {
  const { data, error } = await supabase.from('zaposleni_jmbg').select('jmbg').eq('korisnik_id', korisnikId).maybeSingle();
  if (error) return null;
  return data?.jmbg || null;
}
