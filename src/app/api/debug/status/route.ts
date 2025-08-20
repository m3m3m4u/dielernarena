import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Lesson from "@/models/Lesson";
import Course from "@/models/Course";

export async function GET() {
  try {
    await dbConnect();
    
    const allLessons = await Lesson.find({});
    const allCourses = await Course.find({});
    
    // Statistiken erstellen
    const stats = {
      totalLessons: allLessons.length,
      totalCourses: allCourses.length,
      courseStats: {} as Record<string, number>,
      typeStats: {} as Record<string, number>,
      allLessons: allLessons,
      allCourses: allCourses
    };
    
    // Kurs-Statistiken
    allLessons.forEach(lesson => {
      stats.courseStats[lesson.courseId] = (stats.courseStats[lesson.courseId] || 0) + 1;
      stats.typeStats[lesson.type] = (stats.typeStats[lesson.type] || 0) + 1;
    });
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      database: "MongoDB",
      stats
    });
  } catch (error) {
    console.error("Fehler beim Status-Check:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Status-Check" },
      { status: 500 }
    );
  }
}
