import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await requireRole(['editor', 'admin']);
    const supabase = await createClient();

    const body = await request.json();
    const {
      player_id,
      contacted,
      no_contact,
      quality,
      result,
      out_type,
      rbi,
      hit_x,
      hit_y,
      note,
    } = body;

    if (!player_id) {
      return NextResponse.json(
        { error: 'Player ID is required' },
        { status: 400 }
      );
    }

    const { data: atbat, error } = await supabase
      .from('atbats')
      .insert({
        player_id,
        contacted: contacted ?? false,
        no_contact,
        quality,
        result,
        out_type,
        rbi: rbi ?? 0,
        hit_x,
        hit_y,
        note,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ atbat }, { status: 201 });
  } catch (error) {
    console.error('Error creating atbat:', error);
    return NextResponse.json(
      { error: 'Failed to create atbat' },
      { status: 500 }
    );
  }
}
