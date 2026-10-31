import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isStandaloneType, isUuid, movedRunners, parseAllRunnerInputs } from '@/lib/baserunning';
import { checkRunnersInDb } from '@/lib/basesServer';
import { findExistingPlay, isUniqueViolation, parseClientId } from '@/lib/idempotency';
import { isMissingTable, syncGameScore } from '@/lib/score';

// 兩個打席之間的跑壘（牽制、投手犯規…；盜壘/暴投等舊類型仍接受），同一次送出的跑者算同一個 play
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const inning = Number(body.inning);
    if (!isUuid(body.game_id) || !Number.isInteger(inning) || inning < 1 || inning > 30) {
      return NextResponse.json({ error: '缺少比賽或局數' }, { status: 400 });
    }
    // 離線同步重送：同一個 client_id（= play_id）已經寫過就直接回傳，不重複記錄
    const clientId = parseClientId(body.client_id);
    if (clientId === false) {
      return NextResponse.json({ error: 'client_id 格式錯誤' }, { status: 400 });
    }
    if (clientId) {
      const existing = await findExistingPlay(supabase, body.game_id, clientId);
      if (existing.kind === 'play') {
        return NextResponse.json({ runner_events: existing.events, duplicate: true }, { status: 200 });
      }
      if (existing.kind === 'atbat') {
        return NextResponse.json({ error: '這筆紀錄的識別碼已被打席使用' }, { status: 409 });
      }
    }
    if (!isStandaloneType(body.event_type)) {
      return NextResponse.json({ error: '請選擇跑壘事件' }, { status: 400 });
    }
    const allRunners = parseAllRunnerInputs(body.runners, false);
    if (!allRunners) {
      return NextResponse.json({ error: '跑壘資料錯誤' }, { status: 400 });
    }
    const runners = movedRunners(allRunners);
    if (runners.length === 0) {
      return NextResponse.json({ error: '沒有跑者移動' }, { status: 400 });
    }
    // 跑者必須真的在壘上（以資料庫裡該局的事件為準）
    const check = await checkRunnersInDb(supabase, body.game_id, inning, allRunners);
    if (check.kind === 'invalid') {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    if (check.kind === 'missing') {
      return NextResponse.json({ error: '跑壘資料表尚未建立，請先執行 migration' }, { status: 503 });
    }
    if (check.kind === 'failed') throw check.error;

    const playId = clientId ?? crypto.randomUUID();
    const { data, error } = await supabase
      .from('runner_events')
      .insert(
        runners.map((r) => ({
          ...r,
          event_type: body.event_type,
          game_id: body.game_id,
          atbat_id: null,
          play_id: playId,
          inning,
        }))
      )
      .select('*, players(name, number)');

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: '跑壘資料表尚未建立，請先執行 migration' }, { status: 503 });
      }
      // 兩個重送請求同時到，unique index 擋下後一筆：回傳先寫入的那一筆
      if (clientId && isUniqueViolation(error)) {
        const existing = await findExistingPlay(supabase, body.game_id, clientId);
        if (existing.kind === 'play') {
          return NextResponse.json({ runner_events: existing.events, duplicate: true }, { status: 200 });
        }
      }
      throw error;
    }

    await syncGameScore(supabase, body.game_id);

    return NextResponse.json({ runner_events: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating runner events:', error);
    return NextResponse.json({ error: 'Failed to create runner events' }, { status: 500 });
  }
}
