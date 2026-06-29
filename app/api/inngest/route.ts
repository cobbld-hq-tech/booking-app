import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// The Inngest serve endpoint. Inngest (the Dev Server locally, the cloud in prod)
// syncs the function list from here and invokes steps back through it. Needs the
// Node runtime (DB + provider SDKs).
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
