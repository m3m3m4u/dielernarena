import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Lesson from "@/models/Lesson";
import Course from "@/models/Course";
import User from "@/models/User";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { parseMemory } from '@/lib/memory';
import { parseLueckentext } from '@/lib/lueckentext';
import AuditLog from '@/models/AuditLog';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ courseId: string; lessonId: string }> }
) {
  try {
    const { courseId, lessonId } = await context.params;
    await dbConnect();
    
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return NextResponse.json(
        { success: false, error: "Lektion nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      lesson: lesson
    });

  } catch (error: unknown) {
    console.error("Fehler beim Laden der Lektion:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Laden der Lektion" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ courseId: string; lessonId: string }> }
) {
  try {
    const { courseId, lessonId } = await context.params;
    await dbConnect();
    
  const body = await request.json();
  const { title, type: typeRaw, category } = (body || {}) as { title?: string; type?: string; category?: string };
  // Legacy-Alias: snake/minigame vereinheitlichen
  const type = typeRaw === 'snake' ? 'minigame' : typeRaw;

    // Sicherstellen, dass die Lektion zum Kurs gehört
    const existing = await Lesson.findOne({ _id: lessonId, courseId });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Lektion nicht gefunden" },
        { status: 404 }
      );
    }

  // Sonderfall: Nur Kategorie soll aktualisiert werden (kein anderer Key außer category)
  const bodyKeys = Object.keys(body || {});
  const categoryOnly = body && bodyKeys.length > 0 && bodyKeys.every(k => ['category'].includes(k));

    const update: Record<string, unknown> = { title, type, updatedAt: new Date() };
    if (typeof category === 'string' && category.trim().length > 0) {
      update.category = category.trim();
    }

    // Autorisierung: Nur Kurs-Autor oder globale Rolle author; für exercise-pool entfällt Kurs-Existenzprüfung
    const sessionUpdate = await getServerSession(authOptions);
    if (!sessionUpdate?.user) {
      return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    }
    const userRole = (sessionUpdate.user as any).role;
    const userName = (sessionUpdate.user as any).username;
    let courseAuthorMatch = false;
    if (courseId === 'exercise-pool') {
      // Standalone Übung: erlaube Speichern wenn Rolle author oder (konservativ) irgendein eingeloggter Nutzer mit Rolle author
      courseAuthorMatch = userRole === 'author';
      if (!courseAuthorMatch) {
        return NextResponse.json({ success: false, error: 'Keine Berechtigung (exercise-pool)' }, { status: 403 });
      }
    } else {
      try {
        const course = await Course.findById(courseId).lean();
        if (!course) {
          return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
        }
        courseAuthorMatch = course.author === userName || userRole === 'author';
        if (!courseAuthorMatch) {
          return NextResponse.json({ success: false, error: 'Keine Berechtigung diese Lektion zu ändern' }, { status: 403 });
        }
      } catch (e) {
        return NextResponse.json({ success: false, error: 'Kursprüfung fehlgeschlagen' }, { status: 500 });
      }
    }

    if (categoryOnly) {
      if (typeof category === 'string' && category.trim().length > 0) {
        existing.category = category.trim();
      } else {
        existing.category = undefined;
      }
      existing.updatedAt = new Date();
      await existing.save();
      try { await AuditLog.create({ action: 'lesson.update.category', user: userName, targetType: 'lesson', targetId: String(existing._id), courseId, meta: { category: existing.category || null } }); } catch {}
      return NextResponse.json({ success: true, message: 'Kategorie aktualisiert', lesson: existing });
    }

    if (!title || !type) {
      return NextResponse.json(
        { success: false, error: 'Unvollständige Lektionsdaten (title/type fehlen)' },
        { status: 400 }
      );
    }

  if (type === 'single-choice') {
      const questions = (body as { questions?: unknown[] }).questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json(
          { success: false, error: "Für Single-Choice sind Fragen erforderlich" },
          { status: 400 }
        );
      }
      // Normalisieren: allAnswers sicherstellen
      const normalized = questions.map((qUnknown) => {
        const q = (qUnknown ?? {}) as {
          question?: string; mediaLink?: string; correctAnswer?: string;
          wrongAnswers?: string[]; allAnswers?: string[];
        };
        const wrong = Array.isArray(q.wrongAnswers) ? q.wrongAnswers : [];
        const all = Array.isArray(q.allAnswers) && q.allAnswers.length
          ? q.allAnswers
          : [q.correctAnswer ?? '', ...wrong].filter(Boolean);
        return {
          question: q.question ?? '',
          mediaLink: q.mediaLink,
          correctAnswer: q.correctAnswer ?? '',
          wrongAnswers: wrong,
          allAnswers: all,
        };
      });
      update.questions = normalized;
      update.content = {}; // Single-Choice hat keinen freien content
    } else if (type === 'multiple-choice') {
      const questions = (body as { questions?: unknown[] }).questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json(
          { success: false, error: "Für Multiple-Choice sind Fragen erforderlich" },
          { status: 400 }
        );
      }
      // Validieren & normalisieren: mindestens eine richtige, >=2 Antworten gesamt
      const normalized = questions.map((qUnknown, idx: number) => {
        const q = (qUnknown ?? {}) as {
          question?: string; mediaLink?: string;
          correctAnswer?: string; correctAnswers?: string[];
          wrongAnswers?: string[]; allAnswers?: string[];
        };
        const corrList: string[] = Array.isArray(q.correctAnswers) && q.correctAnswers.length
          ? q.correctAnswers.filter((a) => typeof a === 'string' && a.trim().length > 0)
          : (q.correctAnswer ? [q.correctAnswer] : []);
        const wrong = Array.isArray(q.wrongAnswers)
          ? q.wrongAnswers.filter((a) => typeof a === 'string' && a.trim().length > 0)
          : [];
        // allAnswers bevorzugt übernehmen, sonst aus correct+wrong bauen
        const providedAll = Array.isArray(q.allAnswers) ? q.allAnswers : [];
        const builtAll = [...corrList, ...wrong];
        // Eindeutig + getrimmt
        const uniq = (arr: string[]) => Array.from(new Set(arr.map((a) => String(a).trim()))).filter(Boolean);
        const all = uniq((providedAll.length ? providedAll : builtAll));
        // Validierung pro Frage
        if (corrList.length < 1) {
          throw new Error(`Frage ${idx + 1}: Mindestens eine richtige Antwort ist erforderlich.`);
        }
        if (all.length < 2) {
          throw new Error(`Frage ${idx + 1}: Mindestens zwei Antwortoptionen sind erforderlich.`);
        }
        // Sicherstellen, dass alle correctAnswers in allAnswers enthalten sind
        const missing = corrList.filter(a => !all.includes(a));
        if (missing.length > 0) {
          throw new Error(`Frage ${idx + 1}: Folgende richtige Antworten fehlen in allAnswers: ${missing.join(', ')}`);
        }
        // wrongAnswers aus all ableiten falls nicht eindeutig
        const normalizedWrong = all.filter(a => !corrList.includes(a));
        return {
          question: q.question ?? '',
          mediaLink: q.mediaLink,
          // Für Abwärtskompatibilität eine Einzelantwort setzen (erste richtige), falls vorhanden
          correctAnswer: corrList[0] || '',
          correctAnswers: corrList,
          wrongAnswers: normalizedWrong,
          allAnswers: all,
        };
      });
      update.questions = normalized;
      update.content = {}; // Multiple-Choice hat keinen freien content
    } else if (type === 'markdown') {
      const contentObj = (body as { content?: { markdown?: string } }).content;
      const markdown = contentObj?.markdown;
      if (typeof markdown !== 'string' || markdown.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "Für Markdown-Lektionen ist content.markdown erforderlich" },
          { status: 400 }
        );
      }
      update.content = { markdown };
      update.questions = []; // Fragen leeren, falls vorher vorhanden
    } else if (type === 'matching') {
      const text = (body as { text?: string; content?: { text?: string } }).text
        || (body as { content?: { text?: string } }).content?.text
        || '';
      // Mehrere Aufgaben-Blöcke unterstützen
      const blocks = text.trim().split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
      const isMedia = (s: string) => /\.(jpg|jpeg|png|gif|webp|mp3|wav|ogg|m4a)$/i.test(s) || /^https?:\/\//i.test(s);
      const questions = blocks.map((block) => {
        const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 5);
        const pairs = lines.map((line) => {
          const [rawL, rawR] = line.split('|');
          const l = (rawL || '').trim();
          const r = (rawR || '').trim();
          const leftMedia = isMedia(l) ? l : undefined;
          const rightMedia = isMedia(r) ? r : undefined;
          return { left: l, right: r, leftMedia, rightMedia };
        }).filter(p => p.left && p.right);
        return pairs;
      }).filter(pairs => pairs.length >= 2);

      if (questions.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Mindestens 2 Paare pro Aufgabe (Block) erforderlich' },
          { status: 400 }
        );
      }

      const shuffle = <T,>(arr: T[]) => arr.map(v => [Math.random(), v] as const).sort((a,b) => a[0]-b[0]).map(([,v]) => v);
      update.questions = questions.map((pairs) => {
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
        };
      });
      update.content = {}; // eigener Fragenstil
    } else if (type === 'video') {
      const contentObj = (body as { content?: { youtubeUrl?: string; url?: string; text?: string } }).content || {};
      const rawUrl = contentObj.youtubeUrl || contentObj.url || '';
      const url = String(rawUrl || '').trim();
      const text = String(contentObj.text || '');
      const videoId = extractYouTubeIdForApi(url);
      if (!url || !videoId) {
        return NextResponse.json(
          { success: false, error: 'Ungültiger YouTube-Link. Erlaubt sind z.B. https://www.youtube.com/watch?v=ID oder https://youtu.be/ID' },
          { status: 400 }
        );
      }
      update.content = { youtubeUrl: url, text };
      update.questions = []; // keine Fragen für diesen Typ
    } else if (type === 'memory') {
      const rawText = (body as { text?: string; content?: { text?: string; raw?: string } }).text
        || (body as { content?: { text?: string; raw?: string } }).content?.text
        || (body as { content?: { text?: string; raw?: string } }).content?.raw
        || '';
      const { pairs, errors: memErrors } = parseMemory(rawText);
      if (memErrors.length) {
        return NextResponse.json({ success: false, error: 'Memory Validation fehlgeschlagen', details: memErrors }, { status: 400 });
      }
      update.content = { raw: rawText, pairs };
      update.questions = [];
    } else if (type === 'lueckentext') {
      const contentObj = (body as { content?: { markdown?: string; mode?: string } }).content || {};
      const md = String(contentObj.markdown || '').trim();
      const modeRaw = String(contentObj.mode || 'input');
      const mode = modeRaw === 'drag' ? 'drag' : 'input';
      const { parsed, errors: ltErrors } = parseLueckentext(md, mode);
      if (ltErrors.length) {
        return NextResponse.json({ success: false, error: 'Lückentext Validation fehlgeschlagen', details: ltErrors }, { status: 400 });
      }
      update.content = parsed;
      update.questions = [];
    } else if (type === 'ordering') {
  const rawText = (body as any)?.content?.raw || (body as any).raw || '';
  const rawItems = (body as any)?.content?.items || (body as any).items || [];
  const itemsSource = Array.isArray(rawItems) && rawItems.length ? rawItems : String(rawText||'').split(/\n/);
  const items = Array.isArray(itemsSource) ? itemsSource.map((v: unknown) => String(v||'').trim()).filter((v: string) => v.length>0).slice(0,10) : [];
      if (items.length < 2) {
        return NextResponse.json({ success: false, error: 'Mindestens 2 Schritte erforderlich' }, { status: 400 });
      }
  update.content = { items, count: items.length, raw: rawText };
      update.questions = [];
    } else if (type === 'snake' || type === 'minigame') {
      // Vereinfachte Snake-Konfiguration (Fragenblöcke + Zielscore + Difficulty + initialSpeedMs)
      const contentObj = (body as { content?: any }).content || {};
      // Typ immer kanonisch als 'minigame' speichern
      update.type = 'minigame';
    const targetScore = Number(contentObj.targetScore) || Number(contentObj.content?.targetScore) || 10;
      const difficultyRaw = String(contentObj.difficulty || '').toLowerCase();
      const difficulty: 'einfach'|'mittel'|'schwer' = difficultyRaw === 'schwer' ? 'schwer' : (difficultyRaw === 'einfach' ? 'einfach' : 'mittel');
      const providedSpeed = Number(contentObj.initialSpeedMs);
      const initialSpeedMs = providedSpeed > 0 ? providedSpeed : (difficulty === 'schwer' ? 140 : (difficulty === 'einfach' ? 220 : 180));
      const rawBlocks = Array.isArray(contentObj.blocks) ? contentObj.blocks : [];
      const blocks = rawBlocks
        .filter((b: any) => b && typeof b.question === 'string' && Array.isArray(b.answers) && typeof b.correct === 'number')
        .map((b: any) => ({
          question: String(b.question).trim(),
          answers: b.answers.slice(0,4).map((a:any)=>String(a).trim()).filter((a:string)=>a.length>0),
          correct: Math.min(Math.max(0, Number(b.correct)||0), 3)
        }))
        .filter((b: any) => b.question && b.answers.length >= 2 && b.correct < b.answers.length)
        .slice(0,50);
  update.content = { targetScore, difficulty, initialSpeedMs, ...(blocks.length ? { blocks } : {}) };
      // Optional: mitgesendete Fragen übernehmen oder aus blocks ableiten
      const providedQuestions = (body as { questions?: unknown[] }).questions;
      if (Array.isArray(providedQuestions) && providedQuestions.length) {
        const toText = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
        const uniq = (arr: string[]) => Array.from(new Set((arr || []).map(a => toText(a).trim()))).filter(Boolean);
        update.questions = (providedQuestions as unknown[]).map((qUnknown) => {
          const q = (qUnknown ?? {}) as Record<string, unknown>;
          const question = toText(q.question).trim();
          const mediaLink = (q.mediaLink as string) || (q.media as string) || undefined;
          const corrects = Array.isArray(q.correctAnswers) && q.correctAnswers.length
            ? uniq((q.correctAnswers as unknown[]).map(toText))
            : (q.correctAnswer ? [toText(q.correctAnswer).trim()] : []);
          const providedAll = Array.isArray(q.allAnswers) ? (q.allAnswers as unknown[]) : [];
          const wrongRaw = Array.isArray(q.wrongAnswers) ? (q.wrongAnswers as unknown[]) : [];
          const all = uniq((providedAll.length ? providedAll : [...corrects, ...wrongRaw.map(toText)]).map(toText));
          const wrong = all.filter(a => !corrects.includes(a));
          return { question, mediaLink, correctAnswer: corrects[0] || undefined, correctAnswers: corrects.length>1?corrects:undefined, wrongAnswers: wrong, allAnswers: all };
        });
      } else if (blocks.length) {
        update.questions = blocks.map((b: any) => ({ question: b.question, mediaLink: undefined, correctAnswer: b.answers[b.correct], correctAnswers: [b.answers[b.correct]], wrongAnswers: b.answers.filter((a: string, i: number) => i !== b.correct), allAnswers: b.answers }));
      } else {
        update.questions = [];
      }
    } else if (type === 'text-answer') {
      const contentObj = (body as { content?: any }).content || {};
      const raw = String(contentObj.raw || '').replace(/\r/g,'');
      const caseSensitive = !!contentObj.caseSensitive;
      const allowReveal = !!contentObj.allowReveal;
      const blocksRaw = Array.isArray(contentObj.blocks) ? contentObj.blocks : [];
      let blocks = blocksRaw.filter((b: any) => b && typeof b.question === 'string' && Array.isArray(b.answers) && b.answers.length>0)
        .map((b: any) => ({
          question: String(b.question).trim(),
          answers: b.answers.map((a:any)=>String(a).trim()).filter((a:string)=>a.length>0),
          media: b.media && typeof b.media === 'string' ? String(b.media).trim() : undefined
        }))
        .slice(0,50);
      if (!blocks.length) {
        // Fallback Legacy
        const q = String(contentObj.question||'').trim();
        const a = String(contentObj.answer||'').trim();
        if (q && a) blocks = [{ question: q, answers: [a] }];
      }
      if (!blocks.length) {
        return NextResponse.json({ success: false, error: 'Mindestens ein gültiger Fragenblock erforderlich' }, { status: 400 });
      }
      update.content = { raw, blocks, caseSensitive, allowReveal, question: blocks[0].question, answer: blocks[0].answers[0] };
      update.questions = [];
    } else {
      // Andere Typen aktuell nicht unterstützt in diesem Editor
      return NextResponse.json(
        { success: false, error: `Aktualisierung für Typ "${type}" nicht unterstützt` },
        { status: 400 }
      );
    }

  const updatedLesson = await Lesson.findOneAndUpdate(
      { _id: lessonId, courseId },
      update,
      { new: true }
    );

    if (updatedLesson) {
      try {
        await AuditLog.create({ action: 'lesson.update', user: userName, targetType: 'lesson', targetId: String(updatedLesson._id), courseId, meta: { type } });
      } catch (e) { console.warn('AuditLog lesson.update fehlgeschlagen', e); }
      return NextResponse.json({
        success: true,
        message: "Lektion erfolgreich aktualisiert",
        lesson: updatedLesson
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Fehler beim Aktualisieren" },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error("Fehler beim Aktualisieren der Lektion:", error);
    const msg = error instanceof Error ? error.message : 'Fehler beim Aktualisieren der Lektion';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ courseId: string; lessonId: string }> }
) {
  try {
    const { courseId, lessonId } = await context.params;
    await dbConnect();
    
    // Autorisierung
  const sessionDel = await getServerSession(authOptions);
  if (!sessionDel?.user) {
      return NextResponse.json({ success: false, error: 'Nicht authentifiziert' }, { status: 401 });
    }
    const userRoleDel = (sessionDel.user as any).role;
    const userNameDel = (sessionDel.user as any).username;
    const courseDel = await Course.findById(courseId).lean();
    if (!courseDel) {
      return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
    }
    if (courseDel.author !== userNameDel && userRoleDel !== 'author') {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung diese Lektion zu löschen' }, { status: 403 });
    }
    // Lektion finden und löschen
    const lesson = await Lesson.findOne({ _id: lessonId, courseId });
    if (!lesson) {
      return NextResponse.json(
        { success: false, error: "Lektion nicht gefunden" },
        { status: 404 }
      );
    }

    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);

    if (deletedLesson) {
      // Fortschritt bereinigen (beide mögliche Formate: lessonId oder courseId-lessonId)
      const key1 = String(lessonId);
      const key2 = `${courseId}-${lessonId}`;
      try {
        await User.updateMany(
          { completedLessons: { $in: [key1, key2] } },
          { $pull: { completedLessons: { $in: [key1, key2] } } }
        );
      } catch (cleanupErr) {
        console.warn('Fortschritt-Bereinigung fehlgeschlagen (Lesson Delete):', cleanupErr);
      }
      try {
        await AuditLog.create({ action: 'lesson.delete', user: userNameDel, targetType: 'lesson', targetId: String(deletedLesson._id), courseId });
      } catch (e) { console.warn('AuditLog lesson.delete fehlgeschlagen', e); }
      return NextResponse.json({
        success: true,
        message: "Lektion erfolgreich gelöscht",
        lesson: deletedLesson
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Fehler beim Löschen" },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error("Fehler beim Löschen der Lektion:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Löschen der Lektion" },
      { status: 500 }
    );
  }
}

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
    if (/^[a-zA-Z0-9_-]{6,}$/.test(url)) return url;
    return null;
  }
}
