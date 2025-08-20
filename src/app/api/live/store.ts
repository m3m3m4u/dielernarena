// In-memory live game store (rooms) – simple for demo; for production use Redis or similar.
export type RoomState = {
  id: string;
  name: string;
  createdAt: number;
  hostReady: boolean;
  host?: string;
  guestId?: string;
  exerciseId?: string;
};

// Persist across dev server reloads (HMR) by stashing on globalThis
type GlobalBag = {
  liveRooms?: Map<string, RoomState>;
  liveSubs?: Map<string, Set<(data:any)=>void>>;
};
const g = globalThis as unknown as GlobalBag;
if(!g.liveRooms) g.liveRooms = new Map<string, RoomState>();
if(!g.liveSubs) g.liveSubs = new Map<string, Set<(data:any)=>void>>();
const rooms = g.liveRooms!;
const subscribers = g.liveSubs!;

function genId(){ return Math.random().toString(36).slice(2, 8); }

export function createRoom(name: string, exerciseId?: string, host?: string){
  const id = genId();
  const room: RoomState = { id, name: name.trim() || `Room-${id}`, createdAt: Date.now(), hostReady: false, exerciseId, host };
  rooms.set(id, room);
  return room;
}
export function getRoom(id: string){ return rooms.get(id); }
export function listRooms(){ return Array.from(rooms.values()); }
export function joinRoom(id: string, guestId: string){ const r=rooms.get(id); if(!r) return null; r.guestId = guestId; return r; }
export function setHostReady(id: string, ready: boolean){ const r=rooms.get(id); if(r){ r.hostReady = ready; } return r; }

export function publish(id: string, payload: any){ const set = subscribers.get(id); if(!set) return; for(const fn of set){ try{ fn(payload); }catch{} } }
export function subscribe(id: string, fn: (data:any)=>void){ let set = subscribers.get(id); if(!set){ set = new Set(); subscribers.set(id, set); } set.add(fn); return ()=>{ set?.delete(fn); } }
