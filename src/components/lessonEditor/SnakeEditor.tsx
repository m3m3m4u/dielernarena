"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';

interface Question { question: string; correctAnswer: string; allAnswers: string[]; }

export interface SnakeEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  questionsText: string; setQuestionsText: (v: string)=>void;
  parsedQuestions: Question[];
  saving: boolean; handleSave: ()=>void;
  snakeTargetScore: number; setSnakeTargetScore: (n: number)=>void;
  snakeDifficulty: 'einfach'|'mittel'|'schwer'; setSnakeDifficulty: (d: 'einfach'|'mittel'|'schwer')=>void;
  returnToExercises: boolean;
}

export default function SnakeEditor({ lesson, title, setTitle, category, setCategory, questionsText, setQuestionsText, parsedQuestions, saving, handleSave, snakeTargetScore, setSnakeTargetScore, snakeDifficulty, setSnakeDifficulty, returnToExercises }: SnakeEditorProps) {
  const canSave = title.trim() && questionsText.trim() && parsedQuestions.length>0;
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
  <h1 className="text-2xl font-bold">Minigame bearbeiten</h1>
  <p className="text-sm text-gray-600 mb-6">Kursteilnehmer entscheiden, welche Art von Minigame sie machen.</p>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="bg-white border rounded p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Fragen & Antworten</label>
          <p className="text-xs text-gray-500 mb-2">Blöcke durch Leerzeile trennen. Erste Zeile = Frage. Danach Antworten (erste Antwort = richtig). Max 4 Antworten.</p>
          <textarea value={questionsText} onChange={e=>setQuestionsText(e.target.value)} className="w-full h-72 border rounded p-3 font-mono text-xs" placeholder={'Frage 1\nRichtig\nFalsch A\nFalsch B\nFalsch C\n\nFrage 2\nRichtig\nFalsch\nFalsch\nFalsch'} />
          <div className="flex flex-wrap gap-3 mt-3 items-center">
            <span className={`text-xs ${parsedQuestions.length? 'text-green-600':'text-red-600'}`}>Erkannt: {parsedQuestions.length} Fragen</span>
            <button onClick={handleSave} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Ziel-Punktzahl</label>
            <input type="number" min={1} value={snakeTargetScore} onChange={e=>setSnakeTargetScore(Number(e.target.value)||10)} className="w-full border rounded px-2 py-1 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Schwierigkeit</label>
            <select value={snakeDifficulty} onChange={e=>setSnakeDifficulty(e.target.value as 'einfach'|'mittel'|'schwer')} className="w-full border rounded px-2 py-1 text-xs">
              <option value="einfach">Einfach</option>
              <option value="mittel">Mittel</option>
              <option value="schwer">Schwer</option>
            </select>
          </div>
          <div className="text-xs text-gray-400 flex items-end pb-1">&nbsp;</div>
          <div className="text-xs text-gray-400 flex items-end pb-1">&nbsp;</div>
        </div>
        <div className="bg-gray-50 border rounded p-3 text-xs space-y-3 max-h-80 overflow-auto">
          {parsedQuestions.length === 0 && <div className="text-gray-500">Keine gültigen Fragen erkannt. Format prüfen.</div>}
          {parsedQuestions.map((q,i)=>(
            <div key={i} className="border rounded p-2 bg-white">
              <div className="font-semibold mb-1">{i+1}. {q.question}</div>
              <ul className="space-y-1">
                {q.allAnswers.map((a,ai)=>(
                  <li key={ai} className={`px-2 py-1 rounded border ${ a===q.correctAnswer ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300'}`}>{a}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500">Speichern übernimmt Fragen & Einstellungen.</div>
      </div>
    </main>
  );
}
