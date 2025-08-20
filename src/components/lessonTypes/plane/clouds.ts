// Wolken-Logik & Hilfsfunktionen (aus game.js extrahiert & typisiert)
import { Cloud, LOGICAL_HEIGHT, LOGICAL_WIDTH, TOP_SAFE_ZONE, QuestionBlock } from './types';
let cloudIdCounter = 1;

interface LayoutResult { fontSize: number; lines: string[]; lineHeight: number }
interface LayoutOptions {
  maxFont?: number;
  minFont?: number;
  hPadding?: number;
  vPadding?: number;
}

export function laneCenterY(laneIndex:number, cloudHeight:number){
  const bottomMargin = 0.15;
  const minCenter = TOP_SAFE_ZONE + cloudHeight/2 + 5;
  const maxCenter = LOGICAL_HEIGHT * (1 - bottomMargin) - cloudHeight/2;
  const usable = Math.max(20, maxCenter - minCenter);
  const step = usable / 3;
  return minCenter + step * laneIndex;
}

export function layoutCloudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  options: LayoutOptions = {}
): LayoutResult {
  const maxLines = 2;
  const maxFont = options.maxFont || 24;
  const minFont = options.minFont || 6;
  const lineSpacing = 1.08;
  const hPad = options.hPadding || 28;
  const vPad = options.vPadding || 12;
  const usableWidth = maxWidth - hPad;
  const usableHeight = maxHeight - vPad*2;
  function hyphenateWord(word:string, fs:number){
    ctx.font = `600 ${fs}px system-ui`;
    if(ctx.measureText(word).width <= usableWidth) return [word];
    const parts:string[] = []; let cur='';
    for(let i=0;i<word.length;i++){
      const ch=word[i]; const test=cur+ch;
      if(ctx.measureText(test+'-').width <= usableWidth){ cur=test; } else { if(cur.length){ parts.push(cur+'-'); cur=ch; } else { parts.push(ch); cur=''; } }
    }
    if(cur) parts.push(cur); return parts;
  }
  function wrap(fs:number){
    ctx.font = `600 ${fs}px system-ui`; const lineHeight = fs*lineSpacing; if(lineHeight>usableHeight) return null;
    const wordsRaw = text.trim().split(/\s+/).filter(Boolean); const tokens:string[]=[];
    for(const w of wordsRaw){ if(ctx.measureText(w).width>usableWidth){ tokens.push(...hyphenateWord(w,fs)); } else tokens.push(w); }
    let lines=['']; for(const tk of tokens){ const cand=lines[lines.length-1]? lines[lines.length-1]+' '+tk: tk; if(ctx.measureText(cand).width<=usableWidth){ lines[lines.length-1]=cand; } else { lines.push(tk); if(lines.length>maxLines) return null; } }
    const totalH = lines.length * lineHeight; if(totalH>usableHeight) return null; return {lines,lineHeight};
  }
  let lo = minFont, hi = maxFont;
  let best: { fs: number; lines: string[]; lineHeight: number } | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const fit = wrap(mid);
    if (fit) { best = { fs: mid, ...fit }; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (best) return { fontSize: best.fs, lines: best.lines, lineHeight: best.lineHeight };
  const fs=minFont; const fw=wrap(fs)||{lines:[text.slice(0, Math.max(1, Math.min(20,text.length)))], lineHeight:fs*lineSpacing};
  return { fontSize:fs, lines:fw.lines, lineHeight:fw.lineHeight };
}

export function preventOverlap(cloudsLocal:Cloud[]){
  let changed=true; let guard=0; while(changed && guard<10){ changed=false; guard++; for(let i=0;i<cloudsLocal.length;i++){ for(let j=i+1;j<cloudsLocal.length;j++){ const a=cloudsLocal[i], b=cloudsLocal[j]; if(a.lane===b.lane){ const minGap=(a.w/2 + b.w/2)+80; if(Math.abs(a.x-b.x) < minGap){ changed=true; if(a.x<b.x) b.x=a.x+minGap; else a.x=b.x+minGap; } } } } }
}

export function createCloudGroup(ctx:CanvasRenderingContext2D, question:QuestionBlock, qid:number, existing:Cloud[]): Cloud[] {
  const indices = [0,1,2,3].sort(()=>Math.random()-0.5);
  const laneOrder = [0,1,2,3].sort(()=>Math.random()-0.5);
  const CLOUD_SCALE = 0.85; const baseW = 220*CLOUD_SCALE; const baseH = 88*CLOUD_SCALE;
  const rightMostExisting = existing.length ? Math.max(...existing.map(c=>c.x + c.w/2)) : 0;
  const newClouds:Cloud[] = indices.map((ai,i)=>({
    id: cloudIdCounter++,
    text: question.answers[ai] || '', correct: ai===question.correct, lane: laneOrder[i], x: Math.max(LOGICAL_WIDTH + 80 + i*200, rightMostExisting + 160 + i*55), y:0, w:baseW, h:baseH, speed:220+Math.random()*40, hit:false, alpha:1, qid, pop:0, active:true, persistent:false, fontSize:26, lines:null, lineHeight:0
  }));
  newClouds.forEach(c=>{ c.y = laneCenterY(c.lane, c.h); const layout = layoutCloudText(ctx, c.text, c.w, c.h, {maxFont:26, minFont:4, hPadding:28, vPadding:12}); c.fontSize=layout.fontSize; c.lines=layout.lines; c.lineHeight=layout.lineHeight; });
  const combined = [...existing, ...newClouds];
  preventOverlap(combined);
  return combined;
}
