export interface CompletionParams { username?: string; lessonId: string; courseId: string; type: string; earnedStar: boolean; }

export async function completeLessonOnServer(p: CompletionParams) {
  try {
    if (p.username) {
      await fetch('/api/lesson/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p)});
    }
  } catch {}
  try {
    if (p.username) {
      await fetch('/api/progress', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: p.username, lessonId: p.lessonId })});
    }
  } catch {}
}

export function updateLocalCompletion(courseId: string, lessonId: string) {
  const completedKey = `course:${courseId}:completedLessons`;
  const inProgressKey = `course:${courseId}:inProgressLessons`;
  try {
    const stored: string[] = JSON.parse(localStorage.getItem(completedKey) || '[]');
    if (!stored.includes(lessonId)) {
      const updated = [...stored, lessonId];
      localStorage.setItem(completedKey, JSON.stringify(updated));
    }
    const inProg: string[] = JSON.parse(localStorage.getItem(inProgressKey) || '[]');
    if (Array.isArray(inProg) && inProg.includes(lessonId)) {
      const filtered = inProg.filter(id => id !== lessonId);
      localStorage.setItem(inProgressKey, JSON.stringify(filtered));
    }
  } catch {}
}

export async function finalizeLesson(params: CompletionParams) {
  await completeLessonOnServer(params);
  updateLocalCompletion(params.courseId, params.lessonId);
}
