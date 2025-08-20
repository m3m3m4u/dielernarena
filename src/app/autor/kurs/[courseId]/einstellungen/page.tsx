"use client";

import { useState, useEffect, useCallback } from 'react';
// import { useRouter } from 'next/navigation'; // entfernt: ungenutzt
import Link from 'next/link';
import CategorySelect from '@/components/shared/CategorySelect';
import { usePathname, useParams } from 'next/navigation';

interface CourseSettings {
  id: string;
  name: string;
  description: string;
  category: string;
  isPublic: boolean;
  progressionMode: 'linear' | 'free';
}

export default function CourseSettingsPage() {
  // const router = useRouter(); // entfernt: ungenutzt
  const routeParams = useParams();
  const courseId = (routeParams?.courseId as string) || '';
  const pathname = usePathname();
  const inTeacher = pathname?.startsWith('/teacher/');
  const [course, setCourse] = useState<CourseSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // neue Version: loadCourse via useCallback und als Dependency nutzen
  const loadCourse = useCallback(async () => {
    try {
      const response = await fetch(`/api/kurs/${courseId}`);
      const data = await response.json();
      
      if (data.success && data.course) {
        const mongodbCourse = data.course;
        setCourse({
          id: mongodbCourse._id,
          name: mongodbCourse.title,
          description: mongodbCourse.description,
          category: mongodbCourse.category,
          isPublic: mongodbCourse.isPublished || false,
          progressionMode: mongodbCourse.progressionMode === 'linear' ? 'linear' : 'free'
        });
      } else {
        setError('Kurs nicht gefunden');
      }
    } catch {
      setError('Fehler beim Laden des Kurses');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  const handleSave = async () => {
    if (!course) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Nutzung des spezifischen Settings PATCH für partielle Updates (inkl. progressionMode)
      const payload: any = {
        title: course.name,
        description: course.description,
        category: course.category,
        progressionMode: course.progressionMode
      };
      // Nur Autor/Admin darf publish ändern – Teacher sendet dieses Feld nicht
      if (!inTeacher) {
        payload.isPublished = course.isPublic;
      }
  const response = await fetch(`/api/kurs/${courseId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Kurseinstellungen erfolgreich gespeichert!');
        if (data.course) {
          const updatedCourse = data.course;
          setCourse({
            id: updatedCourse._id,
            name: updatedCourse.title,
            description: updatedCourse.description,
            category: updatedCourse.category,
            isPublic: updatedCourse.isPublished || false,
            progressionMode: updatedCourse.progressionMode === 'linear' ? 'linear' : 'free'
          });
        }
      } else {
        setError(data.error || 'Fehler beim Speichern');
      }
    } catch {
      setError('Fehler beim Speichern der Einstellungen');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = <K extends keyof CourseSettings>(field: K, value: CourseSettings[K]) => {
    if (!course) return;
    setCourse({
      ...course,
      [field]: value,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Lade Kurseinstellungen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-8">
            <p className="text-red-600">Kurs nicht gefunden</p>
            <Link
              href={inTeacher ? '/teacher/kurse?tab=freigaben' : '/autor'}
              className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Zurück zur Übersicht
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kurseinstellungen</h1>
              <p className="text-gray-600 mt-2">Bearbeite die Eigenschaften deines Kurses</p>
            </div>
            <Link
              href={inTeacher ? '/teacher/kurse?tab=freigaben' : '/autor'}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
            >
              ← Zurück zur Übersicht
            </Link>
          </div>
        </div>

        {/* Benachrichtigungen */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {/* Einstellungsformular */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="space-y-6">
            {/* Kursname */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kursname *
              </label>
              <input
                type="text"
                value={course.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="z.B. Bruchrechnung Grundlagen"
              />
            </div>

            {/* Beschreibung */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Beschreibung *
              </label>
              <textarea
                value={course.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Beschreibe deinen Kurs..."
              />
            </div>

            {/* Zwei-Spalten-Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Kategorie */}
              <div>
                <CategorySelect
                  value={course.category}
                  onChange={(v)=>handleInputChange('category', v)}
                  label="Kategorie *"
                  selectClassName="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Progressionsmodus */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Progressionsmodus</label>
              <div className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="progressionMode"
                    value="free"
                    checked={course.progressionMode === 'free'}
                    onChange={() => handleInputChange('progressionMode', 'free')}
                  />
                  Frei (Lernende können beliebig springen)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="progressionMode"
                    value="linear"
                    checked={course.progressionMode === 'linear'}
                    onChange={() => handleInputChange('progressionMode', 'linear')}
                  />
                  Linear (Lektionen der Reihe nach freischalten)
                </label>
              </div>
            </div>

            {/* Öffentlich */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={course.isPublic}
                  onChange={(e) => handleInputChange('isPublic', e.target.checked)}
                  disabled={inTeacher}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Kurs öffentlich verfügbar machen
                </span>
                {inTeacher && (
                  <span className="ml-3 text-xs text-gray-500">Nur Autor/Admin darf veröffentlichen</span>
                )}
              </label>
            </div>

            {/* Speichern Button */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-end gap-3">
                <Link
                  href={inTeacher ? '/teacher/kurse?tab=freigaben' : '/autor'}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Abbrechen
                </Link>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Speichern...' : 'Einstellungen speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Kurs-ID Info */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>Kurs-ID:</strong> {course.id}
          </p>
        </div>
      </div>
    </div>
  );
}
