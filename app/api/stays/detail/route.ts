import { auth } from "@/auth";
import { getStayDetail } from "@/lib/stays/detail";
import { logDiag } from "@/lib/diag";

/**
 * Hotel detail for the stay-card modal: content (lazy, permanently cached)
 * + rooms (captured at search time — option A, zero extra API calls).
 * Auth-gated like the chat; failures degrade to a graceful modal state.
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
    const detail = await getStayDetail(hotelId);
    await logDiag("detail_open", {
      hotelId,
      hasContent: detail.images.length > 0 || !!detail.description,
      hasRooms: (detail.rooms?.length ?? 0) > 0,
    });
    return Response.json(detail);
  } catch (err) {
    console.error("Stay detail failed:", err);
    await logDiag("detail_error", {
      hotelId,
      message: String(err).slice(0, 300),
    });
    return Response.json({ error: "Detail unavailable" }, { status: 500 });
  }
}
