import { NextRequest, NextResponse } from 'next/server';
import { getRoom, publish } from '../../../store';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try{
  const { id } = await context.params;
  if(!id){ const r = NextResponse.json({ success:false, error:'Room not found' }, { status:404 }); r.headers.set('Cache-Control','no-store'); return r; }
  const room = getRoom(id);
  if(!room){ const r = NextResponse.json({ success:false, error:'Room not found' }, { status:404 }); r.headers.set('Cache-Control','no-store'); return r; }
    const body = await req.json();
    // minimal validation: require type
    const type = String(body?.type||'');
  if(!type){ const r = NextResponse.json({ success:false, error:'type required' }, { status:400 }); r.headers.set('Cache-Control','no-store'); return r; }
    const payload = { ...body, ts: Date.now() };
  publish(id, payload);
  const resp = NextResponse.json({ success:true });
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
  }catch{
    const r = NextResponse.json({ success:false, error:'Bad request' }, { status:400 }); r.headers.set('Cache-Control','no-store'); return r;
  }
}
