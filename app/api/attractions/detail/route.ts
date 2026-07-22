import { auth } from "@/auth";
import { getAttractionDetail } from "@/lib/attractions/detail";
import { logDiag } from "@/lib/diag";

/**
 * Attraction detail for the card's detail modal: content (lazy, permanently
 * cached in a real provider) — description, what's-included, gallery. Auth-gated
 * like the chat; every state degrades gracefully.
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
    const detail = await getAttractionDetail(id);
    await logDiag("attraction_detail_open", {
      attractionId: id,
      hasContent: detail.images.length > 0 || !!detail.description,
    });
    return Response.json(detail);
  } catch (err) {
    console.error("Attraction detail failed:", err);
    await logDiag("attraction_detail_error", { attractionId: id, message: String(err).slice(0, 300) });
    return Response.json({ error: "Detail unavailable" }, { status: 500 });
  }
}
