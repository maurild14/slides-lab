import { NextResponse } from "next/server";
import { listEngineStatus } from "@/lib/agents";

export async function GET() {
  const engines = listEngineStatus();
  return NextResponse.json({
    engines,
    // kept so an older client still renders something sane
    available: engines.some((e) => e.available),
  });
}
