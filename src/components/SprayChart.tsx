'use client';

import { BaseballField, FieldPoint, Zone, ZONE_LABELS, zoneOf } from '@/components/BaseballField';

const OUTFIELD: Zone[] = ['LF', 'CF', 'RF'];
const INFIELD: Zone[] = ['IL', 'IC', 'IR'];

export function SprayChart({ hitPoints }: { hitPoints: FieldPoint[] }) {
  const counts = hitPoints.reduce(
    (acc, p) => {
      acc[zoneOf(p.x, p.y)]++;
      return acc;
    },
    { LF: 0, CF: 0, RF: 0, IL: 0, IC: 0, IR: 0 } as Record<Zone, number>
  );
  const total = hitPoints.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const zoneRow = (zone: Zone) => (
    <div key={zone} className="flex justify-between">
      <span>{ZONE_LABELS[zone]}</span>
      <span className="font-bold tabular-nums">
        {counts[zone]} <span className="text-gray-500 font-normal">({pct(counts[zone])}%)</span>
      </span>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-md">
        <BaseballField points={hitPoints} />
      </div>
      <div className="flex gap-4 text-xs text-gray-600">
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1" />安打</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />上壘</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-900 mr-1" />出局</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-gray-500 mr-1" />其他</span>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-md text-sm">
        <div className="bg-blue-50 p-3 rounded-lg space-y-1">
          <h4 className="font-semibold text-blue-800">外野</h4>
          {OUTFIELD.map(zoneRow)}
        </div>
        <div className="bg-orange-50 p-3 rounded-lg space-y-1">
          <h4 className="font-semibold text-orange-800">內野</h4>
          {INFIELD.map(zoneRow)}
        </div>
      </div>
    </div>
  );
}
