import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import { hash } from 'bcryptjs';
import { isValidObjectId } from 'mongoose';

// Teacher Management Endpoint
// GET: Übersicht (eigene Klassen + eigene Lernende)
// POST action=createClass { name }
// POST action=createLearner { username, name, password, email?, classId? }
// POST action=bulkCreateLearners { lines }
// PATCH action=moveLearner { learnerUsername, toClassId|null }
// DELETE action=deleteLearner { learnerUsername }
// DELETE action=deleteClass { classId }

export async function GET(req: NextRequest){
  try { await dbConnect(); } catch (e:any) { return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role !== 'teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const classes = await TeacherClass.find({ teacher: teacherId }).lean();
  const learners = await User.find({ ownerTeacher: teacherId }, '_id username name email class createdAt role').lean();
  return NextResponse.json({ success:true, classes, learners });
}

export async function POST(req: NextRequest){
  try { await dbConnect(); } catch (e:any) { return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role !== 'teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action } = body;
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher-Kontext fehlt' }, { status:400 });
  if(action === 'createClass'){
    const { name } = body;
    if(!name) return NextResponse.json({ success:false, error:'Name fehlt' }, { status:400 });
    const cls = await TeacherClass.create({ name, teacher: teacherId });
    return NextResponse.json({ success:true, class:{ id: String(cls._id), name: cls.name } });
  }
  if(action === 'createLearner'){
    const { username, name, password, email, classId } = body;
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
    return NextResponse.json({ success:true, learner:{ username: learner.username, name: learner.name } });
  }
  if(action === 'bulkCreateLearners'){
    const { lines } = body as any;
    if(!lines || typeof lines !== 'string') return NextResponse.json({ success:false, error:'lines fehlt' }, { status:400 });
    const rawLines = lines.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    const created: any[] = [];
    const skipped: any[] = [];
    for(const line of rawLines){
      // Erlaubte Trenner: Komma, Semikolon oder Tab
      const parts = line.split(/[;,\t]/).map(p=>p.trim()).filter(p=>p.length>0);
      if(parts.length < 3){ skipped.push({ line, reason:'zu wenig Felder' }); continue; }
      const [username, name, password, className, email] = parts;
      if(!username || !name || !password){ skipped.push({ line, reason:'Pflichtfeld leer' }); continue; }
      const exists = await User.findOne({ username });
      if(exists){ skipped.push({ line, reason:'Benutzer existiert' }); continue; }
      let classId: any = undefined;
      if(className){
        let cls = await TeacherClass.findOne({ teacher: teacherId, name: className });
        if(!cls){ cls = await TeacherClass.create({ name: className, teacher: teacherId }); }
        classId = cls._id;
      }
      const hashed = await hash(password,10);
      const learner = await User.create({ username, name, password: hashed, email: email||undefined, role:'learner', ownerTeacher: teacherId, class: classId });
      created.push({ username: learner.username, name: learner.name, class: className||null });
    }
    return NextResponse.json({ success:true, createdCount: created.length, skippedCount: skipped.length, created, skipped });
  }
  // Admin-only: Lernende per Benutzernamen dem gewählten Teacher zuordnen
  if(action === 'reassignLearnerOwner'){
    if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
    const { learnerUsernames, teacherUsername, teacherId: targetTeacherId } = body as any;
    if(!Array.isArray(learnerUsernames) || learnerUsernames.length===0){
      return NextResponse.json({ success:false, error:'learnerUsernames fehlt' }, { status:400 });
    }
    // Admin muss Ziel-Teacher explizit angeben
    let targetId: string | null = null;
    if(targetTeacherId && isValidObjectId(targetTeacherId)) targetId = String(targetTeacherId);
    if(!targetId && teacherUsername){
      const other = await User.findOne({ username: teacherUsername }, '_id role').lean();
      if(other && other.role==='teacher') targetId = String(other._id);
    }
    if(!targetId) return NextResponse.json({ success:false, error:'Teacher-Kontext (Ziel) fehlt' }, { status:400 });
    // Erlaubte Klassen des Ziel-Teachers
    const allowedClasses = await TeacherClass.find({ teacher: targetId }, '_id').lean();
    const allowedSet = new Set(allowedClasses.map((c:any)=>String(c._id)));
    let updated = 0; let clearedClass = 0; const notFound:string[] = [];
    for(const uname of learnerUsernames){
      const learner = await User.findOne({ username: uname });
      if(!learner){ notFound.push(uname); continue; }
      learner.ownerTeacher = targetId as any;
      if(learner.class && !allowedSet.has(String(learner.class))){ learner.class = undefined as any; clearedClass++; }
      await learner.save();
      updated++;
    }
    return NextResponse.json({ success:true, updated, clearedClass, notFound });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function PATCH(req: NextRequest){
  try { await dbConnect(); } catch (e:any) { return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role !== 'teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action } = body;
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher-Kontext fehlt' }, { status:400 });
  if(action === 'moveLearner'){
    const { learnerUsername, toClassId } = body;
    if(!learnerUsername) return NextResponse.json({ success:false, error:'learnerUsername fehlt' }, { status:400 });
    const learner = await User.findOne({ username: learnerUsername });
    if(!learner) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    if(String(learner.ownerTeacher) !== String(teacherId) && role!=='admin') return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    if(toClassId){
      if(!isValidObjectId(toClassId)) return NextResponse.json({ success:false, error:'Ungültige Klassen-ID' }, { status:400 });
  const cls = await TeacherClass.findOne({ _id: toClassId, teacher: teacherId }, '_id');
      if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
  learner.class = (cls as any)._id as any;
    } else {
      learner.class = undefined;
    }
    await learner.save();
    return NextResponse.json({ success:true });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function DELETE(req: NextRequest){
  try { await dbConnect(); } catch (e:any) { return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role !== 'teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, learnerUsername, classId } = body as any;
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher-Kontext fehlt' }, { status:400 });
  if(action === 'deleteLearner'){
    if(!learnerUsername) return NextResponse.json({ success:false, error:'learnerUsername fehlt' }, { status:400 });
    const learner = await User.findOne({ username: learnerUsername });
    if(!learner) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    if(String(learner.ownerTeacher) !== String(teacherId) && role!=='admin') return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    await learner.deleteOne();
    return NextResponse.json({ success:true });
  }
  if(action === 'deleteClass'){
    if(!classId || !isValidObjectId(classId)) return NextResponse.json({ success:false, error:'classId fehlt/ungültig' }, { status:400 });
    const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId });
    if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
    // Prüfen, ob noch Lernende der Klasse zugeordnet sind
    const learnersInClass = await User.countDocuments({ ownerTeacher: teacherId, class: classId });
    if(learnersInClass > 0) return NextResponse.json({ success:false, error:'Bitte zuerst alle Lernenden aus der Klasse entfernen' }, { status:409 });
    // Zugehörige Kurs-Freigaben entfernen
    try {
      const ClassCourseAccess = (await import('@/models/ClassCourseAccess')).default;
      await ClassCourseAccess.deleteMany({ class: classId });
    } catch {}
    await cls.deleteOne();
    return NextResponse.json({ success:true });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}
