export const runtime = 'edge';

type RoomSockets = { host?: WebSocket; guests: Set<WebSocket> };
const rooms = new Map<string, RoomSockets>();

function getOrCreate(id: string): RoomSockets {
  let r = rooms.get(id);
  if(!r){ r = { guests: new Set() }; rooms.set(id, r); }
  return r;
}

export async function GET(req: Request){
  const { searchParams } = new URL(req.url);
  const roomId = String(searchParams.get('room') || '').trim();
  const role = (String(searchParams.get('role') || 'guest').toLowerCase() === 'host') ? 'host' : 'guest';
  if(!roomId){ return new Response('room required', { status: 400 }); }

  // @ts-ignore - WebSocketPair is available in Edge runtime
  const { 0: client, 1: server } = new WebSocketPair();
  // @ts-ignore
  server.accept();
  const bucket = getOrCreate(roomId);

  const cleanup = () => {
    try{
      if(role === 'host' && bucket.host === (server as unknown as WebSocket)){ bucket.host = undefined; }
      if(role === 'guest'){ bucket.guests.delete(server as unknown as WebSocket); }
    } catch {}
  };

  if(role === 'host'){
    // @ts-ignore
    bucket.host = server;
  } else {
    // @ts-ignore
    bucket.guests.add(server);
  // notify host that a guest joined
  try{ bucket.host?.send(JSON.stringify({ type: 'joined', ts: Date.now() })); }catch{}
  }

  // @ts-ignore
  server.addEventListener('message', (ev: MessageEvent) => {
    let data: any;
    try{ data = JSON.parse(String((ev as any).data || '')); }catch{ return; }
    if(role === 'guest'){
      // forward guest messages (controls etc.) to host
      try{ bucket.host?.send(JSON.stringify(data)); }catch{}
    } else {
      // host broadcasts state / exercise etc. to all guests
      for(const g of bucket.guests){ try{ g.send(JSON.stringify(data)); }catch{} }
    }
  });

  // @ts-ignore
  server.addEventListener('close', cleanup);
  // @ts-ignore
  server.addEventListener('error', cleanup);

  // @ts-ignore
  return new Response(null, { status: 101, webSocket: client });
}
