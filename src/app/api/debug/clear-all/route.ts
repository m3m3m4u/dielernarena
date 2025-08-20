import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson";

export async function POST() {
  try {
    await dbConnect();
    
    // Lösche alle Lektionen
    await Lesson.deleteMany({});
    
    // Lösche alle Kurse
    await Course.deleteMany({});
    
    return NextResponse.json({
      success: true,
      message: "Alle Kurse und Lektionen wurden gelöscht"
    });
  } catch (error) {
    console.error("Fehler beim Löschen:", error);
    return NextResponse.json({ 
      error: "Fehler beim Löschen der Daten" 
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    await dbConnect();
    
    const courseCount = await Course.countDocuments();
    const lessonCount = await Lesson.countDocuments();
    
    return NextResponse.json({
      success: true,
      data: {
        courses: courseCount,
        lessons: lessonCount
      }
    });
  } catch (error) {
    console.error("Fehler beim Status-Check:", error);
    return NextResponse.json({ 
      error: "Fehler beim Status-Check" 
    }, { status: 500 });
  }
}
