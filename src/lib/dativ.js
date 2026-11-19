// Dativ imena i prezimena za tekst rješenja ("Zaposlenoj Katarini Živković", "Zaposlenom Marku Markoviću").
// Pravila pokrivaju uobičajena imena; za izuzetke admin upisuje oblik ručno u Administraciji.

const POSTOJANO_A = new Set(['petar', 'aleksandar', 'dimitar']); // Petar → Petru

function dativRijeci(rijec, zenski) {
  if (!rijec) return rijec;
  const malo = rijec.toLowerCase();
  if (zenski) {
    // Katarina → Katarini; prezimena na -ić, -ović i sl. se za žene ne mijenjaju
    return malo.endsWith('a') ? rijec.slice(0, -1) + 'i' : rijec;
  }
  if (malo.endsWith('a')) return rijec.slice(0, -1) + 'i'; // Nikola → Nikoli
  if (malo.endsWith('o') || malo.endsWith('e')) return rijec.slice(0, -1) + 'u'; // Marko → Marku, Đorđe → Đorđu
  if (POSTOJANO_A.has(malo)) return rijec.slice(0, -2) + rijec.slice(-1) + 'u'; // Petar → Petru
  if (/[aeiou]$/i.test(malo)) return rijec;
  return rijec + 'u'; // Milan → Milanu, Marković → Markoviću
}

export function dativImena(imePrezime, pol) {
  const zenski = pol === 'Ž';
  return String(imePrezime || '')
    .trim()
    .split(/\s+/)
    .map((dio) => dio.split('-').map((d) => dativRijeci(d, zenski)).join('-'))
    .join(' ');
}
