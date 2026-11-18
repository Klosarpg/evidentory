// Zajednički okvir i polja za ekrane prijave, registracije i lozinke.

export function AuthOkvir({ podnaslov, children }) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">EVIDENTORY</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">{podnaslov}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function Polje({ id, label, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
        {label}
      </label>
      <input
        id={id}
        name={id}
        required
        {...props}
        className="w-full border border-slate-200 px-4 py-3 rounded-xl bg-slate-50 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-medium text-slate-800"
      />
    </div>
  );
}

export function Poruka({ tip = 'greska', children }) {
  if (!children) return null;
  const stil =
    tip === 'uspjeh'
      ? 'bg-green-50 border-green-200 text-green-800'
      : 'bg-red-50 border-red-200 text-red-700';
  return (
    <div role={tip === 'uspjeh' ? 'status' : 'alert'} className={`mb-6 p-3 border text-sm font-semibold rounded-xl text-center ${stil}`}>
      {children}
    </div>
  );
}

export function Dugme({ ucitavanje, tekstUcitavanja, children }) {
  return (
    <button
      type="submit"
      disabled={ucitavanje}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 mt-2 disabled:bg-blue-400 disabled:cursor-wait"
    >
      {ucitavanje ? tekstUcitavanja : children}
    </button>
  );
}

// Prevodi najčešće Supabase Auth greške na naš jezik.
export function prevediGresku(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('rate limit') || error?.status === 429)
    return 'Previše zahtjeva u kratkom roku. Pokušaj ponovo za nekoliko minuta.';
  if (m.includes('email not confirmed'))
    return 'Email još nije potvrđen. Otvori link koji smo ti poslali na email.';
  if (m.includes('invalid login credentials'))
    return 'Pogrešan email, korisničko ime ili lozinka.';
  if (m.includes('password should be') || m.includes('weak'))
    return 'Lozinka je preslaba. Koristi najmanje 8 znakova.';
  if (m.includes('same as the old') || m.includes('different from the old'))
    return 'Nova lozinka mora biti drugačija od stare.';
  if (m.includes('not authorized'))
    return 'Slanje emaila na ovu adresu trenutno nije moguće. Javi se administratoru.';
  if (m.includes('signups not allowed'))
    return 'Registracija je trenutno isključena. Javi se administratoru.';
  return 'Došlo je do greške. Pokušaj ponovo.';
}
