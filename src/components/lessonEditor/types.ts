export interface Question { question: string; mediaLink?: string; correctAnswer: string; wrongAnswers: string[]; allAnswers: string[]; correctAnswers?: string[]; }
export interface Lesson { _id?: string; title: string; type: string; questions?: Question[]; content?: any; courseId: string; createdAt?: string; category?: string; }
