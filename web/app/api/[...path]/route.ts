import { env } from "cloudflare:workers";
import { route } from "@/lib/share-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return await route(request, env);
  } catch {
    return Response.json(
      { error: "Partage temporairement indisponible." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      },
    );
  }
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
