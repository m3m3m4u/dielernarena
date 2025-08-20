"use client";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from 'next-auth/react';
// Ausgelagerte Lektionstyp-Komponenten (schrittweises Refactoring)
import { MarkdownLesson, YouTubeLesson, MemoryGame, LueckentextPlayer, OrderingPlayer, MatchingUI, LessonFooterNavigation, SnakeGame } from '../../../../../components/lessonTypes';
import { finalizeLesson } from '../../../../../lib/lessonCompletion';
import type { Lesson, Question } from '../../../../../components/lessonTypes/types';
import { resolveMediaPath, isImagePath, isAudioPath } from '../../../../../lib/media';


export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const lessonId = params.lessonId as string;
  const { data: session } = useSession();
  
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setCurrentQuestionIndex] = useState(0); // DEPRECATED (für alte Logik)
  const [questionQueue, setQuestionQueue] = useState<number[]>([]); // Reihenfolge offener Fragen
  const [mastered, setMastered] = useState<Set<number>>(new Set()); // korrekt beantwortete Fragen
  const [marking, setMarking] = useState(false); // Server-Update Status
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  // Neu: Auswahl für Multiple-Choice
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]); // für Footer-Navigation
  const [progressionMode, setProgressionMode] = useState<'linear'|'free'>('free');
  const [completedLessons, setCompletedLessons] = useState<string[]>([]); // erledigte Lektionen
  // Wohin zurück? Kurs oder Übungsmenü
  const [backHref, setBackHref] = useState<string>(`/kurs/${courseId}`);
  // Lückentext States (immer aufrufen, nicht konditional)
  const [ltAnswersState, setLtAnswersState] = useState<Record<number, string>>({});
  const [ltChecked, setLtChecked] = useState(false);
  const [ltCorrectAll, setLtCorrectAll] = useState(false);
  const [ltUsedAnswers, setLtUsedAnswers] = useState<string[]>([]);
  const [ltFocusGap, setLtFocusGap] = useState<number | null>(null);
  // Lückentext derived Daten (immer Hooks gleich halten)
  const ltMasked = useMemo(() => (lesson?.type === 'lueckentext') ? String((lesson?.content as any)?.markdownMasked || '') : '', [lesson]);
  const ltGaps = useMemo(() => (lesson?.type === 'lueckentext') ? (Array.isArray((lesson?.content as any)?.gaps) ? (lesson?.content as any).gaps.map((g: any) => ({ id: g.id, answer: String(g.answer) })) : []) : [], [lesson]);
  const ltMode: 'input' | 'drag' = (lesson?.type === 'lueckentext' && (lesson?.content as any)?.mode === 'drag') ? 'drag' : 'input';
  const ltParts = useMemo(() => ltMasked ? ltMasked.split(/(___\d+___)/g).filter(Boolean) : [], [ltMasked]);
  const ltBank = useMemo(() => {
    if (ltMode !== 'drag') return [] as string[];
    const shuffle = <T,>(arr: T[]) => arr.map(v => [Math.random(), v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
    return shuffle(ltGaps.map((g: { id: number; answer: string }) => g.answer));
  }, [ltMode, ltGaps]);
  useEffect(() => {
    // Reset bei Lektionstyp-Wechsel
    if (lesson?.type === 'lueckentext') {
      setLtAnswersState({});
      setLtChecked(false);
      setLtCorrectAll(false);
      setLtUsedAnswers([]);
      setLtFocusGap(null);
    }
  }, [lesson?._id, lesson?.type]);

  const loadLesson = useCallback(async () => {
    try {
  const response = await fetch(`/api/kurs/${courseId}/lektionen`);
  if (response.ok) {
        const payload = await response.json();
        const lessonArray = Array.isArray(payload) ? payload : (payload.lessons || []);
        setAllLessons(lessonArray);
        // progressionMode vom Kurs laden (jetzt meist in der Antwort enthalten)
        if (payload.course && payload.course.progressionMode) {
          setProgressionMode(payload.course.progressionMode === 'linear' ? 'linear' : 'free');
        } else {
          setProgressionMode('free');
        }
        // Back-Ziel bestimmen: wenn exercise-pool oder kein echter Kurs -> /ueben
        const isExercisePool = String(courseId) === 'exercise-pool';
        const hasRealCourse = !!(payload.course && (payload.course._id || payload.course.id || payload.course.key));
        setBackHref(isExercisePool || !hasRealCourse ? '/ueben' : `/kurs/${courseId}`);
        let foundLesson = (lessonArray as Array<{ _id?: string; id?: string }>).find((l) => l._id === lessonId || l.id === lessonId) as any;
        if (!foundLesson) {
          // Fallback: Direkt über globalen Endpoint laden (für exercise-pool oder abweichende Organisation)
          try {
            const lr = await fetch(`/api/lessons/${lessonId}`);
            if (lr.ok) {
              const ld = await lr.json();
              if (ld?.lesson) {
                foundLesson = ld.lesson;
                setAllLessons([ld.lesson]);
                setBackHref('/ueben');
              }
            }
          } catch {}
        }
        if (foundLesson) setLesson(foundLesson as unknown as Lesson);
        if (foundLesson) {
          // Initial Queue setzen
          const total = (foundLesson as unknown as { questions?: unknown[] }).questions?.length || 0;
          setQuestionQueue(Array.from({ length: total }, (_, i) => i));
          setMastered(new Set());
          setScore(0);
          setCompleted(false);
          setCurrentQuestionIndex(0); // legacy
          // In-Progress markieren falls noch nicht abgeschlossen
          try {
            const completedKey = `course:${courseId}:completedLessons`;
            const inProgressKey = `course:${courseId}:inProgressLessons`;
            const completedStored: string[] = JSON.parse(localStorage.getItem(completedKey) || '[]');
            const foundId = (foundLesson as { _id?: string; id?: string })._id || (foundLesson as { _id?: string; id?: string }).id;
            if (foundId && !completedStored.includes(foundId)) {
              const inProg: string[] = JSON.parse(localStorage.getItem(inProgressKey) || '[]');
              if (!inProg.includes(foundId)) {
                const updated = [...inProg, foundId];
                localStorage.setItem(inProgressKey, JSON.stringify(updated));
              }
            }
          } catch {}
        }
      } else {
        // Harte Fallback-Strategie: direkt per ID laden (z. B. exercise-pool oder Kurs-Fetch-Problem)
        try {
          const lr = await fetch(`/api/lessons/${lessonId}`);
          if (lr.ok) {
            const ld = await lr.json();
            if (ld?.lesson) {
              setLesson(ld.lesson as any);
              setAllLessons([ld.lesson]);
              setProgressionMode('free');
              setBackHref('/ueben');
            }
          }
        } catch {}
      }
      setLoading(false);
    } catch (error) {
      console.error('Fehler beim Laden der Lektion:', error);
      // Letzter Versuch: Direkt per ID
      try {
        const lr = await fetch(`/api/lessons/${lessonId}`);
        if (lr.ok) {
          const ld = await lr.json();
          if (ld?.lesson) {
            setLesson(ld.lesson as any);
            setAllLessons([ld.lesson]);
            setProgressionMode('free');
            setBackHref('/ueben');
          }
        }
      } catch {}
      setLoading(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  // Zuletzt weitergemacht (für Dashboard): beim Öffnen merken
  useEffect(() => {
    try {
      if (courseId) localStorage.setItem('last:courseId', String(courseId));
      if (lessonId) localStorage.setItem('last:lessonId', String(lessonId));
      if (courseId) localStorage.setItem(`course:${courseId}:lastTouched`, String(Date.now()));
    } catch {}
  }, [courseId, lessonId]);

  // Helper zum Normalisieren von Antworten (früher vorhanden, wiederhergestellt)
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim() : String(s ?? ''));

  const handleAnswerSelect = (answer: string) => {
    if (showResult) return;
    if (lesson?.type === 'multiple-choice') {
      setSelectedAnswers(prev => prev.includes(answer) ? prev.filter(a => a !== answer) : [...prev, answer]);
      return;
    }
    setSelectedAnswer(answer);
    if (!lesson || !lesson.questions || questionQueue.length === 0) return;
    const currentQuestion = lesson.questions[questionQueue[0]];
    const correct = norm(answer) === norm(currentQuestion.correctAnswer);
    setIsCorrect(correct);
    setShowResult(true);
    if (correct && !mastered.has(questionQueue[0])) {
      setScore(prev => prev + 1);
    }
  };

  const handleCheckMultiple = () => {
    if (!lesson || !lesson.questions || questionQueue.length === 0) return;
    const currentQuestion = lesson.questions[questionQueue[0]] as Question;
    const correctList = (Array.isArray(currentQuestion.correctAnswers) && currentQuestion.correctAnswers.length
      ? currentQuestion.correctAnswers
      : (currentQuestion.correctAnswer ? [currentQuestion.correctAnswer] : [])).map(norm);
    const selNorm = selectedAnswers.map(norm);
    const isSetEqual = selNorm.length === correctList.length && correctList.every(a => selNorm.includes(a));
    setIsCorrect(isSetEqual);
    setShowResult(true);
    if (isSetEqual && !mastered.has(questionQueue[0])) {
      setScore(prev => prev + 1);
    }
  };

  // Multi Text-Antwort States
  const [textAnswerInput, setTextAnswerInput] = useState('');
  const [textAnswerFeedback, setTextAnswerFeedback] = useState<string | null>(null);
  const [textAnswerQueue, setTextAnswerQueue] = useState<number[]>([]); // Index-Reihenfolge der noch offenen Blöcke
  const [textAnswerSolved, setTextAnswerSolved] = useState<Set<number>>(new Set());
  const [textAnswerRevealed, setTextAnswerRevealed] = useState<Set<number>>(new Set()); // Gesamt-Flag (Analytics)
  const [textAnswerRevealRound, setTextAnswerRevealRound] = useState<Record<number, number>>({}); // index -> Runde
  const [textAnswerRound, setTextAnswerRound] = useState(1);
  const [textAnswerJustRevealedIdx, setTextAnswerJustRevealedIdx] = useState<number | null>(null);
  const textAnswerBlocks = useMemo(() => {
    if (!lesson || lesson.type !== 'text-answer') return [] as Array<{ question: string; answers: string[]; media?: string }>;
    const c: any = lesson.content || {};
    if (Array.isArray(c.blocks)) {
      return c.blocks.filter((b: any) => b && typeof b.question === 'string' && Array.isArray(b.answers) && b.answers.length>0)
        .map((b: any) => ({ question: String(b.question), answers: b.answers.map((a: any)=>String(a)).filter((a:string)=>a.length>0), media: b.media && String(b.media) }));
    }
    if (c.question && c.answer) return [{ question: String(c.question), answers: [String(c.answer)] }];
    return [];
  }, [lesson]);
  // Initial Queue setzen wenn Blocks geladen
  useEffect(()=>{
    if (lesson?.type === 'text-answer') {
  setTextAnswerQueue(textAnswerBlocks.map((_: unknown, i: number)=>i));
      setTextAnswerSolved(new Set());
      setTextAnswerRevealed(new Set());
  setTextAnswerRound(1);
  setTextAnswerRevealRound({});
      setTextAnswerInput('');
      setTextAnswerFeedback(null);
    }
  }, [lesson?._id, lesson?.type, textAnswerBlocks.length]);
  const submitTextAnswer = useCallback(() => {
    if (!lesson || lesson.type !== 'text-answer') return;
    if (!textAnswerBlocks.length || !textAnswerQueue.length) return;
    const c: any = lesson.content || {};
    const caseSensitive: boolean = !!c.caseSensitive;
    const normalize = (s: string) => caseSensitive ? s.trim() : s.trim().toLowerCase();
    const currentIndex = textAnswerQueue[0];
    const current = textAnswerBlocks[currentIndex];
    const userNorm = normalize(textAnswerInput);
    if (!userNorm) { setTextAnswerFeedback('Bitte etwas eingeben.'); return; }
    const correctNorms = current.answers.map((a: string)=>normalize(a));
    if (correctNorms.includes(userNorm)) {
      setTextAnswerFeedback('✅ Korrekt!');
      setTimeout(()=>{
        setTextAnswerSolved(prev => new Set(prev).add(currentIndex));
        setTextAnswerInput('');
        setTextAnswerFeedback(null);
        // Nächste Frage
        setTextAnswerQueue(prev => prev.slice(1));
      }, 400);
      return;
    }
    setTextAnswerFeedback('❌ Nicht korrekt.');
  }, [lesson, textAnswerBlocks, textAnswerQueue, textAnswerInput]);
  const revealCurrentTextAnswer = () => {
    if (!lesson || lesson.type !== 'text-answer') return;
    if (!textAnswerQueue.length) return;
    const idx = textAnswerQueue[0];
    setTextAnswerRevealed(prev => new Set(prev).add(idx));
    setTextAnswerRevealRound(prev => ({ ...prev, [idx]: textAnswerRound }));
    setTextAnswerFeedback('🛈 Antwort eingeblendet. Später erneut beantworten.');
    setTextAnswerJustRevealedIdx(idx);
    setTextAnswerInput('');
  };
  const advanceAfterReveal = () => {
    if (textAnswerJustRevealedIdx == null) return;
    setTextAnswerQueue(prev => (prev[0] === textAnswerJustRevealedIdx ? prev.slice(1) : prev));
    setTextAnswerJustRevealedIdx(null);
    setTextAnswerFeedback(null);
  };
  // Wenn Queue leer aber noch nicht alle solved -> neue Runde mit nur ungelösten (reveal Fragen)
  useEffect(()=>{
    if (lesson?.type === 'text-answer' && textAnswerQueue.length === 0 && textAnswerBlocks.length) {
      const total = textAnswerBlocks.length;
      if (textAnswerSolved.size === total) {
        setCompleted(true);
      } else {
  const remaining = textAnswerBlocks.map((_: unknown, i: number)=>i).filter((i: number)=>!textAnswerSolved.has(i));
        setTextAnswerQueue(remaining);
        setTextAnswerRound(r=>r+1);
        setTextAnswerFeedback(null);
      }
    }
  }, [textAnswerQueue.length, textAnswerSolved, textAnswerBlocks, lesson]);

  // NEU: Abschluss + Stern für Text-Antwort Lektionen (bisher fehlte API-Aufruf)
  useEffect(() => {
    if (!lesson || lesson.type !== 'text-answer') return;
    const total = textAnswerBlocks.length;
    if (total === 0) return;
    if (textAnswerSolved.size === total && !completedLessons.includes(lesson._id)) {
      const username = session?.user?.username;
      if (!username) return;
      (async () => {
        try {
          await fetch('/api/lesson/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username,
              lessonId: lesson._id,
              courseId: lesson.courseId,
              type: lesson.type,
              earnedStar: true
            })
          }).catch(()=>{});
          await fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, lessonId: lesson._id })
          }).catch(()=>{});
          const completedKey = `course:${courseId}:completedLessons`;
          const inProgressKey = `course:${courseId}:inProgressLessons`;
          try {
            const stored = JSON.parse(localStorage.getItem(completedKey) || '[]');
            if (!stored.includes(lesson._id)) {
              const updated = [...stored, lesson._id];
              localStorage.setItem(completedKey, JSON.stringify(updated));
              setCompletedLessons(updated);
            }
            const inProg = JSON.parse(localStorage.getItem(inProgressKey) || '[]');
            if (Array.isArray(inProg) && inProg.includes(lesson._id)) {
              localStorage.setItem(inProgressKey, JSON.stringify(inProg.filter((id: string) => id !== lesson._id)));
            }
          } catch {}
        } catch (e) {
          console.error('Text-Antwort Abschluss fehlgeschlagen', e);
        }
      })();
    }
  }, [lesson, textAnswerSolved, textAnswerBlocks, completedLessons, session?.user?.username, courseId]);

  // Wiederhergestellt: Fortschrittslogik nach Bewertung
  const handleNextQuestion = () => {
    if (!lesson || questionQueue.length === 0) return;
    const currentIdx = questionQueue[0];
    let newQueue = [...questionQueue];
    if (isCorrect) {
      if (!mastered.has(currentIdx)) {
        const newMastered = new Set(mastered);
        newMastered.add(currentIdx);
        setMastered(newMastered);
      }
      newQueue.shift();
    } else {
      newQueue = [...newQueue.slice(1), currentIdx];
    }
    setQuestionQueue(newQueue);
    setSelectedAnswer("");
    setSelectedAnswers([]);
    setShowResult(false);
    if (newQueue.length === 0) {
      setCompleted(true);
      (async () => {
        try {
          const username = session?.user?.username;
          setMarking(true);
          await finalizeLesson({
            username, // optional für Gäste
            lessonId: lesson._id,
            courseId: lesson.courseId,
            type: lesson.type,
            earnedStar: lesson.type !== 'markdown' && !completedLessons.includes(lesson._id)
          });
          setCompletedLessons(prev => prev.includes(lesson._id) ? prev : [...prev, lesson._id]);
        } catch (e) {
          console.error('Abschließen fehlgeschlagen', e);
        } finally {
          setMarking(false);
        }
      })();
    } else {
      setCurrentQuestionIndex(newQueue[0]);
    }
  };

  const handleRetry = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer("");
    setShowResult(false);
    setScore(0);
    setCompleted(false);
    setSelectedAnswers([]);
  };

  useEffect(() => {
    // erledigte Lektionen aus localStorage laden
    const key = `course:${courseId}:completedLessons`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(stored)) setCompletedLessons(stored);
    } catch {}
  }, [courseId]);

  // (Entfernt) früherer Effekt für generisches Speichern bei completed -> Logik jetzt in finalizeLesson Stellen zentralisiert

  // Neu: Typen-Flags und Abschluss-Funktion für YouTube
  const isMarkdown = lesson?.type === 'markdown' && lesson.content?.markdown;
  const isVideo = lesson?.type === 'video';
  const isLueckentext = lesson?.type === 'lueckentext';
  const isOrdering = lesson?.type === 'ordering';
  const isSnake = lesson?.type === 'snake' || lesson?.type === 'minigame';
  const markVideoCompleted = useCallback(async () => {
    const username = session?.user?.username;
    if (!lesson) return;
    if (completedLessons.includes(lesson._id)) return;
    setMarking(true);
    try {
      await finalizeLesson({
        username, // optional für Gäste
        lessonId: lesson._id,
        courseId: lesson.courseId,
        type: lesson.type,
        earnedStar: lesson.type !== 'markdown' && !completedLessons.includes(lesson._id)
      });
      setCompletedLessons(prev => prev.includes(lesson._id) ? prev : [...prev, lesson._id]);
    } catch (e) {
      console.error('Video Abschluss fehlgeschlagen', e);
    } finally {
      setMarking(false);
    }
  }, [session?.user?.username, lesson, completedLessons, courseId]);

  // Abschluss Text-Antwort Lektion (centralized)
  useEffect(() => {
    if (!lesson || lesson.type !== 'text-answer') return;
    const total = textAnswerBlocks.length;
    if (total === 0) return;
    if (textAnswerSolved.size === total && !completedLessons.includes(lesson._id)) {
      const username = session?.user?.username;
      (async () => {
        try {
          await finalizeLesson({
            username, // optional für Gäste
            lessonId: lesson._id,
            courseId: lesson.courseId,
            type: lesson.type,
            earnedStar: lesson.type !== 'markdown' && !completedLessons.includes(lesson._id)
          });
          setCompletedLessons(prev => prev.includes(lesson._id) ? prev : [...prev, lesson._id]);
        } catch (e) {
          console.error('Text-Antwort Abschluss fehlgeschlagen', e);
        }
      })();
    }
  }, [lesson, textAnswerSolved, textAnswerBlocks, completedLessons, session?.user?.username, courseId]);

  // Early Returns jetzt NACH allen Hooks
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-10 p-6">
        <div className="text-center">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent text-blue-600 rounded-full"></div>
          <p className="mt-2 text-gray-600">Lektion wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="max-w-6xl mx-auto mt-10 p-6 bg-white rounded shadow">
        <h2 className="text-xl font-bold text-red-600">Lektion nicht gefunden</h2>
        <p className="text-gray-600 mt-2">Die angeforderte Lektion konnte nicht geladen werden.</p>
        <button onClick={() => router.push(backHref)} className="mt-4 text-blue-600 hover:underline">← {backHref === '/ueben' ? 'Zurück zu Übungen' : 'Zurück zum Kurs'}</button>
      </div>
    );
  }

  const totalQuestions = lesson.questions?.length || 0;
  const progress = totalQuestions > 0 ? (mastered.size / totalQuestions) * 100 : 0;
  const currentQuestion = lesson.questions && questionQueue.length > 0 ? lesson.questions[questionQueue[0]] : undefined;
  const currentMedia = currentQuestion?.mediaLink ? resolveMediaPath(String(currentQuestion.mediaLink)) : '';
  // Vorberechnete korrekte Antworten (normalisiert) für Anzeige/Checks
  const correctListNormalized = (currentQuestion && (Array.isArray(currentQuestion.correctAnswers) && currentQuestion.correctAnswers.length
    ? currentQuestion.correctAnswers
    : (currentQuestion?.correctAnswer ? [currentQuestion.correctAnswer] : [])).map(norm)) || [];

  // Snake frühe Rückgabe
  // Lock-Redirect bei linearer Progression: wenn vorherige Lektion nicht abgeschlossen
  if (lesson && progressionMode === 'linear') {
    const index = allLessons.findIndex(l => (l as any)._id === lesson._id || (l as any).id === lesson._id);
    if (index > 0) {
      const prev = allLessons[index - 1];
      const prevId = (prev as any)._id || (prev as any).id;
      if (prevId && !completedLessons.includes(prevId)) {
        // redirect zurück auf Kursseite
        if (typeof window !== 'undefined') {
          router.replace(`/kurs/${courseId}`);
        }
      }
    }
  }

  if (lesson && isSnake) {
  return (
      <div className="max-w-6xl mx-auto mt-10 p-6">
    <button onClick={() => router.push(backHref)} className="text-blue-600 hover:underline mb-4">← {backHref === '/ueben' ? 'Zurück zu Übungen' : 'Zurück zum Kurs'}</button>
        <h1 className="text-2xl font-bold mb-6">{lesson.title}</h1>
        <SnakeGame lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} />
  <LessonFooterNavigation allLessons={allLessons} currentLessonId={lessonId} courseId={courseId} completedLessons={completedLessons} progressionMode={progressionMode} backHref={backHref} />
      </div>
    );
  }

  // Render für Markdown-Lektion
  if (isMarkdown) {
  return (
      <div className="max-w-6xl mx-auto mt-10 p-6">
    <button onClick={() => router.push(backHref)} className="text-blue-600 hover:underline mb-4">← {backHref === '/ueben' ? 'Zurück zu Übungen' : 'Zurück zum Kurs'}</button>
        <h1 className="text-2xl font-bold mb-6">{lesson.title}</h1>
        <MarkdownLesson lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} sessionUsername={session?.user?.username} />
  <LessonFooterNavigation allLessons={allLessons} currentLessonId={lessonId} courseId={courseId} completedLessons={completedLessons} progressionMode={progressionMode} backHref={backHref} />
      </div>
    );
  }

  const isMultiple = lesson.type === 'multiple-choice';
  const isMatching = lesson.type === 'matching';
  const hasMemoryPairs = !!(lesson.content && (lesson.content as any).pairs && Array.isArray((lesson.content as any).pairs));
  const effectiveType = lesson.type === 'memory' || (lesson.type === 'matching' && hasMemoryPairs) ? 'memory' : lesson.type;
  const isMemory = effectiveType === 'memory';

  return (
  <div className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6">
        <button onClick={() => router.push(backHref)} className="text-blue-600 hover:underline mb-4">← {backHref === '/ueben' ? 'Zurück zu Übungen' : 'Zurück zum Kurs'}</button>
        <h1 className="text-2xl font-bold mb-2">{lesson.title}</h1>
  {!isVideo && (
          <>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-gray-600 mt-1">Fortschritt: {mastered.size} / {totalQuestions} gemeistert</p>
          </>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-lg p-8">
        {isVideo ? (
          <YouTubeLesson lesson={lesson} onCompleted={markVideoCompleted} />
        ) : effectiveType === 'memory' ? (
          <MemoryGame lesson={{ ...lesson, type: 'memory' }} onCompleted={() => { setIsCorrect(true); setShowResult(true); setCompleted(true); }} completedLessons={completedLessons} />
        ) : currentQuestion ? (
          <>
            <h2 className="text-xl font-semibold mb-6">{currentQuestion.question}</h2>
            {/* Media */}
            {!isMatching && currentMedia && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                {isImagePath(currentMedia) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src={currentMedia} 
                    alt="Frage Bild" 
                    className="max-w-full max-h-64 object-contain mx-auto border rounded"
                    onError={(e)=>{ const el=e.currentTarget as HTMLImageElement; const name=(currentMedia.split('/').pop()||''); if(!el.dataset.fallback1 && name){ el.dataset.fallback1='1'; el.src=`/media/bilder/${name}`; } else if(!el.dataset.fallback2 && name){ el.dataset.fallback2='1'; el.src=`/media/${name}`; } }}
                  />
                ) : isAudioPath(currentMedia) ? (
                  <audio controls className="w-full max-w-md mx-auto">
                    <source src={currentMedia} />
                    <source src={currentMedia.replace('/uploads/','/media/audio/')}/>
                    <source src={currentMedia.replace('/uploads/','/media/')}/>
                    <p className="text-red-600 text-sm">Audio wird vom Browser nicht unterstützt</p>
                  </audio>
                ) : (
                  <a 
                    href={currentMedia} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    📎 {currentMedia}
                  </a>
                )}
              </div>
            )}

            {/* Matching UI */}
            {isMatching ? (
              <>
                <MatchingUI
                  question={currentQuestion}
                  onSolved={() => {
                    setIsCorrect(true);
                    setShowResult(true);
                  }}
                />
                {showResult && (
                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={handleNextQuestion} className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700">Weiter</button>
                    <span className="text-sm font-medium text-green-700">Alle Paare korrekt verbunden!</span>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3 mb-6">
                {isMultiple ? (
                  currentQuestion.allAnswers.map((answer, index) => {
                    const isSelected = selectedAnswers.includes(answer);
                    const isCorrectAns = correctListNormalized.includes(norm(answer));
                    let buttonClass = "w-full p-4 text-left border-2 rounded-lg transition-all ";
                    if (showResult) {
                      if (isCorrectAns) {
                        buttonClass += "border-green-500 bg-green-50 text-green-800";
                      } else if (isSelected && !isCorrectAns) {
                        buttonClass += "border-red-500 bg-red-50 text-red-800";
                      } else {
                        buttonClass += "border-gray-200 bg-gray-50 text-gray-600";
                      }
                    } else {
                      if (isSelected) {
                        buttonClass += "border-blue-500 bg-blue-50 text-blue-800";
                      } else {
                        buttonClass += "border-gray-200 hover:border-gray-300 hover:bg-gray-50";
                      }
                    }
                    return (
                      <button
                        key={index}
                        onClick={() => handleAnswerSelect(answer)}
                        disabled={showResult}
                        className={buttonClass}
                      >
                        {String.fromCharCode(65 + index)}) {answer}
                      </button>
                    );
                  })
                ) : (
                  currentQuestion.allAnswers.map((answer, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(answer)}
                      disabled={showResult}
                      className={`w-full p-4 text-left border-2 rounded-lg transition-all ${
                        selectedAnswer === answer ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {String.fromCharCode(65 + index)}) {answer}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Controls */}
            {!isMatching && (
              <div className="flex items-center gap-3 mt-4">
                {isMultiple && !showResult ? (
                  <button onClick={handleCheckMultiple} className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700">Antwort prüfen</button>
                ) : (
                  showResult ? (
                    <button onClick={handleNextQuestion} className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700">Weiter</button>
                  ) : null
                )}
                {showResult && (
                  <span className={`text-sm font-medium ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    {isCorrect ? 'Richtig!' : 'Leider falsch.'}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p>Keine Frage vorhanden.</p>
        )}
      </div>

      {/* Footer Navigation */}
  <LessonFooterNavigation allLessons={allLessons} currentLessonId={lessonId} courseId={courseId} completedLessons={completedLessons} progressionMode={progressionMode} backHref={backHref} />
      {isMemory && completed && <div className="mt-6 text-green-700 font-medium">✔️ Memory abgeschlossen!</div>}
    </div>
  );
}

// Client-Komponente für Markdown Rendering
// MatchingUI jetzt ausgelagert

// OrderingPlayer und LueckentextPlayer ausgelagert
