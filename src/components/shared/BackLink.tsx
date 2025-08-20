"use client";
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';

interface BackLinkProps {
  lesson: { courseId: string } | null;
  returnToExercises?: boolean;
  className?: string; // Wrapper div Klassen (z.B. mb-6)
  buttonClassName?: string; // Button Klassen
}

/**
 * Einheitlicher Zurück-Link für den Editor.
 * Ermittelt Ziel basierend auf returnToExercises Flag oder exercise-pool.
 * Verändert keinerlei bestehendes Layout – wrapper <div> + <button> identisch zum bisherigen Pattern.
 */
export default function BackLink({ lesson, returnToExercises, className = 'mb-6', buttonClassName = 'text-blue-600 hover:underline' }: BackLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inTeacher = pathname?.startsWith('/teacher/');
  if (!lesson) return null;
  const goExercises = returnToExercises || lesson.courseId === 'exercise-pool';
  const target = inTeacher
    ? (goExercises ? '/teacher' : `/teacher/kurs/${lesson.courseId}`)
    : (goExercises ? '/autor?tab=uebungen' : `/autor/kurs/${lesson.courseId}`);
  const label = goExercises ? 'zu den Übungen' : 'zum Kurs';
  return (
    <div className={className}>
      <button onClick={() => router.push(target)} className={buttonClassName}>← Zurück {label}</button>
    </div>
  );
}
