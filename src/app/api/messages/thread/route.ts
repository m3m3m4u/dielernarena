import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Message from '@/models/Message';
import { isValidObjectId } from 'mongoose';

export async function GET(req: NextRequest){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id')||'';
  if(!isValidObjectId(id)) return NextResponse.json({ success:false, error:'Ungültige ID' }, { status:400 });
  // Alle Nachrichten desselben Threads: threadId == id ODER _id == id (falls Root ohne threadId)
  const msgs = await Message.find({ $or:[ { threadId: id }, { _id: id } ] })
    .sort({ createdAt: 1 })
    .populate('sender','username name')
  .populate('recipientUser','username name')
  .populate('recipientClass','name')
    .lean();
  // Optional: Sichtbarkeitscheck könnte ergänzt werden (hiddenFor != me)
  return NextResponse.json({ success:true, messages: msgs });
}
