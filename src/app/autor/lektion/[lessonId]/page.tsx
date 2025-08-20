"use client";
import { useState, useEffect, useCallback } from "react";
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import BackLink from '@/components/shared/BackLink';
import dynamic from 'next/dynamic';
import MarkdownPreview from '@/components/shared/MarkdownPreview';
import { resolveMediaPath } from '@/lib/media';
import { extractYouTubeId } from '@/lib/extractYouTubeId';
import type { ComponentType } from "react";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";

interface Question {
  question: string;
  mediaLink?: string;
  correctAnswer: string;
  wrongAnswers: string[];
  allAnswers: string[];
  correctAnswers?: string[]; // Mehrfachauswahl
}

interface Lesson {
  _id?: string;
  id?: string; // Legacy
  title: string;
  type: string;
  questions?: Question[];
  content?: { markdown?: string } | Record<string, unknown> | null;
  courseId: string;
  createdAt?: string;
  addedAt?: string;
  category?: string;
}

type RawLesson = {
  _id?: string; id?: string; title: string; type: string; questions?: Question[]; content?: { questions?: Question[] } | Record<string, unknown> | null; courseId?: string; createdAt?: string; addedAt?: string;
};

function isMarkdownContent(c: unknown): c is { markdown: string } {
  return !!c && typeof (c as { markdown?: unknown }).markdown === 'string';
}

interface MemoryPair { a: { kind: string; value: string }; b: { kind: string; value: string }; }

// Escape-sicheres Parsen für Lückentext (*Antwort*) mit Unterstützung für \* zum Escapen
function parseLueckentextAuthor(markdown: string): { answers: string[]; masked: string; highlight: string } {
  const answers: string[] = [];
  let masked = '';
  let i = 0;
  while (i < markdown.length) {
    const ch = markdown[i];
    if (ch === '\\') { // Escape: nächstes Zeichen literalisieren
      if (i + 1 < markdown.length) {
        masked += markdown[i] + markdown[i + 1];
        i += 2;
        continue;
      }
      masked += ch; i++; continue;
    }
    if (ch === '*') {
      // Start eines Gaps suchen (nicht escapet weil der Backslash oben schon behandelt wurde)
      const start = i + 1;
      let j = start;
      let found = false;
      let buffer = '';
      while (j < markdown.length) {
        const cj = markdown[j];
        if (cj === '\\' && j + 1 < markdown.length) { // escaped Zeichen innerhalb Antwort
          buffer += markdown[j + 1];
          j += 2; continue;
        }
        if (cj === '*') { // Ende
          found = true; j++; break;
        }
        buffer += cj; j++;
      }
      if (found && buffer.trim().length > 0) {
        answers.push(buffer.trim());
        masked += `___${answers.length}___`;
        i = j; continue;
      } else { // Kein Abschluss-* gefunden -> literal übernehmen
        masked += ch; i++; continue;
      }
    }
    masked += ch; i++;
  }
  const highlight = masked.replace(/___(\d+)___/g, (_m, g1) => `**[${g1}]**`);
  return { answers, masked, highlight };
}

const VideoEditor = dynamic(()=>import('@/components/lessonEditor/VideoEditor'));
const SnakeEditor = dynamic(() => import('../../../../components/lessonEditor/SnakeEditor'));
const MarkdownEditor = dynamic(()=>import('@/components/lessonEditor/MarkdownEditor'));
const MatchingEditor = dynamic(()=>import('@/components/lessonEditor/MatchingEditor'));
const MemoryEditor = dynamic(()=>import('../../../../components/lessonEditor/MemoryEditor'));
const OrderingEditor = dynamic(()=>import('../../../../components/lessonEditor/OrderingEditor'));
const LueckentextEditor = dynamic(()=>import('@/components/lessonEditor/LueckentextEditor'));
const TextAnswerEditor = dynamic(()=>import('@/components/lessonEditor/TextAnswerEditor'));

