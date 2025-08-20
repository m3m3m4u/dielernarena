import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import ClassCourseAccess from '@/models/ClassCourseAccess';
import Course from '@/models/Course';
import Lesson from '@/models/Lesson';
import { isValidObjectId } from 'mongoose';

function normalizeCompleted(raw: unknown): string[] {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return [];
  for (const k of raw) {
    if (!k || typeof k !== 'string') continue;
    if (k.includes('-')) {
      const last = k.split('-').pop();
      if (last) out.add(last);
    } else {
      out.add(k);
    }
  }
  return Array.from(out);
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `DB-Verbindung fehlgeschlagen: ${e?.message || e}` }, { status: 500 });
  }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  let teacherId = (session?.user as any)?.id as string | undefined;
  if (!teacherId && (session?.user as any)?.username) {
    const self = await User.findOne({ username: (session?.user as any)?.username }, '_id').lean();
    if (self) teacherId = String(self._id);
  }
  if (role !== 'teacher') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });

  const url = new URL(req.url);
  const classId = url.searchParams.get('classId') || '';
  const mode = (url.searchParams.get('mode') === 'all') ? 'all' : 'class';
  if (!classId || !isValidObjectId(classId)) {
    return NextResponse.json({ success: false, error: 'classId fehlt/ungültig' }, { status: 400 });
  }

  const cls = await TeacherClass.findOne({ _id: classId, teacher: teacherId }, '_id name').lean();
  if (!cls) return NextResponse.json({ success: false, error: 'Klasse nicht gefunden' }, { status: 404 });

  let courses: any[] = [];
  let courseIds: string[] = [];
  if (mode === 'class') {
    const accesses = await ClassCourseAccess.find({ class: classId }, '_id course mode').lean();
    courseIds = accesses.map(a => String(a.course));
    courses = courseIds.length
      ? await Course.find({ _id: { $in: courseIds } }, '_id title description category createdAt updatedAt').lean()
      : [];
  } else {
    // Alle veröffentlichten Kurse (Lehrer will Überblick über public Inhalte)
    const all = await Course.find({ isPublished: true }, '_id title description category createdAt updatedAt').lean();
    courses = all;
    courseIds = all.map(c => String((c as any)._id));
  }
  const lessonsByCourse: Record<string, string[]> = {};
  if (courseIds.length) {
    const lessons = await Lesson.find({ courseId: { $in: courseIds } }, '_id courseId').lean();
    for (const l of lessons) {
      const cid = String((l as any).courseId);
      if (!lessonsByCourse[cid]) lessonsByCourse[cid] = [];
      lessonsByCourse[cid].push(String(l._id));
    }
  }

  const learners = await User.find({ ownerTeacher: teacherId, class: classId }, '_id username name email stars completedLessons').lean();
  const resultLearners = learners.map(u => {
    const completed = normalizeCompleted((u as any).completedLessons);
    const perCourse: Record<string, { completed: number; total: number; percent: number }> = {};
    for (const cid of courseIds) {
      const all = lessonsByCourse[cid] || [];
      const compCount = all.length ? all.filter(id => completed.includes(id)).length : 0;
      const total = all.length;
      const percent = total > 0 ? Math.round((compCount / total) * 100) : 0;
      perCourse[cid] = { completed: compCount, total, percent };
    }
    return {
      username: (u as any).username,
      name: (u as any).name,
      email: (u as any).email || null,
      stars: (u as any).stars || 0,
      completedTotal: completed.length,
      perCourse
    };
  });

  return NextResponse.json({
    success: true,
    class: { _id: String((cls as any)._id), name: (cls as any).name },
    courses: courses.map(c => ({ _id: String((c as any)._id), title: (c as any).title, totalLessons: (lessonsByCourse[String((c as any)._id)] || []).length })),
    learners: resultLearners,
    mode
  });
}
