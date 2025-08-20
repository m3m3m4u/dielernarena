import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import mongoose from 'mongoose';
import Message from '@/models/Message';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';

export async function GET(_req: NextRequest){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const meObjId = new mongoose.Types.ObjectId(meId);
  const notPurged = { $or: [ { purgedFor: { $exists:false } }, { purgedFor: { $ne: meObjId } } ] } as any;
  const notHidden = { $and:[ notPurged, { $or: [ { hiddenFor: { $exists:false } }, { hiddenFor: { $ne: meObjId } } ] } ] } as any;

  if(role==='learner'){
    const me = await User.findById(meId,'class').lean();
    const meClass = me?.class ? new mongoose.Types.ObjectId(String(me.class)) : null;
    const or: any[] = [ { recipientUser: meObjId } ];
    if(meClass) or.push({ recipientClass: meClass });
    const match = { $and:[ notHidden, { $or: or }, { sender: { $ne: meObjId } }, { readBy: { $ne: meObjId } } ] } as any;
    const count = await Message.countDocuments(match);
    return NextResponse.json({ success:true, count });
  }

  if(role==='teacher' || role==='admin'){
    const classIds = await TeacherClass.find({ teacher: meId }, '_id').lean();
    const classSet = classIds.map((c:any)=> new mongoose.Types.ObjectId(String(c._id)));
    const or: any[] = [ { recipientUser: meObjId } ];
    if(classSet.length>0) or.push({ recipientClass: { $in: classSet } });
    const match = { $and:[ notHidden, { $or: or }, { sender: { $ne: meObjId } }, { readBy: { $ne: meObjId } } ] } as any;
    const count = await Message.countDocuments(match);
    return NextResponse.json({ success:true, count });
  }

  return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
}
