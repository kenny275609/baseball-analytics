import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const session = await requireAuth();
    const supabase = await createClient();

    const { data: players, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    return NextResponse.json({ players: players || [] }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch players',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
