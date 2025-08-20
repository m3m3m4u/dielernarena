"use client";
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Lesson } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from '../plane/questions';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

// Grundabmessungen wie Vorlage
const COLS=21; const ROWS=20; const tileSize=40; const MAX_LIVES=3; const DEFAULT_TARGET_SCORE=12;
// Ansatz v3: Kontinuierliche langsame Bewegung (Sekunden pro Tile) ohne künstliche Stopps.
// Einfach anpassbar über PLAYER_TILE_TIME, GHOST_TILE_TIMES und optional speedFactor UI.
// 12.08: +50% Speed => Zeiten * 2/3 (~0.666)
const PLAYER_TILE_TIME=0.93; // vorher 1.4
const GHOST_TILE_TIMES=[1.07,1.00,1.20,1.33]; // vorher 1.6,1.5,1.8,2.0
const GLOBAL_SPEED_SCALE=1.0; // globaler Multiplikator
const DEBUG_VERSION='pac-flow-v3.1-fast50';

interface AnswerZone { roomIndex:number; letter:string; x:number;y:number;w:number;h:number; tileCoords:{tx:number;ty:number}[]; text:string;correct:boolean; }
interface Ghost { tileX:number; tileY:number; x:number; y:number; r:number; dir:{x:number;y:number}; progress:number; tileTime:number; color:string; type:number; prevDir?:{x:number;y:number}; straightCount:number; }

const ghostColors=['#ff4081','#40c4ff','#ff9100','#8bc34a'];

// Eingebettetes Layout (aus Vorlage) - könnte später aus Datei gelesen werden
const embeddedCSV=`1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1\n1;A;A;A;A;A;1;1;1;1;1;1;1;1;1;B;B;B;B;B;1\n1;A;A;A;A;A;0;0;0;0;0;0;0;0;0;B;B;B;B;B;1\n1;A;A;A;A;A;1;0;1;1;0;1;1;0;1;B;B;B;B;B;1\n1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1\n1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1\n1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1\n1;1;G;0;0;0;0;0;0;0;0;0;0;0;0;0;0;G;0;1;1\n1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1\n1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1\n1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1\n1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1\n1;1;G;0;0;0;0;0;0;0;0;0;0;0;0;0;0;G;0;1;1\n1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1\n1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1\n1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1\n1;C;C;C;C;C;1;0;1;1;0;1;1;0;1;D;D;D;D;D;1\n1;C;C;C;C;C;0;0;0;0;0;0;0;0;0;D;D;D;D;D;1\n1;C;C;C;C;C;1;1;1;1;1;1;1;1;1;D;D;D;D;D;1\n1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1`;

