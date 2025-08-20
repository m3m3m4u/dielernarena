"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TwoSnakeGame from '@/components/lessonTypes/twosnake/TwoSnakeGame';
import { CELL, COLS, ROWS } from '@/components/lessonTypes/snake/constants';

// Lightweight live room UI for hosting/joining a two-device game
// MVP: In-memory rooms, SSE subscribe, POST publish. Host is authoritative for state broadcast.

type Exercise = { _id: string; title: string; type: string; courseId: string; content?: any; questions?: any[]; category?: string };

type LiveMsg = { type: string; [k:string]: any };

export default function SnakeLivePage(){
  const [mode, setMode] = useState<'pick'|'host'|'guest'>('pick');
  const [room, setRoom] = useState<{id:string; name:string; hostReady?:boolean; guestId?: string} | null>(null);
  const [roomName, setRoomName] = useState('Snake‑Match');
  const esRef = useRef<EventSource|null>(null);
  const controlsRef = useRef<{ setDirA:(d:'up'|'down'|'left'|'right')=>void; setDirB:(d:'up'|'down'|'left'|'right')=>void; setRunning:(v:boolean)=>void; restartRound:()=>void }|null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [locked, setLocked] = useState(false);
  const [hostState, setHostState] = useState<any | null>(null);
  const guestCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const [guestJoined, setGuestJoined] = useState(false);
  const [rooms, setRooms] = useState<Array<{ id:string; name:string; host?:string; exerciseId?:string; guestId?:string }>>([]);
  const wsRef = useRef<WebSocket|null>(null);
  const [useWs, setUseWs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const connectionTimerRef = useRef<any>(null);
  const lastStateRef = useRef<any>(null);

  // Load exercises
  useEffect(()=>{
    let alive = true;
    (async()=>{
      try{ const res = await fetch('/api/exercises'); const data = await res.json(); if(!alive) return; if(data.success){
        const list: Exercise[] = (data.exercises||[]).filter((e:Exercise)=>{
          const hasBlocks = !!(e?.content && (Array.isArray(e.content.blocks) || Array.isArray((e.content as any).questions)));
          const hasQuestions = Array.isArray(e.questions) && e.questions.length>0;
          return hasBlocks || hasQuestions;
        });
        setExercises(list);
      } }catch{}
    })();
    return ()=>{ alive=false; };
  },[]);

  // Load rooms periodically while im Auswahlmodus
  useEffect(()=>{
    if(mode !== 'pick') return;
    let alive = true;
    const load = async()=>{
      try{ const res = await fetch('/api/live/rooms', { cache: 'no-store' }); const data = await res.json(); if(!alive) return; if(data?.success){
        const list = (data.rooms || []).filter((r: any) => !r.guestId);
        setRooms(list);
      } }catch{}
    };
    load();
    const t = setInterval(load, 4000);
    return ()=>{ alive=false; clearInterval(t); };
  },[mode]);

  const current = useMemo(()=> exercises.find(e=> e._id===selectedId), [exercises, selectedId]);

  const publish = useCallback(async (id: string, msg: LiveMsg)=>{
    // Prefer WebSocket if connected
    if(wsRef.current && wsRef.current.readyState === WebSocket.OPEN){
      try{ wsRef.current.send(JSON.stringify(msg)); return; }catch{}
    }
    try{ await fetch(`/api/live/room/${id}/publish`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(msg) }); }catch{}
  },[]);

  // Host flow
  const createRoom = useCallback(async()=>{
    if(!selectedId){ alert('Bitte zuerst eine Übung wählen.'); return; }
    const res = await fetch('/api/live/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: roomName, exerciseId: selectedId }) });
    const data = await res.json();
    if(data?.success){ setRoom(data.room); setMode('host'); setLocked(true); }
  },[roomName, selectedId]);

  const joinRoomById = useCallback(async(id:string)=>{
    if(!id) return;
    setErrorMsg('');
    setPendingJoinId(id);
    // optimistic: we know room details from list
  const info = rooms.find(r => r.id === id) || { id, name: 'Raum', exerciseId: undefined, host: undefined } as any;
  setRoom({ id: info.id, name: info.name, hostReady: false, guestId: undefined, ...(info.host ? { host: info.host } : {}) } as any);
    setMode('guest');
    // Start a connection timeout: if no WS/SSE within 3s, fallback
    if(connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = setTimeout(()=>{
      if(!wsRef.current && !esRef.current){
        setErrorMsg('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
        setMode('pick'); setRoom(null); setPendingJoinId(null);
      }
    }, 3000);
    // Try to acquire slot on server (so Liste verschwindet für andere)
    try{
      const res = await fetch(`/api/live/room/${id}/join`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
      if(res.status === 409){
        try{ const r = await fetch('/api/live/rooms', { cache: 'no-store' }); const d = await r.json(); setRooms((d.rooms||[]).filter((x:any)=>!x.guestId)); }catch{}
        if(!wsRef.current && !esRef.current){
          setErrorMsg('Dieser Raum ist bereits belegt.');
          setMode('pick'); setRoom(null); setPendingJoinId(null);
        }
        return;
      }
      const data = await res.json();
      if(data?.success){ /* room confirmed; WS/SSE effect will wire up */ }
    }catch{
      // on network error keep optimistic path, the WS/SSE may still connect
    }
  },[rooms]);

  // Subscribe to room events
  useEffect(()=>{
    if(!room?.id || mode==='pick') return;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;
  const onMsg = (raw: any)=>{
      try{
        const msg = typeof raw === 'string' ? JSON.parse(raw||'{}') : raw;
        if(msg?.type === 'hello'){
          if(msg?.room?.exerciseId){ setSelectedId(msg.room.exerciseId); setLocked(true); }
        }
        // Remote control messages
        if(msg?.type === 'control' && controlsRef.current){
          const d = msg.dir as ('up'|'down'|'left'|'right');
          if(msg.player==='A') controlsRef.current.setDirA(d);
          else if(msg.player==='B') controlsRef.current.setDirB(d);
        }
        if(msg?.type === 'start' && controlsRef.current){ controlsRef.current.setRunning(true); }
        if(msg?.type === 'pause' && controlsRef.current){ controlsRef.current.setRunning(false); }
        if(msg?.type === 'restartRound' && controlsRef.current){ controlsRef.current.restartRound(); }
  if(msg?.type === 'exercise' && typeof msg.id === 'string'){
          setSelectedId(msg.id);
          setLocked(true);
        }
        if(msg?.type === 'joined'){
          setGuestJoined(true);
          if(mode==='host' && room?.id){
            // send initial room info to new guest(s)
            publish(room.id, { type:'hello', room: { id: room.id, name: room.name, exerciseId: selectedId } });
            // und sofort einen State-Snapshot, damit Gast Frage & Feld sieht
            if(lastStateRef.current){
              publish(room.id, { type:'state', s: lastStateRef.current });
            }
          }
        }
        if(msg?.type === 'state'){
          setHostState(msg.s);
        }
        // Host broadcasts state; guests could render passively in a future iteration
      }catch{}
    };
    try{
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/ws?room=${encodeURIComponent(room.id)}&role=${mode==='host'?'host':'guest'}`);
  ws.onopen = ()=> { setUseWs(true); if(connectionTimerRef.current){ clearTimeout(connectionTimerRef.current); connectionTimerRef.current = null; } if(mode==='host' && room?.id){ /* proactively announce room */ publish(room.id, { type:'hello', room: { id: room.id, name: room.name, exerciseId: selectedId } }); } };
      ws.onmessage = (ev)=> onMsg(ev.data);
      ws.onerror = ()=>{};
      ws.onclose = ()=>{};
      wsRef.current = ws;
    } catch {}
    // Fallback to SSE if WS not available after a short timeout
    const t = setTimeout(()=>{
      if(wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      if(esRef.current) return;
      es = new EventSource(`/api/live/room/${room.id}/subscribe`);
      es.onmessage = (ev)=> onMsg(ev.data);
      es.onerror = ()=>{};
      esRef.current = es;
    }, 300);

    return ()=>{
      clearTimeout(t);
      try{ wsRef.current?.close(); }catch{}
      wsRef.current = null;
      try{ esRef.current?.close(); }catch{}
      esRef.current = null;
      setUseWs(false);
  setPendingJoinId(null);
    };
  },[room?.id, mode]);

  // Wire game state outbound from host only (authoritative)
  const handleExpose = useCallback((api: { setDirA:(d:'up'|'down'|'left'|'right')=>void; setDirB:(d:'up'|'down'|'left'|'right')=>void; setRunning:(v:boolean)=>void; restartRound:()=>void; })=>{
    controlsRef.current = api;
  },[]);
  const handleState = useCallback((s:any)=>{
  lastStateRef.current = s;
  if(mode==='host' && room?.id){ publish(room.id, { type:'state', s }); }
  },[mode, room?.id, publish]);

  // Local input relaying (guest uses Pfeiltasten for Spieler B)
  useEffect(()=>{
    if(!room?.id) return;
    const handler = (e: KeyboardEvent)=>{
      const k = e.key.toLowerCase();
      const map: Record<string, {player:'A'|'B'; dir:'up'|'down'|'left'|'right'}|undefined> = {
        // Gast steuert Spieler B mit Pfeiltasten
        arrowup: {player:'B', dir:'up'}, arrowdown:{player:'B', dir:'down'}, arrowleft:{player:'B', dir:'left'}, arrowright:{player:'B', dir:'right'},
      };
      const t = map[k];
      if(mode==='guest'){
        if(t){ e.preventDefault(); publish(room.id, { type:'control', ...t }); }
        if(k===' '){ e.preventDefault(); publish(room.id, { type:'start' }); }
      }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  },[room?.id, publish, mode]);

  // Guest: render host state into a lightweight canvas
  useEffect(()=>{
    if(!hostState) return;
    const canvas = guestCanvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext('2d'); if(!ctx) return;
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, canvas.width, canvas.height);
    const s = hostState;
    if(!s) return;
    // foods
    if(Array.isArray(s.foods) && s.foods.length===4){
      for(const f of s.foods){ ctx.fillStyle = f.color || '#888'; ctx.fillRect(f.x*CELL, f.y*CELL, CELL, CELL); }
    } else if(s.food){ ctx.fillStyle = '#dc2626'; ctx.fillRect(s.food.x*CELL, s.food.y*CELL, CELL, CELL); }
    // snakes
    const drawSnake = (arr:any[], headColor:string, bodyColor:string)=>{
      if(!Array.isArray(arr)) return;
      arr.forEach((p,i)=>{ ctx.beginPath(); ctx.arc(p.x*CELL + CELL/2, p.y*CELL + CELL/2, CELL/2, 0, Math.PI*2); ctx.fillStyle = i===0 ? headColor : bodyColor; ctx.fill(); });
    };
    drawSnake(s.snakeA, '#7c3aed', '#a855f7');
    drawSnake(s.snakeB, '#ea580c', '#f97316');
    // progress bars
    if(!s.finished){
      const h = 4;
      const target = s.targetScore || 10;
      ctx.fillStyle = 'rgba(16,185,129,0.5)'; ctx.fillRect(0, canvas.height - h*2 - 2, (Math.min(s.scoreA||0,target)/target)*canvas.width, h);
      ctx.fillStyle = 'rgba(37,99,235,0.5)'; ctx.fillRect(0, canvas.height - h, (Math.min(s.scoreB||0,target)/target)*canvas.width, h);
    }
  },[hostState]);

  // UI
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">🕸️ Snake Live (2 Geräte)</h2>
      {mode==='pick' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Spiel hosten</h3>
            <label className="block text-xs text-gray-600 mb-1">Name</label>
            <input value={roomName} onChange={e=> setRoomName(e.target.value)} className="w-full border rounded px-2 py-1 mb-3" />
            <div className="mb-3">
              <div className="text-xs text-gray-600 mb-1">Übung auswählen (benötigt)</div>
              <select value={selectedId} onChange={e=> setSelectedId(e.target.value)} className="w-full border rounded px-2 py-1">
                <option value="">— bitte wählen —</option>
                {exercises.map(ex => (
                  <option key={ex._id} value={ex._id}>{ex.title}</option>
                ))}
              </select>
            </div>
            <button onClick={createRoom} className="px-4 py-2 rounded bg-emerald-600 text-white">Erstellen</button>
          </div>
          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Beitreten</h3>
            <div className="text-xs text-gray-600 mb-2">Wähle einen Raum aus der Liste:</div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {rooms && rooms.length ? (
                rooms.map(r => (
                  <div key={r.id} className="flex items-center justify-between border rounded px-3 py-2 bg-white">
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={r.name}>{r.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">Host: {r.host || '—'} • Übung: {r.exerciseId ? (exercises.find(ex => ex._id === r.exerciseId)?.title || '—') : '—'}</div>
                    </div>
        <button onClick={()=> joinRoomById(r.id)} disabled={!!r.guestId || pendingJoinId===r.id} className="ml-3 px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50">{pendingJoinId===r.id? 'Verbinden…':'Beitreten'}</button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">Keine offenen Räume gefunden.</div>
              )}
            </div>
      {errorMsg && <div className="mt-3 text-sm text-red-600">{errorMsg}</div>}
          </div>
        </div>
      )}

      {(mode==='host' || mode==='guest') && room && (
        <div className="mt-4 p-3 bg-gray-50 border rounded">
          <div className="text-sm text-gray-700">Raum: <span className="font-mono">{room.id}</span> — {room.name}</div>
          {typeof (room as any).host === 'string' && (
            <div className="text-xs text-gray-600 mt-1">Erstellt von: {(room as any).host}</div>
          )}
          <div className="text-xs text-gray-500">Teile die Raum-ID mit dem zweiten Gerät.</div>
          <div className="text-xs mt-1">
            {mode==='host' ? (
              <span className={guestJoined? 'text-emerald-700':'text-gray-500'}>Teilnehmer: {guestJoined? 'verbunden':'wartet…'}</span>
            ) : (
              <span className="text-gray-600">Gast verbunden</span>
            )}
          </div>
        </div>
      )}

      {(mode==='host' || mode==='guest') && (
        <div className="mt-6">
          {!locked ? (
            <div className="mb-4">
              <div className="text-sm text-gray-700 mb-2">Übung wählen (danach gesperrt)</div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {exercises.map(ex => (
                  <button key={ex._id} onClick={()=>{ setSelectedId(ex._id); setLocked(true); if(room?.id) publish(room.id, { type:'exercise', id: ex._id }); }} className="text-left border rounded p-3 hover:bg-gray-50">
                    <div className="font-medium truncate" title={ex.title}>{ex.title}</div>
                    <div className="text-xs text-gray-500">{ex.category || 'Übung'}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-4 text-sm text-gray-600">Auswahl gesperrt.</div>
          )}

          {current ? (
            mode==='host' ? (
              <TwoSnakeGame lesson={current as any} courseId={current.courseId || 'exercise-pool'} completedLessons={[]} setCompletedLessons={()=>{}} disableCompletion canStart={guestJoined} onExposeControls={handleExpose} onState={handleState} localControlA={true} localControlB={false} />
            ) : (
              <div className="w-full flex flex-col lg:flex-row gap-6">
                <div className="lg:w-80 p-4 bg-white border rounded space-y-3 h-fit">
                  <div className="text-sm"><span className="font-medium">Ziel:</span> {hostState?.targetScore ?? 15} Punkte</div>
                  <div className="text-sm space-y-1">
                    <div>Spieler A: <span className="font-semibold text-emerald-700">{hostState?.scoreA ?? 0}</span></div>
                    <div>Spieler B: <span className="font-semibold text-blue-700">{hostState?.scoreB ?? 0}</span></div>
                  </div>
                  {hostState?.currentQuestion && (
                    <div className="text-sm">
                      <div className="text-gray-700 whitespace-pre-wrap break-words">{hostState.currentQuestion.question}</div>
                      {Array.isArray(hostState.foods) && hostState.foods.length===4 && (
                        <ul className="mt-2 space-y-1 text-xs">
                          {hostState.foods.map((f:any,i:number)=> (
                            <li key={i} className="flex items-center gap-2">
                              <span className="inline-block w-4 h-4 rounded-sm border" style={{background:f.color}}></span>
                              <span className="flex-1 break-words">{f.answer}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {!hostState?.running && (
                    <div className="text-[11px] text-gray-600">Warte, bis das Spiel gestartet wird.</div>
                  )}
                  <div className="text-[11px] text-gray-600 border rounded p-2 bg-gray-50 leading-snug">
                    Steuerung: Pfeiltasten (Spieler B). Der Host überträgt den Spielstand live.
                  </div>
                  <div className="pt-3 border-t mt-2">
                    <div className="text-xs text-gray-500 mb-2">Steuerung B (Pfeile)</div>
                    <div className="grid grid-cols-3 gap-2 w-56 select-none">
                      <div />
                      <button onClick={()=> room && publish(room.id, { type:'control', player:'B', dir:'up' })} className="px-3 py-2 rounded-md border bg-gray-50">↑</button>
                      <div />
                      <button onClick={()=> room && publish(room.id, { type:'control', player:'B', dir:'left' })} className="px-3 py-2 rounded-md border bg-gray-50">←</button>
                      <div />
                      <button onClick={()=> room && publish(room.id, { type:'control', player:'B', dir:'right' })} className="px-3 py-2 rounded-md border bg-gray-50">→</button>
                      <div />
                      <button onClick={()=> room && publish(room.id, { type:'control', player:'B', dir:'down' })} className="px-3 py-2 rounded-md border bg-gray-50">↓</button>
                      <div />
                    </div>
                    <div className="mt-3">
                      <button onClick={()=> room && publish(room.id, { type: hostState?.running ? 'pause' : 'start' })} className="px-3 py-1 text-xs rounded border bg-white hover:bg-gray-50">{hostState?.running ? 'Pause' : 'Start'}</button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex justify-center items-start">
                  <div className="inline-block relative w-full">
                    <canvas ref={guestCanvasRef} width={COLS*CELL} height={ROWS*CELL} className="border rounded bg-white block" style={{ aspectRatio:'1/1', width:'100%', maxWidth: COLS*CELL }} />
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="p-6 border rounded bg-gray-50 text-sm text-gray-600">Bitte Übung wählen.</div>
          )}
        </div>
      )}

      <div className="mt-6"><a href="/arena" className="text-blue-600 hover:underline">← Zurück zur Arena</a></div>
    </main>
  );
}
