export interface Question {
	question: string;
	mediaLink?: string;
	correctAnswer: string;
	wrongAnswers: string[];
	allAnswers: string[];
	correctAnswers?: string[];
}

// Minimal, shared shape used by multiple lesson games.
export type LessonContent = {
	// Shared
	targetScore?: number;
	blocks?: unknown; // individual games refine this
	// Snake
	difficulty?: 'einfach' | 'mittel' | 'schwer';
	initialSpeedMs?: number;
	// Plane
	planeScale?: number;
	// Space Impact
	spaceScale?: number;
} & Record<string, unknown>;

export interface Lesson {
	_id: string;
	title: string;
	type: string;
	questions?: Question[];
	content?: LessonContent;
	courseId: string;
	createdAt?: string;
}
