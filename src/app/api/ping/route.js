import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Ova funkcija se pokreće kada neko poseti link /api/ping
export async function GET() {
  try {
    // Pravimo najsitniji mogući upit (tražimo samo jedan ID) 
    // kako ne bismo trošili resurse, ali dovoljno da Supabase zabeleži aktivnost.
    const { data, error } = await supabase
      .from('oprema')
      .select('id')
      .limit(1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Supabase je uspešno pingovan i aktivan!',
      vreme: new Date().toLocaleString()
    }, { status: 200 });

  } catch (err) {
    return NextResponse.json({ success: false, error: 'Greška na serveru' }, { status: 500 });
  }
}