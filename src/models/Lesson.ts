import mongoose, { Schema, Document } from 'mongoose';

export interface IQuestion {
  question: string;
  mediaLink?: string;
  correctAnswer?: string; // Single-Choice
  correctAnswers?: string[]; // Multiple-Choice
  wrongAnswers: string[];
  allAnswers: string[];
}

export interface ILesson extends Document {
  title: string;
  courseId: string; // eindeutige Kurs-Zuordnung ("exercise-pool" für Standalone-Übung)
  category?: string; // Fach/Kategorie (aus Kurs übernommen oder bei Standalone direkt gesetzt)
  // Hinweis: "snake" ist ein Legacy-Alias für "minigame" und wird weiterhin gelesen.
  type: "single-choice" | "multiple-choice" | "text" | "video" | "markdown" | "matching" | "memory" | "lueckentext" | "ordering" | "text-answer" | "minigame" | "snake";
  questions?: IQuestion[];
  content?: Record<string, unknown>;
  isExercise?: boolean; // True, wenn diese Lektion auch als eigenständige Übung gelistet werden soll
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema({
  question: { type: String, required: true },
  mediaLink: { type: String },
  correctAnswer: { type: String },
  correctAnswers: [{ type: String }],
  // Erlaube 0 falsche Antworten (z. B. bei MC mit ausschließlich korrekten Antworten)
  wrongAnswers: { type: [String], default: [] },
  allAnswers: [{ type: String, required: true }]
});

const LessonSchema: Schema = new Schema({
  title: { type: String, required: true },
  courseId: { type: String, required: true },
  category: { type: String, trim: true },
  // Enum enthält "snake" (Legacy) und "minigame" (neu bevorzugt)
  type: { type: String, required: true, enum: ["single-choice", "multiple-choice", "text", "video", "markdown", "matching", "memory", "lueckentext", "ordering", "text-answer", "minigame", "snake"] },
  questions: [QuestionSchema],
  content: { type: Schema.Types.Mixed },
  isExercise: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Wichtige Abfragen: nach courseId sortiert nach order; gelegentlich nach type filterbar
LessonSchema.index({ courseId: 1, order: 1 });
LessonSchema.index({ courseId: 1, type: 1 });
LessonSchema.index({ category: 1, isExercise: 1 });

LessonSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });
LessonSchema.pre('findOneAndUpdate', function(next) { this.set({ updatedAt: new Date() }); next(); });

// Wichtig für Next.js Dev/HMR: bestehendes Model verwerfen, damit Schema-Änderungen (enum) greifen
try {
  if (mongoose.modelNames().includes('Lesson')) {
    mongoose.deleteModel('Lesson');
  }
} catch {
  // ignore
}

export default mongoose.model<ILesson>('Lesson', LessonSchema);
