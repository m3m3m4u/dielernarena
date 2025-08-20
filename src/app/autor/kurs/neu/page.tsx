"use client";
import { useState } from "react";
import CategorySelect from '@/components/shared/CategorySelect';
import { useRouter } from "next/navigation";

export default function KursErstellenPage() {
  const router = useRouter();
  
  const [courseData, setCourseData] = useState({
    title: "",
    description: "",
    category: "",
    tags: [] as string[],
    tagInput: "",
    progressionMode: 'free' as 'free' | 'linear'
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseData.title.trim() || !courseData.description.trim() || !courseData.category) {
      alert("Bitte Titel, Beschreibung und Kategorie ausfüllen.");
      return;
    }

    setIsSaving(true);
    try {
      // Nutze den konsolidierten Endpoint /api/kurse (POST)
      const response = await fetch("/api/kurse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: courseData.title.trim(),
          description: courseData.description.trim(),
            category: courseData.category,
          tags: courseData.tags,
          progressionMode: courseData.progressionMode
        })
      });

      const result = await response.json().catch(() => ({ success: false, error: "Ungültige Server-Antwort" }));

      if (response.ok && result.success) {
        alert("Kurs erfolgreich erstellt!");
        router.push(`/autor/kurs/${result.courseId}`);
      } else {
        console.error("Fehler beim Erstellen des Kurses:", result);
        alert(result?.error || "Fehler beim Erstellen des Kurses");
      }
    } catch (error) {
      console.error("Fehler:", error);
      alert("Unerwarteter Fehler aufgetreten");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto mt-10 p-6">
      <h1 className="text-3xl font-bold mb-8">Neuen Kurs erstellen</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Kurstitel *</label>
            <input
              type="text"
              value={courseData.title}
              onChange={(e) => setCourseData({...courseData, title: e.target.value})}
              className="w-full p-3 border rounded"
              placeholder="z.B. Bruchrechnung Grundlagen"
              required
              autoFocus
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Kursbeschreibung *</label>
            <textarea
              value={courseData.description}
              onChange={(e) => setCourseData({...courseData, description: e.target.value})}
              className="w-full p-3 border rounded h-28"
              placeholder="Was lernen die Teilnehmer in diesem Kurs?"
              required
            />
          </div>
          <div>
            <CategorySelect
              value={courseData.category}
              onChange={(v)=> setCourseData(c=>({...c, category: v}))}
              label="Kategorie *"
              required
              includeEmpty
              emptyLabel="Kategorie wählen"
              selectClassName="w-full p-3 border rounded"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Progressionsmodus</label>
          <div className="flex gap-4 mb-8">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="progressionMode" value="free" checked={courseData.progressionMode==='free'} onChange={()=>setCourseData(c=>({...c, progressionMode:'free'}))} />
              Frei (beliebige Reihenfolge)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="progressionMode" value="linear" checked={courseData.progressionMode==='linear'} onChange={()=>setCourseData(c=>({...c, progressionMode:'linear'}))} />
              Linear (eine nach der anderen)
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isSaving} className="bg-green-600 text-white px-8 py-3 rounded font-semibold hover:bg-green-700 disabled:opacity-50">
            {isSaving ? 'Wird erstellt…' : 'Kurs erstellen ➜'}
          </button>
        </div>
      </form>
    </main>
  );
}
