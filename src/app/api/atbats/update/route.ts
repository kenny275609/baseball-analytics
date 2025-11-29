import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await requireRole(['editor', 'admin']);
    const supabase = await createClient();

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const { data: atbat, error } = await supabase
      .from('atbats')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ atbat }, { status: 200 });
  } catch (error) {
    console.error('Error updating atbat:', error);
    return NextResponse.json(
      { error: 'Failed to update atbat' },
      { status: 500 }
    );
  }
}
