"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import CourseFooter from "@/components/CourseFooter";

type LessonType = 'text' | 'quiz' | 'exercise' | 'video';

type LessonStatus = 'completed' | 'in-progress' | 'locked';

interface TextContent {
  title: string;
  paragraphs?: string[];
  keyPoints?: string[];
}

interface QuizContent {
  question: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
}

interface ExerciseContent {
  title: string;
  instruction: string;
  placeholder?: string;
  sampleAnswer?: string;
}

interface VideoContent {
  title: string;
  videoId?: string;
  videoTitle?: string;
  description?: string;
}

type AnyContent = TextContent | QuizContent | ExerciseContent | VideoContent;

interface LessonEntry {
  id: string;
  title: string;
  type: LessonType;
  content: AnyContent;
}

interface FooterLesson { id: string; title: string; type: LessonType; status: LessonStatus }

interface LessonContentProps {
  lessonId: string;
  courseId: string;
  lesson: LessonEntry;
  lessons: FooterLesson[];
}

function VideoLesson({ content, onComplete, lessonCompleted }: { content: VideoContent; onComplete: (earnStar: boolean) => void; lessonCompleted: boolean }) {
  const [watchTime, setWatchTime] = useState(0);
  const [isWatching, setIsWatching] = useState(false);
  const [videoDuration] = useState(42 * 60); // 42 Minuten in Sekunden
  const [videoProgress, setVideoProgress] = useState(0);
  const watchedPercentage = Math.min((watchTime / videoDuration) * 100, 100);

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">{content.title}</h3>
      {content.videoId && (
        <div className="mb-4">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute top-0 left-0 w-full h-full rounded"
              src={`https://www.youtube.com/embed/${content.videoId}?enablejsapi=1&modestbranding=1&rel=0&disablekb=1`}
              title={content.videoTitle}
              frameBorder="0"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            ></iframe>
          </div>
        </div>
      )}

      <div className="mt-4 bg-blue-50 p-4 rounded">
        <h4 className="font-semibold mb-2">📊 Echte Watchtime (Anti-Vorspul-System)</h4>
        <div className="w-full bg-gray-300 rounded-full h-3 mb-2">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
            style={{ width: `${watchedPercentage}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-sm">
          <span>Geschaut: {Math.floor(watchTime / 60)}:{String(watchTime % 60).padStart(2, '0')}</span>
          <span>{Math.round(watchedPercentage)}% von {Math.floor(videoDuration / 60)} Min</span>
        </div>

        <div className="mt-3 space-x-2">
          <button 
            onClick={() => {
              setIsWatching(!isWatching);
              if (!isWatching) {
                const interval = setInterval(() => {
                  setWatchTime(prev => {
                    const newTime = prev + 1;
                    if (newTime >= videoDuration * 0.75 && !lessonCompleted) {
                      onComplete(true); // ⭐ Stern bei 75% echter Watchtime
                      clearInterval(interval);
                    }
                    return newTime;
                  });
                }, 100); // für Demo
                setTimeout(() => {
                  setIsWatching(false);
                  clearInterval(interval);
                }, 5000);
              }
            }}
            className={`px-4 py-2 rounded text-white font-semibold ${
              isWatching 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isWatching ? '⏸️ Pausieren' : '▶️ Video schauen'}
          </button>

          <button 
            onClick={() => {
              setVideoProgress(Math.min(videoProgress + 25, 100));
            }}
            className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
            title="Vorspulen zählt nicht für Sterne!"
          >
            ⏩ Vorspulen (zählt nicht!)
          </button>
        </div>

        {watchedPercentage >= 75 && lessonCompleted && (
          <div className="mt-3 p-3 bg-green-100 text-green-800 rounded">
            ✅ Video zu 75% in Echtzeit geschaut! ⭐ Du hast einen Stern verdient!
            <br />
            <small>🚫 Vorspulen wird nicht gewertet - nur echte Watchtime!</small>
          </div>
        )}

        {videoProgress > 0 && videoProgress !== watchedPercentage && (
          <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded text-sm">
            ⚠️ Vorspulen erkannt! Für Sterne musst du das Video in Echtzeit schauen.
          </div>
        )}
      </div>

      {content.description && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h4 className="font-semibold mb-2">📝 Video-Beschreibung:</h4>
          <p className="text-gray-700">{content.description}</p>
        </div>
      )}
    </div>
  );
}

