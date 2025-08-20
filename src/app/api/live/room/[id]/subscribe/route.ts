import { NextRequest } from 'next/server';
import { subscribe, getRoom } from '../../../store';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if(!id){
    return new Response('Not found', { status: 404 });
  }
  const room = getRoom(id);
  if(!room){
    return new Response('Not found', { status: 404 });
  }
  const encoder = new TextEncoder();
  let interval: any;
  let unsub: (()=>void) | null = null;
  const stream = new ReadableStream({
    start(controller){
      const send = (data:any)=> controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      unsub = subscribe(id, send);
      // initial hello
      send({ type:'hello', room });
      // keepalive comments
      interval = setInterval(()=>{ try{ controller.enqueue(encoder.encode(`: ping\n\n`)); }catch{} }, 15000);
    },
    cancel(){
      try{ if(interval) clearInterval(interval); }catch{}
      try{ unsub?.(); }catch{}
    }
  });
  // disconnect support
  try{ req.signal.addEventListener('abort', ()=>{ try{ if(interval) clearInterval(interval); }catch{}; try{ unsub?.(); }catch{}; }); }catch{}
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // Prevent proxy buffering (useful behind nginx)
    'X-Accel-Buffering': 'no'
  } });
}
