export const dynamic = "force-dynamic";

// Lightweight uptime / deploy check. Does not touch the DB.
export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}
