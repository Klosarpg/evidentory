'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Dok korisnik ne postavi svoju lozinku (nalog je napravio admin ili mu je admin promijenio lozinku),
// sa svake stranice ga vraća na "Promjena lozinke". Prijava i sama promjena lozinke su izuzetak.
const SLOBODNO = ['/', '/promjena-lozinke'];

export default function ZastitaLozinke() {
  const putanja = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (SLOBODNO.includes(putanja)) return;
    const provjeri = (session) => {
      if (session?.user?.user_metadata?.mora_promijeniti_lozinku) router.replace('/promjena-lozinke');
    };
    supabase.auth.getSession().then(({ data: { session } }) => provjeri(session));
    const { data } = supabase.auth.onAuthStateChange((_dogadjaj, session) => provjeri(session));
    return () => data.subscription.unsubscribe();
  }, [putanja, router]);

  return null;
}
