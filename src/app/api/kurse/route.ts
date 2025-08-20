import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson"; // hinzugefügt
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import User from '@/models/User';
import ClassCourseAccess from '@/models/ClassCourseAccess';
import { CATEGORIES as ALLOWED_CATEGORIES, normalizeCategory } from '@/lib/categories';

type LeanCourse = { _id: unknown } & Record<string, unknown>;

type CountAgg = { _id: string; count: number };

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    const url = new URL(req.url);
    const showAll = url.searchParams.get("showAll") === "1";
  const requestedMode = (url.searchParams.get('mode') || '').toLowerCase() === 'all' ? 'all' : 'class';
    // Kategorie-Filter (?cat=)
    const rawCat = url.searchParams.get("cat");
    const normalizedCat = (() => {
      if (!rawCat) return undefined;
      const v = String(rawCat).trim();
      if (!v || /^(alle|all|any)$/i.test(v)) return undefined; // keine Einschränkung
      return normalizeCategory(v);
    })();
    const filter: Record<string, unknown> = showAll ? {} : { isPublished: true };
    if (normalizedCat) filter.category = normalizedCat;

  let courses: LeanCourse[] = [];
  let learnerScope: 'class' | 'all' | undefined = undefined; // was ist grundsätzlich erlaubt?
  let activeMode: 'class' | 'all' | undefined = undefined;   // was wurde angewendet?
    // Rollen-/Klassenlogik: Lernende in Klassen sehen nur freigeschaltete Kurse.
    const role = (session?.user as any)?.role as string | undefined;
    const username = (session?.user as any)?.username as string | undefined;
    if (role === 'learner' && username) {
      // Finde Lernenden inkl. Klassen-ID
      const me = await User.findOne({ username }, '_id class').lean();
      const classId = me?.class ? String(me.class) : null;
      if (classId) {
        // Klassenmodus prüfen: 'all' => alle veröffentlichten Kurse sichtbar; 'class' => nur freigegebene
        const TeacherClass = (await import('@/models/TeacherClass')).default;
        const cls = await TeacherClass.findById(classId).select('courseAccess').lean();
        const allowed = (cls as any)?.courseAccess === 'all' ? 'all' : 'class';
        learnerScope = allowed;
        const effective = allowed === 'all' && requestedMode === 'all' ? 'all' : 'class';
        activeMode = effective;
        if (effective === 'class') {
          const accesses = await ClassCourseAccess.find({ class: classId }).lean();
          const allowedCourseIds = accesses.map(a => String(a.course));
          if (allowedCourseIds.length === 0) {
            courses = [];
          } else {
            const f: Record<string, unknown> = { _id: { $in: allowedCourseIds } };
            if (!showAll) f.isPublished = true;
            if (normalizedCat) f.category = normalizedCat;
            courses = await Course.find(f).sort({ createdAt: -1 }).lean();
          }
        } else {
          const f: Record<string, unknown> = {};
          if (!showAll) f.isPublished = true;
          if (normalizedCat) f.category = normalizedCat;
          courses = await Course.find(f).sort({ createdAt: -1 }).lean();
        }
      } else {
        // Lernende ohne Klasse sehen derzeit keine Kurse (Policy)
        courses = [];
      }
    } else {
      // Für Teacher/Admin/Autoren weiterhin global, aber showAll steuert Veröffentlichungen
      courses = await Course.find(filter).sort({ createdAt: -1 }).lean();
    }

    const courseIds = courses.map((c) => String(c._id));
    const counts = await Lesson.aggregate<CountAgg>([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: "$courseId", count: { $sum: 1 } } }
    ]);
    const countMap: Record<string, number> = {};
    counts.forEach((c) => { countMap[c._id] = c.count; });

    const coursesWithCounts = courses.map((c) => ({
      ...c,
      lessonCount: countMap[String(c._id)] || 0
    }));

  return NextResponse.json({ success: true, courses: coursesWithCounts, learnerScope, activeMode });
  } catch (error: unknown) {
    console.error("Fehler beim Laden der Kurse:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Laden der Kurse" },
      { status: 500 }
    );
  }
}

interface PostBody {
  title: unknown;
  description: unknown;
  category: unknown;
  tags?: unknown;
  author?: unknown;
  progressionMode?: unknown; // 'linear' | 'free'
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    if (!session?.user || (role !== 'author' && role !== 'admin')) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
    }
    const raw = await req.json();
    const body = raw as PostBody;
  const { title, description, category, tags = [], author: authorFromBody, progressionMode } = body;

    if (!title || !description || !category) {
      return NextResponse.json({ success: false, error: 'Titel, Beschreibung und Kategorie sind erforderlich' }, { status: 400 });
    }

    const catStr = String(category).trim();
    const normalizedCategory = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === catStr.toLowerCase()) || 'sonstiges';

  // Autor kommt aus Session – keine freie Wahl per Body
  const author = (session.user as any).username || 'author';
    const tagsArray: string[] = Array.isArray(tags) ? (tags as unknown[]).map((t) => String(t)) : [];

    const mode = progressionMode === 'linear' ? 'linear' : 'free';
    const newCourse = await Course.create({
      title: String(title).trim(),
      description: String(description).trim(),
      category: normalizedCategory,
      tags: tagsArray,
      author,
      lessons: [],
      isPublished: false,
      progressionMode: mode
    });

    return NextResponse.json({ success: true, courseId: String(newCourse._id), course: newCourse });
  } catch (error: unknown) {
    console.error('Fehler beim Erstellen des Kurses:', error);
    const dev = process.env.NODE_ENV !== 'production';
    const err = error as { name?: string; message?: string; errors?: unknown } | undefined;
    if (err?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Validierungsfehler', fields: err.errors, message: dev ? err.message : undefined }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Fehler beim Erstellen des Kurses', message: dev ? String(err?.message || error) : undefined }, { status: 500 });
  }
}
