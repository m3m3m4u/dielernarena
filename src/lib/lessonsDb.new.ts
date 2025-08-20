// Zentrale Datenbank-Simulation für alle Lektionen
// Singleton-Pattern für stabile Datenhaltung in Next.js Development

interface Question {
  question: string;
  mediaLink?: string;
  correctAnswer: string;
  wrongAnswers: string[];
  allAnswers: string[];
}

interface Lesson {
  _id: string;
  title: string;
  type: string;
  questions?: Question[];
  content?: Record<string, unknown>; // Legacy-Support
  courseId: string;
  createdAt: string;
  updatedAt?: string;
}

// Singleton-Pattern für stabile Datenhaltung
class LessonsDatabase {
  private static instance: LessonsDatabase;
  private lessons: Lesson[] = [];

  private constructor() {
    // Privater Konstruktor für Singleton
  }

  public static getInstance(): LessonsDatabase {
    if (!LessonsDatabase.instance) {
      LessonsDatabase.instance = new LessonsDatabase();
    }
    return LessonsDatabase.instance;
  }

  public getAllLessons(): Lesson[] {
    return [...this.lessons]; // Return copy to prevent direct modification
  }

  public setAllLessons(lessons: Lesson[]): void {
    this.lessons = [...lessons];
  }

  public addLesson(lesson: Lesson): void {
    this.lessons.push({ ...lesson });
  }

  public getLessonsByCourse(courseId: string): Lesson[] {
    return this.lessons.filter(lesson => lesson.courseId === courseId);
  }

  public getLessonById(lessonId: string): Lesson | undefined {
    return this.lessons.find(lesson => lesson._id === lessonId);
  }

  public updateLesson(lessonId: string, updates: Partial<Lesson>): boolean {
    const index = this.lessons.findIndex(lesson => lesson._id === lessonId);
    if (index !== -1) {
      this.lessons[index] = { ...this.lessons[index], ...updates };
      return true;
    }
    return false;
  }

  public deleteLesson(lessonId: string): boolean {
    const index = this.lessons.findIndex(lesson => lesson._id === lessonId);
    if (index !== -1) {
      this.lessons.splice(index, 1);
      return true;
    }
    return false;
  }

  public clearAllLessons(): void {
    this.lessons = [];
  }
}

// Singleton-Instanz
const db = LessonsDatabase.getInstance();

// Export der Funktionen
export function getAllLessons(): Lesson[] {
  return db.getAllLessons();
}

export function setAllLessons(lessons: Lesson[]): void {
  db.setAllLessons(lessons);
}

export function addLesson(lesson: Lesson): void {
  db.addLesson(lesson);
}

export function getLessonsByCourse(courseId: string): Lesson[] {
  return db.getLessonsByCourse(courseId);
}

export function getLessonById(lessonId: string): Lesson | undefined {
  return db.getLessonById(lessonId);
}

export function updateLesson(lessonId: string, updates: Partial<Lesson>): boolean {
  return db.updateLesson(lessonId, updates);
}

export function deleteLesson(lessonId: string): boolean {
  return db.deleteLesson(lessonId);
}

export function clearAllLessons(): void {
  db.clearAllLessons();
}

export type { Question, Lesson };
