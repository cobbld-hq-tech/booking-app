import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth needs the Node runtime (crypto + the Neon WebSocket pool). The auth
// instance is resolved lazily per request (getAuth is memoised) so importing this
// module never constructs Better Auth at build time.
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(req);
}
