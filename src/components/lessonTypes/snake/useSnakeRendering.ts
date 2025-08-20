import { useEffect, useRef } from 'react';
import { CELL } from './constants';
import type { Point, Food } from './types';

interface Params {
  snake: Point[];
  foods: Food[];
  food: Point; // klassisches Futter, falls keine Fragen
  blocksLength: number;
  score: number;
  finished: boolean;
  targetScore: number;
}

export function useSnakeRendering({ snake, foods, food, blocksLength, score, finished, targetScore }: Params){
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext('2d'); if(!ctx) return;
    ctx.clearRect(0,0, canvas.width, canvas.height);
    // Hintergrund
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0, canvas.width, canvas.height);
    // Foods
    if (blocksLength) {
      foods.forEach(f=>{
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x * CELL, f.y * CELL, CELL, CELL);
      });
    } else {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(food.x * CELL, food.y * CELL, CELL, CELL);
    }
    // Snake
    snake.forEach((p,i)=>{
      ctx.beginPath();
      ctx.arc(p.x * CELL + CELL/2, p.y * CELL + CELL/2, CELL/2, 0, Math.PI*2);
      ctx.fillStyle = i===0 ? '#111827' : '#374151';
      ctx.fill();
    });
    // Fortschritt
    if (!finished) {
      ctx.fillStyle = 'rgba(16,185,129,0.25)';
      const w = (Math.min(score, targetScore) / targetScore) * canvas.width;
      ctx.fillRect(0, canvas.height - 5, w, 5);
    }
  }, [snake, foods, food, blocksLength, score, finished, targetScore]);

  return canvasRef;
}
