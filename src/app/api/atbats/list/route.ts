import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('player');

    let query = supabase
      .from('atbats')
      .select('*, players(name, number)')
      .order('created_at', { ascending: false });

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    const { data: atbats, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ atbats }, { status: 200 });
  } catch (error) {
    console.error('Error fetching atbats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch atbats' },
      { status: 500 }
    );
  }
}