export default function EditLessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;
  const pathname = usePathname();
  const inTeacher = pathname?.startsWith('/teacher/');
  // Prüfe ob vom Übungen-Tab aufgerufen (Query ?from=uebungen) ohne window
  const sp = useSearchParams();
  const initialReturnFlag = sp.get('from') === 'uebungen';
  // Basis-State
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [returnToExercises, setReturnToExercises] = useState<boolean>(initialReturnFlag);
  useEffect(()=>{ if (lesson && lesson.courseId === 'exercise-pool' && !returnToExercises) setReturnToExercises(true); }, [lesson, returnToExercises]);
  // Optional: Marker im Speicher nur clientseitig setzen; nicht kritisch für Funktion
  useEffect(()=>{ try { if (typeof window !== 'undefined') localStorage.setItem('lastAuthorTab', returnToExercises ? 'uebungen' : 'kurse'); } catch {} }, [returnToExercises]);
  const forceExercisesForPool = (l?: Lesson|null) => !!l && l.courseId === 'exercise-pool';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gemeinsame Felder
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Mathematik");

  // Quiz / Multiple / Single Choice / Snake
  const [questionsText, setQuestionsText] = useState("");
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Markdown
  const [markdownText, setMarkdownText] = useState("");

  // Matching
  const [matchingText, setMatchingText] = useState("");
  const [matchingBlocksPreview, setMatchingBlocksPreview] = useState<Array<Array<{ left: string; right: string }>>>([]);

  // Erklärvideo
  const [videoUrl, setVideoUrl] = useState("");
  const [videoText, setVideoText] = useState("");
  // Memory
  const [memoryRaw, setMemoryRaw] = useState("");
  const [memoryPairs, setMemoryPairs] = useState<MemoryPair[]>([]);
  const [memoryErrors, setMemoryErrors] = useState<string[]>([]);
  const [memoryWarnings, setMemoryWarnings] = useState<string[]>([]);

  // Lückentext
  const [ltMarkdown, setLtMarkdown] = useState('');
  const [ltMode, setLtMode] = useState<'input'|'drag'>('input');
  const [ltPreview, setLtPreview] = useState<{ masked: string; answers: string[] }>({ masked: '', answers: [] });
  // Ordering
  const [orderingItems, setOrderingItems] = useState<string[]>([]);
  const [orderingRaw, setOrderingRaw] = useState<string>(''); // Rohtext inkl. temporärer Leerzeilen
  // Ordering Preview (interaktive Spieler-Sicht im Editor)
  const [orderingPreview, setOrderingPreview] = useState<string[]>([]);
  // Snake (vereinfachte Konfiguration) inkl. neuer Schwierigkeit "einfach"
  const [snakeTargetScore, setSnakeTargetScore] = useState<number>(10);
  const [snakeDifficulty, setSnakeDifficulty] = useState<'einfach'|'mittel'|'schwer'>('mittel');
  const shuffle = <T,>(arr: T[]) => arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
  // Live Parser für Choice/Snake
  const parseQuestions = useCallback(() => {
    const blocks = questionsText.trim().split(/\n\n+/).map(b => b.trim()).filter(Boolean);
    const qs: Question[] = [];
    for (const block of blocks) {
      const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;
      const first = lines[0];
      let qText = first; let media = '';
      const m = first.match(/^(.+?)\s*\[(.+?)\]$/);
      if (m) { qText = m[1].trim(); media = m[2].trim(); }
      const answersRaw = lines.slice(1);
      if (lesson?.type === 'multiple-choice') {
        const marked = answersRaw.map(l => ({ text: l.replace(/^\*\s*/, '').trim(), isCorrect: /^\*/.test(l) })).filter(a => a.text);
        const corrects = marked.filter(a => a.isCorrect).map(a => a.text);
        const allUnique = Array.from(new Set(marked.map(a => a.text)));
        if (corrects.length < 1 || allUnique.length < 2) continue;
        const wrong = allUnique.filter(a => !corrects.includes(a));
        qs.push({ question: qText, mediaLink: media || undefined, correctAnswer: corrects[0], correctAnswers: corrects, wrongAnswers: wrong, allAnswers: allUnique });
      } else if (lesson?.type === 'single-choice') {
        const correct = answersRaw[0]?.trim();
        const wrong = answersRaw.slice(1).map(a => a.trim()).filter(Boolean);
        if (!correct) continue;
        qs.push({ question: qText, mediaLink: media || undefined, correctAnswer: correct, wrongAnswers: wrong, allAnswers: [correct, ...wrong].sort(() => Math.random()-0.5) });
  } else if (lesson?.type === 'snake' || lesson?.type === 'minigame') {
        const cleaned = answersRaw.map(l=>l.replace(/^\*/, '').trim()).filter(a=>a);
        if (cleaned.length < 2) continue;
        const answers = cleaned.slice(0,4);
        const correctAnswer = answers[0];
        qs.push({ question: qText, mediaLink: undefined, correctAnswer, wrongAnswers: answers.slice(1), allAnswers: answers });
      }
    }
    setParsedQuestions(qs);
    if (!showPreview) setShowPreview(true);
  }, [questionsText, lesson?.type, showPreview]);

  // Live-Parsing: direkt und mit Debounce bei Änderungen
  useEffect(() => {
    if (!lesson) return;
    if(['single-choice','multiple-choice','snake','minigame'].includes(lesson.type)) {
      const id = setTimeout(() => { parseQuestions(); }, 200);
      return () => clearTimeout(id);
    }
  }, [questionsText, lesson, parseQuestions]);

  useEffect(()=>{
    if(!lesson) return;
  if(['single-choice','multiple-choice','snake','minigame'].includes(lesson.type)) parseQuestions();
  },[questionsText, lesson?.type, lesson, parseQuestions]);
  useEffect(() => {
    if (lesson?.type !== 'ordering') return;
    if (orderingItems.length >= 2) {
      setOrderingPreview(prev => {
        // Falls Items sich nur in Reihenfolge geändert haben (z.B. Speichern), neu mischen
        const sameSet = prev.length === orderingItems.length && prev.every(p => orderingItems.includes(p));
        if (!sameSet) return shuffle(orderingItems);
        return prev; // behalten (Autor kann selbst neu mischen)
      });
    } else {
      setOrderingPreview(orderingItems);
    }
  }, [lesson?.type, orderingItems]);
  const moveOrderingPreview = (idx: number, dir: -1|1) => {
    setOrderingPreview(list => {
      const ni = idx + dir; if (ni < 0 || ni >= list.length) return list; const copy=[...list]; const t=copy[idx]; copy[idx]=copy[ni]; copy[ni]=t; return copy; });
  };
  const reshuffleOrderingPreview = () => {
    if (orderingItems.length >= 2) setOrderingPreview(shuffle(orderingItems));
  };

  // Memory Parser (Client)
  const parseMemoryClient = (raw: string) => {
    const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i; const AUDIO_REGEX = /\.(mp3|wav|ogg|m4a)$/i; const URL_REGEX = /^https?:\/\//i;
    const detect = (v: string) => { if (IMAGE_REGEX.test(v) || (URL_REGEX.test(v) && /(png|jpe?g|gif|webp)(\?|$)/i.test(v))) return 'image'; if (AUDIO_REGEX.test(v) || (URL_REGEX.test(v) && /(mp3|wav|ogg|m4a)(\?|$)/i.test(v))) return 'audio'; return 'text'; };
    const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const pairs: MemoryPair[] = []; const errors: string[] = []; const warnings: string[] = []; const seen = new Set<string>();
    for (let i=0;i<lines.length;i++) { const line = lines[i]; if (!line.includes('|')) { warnings.push(`Zeile ${i+1}: kein |`); continue; } const [lRaw,rRaw] = line.split('|'); const l=(lRaw||'').trim(); const r=(rRaw||'').trim(); if(!l||!r){warnings.push(`Zeile ${i+1}: unvollständig`); continue;} if(l.toLowerCase()===r.toLowerCase()){warnings.push(`Zeile ${i+1}: identisch`); continue;} const key=(l+':::'+r).toLowerCase(); if(seen.has(key)){warnings.push(`Zeile ${i+1}: doppelt`); continue;} seen.add(key); pairs.push({ a:{kind:detect(l), value:l}, b:{kind:detect(r), value:r} }); if(pairs.length>8){warnings.push('>8 Paare ignoriert'); break;} }
    if (pairs.length < 4) errors.push('Mindestens 4 Paare'); if (pairs.length > 8) errors.push('Max 8 Paare');
    setMemoryPairs(pairs); setMemoryErrors(errors); setMemoryWarnings(warnings);
  };

  const loadLesson = useCallback(async () => {
    try {
      const direct = await fetch(`/api/lessons/${lessonId}`);
      if (direct.ok) {
        const data = await direct.json();
        if (data.success && data.lesson) {
          normalizeAndSet(data.lesson as RawLesson);
          return;
        }
      }
      // Fallback: alle Kurse durchsuchen
      const coursesRes = await fetch('/api/kurse');
      if (!coursesRes.ok) throw new Error('Kurse konnten nicht geladen werden');
      const coursesPayload = await coursesRes.json();
      const courses: Array<{ _id: string; title: string }> = Array.isArray(coursesPayload) ? coursesPayload : (coursesPayload.courses || []);
      for (const c of courses) {
        const lessonsRes = await fetch(`/api/kurs/${c._id}/lektionen`);
        if (!lessonsRes.ok) continue;
        const lessonsPayload = await lessonsRes.json();
        const arr: RawLesson[] = Array.isArray(lessonsPayload) ? lessonsPayload : (lessonsPayload.lessons || []);
        const found = arr.find(l => l._id === lessonId || l.id === lessonId);
        if (found) { normalizeAndSet(found, c._id); return; }
      }
      setError(`Lektion mit ID "${lessonId}" nicht gefunden.`);
    } catch (e) {
      setError('Fehler beim Laden: ' + String(e));
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  function normalizeAndSet(raw: RawLesson, forcedCourseId?: string) {
    // Vereinheitlicht: nur noch 'video'
    let mappedType = raw.type === 'erklaerivdeo' ? 'video' : raw.type;
  const recognized = ["single-choice","multiple-choice","text","video","markdown","matching","memory","lueckentext","ordering","text-answer","snake"];    
    const contentObj = (raw.content || {}) as any;
    // Fallback: Falls Typ nicht erkannt oder fälschlich single/multiple-choice aber typische Ordering-Struktur hat
    if (!recognized.includes(mappedType) || ((mappedType === 'single-choice' || mappedType === 'multiple-choice') && !raw.questions?.length)) {
      const itemsArr = Array.isArray(contentObj.items) ? contentObj.items : undefined;
      const rawLines = typeof contentObj.raw === 'string' ? contentObj.raw.split(/\n/).map((l:string)=>l.trim()).filter(Boolean) : [];
      if (itemsArr && itemsArr.length >= 2) {
        mappedType = 'ordering';
      } else if (rawLines.length >= 2 && rawLines.length <= 10) {
        // Heuristik: sieht wie Ordering aus
        mappedType = 'ordering';
        contentObj.items = rawLines.slice(0,10);
      }
    }
    const normalized: Lesson = {
      _id: raw._id || raw.id,
      title: raw.title,
      type: mappedType,
      questions: (raw.questions || raw.content?.questions || []) as Question[],
      content: raw.content || {},
      courseId: forcedCourseId || (raw as { courseId?: string }).courseId || '',
      createdAt: raw.createdAt || raw.addedAt,
      category: (raw as any).category || ''
    };
    setLesson(normalized);
    setTitle(normalized.title);
    if ((raw as any).category) setCategory(String((raw as any).category));
  if (normalized.type === 'single-choice' || normalized.type === 'multiple-choice') {
      if (normalized.questions && normalized.questions.length > 0) {
        const blocks = normalized.questions.map(q => {
          const corrects = (Array.isArray(q.correctAnswers) && q.correctAnswers.length) ? q.correctAnswers : [q.correctAnswer];
            const order = q.allAnswers && q.allAnswers.length ? q.allAnswers : [...corrects, ...q.wrongAnswers];
            const answerLines = order.map(a => corrects.includes(a) ? `* ${a}` : a);
            const qLine = q.mediaLink ? `${q.question} [${resolveMediaPath(q.mediaLink)}]` : q.question;
            return [qLine, ...answerLines].join('\n');
        });
        setQuestionsText(blocks.join('\n\n'));
        setParsedQuestions(normalized.questions);
        setShowPreview(true);
      }
    } else if (normalized.type === 'markdown') {
      const md = isMarkdownContent(normalized.content) ? normalized.content.markdown : '';
      setMarkdownText(md);
      setShowPreview(true);
    } else if (normalized.type === 'matching') {
      const qs = normalized.questions || [];
      const blocks = qs.map(q => {
        const pairs = Array.isArray(q.correctAnswers) ? q.correctAnswers.map(k => {
          const [l, r] = String(k).split('=>');
          return { left: (l||'').trim(), right: (r||'').trim() };
        }).filter(p => p.left && p.right) : [];
        return pairs.map(p => `${p.left}|${p.right}`).join('\n');
      }).filter(Boolean);
      setMatchingText(blocks.join('\n\n'));
      setMatchingBlocksPreview(blocks.map(block => block.split(/\n+/).filter(Boolean).map(line => { const [l,r] = line.split('|'); return { left: (l||'').trim(), right: (r||'').trim() }; })));
      setShowPreview(true);
  } else if (normalized.type === 'video') {
      const c = (normalized.content || {}) as Record<string, unknown>;
      // Fallbacks für ältere Strukturen (url, link)
      const rawUrl = (c.youtubeUrl || (c as any).url || (c as any).link || '') as string;
      setVideoUrl(String(rawUrl));
      setVideoText(String(c.text || ''));
      setShowPreview(true);
    } else if (normalized.type === 'memory') {
      const c = (normalized.content || {}) as any;
      const raw = String(c.raw || c.text || '').trim();
      setMemoryRaw(raw);
      parseMemoryClient(raw);
      setShowPreview(true);
    } else if (normalized.type === 'lueckentext') {
      const c = (normalized.content || {}) as any;
  setLtMarkdown(String(c.markdownOriginal || c.markdown || ''));
      setLtMode((c.mode === 'drag') ? 'drag' : 'input');
  const answers = Array.isArray(c.gaps) ? c.gaps.map((g: any) => g.answer) : [];
  setLtPreview({ masked: String(c.markdownMasked || ''), answers });
      setShowPreview(true);
    } else if (normalized.type === 'ordering') {
      const c = (normalized.content || {}) as any;
      const items = Array.isArray(c.items) ? c.items.map((v: any) => String(v||'').trim()).filter(Boolean) : [];
      setOrderingItems(items);
  const rawFromContent = typeof c.raw === 'string' && c.raw.trim().length ? c.raw : items.join('\n');
  setOrderingRaw(rawFromContent);
      setShowPreview(true);
    } else if (normalized.type === 'text-answer') {
      const c = (normalized.content || {}) as any;
      // Falls Legacy (nur question/answer) -> raw rekonstruieren
      if (!c.raw) {
        const q = String(c.question||'').trim();
        const a = String(c.answer||'').trim();
        if (q && a) {
          c.raw = `${q}\n${a}`;
          c.blocks = [{ question: q, answers: [a] }];
        }
      }
      setLesson(prev => prev ? { ...prev, content: c } : prev);
      setShowPreview(true);
  } else if (normalized.type === 'snake' || normalized.type === 'minigame') {
      const c = (normalized.content || {}) as any;
      if (Array.isArray(c.blocks)) {
        const text = c.blocks.map((b: any) => {
          const lines = [b.question, ...b.answers.map((ans: string, i: number) => i === b.correct ? `*${ans}` : ans)];
          return lines.join('\n');
        }).join('\n\n');
        setQuestionsText(text);
      }
      if (typeof c.targetScore === 'number') setSnakeTargetScore(c.targetScore);
    if (typeof c.difficulty === 'string') {
      setSnakeDifficulty(c.difficulty === 'schwer' ? 'schwer' : (c.difficulty === 'einfach' ? 'einfach' : 'mittel'));
    }
      setShowPreview(true);
    }
  }

  useEffect(() => { loadLesson(); }, [loadLesson]);
  useEffect(() => {
    if (lesson) {
      // Debug Info für Vorschau-Problem
      // eslint-disable-next-line no-console
      console.log('[EditLesson Debug]', { type: lesson.type, videoUrl, content: lesson.content });
    }
  }, [lesson, videoUrl]);
  // Matching Live Preview
  useEffect(() => {
    if (lesson?.type !== 'matching') return;
    const blocks = matchingText.trim().split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
    const parsed = blocks.map(block => {
      const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0,5);
      return lines.map(line => { const [l,r] = line.split('|'); return { left: (l||'').trim(), right: (r||'').trim() }; }).filter(p => p.left && p.right);
    });
    setMatchingBlocksPreview(parsed);
    if (!showPreview) setShowPreview(true);
  }, [lesson?.type, matchingText, showPreview]);

  // Parser für Fragen

  // Speichern (neu aufgebaut nach Korrumpierung)
  // Einheitlicher Redirect nach Speichern
  const goBack = (l: Lesson) => {
    if (returnToExercises || forceExercisesForPool(l)) {
      router.push(inTeacher ? '/teacher' : '/autor?tab=uebungen');
    } else {
      router.push(inTeacher ? `/teacher/kurs/${l.courseId}` : `/autor/kurs/${l.courseId}`);
    }
  };

  const handleSave = async () => {
    if (!lesson) return;
    if (!title.trim()) { alert('Titel fehlt.'); return; }

    // Memory
    if (lesson.type === 'memory') {
      if (memoryErrors.length) { alert('Memory Fehler: ' + memoryErrors.join(', ')); return; }
      if (memoryPairs.length < 4 || memoryPairs.length > 8) { alert('Anzahl Paare 4-8 erforderlich.'); return; }
      setSaving(true);
      try {
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'memory', text: memoryRaw, category }) });
        if (!res.ok) throw new Error();
  alert('Memory gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Erklärvideo
  if (lesson.type === 'video') {
      const raw = videoUrl.trim();
      const vid = extractYouTubeId(raw);
      if (!vid) { alert('Ungültiger YouTube-Link oder ID.'); return; }
      setSaving(true);
      try {
        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://youtu.be/${vid}`;
        const content = { youtubeUrl: normalized, url: normalized, text: videoText };
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'video', content, category }) });
        if (!res.ok) throw new Error();
  alert('Erklärvideo gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Markdown
    if (lesson.type === 'markdown') {
      if (!markdownText.trim()) { alert('Markdown-Inhalt fehlt.'); return; }
      setSaving(true);
      try {
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'markdown', content: { markdown: markdownText }, category }) });
        if (!res.ok) throw new Error();
  alert('Markdown gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Snake
  if (lesson.type === 'snake' || lesson.type === 'minigame') {
      if (!parsedQuestions.length) { alert('Keine gültigen Snake-Fragen.'); return; }
      const blocks = parsedQuestions.map(q => ({ question: q.question, answers: q.allAnswers, correct: q.allAnswers.findIndex(a=>a===q.correctAnswer) }));
      setSaving(true);
      try {
        const initialSpeedMs = snakeDifficulty === 'schwer' ? 140 : (snakeDifficulty === 'einfach' ? 220 : 180);
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'minigame', content: { blocks, targetScore: snakeTargetScore, difficulty: snakeDifficulty, initialSpeedMs }, questions: blocks.map(b=>({ question:b.question, allAnswers:b.answers, correctAnswers:[b.answers[b.correct]] })), category }) });
        let data: any = null;
        try { data = await res.json(); } catch { /* ignore parse */ }
        if ((res.ok && data?.success) || (!res.ok && data?.success)) {
          // Treat success flag as authoritative (behebt Fall: gespeichert aber Status!=200)
          if (!res.ok) console.warn('Snake save: success true aber Status', res.status, data);
          alert('Snake gespeichert.');
          goBack(lesson);
        } else {
          const errMsg = data?.error || 'Speichern fehlgeschlagen.';
          alert(errMsg);
        }
      } catch (e) {
        console.error('Snake save network/error', e);
        alert('Speichern fehlgeschlagen (Netzwerk).');
      } finally { setSaving(false); }
      return;
    }

    // Matching
    if (lesson.type === 'matching') {
      const text = matchingText.trim();
      if (!text) { alert('Bitte Matching-Paare eingeben.'); return; }
      setSaving(true);
      try {
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'matching', text, category }) });
        if (!res.ok) throw new Error();
  alert('Matching gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Lückentext
    if (lesson.type === 'lueckentext') {
      if (!ltMarkdown.trim()) { alert('Markdown fehlt.'); return; }
      const parsed = parseLueckentextAuthor(ltMarkdown);
      if (parsed.answers.length === 0) { alert('Mindestens eine *Antwort* erforderlich.'); return; }
      setSaving(true);
      try {
        const content = { markdown: ltMarkdown, mode: ltMode };
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'lueckentext', content, category }) });
        if (!res.ok) throw new Error();
  alert('Lückentext gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Ordering
    if (lesson.type === 'ordering') {
      const trimmed = orderingItems.map(i=>i.trim()).filter(Boolean);
      if (trimmed.length < 2) { alert('Mindestens 2 Schritte.'); return; }
      setSaving(true);
      try {
        const content = { items: trimmed, raw: trimmed.join('\n') };
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'ordering', content, category }) });
        if (!res.ok) throw new Error();
  alert('Reihenfolge gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Text-Antwort
    if (lesson.type === 'text-answer') {
      const c = (lesson.content || {}) as any;
      const raw: string = String(c.raw || '').replace(/\r/g,'');
      const caseSensitive = !!c.caseSensitive;
      const blocks = raw.split(/\n\s*\n+/).map((b:string)=>b.trim()).filter(Boolean).slice(0,50).map(b=>{
        const lines = b.split(/\n+/).map(l=>l.trim()).filter(Boolean);
        if (!lines.length) return null;
        const question = lines[0];
        const answers = lines.slice(1).filter(l=>l.length>0);
        if (!question || answers.length===0) return null;
        return { question, answers };
      }).filter(Boolean) as Array<{ question: string; answers: string[] }>;
      if (!blocks.length) { alert('Mindestens ein gültiger Fragenblock erforderlich.'); return; }
      setSaving(true);
      try {
        const first = blocks[0];
        const content = { raw, blocks, caseSensitive, question: first.question, answer: first.answers[0] };
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: 'text-answer', content, category }) });
        if (!res.ok) throw new Error();
  alert('Text-Antwort gespeichert.');
  goBack(lesson);
      } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
      return;
    }

    // Quiz (single/multiple)
    if (parsedQuestions.length === 0) { alert('Keine gültigen Fragen.'); return; }
    setSaving(true);
    try {
  const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lessonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), type: lesson.type, questions: parsedQuestions, category }) });
      if (!res.ok) throw new Error();
  alert('Lektion gespeichert.');
  goBack(lesson);
    } catch { alert('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
  };

  // Guards
  if (loading) return <main className="max-w-6xl mx-auto mt-10 p-6"><div className="text-gray-500">Lade Lektion…</div></main>;
  if (error) return <main className="max-w-6xl mx-auto mt-10 p-6"><div className="text-red-600">{error}</div></main>;
  if (!lesson) return <main className="max-w-6xl mx-auto mt-10 p-6"><div className="text-gray-500">Nicht gefunden.</div></main>;

  if (lesson.type === 'video') return <VideoEditor lesson={lesson} title={title} setTitle={setTitle} category={category} setCategory={setCategory} videoUrl={videoUrl} setVideoUrl={setVideoUrl} videoText={videoText} setVideoText={setVideoText} handleSave={handleSave} saving={saving} returnToExercises={returnToExercises} />;

  if (lesson.type === 'markdown') return (
    <MarkdownEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      markdownText={markdownText} setMarkdownText={setMarkdownText}
      handleSave={handleSave}
      saving={saving}
      returnToExercises={returnToExercises}
    />
  );

  if (lesson.type === 'matching') return (
    <MatchingEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      matchingText={matchingText} setMatchingText={setMatchingText}
      matchingBlocksPreview={matchingBlocksPreview}
      handleSave={handleSave}
      saving={saving}
      returnToExercises={returnToExercises}
    />
  );

  if (lesson.type === 'memory') return (
    <MemoryEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      memoryRaw={memoryRaw} setMemoryRaw={setMemoryRaw}
      memoryPairs={memoryPairs} memoryWarnings={memoryWarnings} memoryErrors={memoryErrors}
      parseMemoryClient={parseMemoryClient}
      handleSave={handleSave} saving={saving}
      returnToExercises={returnToExercises}
    />
  );

  if (lesson.type === 'lueckentext') return (
    <LueckentextEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      ltMarkdown={ltMarkdown} setLtMarkdown={setLtMarkdown}
      ltMode={ltMode} setLtMode={setLtMode}
      handleSave={handleSave} saving={saving}
      returnToExercises={returnToExercises}
    />
  );

  if (lesson.type === 'ordering') return (
    <OrderingEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      orderingRaw={orderingRaw} setOrderingRaw={setOrderingRaw}
      orderingItems={orderingItems}
      orderingPreview={orderingPreview}
      moveOrderingPreview={moveOrderingPreview}
      reshuffleOrderingPreview={reshuffleOrderingPreview}
      handleSave={handleSave} saving={saving}
      returnToExercises={returnToExercises}
    />
  );

  // Snake UI ausgelagert in dynamische Komponente
  if (lesson.type === 'snake' || lesson.type === 'minigame') return (
    <SnakeEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      questionsText={questionsText} setQuestionsText={setQuestionsText}
      parsedQuestions={parsedQuestions}
      saving={saving}
      handleSave={handleSave}
      snakeTargetScore={snakeTargetScore} setSnakeTargetScore={setSnakeTargetScore}
      snakeDifficulty={snakeDifficulty} setSnakeDifficulty={setSnakeDifficulty}
      returnToExercises={returnToExercises}
    />
  );

  if (lesson.type === 'text-answer') return (
    <TextAnswerEditor
      lesson={lesson}
      title={title} setTitle={setTitle}
      category={category} setCategory={setCategory}
      setLesson={setLesson}
      saving={saving} setSaving={setSaving}
      returnToExercises={returnToExercises}
    />
  );

  // Quiz UI (Single / Multiple Choice)
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
  <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">✏️ Lektion bearbeiten</h1>
      <div className="mb-6 bg-white border rounded p-6">
        <h3 className="font-semibold mb-4">📝 Titel</h3>
        <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border rounded text-lg" placeholder="Titel" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">✏️ Fragen bearbeiten</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">{lesson.type === 'multiple-choice' ? 'Frage [optional: Link] + Antworten (* = korrekt)' : 'Frage [optional: Link] + Richtige + Falsche Antworten'}</label>
            <textarea value={questionsText} onChange={e => setQuestionsText(e.target.value)} className="w-full h-96 p-3 border rounded font-mono text-sm" placeholder={lesson.type === 'multiple-choice' ? `Frage 1 [bild.jpg]\n* Richtige Antwort\nFalsche Antwort\n* Weitere richtige\n\nFrage 2 [clip.mp3]\n* Richtig\nFalsch` : `Frage 1 [diagramm.jpg]\nRichtige Antwort hier\nFalsche Antwort 1\nFalsche Antwort 2\n\nFrage 2 [beispiel.jpg]\nEine andere richtige Antwort\nFalsche Option A\nFalsche Option B\n\nFrage 3 [beispiel.mp3]\nAudio-Frage Antwort\nFalsche Audio-Antwort`} />
          </div>
          <div className="flex gap-3">
            <button onClick={parseQuestions} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">🔍 Vorschau aktualisieren</button>
            {showPreview && <button onClick={handleSave} disabled={saving || !title.trim() || parsedQuestions.length === 0} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>}
          </div>
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800 space-y-1">
            <p>• Leere Zeile trennt Fragen</p>
            <p>• Medien: [datei.jpg] oder [/uploads/datei.jpg] oder absolute URL – Dateinamen werden automatisch zu /uploads/… aufgelöst; Audio: [datei.mp3]</p>
            {lesson.type === 'multiple-choice' ? <p>• Mehrere richtige Antworten mit * markieren</p> : <p>• Zweite Zeile = richtige Antwort</p>}
          </div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau</h3>
          {!showPreview ? <div className="text-gray-500 text-center py-8">Erst auf "Vorschau aktualisieren" klicken.</div> : (
            <div className="space-y-6">
              {parsedQuestions.map((q, qi) => (
                <div key={qi} className="border rounded p-4 bg-gray-50">
                  <div className="mb-3"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">Frage {qi + 1}</span></div>
                  <h4 className="font-semibold mb-3">{q.question}</h4>
                  {q.mediaLink && (
                    <div className="mb-3 p-3 bg-gray-100 rounded border">
                      {q.mediaLink.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={q.mediaLink} alt="Frage Media" className="max-w-full max-h-48 object-contain border rounded bg-white" />
                      ) : q.mediaLink.match(/\.(mp3|wav|ogg|m4a)$/i) ? (
                        <audio controls className="w-full max-w-md"><source src={q.mediaLink} /></audio>
                      ) : (
                        <a href={q.mediaLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">📎 {q.mediaLink}</a>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    {q.allAnswers.map((ans, ai) => {
                      const isCorr = (Array.isArray(q.correctAnswers) && q.correctAnswers.length ? q.correctAnswers : [q.correctAnswer]).includes(ans);
                      return (
                        <label key={ai} className="flex items-start gap-3 p-2 border rounded bg-white">
                          <input type={lesson.type === 'multiple-choice' ? 'checkbox' : 'radio'} disabled checked={isCorr} readOnly className="mt-1" />
                          <span className={isCorr ? 'text-green-700 font-medium' : ''}>{ans}{isCorr && <span className="ml-2 text-green-600">✓</span>}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-sm text-gray-600">
                    {lesson.type === 'multiple-choice' ? <>📊 Richtige Antworten: <strong className="text-green-600">{(q.correctAnswers || [q.correctAnswer]).join(', ')}</strong></> : <>📊 Richtige Antwort: <strong className="text-green-600">{q.correctAnswer}</strong></>}
                  </div>
                </div>
              ))}
              {parsedQuestions.length === 0 && <div className="text-gray-500 text-center py-4">Keine gültigen Fragen.</div>}
            </div>
          )}
        </div>
      </div>
      {showPreview && parsedQuestions.length > 0 && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded p-4">
          <h4 className="font-semibold text-green-800 mb-2">📈 Quiz-Statistiken</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-green-700 font-medium">Fragen:</span><div className="text-2xl font-bold text-green-800">{parsedQuestions.length}</div></div>
            <div><span className="text-green-700 font-medium">Mit Media:</span><div className="text-2xl font-bold text-green-800">{parsedQuestions.filter(q => q.mediaLink).length}</div></div>
            <div><span className="text-green-700 font-medium">Ø Antworten:</span><div className="text-2xl font-bold text-green-800">{Math.round(parsedQuestions.reduce((s, q) => s + q.allAnswers.length, 0) / parsedQuestions.length)}</div></div>
            <div><span className="text-green-700 font-medium">Geschätzte Zeit:</span><div className="text-2xl font-bold text-green-800">{parsedQuestions.length}min</div></div>
          </div>
        </div>
      )}
    </main>
  );
}

// (MarkdownPreview & extractYouTubeId ausgelagert)

function MemoryCardSide({ side }: { side: { kind: string; value: string } }) {
  if (side.kind === 'image') return <img src={side.value} alt="" className="w-full h-16 object-contain bg-white rounded" />;
  if (side.kind === 'audio') return <audio controls className="w-full"><source src={side.value} /></audio>;
  return <div className="h-16 flex items-center justify-center text-center p-1 break-words">{side.value}</div>;
}

// Text-Antwort Edit Komponente
function TextAnswerEdit({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || { question: '', answer: '', partials: [], caseSensitive: false };
  const partials: Array<{ value: string; accept: boolean }> = Array.isArray(c.partials) ? c.partials : [];
  const update = (patch: any) => onChange({ ...c, ...patch });
  const addPartial = () => update({ partials: [...partials, { value: '', accept: true }] });
  const updatePartial = (idx: number, patch: Partial<{ value: string; accept: boolean }>) => {
    update({ partials: partials.map((p,i)=> i===idx ? { ...p, ...patch } : p) });
  };
  const removePartial = (idx: number) => update({ partials: partials.filter((_,i)=>i!==idx) });
  return (
    <div className="bg-white border rounded p-6 space-y-6">
      <h3 className="font-semibold text-lg">✍️ Text-Antwort bearbeiten</h3>
      <div>
        <label className="block text-sm font-medium mb-1">Frage</label>
        <textarea value={c.question||''} onChange={e=>update({ question: e.target.value })} className="w-full h-32 p-3 border rounded" placeholder="Frage eingeben..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Vollständige Referenz-Antwort</label>
        <textarea value={c.answer||''} onChange={e=>update({ answer: e.target.value })} className="w-full h-32 p-3 border rounded font-mono text-sm" placeholder="Exakte Zielantwort" />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <input id="caseSensitiveEdit" type="checkbox" checked={!!c.caseSensitive} onChange={e=>update({ caseSensitive: e.target.checked })} className="h-4 w-4" />
        <label htmlFor="caseSensitiveEdit">Groß-/Kleinschreibung beachten</label>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Teilantworten / Synonyme</h4>
          <button type="button" onClick={addPartial} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">+ Hinzufügen</button>
        </div>
        {partials.length === 0 && <div className="text-gray-400 text-sm">Keine Teilantworten.</div>}
        <ul className="space-y-2">
          {partials.map((p, idx) => (
            <li key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-gray-50 border rounded p-2">
              <input type="text" value={p.value} onChange={e=>updatePartial(idx,{ value: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" placeholder="Teilantwort" />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input type="checkbox" checked={p.accept} onChange={e=>updatePartial(idx,{ accept: e.target.checked })} /> akzeptiert
              </label>
              <button type="button" onClick={()=>removePartial(idx)} className="text-red-600 text-xs hover:underline">Entfernen</button>
            </li>
          ))}
        </ul>
        {partials.length > 0 && <p className="mt-2 text-[10px] text-gray-500">Max 20 Einträge.</p>}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
        Bewertung (später Spieler): Normalisieren (trim, optional lowercase). Exakt = korrekt. Sonst akzeptierte Teilantwort = teilweise korrekt. Abgelehnte Teilantwort = spezielles Feedback.
      </div>
      <div className="mt-4">
        <button onClick={() => {
          const question = String(c.question||'').trim();
          const answer = String(c.answer||'').trim();
          if (!question || !answer) { alert('Frage & Antwort erforderlich.'); return; }
          // Save handled via global save button; here only validation
          alert('Daten aktualisiert – bitte oben Speichern klicken.');
        }} className="px-3 py-1 text-xs border rounded hover:bg-gray-50">Validieren</button>
      </div>
    </div>
  );
}
