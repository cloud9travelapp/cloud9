import { auth } from "@/auth";
import { getAttractionImages } from "@/lib/attractions/detail";

/**
 * Gallery images for the attraction CARD's lazy in-view preview gallery — light
 * sibling of /api/attractions/detail (images only). Auth-gated like the chat;
 * failures degrade to no gallery (the card renders text-only, as before).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { attractionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = typeof body.attractionId === "string" ? body.attractionId.trim() : "";
  if (!id || id.length > 40) {
    return Response.json({ error: "attractionId is required" }, { status: 400 });
  }

  try {
    const images = await getAttractionImages(id);
    return Response.json({ images });
  } catch (err) {
    console.error("Attraction images failed:", err);
    return Response.json({ images: [] });
  }
}
