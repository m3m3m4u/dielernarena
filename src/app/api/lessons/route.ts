import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Lesson from "@/models/Lesson";
import Course from "@/models/Course";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

type ChoiceQuestion = {
  question: string;
  answers: string[];
  correctAnswer?: string; // single-choice
  correctAnswers?: string[]; // multiple-choice
};

type LessonType = 'single-choice' | 'multiple-choice' | 'markdown' | 'video' | string;

interface PostBody {
  courseId: unknown;
  title: unknown;
  type?: unknown;
  content?: unknown;
  questions?: unknown;
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    }
    
    const raw = await request.json();
    const body = raw as PostBody;
    const { courseId, title, content, type = 'single-choice', questions } = body;

    let courseCategory: string | undefined = undefined;
    const userName = (session.user as any).username;
    const userRole = (session.user as any).role;
    if (String(courseId) !== 'exercise-pool') {
      const course = await Course.findById(String(courseId));
      if (!course) {
        return NextResponse.json({ success: false, error: "Kurs nicht gefunden" }, { status: 404 });
      }
      courseCategory = course.category;
  if (course.author !== userName && userRole !== 'author' && userRole !== 'admin') {
        return NextResponse.json({ success: false, error: 'Keine Berechtigung für diesen Kurs' }, { status: 403 });
      }
    } else {
      // exercise-pool: optional Kategorie aus body.content.category oder fallback leer
      if (content && typeof content === 'object' && (content as any).category) {
        courseCategory = String((content as any).category);
      }
    }

    // Ermittle die nächste Order-Nummer
    const lastLesson = await Lesson.findOne({ courseId: String(courseId) }).sort({ order: -1 });
    const order = lastLesson ? Number(lastLesson.order) + 1 : 1;

    const normalizedType: LessonType = String(type) as LessonType;

  const payloadBase = { title: String(title), courseId: String(courseId), category: courseCategory, type: normalizedType, order } as const;

    if (!payloadBase.title || !payloadBase.courseId) {
      return NextResponse.json({ success: false, error: 'Titel und courseId erforderlich' }, { status: 400 });
    }

    let payload: Record<string, unknown> = { ...payloadBase };

    if (normalizedType === 'single-choice' || normalizedType === 'multiple-choice') {
      const q = Array.isArray(questions)
        ? (questions as unknown[])
        : (content && typeof content === 'object' && Array.isArray((content as Record<string, unknown>).questions)
            ? ((content as Record<string, unknown>).questions as unknown[])
            : []);

      const normQ: ChoiceQuestion[] = q.map((qq) => {
        const obj = (qq ?? {}) as Record<string, unknown>;
        return {
          question: String(obj.question ?? ''),
          answers: Array.isArray(obj.answers) ? (obj.answers as unknown[]).map(String) : [],
          correctAnswer: obj.correctAnswer !== undefined ? String(obj.correctAnswer) : undefined,
          correctAnswers: Array.isArray(obj.correctAnswers) ? (obj.correctAnswers as unknown[]).map(String) : undefined,
        };
      }).filter((qq) => qq.question.trim().length > 0 && qq.answers.length > 0);

      if (normQ.length === 0) {
        return NextResponse.json({ success: false, error: 'Fragen fehlen' }, { status: 400 });
      }
      payload = { ...payload, questions: normQ };
    } else {
      const contentObj = (content && typeof content === 'object') ? (content as Record<string, unknown>) : {};
      payload = { ...payload, content: contentObj };
    }

    // Erstelle die neue Lektion
    const newLesson = new Lesson(payload);
    const savedLesson = await newLesson.save();

  const res = NextResponse.json({ success: true, lesson: savedLesson });
  res.headers.set('Warning', '299 - Deprecated endpoint /api/lessons, bitte /api/kurs/{courseId}/lektionen verwenden');
  return res;

  } catch (error: unknown) {
    console.error("Fehler beim Erstellen der Lektion:", error);
    return NextResponse.json({ success: false, error: "Fehler beim Erstellen der Lektion" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await dbConnect();
    
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId');
    
    const lessons = courseId
      ? await Lesson.find({ courseId: String(courseId) }).sort({ order: 1 })
      : await Lesson.find({}).sort({ createdAt: -1 });
    const res = NextResponse.json({ success: true, lessons });
    res.headers.set('Warning', '299 - Deprecated endpoint /api/lessons, bitte /api/kurs/{courseId}/lektionen verwenden');
    return res;

  } catch (error: unknown) {
    console.error("Fehler beim Laden der Lektionen:", error);
    return NextResponse.json({ success: false, error: "Fehler beim Laden der Lektionen" }, { status: 500 });
  }
}
