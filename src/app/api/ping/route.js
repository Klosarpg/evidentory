import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Vercel Cron poziva ovu rutu jednom dnevno (vidi vercel.json),
// da Supabase vidi aktivnost nad bazom i ne pauzira projekat.
export async function GET(request) {
  // Ako je CRON_SECRET postavljen na Vercelu, Vercel ga šalje kao
  // "Authorization: Bearer <CRON_SECRET>". Bez njega ruta ostaje otvorena (za ručni test).
  const tajna = process.env.CRON_SECRET;
  if (tajna && request.headers.get('authorization') !== `Bearer ${tajna}`) {
    return NextResponse.json({ success: false, error: 'Nije dozvoljeno' }, { status: 401 });
  }

  try {
    // Najmanji mogući upit: dovoljan da Supabase zabilježi aktivnost nad bazom.
    const { error } = await supabase.from('oprema').select('id').limit(1);

    if (error) {
      console.error('Ping Supabase nije uspio:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase je uspješno pingovan i aktivan.',
      vrijeme: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Ping Supabase greška:', err);
    return NextResponse.json({ success: false, error: 'Greška na serveru' }, { status: 500 });
  }
}
