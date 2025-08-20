import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Lesson from "@/models/Lesson";
import AuditLog from "@/models/AuditLog";
import Course from "@/models/Course";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import User from '@/models/User';
import ClassCourseAccess from '@/models/ClassCourseAccess';
import { parseMemory } from '@/lib/memory';
import { parseLueckentext } from '@/lib/lueckentext';

// Hilfstypen
type ChoiceKind = 'single-choice' | 'multiple-choice';

type ChoiceQuestionNormalized = {
  question: string;
  mediaLink?: string;
  correctAnswer?: string;
  correctAnswers?: string[];
  wrongAnswers: string[];
  allAnswers: string[];
};

type ValidationError = { index: number; error: string };

type PostBody = {
  sourceLessonId?: string;
  title?: string;
  type?: string;
  questions?: unknown[];
  content?: unknown;
  text?: string;
};

// Hinweis Next.js 15: params ist jetzt asynchron und muss awaited werden
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const awaited = await context.params;
    let { courseId } = awaited || ({} as any);
    if (!courseId) {
      // Fallback: aus URL extrahieren
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean);
        const i = parts.findIndex(p => p === 'kurs');
        if (i !== -1 && parts[i + 1]) courseId = parts[i + 1];
      } catch {}
    }
    if (!courseId) {
      const dev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ success: false, error: 'courseId fehlt', ...(dev ? { hint: 'Pfad erwartet: /api/kurs/{courseId}/lektionen' } : {}) }, { status: 400 });
    }
  await dbConnect();
    // Zugriff prüfen
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    const username = (session?.user as any)?.username as string | undefined;
    // Kurs laden für Published-Check (Gäste)
    const course = await Course.findById(courseId).lean();
    const isVirtualPool = !course && (courseId === 'exercise-pool');
    if (!course && !isVirtualPool) {
      return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
    }
  if (!isVirtualPool && role === 'learner' && username) {
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
        const hasAccess = await ClassCourseAccess.exists({ class: classId, course: courseId });
        if (!hasAccess) {
          return NextResponse.json({ success: false, error: 'Kein Zugriff auf diesen Kurs' }, { status: 403 });
        }
      } else {
        // 'all' -> nur veröffentlichte Kurse
        const course = await Course.findById(courseId).select('isPublished').lean();
        if (!course?.isPublished) {
          return NextResponse.json({ success: false, error: 'Kurs ist nicht veröffentlicht' }, { status: 403 });
        }
      }
    }
    // Gäste/Anonyme: nur veröffentlichte Kurse
    if (!isVirtualPool && (!session?.user || !(role === 'author' || role === 'admin' || role === 'teacher' || role === 'learner'))) {
      if (!(course as any).isPublished) {
        return NextResponse.json({ success: false, error: 'Kurs ist nicht veröffentlicht' }, { status: 403 });
      }
    }
    const lessons = await Lesson.find({ courseId }).sort({ order: 1, createdAt: 1 });
    const coursePayload = isVirtualPool
      ? { _id: 'exercise-pool', title: 'Übungs-Pool', progressionMode: 'free', isPublished: true }
      : { _id: String(course?._id), title: (course as any)?.title, progressionMode: (course as any)?.progressionMode || 'free', isPublished: !!(course as any)?.isPublished };
    return NextResponse.json({ success: true, lessons, course: coursePayload });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: 'Fehler beim Laden', details }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const awaited = await context.params;
    let { courseId } = awaited || ({} as any);
    if (!courseId) {
      // Fallback: aus URL extrahieren
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean);
        const i = parts.findIndex(p => p === 'kurs');
        if (i !== -1 && parts[i + 1]) courseId = parts[i + 1];
      } catch {}
    }
    await dbConnect();

    // Auth vor jeglicher Verarbeitung: nur Autoren dürfen Lektionen anlegen
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    }
    const userRole = (session.user as any).role;
    const username = (session.user as any).username;
    const course = await Course.findById(courseId).lean();
    if (!course) {
      return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
    }
    const isOwnerTeacher = userRole === 'teacher' && (course as any).author === username;
    if (!isOwnerTeacher && userRole !== 'author' && userRole !== 'admin') {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung in diesem Kurs Lektionen anzulegen' }, { status: 403 });
    }
    const body: PostBody = await request.json();

  const { sourceLessonId, title, type, questions, content } = body;
  const isCopy = Boolean(sourceLessonId);

    // Parser für Text-Eingabe (Single- oder Multiple-Choice)
    const parseFromTextBlocks = (blocksText: string, kind: ChoiceKind): ChoiceQuestionNormalized[] => {
      const blocks = blocksText.trim().split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
      const parsed: ChoiceQuestionNormalized[] = [];
      for (const block of blocks) {
        const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;
        const first = lines[0];
        let qText = first;
        let mediaLink = '';
        const m = first.match(/^(.+?)\s*\[(.+?)\]$/);
        if (m) { qText = m[1].trim(); mediaLink = m[2].trim(); }
        const answerLines = lines.slice(1);
        const corrects: string[] = [];
        const wrongs: string[] = [];
        for (const aRaw of answerLines) {
          const a = aRaw.trim();
          if (kind === 'multiple-choice') {
            if (a.startsWith('*')) {
              corrects.push(a.replace(/^\*+/, '').trim());
            } else {
              wrongs.push(a);
            }
          } else {
            // single-choice
            if (corrects.length === 0) corrects.push(a); else wrongs.push(a);
          }
        }
        const all = [...corrects, ...wrongs].filter(Boolean);
        if (qText && corrects.length >= 1 && all.length >= 2) {
          parsed.push({
            question: qText,
            mediaLink: mediaLink || undefined,
            correctAnswers: kind === 'multiple-choice' ? corrects : undefined,
            correctAnswer: kind === 'single-choice' ? corrects[0] : undefined,
            wrongAnswers: wrongs,
            allAnswers: all
          });
        }
      }
      return parsed;
    };

    // vorhandene normalizeQuestions bleibt für externe Formate bestehen
    const normalizeQuestions = (qs: unknown[]): ChoiceQuestionNormalized[] => {
      if (!Array.isArray(qs)) return [];
      const toText = (v: unknown): string => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          const cand = obj.text ?? obj.label ?? obj.name ?? obj.value ?? obj.title;
          if (typeof cand === 'string') return cand;
          try { return JSON.stringify(v); } catch { return String(v); }
        }
        return String(v ?? '');
      };
      return qs.map((qUnknown) => {
        const q = (qUnknown ?? {}) as Record<string, unknown>;
        const arraysCandidates = [q.allAnswers, q.answers, q.options, q.choices].filter(Array.isArray) as unknown[][];
        let all: string[] = arraysCandidates.length ? (arraysCandidates[0] as unknown[]).map(toText) : [];

        // Mehrfachlösungen: corrects als Array priorisieren
        let corrects: string[] | undefined = Array.isArray(q.correctAnswers) ? (q.correctAnswers as unknown[]).map(toText) : undefined;
        if (!corrects) {
          const c = (q as Record<string, unknown>).correct ?? q.correctAnswer ?? (q as Record<string, unknown>).solution ?? (q as Record<string, unknown>).answer;
          if (Array.isArray(c)) corrects = (c as unknown[]).map(toText);
          else if (typeof c !== 'undefined') corrects = [toText(c)];
        }

        if ((!all || all.length === 0) && (corrects && corrects.length)) {
          const wrong = Array.isArray(q.wrongAnswers) ? (q.wrongAnswers as unknown[]).map(toText) : [];
          all = [...corrects, ...wrong];
        }

        const wrong = Array.isArray(q.wrongAnswers)
          ? (q.wrongAnswers as unknown[]).map(toText)
          : (all ? all.filter(a => !(corrects || []).includes(a)) : []);
        const dedupe = (arr: unknown[]) => Array.from(new Set((arr || []).map((x) => (typeof x === 'string' ? x.trim() : String(x))))).filter(Boolean) as string[];
        const finalAll = dedupe(all);
        const finalCorrects = dedupe(corrects || []);
        const finalWrong = dedupe((wrong as string[]).filter((w: string) => !finalCorrects.includes(w)));

        return {
          question: toText(q.question || (q as Record<string, unknown>).text || ''),
          mediaLink: (q.mediaLink as string) || (q.media as string) || undefined,
          correctAnswer: finalCorrects.length === 1 ? finalCorrects[0] : undefined,
          correctAnswers: finalCorrects.length > 1 ? finalCorrects : undefined,
          wrongAnswers: finalWrong,
          allAnswers: finalAll,
        } as ChoiceQuestionNormalized;
      });
    };

    // NEU: präzisere Validierung + Normalisierung für Choice-Fragen
    const validateAndNormalizeChoice = (qs: unknown[], kind: ChoiceKind): { normalized: ChoiceQuestionNormalized[]; errors: ValidationError[] } => {
      const toText = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
      const uniq = (arr: string[]) => Array.from(new Set((arr || []).map(a => toText(a).trim()))).filter(Boolean);
      const errors: ValidationError[] = [];
      const normalized = (qs || []).map((qUnknown, idx: number) => {
        const q = (qUnknown ?? {}) as Record<string, unknown>;
        const question = toText(q.question).trim();
        const mediaLink = (q.mediaLink as string) || (q.media as string) || undefined;
        // Korrekte Antworten sammeln
        let corrList: string[] = [];
        if (kind === 'single-choice') {
          if (q.correctAnswer) corrList = [toText(q.correctAnswer).trim()].filter(Boolean);
          else if (Array.isArray(q.correctAnswers) && (q.correctAnswers as unknown[]).length) corrList = uniq((q.correctAnswers as unknown[]).map(toText));
        } else {
          if (Array.isArray(q.correctAnswers) && (q.correctAnswers as unknown[]).length) corrList = uniq((q.correctAnswers as unknown[]).map(toText));
          else if (q.correctAnswer) corrList = [toText(q.correctAnswer).trim()].filter(Boolean);
        }
        // allAnswers bevorzugen, sonst aus correct+wrong bauen
        const providedAll = Array.isArray(q.allAnswers) ? (q.allAnswers as unknown[]) : [];
        const wrongRaw = Array.isArray(q.wrongAnswers) ? (q.wrongAnswers as unknown[]) : [];
        const builtAll = [...corrList, ...wrongRaw.map(toText)];
        const all = uniq((providedAll.length ? providedAll : builtAll).map(toText));
        // Validierungen
        if (!question) {
          errors.push({ index: idx, error: 'Fragetext fehlt' });
        }
        if (kind === 'single-choice') {
          if (corrList.length !== 1) {
            errors.push({ index: idx, error: 'Single-Choice benötigt genau eine richtige Antwort' });
          }
        } else {
          if (corrList.length < 1) {
            errors.push({ index: idx, error: 'Multiple-Choice benötigt mindestens eine richtige Antwort' });
          }
        }
        if (all.length < 2) {
          errors.push({ index: idx, error: 'Mindestens zwei Antwortoptionen sind erforderlich' });
        }
        const missing = corrList.filter(a => !all.includes(a));
        if (missing.length > 0) {
          errors.push({ index: idx, error: `Richtige Antworten fehlen in allAnswers: ${missing.join(', ')}` });
        }
        const wrong = all.filter(a => !corrList.includes(a));
        return {
          question,
          mediaLink,
          correctAnswer: corrList[0] || undefined,
          correctAnswers: kind === 'multiple-choice' ? corrList : undefined,
          wrongAnswers: wrong,
          allAnswers: all,
        } satisfies ChoiceQuestionNormalized;
      });
      return { normalized, errors };
    };

    // NEU: Matching-Parser (Paare finden) – jetzt mit mehreren Blöcken
    type Pair = { left: string; right: string; leftMedia?: string; rightMedia?: string };
    const parseMatchingBlocks = (text: string): Pair[][] => {
      const blocks = (text || '')
        .trim()
        .split(/\n\s*\n+/)
        .map(b => b.trim())
        .filter(Boolean);
      const isMedia = (s: string) => /\.(jpg|jpeg|png|gif|webp|mp3|wav|ogg|m4a)$/i.test(s) || /^https?:\/\//i.test(s);
      const result: Pair[][] = [];
      for (const block of blocks) {
        const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 5);
        const pairs: Pair[] = [];
        for (const line of lines) {
          const [rawL, rawR] = line.split('|');
          if (!rawL || !rawR) continue;
          const l = rawL.trim();
          const r = rawR.trim();
          const leftMedia = isMedia(l) ? l : undefined;
          const rightMedia = isMedia(r) ? r : undefined;
          if (l && r) pairs.push({ left: l, right: r, leftMedia, rightMedia });
        }
        // nur Blöcke mit mindestens 2 Paaren übernehmen
        if (pairs.length >= 2) result.push(pairs);
      }
      return result;
    };

    let finalTitle = title;
    let finalType = type as string | undefined;
    let finalQuestions: ChoiceQuestionNormalized[] | undefined = questions as ChoiceQuestionNormalized[] | undefined;
    let finalContent: unknown = content;

    // Memory: Rohtext aus body.text oder content.text parsen
    if (finalType === 'memory') {
      const rawText = (body.text || (typeof content === 'object' && content && (content as any).text) || '').toString();
      const { pairs, errors: memErrors } = parseMemory(rawText);
      if (memErrors.length) {
        return NextResponse.json({ success: false, error: 'Memory Validation fehlgeschlagen', details: memErrors }, { status: 400 });
      }
      finalContent = { raw: rawText, pairs };
    }

    // NEU: Lückentext
    if (finalType === 'lueckentext') {
      const md = (typeof body.content === 'object' && body.content && (body.content as any).markdown) || (body as any).markdown || '';
      const mode = (typeof body.content === 'object' && body.content && (body.content as any).mode) || 'input';
      const { parsed, errors: ltErrors } = parseLueckentext(String(md||''), mode === 'drag' ? 'drag' : 'input');
      if (ltErrors.length) {
        return NextResponse.json({ success: false, error: 'Lückentext Validation fehlgeschlagen', details: ltErrors }, { status: 400 });
      }
      finalContent = parsed;
    }

  // Video validieren/normalisieren (YouTube)
  if (finalType === 'video') {
      const raw = (typeof body.content === 'object' && body.content && (body.content as any).youtubeUrl) || (body as any).youtubeUrl || (typeof body.content === 'object' && body.content && (body.content as any).url) || '';
      const text = (typeof body.content === 'object' && body.content && (body.content as any).text) || '';
      const url = String(raw || '').trim();
      const videoId = extractYouTubeIdForApi(url);
      if (!url || !videoId) {
        return NextResponse.json({ success: false, error: 'Ungültiger YouTube-Link. Erlaubt sind z.B. https://www.youtube.com/watch?v=ID oder https://youtu.be/ID' }, { status: 400 });
      }
      finalContent = { youtubeUrl: url, text: String(text || '') };
    }

    // Snake: vereinfachte Konfiguration (difficulty -> speed mapping)
    if (finalType === 'snake') {
      const cfg = (typeof body.content === 'object' && body.content) ? body.content as any : {};
      const target = Number(cfg?.targetScore) || 10;
  const difficulty = cfg?.difficulty === 'schwer' ? 'schwer' : (cfg?.difficulty === 'einfach' ? 'einfach' : 'mittel');
  const speed = Number(cfg?.initialSpeedMs) || (difficulty === 'schwer' ? 140 : (difficulty === 'einfach' ? 220 : 180));
      const blocksRaw = Array.isArray(cfg?.blocks) ? cfg.blocks : undefined;
      const blocks = blocksRaw && (blocksRaw as any[]).every((b: any) => b && typeof b.question === 'string' && Array.isArray(b.answers)) ? (blocksRaw as any[]).slice(0,50) : undefined;
      finalContent = { targetScore: target, difficulty, initialSpeedMs: speed, ...(blocks ? { blocks } : {}) };
    }

    if (typeof finalType === 'string' && (finalType === 'single-choice' || finalType === 'multiple-choice') && typeof body.text === 'string' && body.text.trim()) {
      // direkter Textparser
      finalQuestions = parseFromTextBlocks(body.text, finalType);
      if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) {
        const dev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          {
            success: false,
            error: 'Keine gültigen Fragen aus dem Text erkannt. Prüfe Format (Fragezeile, danach Antworten, korrekte mit * markieren, Blöcke durch Leerzeile trennen).',
            ...(dev ? { hint: 'Beispiel: Frage 1\n*Richtig A\nFalsch B\n\nFrage 2\n*Richtig' } : {}),
          },
          { status: 400 }
        );
      }
    }

    if (sourceLessonId) {
      const srcUnknown = await Lesson.findById(sourceLessonId).lean();
      if (!srcUnknown) return NextResponse.json({ success: false, error: 'Quell-Lektion nicht gefunden' }, { status: 404 });
      const src = srcUnknown as unknown as { title?: string; type?: string; questions?: unknown[]; content?: { questions?: unknown[] } };
      finalTitle = finalTitle || src.title;
      finalType = finalType || src.type;

      const srcQuestions = src.questions as unknown[] | undefined;
      const srcContent = src.content as { questions?: unknown[] } | undefined;

      if (finalType === 'matching') {
        // Matching-Lektionen: vorhandene Fragen (mit correctAnswers left=>right) direkt übernehmen
        if (Array.isArray(srcQuestions) && srcQuestions.length > 0) {
          finalQuestions = srcQuestions as any;
        } else if (Array.isArray(srcContent?.questions) && srcContent!.questions!.length > 0) {
          finalQuestions = srcContent!.questions as any;
        } else {
          finalQuestions = undefined; // Fallback: später ggf. aus Text
        }
      } else if (finalType && finalType.includes('choice')) {
        const copied = (Array.isArray(srcQuestions) && srcQuestions.length > 0)
          ? srcQuestions
          : (srcContent?.questions && Array.isArray(srcContent.questions) && srcContent.questions.length > 0)
            ? srcContent.questions
            : undefined;
        finalQuestions = Array.isArray(finalQuestions) && finalQuestions.length > 0
          ? finalQuestions
          : (copied as ChoiceQuestionNormalized[] | undefined);
        if (Array.isArray(finalQuestions)) {
          finalQuestions = normalizeQuestions(finalQuestions as unknown[]);
        }
      } else {
        finalContent = finalContent || (srcContent ? JSON.parse(JSON.stringify(srcContent)) : {});
      }
    }

    if (!finalTitle || !finalType) {
      return NextResponse.json({ success: false, error: 'Titel und Typ erforderlich' }, { status: 400 });
    }

    // Immer normalisieren, wenn Fragen für Choice-Typ bereitgestellt wurden
    if ((finalType === 'single-choice' || finalType === 'multiple-choice') && Array.isArray(finalQuestions)) {
      // Beim Kopieren (sourceLessonId) die originalen Fragen möglichst unverändert lassen
      // und nur eine leichte Normalisierung durchführen.
      // Strikte Validierung folgt unten nur, wenn es KEIN Kopiervorgang ist.
      finalQuestions = normalizeQuestions(finalQuestions as unknown[]);
    }

    // Matching: aus Text mehrere Aufgaben erzeugen, wenn keine Fragen vorhanden
    if (finalType === 'matching' && (!Array.isArray(finalQuestions) || finalQuestions.length === 0)) {
      const text = (body.text || (typeof finalContent === 'object' && finalContent && (finalContent as any).text) || '').toString();
      const blocks = parseMatchingBlocks(text);
      if (!blocks.length) {
        return NextResponse.json({ success: false, error: 'Mindestens 2 Paare pro Aufgabe (Block) erforderlich' }, { status: 400 });
      }
      const shuffle = <T,>(arr: T[]) => arr.map(v => [Math.random(), v] as const).sort((a,b) => a[0]-b[0]).map(([,v]) => v);
      finalQuestions = blocks.map((pairs) => {
        const lefts = pairs.map(p => p.left);
        const rights = pairs.map(p => p.right);
        const allCombined = shuffle([...lefts, ...rights]);
        const mediaFromPair = pairs.find(p => p.leftMedia || p.rightMedia);
        return {
          question: 'Finde die passenden Paare',
          mediaLink: mediaFromPair?.leftMedia || mediaFromPair?.rightMedia,
          correctAnswers: pairs.map(p => `${p.left}=>${p.right}`),
          wrongAnswers: [],
          allAnswers: allCombined,
        } as ChoiceQuestionNormalized;
      });
    }

    if (finalType === 'single-choice' || finalType === 'multiple-choice') {
      if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) {
        const dev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          { success: false, error: 'Fragen erforderlich', ...(dev ? { debug: { finalType, qCount: Array.isArray(finalQuestions) ? finalQuestions.length : 0 } } : {}) },
          { status: 400 }
        );
      }

      // Beim Kopieren eine strikte Validierung überspringen, um bestehende Altformate nicht zu blockieren
      if (!isCopy) {
        const { normalized, errors } = validateAndNormalizeChoice(finalQuestions as unknown[], finalType as ChoiceKind);
        if (errors.length > 0) {
          const dev = process.env.NODE_ENV !== 'production';
          return NextResponse.json(
            {
              success: false,
              error: 'Validierungsfehler in den Fragen',
              errors,
              ...(dev ? { count: errors.length } : {}),
            },
            { status: 400 }
          );
        }
        finalQuestions = normalized;
      }
    }

    const lastUnknown = await Lesson.findOne({ courseId }).sort({ order: -1 }).lean();
    const last = (lastUnknown ?? null) as unknown as { order?: number } | null;
    const newOrder = typeof last?.order === 'number' ? last.order + 1 : 1;

    // Legacy-Alias: 'snake' => 'minigame' (intern bevorzugt)
    if (finalType === 'snake') {
      // @ts-ignore – finalType ist string
      finalType = 'minigame';
    }
    const isChoice = typeof finalType === 'string' && finalType.includes('choice');
    const isMatching = finalType === 'matching';
    const isMemory = finalType === 'memory';
    const isLueckentext = finalType === 'lueckentext';
    const isTextAnswer = finalType === 'text-answer';
    const isOrdering = finalType === 'ordering';

    // Text-Answer: jetzt Multi-Block Format { raw, blocks:[{question,answers[],media?}], caseSensitive, allowReveal, (legacy question/answer) }
    if (isTextAnswer) {
      const rawContent = (body.content || {}) as any;
      const raw = String(rawContent.raw || '').replace(/\r/g,'');
      const caseSensitive = !!rawContent.caseSensitive;
      const allowReveal = !!rawContent.allowReveal;
      const blocks = Array.isArray(rawContent.blocks) ? rawContent.blocks : (() => {
        // Fallback: falls nur question/answer kam
        const q = String(rawContent.question||'').trim();
        const a = String(rawContent.answer||'').trim();
        if (q && a) return [{ question: q, answers: [a] }];
        return [];
      })();
      const sanitized = blocks.filter((b: any) => b && typeof b.question === 'string' && Array.isArray(b.answers) && b.answers.length>0)
  .map((b: any) => ({
        question: String(b.question).trim(),
        answers: b.answers.map((a:any)=>String(a).trim()).filter((a:string)=>a.length>0),
        media: b.media && typeof b.media === 'string' ? String(b.media).trim() : undefined
      }))
        .slice(0,50);
      if (!sanitized.length) {
        return NextResponse.json({ success: false, error: 'Mindestens ein gültiger Fragenblock erforderlich' }, { status: 400 });
      }
      finalContent = { raw, blocks: sanitized, caseSensitive, allowReveal, question: sanitized[0].question, answer: sanitized[0].answers[0] };
    }

    // Ordering: content = { items: [...], shuffledExample? optional }
    if (isOrdering) {
      const rawText = (typeof body.content === 'object' && body.content && (body.content as any).raw) || (body as any).raw || '';
      const rawItems = (typeof body.content === 'object' && body.content && (body.content as any).items) || (body as any).items || [];
      const itemsSource = Array.isArray(rawItems) && rawItems.length ? rawItems : String(rawText || '').split(/\n/);
      const items = Array.isArray(itemsSource) ? itemsSource.map((v: unknown) => String(v||'').trim()).filter((v: string) => v.length>0).slice(0,10) : [];
      if (items.length < 2) {
        return NextResponse.json({ success: false, error: 'Mindestens 2 Schritte für ordering erforderlich' }, { status: 400 });
      }
      finalContent = { items, count: items.length, raw: rawText };
    }

    const newLessonDoc = new Lesson({
      title: finalTitle,
      type: finalType,
      questions: (isChoice || isMatching ? finalQuestions : undefined),
      content: ((isChoice || isMatching) ? undefined : (finalContent || {})),
      courseId,
  category: (course as any).category,
      order: newOrder
    });

    try {
      const savedLesson = await newLessonDoc.save();
      // Audit protokollieren (Fehler ignorieren)
      try {
        await AuditLog.create({
          action: 'lesson.create',
          user: username,
            targetType: 'lesson',
          targetId: String(savedLesson._id),
          courseId,
          meta: { type: finalType }
        });
      } catch (e) { console.warn('AuditLog lesson.create fehlgeschlagen', e); }
      return NextResponse.json({ success: true, lesson: savedLesson });
    } catch (e: unknown) {
      const dev = process.env.NODE_ENV !== 'production';
      const err = (e ?? {}) as { message?: string; errors?: unknown; name?: string };
      console.error('Validation/Speicher-Fehler:', err?.message, err?.errors);
      return NextResponse.json({ success: false, error: 'Validierungsfehler beim Speichern', details: err?.message, ...(dev ? { fields: err?.errors, name: err?.name } : {}) }, { status: 400 });
    }
  } catch (error: unknown) {
    const dev = process.env.NODE_ENV !== 'production';
    const details = error instanceof Error ? error.message : undefined;
    console.error('Fehler beim Erstellen:', details);
    return NextResponse.json({ success: false, error: 'Fehler beim Erstellen', ...(dev ? { details } : {}) }, { status: 500 });
  }

  // (Erreicht nie: Rückgaben erfolgen innerhalb try/catch)
}

// Hilfsfunktion für YouTube-URL/ID im API-Kontext
function extractYouTubeIdForApi(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', '') || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    if (m) return m[1];
    return null;
  } catch {
    // erlauben auch direkte ID
    if (/^[a-zA-Z0-9_-]{6,}$/.test(url)) return url;
    return null;
  }
}
