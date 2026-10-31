import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { findLatest } from '@/lib/conflictServer';
import { isUuid } from '@/lib/baserunning';
import { parseClientId } from '@/lib/idempotency';
import { isMissingTable, syncGameScore } from '@/lib/score';
import { UndoRequest, parseUndoRequest, sameTarget } from '@/lib/undo';

// 撤銷上一步：
//   { game_id, target: { kind: 'atbat', id } | { kind: 'play', play_id } }
//     刪除這場比賽最後一筆打席（連同它的跑壘）或最後一個非打擊跑壘 play。
//     target 必須仍是資料庫裡最新的一筆，否則回 409（例如另一支手機剛記錄），請前端重新確認
//   { game_id, client_id }
//     離線佇列送來的撤銷：刪除這個 client_id（= play_id）寫入的紀錄，沒有就當作成功（可重送）；
//     同樣必須仍是最新的一筆，之後已有其他紀錄（其他裝置接著記錄）就回 409，不從中間刪

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    if (!isUuid(body.game_id)) {
      return NextResponse.json({ error: '缺少比賽' }, { status: 400 });
    }
    const gameId = body.game_id;

    const clientId = parseClientId(body.client_id);
    if (clientId === false) {
      return NextResponse.json({ error: 'client_id 格式錯誤' }, { status: 400 });
    }
    if (clientId) {
      const { data: events, error } = await supabase
        .from('runner_events')
        .select('atbat_id')
        .eq('game_id', gameId)
        .eq('play_id', clientId);
      if (error) {
        if (isMissingTable(error)) return NextResponse.json({ success: true, deleted: 0 }, { status: 200 });
        throw error;
      }
      const atbatIds = [...new Set((events ?? []).map((e) => e.atbat_id).filter(Boolean))] as string[];
      if ((events ?? []).length > 0) {
        const own: UndoRequest =
          atbatIds.length > 0 ? { kind: 'atbat', id: atbatIds[0] } : { kind: 'play', play_id: clientId };
        if (!sameTarget(await findLatest(supabase, gameId), own)) {
          return NextResponse.json(
            { error: '這筆之後已經有其他紀錄（可能是其他裝置記錄的），無法撤銷；請捨棄這個撤銷，再到打席紀錄確認' },
            { status: 409 }
          );
        }
      }
      let deleted = 0;
      if (atbatIds.length > 0) {
        // 打席的跑壘事件由 ON DELETE CASCADE 一起刪除
        const { data, error: delError } = await supabase
          .from('atbats').delete().eq('game_id', gameId).in('id', atbatIds).select('id');
        if (delError) throw delError;
        deleted = data?.length ?? 0;
      } else if ((events ?? []).length > 0) {
        const { data, error: delError } = await supabase
          .from('runner_events').delete().eq('game_id', gameId).eq('play_id', clientId).is('atbat_id', null).select('id');
        if (delError) throw delError;
        deleted = data?.length ?? 0;
      }
      if ((events ?? []).length > 0 && deleted === 0) {
        return NextResponse.json({ error: '無法撤銷這筆紀錄（可能沒有權限）' }, { status: 403 });
      }
      if (deleted > 0) await syncGameScore(supabase, gameId);
      return NextResponse.json({ success: true, deleted }, { status: 200 });
    }

    const target = parseUndoRequest(body.target, isUuid);
    if (!target) {
      return NextResponse.json({ error: '請指定要撤銷的紀錄' }, { status: 400 });
    }

    const latest = await findLatest(supabase, gameId);
    if (!latest) {
      return NextResponse.json({ error: '這場比賽沒有可撤銷的紀錄' }, { status: 409 });
    }
    if (!sameTarget(latest, target)) {
      return NextResponse.json(
        { error: '最後一筆紀錄已經改變（可能是其他裝置剛記錄），請重新確認要撤銷哪一筆' },
        { status: 409 }
      );
    }

    const { data: deleted, error } =
      latest.kind === 'atbat'
        ? await supabase.from('atbats').delete().eq('game_id', gameId).eq('id', latest.id).select('id')
        : await supabase
            .from('runner_events')
            .delete()
            .eq('game_id', gameId)
            .eq('play_id', latest.play_id)
            .is('atbat_id', null)
            .select('id');
    if (error) throw error;
    // RLS 不允許時 delete 不會報錯，只是刪不到
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: '無法撤銷這筆紀錄（可能沒有權限或已被刪除）' }, { status: 403 });
    }

    await syncGameScore(supabase, gameId);

    return NextResponse.json({ success: true, undone: latest }, { status: 200 });
  } catch (error) {
    console.error('Error undoing last action:', error);
    return NextResponse.json({ error: '撤銷失敗' }, { status: 500 });
  }
}
