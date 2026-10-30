import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function GET(_request: Request, ctx: RouteContext<'/api/players/[id]'>) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const { id } = await ctx.params;
    const { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '找不到這位球員' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ player }, { status: 200 });
  } catch (error) {
    console.error('Error fetching player:', error);
    return NextResponse.json({ error: 'Failed to fetch player' }, { status: 500 });
  }
}
