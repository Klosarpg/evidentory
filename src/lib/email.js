import nodemailer from 'nodemailer';

// Slanje emailova preko Gmail naloga (App Password). Samo na serveru.
// Potrebno u .env.local i na Vercelu: GMAIL_USER, GMAIL_APP_PASSWORD.

let transporter = null;

function dajTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''), // Google prikazuje lozinku sa razmacima
      },
    });
  }
  return transporter;
}

const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// redovi: niz [oznaka, vrijednost] za tabelu sa detaljima; dugme: { tekst, adresa }
export function htmlPoruke({ naslov, uvod, redovi = [], dugme, napomena }) {
  const tabela = redovi.length
    ? `<table style="border-collapse:collapse;margin:16px 0;font-size:14px">${redovi
        .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#475569">${escape(k)}</td><td style="padding:4px 0;color:#0f172a;font-weight:600">${escape(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const link = dugme
    ? `<p style="margin:20px 0"><a href="${escape(dugme.adresa)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${escape(dugme.tekst)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b">EVIDENTORY · SLOBODNI DANI</p>
<h1 style="margin:0 0 12px;font-size:20px">${escape(naslov)}</h1>
<p style="margin:0;font-size:15px;line-height:1.5">${escape(uvod)}</p>
${tabela}${link}
${napomena ? `<p style="margin:16px 0 0;font-size:13px;color:#475569;line-height:1.5">${escape(napomena)}</p>` : ''}
</div>
<p style="font-size:12px;color:#64748b;margin:12px 4px">Automatska poruka iz aplikacije Evidentory. Ne odgovaraj na ovaj email.</p>
</div></body></html>`;
}

export function tekstPoruke({ naslov, uvod, redovi = [], dugme, napomena }) {
  return [
    naslov, '', uvod, '',
    ...redovi.map(([k, v]) => `${k}: ${v}`),
    dugme ? `\n${dugme.tekst}: ${dugme.adresa}` : '',
    napomena ? `\n${napomena}` : '',
  ].join('\n');
}

// Vraća { ok, preskoceno?, greska? }. Nikad ne baca grešku: email ne smije oboriti glavnu akciju.
export async function posaljiEmail({ prima, naslov, sadrzaj, prilozi = [] }) {
  const lista = [...new Set((Array.isArray(prima) ? prima : [prima]).filter(Boolean))];
  if (lista.length === 0) return { ok: true, preskoceno: 'nema primalaca' };

  const t = dajTransporter();
  if (!t) {
    const fali = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'].filter((k) => !process.env[k]);
    console.warn(`Email nije poslat: server ne vidi ${fali.join(' i ')}.`);
    return {
      ok: false,
      greska: `Server ne vidi ${fali.join(' i ')}. Provjeri .env.local (ili Vercel → Environment Variables) i restartuj server.`,
    };
  }

  // Svakom primaocu posebno, da ne vide adrese jedni drugih.
  const greske = [];
  for (const adresa of lista) {
    try {
      await t.sendMail({
        from: `"Evidentory" <${process.env.GMAIL_USER}>`,
        to: adresa,
        subject: naslov,
        text: tekstPoruke(sadrzaj),
        html: htmlPoruke(sadrzaj),
        attachments: prilozi,
      });
    } catch (e) {
      console.error(`Email za ${adresa} nije poslat:`, e.message);
      greske.push(`${adresa}: ${e.message}`);
    }
  }
  return greske.length ? { ok: false, greska: `Email nije poslat (${greske.join('; ')})` } : { ok: true };
}
