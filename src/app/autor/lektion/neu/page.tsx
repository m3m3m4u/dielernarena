"use client";
import { useState, Suspense, useEffect } from "react";
import CategorySelect from '@/components/shared/CategorySelect';
import { resolveMediaPath, isImagePath, isAudioPath } from '@/lib/media';
import { useSearchParams, usePathname, useRouter } from "next/navigation";

// Leichtgewichtige Form-State-Typen für diese Seite
type LessonFormState = {
  title: string;
  type: string;
  courseId: string;
  content: unknown;
};

type TextContent = { title: string; paragraphs: string[]; keyPoints: string[] };
type QuizContent = { question: string; options: string[]; correctAnswer: string; explanation: string };
type ExerciseContent = { title: string; instruction: string; placeholder: string; sampleAnswer: string };
type VideoContent = { title: string; videoId: string; videoTitle: string; duration: string; description: string };
type MarkdownContent = { markdown: string };
type MultipleChoiceContent = { text: string };
type SnakeContent = { questions: string; targetScore: number; difficulty: 'einfach' | 'mittel' | 'schwer' };

export default function NeueLektionPage() {
  return (
  <Suspense fallback={<main className="max-w-6xl mx-auto mt-10 p-6">Lädt…</main>}>
      <NeueLektionPageInner />
    </Suspense>
  );
}

// Kleine Helferfunktion: YouTube-ID aus URL oder direkter ID extrahieren (Client)
function extractYouTubeIdClient(input: string): string | null {
  const url = (input || "").trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "") || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    if (m) return m[1];
    return null;
  } catch {
    // Falls keine gültige URL, prüfe auf direkte ID
    if (/^[a-zA-Z0-9_-]{6,}$/.test(url)) return url;
    return null;
  }
}

function NeueLektionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeRaw = searchParams.get("type") || "text";
  // Legacy-Alias: snake => minigame (UI konsolidieren)
  const type = typeRaw === 'snake' ? 'minigame' : typeRaw;
  const courseId = searchParams.get("courseId");
  const pathname = usePathname();
  const inTeacher = pathname?.startsWith('/teacher/');
  
  // NEU: Kursnamen laden
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/kurs/${courseId}`);
        if (!res.ok) return;
        const data = await res.json();
        const title: string | undefined = data?.course?.title || data?.course?.name;
        if (!cancelled) setCourseTitle(title || null);
      } catch {
        // still fallback to ID
      }
    })();
    return () => { cancelled = true; };
  }, [courseId]);
  
  const [lessonData, setLessonData] = useState<LessonFormState>({
    title: "",
    type: type,
    courseId: courseId || "",
    content: getEmptyTemplate(type) as unknown
  });
  const [isSaving, setIsSaving] = useState(false);

  const typeNames = {
    text: "📖 Text-Lektion",
    quiz: "❓ Quiz-Lektion", 
    exercise: "✏️ Übungs-Lektion",
  video: "🎥 Video",
  "single-choice": "📝 Single Choice-Lektion",
    "multiple-choice": "❓❓ Multiple Choice-Lektion",
    markdown: "🧾 Markdown-Lektion",
    matching: "🔗 Paare finden",
    // Neu: Memory
    memory: "🧠 Memory",
    // Neu: Lückentext
  lueckentext: "🧩 Lückentext",
  // Neu: Reihenfolge festlegen
    ordering: "🔢 Reihenfolge"
  , "text-answer": "✍️ Text-Antwort"
  , minigame: "Minigame"
  } as const;

  function getEmptyTemplate(type: string) {
    switch (type) {
      case "text":
        return {
          title: "",
          paragraphs: [""],
          keyPoints: [""]
        };
      case "quiz":
        return {
          question: "",
          options: ["", "", "", ""],
          correctAnswer: "",
          explanation: ""
        };
      case "exercise":
        return {
          title: "",
          instruction: "",
          placeholder: "",
          sampleAnswer: ""
        };
      case "video":
        return { youtubeUrl: "", text: "" };
      case "single-choice":
        return {
          questions: []
        };
      case "multiple-choice":
        return { text: "Frage 1 [beispiel.jpg]\n*richtige Antwort\nfalsche Antwort\n*weitere richtige Antwort\n\nFrage 2\n*Richtig\nFalsch" };
      case "markdown":
        return {
          markdown: "# Überschrift\n\nHier kannst du **Markdown** verwenden.\n\n- Punkt 1\n- Punkt 2\n\n![Beispielbild](beispiel.jpg)\n\n[Audio](beispiel.mp3)"
        };
      case "matching":
        return { text: "1+2|3\n1-1|0\n1+8|9\n\n2+5|7\n1+2|3\n1-1|0" };
      // Neu: Memory
      case "memory":
        return { text: "" };
      // Neu: Lückentext
      case "lueckentext":
        return { markdown: "Die Hauptstadt von *Österreich* ist Wien." , mode: 'input'};
      case "ordering":
        return { items: ["Schritt 1", "Schritt 2", "Schritt 3"] };
  case "text-answer":
        return { question: "", answer: "", partials: [], caseSensitive: false };
  case "snake": // Legacy – fällt auf minigame zurück
  case "minigame":
        return { questions: "Frage 1\nRichtige Antwort\nFalsch A\nFalsch B\nFalsch C\n\nFrage 2\nRichtig\nFalsch\nFalsch\nFalsch", targetScore: 10, difficulty: 'mittel' } as SnakeContent;
      default:
        return {};
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(lessonData.title || "").trim()) {
      alert("Bitte einen Titel angeben.");
      return;
    }
    // Single-Choice wird im separaten Editor erstellt
    if (lessonData.type === "single-choice") {
      // Immer in den Spezial-Editor wechseln, auch ohne Kurs (der Editor erstellt dann eine Übung)
      const target = inTeacher ? "/teacher/lektion/single-choice" : "/autor/lektion/single-choice";
      router.push(courseId ? `${target}?courseId=${courseId}` : target);
      return;
    }
    setIsSaving(true);
    try {
      const payload: { title: string; type: string; content: any; text?: string; category?: string } = {
        title: lessonData.title,
        // Kanonischer Typ: snake => minigame
        type: (lessonData.type === 'snake' ? 'minigame' : lessonData.type),
        content: (lessonData.content as any) || {}
      };
      // Standalone Kategorie (falls später Kurs optional) placeholder: derzeit kein eigener State vorhanden
      const standaloneCat = (lessonData as any).category?.trim?.();
      if (!courseId && standaloneCat) payload.category = standaloneCat;

      // Multiple-Choice: Text in Fragen normalisieren (für Exercises-API, die kein Text-Parsing übernimmt)
  if (lessonData.type === 'multiple-choice') {
        const mc = (lessonData.content as MultipleChoiceContent | undefined);
        const text = (mc?.text || '').trim();
        if (text) {
          const blocks = text.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
          const questions = blocks.map(b => {
            const lines = b.split(/\n/).map(l=>l.trim()).filter(Boolean);
            if (lines.length < 2) return null;
            let qText = lines[0];
            let media = '';
            const m = qText.match(/^(.+?)\s*\[(.+?)\]$/);
    if (m) { qText = m[1].trim(); media = resolveMediaPath(m[2].trim()); }
            const ans = lines.slice(1);
            const corrects = ans.filter(a=>a.startsWith('*')).map(a=>a.replace(/^\*+/, '').trim());
            const wrongs = ans.filter(a=>!a.startsWith('*')).map(a=>a.trim());
            const all = [...corrects, ...wrongs].filter(Boolean);
            if (!qText || corrects.length === 0 || all.length < 2) return null;
    return { question: qText, mediaLink: media || undefined, correctAnswers: corrects, wrongAnswers: wrongs, allAnswers: all };
          }).filter(Boolean) as Array<{ question: string; mediaLink?: string; correctAnswers: string[]; wrongAnswers: string[]; allAnswers: string[] }>;
          (payload as any).questions = questions;
          delete (payload as any).text;
        } else {
          // kein Text -> leere Fragenliste (Server validiert ggf.)
          (payload as any).questions = [];
        }
      }
      // Matching: Text in Fragen normalisieren (Exercises-API hat kein Parser)
      if (lessonData.type === 'matching') {
        const m = (lessonData.content as { text?: string } | undefined);
        const text = (m?.text || '').trim();
        if (text) {
          const blocks = text.split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean);
          const toPairs = (block: string) => block.split(/\n+/).map(l=>l.trim()).filter(Boolean).slice(0,5)
            .map(line => {
              const [l, r] = line.split('|');
              const L = String(l||'').trim();
              const R = String(r||'').trim();
              // Nur Bilder/Audio automatisch auf /uploads/... mappen; 
              // reiner Text bleibt unverändert
              const Lr = (isImagePath(L) || isAudioPath(L)) ? resolveMediaPath(L) : L;
              const Rr = (isImagePath(R) || isAudioPath(R)) ? resolveMediaPath(R) : R;
              return { l: Lr, r: Rr };
            })
            .filter(p => p.l && p.r);
          const shuffle = <T,>(arr: T[]) => arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
          const questions = blocks.map(b => {
            const pairs = toPairs(b);
            if (pairs.length < 2) return null;
            const lefts = pairs.map(p=>p.l);
            const rights = pairs.map(p=>p.r);
            const all = shuffle([...lefts, ...rights]);
            return {
              question: 'Finde die passenden Paare',
              mediaLink: undefined,
              correctAnswers: pairs.map(p=>`${p.l}=>${p.r}`),
              wrongAnswers: [],
              allAnswers: all
            };
          }).filter(Boolean) as Array<{ question: string; mediaLink?: string; correctAnswers: string[]; wrongAnswers: string[]; allAnswers: string[] }>;
          (payload as any).questions = questions;
          // content.text für Referenz beibehalten
        } else {
          (payload as any).questions = [];
        }
      }
      // Video Normalisierung
      if (lessonData.type === 'video') {
        const c = (lessonData.content as { youtubeUrl?: string; text?: string }) || {};
        const raw = (c.youtubeUrl || '').trim();
        const vid = extractYouTubeIdClient(raw);
        if (!vid) {
          setIsSaving(false);
          alert('Ungültiger YouTube-Link oder ID. Erlaubt: youtu.be/ID, watch?v=ID, /embed/ID oder nur die Video-ID.');
          return;
        }
        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://youtu.be/${vid}`;
        payload.content = { youtubeUrl: normalized, text: c.text || '' };
      }
      if (lessonData.type === 'lueckentext') {
        const c = (lessonData.content as any) || {};
        payload.content = { markdown: c.markdown || '', mode: c.mode === 'drag' ? 'drag' : 'input' };
      }
      if (lessonData.type === 'markdown') {
        // Normalisiere Medienpfade in Markdown (Dateinamen => /uploads/...)
        const c = (lessonData.content as any) || {};
        let md: string = String(c.markdown || '');
        // Ersetze Bild- und Link-Ziele, wenn sie wie Dateinamen aussehen
        // ![alt](path) und [text](path)
        md = md.replace(/(!\[[^\]]*\]\(|\[[^\]]*\]\()\s*([^\s)]+)\s*\)/g, (full, prefix, url) => {
          const resolved = resolveMediaPath(String(url || ''));
          return `${prefix}${resolved})`;
        });
        payload.content = { markdown: md };
      }
      if (lessonData.type === 'ordering') {
        const c = (lessonData.content as any) || {};
        const items = Array.isArray(c.items) ? c.items.map((v: any) => String(v||'').trim()).filter((v: string) => v.length>0).slice(0,10) : [];
        if (items.length < 2) {
          setIsSaving(false);
          alert('Mindestens 2 Schritte benötigt.');
          return;
        }
        payload.content = { items };
      }
      if (lessonData.type === 'text-answer') {
        const c = (lessonData.content as any) || {};
        const raw: string = String(c.raw || '').replace(/\r/g,'');
        const caseSensitive = !!c.caseSensitive;
        const blocks = raw.split(/\n\s*\n+/).map((b:string)=>b.trim()).filter(Boolean).slice(0,50).map(b => {
          const lines = b.split(/\n+/).map(l=>l.trim()).filter(Boolean);
          if (!lines.length) return null;
            const question = lines[0];
            const answers = lines.slice(1).filter(l=>l.length>0);
            if (!question || answers.length===0) return null;
            return { question, answers };
        }).filter(Boolean) as Array<{ question: string; answers: string[] }>;        
        if (!blocks.length) {
          setIsSaving(false);
          alert('Mindestens ein gültiger Fragenblock benötigt.');
          return;
        }
        // API für text-answer bisher single question -> wir legen content.raw + blocks ab
  payload.content = { raw, blocks, caseSensitive, allowReveal: !!c.allowReveal };
        // Wir speichern außerdem eine synthetische Frage + erste Antwort für Abwärtskompatibilität
        const first = blocks[0];
        payload.content.question = first.question;
        payload.content.answer = first.answers[0];
      }

  if (lessonData.type === 'minigame' || lessonData.type === 'snake') {
        const c = (lessonData.content as any) || {} as SnakeContent;
        const raw = String(c.questions || '').replace(/\r/g,'');
        if (!raw.trim()) {
          setIsSaving(false);
          alert('Fragen/Antworten benötigt.');
          return;
        }
        // Parser: erste Zeile Frage, danach Antworten (erste Antwort = korrekt)
        const blocks = raw.split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean).map(block => {
          const lines = block.split(/\n+/).map(l=>l.trim()).filter(Boolean);
          if (lines.length < 3) return null; // mind. Frage + 2 Antworten
          const q = lines[0];
          const answerLines = lines.slice(1).slice(0,4);
          const answers = answerLines.map(l=> l.replace(/^\*/,'')).slice(0,4);
          if (!q || answers.length < 2) return null;
          return { question: q, answers, correct: 0 };
        }).filter(Boolean) as Array<{ question: string; answers: string[]; correct: number }>;
        if (!blocks.length) {
          setIsSaving(false);
          alert('Keine gültigen Snake-Fragen erkannt. Format: Frage\nRichtige Antwort\nFalsch ... (Leerzeile trennt nächste).');
          return;
        }
  const targetScore = Number(c.targetScore) || 10;
  const difficulty: 'einfach'|'mittel'|'schwer' = c.difficulty === 'schwer' ? 'schwer' : (c.difficulty === 'einfach' ? 'einfach' : 'mittel');
  const speed = difficulty === 'schwer' ? 140 : (difficulty === 'einfach' ? 220 : 180);
        payload.content = { blocks, targetScore, initialSpeedMs: speed, difficulty };
        // Redundante Sicherung: auch als questions speichern, damit Player Fallback hat
        (payload as any).questions = blocks.map(b => ({
          question: b.question,
          allAnswers: b.answers,
          correctAnswers: [b.answers[b.correct]]
        }));
      }

      // Wenn kein Kurs gewählt ist, lege eine eigenständige Übung im exercise-pool an
      const endpoint = courseId ? `/api/kurs/${courseId}/lektionen` : '/api/exercises';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ ${courseId ? 'Lektion' : 'Übung'} "${lessonData.title}" wurde erstellt!`);
        if (courseId) {
          router.push(inTeacher ? `/teacher/kurs/${courseId}` : `/autor/kurs/${courseId}`);
        } else {
          router.push(inTeacher ? '/teacher' : '/autor?tab=uebungen');
        }
      } else {
        alert(`❌ Fehler beim Erstellen: ${data.error || res.statusText}${data.details ? `\nDetails: ${data.details}` : ''}`);
      }
    } catch {
      alert("❌ Netzwerkfehler beim Erstellen der Lektion");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Snake Form Helper ---
  const renderSnake = () => {
    const c = lessonData.content as SnakeContent;
    const update = (patch: Partial<SnakeContent>) => setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), ...patch } }));
    // Live Parsing für Vorschau
    const raw = (c.questions || '').replace(/\r/g,'');
  const blocks = raw.split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean).map(block => {
      const lines = block.split(/\n+/).map(l=>l.trim()).filter(Boolean);
      if (lines.length < 2) return null;
      const q = lines[0];
      const answerLines = lines.slice(1);
      const answers = answerLines.map(l=> l.replace(/^\*/,'')).slice(0,4);
  // erste Antwort gilt als korrekt
  if (!q || answers.length < 2) return { invalid: true, raw: block } as any;
  return { question: q, answers, correct: 0 };
    }).filter(Boolean) as Array<{ question?: string; answers?: string[]; correct?: number; invalid?: boolean; raw?: string }>;
    const valid = blocks.filter(b=>!b.invalid);
    const invalid = blocks.filter(b=>b.invalid);
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Fragen & Antworten (Format)</label>
          <p className="text-xs text-gray-500 mb-2">Blöcke durch Leerzeile trennen. Erste Zeile = Frage. Erste Antwort darunter = richtig. Max 4 Antworten pro Frage.</p>
          <textarea value={c.questions} onChange={e=>update({ questions: e.target.value })} className="w-full h-64 p-3 border rounded font-mono text-xs" placeholder={'Frage 1\nRichtig\nFalsch A\nFalsch B\nFalsch C\n\nFrage 2\nRichtig\nFalsch\nFalsch\nFalsch'} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Ziel-Punktzahl</label>
            <input type="number" min={1} value={c.targetScore} onChange={e=>update({ targetScore: Number(e.target.value)||10 })} className="w-full border rounded px-3 py-2 text-sm" />
            <p className="text-[10px] text-gray-500 mt-1">Punkte zum Abschließen.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Schwierigkeit</label>
            <select value={c.difficulty} onChange={e=>update({ difficulty: e.target.value as 'einfach'|'mittel'|'schwer' })} className="w-full border rounded px-3 py-2 text-sm">
              <option value="einfach">Einfach</option>
              <option value="mittel">Mittel</option>
              <option value="schwer">Schwer</option>
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Einfach = langsam (220ms), Mittel = 180ms, Schwer = 140ms.</p>
          </div>
          <div className="text-xs text-gray-400 flex items-end pb-2 col-span-2">&nbsp;</div>
        </div>
        <div className="bg-gray-50 border rounded p-3 text-xs space-y-2">
          <div className="flex flex-wrap gap-4">
            <span><strong>{valid.length}</strong> gültige Aufgaben</span>
            {invalid.length>0 && <span className="text-red-600"><strong>{invalid.length}</strong> ungültig</span>}
            <span>Max 50 (Softlimit beim Absenden durch Backend)</span>
          </div>
          {valid.length === 0 && invalid.length === 0 && <div className="text-gray-500">Noch keine Blöcke erkannt.</div>}
          {valid.length > 0 && (
            <ol className="list-decimal pl-5 space-y-2">
              {valid.map((b,i)=>(
                <li key={i} className="bg-white border rounded p-2">
                  <div className="font-semibold mb-1">{b.question}</div>
                  <ul className="text-[11px] space-y-1">
                    {b.answers!.map((a,ai)=>(
                      <li key={ai} className={`px-2 py-1 rounded border ${ai===b.correct? 'bg-green-50 border-green-400':'bg-gray-50 border-gray-300'}`}>{a}{ai===b.correct && <span className="ml-1 text-green-600">✓</span>}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {invalid.length > 0 && (
            <div className="mt-3">
              <div className="font-semibold text-red-600 mb-1">Ungültige Blöcke</div>
              <ul className="list-disc pl-5 space-y-1">
                {invalid.slice(0,10).map((b,i)=>(<li key={i} className="text-[11px] text-red-700 break-words">{b.raw}</li>))}
              </ul>
              {invalid.length>10 && <div className="text-[10px] text-red-500 mt-1">… weitere {invalid.length-10} ausgeblendet</div>}
              <p className="text-[10px] text-red-500 mt-1">Format: Frage + mind. 2 Antworten. Erste Antwort = korrekt. Max 4 Antworten.</p>
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500 bg-gray-50 border rounded p-3 leading-relaxed">
          Beispiel:<br/>
          Frage 1<br/>
          Richtige Antwort<br/>
          Falsch A<br/>
          Falsch B<br/>
          Falsch C
        </div>
      </div>
    );
  };

  return (
  <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6">
  <a href={courseId ? (inTeacher ? `/teacher/kurs/${courseId}` : `/autor/kurs/${courseId}`) : (inTeacher ? '/teacher' : '/autor')} className="text-blue-600 hover:underline">
          ← Zurück {courseId ? "zum Kurs" : "zum Autorentool"}
        </a>
        {courseId && (
          <div className="mt-2 text-sm text-gray-600">
            Erstelle Lektion für Kurs: <strong>{courseTitle ?? courseId}</strong>
          </div>
        )}
      </div>
      
      <h1 className="text-2xl font-bold mb-6">
        {typeNames[type as keyof typeof typeNames]} erstellen
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Allgemeine Felder */}
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">Grundinformationen</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Lektionstitel</label>
            <input
              type="text"
              value={lessonData.title}
              onChange={(e) => setLessonData({...lessonData, title: e.target.value})}
              className="w-full p-3 border rounded"
              placeholder="z.B. Einführung in Variablen"
              required
            />
          </div>
          {!courseId && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Fach / Kategorie (optional)</label>
              <div>
                {/* Zentraler CategorySelect */}
                <CategorySelect value={(lessonData as any).category || ''} onChange={(v: string)=> setLessonData(prev => ({...prev, category: v} as any))} includeEmpty emptyLabel="— wählen —" label="" labelClassName="sr-only" selectClassName="w-full p-3 border rounded" />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Wird kein Kurs gewählt, kannst du hier ein Fach setzen.</p>
            </div>
          )}
        </div>

        {/* Typ-spezifische Felder */}
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">Lektionsinhalt</h3>
          
          {type === "text" && <TextLessonForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "quiz" && <QuizLessonForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "exercise" && <ExerciseLessonForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "video" && <VideoSimpleForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "single-choice" && <SingleChoiceForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "multiple-choice" && <MultiChoiceForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "markdown" && <MarkdownLessonForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "matching" && <MatchingLessonForm lessonData={lessonData} setLessonData={setLessonData} />}
          {/* Neu: Memory Formular */}
          {type === "memory" && <MemoryForm lessonData={lessonData} setLessonData={setLessonData} />}
          {/* Neu: Lückentext Formular */}
          {type === "lueckentext" && <LueckentextForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "ordering" && <OrderingForm lessonData={lessonData} setLessonData={setLessonData} />}
          {type === "text-answer" && <TextAnswerForm lessonData={lessonData} setLessonData={setLessonData} />}
          {(type === "minigame" /* alias snake wird oben konvertiert */) && renderSnake()}
        </div>

        {/* Aktionen */}
        <div className="flex justify-between">
          <a href={courseId ? (inTeacher ? `/teacher/kurs/${courseId}` : `/autor/kurs/${courseId}`) : (inTeacher ? '/teacher' : '/autor')} className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600">
            Abbrechen
          </a>
          <div className="space-x-3">
            <button type="button" className="bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700">
              Als Entwurf speichern
            </button>
            <button type="submit" disabled={isSaving} className={`px-6 py-2 rounded text-white ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
              {isSaving ? 'Wird erstellt…' : 'Lektion erstellen'}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

