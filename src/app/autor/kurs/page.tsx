'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Course {
  _id: string;
  title: string;
  description: string;
  category: string;
  isPublished: boolean;
  createdAt: string;
  lessons?: number;
}

export default function CourseOverviewPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const response = await fetch('/api/courses');
      const data = await response.json();
      
      if (data.success) {
        setCourses(data.courses);
      } else {
        setError('Fehler beim Laden der Kurse');
      }
    } catch {
      setError('Fehler beim Laden der Kurse');
    } finally {
      setLoading(false);
    }
  };

  const deleteCourse = async (courseId: string, courseTitle: string) => {
    if (!confirm(`Möchten Sie den Kurs "${courseTitle}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/kurs/${courseId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        // Kurs aus der Liste entfernen
        setCourses(courses.filter(course => course._id !== courseId));
        alert('Kurs erfolgreich gelöscht');
      } else {
        alert('Fehler beim Löschen des Kurses: ' + (data.error || 'Unbekannter Fehler'));
      }
    } catch {
      alert('Fehler beim Löschen des Kurses');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Lade Kurse...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kursübersicht</h1>
              <p className="text-gray-600 mt-2">Verwalte alle deine Kurse</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/autor')}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
              >
                ← Zurück zur Startseite
              </button>
              <button
                onClick={() => router.push('/autor/kurs/neu')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                + Neuer Kurs
              </button>
            </div>
          </div>
        </div>

        {/* Fehleranzeige */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Kursliste */}
        {courses.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg mb-4">Noch keine Kurse erstellt</div>
            <button
              onClick={() => router.push('/autor/kurs/neu')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Ersten Kurs erstellen
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div key={course._id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                    {course.title}
                  </h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    course.isPublished 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {course.isPublished ? 'Veröffentlicht' : 'Entwurf'}
                  </span>
                </div>
                
                <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                  {course.description}
                </p>
                
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span className="bg-gray-100 px-2 py-1 rounded">
                    {course.category}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <Link
                    href={`/autor/kurs/${course._id}`}
                    className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm text-center hover:bg-blue-700"
                  >
                    📝 Bearbeiten
                  </Link>
                  <Link
                    href={`/autor/kurs/${course._id}/einstellungen`}
                    className="flex-1 bg-gray-600 text-white px-3 py-2 rounded text-sm text-center hover:bg-gray-700"
                  >
                    ⚙️ Einstellungen
                  </Link>
                  <button
                    onClick={() => deleteCourse(course._id, course.title)}
                    className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
                    title="Löschen"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
