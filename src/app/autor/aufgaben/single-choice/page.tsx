"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SCQuestion {
  question: string;
  mediaLink?: string;
  correctAnswer: string;
  wrongAnswers: string[];
  allAnswers: string[];
}

interface CourseItem { _id: string; title: string }

export default function SingleChoiceEditorPage() {
  const router = useRouter();
  const [questionsText, setQuestionsText] = useState(`Frage 1 [diagramm.jpg]
Richtige Antwort hier
Falsche Antwort 1
Falsche Antwort 2
Falsche Antwort 3

Frage 2 [beispiel.jpg]
Eine andere richtige Antwort
Falsche Option A
Falsche Option B

Frage 3 [beispiel.mp3]
Audio-Frage Antwort
Falsche Audio-Antwort`);
  const [parsedQuestions, setParsedQuestions] = useState<SCQuestion[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const res = await fetch('/api/kurse');
        if (res.ok) {
          const data = await res.json();
          const list = (Array.isArray(data) ? data : (data.courses || [])) as Array<Partial<CourseItem>>;
          const normalized: CourseItem[] = list
            .filter((c): c is CourseItem => typeof c?._id === 'string' && typeof c?.title === 'string')
            .map((c) => ({ _id: c._id!, title: c.title! }));
          setCourses(normalized);
          if (normalized.length === 1) setSelectedCourse(normalized[0]._id);
        }
      } catch (e) {
        console.error('Kurse laden fehlgeschlagen', e);
      }
    };
    loadCourses();
  }, []);

  const parseQuestions = () => {
    const blocks = questionsText.trim().split('\n\n');
    const questions: SCQuestion[] = [];
    for (const block of blocks) {
      const lines = block.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) continue;
      const firstLine = lines[0];
      let questionText = '';
      let mediaLink = '';
      const mediaMatch = firstLine.match(/^(.+?)\s*\[(.+?)\]$/);
      if (mediaMatch) {
        questionText = mediaMatch[1].trim();
        mediaLink = mediaMatch[2].trim();
      } else {
        questionText = firstLine;
      }
      const answers = lines.slice(1);
      const correctAnswer = answers[0];
      const wrongAnswers = answers.slice(1);
      questions.push({
        question: questionText,
        mediaLink: mediaLink || undefined,
        correctAnswer,
        wrongAnswers,
        allAnswers: [correctAnswer, ...wrongAnswers].sort(() => Math.random() - 0.5)
      });
    }
    setParsedQuestions(questions);
    setShowPreview(true);
  };

  const handleSave = async () => {
    if (!selectedCourse) {
      setSaveMessage('Bitte zuerst einen Kurs auswählen');
      return;
    }
    if (parsedQuestions.length === 0) {
      setSaveMessage('Keine Fragen geparst');
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/kurs/${selectedCourse}/lektionen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Single Choice Quiz',
          type: 'single-choice',
          questions: parsedQuestions
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveMessage('✅ Gespeichert');
        setTimeout(() => {
          router.push(`/autor/kurs/${selectedCourse}`);
        }, 1200);
      } else {
        setSaveMessage('❌ Fehler: ' + (data.error || 'Unbekannt'));
      }
    } catch (e) {
      console.error(e);
      setSaveMessage('❌ Netzwerk-/Serverfehler');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6 flex items-center justify-between">
        <a href="/autor" className="text-blue-600 hover:underline">← Zurück</a>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Kurs:</label>
          <select
            value={selectedCourse}
            onChange={e => setSelectedCourse(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">-- Kurs wählen --</option>
            {courses.map(c => (
              <option key={c._id} value={c._id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-6">📝 Single Choice Fragen Editor</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Eingabe */}
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">✏️ Fragen eingeben</h3>
          <textarea
            value={questionsText}
            onChange={e => setQuestionsText(e.target.value)}
            className="w-full h-96 p-3 border rounded font-mono text-sm"
          />
          <div className="flex gap-3 mt-4">
            <button onClick={parseQuestions} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">🔍 Vorschau</button>
            {showPreview && (
              <button onClick={handleSave} disabled={saving} className="bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded hover:bg-green-700">{saving ? 'Speichert...' : '💾 Speichern'}</button>
            )}
          </div>
          {saveMessage && (
            <div className="mt-3 text-sm">{saveMessage}</div>
          )}
        </div>
        {/* Vorschau */}
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau</h3>
          {!showPreview && <div className="text-gray-500 text-center py-8">Noch keine Vorschau</div>}
          {showPreview && (
            <div className="space-y-6 max-h-[600px] overflow-auto pr-2">
              {parsedQuestions.map((q, i) => (
                <div key={i} className="border rounded p-4 bg-gray-50">
                  <div className="mb-2 text-sm font-medium text-blue-700">Frage {i + 1}</div>
                  <h4 className="font-semibold mb-3">{q.question}</h4>

                  {/* Medien-Vorschau: Bild, Audio oder Link */}
                  {q.mediaLink && (
                    <div className="mb-3">
                      {q.mediaLink.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={q.mediaLink}
                            alt="Fragen-Medien"
                            className="max-h-60 rounded border"
                            onError={(e) => {
                              const parent = (e.target as HTMLImageElement).parentElement;
                              if (parent) {
                                parent.innerHTML = `<p class=\"text-red-600 text-sm\">❌ Bild konnte nicht geladen werden: ${q.mediaLink}</p>`;
                              }
                            }}
                          />
                        </div>
                      ) : q.mediaLink.match(/\.(mp3|wav|ogg|m4a)$/i) ? (
                        <audio controls className="w-full">
                          <source src={q.mediaLink} />
                          Dein Browser unterstützt das Audio-Element nicht.
                          <a
                            href={q.mediaLink}
                            target="_blank"
                            rel="noreferrer"
                            className="underline text-blue-600 ml-1"
                          >
                            Audio öffnen
                          </a>
                        </audio>
                      ) : (
                        <a
                          href={q.mediaLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline break-all"
                        >
                          📎 {q.mediaLink}
                        </a>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    {q.allAnswers.map((ans: string, idx: number) => (
                      <div key={idx} className={`p-2 border rounded text-sm ${ans === q.correctAnswer ? 'bg-green-50 border-green-300' : 'bg-white'}`}>{ans}{ans === q.correctAnswer && ' ✓'}</div>
                    ))}
                  </div>
                </div>
              ))}
              {parsedQuestions.length === 0 && <div className="text-center text-gray-500">Keine gültigen Fragen</div>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
