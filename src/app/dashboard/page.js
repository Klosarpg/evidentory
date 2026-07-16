'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Pomoćna funkcija koja učitava sliku iz public foldera pre generisanja PDF-a
const urlToBase64 = async (url) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Greška pri učitavanju slike za PDF:", error);
    return null;
  }
};

// Pomoćna funkcija za bezbedno parsiranje strukturisanog komentara otpremnice
const parsirajKomentarOtpremnice = (komentar) => {
  const regex = /Broj:\s*([^\s|]+)\s*\|\s*Kupac:\s*([^|]+)\s*\|\s*Grad:\s*([^|]+)\s*\|\s*Predao:\s*(.+)/;
  const match = komentar?.match(regex);
  if (match) {
    return {
      broj: match[1].trim(),
      kupac: match[2].trim(),
      grad: match[3].trim(),
      predao: match[4].trim()
    };
  }
  return null;
};

export default function Dashboard() {
  const router = useRouter();
  
  const [aktivniTab, setAktivniTab] = useState('zalihe'); 
  const [oprema, setOprema] = useState([]);
  const [istorija, setIstorija] = useState([]);
  const [pretraga, setPretraga] = useState('');
  const [otvorenModal, setOtvorenModal] = useState(null); 
  
  const [korisnikEmail, setKorisnikEmail] = useState('');
  const [uloga, setUloga] = useState(''); 

  // Stanja za dodavanje novog artikla
  const [naziv, setNaziv] = useState('');
  const [oznaka, setOznaka] = useState('');
  const [opis, setOpis] = useState('');
  const [kategorija, setKategorija] = useState('Nekategorisano');

  // Stanja za Prijem (Ulaz)
  const [izabraniArtikal, setIzabraniArtikal] = useState(null);
  const [kolicinaAkcija, setKolicinaAkcija] = useState(1);
  const [komentar, setKomentar] = useState('');

  // Stanja za Otpremnicu (Izlaz)
  const [kupacNaziv, setKupacNaziv] = useState('');
  const [kupacGrad, setKupacGrad] = useState('');
  const [predaoIme, setPredaoIme] = useState(''); 
  const [stavkeOtpremnice, setStavkeOtpremnice] = useState([
    { opremaId: '', kolicina: 1 }
  ]);

  // Stanje za interaktivni pregled stare otpremnice (Preview)
  const [pregledOtpremnice, setPregledOtpremnice] = useState(null);

  const inicijalizujAplikaciju = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return router.push('/');

      setKorisnikEmail(user.email);
      const { data: profilData } = await supabase.from('profili').select('uloga').eq('id', user.id).single();
      
      if (profilData && profilData.uloga) {
        setUloga(profilData.uloga);
      } else {
        setUloga('Radnik');
      }

      const { data: opremaData } = await supabase.from('oprema').select('*').order('id', { ascending: false });
      if (opremaData) {
        setOprema(opremaData);
        if (opremaData.length > 0) setIzabraniArtikal(opremaData[0]);
      }

      const { data: istorijaData } = await supabase.from('istorija').select('*').order('created_at', { ascending: false });
      if (istorijaData) setIstorija(istorijaData);
      
    } catch (error) {
      console.error("Greška pri učitavanju:", error);
      setUloga('Radnik');
    }
  };

  useEffect(() => {
    inicijalizujAplikaciju();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const dodajNoviArtikal = async (e) => {
    e.preventDefault();
    if (!naziv) return;
    const { error } = await supabase.from('oprema').insert([{ naziv, oznaka, opis, kategorija, kolicina: 0 }]);
    if (!error) {
      setOtvorenModal(null); setNaziv(''); setOznaka(''); setOpis(''); setKategorija('Nekategorisano'); 
      inicijalizujAplikaciju(); 
    } else alert("Greška: " + error.message);
  };

  const izvrsiBrziUlaz = async (e) => {
    e.preventDefault();
    if (!izabraniArtikal || kolicinaAkcija <= 0) return;
    
    const novaKolicina = izabraniArtikal.kolicina + Number(kolicinaAkcija);
    
    await supabase.from('oprema').update({ kolicina: novaKolicina }).eq('id', izabraniArtikal.id);
    await supabase.from('istorija').insert([{ 
      artikal: izabraniArtikal.naziv, 
      tip: 'BRZI_ULAZ', 
      kolicina: Number(kolicinaAkcija), 
      komentar: komentar || 'Ručni ulaz na stanje' 
    }]);

    setOtvorenModal(null); setKolicinaAkcija(1); setKomentar('');
    inicijalizujAplikaciju();
  };

  // --- AUTOMATSKO ODREĐIVANJE SLEDEĆEG BROJA OTPREMNICE ---
  const odrediSledeciBrojOtpremnice = () => {
    const danas = new Date();
    const dan = String(danas.getDate()).padStart(2, '0');
    const mesec = String(danas.getMonth() + 1).padStart(2, '0');
    const godina = danas.getFullYear();
    const prefix = `${dan}${mesec}`;

    // Filtriramo današnje izlaze otpremnica
    const danasnjiLogovi = istorija.filter(log => {
      if (log.tip !== 'IZLAZ_OTPREMNICA') return false;
      const logDatum = new Date(log.created_at);
      return logDatum.getDate() === danas.getDate() &&
             logDatum.getMonth() === danas.getMonth() &&
             logDatum.getFullYear() === danas.getFullYear();
    });

    // Skupljamo sve jedinstvene brojeve otpremnica iz komentara
    const pronadjeniBrojevi = new Set();
    danasnjiLogovi.forEach(log => {
      const match = log.komentar?.match(/Broj:\s*([^\s|]+)/);
      if (match) {
        pronadjeniBrojevi.add(match[1]);
      }
    });

    if (pronadjeniBrojevi.size === 0) {
      return `${prefix}/${godina}`; // Prva u toku dana
    } else {
      let maxIndex = 1;
      pronadjeniBrojevi.forEach(br => {
        if (br.includes('_')) {
          const delovi = br.split('_');
          const idx = parseInt(delovi[1], 10);
          if (!isNaN(idx) && idx > maxIndex) {
            maxIndex = idx;
          }
        }
      });
      return `${prefix}_${maxIndex + 1}_${godina}`; // Sledeća u toku dana
    }
  };

  // --- DINAMIČKO UPRAVLJANJE STAVKAMA OTPREMNICE ---
  const dodajStavkuOtpremnice = () => {
    setStavkeOtpremnice([...stavkeOtpremnice, { opremaId: oprema[0]?.id || '', kolicina: 1 }]);
  };

  const ukloniStavkuOtpremnice = (index) => {
    const noveStavke = stavkeOtpremnice.filter((_, i) => i !== index);
    setStavkeOtpremnice(noveStavke);
  };

  const promeniStavkuOtpremnice = (index, polje, vrednost) => {
    const noveStavke = [...stavkeOtpremnice];
    noveStavke[index][polje] = vrednost;
    setStavkeOtpremnice(noveStavke);
  };

  // --- KNJIŽENJE I GENERISANJE PDF OTPREMNICE ---
  const sacuvajIKnjiziOtpremnicu = async (e) => {
    e.preventDefault();
    if (!kupacNaziv || !kupacGrad || !predaoIme) return alert("Molimo popunite sva obavezna polja.");
    if (stavkeOtpremnice.length === 0 || stavkeOtpremnice.some(s => !s.opremaId)) {
      return alert("Molimo izaberite ispravne artikle.");
    }

    // 1. Provera zaliha
    for (let stavka of stavkeOtpremnice) {
      const artikalUBazi = oprema.find(o => o.id == stavka.opremaId);
      if (!artikalUBazi || artikalUBazi.kolicina < Number(stavka.kolicina)) {
        return alert(`Greška: Nema dovoljno artikla "${artikalUBazi?.naziv || 'Nepoznato'}" na stanju! (Dostupno: ${artikalUBazi?.kolicina || 0})`);
      }
    }

    // Određujemo jedinstveni broj otpremnice za ovu transakciju
    const brOtpremnice = odrediSledeciBrojOtpremnice();
    const standardniKomentar = `Broj: ${brOtpremnice} | Kupac: ${kupacNaziv} | Grad: ${kupacGrad} | Predao: ${predaoIme}`;

    // 2. Knjiženje i skidanje sa stanja
    const pripremljeneStavkeZaPdf = [];

    for (let stavka of stavkeOtpremnice) {
      const artikalUBazi = oprema.find(o => o.id == stavka.opremaId);
      const novaKolicina = artikalUBazi.kolicina - Number(stavka.kolicina);

      await supabase.from('oprema').update({ kolicina: novaKolicina }).eq('id', artikalUBazi.id);
      
      await supabase.from('istorija').insert([{
        artikal: artikalUBazi.naziv,
        tip: 'IZLAZ_OTPREMNICA',
        kolicina: Number(stavka.kolicina),
        komentar: standardniKomentar
      }]);

      pripremljeneStavkeZaPdf.push({
        naziv: artikalUBazi.naziv,
        oznaka: artikalUBazi.oznaka || '-',
        opis: artikalUBazi.opis || '-', 
        kolicina: stavka.kolicina
      });
    }

    // 3. Pokretanje PDF generatora
    await generisiPDFOtpremnicu(pripremljeneStavkeZaPdf, kupacNaziv, kupacGrad, predaoIme, brOtpremnice, new Date());

    // 4. Reset i zatvaranje
    setOtvorenModal(null);
    setKupacNaziv('');
    setKupacGrad('');
    setPredaoIme('');
    setStavkeOtpremnice([{ opremaId: oprema[0]?.id || '', kolicina: 1 }]);
    
    inicijalizujAplikaciju();
  };

  const generisiPDFOtpremnicu = async (stavke, kupac, grad, predao, broj, datumObj = new Date()) => {
    const doc = new jsPDF();
    
    const dan = String(datumObj.getDate()).padStart(2, '0');
    const mesec = String(datumObj.getMonth() + 1).padStart(2, '0');
    const godina = datumObj.getFullYear();

    // --- LEVA STRANA: Podaci o firmi (Montora) ---
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Montora Software d.o.o.", 14, 20);
    doc.text("Capital Plaza, Ul. Seika Zaida 13/L2-A06", 14, 25);
    doc.text("81000 Podgorica, Crna Gora", 14, 30);
    doc.text("tel: +382 20 274 029, +382 20 274 030", 14, 35);

    // --- DESNA STRANA: Logo ---
    try {
      const logoBase64 = await urlToBase64('/montora-logo.png');
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 135, 12, 60, 15);
      }
    } catch (e) {
      console.error("Logo greška:", e);
    }

    doc.setDrawColor(220, 225, 230);
    doc.line(14, 43, 196, 43);

    // --- PODACI O KUPCU I OTPREMNICI ---
    doc.setFont('Helvetica', 'bold');
    doc.text("Kupac / Primalac:", 14, 52);
    doc.setFont('Helvetica', 'normal');
    doc.text(kupac, 14, 58);
    doc.text(grad, 14, 63);

    doc.setFont('Helvetica', 'bold');
    doc.text(`Otpremnica br.: ${broj}`, 120, 52);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Datum: ${dan}.${mesec}.${godina}. godine`, 120, 58);

    // --- TABELA ---
    const tabeleKolone = [["Red. Br.", "Opis robe / artikla", "Kol."]];
    const tabelaRedovi = stavke.map((st, index) => [
      `${index + 1}.`,
      st.opis !== '-' && st.opis ? st.opis : st.naziv, 
      st.kolicina.toString()
    ]);

    autoTable(doc, {
      startY: 72,
      head: tabeleKolone,
      body: tabelaRedovi,
      theme: 'grid',
      headStyles: { fillColor: [240, 243, 246], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.2, lineColor: [200, 200, 200] },
      styles: { fontSize: 9, cellPadding: 4, textColor: [0, 0, 0], lineColor: [200, 200, 200] },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' }, 
        1: { cellWidth: 145 }, 
        2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } 
      }
    });

    // --- POTPISI ---
    const finalY = doc.lastAutoTable.finalY + 30;

    doc.setFont('Helvetica', 'normal');
    doc.text(`Za ${kupac}`, 14, finalY);
    doc.setDrawColor(180, 180, 180);
    doc.line(14, finalY + 10, 80, finalY + 10);
    doc.setFontSize(8);
    doc.text("(Primio/la)", 14, finalY + 14);

    doc.setFontSize(10);
    doc.text("Za Montora software d.o.o.", 120, finalY);
    doc.setFont('Helvetica', 'bold');
    doc.text(predao, 120, finalY + 6); 
    doc.line(120, finalY + 10, 186, finalY + 10);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("(Predao/la)", 120, finalY + 14);

    doc.save(`Otpremnica_${broj.replace('/', '_')}.pdf`);
  };

  // --- REKONSTRUKCIJA OTPREMNICE ZA INTERAKTIVNI PREGLED (PREVIEW) ---
  const otvoriPregledOtpremnice = (log) => {
    const detalji = parsirajKomentarOtpremnice(log.komentar);
    if (!detalji) return alert("Nije moguće učitati detalje ove otpremnice.");

    // Pronađi sve logove u istoriji koji dele isti broj otpremnice
    const srodniLogovi = istorija.filter(l => l.tip === 'IZLAZ_OTPREMNICA' && l.komentar?.includes(`Broj: ${detalji.broj}`));

    // Pretvaramo logove u stavke sa opisom i oznakom iz trenutnih zaliha
    const rekonstruisaneStavke = srodniLogovi.map(l => {
      const artikalUBazi = oprema.find(o => o.naziv === l.artikal);
      return {
        naziv: l.artikal,
        oznaka: artikalUBazi?.oznaka || '-',
        opis: artikalUBazi?.opis || '-',
        kolicina: l.kolicina
      };
    });

    setPregledOtpremnice({
      broj: detalji.broj,
      kupac: detalji.kupac,
      grad: detalji.grad,
      predao: detalji.predao,
      datum: new Date(log.created_at).toLocaleDateString('sr-RS'),
      datumObj: new Date(log.created_at),
      stavke: rekonstruisaneStavke
    });
  };

  // === EXCEL EXPORT (Identičan Python skripti) ===
  const preuzmiExcel = async () => {
    if (oprema.length === 0) return alert("Nema podataka za eksport!");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trenutno Stanje', {
      views: [{ showGridLines: true }]
    });

    worksheet.columns = [
      { header: '', key: 'colA', width: 28 },
      { header: '', key: 'colB', width: 22 },
      { header: '', key: 'colC', width: 45 },
      { header: '', key: 'colD', width: 22 },
      { header: '', key: 'colE', width: 16 }
    ];

    const tankiBorder = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };

    worksheet.mergeCells('A1:E1');
    const naslovnaCelija = worksheet.getCell('A1');
    naslovnaCelija.value = 'IZVJEŠTAJ STANJA NA ZALIHAMA (SA REZERVACIJAMA)';
    naslovnaCelija.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    naslovnaCelija.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F497D' } }; 
    naslovnaCelija.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(1).height = 40;

    worksheet.getRow(2).height = 15;

    const koloneNazivi = ['Naziv Artikla', 'Oznaka', 'Opis', 'Količina na Stanju', 'Rezervisano'];
    const zaglavljeRed = worksheet.getRow(3);
    zaglavljeRed.height = 25;
    
    koloneNazivi.forEach((naziv, indeks) => {
      const celija = zaglavljeRed.getCell(indeks + 1);
      celija.value = naziv;
      celija.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      celija.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }; 
      celija.alignment = { vertical: 'middle', horizontal: indeks >= 3 ? 'right' : 'left', indent: indeks < 3 ? 1 : 0 };
      celija.border = tankiBorder;
    });

    const sveKategorije = [...new Set(oprema.map(item => item.kategorija || 'Nekategorisano'))];
    let trenutniRedIdx = 4;

    sveKategorije.forEach((kat, katIdx) => {
      if (katIdx > 0) {
        worksheet.getRow(trenutniRedIdx).height = 15;
        trenutniRedIdx++;
      }

      const katRed = worksheet.getRow(trenutniRedIdx);
      katRed.height = 25;
      worksheet.mergeCells(`A${trenutniRedIdx}:E${trenutniRedIdx}`);
      
      const katCelija = katRed.getCell(1);
      katCelija.value = ` KATEGORIJA: ${kat}`;
      katCelija.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F497D' } }; 
      katCelija.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EDF4' } }; 
      katCelija.alignment = { vertical: 'middle', horizontal: 'left' };
      
      for (let c = 1; c <= 5; c++) {
        katRed.getCell(c).border = tankiBorder;
      }
      
      trenutniRedIdx++;

      const artikliUKategoriji = oprema.filter(item => (item.kategorija || 'Nekategorisano') === kat);

      artikliUKategoriji.forEach(artikal => {
        const red = worksheet.getRow(trenutniRedIdx);
        red.height = 20;

        const cA = red.getCell(1);
        cA.value = `   ${artikal.naziv}`;
        cA.font = { name: 'Arial', size: 10, bold: false };
        cA.alignment = { vertical: 'middle', horizontal: 'left' };

        const cB = red.getCell(2);
        cB.value = artikal.oznaka || '';
        cB.font = { name: 'Arial', size: 10, bold: false };
        cB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        const cC = red.getCell(3);
        cC.value = artikal.opis || '';
        cC.font = { name: 'Arial', size: 10, bold: false };
        cC.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        const cD = red.getCell(4);
        cD.value = Number(artikal.kolicina);
        cD.font = { name: 'Arial', size: 10, bold: false };
        cD.alignment = { vertical: 'middle', horizontal: 'right' };

        const cE = red.getCell(5);
        cE.value = Number(artikal.rezervisano || 0);
        cE.font = { name: 'Arial', size: 10, bold: false };
        cE.alignment = { vertical: 'middle', horizontal: 'right' };

        for (let c = 1; c <= 5; c++) {
          red.getCell(c).border = tankiBorder;
        }

        trenutniRedIdx++;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Evidentory_Stanje_Zaliha_${new Date().toLocaleDateString('sr-RS')}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filtriranaOprema = oprema.filter(item => 
    item.naziv.toLowerCase().includes(pretraga.toLowerCase()) || (item.oznaka && item.oznaka.toLowerCase().includes(pretraga.toLowerCase()))
  );

  if (!uloga) return <div className="h-screen w-screen flex items-center justify-center bg-[#f3f4f6]">Učitavanje...</div>;

  return (
    <>
      <div className="flex h-screen bg-[#f3f4f6] font-sans overflow-hidden">
        
        {/* TAMNI BOČNI MENI */}
        <div className="w-[260px] bg-[#0F172A] text-slate-300 flex flex-col shadow-2xl z-10 shrink-0">
          <div className="p-6 border-b border-slate-700/50">
            <h1 className="text-xl font-bold text-white tracking-wide">EVIDENTORY</h1>
            <div className="mt-2 inline-flex items-center px-2 py-1 bg-slate-800 rounded text-[11px] font-medium tracking-wide uppercase text-slate-400">
              {uloga}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <button onClick={() => setAktivniTab('zalihe')} className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-all text-sm ${aktivniTab === 'zalihe' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800/50 hover:text-white'}`}>
              Pregled Zaliha
            </button>
            
            {uloga === 'Admin' && (
              <button onClick={() => setAktivniTab('izvjestaji')} className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-all text-sm ${aktivniTab === 'izvjestaji' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-800/50 hover:text-white'}`}>
                Statistika i Promet
              </button>
            )}

            {uloga === 'Admin' && (
              <div className="mt-8 pt-6 border-t border-slate-700/50">
                <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Baza</p>
                <button onClick={() => setOtvorenModal('noviArtikal')} className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all hover:bg-slate-800 hover:text-white">Novi artikal</button>
                <button className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all hover:bg-slate-800 hover:text-white">Uredi artikal</button>
                <button className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all hover:bg-red-500/10 text-red-400 hover:text-red-300">Obriši artikal</button>
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-900/50 border-t border-slate-800">
             <div className="text-xs text-slate-500 mb-3 px-2 truncate">{korisnikEmail}</div>
             <button onClick={handleLogout} className="w-full py-2.5 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all">Odjavi se</button>
          </div>
        </div>

        {/* GLAVNI DEO */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {aktivniTab === 'zalihe' && (
              <>
                {/* INFO KARTICE */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100">
                    <p className="text-sm font-semibold text-slate-500 mb-1">Ukupno na stanju</p>
                    <h3 className="text-3xl font-bold text-slate-800">{oprema.reduce((sum, item) => sum + item.kolicina, 0)}</h3>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100">
                    <p className="text-sm font-semibold text-slate-500 mb-1">Različitih artikala</p>
                    <h3 className="text-3xl font-bold text-slate-800">{oprema.length}</h3>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 flex flex-col justify-center">
                    <p className="text-sm font-semibold text-slate-500 mb-3">Preuzimanje izveštaja</p>
                    <div className="flex">
                      <button onClick={preuzmiExcel} className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-bold hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-all active:scale-95 flex items-center justify-center">
                        📗 Preuzmi stanje (Excel)
                      </button>
                    </div>
                  </div>
                </div>

                {/* TABELA */}
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden flex flex-col">
                  
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                    <div className="w-72">
                      <input type="text" placeholder="Pretraži inventar..." className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={pretraga} onChange={(e) => setPretraga(e.target.value)} />
                    </div>
                    {uloga === 'Admin' && (
                      <div className="flex gap-2">
                        <button onClick={() => setOtvorenModal('brziUlaz')} className="bg-slate-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-900 transition-all">Prijem (Ulaz)</button>
                        <button onClick={() => { setOtvorenModal('otpremnica'); setStavkeOtpremnice([{ opremaId: oprema[0]?.id || '', kolicina: 1 }]); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all shadow-md shadow-blue-200">Otpremnica (Izlaz)</button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Šifra</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Naziv artikla</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Kategorija</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stanje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filtriranaOprema.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-mono text-slate-500">{item.oznaka || '-'}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-800">{item.naziv}</div>
                              {item.opis && <div className="text-xs text-slate-400 mt-1">{item.opis}</div>}
                            </td>
                            <td className="px-6 py-4"><span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">{item.kategorija}</span></td>
                            <td className="px-6 py-4 text-right font-semibold text-slate-800">{item.kolicina}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* HISTORIJA PROMETA TAB (Sa opcijom za Preview i Reprint) */}
            {aktivniTab === 'izvjestaji' && uloga === 'Admin' && (
               <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100"><h3 className="font-semibold text-slate-800">Istorija prometa</h3></div>
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-white border-b border-slate-100 text-slate-400 uppercase text-xs font-semibold">
                      <tr>
                        <th className="px-6 py-4">Datum</th>
                        <th className="px-6 py-4">Artikal</th>
                        <th className="px-6 py-4">Tip</th>
                        <th className="px-6 py-4 text-right">Kol.</th>
                        <th className="px-6 py-4">Komentar</th>
                        <th className="px-6 py-4 text-center">Akcija</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {istorija.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 text-slate-500">{new Date(log.created_at).toLocaleString('sr-RS')}</td>
                            <td className="px-6 py-4 font-medium text-slate-800">{log.artikal}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${log.tip.includes('ULAZ') ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {log.tip.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-slate-800">{log.kolicina}</td>
                            <td className="px-6 py-4 text-slate-500 text-xs">{log.komentar || '-'}</td>
                            <td className="px-6 py-4 text-center">
                              {log.tip === 'IZLAZ_OTPREMNICA' && (
                                <button 
                                  onClick={() => otvoriPregledOtpremnice(log)} 
                                  className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-100 transition-colors"
                                >
                                  📄 Otpremnica
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: NOVI ARTIKAL */}
      {otvorenModal === 'noviArtikal' && uloga === 'Admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
              <h2 className="text-lg font-bold mb-5 text-slate-800">Novi artikal</h2>
              <form onSubmit={dodajNoviArtikal} className="space-y-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Naziv artikla *</label><input required value={naziv} onChange={e=>setNaziv(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Oznaka (Šifra)</label><input value={oznaka} onChange={e=>setOznaka(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Kategorija</label><input value={kategorija} onChange={e=>setKategorija(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Opis</label><textarea value={opis} onChange={e=>setOpis(e.target.value)} rows="3" className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm resize-none"></textarea></div>
                  <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">Odustani</button>
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Sačuvaj</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: PRIJEM (ULAZ) */}
      {otvorenModal === 'brziUlaz' && uloga === 'Admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
              <h2 className="text-lg font-bold mb-5 text-slate-800">Ulaz robe (Prijem)</h2>
              <form onSubmit={izvrsiBrziUlaz} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Izaberi artikal</label>
                    <select className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm bg-white" onChange={(e) => setIzabraniArtikal(oprema.find(o => o.id == e.target.value))}>
                      {oprema.map(o => <option key={o.id} value={o.id}>{o.naziv} (Stanje: {o.kolicina})</option>)}
                    </select>
                  </div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Količina</label><input type="number" min="1" value={kolicinaAkcija} onChange={e=>setKolicinaAkcija(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Komentar / Napomena</label><input value={komentar} onChange={e=>setKomentar(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
                  <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">Odustani</button>
                      <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">Potvrdi ulaz</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: OTPREMNICA (VIŠESTRUKI IZLAZ SA PDF-OM) */}
      {otvorenModal === 'otpremnica' && uloga === 'Admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-2xl border border-slate-100 my-8">
              <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                <h2 className="text-xl font-bold text-slate-800">Nova Otpremnica</h2>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">IZLAZ ROBE</span>
              </div>
              
              <form onSubmit={sacuvajIKnjiziOtpremnicu} className="space-y-6">
                  {/* Podaci o Kupcu i Izdavaocu */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200/60">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Naziv kupca / ustanove *</label>
                      <input required placeholder="Klijent" value={kupacNaziv} onChange={e=>setKupacNaziv(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Grad / Lokacija *</label>
                      <input required placeholder="Grad" value={kupacGrad} onChange={e=>setKupacGrad(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Otpremnicu predao/la *</label>
                      <input required placeholder="Ime Prezime" value={predaoIme} onChange={e=>setPredaoIme(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-semibold" />
                    </div>
                  </div>

                  {/* Dinamičke Stavke Otpremnice */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stavke na otpremnici</h3>
                      <button type="button" onClick={dodajStavkuOtpremnice} className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                        + Dodaj artikal
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
                      {stavkeOtpremnice.map((stavka, index) => (
                        <div key={index} className="flex gap-3 items-center bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                          
                          {/* Izbor Artikla */}
                          <div className="flex-1">
                            <select value={stavka.opremaId} onChange={(e) => promeniStavkuOtpremnice(index, 'opremaId', e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg outline-none focus:border-blue-500 text-sm bg-white">
                              <option value="">Izaberi artikal...</option>
                              {oprema.map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.naziv} (Na stanju: {o.kolicina})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Količina */}
                          <div className="w-24">
                            <input type="number" min="1" value={stavka.kolicina} onChange={(e) => promeniStavkuOtpremnice(index, 'kolicina', e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg outline-none focus:border-blue-500 text-sm text-center font-bold" />
                          </div>

                          {/* Dugme za brisanje reda */}
                          <button type="button" onClick={() => ukloniStavkuOtpremnice(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Ukloni stavku">
                            ✕
                          </button>

                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dugmad na dnu modala */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors">
                        Odustani
                      </button>
                      <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-blue-100">
                        Knjiži i generiši otpremnicu
                      </button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: PREGLED / PREVIEW POSTOJEĆE OTPREMNICE */}
      {pregledOtpremnice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-100 my-8">
            
            {/* Zaglavlje Preview Prozora */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Pregled Otpremnice #{pregledOtpremnice.broj}</h2>
                <p className="text-xs text-slate-400 mt-1">Datum kreiranja dokumenta: {pregledOtpremnice.datum}</p>
              </div>
              <button onClick={() => setPregledOtpremnice(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
            </div>

            {/* Vizuelna Simulacija A4 Otpremnice */}
            <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/50 space-y-6 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800">Montora Software d.o.o.</h3>
                  <p className="text-xs text-slate-500 mt-1">Capital Plaza, Ul. Šeika Zaida 13/L2-A06</p>
                  <p className="text-xs text-slate-500">81000 Podgorica, Crna Gora</p>
                </div>
                <div className="text-right">
                  <h3 className="font-bold text-slate-800">Kupac / Primalac:</h3>
                  <p className="text-slate-600 mt-1 font-medium">{pregledOtpremnice.kupac}</p>
                  <p className="text-slate-500 text-xs">{pregledOtpremnice.grad}</p>
                </div>
              </div>

              {/* Tabela Stavki */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 text-center w-12">R.B.</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500">Opis robe / artikla</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 text-center w-16">Kol.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pregledOtpremnice.stavke.map((st, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 text-slate-500 text-center">{i + 1}.</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800">{st.opis !== '-' && st.opis ? st.opis : st.naziv}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">{st.kolicina}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Potpisi */}
              <div className="flex justify-between pt-6">
                <div>
                  <p className="text-xs text-slate-500">Za {pregledOtpremnice.kupac}</p>
                  <div className="border-b border-slate-300 w-44 mt-6"></div>
                  <p className="text-[10px] text-slate-400 mt-1">(Primio/la)</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Za Montora software d.o.o.</p>
                  <p className="text-xs font-bold text-slate-700 mt-2">{pregledOtpremnice.predao}</p>
                  <div className="border-b border-slate-300 w-44 mt-2 ml-auto"></div>
                  <p className="text-[10px] text-slate-400 mt-1">(Predao/la)</p>
                </div>
              </div>
            </div>

            {/* Akcije */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setPregledOtpremnice(null)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors">
                Zatvori
              </button>
              <button 
                onClick={async () => {
                  await generisiPDFOtpremnicu(
                    pregledOtpremnice.stavke,
                    pregledOtpremnice.kupac,
                    pregledOtpremnice.grad,
                    pregledOtpremnice.predao,
                    pregledOtpremnice.broj,
                    pregledOtpremnice.datumObj
                  );
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-blue-100 flex items-center gap-2"
              >
                ⬇️ Preuzmi PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}