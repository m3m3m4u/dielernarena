"use client";
import { useRouter } from "next/navigation";

interface Lesson {
  id: string;
  title: string;
  type: 'text' | 'quiz' | 'exercise' | 'video';
  status: 'completed' | 'in-progress' | 'locked';
}

interface CourseFooterProps {
  lessons: Lesson[];
  currentLessonId: string;
  courseId: string;
}

export default function CourseFooter({ lessons, currentLessonId, courseId }: CourseFooterProps) {
  const router = useRouter();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in-progress': return '⚡';
      case 'locked': return '🔒';
      default: return '⭕';
    }
  };

  const getLessonTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return '📖';
      case 'quiz': return '❓';
      case 'exercise': return '✏️';
      case 'video': return '🎥';
      default: return '📄';
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4 shadow-lg">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-start items-center overflow-x-auto space-x-3 pb-2">
          {lessons.map((lesson, index) => (
            <button
              key={lesson.id}
              onClick={() => router.push(`/kurs/${courseId}/lektion/${lesson.id}`)}
              disabled={lesson.status === 'locked'}
              className={`
                flex-shrink-0 flex flex-col items-center p-3 rounded border min-w-[80px]
                ${currentLessonId === lesson.id 
                  ? 'bg-blue-100 border-blue-500 shadow-md' 
                  : 'bg-white border-gray-200 hover:bg-gray-50'
                }
                ${lesson.status === 'locked' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}
              `}
            >
              <div className="text-lg mb-1">
                {getLessonTypeIcon(lesson.type)}
              </div>
              <div className="text-xs font-bold mb-1">{index + 1}</div>
              <div className="text-xs text-center leading-tight mb-1 max-w-[70px] truncate">
                {lesson.title}
              </div>
              <div className="text-sm">
                {getStatusIcon(lesson.status)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
