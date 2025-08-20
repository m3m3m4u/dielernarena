// Extrahierte Fragen-Ladefunktion aus der Vorlage (game.js/questions.js) abstrahiert
import type { Lesson } from '../types';
import { QuestionBlock } from './types';

export function buildQuestionBlocks(raw: Lesson | { content?: unknown; questions?: unknown }): QuestionBlock[] {
  const content = (raw as Lesson)?.content as { blocks?: unknown } | undefined;
  if (content && Array.isArray(content.blocks)) {
    // Assume already in correct shape
    return content.blocks as QuestionBlock[];
  }
  const maybeQs = (raw as Lesson)?.questions as unknown;
  if (Array.isArray(maybeQs)) {
    return maybeQs.map((q) => {
      const anyQ = q as Record<string, unknown>;
      const question = String((anyQ.prompt ?? anyQ.question ?? '') as string);
      const answers = Array.isArray(anyQ.answers) ? (anyQ.answers as string[]) : [];
      const correctRaw = (anyQ.correctIndex ?? anyQ.correct) as number | undefined;
      const correct = typeof correctRaw === 'number' ? correctRaw : 0;
      return { question, answers, correct };
    });
  }
  return [];
}
