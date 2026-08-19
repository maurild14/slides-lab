import { NextResponse } from "next/server";
import { isClaudeAvailable } from "@/lib/claude-path";

export async function GET() {
  return NextResponse.json({ available: isClaudeAvailable() });
}