export default function PacmanGame({ lesson, courseId, completedLessons, setCompletedLessons }:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const wrapperRef=useRef<HTMLDivElement|null>(null);
  const hudRef=useRef<HTMLDivElement|null>(null);
  const bottomInfoRef=useRef<HTMLDivElement|null>(null);
  const { data: session } = useSession();

  const [questionText,setQuestionText]=useState('');
  const [score,setScore]=useState(0); const [lives,setLives]=useState(MAX_LIVES);
  const [paused,setPaused]=useState(false); const [gameOver,setGameOver]=useState(false); const [finished,setFinished]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false); const [gamePixelWidth,setGamePixelWidth]=useState<number>();

  const targetScore=Number((lesson as any)?.content?.targetScore)||DEFAULT_TARGET_SCORE;
  const blocks=buildQuestionBlocks(lesson); // gleiche Frage-Extraktion wie andere Spiele
  const questionPoolRef=useRef<{idx:number;weight:number}[]>([]); const currentQuestionIndexRef=useRef(0);
  const questionStatsRef=useRef<{correct:number;wrong:number;shown:number}[]>([]); // Statistik je Frage
  const historyRef=useRef<number[]>([]); // Verlauf zur Verteilungssteuerung
  const answerZonesRef=useRef<AnswerZone[]>([]);
  const playerRef=useRef({tileX:10,tileY:Math.floor(ROWS/2),x:0,y:0,r:14,dir:{x:0,y:-1},nextDir:{x:0,y:-1},progress:0,tileTime:PLAYER_TILE_TIME,canTurn:true});
  const [speedFactor,setSpeedFactor]=useState(1); const speedFactorRef=useRef(1); useEffect(()=>{ speedFactorRef.current=speedFactor; },[speedFactor]);
  const ghostsRef=useRef<Ghost[]>([]); const ghostSpawnPointsRef=useRef<{x:number;y:number}[]>([]);
  const correctFlashRef=useRef<{x:number;y:number;w:number;h:number;start:number;duration:number}|null>(null);
  const showCorrectUntilRef=useRef(0); const lastCorrectRoomIndexRef=useRef<number|null>(null);
  const answerCooldownRef=useRef(false); const requireExitBeforeAnswerRef=useRef(false);

  const mazeRef=useRef<string[]>([]);

  // Maze parsen
  const initMaze=useCallback(()=>{
    const lines=embeddedCSV.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length);
    ghostSpawnPointsRef.current=[];
    mazeRef.current=lines.map((line,rowIdx)=> line.split(/;|,/).map(c=>c.trim()).filter(c=>c.length).map((ch,colIdx)=>{ if(ch==='G'){ ghostSpawnPointsRef.current.push({x:colIdx,y:rowIdx}); return '0'; } if('ABCD01'.includes(ch)) return ch; return '1'; }).join(''));
  },[]);

  const initQuestionPool=()=>{ questionPoolRef.current=blocks.map((_,i)=>({idx:i,weight:10})); questionStatsRef.current=blocks.map(()=>({correct:0,wrong:0,shown:0})); historyRef.current=[]; };
  const normalizeWeights=()=>{ const BASE=10; questionPoolRef.current.forEach(q=>{ // sanft Richtung Basis ziehen
      q.weight = q.weight*0.97 + BASE*0.03; if(q.weight<1) q.weight=1; if(q.weight>100) q.weight=100;
    }); };
  const pickNextQuestionIndex=():number=>{ if(!questionPoolRef.current.length) initQuestionPool(); normalizeWeights(); const pool=questionPoolRef.current; const total=pool.reduce((s,q)=>s+q.weight,0); let attempt=0; let chosen=pool[0].idx;
    while(attempt<6){ let r=Math.random()*total; for(const q of pool){ if(r<q.weight){ chosen=q.idx; break; } r-=q.weight; }
      const h=historyRef.current; const last=h[h.length-1]; const last2=h[h.length-2];
      if(pool.length>1 && chosen===last){ attempt++; continue; } // keine direkte Wiederholung
      if(pool.length>2 && h.length>=2 && chosen===last2){ attempt++; continue; } // vermeide Muster A B A wenn möglich
      break;
    }
    return chosen; };
  const onCorrect=(idx:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e){ e.weight=Math.max(e.weight*0.55,2); } const s=questionStatsRef.current[idx]; if(s){ s.correct++; }
  };
  const onWrong=(idx:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e){ e.weight=Math.min(e.weight*1.35+2,80); } const s=questionStatsRef.current[idx]; if(s){ s.wrong++; }
  };

  const detectRooms=()=>{ const letters=['A','B','C','D']; const info:any={}; letters.forEach(l=>info[l]={minX:Infinity,maxX:-1,minY:Infinity,maxY:-1}); const maze=mazeRef.current; for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const ch=maze[r][c]; if(info[ch]){const o=info[ch]; o.minX=Math.min(o.minX,c);o.maxX=Math.max(o.maxX,c);o.minY=Math.min(o.minY,r);o.maxY=Math.max(o.maxY,r);} } return letters.filter(l=>info[l].maxX>=0).map(l=>({letter:l,x:info[l].minX*tileSize,y:info[l].minY*tileSize,w:(info[l].maxX-info[l].minX+1)*tileSize,h:(info[l].maxY-info[l].minY+1)*tileSize})); };

  const centerPlayer=()=>{ const p=playerRef.current; p.tileX=10; p.tileY=Math.floor(ROWS/2); p.progress=0; p.dir={x:0,y:-1}; p.nextDir={x:0,y:-1}; p.x=p.tileX*tileSize+tileSize/2; p.y=p.tileY*tileSize+tileSize/2; p.canTurn=true; };

  const shuffle=<T,>(arr:T[])=>{ for(let i=arr.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };

  const loadQuestion=(opts?:{skipRecenter?:boolean; forceIndex?:number})=>{
    const skipRecenter=!!opts?.skipRecenter; if(!blocks.length) return;
    let idx = (typeof opts?.forceIndex==='number')? opts.forceIndex : pickNextQuestionIndex();
    currentQuestionIndexRef.current=idx;
    const stat=questionStatsRef.current[idx]; if(stat) stat.shown++;
    // Verlauf merken
    historyRef.current.push(idx); if(historyRef.current.length>10) historyRef.current.splice(0,historyRef.current.length-10);
    const q=blocks[idx] as any; const answersRaw=(q.answers||q.options||q.choices||q.alternatives||q.antworten||[]); const correctIndex= typeof q.correct==='number'? q.correct : (typeof q.correctIndex==='number'? q.correctIndex : 0);
    const answerStrings:string[] = Array.isArray(answersRaw)? answersRaw.map((a:any)=> typeof a==='string'? a : (a.text||a.answer||a.value||a.label||a.title||'')) : [];
    setQuestionText(q.question || q.prompt || q.title || '');
    if(!answerStrings.length){ answerZonesRef.current=[]; return; }
  const rects=detectRooms();
    // wähle Raum für richtige Antwort, nicht derselbe wie zuvor
    let allowed=[0,1,2,3]; if(lastCorrectRoomIndexRef.current!=null) allowed=allowed.filter(i=>i!==lastCorrectRoomIndexRef.current);
    const correctRoomIndex=allowed[Math.random()*allowed.length|0];
    const indices=answerStrings.map((_,i)=>i); const others=indices.filter(i=>i!==correctIndex); shuffle(others);
    const otherRooms=[0,1,2,3].filter(r=>r!==correctRoomIndex); shuffle(otherRooms);
    const mapping=[{roomIndex:correctRoomIndex, answerIndex:correctIndex}, ...otherRooms.map((r,i)=> ({roomIndex:r, answerIndex:others[i]}))].filter(m=> m.answerIndex!=null && answerStrings[m.answerIndex]!=null);
  // Tile-Listen für genaues Highlight sammeln
  const maze=mazeRef.current;
  const zoneTileMap: Record<number,{tx:number;ty:number}[]> = {};
  rects.forEach((r,i)=>{ zoneTileMap[i]=[]; for(let ty=r.y/tileSize; ty<r.y/tileSize + r.h/tileSize; ty++) for(let tx=r.x/tileSize; tx<r.x/tileSize + r.w/tileSize; tx++){ if(maze[ty][tx]===r.letter) zoneTileMap[i].push({tx,ty}); } });
  answerZonesRef.current = mapping.map(m=>({roomIndex:m.roomIndex,letter:rects[m.roomIndex].letter,x:rects[m.roomIndex].x,y:rects[m.roomIndex].y,w:rects[m.roomIndex].w,h:rects[m.roomIndex].h,tileCoords:zoneTileMap[m.roomIndex],text: answerStrings[m.answerIndex], correct: m.answerIndex===correctIndex}));
  if(!skipRecenter){ centerPlayer(); requireExitBeforeAnswerRef.current=false; } else { // gating
      const inside=answerZonesRef.current.some(z=> playerRef.current.x>z.x && playerRef.current.x<z.x+z.w && playerRef.current.y>z.y && playerRef.current.y<z.y+z.h);
      requireExitBeforeAnswerRef.current=inside;
    }
    answerCooldownRef.current=false; correctFlashRef.current=null; showCorrectUntilRef.current=0;
    // Debug: Ausgabe der aktuellen Gewichte (nur Konsole)
    if(process.env.NODE_ENV!=='production'){
      try{ console.debug('[Pacman] Frage geladen', {idx, weights:questionPoolRef.current.map(q=>q.weight.toFixed(1)), stats:questionStatsRef.current, history:[...historyRef.current]}); } catch{}
    }
  };

  const tileChar=(x:number,y:number)=>{ const maze=mazeRef.current; if(x<0||x>=COLS||y<0||y>=ROWS) return '1'; return maze[y][x]; };
  const canEnter=(tx:number,ty:number)=> tileChar(tx,ty)!=='1';
  const ghostCanEnter=(tx:number,ty:number)=> tileChar(tx,ty)==='0';
  const ghostDirsAvailable=(tx:number,ty:number,forbid?:{x:number;y:number})=>{ const list=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]; return list.filter(d=>{ if(forbid && d.x===-forbid.x && d.y===-forbid.y) return false; return ghostCanEnter(tx+d.x,ty+d.y); }); };
  const chooseDir=(g:Ghost)=>{ const opts=ghostDirsAvailable(g.tileX,g.tileY,g.dir); if(!opts.length) return g.dir; if(opts.length===1) return opts[0]; const player=playerRef.current; const playerTarget={x:player.tileX,y:player.tileY}; let target:any; if(g.type===0) target=playerTarget; else if(g.type===1) target={x:player.tileX+player.dir.x*4,y:player.tileY+player.dir.y*4}; else if(g.type===2) return opts[Math.random()*opts.length|0]; else if(g.type===3) target=playerTarget; let best=opts[0], bestScore=Infinity; for(const d of opts){ const nx=g.tileX+d.x, ny=g.tileY+d.y; let score; if(g.type===3){ score = -((nx-playerTarget.x)**2 + (ny-playerTarget.y)**2); } else { const tx=target.x, ty=target.y; score = (nx-tx)**2 + (ny-ty)**2; } score *= (0.8+Math.random()*0.4); if(d.x===g.dir.x && d.y===g.dir.y && Math.random()<0.3) score*=1.15; if(score<bestScore){ bestScore=score; best=d; } } if(opts.length>=2 && Math.random()<0.12){ const nonStraight=opts.filter(d=>!(d.x===g.dir.x && d.y===g.dir.y)); if(nonStraight.length) return nonStraight[Math.random()*nonStraight.length|0]; } return best; };
  const moveGhost=(g:Ghost,dt:number)=>{
    // Kontinuierliche Bewegung mit Carry-Over; kein Stillstand-Frame bei Tile-Wechsel
    let advance = dt / g.tileTime;
    g.progress += advance;
    const TURN_WINDOW = 0.15; // innerhalb dieses Fortschritts am Anfang eines Tiles Richtungsentscheidungen
    if(g.progress < TURN_WINDOW){
      const forwardOpen=ghostCanEnter(g.tileX+g.dir.x,g.tileY+g.dir.y);
      const opts=ghostDirsAvailable(g.tileX,g.tileY,g.dir);
      if(!forwardOpen){
        if(opts.length){ g.dir=chooseDir(g); g.straightCount=0; }
        else { g.dir={x:-g.dir.x,y:-g.dir.y}; g.straightCount=0; }
      } else if(opts.length>1){
        const nonStraight=opts.filter(d=>!(d.x===g.dir.x && d.y===g.dir.y));
        if((g.straightCount>=5 && nonStraight.length) || (Math.random()<0.25 && nonStraight.length)){
          g.dir=nonStraight[Math.random()*nonStraight.length|0]; g.straightCount=0;
        } else {
          const old=g.dir; g.dir=chooseDir(g); if(!(g.dir.x===old.x && g.dir.y===old.y)) g.straightCount=0;
        }
      }
    }
    while(g.progress>=1){
      g.progress-=1;
      g.tileX+=g.dir.x; g.tileY+=g.dir.y;
      if(tileChar(g.tileX,g.tileY)!=='0'){
        // Rückgängig & Richtung wechseln ohne Pause
        g.tileX-=g.dir.x; g.tileY-=g.dir.y; g.progress=0.0001; // minimaler Vorlauf damit nächste Frame weiterläuft
        g.dir={x:-g.dir.x,y:-g.dir.y}; g.straightCount=0; break;
      }
      if(!g.prevDir || (g.prevDir.x===g.dir.x && g.prevDir.y===g.dir.y)) g.straightCount++; else g.straightCount=0;
      g.prevDir={x:g.dir.x,y:g.dir.y};
    }
  // Normale Bewegung über volle Tile-Strecke; nur bei nächster Wand leicht clampen
  const half=tileSize/2;
  const nextBlocked = tileChar(g.tileX+g.dir.x,g.tileY+g.dir.y)!=='0';
  const rp = nextBlocked ? Math.min(g.progress,0.49) : g.progress; // <0.5 damit nicht sichtbar in Wand
  g.x=g.tileX*tileSize+half + g.dir.x*(rp*tileSize);
  g.y=g.tileY*tileSize+half + g.dir.y*(rp*tileSize);
  };

  const computeGhostSpawns=()=>{ const maze=mazeRef.current; const sp=ghostSpawnPointsRef.current.slice(0,4); if(sp.length) return sp; // fallback: freie 0 Felder suchen
    const list: {x:number;y:number}[]=[]; for(let y=1;y<ROWS-1 && list.length<4;y++) for(let x=1;x<COLS-1 && list.length<4;x++) if(maze[y][x]==='0') list.push({x,y}); return list.slice(0,4); };
  const initGhosts=()=>{ const sp=computeGhostSpawns(); ghostsRef.current=sp.map((s,i)=>({tileX:s.x,tileY:s.y,x:s.x*tileSize+tileSize/2,y:s.y*tileSize+tileSize/2,r:12,dir:{x:0,y:1},progress:0,tileTime:GHOST_TILE_TIMES[i%GHOST_TILE_TIMES.length],color:ghostColors[i%ghostColors.length],type:i,straightCount:0})); };
  const resetGhosts=()=>{ const sp=computeGhostSpawns(); ghostsRef.current.forEach((g,i)=>{ const s=sp[i%sp.length]; g.tileX=s.x; g.tileY=s.y; g.x=s.x*tileSize+tileSize/2; g.y=s.y*tileSize+tileSize/2; g.progress=0; g.dir={x:0,y:1}; g.straightCount=0; }); };

  const damageCooldownRef=useRef(0); // Zeitstempel (ms) bis wann keine weitere Life-Reduktion
  const loseLife=(reason:string)=>{
    const now=performance.now();
    if(now < damageCooldownRef.current || gameOver || finished) return; // Invulnerability aktiv
    setLives(l=>{ const nl=l-1; if(nl<=0){ setGameOver(true); return 0; } return nl; });
    damageCooldownRef.current=now+1500; // 1.5s Unverwundbarkeit
    if(reason==='ghost') { centerPlayer(); resetGhosts(); }
  };
  const fullRestartAfterCollision=()=>{ loseLife('ghost'); playerRef.current.canTurn=true; };

  const checkGhostCollision=()=>{ if(performance.now()<damageCooldownRef.current) return; const p=playerRef.current; for(const g of ghostsRef.current){ const dx=g.x-p.x, dy=g.y-p.y; if(dx*dx+dy*dy < (g.r+p.r-4)**2){ fullRestartAfterCollision(); break; } } };

  // Input
  useEffect(()=>{ const kd=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp') playerRef.current.nextDir={x:0,y:-1}; else if(e.code==='ArrowDown') playerRef.current.nextDir={x:0,y:1}; else if(e.code==='ArrowLeft') playerRef.current.nextDir={x:-1,y:0}; else if(e.code==='ArrowRight') playerRef.current.nextDir={x:1,y:0}; else if(e.code==='Space' || e.code==='KeyP') setPaused(p=>!p); }; window.addEventListener('keydown',kd); return ()=> window.removeEventListener('keydown',kd); },[]);

  const update=(dt:number)=>{ if(paused||gameOver||finished) return; dt*=speedFactorRef.current*GLOBAL_SPEED_SCALE; const p=playerRef.current;
    const TURN_WINDOW=0.18; // Anteil zu Beginn eines Tiles in dem umgelenkt werden darf
    // Richtung wechseln früh im Tile falls gewünscht und frei
    if(p.progress < TURN_WINDOW){ const nd=p.nextDir; if((nd.x!==p.dir.x || nd.y!==p.dir.y) && canEnter(p.tileX+nd.x,p.tileY+nd.y)) { p.dir={...nd}; } }
    // Bewegung fortschreiben
    p.progress += dt / p.tileTime;
    // Sofortiges Abprallen an Wand: sobald nächste Kachel blockiert, Progress zurücksetzen und Richtung invertieren
    if(!canEnter(p.tileX+p.dir.x,p.tileY+p.dir.y)){
      if(p.progress>0){
        p.progress=0;
        p.dir={x:-p.dir.x,y:-p.dir.y};
      }
    }
    while(p.progress>=1){
      p.progress-=1;
      const nx=p.tileX+p.dir.x, ny=p.tileY+p.dir.y;
      if(canEnter(nx,ny)){ p.tileX=nx; p.tileY=ny; }
      else {
        // Wand: sofort drehen falls Gegenrichtung frei sonst progress minimieren
        const back={x:-p.dir.x,y:-p.dir.y};
        if(canEnter(p.tileX+back.x,p.tileY+back.y)){ p.dir=back; } else { p.progress=0; break; }
      }
    }
    // Nach Tile-Zentrum sperren wir erneutes Turn bis wieder im TURN_WINDOW
  // Visueller Clamp: wenn nächste Kachel Block ist, nicht bis ganz an die Kante interpolieren
  const half=tileSize/2;
  p.x=p.tileX*tileSize+half + p.dir.x*(p.progress*tileSize);
  p.y=p.tileY*tileSize+half + p.dir.y*(p.progress*tileSize);
    // Antworten
    if(!answerCooldownRef.current && !requireExitBeforeAnswerRef.current){
      const currentLetter = tileChar(p.tileX,p.tileY);
      for(const z of answerZonesRef.current){
        if(currentLetter===z.letter){
          if(z.correct){
            setScore(s=>{ const ns=s+1; if(ns>=targetScore) setFinished(true); return ns; });
            onCorrect(currentQuestionIndexRef.current);
            answerCooldownRef.current=true;
            correctFlashRef.current={x:z.x,y:z.y,w:z.w,h:z.h,start:performance.now(),duration:650};
            showCorrectUntilRef.current=performance.now()+650;
            lastCorrectRoomIndexRef.current=z.roomIndex;
            setTimeout(()=>{ const nextIdx=pickNextQuestionIndex(); loadQuestion({skipRecenter:true, forceIndex:nextIdx}); answerCooldownRef.current=false; correctFlashRef.current=null; },650);
          } else {
            // Falsch: nur ein Leben abziehen (mit Invulnerability) & kurzer Score-Abzug
            setScore(s=> Math.max(0,s-1));
            onWrong(currentQuestionIndexRef.current);
            loseLife('wrong');
            answerCooldownRef.current=true;
            requireExitBeforeAnswerRef.current=true; // Raum verlassen müssen
            setTimeout(()=>{ answerCooldownRef.current=false; },400);
          }
          break;
        }
      }
    }
  if(requireExitBeforeAnswerRef.current){ const letter=tileChar(p.tileX,p.tileY); const inside=answerZonesRef.current.some(z=> letter===z.letter ); if(!inside){ requireExitBeforeAnswerRef.current=false; } }
  ghostsRef.current.forEach(g=>moveGhost(g,dt)); checkGhostCollision(); };

  const draw=()=>{ const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return; const maze=mazeRef.current; canvas.width=COLS*tileSize; canvas.height=ROWS*tileSize; ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,canvas.width,canvas.height); for(let r=0;r<ROWS;r++){ for(let c=0;c<COLS;c++){ const ch=maze[r][c]; if(ch==='1') continue; if(ch==='0'){ ctx.fillStyle='#1e1e1e'; ctx.fillRect(c*tileSize,r*tileSize,tileSize,tileSize); ctx.fillStyle='#303030'; ctx.beginPath(); ctx.arc(c*tileSize+tileSize/2,r*tileSize+tileSize/2,4,0,Math.PI*2); ctx.fill(); } else if(['A','B','C','D'].includes(ch)){ ctx.fillStyle='#242424'; ctx.fillRect(c*tileSize,r*tileSize,tileSize,tileSize); } } } for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(maze[r][c]==='1'){ ctx.fillStyle='#0b3d91'; ctx.fillRect(c*tileSize,r*tileSize,tileSize,tileSize); }
    // answer zones (ohne Raster – zusammenhängende Fläche + ein Rahmen)
    answerZonesRef.current.forEach(z=>{ if(!z.tileCoords.length) return; const minTx=Math.min(...z.tileCoords.map(t=>t.tx)); const maxTx=Math.max(...z.tileCoords.map(t=>t.tx)); const minTy=Math.min(...z.tileCoords.map(t=>t.ty)); const maxTy=Math.max(...z.tileCoords.map(t=>t.ty));
      // Fläche: einzelne Tiles füllen (ohne Stroke) für unregelmäßige Formen
      ctx.fillStyle='rgba(140,120,200,0.18)'; z.tileCoords.forEach(t=> ctx.fillRect(t.tx*tileSize,t.ty*tileSize,tileSize,tileSize));
      // Ein äußerer Rahmen um Bounding Box
      ctx.strokeStyle='rgba(179,157,219,0.9)'; ctx.lineWidth=2; ctx.strokeRect(minTx*tileSize+1,minTy*tileSize+1,(maxTx-minTx+1)*tileSize-2,(maxTy-minTy+1)*tileSize-2);
      // text
      const padding=10; const maxW=z.w-padding*2; const cx=z.x+z.w/2; const cy=z.y+z.h/2; const sizes=[26,24,22,20,18,16]; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; const raw=z.text; if(!raw.includes(' ') && raw.length>12){ const hyphenate=(word:string)=>{ const vowels='aeiouäöüAEIOUÄÖÜ'; const candidates:{i:number;score:number}[]=[]; for(let i=2;i<word.length-2;i++){ const a=word[i-1]; const b=word[i]; if(vowels.includes(a) && !vowels.includes(b)){ let score=0; const center=word.length/2; score+=50-Math.abs(i-center); const cluster=word.slice(i,i+2).toLowerCase(); if(['ch','ck','st','ng','rt','nd','tt','ll','mm','nn'].includes(cluster)) score+=4; if(i<4 || word.length-i<4) score-=25; candidates.push({i,score}); } } if(!candidates.length) return [word.slice(0,Math.ceil(word.length/2)), word.slice(Math.ceil(word.length/2))]; candidates.sort((a,b)=>b.score-a.score); const pos=candidates[0].i; return [word.slice(0,pos), word.slice(pos)]; }; let [part1,part2]=hyphenate(raw); if(!part1.endsWith('-')) part1+='-'; for(const size of sizes){ ctx.font='bold '+size+'px Arial'; if(ctx.measureText(part1).width<=maxW && ctx.measureText(part2).width<=maxW){ const shift=size*0.6; ctx.fillText(part1,cx,cy-shift); ctx.fillText(part2,cx,cy+shift); return; } } ctx.font='bold 14px Arial'; const shift=14*0.6; while(ctx.measureText(part1).width>maxW && part1.length>4){ part1=part1.slice(0,-2)+'…'; } while(ctx.measureText(part2).width>maxW && part2.length>4){ part2=part2.slice(0,-2)+'…'; } ctx.fillText(part1,cx,cy-shift); ctx.fillText(part2,cx,cy+shift); return; } for(const size of sizes){ ctx.font='bold '+size+'px Arial'; const fullWidth=ctx.measureText(raw).width; if(fullWidth<=maxW){ ctx.fillText(raw,cx,cy); return; } const words=raw.split(' '); if(words.length>1){ let line1=''; let line2=''; for(let i=0;i<words.length;i++){ const candidate=line1? line1+' '+words[i]:words[i]; if(ctx.measureText(candidate).width<=maxW){ line1=candidate; } else { line2=words.slice(i).join(' '); break; } } if(line2){ if(ctx.measureText(line2).width<=maxW){ const shift=size*0.6; ctx.fillText(line1,cx,cy-shift); ctx.fillText(line2,cx,cy+shift); return; } } } } ctx.font='bold 14px Arial'; let txt=raw; while(ctx.measureText(txt).width>maxW && txt.length>4){ txt=txt.slice(0,-2)+'…'; } ctx.fillText(txt,cx,cy); });
    if(correctFlashRef.current){ const now=performance.now(); const f=correctFlashRef.current; const t=(now-f.start)/f.duration; if(t<=1){ const alpha=0.65*(1-Math.min(1,t)); ctx.save(); ctx.fillStyle=`rgba(80,255,120,${alpha})`; ctx.fillRect(f.x,f.y,f.w,f.h); ctx.strokeStyle=`rgba(180,255,200,${alpha+0.2})`; ctx.lineWidth=4; ctx.strokeRect(f.x+2,f.y+2,f.w-4,f.h-4); ctx.restore(); } else { correctFlashRef.current=null; } }
    if(showCorrectUntilRef.current && performance.now()<showCorrectUntilRef.current){ const remain=(showCorrectUntilRef.current-performance.now())/650; const scale=0.9+0.2*Math.sin((1-remain)*Math.PI); ctx.save(); ctx.translate(canvas.width/2,canvas.height/2); ctx.scale(scale,scale); ctx.font='bold 72px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; const grd=ctx.createLinearGradient(-150,-50,150,50); grd.addColorStop(0,'#b9ff8a'); grd.addColorStop(1,'#4caf50'); ctx.fillStyle=grd; ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=8; ctx.lineJoin='round'; ctx.strokeText('RICHTIG!',0,0); ctx.fillText('RICHTIG!',0,0); ctx.restore(); }
    // Player
    const p=playerRef.current; ctx.fillStyle='#ffeb3b'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ghostsRef.current.forEach(g=>{ ctx.fillStyle=g.color; ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,Math.PI*2); ctx.fill(); });
    // Debug-Version & Speed Anzeige
    ctx.font='10px monospace'; ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.fillText(`${DEBUG_VERSION} sf=${speedFactorRef.current.toFixed(2)}`,4,canvas.height-6);
  };

  useEffect(()=>{ initMaze(); initGhosts(); if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(); centerPlayer(); let last=performance.now(); const loop=(ts:number)=>{ const dt=Math.min(0.05,(ts-last)/1000); last=ts; update(dt); draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); },[]); // eslint-disable-line

  // Vollbild
  const toggleFullscreen=()=>{ const el=wrapperRef.current; if(!el) return; if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); } };
  useEffect(()=>{ const h=()=>setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange',h); return ()=> document.removeEventListener('fullscreenchange',h); },[]);

  // Resize ähnlich SpaceImpact
  useEffect(()=>{ function apply(){ const canvas=canvasRef.current; if(!canvas) return; const ratio=(COLS*tileSize)/(ROWS*tileSize); const vw=window.innerWidth; const vh=window.innerHeight; const hudH=hudRef.current? hudRef.current.getBoundingClientRect().height:0; const bottomH=bottomInfoRef.current? bottomInfoRef.current.getBoundingClientRect().height:0; const margin= isFullscreen? 8:16; const availH=Math.max(160,vh - hudH - bottomH - margin); let targetH=availH; let targetW=targetH*ratio; const containerW=wrapperRef.current? wrapperRef.current.getBoundingClientRect().width:vw; if(targetW>containerW){ targetW=containerW; targetH=targetW/ratio; } if(targetW<480){ targetW=480; targetH=targetW/ratio; } canvas.style.width=Math.round(targetW)+'px'; canvas.style.height=Math.round(targetH)+'px'; setGamePixelWidth(Math.round(targetW)); } apply(); window.addEventListener('resize',apply); const ro1=new ResizeObserver(apply); if(hudRef.current) ro1.observe(hudRef.current); const ro2=new ResizeObserver(apply); if(bottomInfoRef.current) ro2.observe(bottomInfoRef.current); return ()=>{ window.removeEventListener('resize',apply); ro1.disconnect(); ro2.disconnect(); }; },[isFullscreen,questionText]);

  // Abschluss markieren
  useEffect(()=>{ if(!finished && score>=targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ const username=session?.user?.username; await finalizeLesson({ username, lessonId:lesson._id, courseId, type:lesson.type, earnedStar:lesson.type!=="markdown"}); setCompletedLessons(prev=> prev.includes(lesson._id)? prev:[...prev,lesson._id]); } catch{} })(); } } },[score,targetScore,finished,completedLessons,lesson._id,lesson.type,courseId,session?.user?.username,setCompletedLessons]);

  const restart=()=>{ setScore(0); setLives(MAX_LIVES); setGameOver(false); setFinished(false); centerPlayer(); resetGhosts(); loadQuestion(); };

  return (<div ref={wrapperRef} className={isFullscreen? 'w-screen h-screen flex flex-col items-center bg-[#05070d] overflow-hidden':'w-full flex flex-col items-center gap-2 bg-transparent overflow-hidden'}>
    <div ref={hudRef} className="w-full" style={{width: gamePixelWidth? gamePixelWidth:'100%', maxWidth:gamePixelWidth}}>
      <div className="w-full flex flex-col gap-2 bg-[#101826] border-2 border-[#2c3e50] rounded p-3">
        <div className="flex justify-between items-start gap-4">
          <div className={isFullscreen? 'text-[1.45rem] font-semibold text-white leading-snug whitespace-pre-wrap pr-2':'text-[1.25rem] font-semibold text-white leading-snug whitespace-pre-wrap pr-2'}>{questionText||'—'}</div>
          <div className={`flex items-start gap-3 flex-wrap text-white font-semibold ${isFullscreen? 'text-[0.85rem]':'text-[0.72rem]'}`}>
            <span>Punkte: <span className="font-bold">{score}</span>/<span className="opacity-80">{targetScore}</span></span>
            <span className="flex items-center gap-1">Leben: {Array.from({length:MAX_LIVES}).map((_,i)=>(<span key={i} className={i<lives? 'text-red-400':'text-gray-600'}>❤</span>))}</span>
            <button onClick={()=> setPaused(p=>!p)} className={`rounded border font-semibold tracking-wide transition ${isFullscreen? 'px-5 py-2 text-[0.9rem]':'px-3 py-1 text-[0.65rem]'} ${paused? 'bg-lime-400 text-[#102] border-lime-500':'bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e]'}`}>{paused? 'Weiter':'Pause'}</button>
            <button onClick={toggleFullscreen} className={`rounded border font-semibold tracking-wide bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e] ${isFullscreen? 'px-5 py-2 text-[0.9rem]':'px-3 py-1 text-[0.65rem]'}`}>{isFullscreen? 'Zurück':'Vollbild'}</button>
            <div className="flex items-center gap-1 select-none" title="Temposteuerung">
              <span className="opacity-70 text-[0.65rem] mr-1">Tempo:</span>
              <button onClick={()=> setSpeedFactor(0.6)} className="px-2 py-1 bg-[#394a63] hover:bg-[#455b79] rounded text-[0.65rem]">Langsam</button>
              <button onClick={()=> setSpeedFactor(1.0)} className="px-2 py-1 bg-[#394a63] hover:bg-[#455b79] rounded text-[0.65rem]">Mittel</button>
              <button onClick={()=> setSpeedFactor(1.4)} className="px-2 py-1 bg-[#394a63] hover:bg-[#455b79] rounded text-[0.65rem]">Schnell</button>
              <button onClick={()=> setSpeedFactor(2.0)} className="px-2 py-1 bg-[#394a63] hover:bg-[#455b79] rounded text-[0.65rem]">Sehr schnell</button>
            </div>
          </div>
        </div>
  {finished && (<div className="text-green-400 text-sm font-semibold">✔ Ziel erreicht</div>)}
      </div>
    </div>
    <div className="relative flex-1 flex items-center justify-center" style={{width: gamePixelWidth? gamePixelWidth:'100%'}}>
      <canvas ref={canvasRef} width={COLS*tileSize} height={ROWS*tileSize} className={isFullscreen? 'block mx-auto rounded border-2 border-[#2c3e50] bg-black':'block mx-auto rounded-[10px] border-2 border-[#2c3e50] shadow bg-black'} />
      {gameOver && !finished && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3 p-4 text-center">
        <div className="text-red-400 font-bold text-3xl">Game Over</div>
        <div className="text-sm">Punkte: {score}</div>
        <button onClick={restart} className="px-5 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-sm font-semibold">Neu starten</button>
      </div>)}
      {finished && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white gap-3 p-4 text-center">
        <div className="text-green-400 font-bold text-3xl">✔ Ziel erreicht</div>
        <div className="text-sm">Punkte: {score}</div>
        <button onClick={restart} className="px-5 py-2 rounded bg-green-500 hover:bg-green-600 text-white text-sm font-semibold">Nochmal</button>
      </div>)}
      {paused && !gameOver && !finished && (<div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-4xl font-bold">PAUSE</div>)}
    </div>
    <div ref={bottomInfoRef} className="text-[0.6rem] opacity-60 text-center text-white mt-1 pb-1">Steuerung: Pfeile bewegen • Pause: P/Space • Räume mit korrekter Antwort finden!</div>
  </div>);
}
