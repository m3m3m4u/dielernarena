import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Lesson from '@/models/Lesson';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// GET: Liste aller als Übung markierten Lektionen
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const rawCat = url.searchParams.get('cat');
    const normalizedCat = (() => {
      if (!rawCat) return undefined;
      const v = String(rawCat).trim();
      if (!v || /^(alle|all|any)$/i.test(v)) return undefined;
      return v; // bei Übungen akzeptieren wir freie Kategorien; Schema validiert optional
    })();
    const lessonId = url.searchParams.get('lessonId');
    if (lessonId) {
      const lesson = await Lesson.findById(lessonId).lean();
      if (!lesson || !lesson.isExercise) return NextResponse.json({ success: false, error: 'Übung nicht gefunden' }, { status: 404 });
      return NextResponse.json({ success: true, exercise: lesson });
    }
    const findFilter: Record<string, unknown> = { isExercise: true };
    if (normalizedCat) findFilter.category = normalizedCat;
    const lessons = await Lesson.find(findFilter)
      .select('_id title type createdAt content courseId questions category')
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ success: true, exercises: lessons });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Fehler beim Laden der Übungen' }, { status: 500 });
  }
}

// POST: vorhandene Lektion als Übung markieren ODER neue Standalone-Übung anlegen
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    }
    await dbConnect();
    const body = await req.json();
  const { lessonId, title, type = 'single-choice', content, questions, courseId } = body || {};

    if (lessonId) {
      let updated = await Lesson.findByIdAndUpdate(lessonId, { isExercise: true }, { new: true });
      if (updated && !updated.category && updated.courseId && updated.courseId !== 'exercise-pool') {
        try {
          const course = await (await import('@/models/Course')).default.findById(updated.courseId).lean();
          if (course?.category) {
            updated.category = course.category;
            await updated.save();
          }
        } catch { /* ignore */ }
      }
      if (!updated) return NextResponse.json({ success: false, error: 'Lektion nicht gefunden' }, { status: 404 });
      return NextResponse.json({ success: true, exercise: updated });
    }

    if (!title) return NextResponse.json({ success: false, error: 'Titel erforderlich' }, { status: 400 });

  const effectiveCourseId = courseId ? String(courseId) : 'exercise-pool';
  const normalizedType: string = String(type) === 'snake' ? 'minigame' : String(type);
    const order = 0;
    // Kategorie bestimmen: bei Kurs-Übung vom Kurs übernehmen, sonst optional aus body.category
    let category: string | undefined;
    if (effectiveCourseId !== 'exercise-pool') {
      try {
        const course = await (await import('@/models/Course')).default.findById(effectiveCourseId).lean();
        category = course?.category;
      } catch { /* ignore */ }
    }
    if (!category && typeof body.category === 'string') category = body.category;

    const newLesson = await Lesson.create({
      title: String(title),
      courseId: effectiveCourseId,
      category,
      type: normalizedType,
      content: content || {},
      questions: Array.isArray(questions) ? questions : [],
      order,
      isExercise: true
    });
    return NextResponse.json({ success: true, exercise: newLesson });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Fehler beim Anlegen / Aktualisieren' }, { status: 500 });
  }
}

// PATCH: Übung bearbeiten (Titel, Inhalt, Fragen, Typ)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    await dbConnect();
    const body = await req.json();
  const { lessonId, title, type, content, questions, courseId: moveToCourseId } = body || {};
    if (!lessonId) return NextResponse.json({ success: false, error: 'lessonId fehlt' }, { status: 400 });
    const lesson = await Lesson.findById(lessonId);
    if (!lesson || !lesson.isExercise) return NextResponse.json({ success: false, error: 'Übung nicht gefunden' }, { status: 404 });

    if (title) lesson.title = String(title);
    // Optional: Migration einer Übung zu einer Kurslektion
    if (moveToCourseId && typeof moveToCourseId === 'string' && moveToCourseId.trim()) {
      const targetCourseId = String(moveToCourseId).trim();
      try {
        const Course = (await import('@/models/Course')).default;
        const c = await Course.findById(targetCourseId).select('category').lean();
        lesson.courseId = targetCourseId;
        lesson.isExercise = false;
        if (c?.category) lesson.category = c.category;
      } catch {
        // Falls Kurs nicht gefunden wird, brechen wir mit Fehler ab
        return NextResponse.json({ success: false, error: 'Ziel-Kurs nicht gefunden' }, { status: 400 });
      }
    }
    if (type) {
  const allowed = ["text","single-choice","multiple-choice","video","markdown","matching","memory","lueckentext","ordering","text-answer","minigame","snake"] as const;
      const nextType = (type === 'snake' ? 'minigame' : type) as (typeof allowed)[number];
      if (allowed.includes(nextType as any)) {
        lesson.type = nextType;
      }
    }
    if (content && typeof content === 'object') lesson.content = content;
    if (Array.isArray(questions)) lesson.questions = questions;
  await lesson.save();
  return NextResponse.json({ success: true, exercise: lesson });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Fehler beim Aktualisieren' }, { status: 500 });
  }
}

// DELETE: Übung entfernen (isExercise=false) oder vollständig löschen wenn standalone + delete=1
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    await dbConnect();
    const url = new URL(req.url);
    const lessonId = url.searchParams.get('lessonId');
    const doDelete = url.searchParams.get('delete') === '1';
    if (!lessonId) return NextResponse.json({ success: false, error: 'lessonId fehlt' }, { status: 400 });
    const lesson = await Lesson.findById(lessonId);
    if (!lesson || !lesson.isExercise) return NextResponse.json({ success: false, error: 'Übung nicht gefunden' }, { status: 404 });
    if (doDelete) {
      // Wenn die Übung einem Kurs zugeordnet ist (nicht exercise-pool), Löschen verweigern und Kurs nennen
      if (lesson.courseId && lesson.courseId !== 'exercise-pool') {
        let courseTitle: string | undefined;
        try {
          const Course = (await import('@/models/Course')).default;
          const course = await Course.findById(lesson.courseId).select('title').lean();
            courseTitle = course?.title;
        } catch { /* ignore */ }
        return NextResponse.json({
          success: false,
          error: 'Übung kann nicht gelöscht werden – sie wird in einem Kurs verwendet.',
          courseId: lesson.courseId,
          courseTitle
        }, { status: 409 });
      }
      // Standalone -> vollständig löschen
      await Lesson.deleteOne({ _id: lessonId });
      return NextResponse.json({ success: true, deleted: true });
    }
    // Nur Markierung entfernen
    lesson.isExercise = false;
    await lesson.save();
    return NextResponse.json({ success: true, removed: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Fehler beim Entfernen' }, { status: 500 });
  }
}
