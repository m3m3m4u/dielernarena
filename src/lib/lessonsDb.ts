// Zentrale Datenbank-Simulation für alle Lektionen
// GlobalThis-Pattern für stabile Datenhaltung in Next.js Development

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

interface Course {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: 'Anfänger' | 'Fortgeschritten' | 'Experte';
  estimatedTime: string;
  language: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Globaler Store über globalThis für HMR-Stabilität
declare global {
  var __LESSONS_DB__: Lesson[] | undefined;
  var __COURSES_DB__: Course[] | undefined;
}

function getGlobalLessons(): Lesson[] {
  if (!globalThis.__LESSONS_DB__) {
    globalThis.__LESSONS_DB__ = [];
  }
  return globalThis.__LESSONS_DB__;
}

// Export der Funktionen
export function getAllLessons(): Lesson[] {
  return [...getGlobalLessons()]; // Return copy to prevent direct modification
}

export function setAllLessons(lessons: Lesson[]): void {
  globalThis.__LESSONS_DB__ = [...lessons];
}

export function addLesson(lesson: Lesson): void {
  const lessons = getGlobalLessons();
  lessons.push({ ...lesson });
}

export function getLessonsByCourse(courseId: string): Lesson[] {
  return getGlobalLessons().filter(lesson => lesson.courseId === courseId);
}

export function getLessonById(lessonId: string): Lesson | undefined {
  return getGlobalLessons().find(lesson => lesson._id === lessonId);
}

export function updateLesson(lessonId: string, updates: Partial<Lesson>): boolean {
  const lessons = getGlobalLessons();
  const index = lessons.findIndex(lesson => lesson._id === lessonId);
  if (index !== -1) {
    lessons[index] = { ...lessons[index], ...updates };
    return true;
  }
  return false;
}

export function deleteLesson(lessonId: string): boolean {
  const lessons = getGlobalLessons();
  const index = lessons.findIndex(lesson => lesson._id === lessonId);
  if (index !== -1) {
    lessons.splice(index, 1);
    return true;
  }
  return false;
}

export function clearAllLessons(): void {
  globalThis.__LESSONS_DB__ = [];
}

// Kursverwaltung
function getGlobalCourses(): Course[] {
  if (!globalThis.__COURSES_DB__) {
    globalThis.__COURSES_DB__ = [
      {
        id: 'javascript-basics',
        name: 'JavaScript Grundlagen',
        description: 'Lerne die Grundlagen von JavaScript',
        category: 'Programmierung',
        difficulty: 'Anfänger',
        estimatedTime: '2-3 Stunden',
        language: 'Deutsch',
        isPublic: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'python-basics',
        name: 'Python Grundlagen',
        description: 'Einführung in Python Programmierung',
        category: 'Programmierung',
        difficulty: 'Anfänger',
        estimatedTime: '3-4 Stunden',
        language: 'Deutsch',
        isPublic: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'demo-kurs',
        name: 'Demo Kurs',
        description: 'Ein Demonstrationskurs',
        category: 'Demo',
        difficulty: 'Anfänger',
        estimatedTime: '30 Minuten',
        language: 'Deutsch',
        isPublic: true,
        createdAt: new Date().toISOString()
      }
    ];
  }
  return globalThis.__COURSES_DB__;
}

export function getAllCourses(): Course[] {
  return [...getGlobalCourses()];
}

export function getCourseById(courseId: string): Course | undefined {
  return getGlobalCourses().find(course => course.id === courseId);
}

export function updateCourse(courseId: string, updates: Partial<Course>): boolean {
  const courses = getGlobalCourses();
  const index = courses.findIndex(course => course.id === courseId);
  if (index !== -1) {
    courses[index] = { ...courses[index], ...updates, updatedAt: new Date().toISOString() };
    return true;
  }
  return false;
}

export function addCourse(course: Course): void {
  const courses = getGlobalCourses();
  courses.push({ ...course });
}

export function deleteCourse(courseId: string): boolean {
  const courses = getGlobalCourses();
  const index = courses.findIndex(course => course.id === courseId);
  if (index !== -1) {
    courses.splice(index, 1);
    // Auch alle Lektionen des Kurses löschen
    const lessons = getGlobalLessons();
    globalThis.__LESSONS_DB__ = lessons.filter(lesson => lesson.courseId !== courseId);
    return true;
  }
  return false;
}

export type { Question, Lesson, Course };
