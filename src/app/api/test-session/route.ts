import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    return NextResponse.json({
      session,
      authenticated: !!session,
      userId: session?.user?.id || null
    });
  } catch (error) {
    return NextResponse.json({ 
      error: "Test failed",
      details: error 
    }, { status: 500 });
  }
}
