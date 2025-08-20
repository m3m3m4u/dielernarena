"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import MarkdownPreview from '@/components/shared/MarkdownPreview';
import { Lesson } from './types';
import { useRef, useState } from 'react';
import MediaPicker from '@/components/media/MediaPicker';

export interface MarkdownEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  markdownText: string; setMarkdownText: (v: string)=>void;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

export default function MarkdownEditor({ lesson, title, setTitle, category, setCategory, markdownText, setMarkdownText, handleSave, saving, returnToExercises }: MarkdownEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement|null>(null);
  const canSave = !!title.trim() && !!markdownText.trim();
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">✏️ Markdown-Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">🧾 Markdown bearbeiten</h3>
          <div className="mb-3">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
              onClick={() => setPickerOpen(true)}
              title="Medien aus Bibliothek einfügen"
            >
              🖼️ Medien einfügen
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={markdownText}
            onChange={e => setMarkdownText(e.target.value)}
            className="w-full h-96 p-3 border rounded font-mono text-sm"
            placeholder="# Überschrift\n\nText …"
          />
          <div className="mt-4">
            <button onClick={handleSave} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau</h3>
          <div className="prose max-w-none border rounded p-3 bg-gray-50 overflow-auto h-96">
            <MarkdownPreview markdown={markdownText} />
          </div>
        </div>
      </div>
      {pickerOpen && (
        <MediaPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(item) => {
            const alt = item.name.replace(/\.[^.]+$/, '');
            const snippet = `![${alt}](${item.url})`;
            const el = textareaRef.current;
            const current = markdownText || '';
            if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const next = current.slice(0, start) + snippet + current.slice(end);
              setMarkdownText(next);
              // restore cursor
              requestAnimationFrame(() => {
                el.focus();
                const pos = start + snippet.length;
                el.setSelectionRange(pos, pos);
              });
            } else {
              const next = (current ? current + '\n' : '') + snippet;
              setMarkdownText(next);
            }
            setPickerOpen(false);
          }}
        />
      )}
    </main>
  );
}
