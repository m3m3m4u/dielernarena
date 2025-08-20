import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import { isValidObjectId } from 'mongoose';
import { hash } from 'bcryptjs';

async function resolveTeacherId(teacherUsername?: string|null, teacherId?: string|null){
  if(teacherId && isValidObjectId(teacherId)) return teacherId;
  if(teacherUsername){
    const u = await User.findOne({ username: teacherUsername, role: 'teacher' }, '_id').lean();
    if(u) return String(u._id);
  }
  return null;
}

export async function GET(req: NextRequest){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const url = new URL(req.url);
  const teacherUsername = url.searchParams.get('teacher');
  const teacherIdParam = url.searchParams.get('teacherId');
  const teacherId = await resolveTeacherId(teacherUsername, teacherIdParam);
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher nicht gefunden' }, { status:404 });
  const teacherUser = await User.findById(teacherId, 'username name').lean();
  const classes = await TeacherClass.find({ teacher: teacherId }, '_id name').lean();
  const learners = await User.find({ ownerTeacher: teacherId }, '_id username name email class createdAt role').lean();
  return NextResponse.json({ success:true, classes, learners, teacherId, teacherUser: teacherUser? { id: String((teacherUser as any)._id), username: String((teacherUser as any).username||''), name: String((teacherUser as any).name||'') } : null });
}

export async function POST(req: NextRequest){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, teacherUsername, teacherId: teacherIdParam } = body as any;
  const teacherId = await resolveTeacherId(teacherUsername, teacherIdParam);
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher nicht gefunden' }, { status:404 });
  if(action==='createClass'){
    const { name } = body as any;
    if(!name) return NextResponse.json({ success:false, error:'Name fehlt' }, { status:400 });
    const cls = await TeacherClass.create({ name: String(name), teacher: teacherId });
    return NextResponse.json({ success:true, class:{ id: String(cls._id), name: cls.name } });
  }
  if(action==='createLearner'){
    const { username, name, password, email, classId } = body as any;
    if(!username || !name || !password) return NextResponse.json({ success:false, error:'Felder fehlen' }, { status:400 });
    const existing = await User.findOne({ username });
    if(existing) return NextResponse.json({ success:false, error:'Benutzer existiert' }, { status:409 });
    const hashed = await hash(password, 10);
    let classRef: any = undefined;
    if(classId){
      if(!isValidObjectId(classId)) return NextResponse.json({ success:false, error:'Ungültige Klassen-ID' }, { status:400 });
      const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId }, '_id');
      if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
      classRef = cls._id;
    }
    const learner = await User.create({ username, name, password: hashed, email: email||undefined, role:'learner', ownerTeacher: teacherId, class: classRef });
    return NextResponse.json({ success:true, learner:{ id: String(learner._id), username: learner.username, name: learner.name } });
  }
  if(action==='bulkCreateLearners'){
    const { lines } = body as any;
    if(!lines || typeof lines !== 'string') return NextResponse.json({ success:false, error:'lines fehlt' }, { status:400 });
    const rawLines = lines.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    const created:any[] = []; const skipped:any[] = [];
    for(const line of rawLines){
      const parts = line.split(/[;\,\t]/).map(p=>p.trim()).filter(Boolean);
      if(parts.length < 3){ skipped.push({ line, reason:'zu wenig Felder' }); continue; }
      const [username, name, password, className, email] = parts;
      if(!username || !name || !password){ skipped.push({ line, reason:'Pflichtfeld leer' }); continue; }
      const exists = await User.findOne({ username });
      if(exists){ skipped.push({ line, reason:'Benutzer existiert' }); continue; }
      let classId:any = undefined;
      if(className){
        let cls = await TeacherClass.findOne({ teacher: teacherId, name: className });
        if(!cls){ cls = await TeacherClass.create({ name: className, teacher: teacherId }); }
        classId = cls._id;
      }
      const hashed = await hash(password, 10);
      const learner = await User.create({ username, name, password: hashed, email: email||undefined, role:'learner', ownerTeacher: teacherId, class: classId });
      created.push({ id: String(learner._id), username: learner.username, name: learner.name, class: className||null });
    }
    return NextResponse.json({ success:true, createdCount: created.length, skippedCount: skipped.length, created, skipped });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function PATCH(req: NextRequest){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, teacherUsername, teacherId: teacherIdParam } = body as any;
  const teacherId = await resolveTeacherId(teacherUsername, teacherIdParam);
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher nicht gefunden' }, { status:404 });
  if(action==='moveLearner'){
    const { learnerUsername, toClassId } = body as any;
    if(!learnerUsername) return NextResponse.json({ success:false, error:'learnerUsername fehlt' }, { status:400 });
    const learner = await User.findOne({ username: learnerUsername, ownerTeacher: teacherId });
    if(!learner) return NextResponse.json({ success:false, error:'Lernender nicht gefunden' }, { status:404 });
    if(toClassId){
      if(!isValidObjectId(toClassId)) return NextResponse.json({ success:false, error:'Ungültige Klassen-ID' }, { status:400 });
      const cls = await TeacherClass.findOne({ _id: toClassId, teacher: teacherId }, '_id');
      if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
      (learner as any).class = (cls as any)._id as any;
    } else {
      (learner as any).class = undefined as any;
    }
    await learner.save();
    return NextResponse.json({ success:true });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function DELETE(req: NextRequest){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, teacherUsername, teacherId: teacherIdParam, learnerUsername } = body as any;
  const teacherId = await resolveTeacherId(teacherUsername, teacherIdParam);
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher nicht gefunden' }, { status:404 });
  if(action==='deleteLearner'){
    if(!learnerUsername) return NextResponse.json({ success:false, error:'learnerUsername fehlt' }, { status:400 });
    const learner = await User.findOne({ username: learnerUsername, ownerTeacher: teacherId });
    if(!learner) return NextResponse.json({ success:false, error:'Lernender nicht gefunden' }, { status:404 });
    await learner.deleteOne();
    return NextResponse.json({ success:true });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}
