import { auth } from "@/auth";
import { getStayImages } from "@/lib/stays/detail";

/**
 * Hotel gallery images for the stay CARD's lazy in-view preview gallery.
 * Light sibling of /api/stays/detail (images only — no rooms/amenities), from
 * the same permanently-cached Content API. Auth-gated like the chat; failures
 * degrade to no gallery (the card renders text-only, exactly as before).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { hotelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const hotelId = typeof body.hotelId === "string" ? body.hotelId.trim() : "";
  if (!hotelId || hotelId.length > 40) {
    return Response.json({ error: "hotelId is required" }, { status: 400 });
  }

  try {
    const images = await getStayImages(hotelId);
    return Response.json({ images });
  } catch (err) {
    console.error("Stay images failed:", err);
    return Response.json({ images: [] });
  }
}
