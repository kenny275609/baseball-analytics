'use client';

import { useState } from 'react';
import { BaseballField } from '@/components/BaseballField';
import { POSITIONS, positionLabel } from '@/lib/defense';

export interface FieldPlayer {
  id: string;
  name: string;
  number: string | null;
}

// 守備位置在球場圖上的位置（BaseballField 的 0–100 座標）。名牌比實際站位拉開一些，手機上才不會互相蓋住；
// 10 自由手站在二壘後方的淺中外野
const SPOTS: Record<number, { x: number; y: number }> = {
  1: { x: 50, y: 66 },
  2: { x: 50, y: 89 },
  3: { x: 83, y: 66 },
  4: { x: 68, y: 52 },
  5: { x: 17, y: 66 },
  6: { x: 32, y: 52 },
  7: { x: 17, y: 36 },
  8: { x: 50, y: 21 },
  9: { x: 83, y: 36 },
  10: { x: 50, y: 37 },
};

// 選取的球員或位置；位置連同當下守那裡的人一起記（空位置為 null），另一支手機改過就作廢
type Pick = { kind: 'player'; id: string } | { kind: 'pos'; pos: number; id: string | null } | null;

interface DefenseFieldProps {
  positions: Map<number, string>;
  players: FieldPlayer[];
  // 目前打序上的球員（依棒次）：板凳區先列這些人
  lineup: string[];
  editable: boolean;
  // 依序套用：[位置, 球員]，球員 null 表示清空該位置
  onAssign: (changes: [number, string | null][]) => void;
}

const label = (p: FieldPlayer | undefined) => (p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : '');

// 守備位置圖：先點球員再點位置放上去；點場上的球員再點別的位置就移過去（有人就互換）
export function DefenseField({ positions, players, lineup, editable, onAssign }: DefenseFieldProps) {
  const [picked, setPick] = useState<Pick>(null);
  const [othersOpen, setShowOthers] = useState(false);
  // 沒排打序（只記防守）時全部球員直接列出
  const hasLineup = lineup.length > 0;
  const showOthers = othersOpen || !hasLineup;

  const byId = new Map(players.map((p) => [p.id, p]));
  const onField = new Set(positions.values());
  const lineupSet = new Set(lineup);
  const benchLineup = lineup.filter((id) => !onField.has(id) && byId.has(id)).map((id) => byId.get(id)!);
  const others = players.filter((p) => !onField.has(p.id) && !lineupSet.has(p.id));
  // 背景同步後選取的狀態可能已經不成立（球員被另一支手機排上場、位置上的人換了），就當作沒選
  const pick: Pick =
    picked === null
      ? null
      : picked.kind === 'player'
        ? onField.has(picked.id) ? null : picked
        : (positions.get(picked.pos) ?? null) === picked.id ? picked : null;

  const tapPosition = (pos: number) => {
    if (!editable) return;
    const here = positions.get(pos) ?? null;
    if (pick?.kind === 'player') {
      onAssign([[pos, pick.id]]);
      setPick(null);
    } else if (pick?.kind === 'pos' && pick.id && pick.pos !== pos) {
      // 選了場上的人再點別的位置：移過去，目的地有人就互換
      onAssign(here ? [[pos, pick.id], [pick.pos, here]] : [[pos, pick.id]]);
      setPick(null);
    } else if (pick?.kind === 'pos' && pick.pos === pos) {
      setPick(null);
    } else {
      // 沒選東西，或選的是空位置：改選這個位置
      setPick({ kind: 'pos', pos, id: here });
    }
  };

  const tapBench = (id: string) => {
    if (!editable) return;
    if (pick?.kind === 'pos') {
      onAssign([[pick.pos, id]]);
      setPick(null);
    } else {
      setPick(pick?.kind === 'player' && pick.id === id ? null : { kind: 'player', id });
    }
  };

  const pickedName = pick?.id ? label(byId.get(pick.id)) : '';

  const benchButton = (p: FieldPlayer) => (
    <button
      key={p.id}
      type="button"
      disabled={!editable}
      onClick={() => tapBench(p.id)}
      aria-pressed={pick?.kind === 'player' && pick.id === p.id}
      className={`h-10 touch-manipulation rounded-full border px-3 text-sm ${
        pick?.kind === 'player' && pick.id === p.id
          ? 'border-blue-700 bg-blue-700 text-white'
          : 'border-gray-300 bg-white text-gray-800'
      }`}
    >
      {label(p)}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="relative mx-auto max-w-md pb-3">
        <BaseballField />
        {POSITIONS.map((p) => {
          const { x, y } = SPOTS[p.pos];
          const player = byId.get(positions.get(p.pos) ?? '');
          const selected = pick?.kind === 'pos' && pick.pos === p.pos;
          const target = pick !== null && !selected;
          return (
            <button
              key={p.pos}
              type="button"
              onClick={() => tapPosition(p.pos)}
              disabled={!editable}
              aria-label={`${p.label}${player ? ` ${label(player)}` : ' 空'}`}
              aria-pressed={selected}
              className={`absolute touch-manipulation flex w-[4.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg border px-1 py-0.5 leading-tight shadow-sm ${
                selected
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : player
                    ? 'border-white bg-white/95 text-gray-900'
                    : `border-dashed bg-white/60 text-gray-600 ${target ? 'border-blue-700' : 'border-gray-500'}`
              } ${target ? 'ring-2 ring-blue-500' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className={`text-[10px] ${selected ? 'text-blue-100' : 'text-gray-500'}`}>
                {p.pos} {p.label.replace('手', '')}
              </span>
              <span className="w-full truncate text-xs font-medium">{player ? label(player) : '—'}</span>
            </button>
          );
        })}
      </div>

      {editable && (
        <div className="min-h-5 text-sm text-gray-600">
          {pick === null
            ? '點下面的球員，再點球場上的位置放上去；點場上的球員可以換位置'
            : pick.kind === 'player'
              ? `${pickedName}：點球場上的位置（有人就換下來）`
              : pick.id
                ? `${pickedName}：點別的位置移過去（有人就互換），或點下面的球員換上場`
                : `${positionLabel(pick.pos)}：點下面的球員放上來`}
        </div>
      )}
      {editable && pick?.kind === 'pos' && pick.id && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onAssign([[pick.pos, null]]);
              setPick(null);
            }}
            className="h-10 rounded-md border border-red-300 px-3 text-sm text-red-700"
          >
            移下場
          </button>
          <button type="button" onClick={() => setPick(null)} className="h-10 rounded-md border px-3 text-sm">
            取消
          </button>
        </div>
      )}

      {editable && (
        <div className="space-y-2">
          {hasLineup && (
            <>
              <div className="text-xs text-gray-500">打序上還沒排守備位置</div>
              <div className="flex flex-wrap gap-2">
                {benchLineup.length ? benchLineup.map(benchButton) : <span className="text-sm text-gray-400">都排好了</span>}
              </div>
            </>
          )}
          {others.length > 0 &&
            (hasLineup ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  aria-expanded={showOthers}
                  className="py-1.5 text-sm text-blue-700 underline"
                >
                  {showOthers ? '收起其他球員' : `其他球員（${others.length}）`}
                </button>
                {showOthers && <div className="flex flex-wrap gap-2">{others.map(benchButton)}</div>}
              </>
            ) : (
              <>
                <div className="text-xs text-gray-500">還沒排守備位置的球員</div>
                <div className="flex flex-wrap gap-2">{others.map(benchButton)}</div>
              </>
            ))}
        </div>
      )}
    </div>
  );
}
