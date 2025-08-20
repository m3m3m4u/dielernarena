import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Lesson from '@/models/Lesson';
import Course from '@/models/Course';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// POST: Reorder lessons in a course
// Body: { order: string[] }  (array of lesson ids in desired order)
export async function POST(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    const username = (session.user as any).username;
    const role = (session.user as any).role;
  const { courseId } = await context.params;
    const course = await Course.findById(courseId).lean();
    if (!course) return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
  const isOwnerTeacher = role === 'teacher' && course.author === username;
  if (!isOwnerTeacher && role !== 'author' && role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
    }
    const body = await req.json().catch(()=>null) as { order?: unknown } | null;
    if (!body || !Array.isArray(body.order) || body.order.length === 0) {
      return NextResponse.json({ success: false, error: 'order Array fehlt' }, { status: 400 });
    }
    const desired: string[] = body.order.map(String);
    // Aktuelle Lektionen
    const lessons = await Lesson.find({ courseId }).select('_id courseId').lean();
    const idsInCourse = new Set(lessons.map(l=>String(l._id)));
    for (const id of desired) {
      if (!idsInCourse.has(id)) {
        return NextResponse.json({ success: false, error: `ID ${id} gehört nicht zu diesem Kurs` }, { status: 400 });
      }
    }
    if (desired.length !== lessons.length) {
      return NextResponse.json({ success: false, error: 'Anzahl IDs stimmt nicht mit Lektionen im Kurs überein' }, { status: 400 });
    }
    const bulkOps = desired.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } } }));
    await Lesson.bulkWrite(bulkOps);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Reorder Fehler', e);
    return NextResponse.json({ success: false, error: 'Fehler beim Reorder' }, { status: 500 });
  }
}
