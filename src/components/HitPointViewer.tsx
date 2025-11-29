'use client';

import { useRef, useEffect } from 'react';

interface HitPointViewerProps {
  width?: number;
  height?: number;
  hitX: number;
  hitY: number;
}

export function HitPointViewer({
  width = 600,
  height = 600,
  hitX,
  hitY,
}: HitPointViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Draw hit point
    const pointX = (hitX / 100) * width;
    const pointY = (hitY / 100) * height;

    // 繪製落點（更大的標記，更明顯）
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(pointX, pointY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 繪製座標文字
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    const text = `(${hitX.toFixed(1)}, ${hitY.toFixed(1)})`;
    const textX = pointX + 18;
    const textY = pointY - 18;
    
    // 繪製文字外框（白色）
    ctx.strokeText(text, textX, textY);
    // 繪製文字（黑色）
    ctx.fillText(text, textX, textY);

    // 繪製從本壘板到落點的線（可選，幫助視覺化）
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(homeX, homeY);
    ctx.lineTo(pointX, pointY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [width, height, hitX, hitY]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border-2 border-gray-300 rounded-lg"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="text-sm text-gray-600 text-center">
        <p className="font-semibold">打擊落點位置</p>
        <p className="mt-1 text-blue-600">
          座標: ({hitX.toFixed(1)}, {hitY.toFixed(1)})
        </p>
        <p className="mt-2 text-xs text-gray-500">
          X (0=左, 50=中央, 100=右) | Y (0=上方, 100=本壘板)
        </p>
      </div>
    </div>
  );
}
