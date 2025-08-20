"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import CategorySelect from '@/components/shared/CategorySelect';
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { resolveMediaPath, isImagePath, isAudioPath } from '@/lib/media';

interface SCQuestion {
  question: string;
  mediaLink?: string;
  correctAnswer: string;
  wrongAnswers: string[];
  allAnswers: string[];
}

export default function SingleChoiceLektionPage() {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto mt-10 p-6">Lädt…</main>}>
      <SingleChoiceLektionPageInner />
    </Suspense>
  );
}

function SingleChoiceLektionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const pathname = usePathname();
  const inTeacher = pathname?.startsWith('/teacher/');
  
  const [title, setTitle] = useState('');
  const [courseName, setCourseName] = useState('');
  const [questionsText, setQuestionsText] = useState(`Frage 1 [diagramm.jpg]
Richtige Antwort hier
Falsche Antwort 1
Falsche Antwort 2

Frage 2 [beispiel.jpg]
Eine andere richtige Antwort
Falsche Option A
Falsche Option B

Frage 3 [beispiel.mp3]
Audio-Frage Antwort
Falsche Audio-Antwort`);

  const [parsedQuestions, setParsedQuestions] = useState<SCQuestion[]>([]);
  const [showPreview, setShowPreview] = useState(true); // Direkt Vorschau aktiv
  const [standaloneCategory, setStandaloneCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Lade den Kursnamen
  const loadCourseName = useCallback(async () => {
    if (!courseId) return;
    try {
      const response = await fetch(`/api/kurs/${courseId}`);
      const data = await response.json();
      
      if (data.success && data.course) {
        setCourseName(data.course.title);
      }
    } catch (error) {
      console.error('Fehler beim Laden des Kursnamens:', error);
    }
  }, [courseId]);

  useEffect(() => {
    if (courseId) {
      loadCourseName();
    }
  }, [courseId, loadCourseName]);

  const parseQuestions = () => {
    const blocks = questionsText.trim().split('\n\n');
    const questions: SCQuestion[] = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n').filter(line => line.trim());
      if (lines.length < 2) continue;

      const firstLine = lines[0];
      let questionText = '';
      let mediaLink = '';

      // Check for media link in brackets
      const mediaMatch = firstLine.match(/^(.+?)\s*\[(.+?)\]$/);
      if (mediaMatch) {
        questionText = mediaMatch[1].trim();
        mediaLink = resolveMediaPath(mediaMatch[2].trim());
      } else {
        questionText = firstLine;
      }

  const answers = lines.slice(1);
      const correctAnswer = answers[0];
      const wrongAnswers = answers.slice(1);

      questions.push({
        question: questionText,
  mediaLink: mediaLink ? resolveMediaPath(mediaLink) : '',
        correctAnswer,
        wrongAnswers,
        allAnswers: [correctAnswer, ...wrongAnswers].sort(() => Math.random() - 0.5)
      });
    }

  setParsedQuestions(questions);
  };

  // Live-Parsing: initial und bei Änderungen (debounced)
  useEffect(() => {
    // initial parse
    parseQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = setTimeout(() => { parseQuestions(); }, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsText]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Bitte gib einen Titel für die Lektion ein');
      return;
    }

  if (parsedQuestions.length === 0) parseQuestions();

    setIsSaving(true);
    try {
  const lessonData: any = {
        title: title.trim(),
        type: 'single-choice' as const,
        questions: parsedQuestions, // Direkt auf oberster Ebene für MongoDB
        description: `Single Choice Quiz mit ${parsedQuestions.length} Fragen`
      };
  if (!courseId && standaloneCategory.trim()) lessonData.category = standaloneCategory.trim();

      if (courseId) {
        // Als Lektion zum Kurs hinzufügen
        const response = await fetch(`/api/kurs/${courseId}/lektionen`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lessonData)
        });

        const result = await response.json();

        if (result.success) {
          alert(`✅ Lektion "${title}" wurde erfolgreich erstellt!`);
          router.push(inTeacher ? `/teacher/kurs/${courseId}` : `/autor/kurs/${courseId}`);
        } else {
          alert(`❌ Fehler: ${result.error}`);
        }
      } else {
        // Als eigenständige Übung speichern über /api/exercises (exercise-pool)
        const response = await fetch('/api/exercises', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...lessonData,
            title: title.trim(),
            category: standaloneCategory.trim() || undefined
          })
        });

        const result = await response.json();

        if (result.success) {
          alert(`✅ Übung "${title}" wurde erstellt!`);
          router.push(inTeacher ? '/teacher' : '/autor?tab=uebungen');
        } else {
          alert(`❌ Fehler: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('❌ Fehler beim Speichern der Lektion');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6">
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => router.back()}
        >
          ← Zurück
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-6">📝 Single Choice Quiz erstellen</h1>

      {/* Titel Input */}
      <div className="bg-white border rounded p-6 mb-6">
        <h3 className="font-semibold mb-4">📋 Lektions-Details</h3>
          <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Titel der Lektion *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 border rounded"
            placeholder="z.B. JavaScript Grundlagen Quiz"
            required
          />
        </div>
          {!courseId && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Fach / Kategorie (optional)</label>
              {/* Zentraler CategorySelect */}
              <CategorySelect value={standaloneCategory} onChange={setStandaloneCategory} includeEmpty emptyLabel="— wählen —" label="" labelClassName="sr-only" selectClassName="w-full p-3 border rounded" />
            </div>
          )}
        {courseId && (
          <p className="text-sm text-gray-600">
            Diese Lektion wird zu Kurs: <strong>{courseName || courseId}</strong> hinzugefügt
            {!courseName && <span className="ml-2 text-xs">(Lade Kursname...)</span>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Bereich */}
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">✏️ Fragen eingeben</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Format: Frage [optional: Link] → Richtige Antwort → Falsche Antworten
            </label>
            <textarea
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              className="w-full h-96 p-3 border rounded font-mono text-sm"
              placeholder={`Frage 1 [diagramm.jpg]
Richtige Antwort hier
Falsche Antwort 1
Falsche Antwort 2

Frage 2 [beispiel.jpg]
Eine andere richtige Antwort
Falsche Option A
Falsche Option B

Frage 3 [beispiel.mp3]
Audio-Frage Antwort
Falsche Audio-Antwort`}
            />
          </div>

          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs text-gray-500">Vorschau aktualisiert automatisch</span>
            <button
              type="button"
              onClick={handleSave}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              disabled={isSaving}
            >{isSaving ? '⏳ Speichern...' : '💾 Speichern'}</button>
          </div>

      {/* Format Hilfe */}
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h4 className="font-semibold text-blue-800 mb-2">📋 Format-Regeln:</h4>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• <strong>Erste Zeile:</strong> Frage (optional: [Link] am Ende)</li>
              <li>• <strong>Zweite Zeile:</strong> Richtige Antwort</li>
              <li>• <strong>Weitere Zeilen:</strong> Falsche Antworten</li>
              <li>• <strong>Trennung:</strong> Leere Zeile zwischen Fragen</li>
        <li>• <strong>Medien:</strong> [bild.jpg] oder [/uploads/bild.jpg] oder absolute URL – Dateinamen werden automatisch zu <code>/uploads/…</code> aufgelöst</li>
        <li>• <strong>Audio:</strong> [sound.mp3] (auch Pfad wie /uploads/sound.mp3 oder absolute URL möglich)</li>
            </ul>
          </div>
        </div>

        {/* Vorschau Bereich */}
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau</h3>
          
          {showPreview ? (
            <div className="space-y-6">
              {parsedQuestions.map((q, index) => (
                <div key={index} className="border rounded p-4 bg-gray-50">
                  <div className="mb-3">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                      Frage {index + 1}
                    </span>
                  </div>

                  <h4 className="font-semibold mb-3">{q.question}</h4>

      {q.mediaLink && (
                    <div className="mb-3 p-3 bg-gray-100 rounded border">
          {isImagePath(q.mediaLink) ? (
                        <div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
            src={resolveMediaPath(q.mediaLink)} 
                            alt="Frage Media" 
                            className="max-w-full max-h-48 object-contain border rounded bg-white"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `<p class="text-red-600 text-sm">❌ Bild konnte nicht geladen werden: ${q.mediaLink}</p>`;
                              }
                            }}
                          />
                        </div>
          ) : isAudioPath(q.mediaLink) ? (
                        <div>
                          <audio controls className="w-full max-w-md">
            <source src={resolveMediaPath(q.mediaLink)} />
                            <p className="text-red-600 text-sm">❌ Audio wird vom Browser nicht unterstützt</p>
                          </audio>
                        </div>
                      ) : (
                        <div>
                          <a 
            href={resolveMediaPath(q.mediaLink)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline break-all"
                          >
            📎 {resolveMediaPath(q.mediaLink)}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    {q.allAnswers.map((answer: string, answerIndex: number) => (
                      <label key={answerIndex} className="flex items-start gap-3 p-2 border rounded cursor-pointer hover:bg-white">
                        <input 
                          type="radio" 
                          name={`question-${index}`} 
                          className="mt-1"
                          disabled
                        />
                        <span className={answer === q.correctAnswer ? 'text-green-700 font-medium' : ''}>
                          {answer}
                          {answer === q.correctAnswer && (
                            <span className="ml-2 text-green-600">✓</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 text-sm text-gray-600">
                    📊 Richtige Antwort: <strong className="text-green-600">{q.correctAnswer}</strong>
                  </div>
                </div>
              ))}

              {parsedQuestions.length === 0 && (
                <div className="text-gray-500 text-center py-4">
                  Keine gültigen Fragen gefunden. Überprüfe das Format.
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-8">Keine Vorschau.</div>
          )}
        </div>
      </div>

      {/* Statistiken */}
      {showPreview && parsedQuestions.length > 0 && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded p-4">
          <h4 className="font-semibold text-green-800 mb-2">📈 Quiz-Statistiken:</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-green-700 font-medium">Anzahl Fragen:</span>
              <div className="text-2xl font-bold text-green-800">{parsedQuestions.length}</div>
            </div>
            <div>
              <span className="text-green-700 font-medium">Mit Media:</span>
              <div className="text-2xl font-bold text-green-800">
                {parsedQuestions.filter(q => q.mediaLink).length}
              </div>
            </div>
            <div>
              <span className="text-green-700 font-medium">Ø Antworten:</span>
              <div className="text-2xl font-bold text-green-800">
                {Math.round(parsedQuestions.reduce((sum, q) => sum + q.allAnswers.length, 0) / parsedQuestions.length)}
              </div>
            </div>
            <div>
              <span className="text-green-700 font-medium">Geschätzte Zeit:</span>
              <div className="text-2xl font-bold text-green-800">{parsedQuestions.length * 1}min</div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