// Single Choice Form
function SingleChoiceForm({ lessonData: _lessonData, setLessonData: _setLessonData }: {
  lessonData: LessonFormState;
  setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>;
}) {
  // Direkt weiterleiten zum spezialisierten Editor
  const sp = useSearchParams();
  const cid = sp.get("courseId");
  const pathname = usePathname();
  const inTeacher = pathname?.startsWith('/teacher/');
  const router = useRouter();
  useEffect(()=>{
    router.replace(inTeacher ? `/teacher/lektion/single-choice${cid ? `?courseId=${cid}` : ''}` : `/autor/lektion/single-choice${cid ? `?courseId=${cid}` : ''}`);
  },[router, inTeacher, cid]);
  return <div className="text-sm text-gray-500">Weiterleitung zum Single Choice Editor…</div>;
}

// Text-Lektion Formular
function TextLessonForm({ lessonData, setLessonData }: {
  lessonData: LessonFormState;
  setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>;
}) {
  const content = (lessonData.content as TextContent) || { title: "", paragraphs: [""], keyPoints: [""] };
  const updateContent = (field: keyof TextContent, value: TextContent[keyof TextContent]) => {
    setLessonData({
      ...lessonData,
      content: { ...content, [field]: value }
    });
  };

  const addParagraph = () => {
    updateContent("paragraphs", [...content.paragraphs, ""]);
  };

  const addKeyPoint = () => {
    updateContent("keyPoints", [...content.keyPoints, ""]);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Untertitel</label>
        <input
          type="text"
          value={content.title}
          onChange={(e) => updateContent("title", e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Titel des Textabschnitts"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Textabsätze</label>
        {content.paragraphs.map((paragraph: string, index: number) => (
          <div key={index} className="mb-2">
            <textarea
              value={paragraph}
              onChange={(e) => {
                const newParagraphs = [...content.paragraphs];
                newParagraphs[index] = e.target.value;
                updateContent("paragraphs", newParagraphs);
              }}
              className="w-full p-2 border rounded h-20"
              placeholder={`Absatz ${index + 1}...`}
            />
          </div>
        ))}
        <button type="button" onClick={addParagraph} className="text-blue-600 hover:underline">
          + Absatz hinzufügen
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Wichtige Punkte</label>
        {content.keyPoints.map((point: string, index: number) => (
          <div key={index} className="mb-2">
            <input
              type="text"
              value={point}
              onChange={(e) => {
                const newPoints = [...content.keyPoints];
                newPoints[index] = e.target.value;
                updateContent("keyPoints", newPoints);
              }}
              className="w-full p-2 border rounded"
              placeholder={`Wichtiger Punkt ${index + 1}...`}
            />
          </div>
        ))}
        <button type="button" onClick={addKeyPoint} className="text-blue-600 hover:underline">
          + Punkt hinzufügen
        </button>
      </div>
    </div>
  );
}

// Quiz-Lektion Formular
function QuizLessonForm({ lessonData, setLessonData }: {
  lessonData: LessonFormState;
  setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>;
}) {
  const content = (lessonData.content as QuizContent) || { question: "", options: ["", "", "", ""], correctAnswer: "", explanation: "" };
  const updateContent = (field: keyof QuizContent, value: QuizContent[keyof QuizContent]) => {
    setLessonData({
      ...lessonData,
      content: { ...content, [field]: value }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Frage</label>
        <textarea
          value={content.question}
          onChange={(e) => updateContent("question", e.target.value)}
          className="w-full p-3 border rounded h-20"
          placeholder="Die Frage, die gestellt werden soll..."
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Antwortoptionen</label>
        {content.options.map((option: string, index: number) => (
          <div key={index} className="mb-2">
            <input
              type="text"
              value={option}
              onChange={(e) => {
                const newOptions = [...content.options];
                newOptions[index] = e.target.value;
                updateContent("options", newOptions);
              }}
              className="w-full p-2 border rounded"
              placeholder={`Option ${String.fromCharCode(65 + index)}...`}
              required
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Richtige Antwort</label>
        <select
          value={content.correctAnswer}
          onChange={(e) => updateContent("correctAnswer", e.target.value)}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Richtige Antwort wählen...</option>
          {content.options.map((option: string, index: number) => (
            <option key={index} value={option}>
              {String.fromCharCode(65 + index)}) {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Erklärung</label>
        <textarea
          value={content.explanation}
          onChange={(e) => updateContent("explanation", e.target.value)}
          className="w-full p-3 border rounded h-20"
          placeholder="Erklärung der richtigen Antwort..."
          required
        />
      </div>
    </div>
  );
}

// Übungs-Lektion Formular
function ExerciseLessonForm({ lessonData, setLessonData }: {
  lessonData: LessonFormState;
  setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>;
}) {
  const content = (lessonData.content as ExerciseContent) || { title: "", instruction: "", placeholder: "", sampleAnswer: "" };
  const updateContent = (field: keyof ExerciseContent, value: ExerciseContent[keyof ExerciseContent]) => {
    setLessonData({
      ...lessonData,
      content: { ...content, [field]: value }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Übungstitel</label>
        <input
          type="text"
          value={content.title}
          onChange={(e) => updateContent("title", e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Titel der Übung..."
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Aufgabenstellung</label>
        <textarea
          value={content.instruction}
          onChange={(e) => updateContent("instruction", e.target.value)}
          className="w-full p-3 border rounded h-24"
          placeholder="Was soll der Lernende tun?"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Platzhalter-Text</label>
        <textarea
          value={content.placeholder}
          onChange={(e) => updateContent("placeholder", e.target.value)}
          className="w-full p-3 border rounded h-20"
          placeholder="Text, der im Eingabefeld angezeigt wird..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Musterlösung</label>
        <textarea
          value={content.sampleAnswer}
          onChange={(e) => updateContent("sampleAnswer", e.target.value)}
          className="w-full p-3 border rounded h-24"
          placeholder="Die Musterlösung für die Aufgabe..."
          required
        />
      </div>
    </div>
  );
}

// Video-Lektion Formular
function VideoSimpleForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  const content = (lessonData.content as { youtubeUrl?: string; text?: string }) || { youtubeUrl: '', text: '' };
  const setContent = (patch: Partial<{ youtubeUrl: string; text: string }>) => {
    setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), ...patch } }));
  };
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">YouTube-Link oder Video-ID</label>
        <input
          type="text"
          value={content.youtubeUrl || ''}
          onChange={(e) => setContent({ youtubeUrl: e.target.value })}
          className="w-full p-2 border rounded"
          placeholder="https://youtu.be/dQw4w9WgXcQ oder dQw4w9WgXcQ"
          required
        />
        <p className="text-xs text-gray-500 mt-1">Unterstützt youtu.be, watch?v=…, /embed/… oder nur die Video-ID.</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Begleittext (optional, Markdown)</label>
        <textarea
          value={content.text || ''}
          onChange={(e) => setContent({ text: e.target.value })}
          className="w-full p-3 border rounded h-40 font-mono"
          placeholder="Optionaler Markdown-Text zum Video …"
        />
      </div>
      <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-3">
        Diese Video-Lektion gilt als abgeschlossen, wenn das Video komplett abgespielt wurde.
      </div>
    </div>
  );
}

// Markdown-Lektion Formular mit Live-Vorschau
function MarkdownLessonForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  const content = (lessonData.content as MarkdownContent) || { markdown: "" };
  const updateContent = (field: keyof MarkdownContent, value: MarkdownContent[keyof MarkdownContent]) => {
    setLessonData({
      ...lessonData,
      content: { ...content, [field]: value }
    });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Markdown-Inhalt</label>
          <textarea
            value={content.markdown || ""}
            onChange={(e) => updateContent("markdown", e.target.value)}
            className="w-full p-3 border rounded h-80 font-mono"
            placeholder="# Überschrift\n\nText, Bilder, Links, Listen …"
          />
          <p className="text-xs text-gray-500 mt-2">
            Unterstützt GitHub Flavored Markdown (GFM). Bilder/Audio werden automatisch aus <code className="bg-gray-100 px-1 rounded">/uploads</code> geladen,
            wenn du nur Dateinamen angibst, z. B. <code className="bg-gray-100 px-1 rounded">beispiel.jpg</code> oder <code className="bg-gray-100 px-1 rounded">beispiel.mp3</code>.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Vorschau</label>
          <div className="prose max-w-none border rounded p-3 bg-gray-50 overflow-auto h-80">
            <MarkdownPreview markdown={content.markdown || ""} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Lightweight Markdown Preview Komponente (Client)
function MarkdownPreview({ markdown }: { markdown: string }) {
  const [MD, setMD] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [gfm, setGfm] = useState<unknown>(null);
  // Dynamisch importieren nach Mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const m = await import('react-markdown');
      const g = await import('remark-gfm');
      if (mounted) {
        setMD(() => (m.default as unknown as React.ComponentType<Record<string, unknown>>));
        const gMod = g as { default?: unknown };
        setGfm(() => gMod.default ?? g );
      }
    })();
    return () => { mounted = false; };
  }, []);
  if (!MD) return <div className="text-gray-400">Lade Vorschau…</div>;
  const Comp = MD;
  // Renderer für Bilder und Links: Dateinamen => /uploads, Audio-Links => Player
  const components = {
    h1: (props: any) => <h1 className="text-2xl font-bold mb-3 mt-1" {...props} />,
    h2: (props: any) => <h2 className="text-xl font-semibold mb-2 mt-4" {...props} />,
    h3: (props: any) => <h3 className="text-lg font-semibold mb-2 mt-3" {...props} />,
    h4: (props: any) => <h4 className="text-base font-semibold mb-2 mt-3" {...props} />,
    p: (props: any) => <p className="mb-2" {...props} />,
    ul: (props: any) => <ul className="list-disc pl-6 mb-2" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-6 mb-2" {...props} />,
    li: (props: any) => <li className="list-item" {...props} />,
    code: (props: any) => <code className="bg-gray-100 px-1 py-0.5 rounded text-[85%]" {...props} />,
    pre: (props: any) => <pre className="bg-gray-900 text-white p-3 rounded mb-3 overflow-auto text-sm" {...props} />,
    img: (props: any) => {
      const src: string = resolveMediaPath(String(props.src || ''));
      const alt = props.alt || '';
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={alt} className="max-w-full" />;
    },
    a: (props: any) => {
      const href: string = resolveMediaPath(String(props.href || ''));
      if (isAudioPath(href)) {
        return <audio controls className="w-full max-w-md"><source src={href} /></audio>;
      }
      return <a href={href} target="_blank" rel="noopener noreferrer">{props.children}</a>;
    }
  } as const;
  return <Comp remarkPlugins={gfm ? [gfm] : []} components={components as any}>{markdown}</Comp>;
}

// Multiple Choice Form
function MultiChoiceForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  const [preview, setPreview] = useState<Array<{ question: string; mediaLink?: string; corrects: string[]; wrongs: string[]; all: string[] }>>([]);
  const update = (value: string) => {
    const current = (lessonData.content as MultipleChoiceContent) || { text: "" };
    setLessonData({ ...lessonData, content: { ...current, text: value } });
  };

  useEffect(() => {
    // einfache Client-Vorschau des Parsings
    const text = ((lessonData.content as MultipleChoiceContent) || { text: '' }).text || '';
    const blocks = text.trim().split(/\n\s*\n/).map((b: string) => b.trim()).filter(Boolean);
    const parsed: Array<{ question: string; mediaLink?: string; corrects: string[]; wrongs: string[]; all: string[] }> = [];
    for (const block of blocks) {
      const lines = block.split(/\n/).map((l: string) => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;
      let q = lines[0];
      let media = '';
      const m = q.match(/^(.+?)\s*\[(.+?)\]$/);
      if (m) { q = m[1].trim(); media = resolveMediaPath(m[2].trim()); }
      const ans = lines.slice(1);
      const corrects = ans.filter((a: string) => a.startsWith('*')).map((a: string) => a.replace(/^\*+/, '').trim());
      const wrongs = ans.filter((a: string) => !a.startsWith('*'));
      parsed.push({ question: q, mediaLink: media || undefined, corrects, wrongs, all: [...corrects, ...wrongs] });
    }
    setPreview(parsed);
  }, [lessonData.content]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Fragen (Stern = richtige Antwort)</label>
        <textarea
          value={((lessonData.content as MultipleChoiceContent) || { text: '' }).text || ''}
          onChange={(e) => update(e.target.value)}
          className="w-full h-64 p-3 border rounded font-mono text-sm"
          placeholder={`Frage 1 [beispiel.jpg]\n*richtige Antwort\nfalsche Antwort\n*weitere richtige Antwort\n\nFrage 2\n*Richtig\nFalsch`}
        />
  <p className="text-xs text-gray-500 mt-2">Mehrere richtige Antworten mit * markieren.</p>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Vorschau</h4>
        {preview.length === 0 ? (
          <div className="text-gray-500">Noch keine gültigen Blöcke gefunden.</div>
        ) : (
          <div className="space-y-4">
            {preview.map((p, i) => (
              <div key={i} className="border rounded p-3 bg-gray-50">
                <div className="font-semibold mb-2">Frage {i + 1}: {p.question}</div>
                {p.mediaLink && (
                  <div className="mb-2 p-2 bg-gray-100 rounded border">
                    {isImagePath(p.mediaLink) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveMediaPath(p.mediaLink)} alt="Frage Media" className="max-w-full max-h-48 object-contain border rounded bg-white" />
                    ) : isAudioPath(p.mediaLink) ? (
                      <audio controls className="w-full max-w-md"><source src={resolveMediaPath(p.mediaLink)} /></audio>
                    ) : (
                      <a href={resolveMediaPath(p.mediaLink)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">📎 {resolveMediaPath(p.mediaLink)}</a>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  {p.all.map((a: string, idx: number) => (
                    <div key={idx} className={`p-2 rounded border ${p.corrects.includes(a) ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300'}`}>
                      {a} {p.corrects.includes(a) && <span className="text-green-600 ml-2">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Matching-Lektion Formular
function MatchingLessonForm({ lessonData, setLessonData }: {
  lessonData: LessonFormState;
  setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>;
}) {
  const content = (lessonData.content as { text?: string }) || { text: "" };
  const setText = (text: string) => setLessonData({ ...lessonData, content: { ...content, text } });

  // Vorschau nach Blöcken gruppieren
  const blocks = (content.text || '').trim().split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded p-4">
        <h4 className="font-semibold text-blue-800 mb-2">🔗 Paare finden – Eingabeformat</h4>
        <p className="text-sm text-blue-900">
          Je Aufgabe ein Block. Blöcke durch eine Leerzeile trennen. Jede Zeile ist ein Paar: LINKS|RECHTS. Max. 5 Paare pro Block.<br/>
          Links/Rechts können Text, Bilder (.jpg/.png/.gif/.webp) oder Audio (.mp3/.wav/.ogg/.m4a) sein. Dateinamen werden automatisch aus <code className="bg-blue-100 px-1 rounded">/uploads</code> geladen.
          <br/>
          Beispiel:<br/>
          Hund|beispiel.jpg<br/>
          Ton|beispiel.mp3<br/>
          1+8|9
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Paare-Blöcke</label>
        <textarea
          className="w-full p-3 border rounded h-56"
          value={content.text || ''}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Hund|beispiel.jpg\nTon|beispiel.mp3\n1+8|9\n\n2+5|7\n1+2|3"}
        />
        <p className="text-xs text-gray-500 mt-1">Trenne Aufgaben durch eine Leerzeile. Mindestens 2 Paare pro Block.</p>
      </div>

      <div className="bg-gray-50 p-3 rounded">
        <h5 className="font-medium mb-2">Vorschau</h5>
        {blocks.length === 0 ? (
          <div className="text-gray-500 text-sm">Keine Blöcke erkannt.</div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, bi) => {
              const pairs = block.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0,5).map(line => {
                const [l, r] = line.split('|');
                const L = (l||'').trim();
                const R = (r||'').trim();
                return { l: L, r: R };
              }).filter(p => p.l && p.r);
              return (
                <div key={bi} className="border rounded p-3 bg-white">
                  <div className="text-sm text-gray-600 mb-2">Aufgabe {bi + 1}</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {pairs.map((p, idx) => {
                      const Lr = (isImagePath(p.l) || isAudioPath(p.l)) ? resolveMediaPath(p.l) : p.l;
                      const Rr = (isImagePath(p.r) || isAudioPath(p.r)) ? resolveMediaPath(p.r) : p.r;
                      const renderSide = (val: string) => {
                        const v = val.trim();
                        // Bilder/Audio inkl. http/https mit Query/Hash
                        if (isImagePath(v)) return (<div className="h-14 flex items-center justify-center overflow-hidden bg-white border rounded"><img src={v} alt="" className="max-h-14 max-w-full object-contain" /></div>);
                        if (isAudioPath(v)) return (<div className="h-14 flex items-center justify-center bg-white border rounded px-1"><audio controls className="w-full"><source src={v} /></audio></div>);
                        // Normale URLs als Link rendern
                        if (/^https?:\/\//i.test(v)) return (<div className="h-14 flex items-center justify-center text-center px-1 break-words bg-white border rounded"><a href={v} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{v}</a></div>);
                        return (<div className="h-14 flex items-center justify-center text-center px-1 break-words bg-white border rounded">{v}</div>);
                      };
                      return (
                        <div key={idx} className="contents">
                          {renderSide(Lr)}
                          {renderSide(Rr)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// (Erklärvideo Formular entfernt – durch VideoSimpleForm ersetzt)

// Neu: Memory Formular
function MemoryForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  // Funktion gibt JSX zurück
  const content = (lessonData.content as { text?: string }) || {};
  const setContent = (text: string) => setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), text } }));

  // Parsing
  const raw = content.text || '';
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  type MPair = { a: { kind: string; value: string }; b: { kind: string; value: string } };
  const pairs: MPair[] = [];
  const warnings: string[] = [];
  const detect = (v: string) => /\.(png|jpe?g|gif|webp)$/i.test(v) || (/^https?:\/\//i.test(v) && /(png|jpe?g|gif|webp)(\?|$)/i.test(v)) ? 'image' : (/\.(mp3|wav|ogg|m4a)$/i.test(v) || (/^https?:\/\//i.test(v) && /(mp3|wav|ogg|m4a)(\?|$)/i.test(v)) ? 'audio' : 'text');
  for (let i = 0; i < lines.length; i++) {
    if (pairs.length >= 8) { warnings.push('Weitere Zeilen ignoriert (max 8 Paare)'); break; }
    const line = lines[i];
    if (!line.includes('|')) { warnings.push(`Zeile ${i+1}: kein | gefunden`); continue; }
    const [lRaw, rRaw] = line.split('|');
    const L = (lRaw||'').trim(); const R = (rRaw||'').trim();
    if (!L || !R) { warnings.push(`Zeile ${i+1}: unvollständig`); continue; }
    if (L.toLowerCase() === R.toLowerCase()) { warnings.push(`Zeile ${i+1}: identische Seiten`); continue; }
    const key = (L+':::'+R).toLowerCase();
    if (seen.has(key)) { warnings.push(`Zeile ${i+1}: doppeltes Paar`); continue; }
    seen.add(key);
    pairs.push({ a: { kind: detect(L), value: L }, b: { kind: detect(R), value: R } });
  }
  const tooFew = pairs.length > 0 && pairs.length < 4;
  const tooMany = pairs.length > 8; // sollte nicht passieren wegen early break

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">4–8 Paare. Jede Zeile: LINKS|RECHTS. Medien: Bilder (.jpg/.png/.gif/.webp) oder Audio (.mp3/.wav/.ogg/.m4a) oder Text.</p>
      <textarea
        value={content.text || ''}
        onChange={e => setContent(e.target.value)}
        className="w-full h-56 p-3 border rounded font-mono text-sm"
        placeholder={"Hund|dog.jpg\n1+4|5\nTon|audio.mp3"}
      />
      <div className="text-xs flex flex-wrap gap-3 text-gray-500">
        <span>Gefundene Paare: {pairs.length}</span>
        {tooFew && <span className="text-red-600">Mind. 4 Paare benötigt</span>}
        {pairs.length >= 4 && pairs.length <= 8 && <span className="text-green-600">Anzahl ok</span>}
      </div>
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 space-y-1 max-h-32 overflow-auto">
          {warnings.map((w,i) => <div key={i}>• {w}</div>)}
        </div>
      )}
      <div>
        <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">Vorschau <span className="text-gray-400 font-normal">({pairs.length})</span></h4>
        {pairs.length === 0 ? (
          <div className="text-gray-400 text-sm">Noch keine gültigen Paare erkannt.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pairs.map((p, idx) => (
              <div key={idx} className="border rounded p-2 bg-gray-50 text-xs flex flex-col gap-1">
                <MemoryPreviewSide side={p.a} />
                <div className="text-center text-gray-400 text-[10px]">↕</div>
                <MemoryPreviewSide side={p.b} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryPreviewSide({ side }: { side: { kind: string; value: string } }) {
  if (side.kind === 'image') return <div className="h-14 flex items-center justify-center overflow-hidden bg-white border rounded"><img src={side.value} alt="" className="max-h-14 max-w-full object-contain" /></div>;
  if (side.kind === 'audio') return <div className="h-14 flex items-center justify-center bg-white border rounded px-1"><audio controls className="w-full"><source src={side.value} /></audio></div>;
  return <div className="h-14 flex items-center justify-center text-center px-1 break-words bg-white border rounded">{side.value}</div>;
}

// Neu: Lückentext Formular
function LueckentextForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  const content = (lessonData.content as any) || { markdown: '', mode: 'input' };
  const update = (patch: any) => setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), ...patch } }));
  const text = content.markdown || '';
  // Extrahiere Lösungen: *wort*
  const matches = Array.from(text.matchAll(/\*(.+?)\*/g)).map(m => (m as RegExpMatchArray)[1]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Setze korrekte Lösungen in *Sternchen*. Beispiel: Die Hauptstadt von *Österreich* ist *Wien*.</p>
      <textarea value={text} onChange={e => update({ markdown: e.target.value })} className="w-full h-64 p-3 border rounded font-mono text-sm" placeholder="Text mit *Lücken* hier..." />
      <div className="flex flex-wrap gap-3 items-center text-xs text-gray-600">
        <span><strong>{matches.length}</strong> Lösungen erkannt</span>
        <label className="flex items-center gap-2 text-xs">Modus:
          <select value={content.mode || 'input'} onChange={e => update({ mode: e.target.value })} className="border rounded p-1 text-xs">
            <option value="input">Eingabe</option>
            <option value="drag">Drag & Drop</option>
          </select>
        </label>
      </div>
      {matches.length > 0 && (
        <div className="bg-gray-50 border rounded p-2 text-xs flex flex-wrap gap-2">
          {matches.map((m,i) => <span key={i} className="px-2 py-1 bg-white border rounded">{m}</span>)}
        </div>
      )}
      <p className="text-xs text-gray-500">Markdown wird unterstützt. Lösungen werden im Spieler-Modus ausgeblendet und durch Lücken ersetzt.</p>
    </div>
  );
}

// Neu: Ordering Formular (Reihenfolge festlegen)
function OrderingForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  const content = (lessonData.content as any) || { raw: '', items: [] };
  const raw: string = content.raw || '';
  const lines = raw.split(/\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0).slice(0,10);
  const items = lines;
  const [previewOrder, setPreviewOrder] = useState<string[]>([]);
  // shuffle helper
  const shuffle = <T,>(arr: T[]) => arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
  // reset preview when items change
  useEffect(() => {
    if (items.length >= 2) {
      setPreviewOrder(shuffle(items));
    } else {
      setPreviewOrder(items);
    }
  }, [raw]);
  const movePreview = (idx: number, dir: -1|1) => {
    setPreviewOrder(list => {
      const ni = idx + dir; if (ni < 0 || ni >= list.length) return list; const copy=[...list]; const t=copy[idx]; copy[idx]=copy[ni]; copy[ni]=t; return copy; });
  };
  const reshuffle = () => { if (items.length>=2) setPreviewOrder(shuffle(items)); };
  const updateRaw = (v: string) => {
    const parsed = v.split(/\n/).map(l=>l.trim()).filter(l=>l).slice(0,10);
    setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), raw: v, items: parsed } }));
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Jede Zeile ein Schritt / Ereignis in korrekter Reihenfolge (oben = zuerst). 2–10 Zeilen.</p>
      <textarea value={raw} onChange={e => updateRaw(e.target.value)} className="w-full h-56 p-3 border rounded font-mono text-sm" placeholder={'Schritt 1\nSchritt 2\nSchritt 3'} />
      <div className="text-xs text-gray-500 flex gap-4 flex-wrap">
        <span>Erkannt: {items.length}/10</span>
        {items.length < 2 && <span className="text-red-600">Mindestens 2</span>}
        {items.length >=2 && <span className="text-green-600">OK</span>}
      </div>
      <div className="bg-gray-50 border rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Vorschau (Spieler-Sicht mit Pfeilen)</h4>
          <button type="button" onClick={reshuffle} disabled={items.length<2} className={`text-xs px-2 py-1 border rounded ${items.length<2? 'opacity-40 cursor-not-allowed':'hover:bg-white'}`}>Neu mischen</button>
        </div>
        {items.length < 2 ? <div className="text-gray-400 text-sm">Mindestens 2 Zeilen für Vorschau.</div> : (
          <ul className="space-y-2">
            {previewOrder.map((step, idx) => (
              <li key={idx} className="flex items-center gap-2 border rounded p-2 bg-white text-xs">
                <div className="flex flex-col gap-1 justify-center">
                  <button type="button" onClick={()=>movePreview(idx,-1)} disabled={idx===0} className={`w-6 h-6 border rounded ${idx===0? 'opacity-30 cursor-not-allowed':'hover:bg-gray-50'}`}>↑</button>
                  <button type="button" onClick={()=>movePreview(idx,1)} disabled={idx===previewOrder.length-1} className={`w-6 h-6 border rounded ${idx===previewOrder.length-1? 'opacity-30 cursor-not-allowed':'hover:bg-gray-50'}`}>↓</button>
                </div>
                <div className="flex-1 whitespace-pre-wrap">{step}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-gray-500">Die Speicherung nutzt die ursprüngliche Reihenfolge der Eingabe (nicht die hier im Preview veränderte Reihenfolge).</p>
      </div>
    </div>
  );
}

// Neu: Text-Antwort Formular
function TextAnswerForm({ lessonData, setLessonData }: { lessonData: LessonFormState; setLessonData: React.Dispatch<React.SetStateAction<LessonFormState>>; }) {
  /* Neues Mehrfragen-Format:
     Block-Struktur:
     Frage 1\n
     richtige Antwort\n
     alternative richtige Antwort\n
     \n
     Frage 2\n
     richtige Antwort
     -> Leere Zeile trennt Blöcke.
  */
  const content = (lessonData.content as any) || { raw: '', blocks: [], caseSensitive: false, allowReveal: false };
  const raw: string = content.raw || '';
  const caseSensitive: boolean = !!content.caseSensitive;
  const allowReveal: boolean = !!content.allowReveal;
  const parseBlocks = (text: string) => {
    const blocksRaw = text.replace(/\r/g,'').split(/\n\s*\n+/).map(b=>b.trim()).filter(b=>b.length>0);
    const blocks = blocksRaw.slice(0,50).map(b => {
      const lines = b.split(/\n+/).map(l=>l.trim()).filter(l=>l.length>0);
      if (lines.length === 0) return null;
      let qLine = lines[0];
      let media: string | undefined;
      const m = qLine.match(/^(.+?)\s*\[(.+?)\]$/); // Frage [media]
      if (m) { qLine = m[1].trim(); media = m[2].trim(); }
      const answers = lines.slice(1).filter(a=>a.length>0);
      return { question: qLine, answers: answers.length? answers : [], media };
    }).filter(Boolean) as Array<{ question: string; answers: string[]; media?: string }>;
    return blocks;
  };
  const blocks = parseBlocks(raw);
  const updateRaw = (v: string) => {
    setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), raw: v, blocks: parseBlocks(v) } }));
  };
  const toggleCase = (v: boolean) => setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), caseSensitive: v } }));
  const toggleReveal = (v: boolean) => setLessonData(ld => ({ ...ld, content: { ...(ld.content as any), allowReveal: v } }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Format: Blöcke durch Leerzeile trennen. Erste Zeile = Frage optional mit <code className="bg-gray-100 px-1 rounded">[media.jpg]</code> oder <code className="bg-gray-100 px-1 rounded">[audio.mp3]</code>. Folgezeilen = gültige Antworten. Mindestens 1 Antwort. Alle Antworten gelten als korrekt.</p>
      <textarea value={raw} onChange={e=>updateRaw(e.target.value)} className="w-full h-72 p-3 border rounded font-mono text-sm" placeholder={'Was ist die Hauptstadt von Frankreich? [paris.jpg]\nParis\n\nNenne eine Primzahl kleiner als 5\n2\n3\n5'} />
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input id="taCase" type="checkbox" checked={caseSensitive} onChange={e=>toggleCase(e.target.checked)} className="h-4 w-4" />
          <span>Groß-/Kleinschreibung beachten <span className="text-xs text-gray-400">(Antwortprüfung)</span></span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowReveal} onChange={e=>toggleReveal(e.target.checked)} className="h-4 w-4" />
          <span>Spieler darf Lösung anzeigen (Frage wird am Ende erneut gestellt)</span>
        </label>
      </div>
      <div className="bg-gray-50 border rounded p-3 text-xs">
        <div className="font-semibold mb-2">Vorschau ({blocks.length} Fragen)</div>
        {blocks.length === 0 && <div className="text-gray-400">Keine gültigen Blöcke erkannt.</div>}
        {blocks.length > 0 && (
          <ol className="list-decimal pl-5 space-y-2">
            {blocks.map((b,i)=>(
              <li key={i} className="bg-white border rounded p-2 space-y-1">
                <div className="font-medium text-sm flex items-center gap-2">{b.question}{b.media && <span className="text-xs text-blue-600 break-all">📎 {b.media}</span>}</div>
                {b.answers.length === 0 ? <div className="text-xs text-red-600">(Keine Antworten)</div> : (
                  <ul className="text-xs text-gray-600 list-disc pl-4">
                    {b.answers.map((a,ai)=><li key={ai}><code className="bg-gray-100 px-1 py-0.5 rounded">{a}</code></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 text-[10px] text-gray-500 flex flex-wrap gap-4">
          <span>Fragen: {blocks.length}</span>
          <span>Ø Antworten: {blocks.length ? Math.round(blocks.reduce((s,b)=>s + (b.answers.length||0),0)/blocks.length) : 0}</span>
          <span>Max 50 Fragen</span>
          {allowReveal && <span>Lösung zeigen erlaubt</span>}
        </div>
      </div>
    </div>
  );
}
