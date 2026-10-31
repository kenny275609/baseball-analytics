import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { parseSubstitutionInput } from '@/lib/substitution';
import { createSubstitution } from '@/lib/substitutionServer';

// 比賽中換人：代打 / 代跑 / 守備或一般替換 / 加棒次。
// 寫入換人紀錄並更新打序；已記錄的打席不變（原球員成績保留）。
// 只在線上使用（不進離線佇列）：打序以伺服器目前的狀態檢查，對不上就回 409
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const parsed = parseSubstitutionInput(await request.json().catch(() => null));
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const result = await createSubstitution(supabase, parsed.value);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Error creating substitution:', error);
    return NextResponse.json({ error: '換人失敗' }, { status: 500 });
  }
}
