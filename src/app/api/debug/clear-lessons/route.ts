import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Lesson from "@/models/Lesson";

// Debug-Route zum Zurücksetzen aller Lektionen

export async function DELETE() {
  try {
    await dbConnect();
    
    const result = await Lesson.deleteMany({});
    
    return NextResponse.json({
      success: true,
      message: `${result.deletedCount} Lektionen wurden gelöscht`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Fehler beim Löschen aller Lektionen:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Löschen aller Lektionen" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await dbConnect();
    
    const allLessons = await Lesson.find({});
    return NextResponse.json({
      totalLessons: allLessons.length,
      lessons: allLessons
    });
  } catch (error) {
    console.error("Fehler beim Laden aller Lektionen:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Laden aller Lektionen" },
      { status: 500 }
    );
  }
}
