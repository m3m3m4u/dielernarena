"use client";
import type { Lesson } from './types';

interface Props { allLessons: Lesson[]; currentLessonId: string; courseId: string; completedLessons: string[]; progressionMode?: 'linear' | 'free'; backHref?: string; }

export default function LessonFooterNavigation({ allLessons, currentLessonId, courseId, completedLessons, progressionMode = 'free', backHref }: Props) {
  if (!allLessons || allLessons.length === 0) return null;
  return (
    <div className="mt-10 border-t pt-6">
      <h3 className="text-lg font-semibold mb-4">Weitere Lektionen</h3>
      <div className="flex flex-wrap gap-3">
        {allLessons.map((l, idx) => {
          const id = (l as any)._id || (l as any).id || '';
          const active = id === currentLessonId;
          const done = completedLessons.includes(id);
          const showStar = l.type && l.type !== 'markdown';
          const locked = progressionMode === 'linear' && !done && idx > 0 && !completedLessons.includes(((allLessons[idx-1] as any)._id || (allLessons[idx-1] as any).id));
          return (
            <a
              key={id}
              href={locked ? undefined : `/kurs/${courseId}/lektion/${id}`}
              aria-disabled={locked}
              className={`flex items-center gap-2 p-3 rounded border text-sm transition flex-1 min-w-[180px] ${active ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'} ${done && !active ? 'border-green-400' : ''} ${locked ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
            >
              <span className={`font-mono text-xs px-2 py-0.5 rounded ${active ? 'bg-blue-500/30 text-white' : 'bg-gray-100'}`}>#{idx + 1}</span>
              <span className="truncate flex-1">{l.title}</span>
              {done && (
                <span className={`flex items-center gap-1 ${active ? 'text-white' : 'text-green-500'}`}>
                  ✓ {showStar ? <span className="text-yellow-400">★</span> : null}
                </span>
              )}
              {!done && locked && <span className="text-gray-400 text-xs flex items-center gap-1">🔒</span>}
            </a>
          );
        })}
      </div>
      <div className="text-center mt-6">
        <a href={backHref || `/kurs/${courseId}`} className="text-blue-600 hover:underline text-sm">← {backHref === '/ueben' ? 'Zurück zu Übungen' : 'Zurück zur Kursübersicht'}</a>
      </div>
    </div>
  );
}
