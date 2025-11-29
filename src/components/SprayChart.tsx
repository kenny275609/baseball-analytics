'use client';

import { useRef, useEffect } from 'react';

interface HitPoint {
  x: number;
  y: number;
  result?: string | null;
}

interface SprayChartProps {
  width?: number;
  height?: number;
  hitPoints: HitPoint[];
}

interface ZoneStats {
  leftField: number;
  centerField: number;
  rightField: number;
  leftInfield: number;  // 內野左側（三壘方向）
  centerInfield: number; // 內野中間（二壘方向）
  rightInfield: number;  // 內野右側（一壘方向）
}

export function SprayChart({
  width = 600,
  height = 600,
  hitPoints,
}: SprayChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 計算區域統計
  const calculateZoneStats = (): ZoneStats => {
    const stats: ZoneStats = {
      leftField: 0,
      centerField: 0,
      rightField: 0,
      leftInfield: 0,
      centerInfield: 0,
      rightInfield: 0,
    };

    hitPoints.forEach((point) => {
      const { x, y } = point;
      
      // 本壘板在 (50, 100)
      // 計算角度和距離
      // 注意：Y 越大越靠近本壘板，所以 dy = 100 - y（向上為正）
      const dx = x - 50; // 向右為正
      const dy = 100 - y; // 向上為正
      const distance = Math.sqrt(dx * dx + dy * dy); // 距離本壘板的距離
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      // 標準化角度到 0-360 度
      const normalizedAngle = angle < 0 ? angle + 360 : angle;

      // 判斷是內野還是外野
      // 內野半徑約為 35（在 0-100 座標系統中）
      // 如果距離本壘板 < 35，則為內野；否則為外野
      const infieldRadius = 35;
      const isOutfield = distance >= infieldRadius;
      
      if (isOutfield) {
        // 外野三個區塊（使用兩條分界線：67.5度和112.5度）
        // 左外野：角度 >= 112.5度
        // 中外野：67.5度 <= 角度 < 112.5度
        // 右外野：角度 < 67.5度
        if (normalizedAngle >= 112.5) {
          stats.leftField++;
        } else if (normalizedAngle >= 67.5) {
          stats.centerField++;
        } else {
          stats.rightField++;
        }
      } else {
        // 內野三個區塊（使用相同的兩條分界線：67.5度和112.5度）
        // 左側（三壘方向）：角度 >= 112.5度
        // 中間（二壘方向）：67.5度 <= 角度 < 112.5度
        // 右側（一壘方向）：角度 < 67.5度
        if (normalizedAngle >= 112.5) {
          stats.leftInfield++;
        } else if (normalizedAngle >= 67.5) {
          stats.centerInfield++;
        } else {
          stats.rightInfield++;
        }
      }
    });

    return stats;
  };

  const zoneStats = calculateZoneStats();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // 座標系統：本壘板在下方中央 (50, 100)
    // X: 0-100 (左到右，50 是中央)
    // Y: 0-100 (上到下，100 是本壘板)

    // Draw baseball field
    // Outer field (grass area)
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, 0, width, height);

    // Infield (dirt) - 從本壘板向外延伸的扇形
    ctx.fillStyle = '#D2B48C';
    const homeX = width * 0.5; // 本壘板 X 位置（中央）
    const homeY = height * 0.9; // 本壘板 Y 位置（下方）
    const infieldRadius = width * 0.35;
    
    ctx.beginPath();
    ctx.arc(homeX, homeY, infieldRadius, Math.PI, 0, false); // 從左到右的扇形
    ctx.lineTo(homeX, homeY);
    ctx.closePath();
    ctx.fill();

    // Base paths (壘包路徑)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    const baseDistance = width * 0.25;

    // 一壘線（向右上）
    ctx.beginPath();
    ctx.moveTo(homeX, homeY);
    ctx.lineTo(homeX + baseDistance * 0.707, homeY - baseDistance * 0.707);
    ctx.stroke();

    // 三壘線（向左上）
    ctx.beginPath();
    ctx.moveTo(homeX, homeY);
    ctx.lineTo(homeX - baseDistance * 0.707, homeY - baseDistance * 0.707);
    ctx.stroke();

    // Pitcher's mound (投手丘)
    const moundX = homeX;
    const moundY = homeY - baseDistance * 0.5;
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.arc(moundX, moundY, width * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // Home plate (本壘板)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(homeX, homeY);
    ctx.lineTo(homeX - 15, homeY - 10);
    ctx.lineTo(homeX, homeY - 20);
    ctx.lineTo(homeX + 15, homeY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 一壘 (First base)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(homeX + baseDistance * 0.707 - 10, homeY - baseDistance * 0.707 - 10, 20, 20);
    ctx.strokeRect(homeX + baseDistance * 0.707 - 10, homeY - baseDistance * 0.707 - 10, 20, 20);

    // 二壘 (Second base)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(homeX - 10, homeY - baseDistance - 10, 20, 20);
    ctx.strokeRect(homeX - 10, homeY - baseDistance - 10, 20, 20);

    // 三壘 (Third base)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(homeX - baseDistance * 0.707 - 10, homeY - baseDistance * 0.707 - 10, 20, 20);
    ctx.strokeRect(homeX - baseDistance * 0.707 - 10, homeY - baseDistance * 0.707 - 10, 20, 20);

    // 繪製區域劃分線
    // 外野/內野分界線（粗紅色弧線）
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(homeX, homeY, infieldRadius, Math.PI, 0, false);
    ctx.stroke();

    // 兩條分界線從本壘板向外延伸，同時劃分內野和外野
    // 第一條線：67.5度（一壘和正上方之間）
    // 第二條線：112.5度（三壘和正上方之間）
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    const boundaryAngles = [
      67.5,   // 右側/中間分界（一壘和正上方之間）
      112.5,  // 中間/左側分界（三壘和正上方之間）
    ];
    
    boundaryAngles.forEach((angleDeg) => {
      // 在我們的座標系統中，角度是從本壘板看的標準角度
      // 0度向右，90度向上，180度向左
      // 轉換為 Canvas 座標系統中的角度
      const angleRad = (angleDeg * Math.PI) / 180;
      
      // 計算目標點（在 0-100 座標系統中）
      // 從本壘板 (50, 100) 出發，角度為 angleDeg，距離為 80
      const distance = 80;
      const targetX = 50 + Math.cos(angleRad) * distance;
      const targetY = 100 - Math.sin(angleRad) * distance; // Y 越大越靠近本壘板，所以減去
      
      // 轉換為 Canvas 座標
      const endX = (targetX / 100) * width;
      const endY = (targetY / 100) * height;
      
      ctx.beginPath();
      ctx.moveTo(homeX, homeY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    });

    // 繪製所有落點
    hitPoints.forEach((point) => {
      const pointX = (point.x / 100) * width;
      const pointY = (point.y / 100) * height;

      // 繪製落點
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(pointX, pointY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [width, height, hitPoints]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border-2 border-gray-300 rounded-lg"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 外野統計 */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <h4 className="font-semibold text-sm mb-2 text-blue-800">外野</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>左外野:</span>
                <span className="font-bold">{zoneStats.leftField}</span>
              </div>
              <div className="flex justify-between">
                <span>中外野:</span>
                <span className="font-bold">{zoneStats.centerField}</span>
              </div>
              <div className="flex justify-between">
                <span>右外野:</span>
                <span className="font-bold">{zoneStats.rightField}</span>
              </div>
            </div>
          </div>

          {/* 內野統計 */}
          <div className="bg-orange-50 p-3 rounded-lg">
            <h4 className="font-semibold text-sm mb-2 text-orange-800">內野</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>右側:</span>
                <span className="font-bold">{zoneStats.rightInfield}</span>
              </div>
              <div className="flex justify-between">
                <span>中間:</span>
                <span className="font-bold">{zoneStats.centerInfield}</span>
              </div>
              <div className="flex justify-between">
                <span>左側:</span>
                <span className="font-bold">{zoneStats.leftInfield}</span>
              </div>
            </div>
          </div>

          {/* 總計 */}
          <div className="bg-green-50 p-3 rounded-lg">
            <h4 className="font-semibold text-sm mb-2 text-green-800">外野總計</h4>
            <div className="text-lg font-bold text-green-700">
              {zoneStats.leftField + zoneStats.centerField + zoneStats.rightField}
            </div>
          </div>

          <div className="bg-purple-50 p-3 rounded-lg">
            <h4 className="font-semibold text-sm mb-2 text-purple-800">內野總計</h4>
            <div className="text-lg font-bold text-purple-700">
              {zoneStats.leftInfield + zoneStats.centerInfield + zoneStats.rightInfield}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
