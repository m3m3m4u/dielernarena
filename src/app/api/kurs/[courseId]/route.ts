import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import ClassCourseAccess from "@/models/ClassCourseAccess";
import { CATEGORIES as ALLOWED_CATEGORIES, isAllowedCategory, normalizeCategory } from '@/lib/categories';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    await dbConnect();
    const { courseId } = await context.params;

  const course = await Course.findById(courseId);
    if (!course) {
      return NextResponse.json(
        { success: false, error: "Kurs nicht gefunden" },
        { status: 404 }
      );
    }

  // Zugriffseinschränkung
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  const username = (session?.user as any)?.username as string | undefined;
    if (role === 'learner' && username) {
      const me = await User.findOne({ username }, '_id class').lean();
      const classId = me?.class ? String(me.class) : null;
      if (!classId) {
        return NextResponse.json({ success: false, error: 'Kein Zugriff auf diesen Kurs' }, { status: 403 });
      }
      // Klassenmodus prüfen
      const TeacherClass = (await import('@/models/TeacherClass')).default;
      const cls = await TeacherClass.findById(classId).select('courseAccess').lean();
      const mode = (cls as any)?.courseAccess === 'all' ? 'all' : 'class';
      if (mode === 'class') {
        const access = await ClassCourseAccess.findOne({ class: classId, course: courseId }).lean();
        if (!access) {
          return NextResponse.json({ success: false, error: 'Kein Zugriff auf diesen Kurs' }, { status: 403 });
        }
      } else {
        // 'all' -> veröffentlichte Kurse sind zugänglich
        if (!course.isPublished) {
          return NextResponse.json({ success: false, error: 'Kurs ist nicht veröffentlicht' }, { status: 403 });
        }
      }
    }
    // Gäste/Anonyme: nur veröffentlichte Kurse sichtbar
    if (!session?.user || !(role === 'author' || role === 'admin' || role === 'teacher' || role === 'learner')) {
      if (!course.isPublished) {
        return NextResponse.json({ success: false, error: 'Kurs ist nicht veröffentlicht' }, { status: 403 });
      }
    }

    // Lade auch die Lektionen des Kurses
    const lessons = await Lesson.find({ courseId }).sort({ order: 1 });
    return NextResponse.json({
      success: true,
      course: {
        ...course.toObject(),
        lessonCount: lessons.length
      },
      lessons
    });
  } catch (error) {
    console.error("Fehler beim Laden des Kurses:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Laden des Kurses" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    await dbConnect();
  const { courseId } = await context.params;
    const body = await request.json();

    // Falls nur veröffentlicht werden soll, ohne andere Felder
    if (body.publish === true || body.isPublic === true || body.isPublished === true) {
      // Nur Autor:in des Kurses oder Admin darf veröffentlichen
      const role = (session.user as any).role;
      if (role !== 'admin' && role !== 'author') {
        return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
      }
      const published = await Course.findByIdAndUpdate(
        courseId,
        { isPublished: true, updatedAt: new Date() },
        { new: true }
      );
      if (!published) {
        return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Kurs veröffentlicht', course: published });
    }

    // Normales Update (komplette Daten)
    const nameOrTitle = body.name || body.title;
    if (!nameOrTitle || !body.description || !body.category) {
      return NextResponse.json(
        { success: false, error: "Titel/Name, Beschreibung und Kategorie sind erforderlich" },
        { status: 400 }
      );
    }

    if (!isAllowedCategory(body.category)) {
      return NextResponse.json({ success: false, error: 'Ungültige Kategorie' }, { status: 400 });
    }

    // Nur Autor:in des Kurses oder Admin darf Kursdaten ändern
  const role = (session.user as any).role;
  const username = (session.user as any).username;
  const current = await Course.findById(courseId).lean();
  if (!current) return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
  // Bearbeiten erlaubt für author/admin ODER teacher, wenn Kurs-Autor er/sie selbst ist; Veröffentlichen wird separat oben geprüft
  const isOwnerTeacher = (current as any).author === username && role === 'teacher';
  if (!isOwnerTeacher && role !== 'admin' && role !== 'author') {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        title: nameOrTitle,
        description: body.description,
  category: normalizeCategory(body.category) || 'sonstiges',
        isPublished: body.isPublic ?? body.isPublished ?? false,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedCourse) {
      return NextResponse.json(
        { success: false, error: "Kurs nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Kurs erfolgreich aktualisiert",
      course: updatedCourse
    });

  } catch (error) {
    console.error("Fehler beim Aktualisieren des Kurses:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Aktualisieren des Kurses" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    await dbConnect();
    const { courseId } = await context.params;
    const body = await request.json();

    if (body.publish === true) {
      const updated = await Course.findByIdAndUpdate(courseId, { isPublished: true, updatedAt: new Date() }, { new: true });
      if (!updated) return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
      return NextResponse.json({ success: true, course: updated });
    }

    return NextResponse.json({ success: false, error: 'Keine gültige Aktion' }, { status: 400 });
  } catch (error) {
    console.error('Fehler beim Patch:', error);
    return NextResponse.json({ success: false, error: 'Fehler beim Patch' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

  await dbConnect();
  const { courseId } = await context.params;
  // Schutz: Nur Kurs-Autor:in oder Admin darf löschen
  const role = (session.user as any).role;
  if (role !== 'admin' && role !== 'author') {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
  }
    
  // Lektions-IDs sammeln für Fortschrittsbereinigung
  const lessonIds = await Lesson.find({ courseId }).select('_id').lean();
  const lessonIdStrings = lessonIds.map(l => String(l._id));

  // Lösche zuerst alle Lektionen des Kurses
  await Lesson.deleteMany({ courseId });

  // Kurs löschen
    const deletedCourse = await Course.findByIdAndDelete(courseId);

    if (!deletedCourse) {
      return NextResponse.json(
        { success: false, error: "Kurs nicht gefunden" },
        { status: 404 }
      );
    }

    // Fortschritt bereinigen: sowohl reine lessonId als auch courseId-lessonId Einträge entfernen
    if (lessonIdStrings.length) {
      const keys = [
        ...lessonIdStrings,
        ...lessonIdStrings.map(id => `${courseId}-${id}`)
      ];
      try {
        await User.updateMany(
          { completedLessons: { $in: keys } },
          { $pull: { completedLessons: { $in: keys } } }
        );
      } catch (cleanupErr) {
        console.warn('Fortschritt-Bereinigung (Course Delete) fehlgeschlagen:', cleanupErr);
      }
    }

  try { await AuditLog.create({ action: 'course.delete', targetType: 'course', targetId: String(courseId), meta: { lessonCount: lessonIdStrings.length } }); } catch (e) { console.warn('AuditLog course.delete fehlgeschlagen', e); }
  return NextResponse.json({ success: true, message: "Kurs, Lektionen & Fortschrittseinträge gelöscht" });

  } catch (error) {
    console.error("Fehler beim Löschen des Kurses:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Löschen des Kurses" },
      { status: 500 }
    );
  }
}
