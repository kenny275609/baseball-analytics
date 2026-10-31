'use client';

interface ScoreboardProps {
  opponent: string;
  homeAway: 'home' | 'away';
  innings: number;
  // null 表示舊比賽沒有逐局資料，只顯示總分
  ourRuns: Map<number, number> | null;
  ourTotal: number | null;
  oppRuns: Map<number, number>;
  oppTotal: number | null;
  currentInning: number | null;
  // 有傳入時對手每局得分可直接編輯
  // 回傳是否儲存成功
  onOppChange?: (inning: number, value: string) => Promise<boolean>;
}

// 簡易逐局記分板：先攻在上、後攻在下
export function Scoreboard({
  opponent,
  homeAway,
  innings,
  ourRuns,
  ourTotal,
  oppRuns,
  oppTotal,
  currentInning,
  onOppChange,
}: ScoreboardProps) {
  const cols = Array.from({ length: innings }, (_, i) => i + 1);

  const ourRow = (
    <tr key="us">
      <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold whitespace-nowrap">我方</th>
      {cols.map((i) => (
        <td key={i} className={`px-1 py-1.5 text-center tabular-nums ${i === currentInning ? 'bg-amber-50' : ''}`}>
          {ourRuns ? (ourRuns.get(i) ?? (currentInning !== null && i <= currentInning ? 0 : '')) : '—'}
        </td>
      ))}
      <td className="px-2 py-1.5 text-center font-bold tabular-nums border-l">{ourTotal ?? '—'}</td>
    </tr>
  );

  const oppRow = (
    <tr key="opp">
      <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold max-w-20 truncate">{opponent}</th>
      {cols.map((i) => {
        const value = oppRuns.get(i);
        return (
          <td key={i} className={`px-0.5 py-1 text-center tabular-nums ${i === currentInning ? 'bg-amber-50' : ''}`}>
            {onOppChange ? (
              <input
                // 資料更新後重設輸入框內容
                key={`${i}-${value ?? ''}`}
                type="number"
                inputMode="numeric"
                min="0"
                max="99"
                defaultValue={value ?? ''}
                onBlur={async (e) => {
                  const input = e.currentTarget;
                  const saved = value?.toString() ?? '';
                  const next = input.value.trim();
                  if (next === saved) return;
                  const n = Number(next);
                  const valid = next === '' || (Number.isInteger(n) && n >= 0 && n <= 99);
                  // 格式不符或儲存失敗時還原成目前的值，避免輸入框和總分不一致
                  if (!valid || !(await onOppChange(i, next))) input.value = saved;
                }}
                className="w-9 h-9 rounded-md border text-center text-base [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                aria-label={`${opponent} 第 ${i} 局得分`}
              />
            ) : (
              value ?? ''
            )}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-center font-bold tabular-nums border-l">{oppTotal ?? '—'}</td>
    </tr>
  );

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="sticky left-0 bg-white px-2 py-1 text-left font-normal" />
            {cols.map((i) => (
              <th key={i} className="px-1 py-1 font-normal min-w-9">{i}</th>
            ))}
            <th className="px-2 py-1 font-semibold border-l">R</th>
          </tr>
        </thead>
        <tbody className="divide-y">{homeAway === 'away' ? [ourRow, oppRow] : [oppRow, ourRow]}</tbody>
      </table>
    </div>
  );
}
