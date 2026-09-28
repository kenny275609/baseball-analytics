import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { parseAtbatInput } from '@/lib/atbat';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const parsed = parseAtbatInput(body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data: atbat, error } = await supabase
      .from('atbats')
      .update(parsed.row)
      .eq('id', body.id)
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
