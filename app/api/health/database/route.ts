import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Check the actual application table without returning tenant data or credentials. */
export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    await getDb().property.findFirst({ select: { id: true } });
    return Response.json({ status: "ok", database: "connected" }, { headers });
  } catch {
    return Response.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers },
    );
  }
}
