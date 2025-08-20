import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';

export async function GET(_req: NextRequest){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  if(!session?.user) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const username = (session.user as any)?.username as string | undefined;
  if(!username) return NextResponse.json({ success:true, class:null });
  const user = await User.findOne({ username }, '_id class').lean();
  if(!user?.class) return NextResponse.json({ success:true, class:null });
  const cls = await TeacherClass.findById(user.class, '_id name').lean();
  if(!cls) return NextResponse.json({ success:true, class:null });
  return NextResponse.json({ success:true, class: { _id: String(cls._id), name: cls.name } });
}
