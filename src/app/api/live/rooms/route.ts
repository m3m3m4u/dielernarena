import { NextRequest, NextResponse } from 'next/server';
import { createRoom, listRooms } from '../store';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

export const dynamic = 'force-dynamic';

export async function GET(){
  const res = NextResponse.json({ success: true, rooms: listRooms() });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(req: NextRequest){
  try{
  const { name, exerciseId } = await req.json();
  const session = await getServerSession(authOptions).catch(()=>null as any);
  const host = (session?.user as any)?.username || (session?.user as any)?.name || undefined;
  const room = createRoom(String(name||'').slice(0,48), exerciseId ? String(exerciseId) : undefined, host);
  const res = NextResponse.json({ success: true, room });
  res.headers.set('Cache-Control', 'no-store');
  return res;
  } catch {
    return NextResponse.json({ success: false, error: 'Bad request' }, { status: 400 });
  }
}
