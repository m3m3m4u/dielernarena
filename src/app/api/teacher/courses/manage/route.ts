import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import Course from '@/models/Course';
import ClassCourseAccess from '@/models/ClassCourseAccess';
import Lesson from '@/models/Lesson';
import { isValidObjectId } from 'mongoose';

// GET: Klassen des Teachers inkl. freigeschalteter Kurse
//   optional ?teacher=username|id (nur admin)
// POST action=enable { classId, courseId, mode? } (teacher owns class)
// DELETE action=disable { classId, courseId }

export async function GET(req: NextRequest){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id as string | undefined;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role!=='teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher-Kontext fehlt' }, { status:400 });

  const classes = await TeacherClass.find({ teacher: teacherId }, '_id name courseAccess').lean();
  const classIds = classes.map(c=>String(c._id));
  const accesses = await ClassCourseAccess.find({ class: { $in: classIds } }).lean();
  const courseIds = accesses.map(a=>String(a.course));
  const courses = courseIds.length>0 ? await Course.find({ _id: { $in: courseIds } }, '_id title description category tags isPublished progressionMode createdAt updatedAt').lean() : [];
  const courseMap = new Map(courses.map(c=>[String(c._id), c]));
  const byClass: Record<string, any[]> = {};
  accesses.forEach(a=>{
    const cid = String(a.class);
    const course = courseMap.get(String(a.course));
    if(!course) return;
    if(!byClass[cid]) byClass[cid] = [];
    byClass[cid].push({ course: { ...course, _id: String(course._id) }, mode: a.mode, accessId: String((a as any)._id) });
  });
  return NextResponse.json({ success:true, classes: classes.map(c=>({ _id:String(c._id), name:c.name, courseAccess: (c as any).courseAccess||'class', courses: byClass[String(c._id)]||[] })) });
}

