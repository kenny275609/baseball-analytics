import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('atbats')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting atbat:', error);
    return NextResponse.json(
      { error: 'Failed to delete atbat' },
      { status: 500 }
    );
  }
}



