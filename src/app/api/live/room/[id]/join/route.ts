import { NextRequest, NextResponse } from 'next/server';
import { getRoom, joinRoom, publish } from '../../../store';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try{
  const { id } = await context.params;
  if(!id){ const r = NextResponse.json({ success:false, error:'Room not found' }, { status:404 }); r.headers.set('Cache-Control','no-store'); return r; }
  const room = getRoom(id);
  if(!room){ const r = NextResponse.json({ success:false, error:'Room not found' }, { status:404 }); r.headers.set('Cache-Control','no-store'); return r; }
    const body = await req.json();
    const guestId = String(body?.guestId || '').slice(0,48) || Math.random().toString(36).slice(2,10);
  if(room.guestId){ const r = NextResponse.json({ success:false, error:'Room full' }, { status:409 }); r.headers.set('Cache-Control','no-store'); return r; }
  const joined = joinRoom(id, guestId);
  try{ publish(id, { type:'joined', guestId, ts: Date.now() }); }catch{}
  const resp = NextResponse.json({ success:true, room: joined });
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
  }catch{
    const r = NextResponse.json({ success:false, error:'Bad request' }, { status:400 }); r.headers.set('Cache-Control','no-store'); return r;
  }
}
