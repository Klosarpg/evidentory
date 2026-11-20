import './globals.css';
import ZastitaLozinke from './_komponente/ZastitaLozinke';

export const metadata = {
  title: 'Evidentory',
  description: 'Sistem za evidenciju zaliha',
};

export default function RootLayout({ children }) {
  return (
    <html lang="sr">
      <body className="bg-slate-50 text-slate-900">
        <ZastitaLozinke />
        {children}
      </body>
    </html>
  );
}