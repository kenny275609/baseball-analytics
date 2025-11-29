'use client';

import { useRef, useState, useEffect } from 'react';

interface HitPointCanvasProps {
  width?: number;
  height?: number;
  initialX?: number | null;
  initialY?: number | null;
  onPointSelect: (x: number, y: number) => void;
}

export function HitPointCanvas({
  width = 600,
  height = 600,
  initialX = null,
  initialY = null,
  onPointSelect,
}: HitPointCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ x: number; y: number } | null>(
    initialX !== null && initialY !== null ? { x: initialX, y: initialY } : null
  );

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

    // Draw selected point
    if (selectedPoint) {
      // 將 0-100 的座標轉換為畫布座標
      // X: 0-100 對應到畫布的 0-width
      // Y: 0-100 對應到畫布的 0-height
      const pointX = (selectedPoint.x / 100) * width;
      const pointY = (selectedPoint.y / 100) * height;

      // 繪製落點
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(pointX, pointY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 繪製座標文字
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px Arial';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      const text = `(${selectedPoint.x.toFixed(1)}, ${selectedPoint.y.toFixed(1)})`;
      const textX = pointX + 15;
      const textY = pointY - 15;
      
      // 繪製文字外框（白色）
      ctx.strokeText(text, textX, textY);
      // 繪製文字（黑色）
      ctx.fillText(text, textX, textY);
    }
  }, [width, height, selectedPoint]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // 計算實際點擊位置相對於畫布的比例
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    
    const x = ((e.clientX - rect.left) * scaleX / width) * 100;
    const y = ((e.clientY - rect.top) * scaleY / height) * 100;

    // Clamp to 0-100
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    setSelectedPoint({ x: clampedX, y: clampedY });
    onPointSelect(clampedX, clampedY);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        className="border-2 border-gray-300 cursor-crosshair rounded-lg"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="text-sm text-gray-600 text-center">
        <p>點擊球場上的位置來標記打擊落點</p>
        {selectedPoint && (
          <p className="mt-2 font-semibold text-blue-600">
            座標: ({selectedPoint.x.toFixed(1)}, {selectedPoint.y.toFixed(1)})
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          座標說明：X (0=左, 50=中央, 100=右) | Y (0=上方, 100=本壘板)
        </p>
      </div>
    </div>
  );
}
