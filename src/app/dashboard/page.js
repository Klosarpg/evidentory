'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const router = useRouter();
  
  // -- STANJA (STATE) --
  const [aktivniTab, setAktivniTab] = useState('zalihe'); 
  const [oprema, setOprema] = useState([]);
  const [istorija, setIstorija] = useState([]);
  const [pretraga, setPretraga] = useState('');

  // Modali (Prozorčići)
  const [otvorenModal, setOtvorenModal] = useState(null); 
  
  // Forma za Novi Artikal
  const [naziv, setNaziv] = useState('');
  const [oznaka, setOznaka] = useState('');
  const [opis, setOpis] = useState('');
  const [kategorija, setKategorija] = useState('Nekategorisano');

  // Forma za Brzi Ulaz/Izlaz
  const [izabraniArtikal, setIzabraniArtikal] = useState(null);
  const [kolicinaAkcija, setKolicinaAkcija] = useState(1);
  const [komentar, setKomentar] = useState('');

  // -- PREUZIMANJE PODATAKA --
  const preuzmiPodatke = async () => {
    const { data: opremaData } = await supabase.from('oprema').select('*').order('id', { ascending: false });
    if (opremaData) setOprema(opremaData);

    const { data: istorijaData } = await supabase.from('istorija').select('*').order('created_at', { ascending: false });
    if (istorijaData) setIstorija(istorijaData);
  };

  useEffect(() => {
    preuzmiPodatke();
  }, []);

  // -- FUNKCIJE ZA DUGMIĆE --
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const dodajNoviArtikal = async (e) => {
    e.preventDefault();
    if (!naziv) return;

    const { error } = await supabase.from('oprema').insert([{ 
      naziv, oznaka, opis, kategorija, kolicina: 0 
    }]);

    if (!error) {
      setOtvorenModal(null); 
      setNaziv(''); setOznaka(''); setOpis(''); setKategorija('Nekategorisano'); 
      preuzmiPodatke(); 
    } else {
      alert("Greška: " + error.message);
    }
  };

  const izvrsiBrzuAkciju = async (e) => {
    e.preventDefault();
    if (!izabraniArtikal || kolicinaAkcija <= 0) return;

    const tip = otvorenModal === 'brziUlaz' ? 'BRZI_ULAZ' : 'BRZI_IZLAZ';
    const novaKolicina = otvorenModal === 'brziUlaz' 
      ? izabraniArtikal.kolicina + Number(kolicinaAkcija)
      : izabraniArtikal.kolicina - Number(kolicinaAkcija);

    if (novaKolicina < 0) {
      alert("Greška: Nemate dovoljno robe na stanju za ovaj izlaz!");
      return;
    }

    await supabase.from('oprema').update({ kolicina: novaKolicina }).eq('id', izabraniArtikal.id);
    
    await supabase.from('istorija').insert([{
      artikal: izabraniArtikal.naziv,
      tip: tip,
      kolicina: Number(kolicinaAkcija),
      komentar: komentar || 'Ručni unos'
    }]);

    setOtvorenModal(null);
    setKolicinaAkcija(1); setKomentar(''); setIzabraniArtikal(null);
    preuzmiPodatke();
  };

  const otvoriBrzuAkciju = (tipAkcije) => {
    if (oprema.length === 0) {
      alert("Prvo dodajte neki artikal u bazu!");
      return;
    }
    setIzabraniArtikal(oprema[0]); 
    setOtvorenModal(tipAkcije);
  };

  const filtriranaOprema = oprema.filter(item => 
    item.naziv.toLowerCase().includes(pretraga.toLowerCase()) || 
    (item.oznaka && item.oznaka.toLowerCase().includes(pretraga.toLowerCase()))
  );

  const ukupnoUlaz = istorija.filter(i => i.tip.includes('ULAZ')).reduce((sum, i) => sum + i.kolicina, 0);
  const ukupnoIzlaz = istorija.filter(i => i.tip.includes('IZLAZ')).reduce((sum, i) => sum + i.kolicina, 0);

  return (
    <>
      <div className="flex h-screen bg-gray-50 overflow-hidden relative">
        
        {/* BOČNI MENI */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col justify-between z-10">
          <div>
            <div className="p-6 text-center">
              <h1 className="text-xl font-bold text-blue-900">🏬 SKLADIŠTE PRO</h1>
            </div>
            
            <div className="px-4 space-y-2">
              <button onClick={() => setAktivniTab('zalihe')} className={`w-full flex items-center px-4 py-3 rounded-md font-bold transition ${aktivniTab === 'zalihe' ? 'bg-blue-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                📦 Trenutne zalihe
              </button>
              <button onClick={() => setAktivniTab('izvjestaji')} className={`w-full flex items-center px-4 py-3 rounded-md font-bold transition ${aktivniTab === 'izvjestaji' ? 'bg-blue-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                📋 Izvještaj prometa
              </button>
            </div>

            <div className="mt-8 px-6">
              <h2 className="text-xs font-bold text-gray-400 mb-4 uppercase">Upravljanje</h2>
              <div className="space-y-3 text-sm">
                <button onClick={() => setOtvorenModal('noviArtikal')} className="flex items-center text-gray-600 hover:text-blue-600 transition w-full">
                  💾 Novi artikal
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200">
             <button onClick={handleLogout} className="w-full bg-gray-200 text-gray-700 py-2 rounded-md hover:bg-gray-300 font-bold transition">Odjavi se</button>
          </div>
        </div>

        {/* GLAVNI SADRŽAJ */}
        <div className="flex-1 overflow-y-auto p-8 relative z-0">
          
          {aktivniTab === 'zalihe' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-sm font-bold text-blue-900 mb-4">⚡ ROBNI DOKUMENTI I DIREKTNO KNJIŽENJE</h3>
                <div className="flex flex-wrap gap-3">
                  <button className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 opacity-50 cursor-not-allowed">➕ Stigla roba (+)</button>
                  <button className="bg-orange-500 text-white px-4 py-2 rounded font-bold hover:bg-orange-600 opacity-50 cursor-not-allowed">📤 Uzmi sa stanja (-)</button>
                  <button onClick={() => otvoriBrzuAkciju('brziUlaz')} className="bg-green-500 text-white px-3 py-2 rounded text-sm font-bold hover:bg-green-600 ml-4">⚡ Brzi Ulaz</button>
                  <button onClick={() => otvoriBrzuAkciju('brziIzlaz')} className="bg-red-500 text-white px-3 py-2 rounded text-sm font-bold hover:bg-red-600">⚡ Brzi Izlaz</button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <input type="text" placeholder="🔍 Brza pretraga po Nazivu ili Oznaci..." className="w-full px-4 py-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500" value={pretraga} onChange={(e) => setPretraga(e.target.value)} />
                </div>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white border-b border-gray-200 text-sm text-gray-600">
                    <tr>
                      <th className="p-4 font-semibold">Oznaka</th>
                      <th className="p-4 font-semibold">Kategorija / Naziv Artikla</th>
                      <th className="p-4 font-semibold text-center">Količina</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtriranaOprema.length === 0 ? (
                      <tr><td colSpan="3" className="p-6 text-center text-gray-500">Baza je prazna. Klikni na "Novi artikal" levo da dodaš robu.</td></tr>
                    ) : (
                      filtriranaOprema.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition">
                          <td className="p-4 text-gray-500 font-mono">{item.oznaka || '-'}</td>
                          <td className="p-4">
                            <div className="text-xs text-gray-400 font-bold uppercase">{item.kategorija}</div>
                            <div className="font-bold text-gray-800 text-lg">{item.naziv}</div>
                            <div className="text-sm text-gray-500">{item.opis}</div>
                          </td>
                          <td className="p-4 text-center font-bold text-xl text-blue-600">{item.kolicina} kom</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aktivniTab === 'izvjestaji' && (
            <div className="max-w-6xl mx-auto space-y-6">
               <div className="grid grid-cols-2 gap-6">
                  <div className="bg-green-50 border border-green-500 p-6 rounded-lg text-center">
                    <h3 className="text-green-800 font-bold text-sm mb-2">📥 UKUPAN ULAZ ROBE</h3>
                    <p className="text-3xl font-bold text-green-700">{ukupnoUlaz} kom</p>
                  </div>
                  <div className="bg-red-50 border border-red-500 p-6 rounded-lg text-center">
                    <h3 className="text-red-800 font-bold text-sm mb-2">📤 UKUPAN IZLAZ ROBE</h3>
                    <p className="text-3xl font-bold text-red-700">{ukupnoIzlaz} kom</p>
                  </div>
               </div>

               <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200"><h3 className="font-bold text-gray-700">🕒 Istorijski log promjena</h3></div>
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr><th className="p-3">Datum</th><th className="p-3">Artikal</th><th className="p-3 text-center">Tip</th><th className="p-3 text-center">Količina</th><th className="p-3">Komentar</th></tr>
                    </thead>
                    <tbody>
                      {istorija.length === 0 ? (
                        <tr><td colSpan="5" className="p-6 text-center text-gray-500">Nema istorije prometa.</td></tr>
                      ) : (
                        istorija.map(log => (
                          <tr key={log.id} className="border-b border-gray-50">
                            <td className="p-3 text-gray-500">{new Date(log.created_at).toLocaleString('sr-RS')}</td>
                            <td className="p-3 font-bold text-gray-800">{log.artikal}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${log.tip.includes('ULAZ') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{log.tip}</span>
                            </td>
                            <td className="p-3 text-center font-bold text-gray-800">{log.kolicina}</td>
                            <td className="p-3 text-gray-500">{log.komentar}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* --- MODALI (SADA SU POTPUNO IZVUČENI IZ GLAVNOG DIZAJNA) --- */}
      {otvorenModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999999, backgroundColor: 'rgba(0,0,0,0.6)' }} className="flex items-center justify-center backdrop-blur-sm">
          
          {otvorenModal === 'noviArtikal' && (
            <div className="bg-white p-6 rounded-lg shadow-xl w-96 animate-fade-in relative">
              <h2 className="text-xl font-bold mb-4 text-blue-900">💾 Dodaj novi artikal</h2>
              <form onSubmit={dodajNoviArtikal} className="space-y-4">
                <div><label className="block text-sm font-bold text-gray-700">Naziv artikla *</label><input required value={naziv} onChange={e=>setNaziv(e.target.value)} className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500" placeholder="Npr. Laptop Dell" /></div>
                <div><label className="block text-sm font-bold text-gray-700">Oznaka (Šifra)</label><input value={oznaka} onChange={e=>setOznaka(e.target.value)} className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500" placeholder="Npr. LT-01" /></div>
                <div><label className="block text-sm font-bold text-gray-700">Kategorija</label><input value={kategorija} onChange={e=>setKategorija(e.target.value)} className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm font-bold text-gray-700">Opis</label><textarea value={opis} onChange={e=>setOpis(e.target.value)} className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500"></textarea></div>
                <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                  <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-bold hover:bg-gray-200">Odustani</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Sačuvaj</button>
                </div>
              </form>
            </div>
          )}

          {(otvorenModal === 'brziUlaz' || otvorenModal === 'brziIzlaz') && (
            <div className="bg-white p-6 rounded-lg shadow-xl w-96 animate-fade-in relative">
              <h2 className={`text-xl font-bold mb-4 ${otvorenModal === 'brziUlaz' ? 'text-green-600' : 'text-red-600'}`}>
                ⚡ {otvorenModal === 'brziUlaz' ? 'Brzi Ulaz' : 'Brzi Izlaz'}
              </h2>
              <form onSubmit={izvrsiBrzuAkciju} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700">Izaberi artikal sa stanja</label>
                  <select className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500" onChange={(e) => setIzabraniArtikal(oprema.find(o => o.id == e.target.value))}>
                    {oprema.map(o => <option key={o.id} value={o.id}>{o.naziv} (Stanje: {o.kolicina})</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-bold text-gray-700">Količina</label><input type="number" min="1" value={kolicinaAkcija} onChange={e=>setKolicinaAkcija(e.target.value)} className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm font-bold text-gray-700">Razlog / Komentar</label><input placeholder="Npr. Ručni popis, greška..." value={komentar} onChange={e=>setKomentar(e.target.value)} className="w-full border p-2 rounded mt-1 outline-none focus:border-blue-500" /></div>
                <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                  <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-bold hover:bg-gray-200">Odustani</button>
                  <button type="submit" className={`px-4 py-2 text-white rounded font-bold ${otvorenModal==='brziUlaz'?'bg-green-600 hover:bg-green-700':'bg-red-600 hover:bg-red-700'}`}>Potvrdi knjiženje</button>
                </div>
              </form>
            </div>
          )}

        </div>
      )}
    </>
  );
}