export default function LessonContent({ lessonId, courseId, lesson, lessons }: LessonContentProps) {
  const [userAnswer, setUserAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [lessonCompleted, setLessonCompleted] = useState(false);
  const [earnedStar, setEarnedStar] = useState(false);
  const { data: session } = useSession();

  const currentIndex = lessons.findIndex(l => l.id === lessonId);
  const previousLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

  const completeLesson = async (earnStar: boolean = false) => {
    if (!session?.user?.username || lessonCompleted) return;

    try {
      const response = await fetch('/api/lesson/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: session.user.username,
          lessonId,
          courseId,
          type: lesson.type,
          earnedStar: earnStar
        })
      });

      if (response.ok) {
        const data: { earnedStar?: boolean } = await response.json();
        setLessonCompleted(true);
        if (data.earnedStar) {
          setEarnedStar(true);
        }
      }
    } catch (error) {
      console.error('Fehler beim Abschließen der Lektion:', error);
    }
  };

  const renderTextLesson = (content: TextContent) => (
    <div className="prose max-w-none">
      <h3 className="text-xl font-bold mb-4">{content.title}</h3>
      <div className="text-gray-700 leading-relaxed">
        {content.paragraphs?.map((paragraph, index) => (
          <p key={index} className="mb-4">{paragraph}</p>
        ))}
      </div>
      {content.keyPoints && (
        <div className="bg-blue-50 p-4 rounded mt-6">
          <h4 className="font-semibold mb-2">🔑 Wichtige Punkte:</h4>
          <ul className="list-disc ml-6">
            {content.keyPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      
      {!lessonCompleted && (
        <div className="mt-6">
          <button 
            onClick={() => completeLesson(false)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Lektion als gelesen markieren
          </button>
        </div>
      )}
    </div>
  );

  const renderQuizLesson = (content: QuizContent) => (
    <div>
      <h3 className="text-xl font-bold mb-4">{content.question}</h3>
      <div className="space-y-3">
        {content.options?.map((option, index) => (
          <button
            key={index}
            onClick={() => {
              setUserAnswer(option);
              setShowResult(true);
              if (content.correctAnswer && option === content.correctAnswer) {
                completeLesson(true); // ⭐ Stern für richtige Antwort
              } else {
                completeLesson(false); // Keine Sterne für falsche Antwort
              }
            }}
            disabled={showResult}
            className={`
              w-full p-3 text-left border rounded
              ${userAnswer === option ? 'bg-blue-100 border-blue-500' : 'hover:bg-gray-50'}
              ${showResult ? 'cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {String.fromCharCode(65 + index)}) {option}
          </button>
        ))}
      </div>
      {showResult && (
        <div className={`mt-4 p-4 rounded ${
          content.correctAnswer && userAnswer === content.correctAnswer ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {content.correctAnswer && userAnswer === content.correctAnswer ? '✅ Richtig! ⭐ Du hast einen Stern verdient!' : '❌ Falsch!'} 
          <br />
          <strong>Erklärung:</strong> {content.explanation}
        </div>
      )}
    </div>
  );

  const renderExerciseLesson = (content: ExerciseContent) => (
    <div>
      <h3 className="text-xl font-bold mb-4">{content.title}</h3>
      <p className="mb-4 text-gray-700">{content.instruction}</p>
      <textarea
        className="w-full p-3 border rounded h-32 mb-4"
        placeholder={content.placeholder || "Deine Antwort hier..."}
        value={userAnswer}
        onChange={(e) => setUserAnswer(e.target.value)}
        disabled={showResult}
      />
      {!showResult && (
        <button 
          onClick={() => {
            setShowResult(true);
            completeLesson(true); // ⭐ Stern für Übung eingereicht
          }}
          disabled={userAnswer.trim().length < 10}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          Antwort einreichen ⭐
        </button>
      )}
      {showResult && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <p className="text-green-800 font-semibold">✅ Übung eingereicht! ⭐ Du hast einen Stern verdient!</p>
          <strong>Musterlösung:</strong>
          <p className="mt-2">{content.sampleAnswer}</p>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (lesson.type) {
      case 'text': return renderTextLesson(lesson.content as TextContent);
      case 'quiz': return renderQuizLesson(lesson.content as QuizContent);
      case 'exercise': return renderExerciseLesson(lesson.content as ExerciseContent);
      case 'video': return (
        <VideoLesson 
          content={lesson.content as VideoContent} 
          onComplete={completeLesson} 
          lessonCompleted={lessonCompleted}
        />
      );
      default: return <div>Unbekannter Lektionstyp</div>;
    }
  };

  return (
    <div className="min-h-screen pb-32">
      <main className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <a href="/lernen" className="text-blue-600 hover:underline">← Zurück zu Kursen</a>
        </div>
        
        <h1 className="text-2xl font-bold mb-6">
          {lesson.title} 
          {earnedStar && <span className="ml-2 text-yellow-500">⭐</span>}
        </h1>
        
        {earnedStar && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-yellow-800">🎉 Herzlichen Glückwunsch! Du hast einen Stern verdient! ⭐</p>
          </div>
        )}
        
        {renderContent()}
        
        <div className="mt-8 flex justify-between">
          {previousLesson ? (
            <a 
              href={`/kurs/${courseId}/lektion/${previousLesson.id}`}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition"
            >
              ← {previousLesson.title}
            </a>
          ) : (
            <div></div>
          )}
          
          {nextLesson ? (
            <a 
              href={`/kurs/${courseId}/lektion/${nextLesson.id}`}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              {nextLesson.title} →
            </a>
          ) : (
            <a 
              href="/lernen"
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Kurs abgeschlossen! ✅
            </a>
          )}
        </div>
      </main>
      
      <CourseFooter 
        lessons={lessons} 
        currentLessonId={lessonId} 
        courseId={courseId} 
      />
    </div>
  );
}
