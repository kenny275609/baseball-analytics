import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await requireRole(['editor', 'admin']);
    const supabase = await createClient();

    const body = await request.json();
    const { name, number } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({ name, number })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ player }, { status: 201 });
  } catch (error) {
    console.error('Error creating player:', error);
    return NextResponse.json(
      { error: 'Failed to create player' },
      { status: 500 }
    );
  }
}
