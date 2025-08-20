import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';
import Lesson from '@/models/Lesson';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// PATCH: Teil-Update von Kurs-Einstellungen (z.B. progressionMode)
export async function PATCH(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await context.params;
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    }
    const userName = (session.user as any).username;
    const userRole = (session.user as any).role;
    const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.progressionMode && ['linear','free'].includes(body.progressionMode)) {
      update.progressionMode = body.progressionMode;
    }
    if (typeof body.title === 'string') update.title = body.title.trim();
    if (typeof body.description === 'string') update.description = body.description.trim();
    if (typeof body.isPublished === 'boolean') update.isPublished = body.isPublished;
  if (typeof body.category === 'string' && body.category.trim().length > 0) update.category = body.category.trim();

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Keine gültigen Felder zum Aktualisieren' }, { status: 400 });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
    }
  if (course.author !== userName && userRole !== 'author' && userRole !== 'admin') {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
    }

    // Teacher dürfen den Veröffentlichungsstatus nicht verändern
    if (userRole === 'teacher' && Object.prototype.hasOwnProperty.call(update, 'isPublished')) {
      delete update.isPublished;
    }
    const oldCategory = course.category;
    Object.assign(course, update);
    await course.save();

    // Falls Kategorie geändert wurde: auf alle Kurs-Lektionen ausrollen
  if (update.category && oldCategory !== update.category) {
      try {
    const cid = (course as any)._id ? String((course as any)._id) : courseId;
    await Lesson.updateMany({ courseId: cid }, { $set: { category: update.category } });
      } catch (e) {
        console.warn('Kategorie-Propagation auf Lektionen fehlgeschlagen', e);
      }
    }

    return NextResponse.json({ success: true, course });
  } catch (e) {
    console.error('PATCH /kurs/[courseId]/settings Fehler', e);
    return NextResponse.json({ success: false, error: 'Update fehlgeschlagen' }, { status: 500 });
  }
}
