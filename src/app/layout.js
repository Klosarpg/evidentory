import './globals.css';

export const metadata = {
  title: 'Evidentory',
  description: 'Sistem za evidenciju zaliha',
};

export default function RootLayout({ children }) {
  return (
    <html lang="sr">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}