export async function POST(req: NextRequest){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id as string | undefined;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role!=='teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action } = body;
  if(!teacherId) return NextResponse.json({ success:false, error:'Teacher-Kontext fehlt' }, { status:400 });
  if(action==='enable'){
    const { classId, courseId, mode } = body as any;
    if(!isValidObjectId(classId) || !isValidObjectId(courseId)) return NextResponse.json({ success:false, error:'Ungültige IDs' }, { status:400 });
    const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId }, '_id');
    if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
    const course = await Course.findById(courseId, '_id');
    if(!course) return NextResponse.json({ success:false, error:'Kurs nicht gefunden' }, { status:404 });
    try{
      const acc = await ClassCourseAccess.create({ class: cls._id, course: course._id, enabledBy: teacherId as any, mode: mode==='copy' ? 'copy' : 'link' });
      return NextResponse.json({ success:true, accessId: String(acc._id) });
    } catch(e:any){
      if(e?.code===11000) return NextResponse.json({ success:true, already:true });
      return NextResponse.json({ success:false, error:'Anlegen fehlgeschlagen', message: String(e?.message||e) }, { status:500 });
    }
  }
  if(action==='copy'){
    // Erwartet: { classId, sourceCourseId, title? }
    const { classId, sourceCourseId, title } = body as any;
    if(!isValidObjectId(classId) || !isValidObjectId(sourceCourseId)) return NextResponse.json({ success:false, error:'Ungültige IDs' }, { status:400 });
    const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId }, '_id');
    if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
    const srcCourse = await Course.findById(sourceCourseId).lean();
    if(!srcCourse) return NextResponse.json({ success:false, error:'Quell-Kurs nicht gefunden' }, { status:404 });
    // Author = Username des Teachers
    const teacher = await User.findById(teacherId, 'username').lean();
    const authorUsername = teacher?.username || 'teacher';
    // Neues Course-Dokument erstellen (nicht veröffentlicht)
    const newCourse = await Course.create({
      title: (title && String(title).trim()) || `${String(srcCourse.title || 'Kurs')} (Kopie)`,
      description: String(srcCourse.description || ''),
      category: String(srcCourse.category || 'sonstiges'),
      tags: Array.isArray((srcCourse as any).tags) ? (srcCourse as any).tags : [],
      author: authorUsername,
      lessons: [],
      isPublished: false,
      progressionMode: (srcCourse as any).progressionMode === 'linear' ? 'linear' : 'free'
    });
    // Lektionen kopieren
    const srcLessons = await Lesson.find({ courseId: String(srcCourse._id) }).sort({ order: 1, createdAt: 1 }).lean();
    let inserted: any[] = [];
    if(srcLessons.length){
      const docs = srcLessons.map(sl => ({
        title: sl.title,
        courseId: String(newCourse._id),
        category: sl.category || String(srcCourse.category || ''),
        type: sl.type,
        questions: sl.questions,
        content: sl.content,
        isExercise: !!sl.isExercise,
        order: typeof sl.order === 'number' ? sl.order : 0
      }));
      inserted = await Lesson.insertMany(docs);
      try { await Course.findByIdAndUpdate(newCourse._id, { $set: { lessons: inserted.map(d => d._id) } }); } catch {}
    }
    // ClassCourseAccess anlegen (mode copy)
    try{
      await ClassCourseAccess.create({ class: cls._id, course: newCourse._id as any, enabledBy: teacherId as any, mode: 'copy' });
    } catch(e:any){
      // Falls Duplikat oder Fehler: ignorieren, Kurs bleibt bestehen
    }
    return NextResponse.json({ success:true, newCourseId: String(newCourse._id), lessonCount: inserted.length });
  }
  if(action==='convertToCopy'){
    // Erwartet: { classId, courseId, title? } – vorhandenen Link in Kopie für diese Klasse umwandeln
    const { classId, courseId, title } = body as any;
    if(!isValidObjectId(classId) || !isValidObjectId(courseId)) return NextResponse.json({ success:false, error:'Ungültige IDs' }, { status:400 });
    const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId }, '_id');
    if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
    const access = await ClassCourseAccess.findOne({ class: classId, course: courseId });
    if(!access) return NextResponse.json({ success:false, error:'Zuordnung nicht gefunden' }, { status:404 });
    if((access as any).mode !== 'link') return NextResponse.json({ success:false, error:'Bereits Kopie' }, { status:400 });
    const srcCourse = await Course.findById(courseId).lean();
    if(!srcCourse) return NextResponse.json({ success:false, error:'Kurs nicht gefunden' }, { status:404 });
    const teacher = await User.findById(teacherId, 'username').lean();
    const authorUsername = teacher?.username || 'teacher';
    const newCourse = await Course.create({
      title: (title && String(title).trim()) || `${String(srcCourse.title || 'Kurs')} (Kopie)`,
      description: String(srcCourse.description || ''),
      category: String(srcCourse.category || 'sonstiges'),
      tags: Array.isArray((srcCourse as any).tags) ? (srcCourse as any).tags : [],
      author: authorUsername,
      lessons: [],
      isPublished: false,
      progressionMode: (srcCourse as any).progressionMode === 'linear' ? 'linear' : 'free'
    });
    const srcLessons = await Lesson.find({ courseId: String(srcCourse._id) }).sort({ order: 1, createdAt: 1 }).lean();
    if(srcLessons.length){
      const docs = srcLessons.map(sl => ({
        title: sl.title,
        courseId: String(newCourse._id),
        category: sl.category || String(srcCourse.category || ''),
        type: sl.type,
        questions: sl.questions,
        content: sl.content,
        isExercise: !!sl.isExercise,
        order: typeof sl.order === 'number' ? sl.order : 0
      }));
      const inserted = await Lesson.insertMany(docs);
      try { await Course.findByIdAndUpdate(newCourse._id, { $set: { lessons: inserted.map(d => d._id) } }); } catch {}
    }
    await ClassCourseAccess.updateOne({ _id: (access as any)._id }, { $set: { course: newCourse._id as any, mode: 'copy' } });
    return NextResponse.json({ success:true, newCourseId: String(newCourse._id) });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function PATCH(req: NextRequest){
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    let teacherId = (session?.user as any)?.id as string | undefined;
    if(!teacherId && (session?.user as any)?.username){
      const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
      if(self) teacherId = String(self._id);
    }
    if(role!=='teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
    if(!teacherId) return NextResponse.json({ success:false, error:'Teacher-Kontext fehlt' }, { status:400 });
    const body = await req.json().catch(()=>({}));
    const { action } = body || {};
    if(action==='setClassCourseScope'){
      const { classId, scope } = body as any;
      if(!isValidObjectId(classId)) return NextResponse.json({ success:false, error:'Ungültige classId' }, { status:400 });
      if(scope!=='class' && scope!=='all') return NextResponse.json({ success:false, error:'Ungültiger scope' }, { status:400 });
      const updated = await TeacherClass.findOneAndUpdate({ _id: classId, teacher: teacherId }, { $set: { courseAccess: scope } }, { new: true });
      if(!updated) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
      return NextResponse.json({ success:true, classId: String(updated._id), scope });
    }
    return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
  } catch(e:any){
    return NextResponse.json({ success:false, error:'Fehler', message: String(e?.message||e) }, { status:500 });
  }
}

export async function DELETE(req: NextRequest){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:`DB-Verbindung fehlgeschlagen: ${e?.message||e}` }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id as string | undefined;
  if(!teacherId && (session?.user as any)?.username){
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if(self) teacherId = String(self._id);
  }
  if(role!=='teacher') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, classId, courseId } = body as any;
  if(action!=='disable') return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
  if(!isValidObjectId(classId) || !isValidObjectId(courseId)) return NextResponse.json({ success:false, error:'Ungültige IDs' }, { status:400 });
  const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId }, '_id');
  if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
  await ClassCourseAccess.deleteOne({ class: classId, course: courseId });
  return NextResponse.json({ success:true });
}
