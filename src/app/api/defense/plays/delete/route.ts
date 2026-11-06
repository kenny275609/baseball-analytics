import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isUuid } from '@/lib/baserunning';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json().catch(() => null);
    if (!isUuid(body?.id)) return NextResponse.json({ error: '缺少紀錄' }, { status: 400 });

    const { error } = await supabase.from('defense_plays').delete().eq('id', body.id);
    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting defense play:', error);
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}
