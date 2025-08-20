import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';

export async function POST(){
  const session = await getServerSession(authOptions);
  if(!session?.user?.username) return NextResponse.json({ success:false, error:'Nicht eingeloggt' }, { status:401 });
  await dbConnect();
  const user = await User.findOne({ username: session.user.username });
  if(!user) return NextResponse.json({ success:false, error:'User nicht gefunden' }, { status:404 });
  if(user.role === 'author' || user.role === 'admin' || user.role === 'teacher'){
    return NextResponse.json({ success:false, error:'Bereits Rechte vorhanden' }, { status:400 });
  }
  if(user.role === 'pending-author'){
    return NextResponse.json({ success:true, already:true });
  }
  user.role = 'pending-author';
  await user.save();
  return NextResponse.json({ success:true, role:user.role });
}
