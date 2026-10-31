import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function GET(_request: Request, ctx: RouteContext<'/api/atbats/[id]'>) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const { id } = await ctx.params;
    const { data: atbat, error } = await supabase
      .from('atbats')
      .select('*, players(name, number), games(game_date, opponent)')
      .eq('id', id)
      .single();

    if (error) {
      // PGRST116：查無資料；22P02：id 不是合法 UUID
      if (error.code === 'PGRST116' || error.code === '22P02') {
        return NextResponse.json({ error: '找不到這筆打席' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ atbat }, { status: 200 });
  } catch (error) {
    console.error('Error fetching atbat:', error);
    return NextResponse.json({ error: 'Failed to fetch atbat' }, { status: 500 });
  }
}
