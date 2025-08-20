import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";

export async function GET() {
  try {
    await dbConnect();
    
    const courses = await Course.find({}).sort({ createdAt: -1 });
    
    return NextResponse.json({
      success: true,
      courses
    });
  } catch (error) {
    console.error("Fehler beim Laden der Kurse:", error);
    return NextResponse.json({ 
      error: "Fehler beim Laden der Kurse" 
    }, { status: 500 });
  }
}
