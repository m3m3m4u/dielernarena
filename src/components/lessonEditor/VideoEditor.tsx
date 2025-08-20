"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import MarkdownPreview from '@/components/shared/MarkdownPreview';
import { extractYouTubeId } from '@/lib/extractYouTubeId';
import { Lesson } from './types';
import { useState } from 'react';
import MediaPicker from '@/components/media/MediaPicker';

interface Props {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  videoUrl: string; setVideoUrl: (v: string)=>void;
  videoText: string; setVideoText: (v: string)=>void;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

export default function VideoEditor({ lesson, title, setTitle, category, setCategory, videoUrl, setVideoUrl, videoText, setVideoText, handleSave, saving, returnToExercises }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const trimmed = videoUrl.trim();
  const vid = extractYouTubeId(trimmed);
  const rawContent = lesson.content ? JSON.stringify(lesson.content, null, 2) : '{}';
  const legacyNote = !videoUrl ? ' (leer – vermutlich alte Lektion ohne gespeicherten youtubeUrl)' : '';
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">🎬 Erklärvideo bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} titlePlaceholder="Titel des Erklärvideos" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">🎥 Video</h3>
          <label className="block text-sm font-medium mb-1">YouTube-Link oder ID</label>
          <div className="flex gap-2 mb-3">
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className="w-full p-2 border rounded" placeholder="https://youtu.be/dQw4w9WgXcQ oder dQw4w9WgXcQ" />
            <button type="button" className="px-3 py-2 text-sm rounded border bg-white hover:bg-gray-50" title="Aus Medien wählen" onClick={()=> setPickerOpen(true)}>🖼️</button>
          </div>
          <label className="block text-sm font-medium mb-1">Begleittext (Markdown)</label>
            <textarea value={videoText} onChange={e => setVideoText(e.target.value)} className="w-full h-72 p-3 border rounded font-mono text-sm" placeholder="Optionaler Markdown-Text zum Video …" />
          <div className="mt-4 flex gap-3">
            <button onClick={handleSave} disabled={saving || !title.trim() || !vid} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">Abschluss wird automatisch erkannt, wenn das Video (fast) vollständig angesehen wurde.</div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau</h3>
          {!vid ? (
            <div className="text-gray-500 text-sm space-y-2">
              {!trimmed && <div>Gültigen YouTube-Link oder eine ID eingeben.</div>}
              {trimmed && <div>Keine gültige ID extrahierbar aus: <code className="break-all bg-gray-100 px-1 py-0.5 rounded">{trimmed}</code></div>}
              <ul className="list-disc pl-5 text-xs text-gray-400 space-y-1">
                <li>Beispiele: dQw4w9WgXcQ</li>
                <li>https://youtu.be/dQw4w9WgXcQ</li>
                <li>https://www.youtube.com/watch?v=dQw4w9WgXcQ</li>
                <li>https://www.youtube.com/shorts/dQw4w9WgXcQ</li>
              </ul>
            </div>
          ) : (
            <div className="mb-4">
              <div className="aspect-video w-full bg-black rounded overflow-hidden">
                <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${vid}`} title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
              </div>
              <div className="mt-2 text-xs text-gray-500">Extrahierte ID: <code className="bg-gray-100 px-1 py-0.5 rounded">{vid}</code></div>
            </div>
          )}
          {videoText.trim() ? <div className="prose max-w-none border rounded p-3 bg-gray-50 max-h-80 overflow-auto"><MarkdownPreview markdown={videoText} /></div> : <div className="text-gray-400 text-sm">Kein Begleittext.</div>}
          <details className="mt-6 text-xs text-gray-500">
            <summary className="cursor-pointer select-none">Debug: Content JSON{legacyNote}</summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40 whitespace-pre-wrap break-all">{rawContent}</pre>
          </details>
        </div>
      </div>
      {pickerOpen && (
        <MediaPicker
          open={pickerOpen}
          onClose={()=> setPickerOpen(false)}
          onSelect={(item)=>{ setVideoUrl(item.url); setPickerOpen(false); }}
        />
      )}
    </main>
  );
}
