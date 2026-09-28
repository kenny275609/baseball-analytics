'use client';

import { BaseballField } from '@/components/BaseballField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  QUALITY_OPTIONS,
  QUICK_RESULTS,
  RESULT_OPTIONS,
  ResultCode,
  ResultGroup,
  getResultOption,
} from '@/lib/atbat';

export interface AtbatDraft {
  result: ResultCode | null;
  quality: string | null;
  rbi: number;
  hitX: number | null;
  hitY: number | null;
  note: string;
}

export const EMPTY_DRAFT: AtbatDraft = {
  result: null,
  quality: null,
  rbi: 0,
  hitX: null,
  hitY: null,
  note: '',
};

const GROUP_STYLE: Record<ResultGroup, string> = {
  hit: 'border-red-300 text-red-700',
  onbase: 'border-amber-300 text-amber-700',
  out: 'border-blue-300 text-blue-800',
  other: 'border-gray-300 text-gray-700',
};

const GROUP_ACTIVE: Record<ResultGroup, string> = {
  hit: 'bg-red-600 border-red-600 text-white',
  onbase: 'bg-amber-500 border-amber-500 text-white',
  out: 'bg-blue-800 border-blue-800 text-white',
  other: 'bg-gray-600 border-gray-600 text-white',
};

interface AtbatEntryProps {
  draft: AtbatDraft;
  onChange: (draft: AtbatDraft) => void;
}

export function AtbatEntry({ draft, onChange }: AtbatEntryProps) {
  const selected = getResultOption(draft.result);
  // 舊資料可能是「出局（未分類）」，編輯時也要能顯示被選取
  const options = draft.result === 'out' ? RESULT_OPTIONS : QUICK_RESULTS;

  const pickResult = (code: ResultCode) => {
    const option = getResultOption(code)!;
    onChange({
      ...draft,
      result: code,
      // 沒碰到球就沒有擊球品質和落點
      ...(option.contacted ? {} : { quality: null, hitX: null, hitY: null }),
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2">
        {options.map((o) => (
          <button
            key={o.code}
            type="button"
            onClick={() => pickResult(o.code)}
            className={`rounded-lg border-2 py-2 px-1 leading-tight transition-colors ${
              draft.result === o.code ? GROUP_ACTIVE[o.group] : `bg-white ${GROUP_STYLE[o.group]}`
            }`}
          >
            <div className="text-base font-bold">{o.short}</div>
            <div className="text-[11px]">{o.label}</div>
          </button>
        ))}
      </div>

      {selected?.contacted && (
        <>
          <div className="space-y-2">
            <div className="text-sm font-medium">擊球品質（選填）</div>
            <div className="flex gap-2">
              {QUALITY_OPTIONS.map((q) => (
                <Button
                  key={q.value}
                  type="button"
                  size="sm"
                  variant={draft.quality === q.value ? 'default' : 'outline'}
                  onClick={() =>
                    onChange({ ...draft, quality: draft.quality === q.value ? null : q.value })
                  }
                >
                  {q.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">落點（點球場標記，選填）</div>
              {draft.hitX !== null && (
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={() => onChange({ ...draft, hitX: null, hitY: null })}
                >
                  清除落點
                </button>
              )}
            </div>
            <div className="max-w-sm mx-auto">
              <BaseballField
                points={
                  draft.hitX !== null && draft.hitY !== null
                    ? [{ x: draft.hitX, y: draft.hitY, group: selected.group }]
                    : []
                }
                onSelect={(x, y) => onChange({ ...draft, hitX: x, hitY: y })}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">打點</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange({ ...draft, rbi: Math.max(0, draft.rbi - 1) })}
          disabled={draft.rbi <= 0}
        >
          −
        </Button>
        <span className="w-6 text-center text-lg font-bold tabular-nums">{draft.rbi}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange({ ...draft, rbi: Math.min(4, draft.rbi + 1) })}
          disabled={draft.rbi >= 4}
        >
          +
        </Button>
      </div>

      <Input
        value={draft.note}
        onChange={(e) => onChange({ ...draft, note: e.target.value })}
        placeholder="備註（選填）"
      />
    </div>
  );
}
