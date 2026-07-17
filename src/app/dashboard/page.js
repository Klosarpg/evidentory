'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    console.error("Greška pri učitavanju slike:", error);
    return null;
  }
};

const izbaciKvacice = (tekst) => {
  if (!tekst) return '';
  return tekst
    .replace(/č/g, 'c').replace(/Č/g, 'C')
    .replace(/ć/g, 'c').replace(/Ć/g, 'C')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z')
    .replace(/đ/g, 'dj').replace(/Đ/g, 'Dj');
};

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
  const [izabranaKategorija, setIzabranaKategorija] = useState('Sve'); 
  const [oprema, setOprema] = useState([]);
  const [istorija, setIstorija] = useState([]);
  const [profili, setProfili] = useState([]); 
  const [komitenti, setKomitenti] = useState([]); 
  const [pretraga, setPretraga] = useState('');
  const [otvorenModal, setOtvorenModal] = useState(null); 
  
  const [korisnikEmail, setKorisnikEmail] = useState(''); 
  const [uloga, setUloga] = useState(''); 

  const [naziv, setNaziv] = useState('');
  const [oznaka, setOznaka] = useState('');
  const [opis, setOpis] = useState('');
  const [kategorija, setKategorija] = useState('Nekategorisano');
  const [plu, setPlu] = useState(''); 

  const [stavkeUlaza, setStavkeUlaza] = useState([{ opremaId: '', kolicina: 1 }]);
  const [komentar, setKomentar] = useState('');
  const [dobavljacId, setDobavljacId] = useState('');
  const [noviDobavljacNaziv, setNoviDobavljacNaziv] = useState('');
  const [noviDobavljacGrad, setNoviDobavljacGrad] = useState('');

  const [kupacId, setKupacId] = useState('');
  const [noviKupacNaziv, setNoviKupacNaziv] = useState('');
  const [noviKupacGrad, setNoviKupacGrad] = useState('');
  const [predaoIme, setPredaoIme] = useState(''); 
  const [stavkeOtpremnice, setStavkeOtpremnice] = useState([
    { opremaId: '', kolicina: 1, poRezervaciji: false }
  ]);

  const [rezervacijaKupacId, setRezervacijaKupacId] = useState('');
  const [noviRezKupacNaziv, setNoviRezKupacNaziv] = useState('');
  const [noviRezKupacGrad, setNoviRezKupacGrad] = useState('');
  
  const [otkaziKlijentId, setOtkaziKlijentId] = useState(''); 
  const [izabraniArtikal, setIzabraniArtikal] = useState(null);
  const [kolicinaAkcija, setKolicinaAkcija] = useState(1);

  const [logZaBrisanje, setLogZaBrisanje] = useState(null);
  const [vratiNaStanje, setVratiNaStanje] = useState(false);

  const [adminKomitentNaziv, setAdminKomitentNaziv] = useState('');
  const [adminKomitentGrad, setAdminKomitentGrad] = useState('');
  const [adminKomitentTip, setAdminKomitentTip] = useState('Dobavljac');
  const [urediKomitentId, setUrediKomitentId] = useState(null);

  const [artikalZaBrisanjeId, setArtikalZaBrisanjeId] = useState('');
  const [pregledOtpremnice, setPregledOtpremnice] = useState(null);
  const [potvrdaModal, setPotvrdaModal] = useState(null); 

  const [otvoreneAkcijeId, setOtvoreneAkcijeId] = useState(null);

  const paziIPokreniObavestenje = (naslov, poruka) => {
    setPotvrdaModal({ naslov, poruka, samoObavestenje: true });
  };

  const inicijalizujAplikaciju = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return router.push('/');

      const cistoIme = user.email.split('@')[0];
      setKorisnikEmail(cistoIme);

      const { data: profilData } = await supabase.from('profili').select('uloga').eq('id', user.id).single();
      
      let trenutnaUloga = 'Korisnik';
      if (profilData && profilData.uloga) {
        trenutnaUloga = profilData.uloga;
        setUloga(profilData.uloga);
      } else {
        setUloga('Korisnik');
      }

      if (trenutnaUloga === 'Admin') {
        const { data: sviProfili } = await supabase.from('profili').select('*').order('email', { ascending: true });
        if (sviProfili) setProfili(sviProfili);
      }

      const { data: komitentiData } = await supabase.from('komitenti').select('*').order('naziv', { ascending: true });
      if (komitentiData) setKomitenti(komitentiData);

      const { data: opremaData } = await supabase.from('oprema').select('*').order('id', { ascending: false });
      if (opremaData) {
        setOprema(opremaData);
        if (opremaData.length > 0 && !izabraniArtikal) setIzabraniArtikal(opremaData[0]);
      }

      const { data: istorijaData } = await supabase.from('istorija').select('*').order('created_at', { ascending: false });
      if (istorijaData) setIstorija(istorijaData);
      
    } catch (error) {
      console.error("Greška pri učitavanju:", error);
      setUloga('Korisnik');
    }
  };

  useEffect(() => {
    inicijalizujAplikaciju();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const mozeDaPovlaciIUnosi = uloga === 'Admin' || uloga === 'Korisnik sa pravom povlacenja';
  const jeLiAdmin = uloga === 'Admin';

  const dogodiSeIzmenaArtiklaUStavci = (index, opremaId) => {
    const noveStavke = [...stavkeOtpremnice];
    noveStavke[index].opremaId = opremaId;
    noveStavke[index].poRezervaciji = false; 
    setStavkeOtpremnice(noveStavke);
  };

  const dohvatiAktivneRezervacije = (artikalNaziv, rezervisanoUkupno) => {
    if (!rezervisanoUkupno || rezervisanoUkupno <= 0) return [];
    const logovi = istorija.filter(l => l.artikal === artikalNaziv && 
      (l.tip === 'REZERVACIJA' || l.tip === 'OTKAZANA_REZERVACIJA' || (l.tip === 'IZLAZ_OTPREMNICA' && l.komentar?.includes('Po rezervaciji')))
    );

    const klijentiSume = {};
    let nerasporedjenoOtkazano = 0;
    const sortiraniLogovi = [...logovi].reverse();

    sortiraniLogovi.forEach(log => {
      if (log.tip === 'REZERVACIJA') {
        const match = log.komentar?.match(/Rezervisano za:\s*([^|]+)/);
        const klijent = match ? match[1].trim() : "Nepoznat klijent";
        klijentiSume[klijent] = (klijentiSume[klijent] || 0) + log.kolicina;
      } 
      else if (log.tip === 'IZLAZ_OTPREMNICA') {
        const match = log.komentar?.match(/Kupac:\s*([^|]+)/);
        const klijentText = match ? match[1].trim() : "Nepoznat";
        let pronadjenKlijent = null;
        for (let key of Object.keys(klijentiSume)) {
           if (key.includes(klijentText) || klijentText.includes(key)) { pronadjenKlijent = key; break; }
        }
        if (pronadjenKlijent && klijentiSume[pronadjenKlijent] > 0) klijentiSume[pronadjenKlijent] -= log.kolicina;
        else nerasporedjenoOtkazano += log.kolicina;
      }
      else if (log.tip === 'OTKAZANA_REZERVACIJA') {
        const match = log.komentar?.match(/Klijent:\s*([^|]+)/);
        if (match) {
          const klijent = match[1].trim();
          let pronadjen = Object.keys(klijentiSume).find(k => k.includes(klijent) || klijent.includes(k));
          if (pronadjen && klijentiSume[pronadjen] > 0) klijentiSume[pronadjen] -= log.kolicina;
          else nerasporedjenoOtkazano += log.kolicina;
        } else {
          nerasporedjenoOtkazano += log.kolicina;
        }
      }
    });

    while (nerasporedjenoOtkazano > 0) {
      const dostupni = Object.keys(klijentiSume).filter(k => klijentiSume[k] > 0);
      if (dostupni.length === 0) break;
      dostupni.sort((a, b) => klijentiSume[b] - klijentiSume[a]);
      const klijent = dostupni[0];
      const zaSkidanje = Math.min(klijentiSume[klijent], nerasporedjenoOtkazano);
      klijentiSume[klijent] -= zaSkidanje; nerasporedjenoOtkazano -= zaSkidanje;
    }

    return Object.keys(klijentiSume).filter(k => klijentiSume[k] > 0).map(k => ({ klijent: k, kolicina: klijentiSume[k] }));
  };

  // 📌 POŠTENO VRAĆENA FUNKCIJA: Popravljen dodaj artikal crash!
  const dodajNoviArtikal = async (e) => {
    e.preventDefault();
    if (!naziv) return;
    const { error } = await supabase.from('oprema').insert([{ 
      naziv, oznaka, opis, kategorija, kolicina: 0, rezervisano: 0, plu: plu ? Number(plu) : 0 
    }]);
    if (!error) {
      setOtvorenModal(null); setNaziv(''); setOznaka(''); setOpis(''); setKategorija('Nekategorisano'); setPlu('');
      inicijalizujAplikaciju(); 
    } else paziIPokreniObavestenje("Greška", error.message);
  };

  const otvoriUrediArtikal = (art) => {
    const pocetni = art || oprema[0];
    if (!pocetni) return paziIPokreniObavestenje("Obaveštenje", "Baza je prazna!");
    setIzabraniArtikal(pocetni); setNaziv(pocetni.naziv || ''); setOznaka(pocetni.oznaka || '');
    setOpis(pocetni.opis || ''); setKategorija(pocetni.kategorija || 'Nekategorisano'); setPlu(pocetni.plu || '');
    setOtvorenModal('urediArtikal');
  };

  const handleIzaberiArtikalZaUredjivanje = (id) => {
    const art = oprema.find(o => o.id == id);
    if (art) {
      setIzabraniArtikal(art); setNaziv(art.naziv || ''); setOznaka(art.oznaka || '');
      setOpis(art.opis || ''); setKategorija(art.kategorija || 'Nekategorisano'); setPlu(art.plu || '');
    }
  };

  const azurirajArtikal = async (e) => {
    e.preventDefault();
    if (!izabraniArtikal || !naziv) return;
    const { error } = await supabase.from('oprema').update({ naziv, oznaka, opis, kategorija, plu: plu ? Number(plu) : 0 }).eq('id', izabraniArtikal.id);
    if (!error) {
      setOtvorenModal(null); setNaziv(''); setOznaka(''); setOpis(''); setKategorija('Nekategorisano'); setPlu(''); setIzabraniArtikal(null);
      inicijalizujAplikaciju();
    } else paziIPokreniObavestenje("Greška", "Greška pri ažuriranju: " + error.message);
  };

  const pokreniBrisanjeArtiklaDirektno = (art) => {
    if (!art) return;
    setPotvrdaModal({
      naslov: "Obriši artikal",
      poruka: `Da li ste sigurni da želite trajno obrisati artikal "${art.naziv}"?`,
      akcija: async () => {
        const { error } = await supabase.from('oprema').delete().eq('id', art.id);
        if (!error) { inicijalizujAplikaciju(); } 
        else paziIPokreniObavestenje("Greška", "Nije moguće obrisati artikal. Možda je vezan za istoriju prometa.");
        setPotvrdaModal(null);
      }
    });
  };

  const dogodiSeIzmenaKomitenta = async (e) => {
    e.preventDefault();
    if (!adminKomitentNaziv) return;
    if (urediKomitentId) {
      const { error } = await supabase.from('komitenti').update({ naziv: adminKomitentNaziv, grad: adminKomitentGrad, tip: adminKomitentTip }).eq('id', urediKomitentId);
      if (!error) { setUrediKomitentId(null); setAdminKomitentNaziv(''); setAdminKomitentGrad(''); inicijalizujAplikaciju(); }
    } else {
      const { error } = await supabase.from('komitenti').insert([{ naziv: adminKomitentNaziv, grad: adminKomitentGrad, tip: adminKomitentTip }]);
      if (!error) { setAdminKomitentNaziv(''); setAdminKomitentGrad(''); inicijalizujAplikaciju(); }
    }
  };

  const obrisiKomitenta = (id, ime) => {
    setPotvrdaModal({
      naslov: "Obriši komitenta",
      poruka: `Da li ste sigurni da želite da uklonite komitenta "${ime}" iz sistema?`,
      akcija: async () => { await supabase.from('komitenti').delete().eq('id', id); inicijalizujAplikaciju(); setPotvrdaModal(null); }
    });
  };

  const promijeniUloguKorisnika = async (profilId, novaUloga) => {
    const { error } = await supabase.from('profili').update({ uloga: novaUloga }).eq('id', profilId);
    if (!error) { paziIPokreniObavestenje("Uspješno", "Uloga korisnika je uspešno promenjena!"); inicijalizujAplikaciju(); } 
    else paziIPokreniObavestenje("Greška", error.message);
  };

  const otvoriBrisanjeLoga = (log) => {
    setLogZaBrisanje(log);
    setVratiNaStanje(log.tip === 'IZLAZ_OTPREMNICA'); 
    setOtvorenModal('brisanjeLoga');
  };

  const potvrdiBrisanjeLoga = async () => {
    if (!logZaBrisanje) return;
    if (vratiNaStanje && logZaBrisanje.tip === 'IZLAZ_OTPREMNICA') {
      const art = oprema.find(o => o.naziv === logZaBrisanje.artikal);
      if (art) await supabase.from('oprema').update({ kolicina: art.kolicina + logZaBrisanje.kolicina }).eq('id', art.id);
    }
    await supabase.from('istorija').delete().eq('id', logZaBrisanje.id);
    setOtvorenModal(null); setLogZaBrisanje(null); inicijalizujAplikaciju();
  };

  const isprazniKompletnuIstoriju = () => {
    setPotvrdaModal({
      naslov: "Resetuj kompletnu istoriju prometa",
      poruka: "⚠️ PAŽNJA: Želite da obrišete CELU istoriju prometa. Ova akcija je nepovratna i vratiće statistiku u nulto stanje. Da li želite da nastavite?",
      akcija: async () => {
        const { error } = await supabase.from('istorija').delete().neq('id', 0);
        if (!error) { paziIPokreniObavestenje("Uspješno očišćeno", "Istorija prometa je uspešno vraćena na nulu!"); } 
        else paziIPokreniObavestenje("Greška", error.message);
        setPotvrdaModal(null);
      }
    });
  };

  const odrediSledeciBrojOtpremnice = () => {
    const danas = new Date();
    const dan = String(danas.getDate()).padStart(2, '0');
    const mesec = String(danas.getMonth() + 1).padStart(2, '0');
    const godina = danas.getFullYear();
    const prefix = `${dan}${mesec}`;

    const danasnjiLogovi = istorija.filter(log => {
      if (log.tip !== 'IZLAZ_OTPREMNICA') return false;
      const logDatum = new Date(log.created_at);
      return logDatum.getDate() === danas.getDate() && logDatum.getMonth() === danas.getMonth() && logDatum.getFullYear() === danas.getFullYear();
    });

    const pronadjeniBrojevi = new Set();
    danasnjiLogovi.forEach(log => {
      const match = log.komentar?.match(/Broj:\s*([^\s|]+)/);
      if (match) pronadjeniBrojevi.add(match[1]);
    });

    if (pronadjeniBrojevi.size === 0) return `${prefix}/${godina}`; 
    let maxIndex = 1;
    pronadjeniBrojevi.forEach(br => {
      if (br.includes('_')) {
        const delovi = br.split('_');
        const idx = parseInt(delovi[1], 10);
        if (!isNaN(idx) && idx > maxIndex) maxIndex = idx;
      }
    });
    return `${prefix}_${maxIndex + 1}_${godina}`; 
  };

  const dogodSkidanjeStavkeUlaza = () => setStavkeUlaza([...stavkeUlaza, { opremaId: oprema[0]?.id || '', kolicina: 1 }]);
  const dodajStavkuOtpremnice = () => setStavkeOtpremnice([...stavkeOtpremnice, { opremaId: oprema[0]?.id || '', kolicina: 1, poRezervaciji: false }]);
  const ukloniStavkuOtpremnice = (index) => setStavkeOtpremnice(stavkeOtpremnice.filter((_, i) => i !== index));
  const promeniStavkuOtpremnice = (index, polje, vrednost) => {
    const noveStavke = [...stavkeOtpremnice];
    noveStavke[index][polje] = vrednost;
    setStavkeOtpremnice(noveStavke);
  };

  const sacuvajIKnjiziOtpremnicu = async (e) => {
    e.preventDefault();
    if (!kupacId || !predaoIme) return alert("Molimo popunite sva obavezna polja.");
    if (kupacId === 'novo' && (!noviKupacNaziv || !noviKupacGrad)) return alert("Unesite naziv i grad novog kupca.");
    if (stavkeOtpremnice.length === 0 || stavkeOtpremnice.some(s => !s.opremaId)) return alert("Molimo izaberite ispravne artikle.");

    let konacniKupacNaziv = '';
    let konacniKupacGrad = '';

    if (kupacId === 'novo') {
      await supabase.from('komitenti').insert([{ naziv: noviKupacNaziv, grad: noviKupacGrad, tip: 'Kupac' }]);
      konacniKupacNaziv = noviKupacNaziv; konacniKupacGrad = noviKupacGrad;
    } else {
      const kom = komitenti.find(k => k.id == kupacId);
      if (kom) { konacniKupacNaziv = kom.naziv; konacniKupacGrad = kom.grad; }
    }

    for (let stavka of stavkeOtpremnice) {
      const artikalUBazi = oprema.find(o => o.id == stavka.opremaId);
      if (!artikalUBazi || artikalUBazi.kolicina < Number(stavka.kolicina)) {
        return paziIPokreniObavestenje("Nedovoljno robe", `Nema dovoljno artikla "${artikalUBazi?.naziv || 'Nepoznato'}" na stanju!`);
      }
      if (stavka.poRezervaciji && Number(stavka.kolicina) > (artikalUBazi.rezervisano || 0)) {
        return paziIPokreniObavestenje("Preko rezervisanog limita", `Pokušavate povući ${stavka.kolicina} kom. artikla "${artikalUBazi.naziv}" po rezervaciji, a rezervisano je samo ${artikalUBazi.rezervisano || 0}.`);
      }
    }

    // 📌 FIKSOVAN MAŠINSKI BAG SA TIPFELEROM OVDE
    const brOtpremnice = odrediSledeciBrojOtpremnice();
    const pripremljeneStavkeZaPdf = [];

    for (let stavka of stavkeOtpremnice) {
      const artikalUBazi = oprema.find(o => o.id == stavka.opremaId);
      const novaKolicina = artikalUBazi.kolicina - Number(stavka.kolicina);

      let noviRezervisano = artikalUBazi.rezervisano || 0;
      if (stavka.poRezervaciji) noviRezervisano = Math.max(0, noviRezervisano - Number(stavka.kolicina));

      const rezimTekst = stavka.poRezervaciji ? 'Po rezervaciji' : 'Mimo rezervacije';
      const standardniKomentar = `Broj: ${brOtpremnice} | Kupac: ${konacniKupacNaziv} | Grad: ${konacniKupacGrad} | Predao: ${predaoIme} | Režim: ${rezimTekst}`;

      await supabase.from('oprema').update({ kolicina: novaKolicina, rezervisano: noviRezervisano }).eq('id', artikalUBazi.id);
      await supabase.from('istorija').insert([{ artikal: artikalUBazi.naziv, tip: 'IZLAZ_OTPREMNICA', kolicina: Number(stavka.kolicina), komentar: standardniKomentar, korisnik: korisnikEmail }]);

      pripremljeneStavkeZaPdf.push({ naziv: artikalUBazi.naziv, oznaka: artikalUBazi.oznaka || '-', opis: artikalUBazi.opis || '-', kolicina: stavka.kolicina });
    }

    await generisiPDFOtpremnicu(pripremljeneStavkeZaPdf, konacniKupacNaziv, konacniKupacGrad, predaoIme, brOtpremnice, new Date());

    setOtvorenModal(null); setKupacId(''); setNoviKupacNaziv(''); setNoviKupacGrad(''); setPredaoIme('');
    setStavkeOtpremnice([{ opremaId: oprema[0]?.id || '', kolicina: 1, poRezervaciji: false }]);
    inicijalizujAplikaciju();
  };

  const generisiPDFOtpremnicu = async (stavke, kupac, grad, predao, broj, datumObj = new Date()) => {
    const doc = new jsPDF();
    const dan = String(datumObj.getDate()).padStart(2, '0');
    const mesec = String(datumObj.getMonth() + 1).padStart(2, '0');
    const godina = datumObj.getFullYear();

    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10);
    doc.text("Montora Software d.o.o.", 14, 20); doc.text("Capital Plaza, Ul. Seika Zaida 13/L2-A06", 14, 25);
    doc.text("81000 Podgorica, Crna Gora", 14, 30); doc.text("tel: +382 20 274 029, +382 20 274 030", 14, 35);

    try { const logoBase64 = await urlToBase64('/montora-logo.png'); if (logoBase64) doc.addImage(logoBase64, 'PNG', 135, 12, 60, 15); } catch (e) { console.error(e); }

    doc.setDrawColor(220, 225, 230); doc.line(14, 43, 196, 43);
    doc.setFont('Helvetica', 'bold'); doc.text("Kupac / Primalac:", 14, 52);
    doc.setFont('Helvetica', 'normal'); doc.text(izbaciKvacice(kupac), 14, 58); doc.text(izbaciKvacice(grad), 14, 63);
    doc.setFont('Helvetica', 'bold'); doc.text(`Otpremnica br.: ${broj}`, 120, 52);
    doc.setFont('Helvetica', 'normal'); doc.text(`Datum: ${dan}.${mesec}.${godina}. godine`, 120, 58);

    const tabeleKolone = [["Red. Br.", "Opis robe / artikla", "Kol."]];
    const tabelaRedovi = stavke.map((st, index) => [ 
      `${index + 1}.`, 
      izbaciKvacice(st.opis && st.opis !== '-' ? st.opis : st.naziv), 
      st.kolicina.toString() 
    ]);

    autoTable(doc, {
      startY: 72, head: tabeleKolone, body: tabelaRedovi, theme: 'grid',
      headStyles: { fillColor: [240, 243, 246], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.2, lineColor: [200, 200, 200] },
      styles: { fontSize: 9, cellPadding: 4, textColor: [0, 0, 0], lineColor: [200, 200, 200] },
      columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 1: { cellWidth: 145 }, 2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } }
    });

    const finalY = doc.lastAutoTable.finalY + 30;
    doc.setFont('Helvetica', 'normal'); doc.text(`Za ${izbaciKvacice(kupac)}`, 14, finalY);
    doc.setDrawColor(180, 180, 180); doc.line(14, finalY + 10, 80, finalY + 10); doc.text("(Primio/la)", 14, finalY + 14);
    doc.setFontSize(10); doc.text("Za Montora software d.o.o.", 120, finalY);
    doc.setFont('Helvetica', 'bold'); doc.text(izbaciKvacice(predao), 120, finalY + 6); 
    doc.line(120, finalY + 10, 186, finalY + 10); doc.setFontSize(8); doc.text("(Predao/la)", 120, finalY + 14);

    doc.save(`Otpremnica_${broj.replace('/', '_')}.pdf`);
  };

  const otvoriPregledOtpremnice = (log) => {
    const detalji = parsirajKomentarOtpremnice(log.komentar);
    if (!detalji) return paziIPokreniObavestenje("Greška", "Nije moguće učitati detalje ove otpremnice.");
    const srodniLogovi = istorija.filter(l => l.tip === 'IZLAZ_OTPREMNICA' && l.komentar?.includes(`Broj: ${detalji.broj}`));
    const rekonstruisaneStavke = srodniLogovi.map(l => {
      const artikalUBazi = oprema.find(o => o.naziv === l.artikal);
      return { naziv: l.artikal, oznaka: artikalUBazi?.oznaka || '-', opis: artikalUBazi?.opis || '-', kolicina: l.kolicina };
    });
    setPregledOtpremnice({ broj: detalji.broj, kupac: detalji.kupac, grad: detalji.grad, predao: detalji.predao, datum: new Date(log.created_at).toLocaleDateString('sr-RS'), datumObj: new Date(log.created_at), stavke: rekonstruisaneStavke });
  };

  const preuzmiExcel = async () => {
    if (oprema.length === 0) return paziIPokreniObavestenje("Obaveštenje", "Nema podataka za eksport!");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trenutno Stanje', { views: [{ showGridLines: true }] });

    worksheet.columns = [{ header: '', key: 'colA', width: 28 }, { header: '', key: 'colB', width: 22 }, { header: '', key: 'colC', width: 45 }, { header: '', key: 'colD', width: 22 }, { header: '', key: 'colE', width: 16 }];
    const tankiBorder = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, left: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }, right: { style: 'thin', color: { argb: 'FFD9D9D9' } } };

    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = 'IZVJEŠTAJ STANJA NA ZALIHAMA (SA REZERVACIJAMA)';
    worksheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F497D' } }; 
    worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(1).height = 40;
    worksheet.getRow(2).height = 15;

    const koloneNazivi = ['Naziv Artikla', 'Oznaka', 'Opis', 'Količina na Stanju', 'Rezervisano'];
    worksheet.getRow(3).height = 25;
    koloneNazivi.forEach((naziv, indeks) => {
      const celija = worksheet.getRow(3).getCell(indeks + 1); 
      celija.value = naziv;
      celija.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      celija.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }; 
      celija.alignment = { vertical: 'middle', horizontal: indeks >= 3 ? 'right' : 'left', indent: indeks < 3 ? 1 : 0 };
      celija.border = tankiBorder;
    });

    const sveKategorije = [...new Set(oprema.map(item => item.kategorija || 'Nekategorisano'))].sort();
    let trenchesRedIdx = 4;

    sveKategorije.forEach((kat, katIdx) => {
      if (katIdx > 0) { worksheet.getRow(trenchesRedIdx).height = 15; trenchesRedIdx++; }
      worksheet.mergeCells(`A${trenchesRedIdx}:E${trenchesRedIdx}`);
      const katCelija = worksheet.getRow(trenchesRedIdx).getCell(1); katCelija.value = ` KATEGORIJA: ${kat}`;
      katCelija.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F497D' } }; 
      katCelija.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EDF4' } }; 
      katCelija.alignment = { vertical: 'middle', horizontal: 'left' };
      for (let c = 1; c <= 5; c++) worksheet.getRow(trenchesRedIdx).getCell(c).border = tankiBorder;
      trenchesRedIdx++;

      const artikliUKategoriji = oprema.filter(item => (item.kategorija || 'Nekategorisano') === kat);
      artikliUKategoriji.sort((a, b) => (a.plu || 0) - (b.plu || 0));

      artikliUKategoriji.forEach(artikal => {
        const red = worksheet.getRow(trenchesRedIdx); red.height = 20;
        red.getCell(1).value = `   ${artikal.naziv}`; red.getCell(2).value = artikal.oznaka || ''; red.getCell(3).value = artikal.opis || '';
        red.getCell(4).value = Number(artikal.kolicina); red.getCell(5).value = Number(artikal.rezervisano || 0);
        for (let c = 1; c <= 5; c++) {
          red.getCell(c).font = { name: 'Arial', size: 10 }; red.getCell(c).border = tankiBorder;
          red.getCell(c).alignment = { vertical: 'middle', horizontal: c >= 4 ? 'right' : 'left' };
        }
        trenchesRedIdx++;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Evidentory_Stanje_Zaliha_${new Date().toLocaleDateString('sr-RS')}.xlsx`; a.click();
  };

  const formatirajDatumIVrijeme = (log) => {
    if (!log) return { datum: 'Nema zapisa', vrijeme: '' };
    const d = new Date(log.created_at);
    return {
      datum: d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      vrijeme: d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const zadnjiUlazLog = istorija.find(log => log.tip === 'BRZI_ULAZ' || log.tip.includes('ULAZ'));
  const zadnjiIzlazLog = istorija.find(log => log.tip === 'IZLAZ_OTPREMNICA');
  const zadnjiUlaz = formatirajDatumIVrijeme(zadnjiUlazLog);
  const zadnjiIzlaz = formatirajDatumIVrijeme(zadnjiIzlazLog);

  const ukupnoNaStanju = oprema.reduce((sum, item) => sum + item.kolicina, 0);
  const jedinstvenihProizvoda = oprema.length;
  const sortiranaOprema = [...oprema].sort((a, b) => (a.plu || 0) - (b.plu || 0));

  const filtriranaOprema = sortiranaOprema.filter(item => {
    const odgovaraPretrazi = item.naziv.toLowerCase().includes(pretraga.toLowerCase()) || (item.oznaka && item.oznaka.toLowerCase().includes(pretraga.toLowerCase()));
    const odgovaraKategoriji = izabranaKategorija === 'Sve' || (item.kategorija || 'Nekategorisano') === izabranaKategorija;
    return odgovaraPretrazi && odgovaraKategoriji;
  });

  if (!uloga) return <div className="h-screen w-screen flex items-center justify-center bg-[#F8FAFC]">Učitavanje...</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none !important; }
        .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
      `}} />

      <div className="flex h-screen bg-[#F8FAFC] font-sans overflow-hidden text-slate-800" onClick={() => setOtvoreneAkcijeId(null)}>
        
        {/* ================= SIDEBAR LIJEVO ================= */}
        <div className="w-[260px] bg-[#0F172A] text-slate-300 flex flex-col shadow-2xl z-20 shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 flex items-center gap-3 border-b border-slate-700/50">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black shadow-md shadow-blue-900/50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
            <h1 className="text-xl font-bold text-white tracking-wide">EVIDENTORY</h1>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
            {/* SEKCIJA: INVENTAR */}
            <div className="space-y-1">
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Inventar</p>
              
              <button onClick={() => { setAktivniTab('zalihe'); setIzabranaKategorija('Sve'); }} className={`w-full text-left px-4 py-2 rounded-xl text-xs font-semibold transition-all ${izabranaKategorija === 'Sve' && aktivniTab === 'zalihe' ? 'text-white bg-slate-800/50' : 'hover:bg-slate-800/30 hover:text-slate-200'}`}>
                📦 Prikaži sve artikle
              </button>

              <div className="pt-1 pl-3 pb-3 space-y-0.5 border-l border-slate-800/40 ml-4">
                {[...new Set(oprema.map(item => item.kategorija || 'Nekategorisano'))].sort().map(kat => (
                  <button key={kat} onClick={() => { setAktivniTab('zalihe'); setIzabranaKategorija(kat); }} className={`w-full text-left px-3 py-1 rounded-lg text-[11px] font-medium transition-all truncate block ${izabranaKategorija === kat && aktivniTab === 'zalihe' ? 'bg-slate-800 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300'}`}>▪️ {kat}</button>
                ))}
              </div>

              {mozeDaPovlaciIUnosi && (
                <>
                  <button onClick={() => { setOtvorenModal('brziUlaz'); setStavkeUlaza([{ opremaId: oprema[0]?.id || '', kolicina: 1 }]); }} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium hover:bg-slate-800/30 hover:text-slate-200 transition-all">📤 Prijem (Ulaz)</button>
                  <button onClick={() => { setOtvorenModal('otpremnica'); setStavkeOtpremnice([{ opremaId: oprema[0]?.id || '', kolicina: 1, poRezervaciji: false }]); }} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium hover:bg-slate-800/30 hover:text-slate-200 transition-all">📥 Otpremnica (Izlaz)</button>
                  <button onClick={() => { setOtvorenModal('novaRezervacija'); setKolicinaAkcija(1); if (oprema.length > 0) setIzabraniArtikal(oprema[0]); }} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium hover:bg-slate-800/30 hover:text-slate-200 transition-all">🔖 Rezervacije</button>
                  <button onClick={() => {
                    const stavkeSaRez = oprema.filter(o => o.rezervisano > 0);
                    if (stavkeSaRez.length > 0) {
                      setIzabraniArtikal(stavkeSaRez[0]);
                      setOtvorenModal('otkaziRezervaciju'); setKolicinaAkcija(1);
                    } else { paziIPokreniObavestenje("Nema rezervacija", "Trenutno nema aktivnih rezervacija u sistemu."); }
                  }} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium hover:bg-slate-800/30 hover:text-slate-200 transition-all">🔓 Otkaži rezervaciju</button>
                </>
              )}

              {jeLiAdmin && (
                <button onClick={() => setOtvorenModal('noviArtikal')} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-blue-400 hover:bg-blue-600/10 transition-all mt-2 border border-blue-500/20">
                  ➕ Dodaj artikal
                </button>
              )}
            </div>

            {/* SEKCIJA: IZVJEŠTAJI */}
            <div className="space-y-1">
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Izvještaji</p>
              {/* 📌 PREUZMI EXCEL JE UKLONJEN ODAVDE PREMA TVOM ZAHTJEVU */}
              <button onClick={() => setAktivniTab('izvjestaji')} className={`w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${aktivniTab === 'izvjestaji' ? 'bg-slate-800 text-white font-semibold' : 'hover:bg-slate-800/30 hover:text-slate-200'}`}>📈 Statistika i Promet</button>
            </div>

            {/* SEKCIJA: PODEŠAVANJA */}
            {jeLiAdmin && (
              <div className="space-y-1">
                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Podešavanja</p>
                <button onClick={() => setOtvorenModal('podesavanja')} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium hover:bg-slate-800/30 hover:text-slate-200 transition-all">⚙️ Kontrolni Panel</button>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#090D1A] border-t border-slate-800/40 flex items-center justify-between">
            <div className="flex items-center gap-3 truncate">
              <div className="w-9 h-9 bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center uppercase select-none shrink-0 border border-slate-700">{korisnikEmail ? korisnikEmail.substring(0, 2) : 'U'}</div>
              <div className="truncate">
                <p className="text-xs font-bold text-white capitalize">{korisnikEmail || 'Korisnik'}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 p-1 rounded-lg transition-colors" title="Odjavi se">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* ================= GLAVNI DESNI PANEL ================= */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          <div className="bg-white border-b border-slate-200/80 px-8 py-4 flex items-center justify-between z-10" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">EVIDENTORY Zalihe</h2>
              <p className="text-xs text-slate-400 mt-0.5">Pregled i upravljanje vašim inventarom</p>
            </div>
            <div className="flex items-center gap-4"></div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar" onClick={(e) => e.stopPropagation()}>
            
            {aktivniTab === 'zalihe' && (
              <>
                {/* ČISTE KPI KARTICE UZ INFORMACIJU O POSLEDNJEM PROMETU */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-sm flex justify-between items-center relative overflow-hidden group hover:border-blue-300 transition-all">
                    <div className="space-y-1 z-10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ukupno artikala</p>
                      <h3 className="text-2xl font-black text-slate-900">{ukupnoNaStanju}</h3>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-sm flex justify-between items-center relative overflow-hidden group hover:border-green-300 transition-all">
                    <div className="space-y-1 z-10">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jedinstvenih proizvoda</p>
                      <h3 className="text-2xl font-black text-slate-900">{jedinstvenihProizvoda}</h3>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-sm flex justify-between items-center relative overflow-hidden group hover:border-emerald-300 transition-all">
                    <div className="space-y-1 z-10">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zadnji Prijem (Ulaz)</p>
                      <h3 className="text-xl font-black text-slate-900">{zadnjiUlaz.datum}</h3>
                      <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                        ⏱️ {zadnjiUlaz.vrijeme ? `Ažurirano: ${zadnjiUlaz.vrijeme} h` : 'Nema prometa'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-sm flex justify-between items-center relative overflow-hidden group hover:border-rose-300 transition-all">
                    <div className="space-y-1 z-10">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zadnji Otpis (Izlaz)</p>
                      <h3 className="text-xl font-black text-slate-900">{zadnjiIzlaz.datum}</h3>
                      <p className="text-[11px] font-bold text-rose-500 mt-1 flex items-center gap-1">
                        ⏱️ {zadnjiIzlaz.vrijeme ? `Ažurirano: ${zadnjiIzlaz.vrijeme} h` : 'Nema prometa'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 border border-slate-200/70 rounded-2xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-xs">
                      <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0z" /></svg>
                      </span>
                      <input type="text" placeholder="Pretraži inventar..." className="w-full bg-slate-50 border border-slate-200 pl-9 pr-10 py-2 rounded-xl text-xs font-medium outline-none focus:bg-white focus:border-blue-500 text-slate-800" value={pretraga} onChange={(e) => setPretraga(e.target.value)} />
                    </div>

                    <select value={izabranaKategorija} onChange={(e) => setIzabranaKategorija(e.target.value)} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 outline-none hover:bg-slate-100/70 transition-all cursor-pointer">
                      <option value="Sve">Kategorija: Sve</option>
                      {[...new Set(oprema.map(item => item.kategorija || 'Nekategorisano'))].map(kat => (
                        <option key={kat} value={kat}>{kat}</option>
                      ))}
                    </select>
                  </div>

                  {/* 📌 POVRATAK EXCEL DUGMETA NA DESNU STRANU KONTROLNE TRAKE PREMA ZAHTJEVU */}
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={preuzmiExcel} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold tracking-tight shadow-sm transition-all flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Preuzmi Izvještaj Excel
                    </button>
                  </div>
                </div>

                {/* TABELA BEZ SLIKA */}
                <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px] tracking-widest select-none">
                          <th className="px-6 py-4 text-center w-16">PLU</th>
                          <th className="px-6 py-4 w-32">Šifra</th>
                          <th className="px-6 py-4">Naziv artikla</th>
                          <th className="px-6 py-4 w-36">Kategorija</th>
                          <th className="px-6 py-4 w-40">Stanje</th>
                          <th className="px-6 py-4 text-center w-28">Rezervisano</th>
                          <th className="px-6 py-4 text-center w-20">Akcije</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filtriranaOprema.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/40 transition-colors group">
                            <td className="px-6 py-4 text-center font-bold text-blue-600 font-mono text-xs select-none">{item.plu || '-'}</td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-400 tracking-wide font-medium">{item.oznaka || '-'}</td>
                            <td className="px-6 py-4 max-w-sm">
                              <div className="font-bold text-slate-800 tracking-tight text-sm">{item.naziv}</div>
                              {item.opis && <div className="text-xs text-slate-400 mt-1 font-medium leading-relaxed line-clamp-2" title={item.opis}>{item.opis}</div>}
                              
                              {item.rezervisano > 0 && (
                                <div className="mt-2 space-y-1 bg-amber-50/50 p-2 rounded-xl border border-amber-100/70 max-w-xl animate-fade-in">
                                  <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider block">Aktivne rezervacije:</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {dohvatiAktivneRezervacije(item.naziv, item.rezervisano).map((rez, idx) => (
                                      <span key={idx} className="bg-white border border-amber-200 text-amber-700 text-[10px] px-2 py-0.5 rounded-md font-semibold shadow-sm">📌 {rez.klijent} ({rez.kolicina} kom)</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg font-semibold border border-blue-100">{item.kategorija || 'Nekategorisano'}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {item.kolicina > 0 ? (
                                  <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                    <span>{item.kolicina} komad</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-slate-400 font-medium text-xs">
                                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                                    <span>Nema na stanju</span>
                                  </div>
                                )}
                            </td>
                            <td className={`px-6 py-4 text-center font-bold text-xs whitespace-nowrap ${item.rezervisano > 0 ? 'text-amber-600 bg-amber-50/20' : 'text-slate-300'}`}>{item.rezervisano || '0'}</td>
                            
                            <td className="px-6 py-4 text-center relative whitespace-nowrap">
                              <button onClick={(e) => { e.stopPropagation(); setOtvoreneAkcijeId(otvoreneAkcijeId === item.id ? null : item.id); }} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 10a2 2 0 11-2 2 2 2 0 012-2zm0-6a2 2 0 11-2 2 2 2 0 012-2zm0 12a2 2 0 11-2 2 2 2 0 012-2z" /></svg>
                              </button>
                              {otvoreneAkcijeId === item.id && (
                                <>
                                  <div className="fixed inset-0 z-20 cursor-default" onClick={(e) => { e.stopPropagation(); setOtvoreneAkcijeId(null); }}></div>
                                  <div className="absolute right-6 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 font-semibold text-xs text-left animate-fade-in">
                                    <button onClick={() => { otvoriUrediArtikal(item); setOtvoreneAkcijeId(null); }} className="w-full px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5">✏️ Uredi</button>
                                    
                                    {item.rezervisano > 0 && mozeDaPovlaciIUnosi && (
                                      <button onClick={() => { setIzabraniArtikal(item); setOtvorenModal('otkaziRezervaciju'); setKolicinaAkcija(1); setOtvoreneAkcijeId(null); }} className="w-full px-4 py-2 hover:bg-amber-50 text-amber-600 flex items-center gap-1.5 border-t border-slate-100">🔓 Otkaži rezervaciju</button>
                                    )}

                                    {jeLiAdmin && (
                                      <button onClick={() => { pokreniBrisanjeArtiklaDirektno(item); setOtvoreneAkcijeId(null); }} className="w-full px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-1.5 border-t border-slate-100">✕ Ukloni</button>
                                    )}
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 bg-slate-50/70 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500 select-none">
                    <p>Prikazano {filtriranaOprema.length} od {oprema.length} rezultata</p>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Prikaži:</span>
                      <select className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-700 outline-none"><option>10 po stranici</option></select>
                      <div className="flex items-center border border-slate-200 bg-white rounded-lg overflow-hidden ml-2 shadow-sm">
                        <button className="px-2.5 py-1.5 hover:bg-slate-50 text-slate-400">‹</button>
                        <button className="px-3 py-1.5 bg-blue-600 text-white font-bold">1</button>
                        <button className="px-2.5 py-1.5 hover:bg-slate-50 text-slate-400">›</button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* HISTORIJA PROMETA */}
            {aktivniTab === 'izvjestaji' && (
               <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white px-6 select-none">
                    <h3 className="font-bold text-slate-900 tracking-tight text-base">Istorija magacinskog prometa</h3>
                    <span className="text-[10px] font-bold tracking-widest uppercase bg-slate-100 border text-slate-500 px-2.5 py-1 rounded-lg">Audit Trail Log</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-widest font-bold">
                        <tr>
                          <th className="px-6 py-4">Datum upisa</th>
                          <th className="px-6 py-4">Korisnik</th>
                          <th className="px-6 py-4">Artikal</th>
                          <th className="px-6 py-4">Tip prometa</th>
                          <th className="px-6 py-4 text-center">Količina</th>
                          <th className="px-6 py-4">Komentar / Detalji</th>
                          <th className="px-6 py-4 text-center w-28">Akcija</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                          {istorija.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50/40 transition">
                              <td className="px-6 py-4 text-slate-400 font-medium">{new Date(log.created_at).toLocaleString('sr-RS')}</td>
                              <td className="px-6 py-4 font-bold text-slate-700 capitalize">👤 {log.korisnik || 'sistem'}</td>
                              <td className="px-6 py-4 text-slate-800 text-sm font-bold tracking-tight">{log.artikal}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  log.tip === 'REZERVACIJA' ? 'bg-amber-100 text-amber-700' : 
                                  log.tip === 'OTKAZANA_REZERVACIJA' ? 'bg-slate-100 text-slate-600 border' :
                                  log.tip.includes('ULAZ') || log.tip === 'BRZI_ULAZ' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {log.tip === 'BRZI_ULAZ' ? 'Ulaz' : (log.tip === 'IZLAZ_OTPREMNICA' ? 'Izlaz' : log.tip.replace('_', ' '))}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-sm font-bold text-slate-800">{log.kolicina}</td>
                              <td className="px-6 py-4 text-slate-500 font-medium max-w-xs truncate" title={log.komentar}>{log.komentar || '-'}</td>
                              <td className="px-6 py-4 text-center whitespace-nowrap">
                                {log.tip === 'IZLAZ_OTPREMNICA' && (
                                  <button onClick={() => otvoriPregledOtpremnice(log)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl font-bold hover:bg-blue-100 transition-all">📄 Otpremnica</button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: PRIJEM ROBE */}
      {otvorenModal === 'brziUlaz' && mozeDaPovlaciIUnosi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-100 my-8 animate-fade-in">
              <h2 className="text-xl font-black text-slate-900 border-b border-slate-100 pb-3 tracking-tight">Prijem robe (Novi Ulaz)</h2>
              <form onSubmit={izvrsiBrziUlaz} className="space-y-5 mt-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dobavljač *</label>
                    <select required value={dobavljacId} onChange={(e) => setDobavljacId(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-white outline-none focus:border-blue-500 font-semibold text-slate-700">
                      <option value="">Izaberi dobavljača...</option>
                      {komitenti.filter(k => k.tip === 'Dobavljac' || k.tip === 'Oboje').map(k => (
                        <option key={k.id} value={k.id}>{k.naziv} ({k.grad || '-'})</option>
                      ))}
                      <option value="novo" className="text-blue-600 font-bold">➕ Novi komitent (Ručni unos)</option>
                    </select>
                    {dobavljacId === 'novo' && (
                      <div className="grid grid-cols-2 gap-4 bg-blue-50/40 p-4 mt-3 rounded-xl border border-blue-100 animate-fade-in">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Ime dobavljača *</label>
                          <input required placeholder="Ime" value={noviDobavljacNaziv} onChange={e=>setNoviDobavljacNaziv(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white outline-none focus:border-blue-500 font-medium" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Grad dobavljača</label>
                          <input placeholder="Grad" value={noviDobavljacGrad} onChange={e=>setNoviDobavljacGrad(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-xs bg-white outline-none focus:border-blue-500 font-medium" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stavke prijema</h3>
                      {/* 📌 ISPRAVLJENO: Vraćena ispravna sinkrona funkcija dodajStavkuUlaza */}
                      <button type="button" onClick={dodajStavkuUlaza} className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">+ Dodaj artikal</button>
                    </div>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 no-scrollbar">
                      {stavkeUlaza.map((stavka, index) => (
                        <div key={index} className="flex gap-3 items-center bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                          <div className="flex-1">
                            <select value={stavka.opremaId} onChange={(e) => promeniStavkuUlaza(index, 'opremaId', e.target.value)} className="w-full border border-slate-200 p-2 text-sm bg-white outline-none focus:border-blue-500 text-slate-700 font-medium">
                              <option value="">Izaberi artikal...</option>
                              {oprema.map(o => (
                                <option key={o.id} value={o.id}>{o.naziv} (Stanje: {o.kolicina})</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-24">
                            <input type="number" min="1" value={stavka.kolicina} onChange={(e) => promeniStavkuUlaza(index, 'kolicina', e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-sm text-center font-bold text-slate-800" />
                          </div>
                          <button type="button" onClick={() => ukloniStavkuUlaza(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Komentar / Napomena</label><input value={komentar} onChange={e=>setKomentar(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-blue-500 text-sm font-medium" /></div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors">Odustani</button>
                      <button type="submit" className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md">Potvrdi ulaz robe</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA REZERVACIJA */}
      {otvorenModal === 'novaRezervacija' && mozeDaPovlaciIUnosi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-100 animate-fade-in">
              <h2 className="text-lg font-black mb-5 text-amber-600 flex items-center gap-1.5 tracking-tight">📌 Nova Rezervacija robe</h2>
              <form onSubmit={izvrsiRezervacijuOpreme} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Izaberi artikal za rezervaciju</label>
                    <select required value={izabraniArtikal?.id || ''} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-white font-semibold text-slate-700 outline-none" onChange={(e) => setIzabraniArtikal(oprema.find(o => o.id == e.target.value))}>
                      {oprema.map(o => (
                        <option key={o.id} value={o.id}>{o.naziv} (Slobodno: {o.kolicina - (o.rezervisano || 0)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Količina za rezervaciju</label>
                    <input type="number" min="1" required value={kolicinaAkcija} onChange={e=>setKolicinaAkcija(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-xl text-sm font-bold text-slate-800" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Za kog Kupca / Klijenta? *</label>
                    <select required value={rezervacijaKupacId} onChange={(e) => setRezervacijaKupacId(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-white font-semibold text-slate-700 outline-none">
                      <option value="">Izaberi klijenta...</option>
                      {komitenti.filter(k => k.tip === 'Kupac' || k.tip === 'Oboje').map(k => (
                        <option key={k.id} value={k.id}>{k.naziv} ({k.grad || '-'})</option>
                      ))}
                      <option value="novo" className="text-blue-600 font-bold">➕ Novi klijent (Ručni unos)</option>
                    </select>
                  </div>

                  {rezervacijaKupacId === 'novo' && (
                    <div className="grid grid-cols-2 gap-2 bg-blue-50/40 p-3 rounded-xl border border-blue-100 animate-fade-in">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Ime klijenta *</label>
                        <input required placeholder="Ime" value={noviRezKupacNaziv} onChange={e=>setNoviRezKupacNaziv(e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-xs bg-white outline-none font-medium" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Grad klijenta</label>
                        <input placeholder="Grad" value={noviRezKupacGrad} onChange={e=>setNoviRezKupacGrad(e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-xs bg-white outline-none font-medium" />
                      </div>
                    </div>
                  )}

                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Napomena uz rezervaciju</label><input value={komentar} onChange={e=>setKomentar(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium outline-none" /></div>
                  <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-100">Odustani</button>
                      <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-md">Potvrdi i rezerviši</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: OTKAZIVANJE REZERVACIJE */}
      {otvorenModal === 'otkaziRezervaciju' && mozeDaPovlaciIUnosi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-100 animate-fade-in">
              <h2 className="text-lg font-bold mb-3 text-slate-900 flex items-center gap-1.5 tracking-tight">✕ Otkaži aktivnu rezervaciju</h2>
              <p className="text-xs text-slate-400 mb-4">Oslobodite dio ili cijelu rezervisanu količinu artikla za klijenta.</p>
              <form onSubmit={izvrsiOtkazivanjeRezervacije} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Izaberi rezervisani artikal</label>
                    <select required value={izabraniArtikal?.id || ''} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-white font-semibold text-slate-700 outline-none" onChange={(e) => setIzabraniArtikal(oprema.filter(o => o.rezervisano > 0).find(o => o.id == e.target.value))}>
                      {oprema.filter(o => o.rezervisano > 0).length === 0 && <option value="">Nema rezervisanih artikala</option>}
                      {oprema.filter(o => o.rezervisano > 0).map(o => (
                        <option key={o.id} value={o.id}>{o.naziv} (Rezervisano: {o.rezervisano} kom)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Klijent za koga se otkazuje *</label>
                    <select required value={otkaziKlijentId} onChange={(e) => setOtkaziKlijentId(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-white font-semibold text-slate-700 outline-none">
                      <option value="">Izaberi klijenta...</option>
                      {komitenti.filter(k => k.tip === 'Kupac' || k.tip === 'Oboje').map(k => (
                        <option key={k.id} value={k.id}>{k.naziv} ({k.grad || '-'})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Količina za otkazivanje</label>
                    <input type="number" min="1" required value={kolicinaAkcija} onChange={e=>setKolicinaAkcija(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-xl text-sm font-bold text-slate-800" />
                  </div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Razlog / Napomena</label><input placeholder="Npr. Promjena porudžbine" value={komentar} onChange={e=>setKomentar(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl text-sm font-medium outline-none" /></div>
                  <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-100">Odustani</button>
                      <button type="submit" disabled={oprema.filter(o => o.rezervisano > 0).length === 0} className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-sm font-bold">Ukloni rezervaciju</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: OTPREMNICA / IZLAZ ROBE */}
      {otvorenModal === 'otpremnica' && mozeDaPovlaciIUnosi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-2xl border border-slate-100 my-8 animate-fade-in">
              <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Nova Otpremnica (Izlaz)</h2>
              </div>
              <form onSubmit={sacuvajIKnjiziOtpremnicu} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Kupac / Primalac *</label>
                      <select required value={kupacId} onChange={(e) => setCupacId(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white font-semibold text-slate-700 outline-none">
                        <option value="">Izaberi klijenta...</option>
                        {komitenti.filter(k => k.tip === 'Kupac' || k.tip === 'Oboje').map(k => (
                          <option key={k.id} value={k.id}>{k.naziv} ({k.grad || '-'})</option>
                        ))}
                        <option value="novo" className="text-blue-600 font-bold">➕ Novi klijent (Ručni unos)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Otpremnicu predao/la *</label>
                      <input required placeholder="Ime Prezime" value={predaoIme} onChange={e=>setPredaoIme(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg bg-white text-sm font-semibold text-slate-800" />
                    </div>
                    {kupacId === 'novo' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-3 bg-blue-50/40 p-4 mt-3 rounded-xl border border-blue-100/60 animate-fade-in">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Ime novog kupca *</label>
                          <input required placeholder="Ime" value={noviKupacNaziv} onChange={e=>setNoviKupacNaziv(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:border-blue-500 font-medium" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Grad novog kupca *</label>
                          <input required placeholder="Grad" value={noviKupacGrad} className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:border-blue-500 font-medium" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stavke na otpremnici</h3>
                      <button type="button" onClick={dodajStavkuOtpremnice} className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">+ Dodaj artikal</button>
                    </div>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                      {stavkeOtpremnice.map((stavka, index) => {
                        const trenutniArtikal = oprema.find(o => o.id == stavka.opremaId);
                        return (
                          <div key={index} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm space-y-2">
                            <div className="flex gap-3 items-center">
                              <div className="flex-1">
                                <select value={stavka.opremaId} onChange={(e) => dogodiSeIzmenaArtiklaUStavci(index, e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-sm bg-white text-slate-700 font-medium outline-none">
                                  <option value="">Izaberi artikal...</option>
                                  {oprema.map(o => ( 
                                    <option key={o.id} value={o.id}>{o.naziv} (Na stanju: {o.kolicina}){o.rezervisano > 0 ? ` [⚠️ Rezervisano: ${o.rezervisano}]` : ''}</option> 
                                  ))}
                                </select>
                              </div>
                              <div className="w-24">
                                <input type="number" min="1" value={stavka.kolicina} onChange={(e) => promeniStavkuOtpremnice(index, 'kolicina', e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-sm text-center font-bold text-slate-800" />
                              </div>
                              <button type="button" onClick={() => ukloniStavkuOtpremnice(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">✕</button>
                            </div>
                            {trenutniArtikal && trenutniArtikal.rezervisano > 0 && (
                              <div className="text-xs bg-amber-50 text-amber-800 p-2 rounded-xl border border-amber-200 flex items-center justify-between animate-fade-in">
                                <span className="font-medium">Ovaj artikal ima aktivne rezervacije. Knjižimo:</span>
                                <select value={stavka.poRezervaciji ? "da" : "ne"} onChange={(e) => promeniStavkuOtpremnice(index, 'poRezervaciji', e.target.value === "da")} className="bg-white border border-amber-300 font-bold px-2 py-1 rounded-lg text-xs outline-none cursor-pointer text-amber-900">
                                  <option value="ne">Mimo rezervacije</option>
                                  <option value="da">Po rezervaciji (Skida i rezervu)</option>
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors">Odustani</button>
                      <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100">Knjiži i generiši otpremnicu</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* MODAL: PREGLED PREVIEW OTPREMNICE */}
      {pregledOtpremnice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-100 my-8">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Pregled Otpremnice #{pregledOtpremnice.broj}</h2>
                <p className="text-xs text-slate-400 mt-1">Datum kreiranja dokumenta: {pregledOtpremnice.datum}</p>
              </div>
              <button onClick={() => setPregledOtpremnice(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
            </div>
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
                        <td className="px-4 py-3"><span className="font-medium text-slate-800">{st.opis && st.opis !== '-' ? st.opis : st.naziv}</span></td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">{st.kolicina}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setPregledOtpremnice(null)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors">Zatvori</button>
              <button onClick={async () => { await generisiPDFOtpremnicu(pregledOtpremnice.stavke, pregledOtpremnice.kupac, pregledOtpremnice.grad, pregledOtpremnice.predao, pregledOtpremnice.broj, pregledOtpremnice.datumObj); }} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-blue-100 flex items-center gap-2">⬇️ Preuzmi PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVI ARTIKAL */}
      {otvorenModal === 'noviArtikal' && jeLiAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-100 animate-fade-in">
              <h2 className="text-lg font-bold mb-5 text-slate-800 tracking-tight">Dodaj novi artikal u bazu</h2>
              <form onSubmit={dodajNoviArtikal} className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Naziv artikla *</label>
                      <input required value={naziv} onChange={e=>setNaziv(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-blue-500 text-sm font-medium" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">PLU broj *</label>
                      <input type="number" required placeholder="Red.br" value={plu} onChange={e=>setPlu(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-blue-500 text-sm font-bold text-blue-600 text-center" />
                    </div>
                  </div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Šifra / Oznaka</label><input value={oznaka} onChange={e=>setOznaka(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-blue-500 text-sm font-mono" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Kategorija</label><input value={kategorija} onChange={e=>setKategorija(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-blue-500 text-sm font-medium" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 mb-1">Opis</label><textarea value={opis} onChange={e=>setOpis(e.target.value)} rows="3" className="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-blue-500 text-sm resize-none font-medium text-slate-600 leading-relaxed"></textarea></div>
                  <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setOtvorenModal(null)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-100">Odustani</button>
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md">Sačuvaj artikal</button>
                  </div>
              </form>
          </div>
        </div>
      )}

      {/* KONTROLNI PANEL ADMINISTRATORA */}
      {otvorenModal === 'podesavanja' && jeLiAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-100 my-8 animate-fade-in">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Kontrolni panel administratora</h2>
                <p className="text-xs text-slate-400 mt-1">Upravljanje pravima korisnika, bazom partnera i podacima</p>
              </div>
              <button onClick={() => setOtvorenModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
            </div>

            <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
              <div className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">💼 Upravljanje bazom komitenata</h3>
                <form onSubmit={dogodiSeIzmenaKomitenta} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Ime *</label>
                    <input required placeholder="Ime" value={adminKomitentNaziv} onChange={e=>setAdminKomitentNaziv(e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-xs bg-white outline-none focus:border-blue-500 font-semibold" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Grad</label>
                    <input placeholder="Grad" value={adminKomitentGrad} onChange={e=>setAdminKomitentGrad(e.target.value)} className="w-full border border-slate-200 p-2 rounded-lg text-xs bg-white outline-none focus:border-blue-500 font-medium" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Tip partnera</label>
                    <select value={adminKomitentTip} onChange={e=>setAdminKomitentTip(e.target.value)} className="w-full border border-slate-200 p-2.5 rounded-lg text-xs bg-white outline-none focus:border-blue-500 font-semibold text-slate-700">
                      <option value="Dobavljac">Dobavljač (Snabdevač)</option>
                      <option value="Kupac">Kupac (Prodajemo mu)</option>
                      <option value="Oboje">Obostrano (Oba tipa)</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg font-bold transition-all shadow-md">{urediKomitentId ? 'Sačuvaj izmjene' : '➕ Dodaj u bazu'}</button>
                </form>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[200px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-500 font-bold sticky top-0">
                      <tr>
                        <th className="px-4 py-2">Ime partnera</th>
                        <th className="px-4 py-2">Grad</th>
                        <th className="px-4 py-2">Tip u sistemu</th>
                        <th className="px-4 py-2 text-center">Akcije</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {komitenti.map(k => (
                        <tr key={k.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{k.naziv}</td>
                          <td className="px-4 py-2.5 text-slate-500">{k.grad || '-'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${k.tip === 'Dobavljac' ? 'bg-orange-50 text-orange-700 border border-orange-100' : k.tip === 'Kupac' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-purple-50 text-purple-700 border border-purple-100'}`}>{k.tip}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center space-x-2">
                            <button type="button" onClick={() => { setUrediKomitentId(k.id); setAdminKomitentNaziv(k.naziv); setAdminKomitentGrad(k.grad || ''); setAdminKomitentTip(k.tip); }} className="text-blue-600 hover:text-blue-800 font-bold">Uredi</button>
                            <button type="button" onClick={() => obrisiKomitenta(k.id, k.naziv)} className="text-red-500 hover:text-red-700 font-bold">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-5 bg-white">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">👥 Uloge i dozvole korisnika</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <th className="px-4 py-2 text-xs font-semibold text-slate-500">Email</th>
                        <th className="px-4 py-2 text-xs font-semibold text-slate-500 text-right">Dodijeljena uloga</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {profili.map(p => (
                        <tr key={p.id} className="hover:bg-white transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{p.email}</td>
                          <td className="px-4 py-3 text-right">
                            <select value={p.uloga} onChange={(e) => promijeniUloguKorisnika(p.id, e.target.value)} className="border border-slate-300 px-2 py-1.5 rounded-lg text-xs bg-white font-semibold text-slate-700 outline-none focus:border-blue-500">
                              <option value="Korisnik">👀 Korisnik (Read-only)</option>
                              <option value="Korisnik sa pravom povlacenja">🔄 Korisnik sa pravom povlačenja</option>
                              <option value="Admin">🔑 Admin (Sve dozvole)</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-5 bg-white">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">🧹 Istorija i reset sistema</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                    <h4 className="text-xs font-bold text-slate-600">Obriši pojedinačni log prometa</h4>
                    <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 no-scrollbar">
                      {istorija.length === 0 ? ( <p className="text-xs text-slate-400 italic">Istorija je prazna.</p> ) : (
                        istorija.map(log => (
                          <div key={log.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="truncate flex-1 mr-2">
                              <span className="font-semibold text-slate-700">{log.artikal}</span>
                              <p className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleDateString('sr-RS')} ({log.tip.replace('_', ' ')})</p>
                            </div>
                            <button onClick={() => otvoriBrisanjeLoga(log)} className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 hover:bg-red-50 rounded">✕</button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-2xl p-4 bg-red-50/10 border-red-100 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-red-600">Resetuj istoriju prometa</h4>
                      <p className="text-[11px] text-slate-400 mt-2">Ova opcija briše sve stavke u istoriji prometa i vraća tabelu u prvobitno nulto stanje.</p>
                    </div>
                    <button type="button" onClick={isprazniKompletnuIstoriju} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-xs font-bold shadow-lg shadow-red-200/50 mt-4">⚠️ Isprazni kompletnu istoriju prometa</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-5 mt-6 border-t border-slate-100">
              <button onClick={() => setOtvorenModal(null)} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-colors">Zatvori panel</button>
            </div>
          </div>
        </div>
      )}

      {/* PAMETNI MODAL: BRISANJE LOGA SA POVRATOM NA STANJE */}
      {otvorenModal === 'brisanjeLoga' && logZaBrisanje && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">⚠️ Brisanje zapisa iz istorije</h3>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl mt-4 mb-4">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Detalji zapisa:</p>
              <p className="text-sm font-semibold text-slate-800">{logZaBrisanje.artikal}</p>
              <p className="text-xs text-slate-600 mt-1">Količina: <span className="font-bold">{logZaBrisanje.kolicina}</span> | Tip: {logZaBrisanje.tip.replace('_', ' ')}</p>
            </div>
            <p className="text-sm text-slate-600 mb-4">Da li ste sigurni da želite trajno obrisati ovaj zapis?</p>
            {logZaBrisanje.tip === 'IZLAZ_OTPREMNICA' && (
              <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl mb-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={vratiNaStanje} onChange={(e) => setVratiNaStanje(e.target.checked)} className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                  <div className="flex-1">
                    <span className="block text-sm font-bold text-slate-800">Vrati količinu na zalihe</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">Fizičko stanje ovog artikla će se automatski povećati za {logZaBrisanje.kolicina} komada.</span>
                  </div>
                </label>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
              <button type="button" onClick={() => setOtvorenModal('podesavanja')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors">Otkaži</button>
              <button type="button" onClick={potvrdiBrisanjeLoga} className="px-5 py-2 bg-red-600 text-white text-sm font-bold rounded-xl shadow-md">Trajno obriši</button>
            </div>
          </div>
        </div>
      )}

      {/* UNIQUATNI SIGURNOSNI PROZOR */}
      {potvrdaModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">⚠️ {potvrdaModal.naslov}</h3>
            <p className="text-sm text-slate-500 mt-3 leading-relaxed">{potvrdaModal.poruka}</p>
            <div className="flex justify-end gap-3 pt-4 mt-5 border-t border-slate-100">
              {potvrdaModal.samoObavestenje ? (
                <button onClick={() => setPotvrdaModal(null)} className="px-5 py-2 bg-slate-800 text-white text-sm font-bold rounded-xl">U redu</button>
              ) : (
                <>
                  <button type="button" onClick={() => setPotvrdaModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl">Otkaži</button>
                  <button type="button" onClick={() => { if (potvrdaModal.akcija) { potvrdaModal.akcija(); } }} className="px-5 py-2 bg-red-600 text-white text-sm font-bold rounded-xl">Potvrdi</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}