import "server-only";
import type { Room, StayDetail } from "./types";
import { mockStayDetail } from "./mock-detail";
import { getCapturedRooms } from "./hotelbeds";
import { getHotelbedsContent } from "./hotelbeds-content";

/**
 * Join room-level content photos onto captured rooms by EXACT room code —
 * a room without a match renders exactly as before (the honest fallback:
 * no photo beats a wrong room's photo). Exported for tests.
 */
export function attachRoomImages(
  rooms: Room[] | null,
  roomImages: Record<string, string[]> | undefined,
): Room[] | null {
  if (!rooms || !roomImages) return rooms;
  return rooms.map((r) => {
    const images = roomImages[r.code];
    return images?.length ? { ...r, images } : r;
  });
}

/**
 * Provider-agnostic hotel detail for the modal and the get_hotel_details
 * tool. NEW function per the detail-layer ground rules — searchStays is
 * untouched. Dispatch is by the offer id's namespace, not env: "hb-" ids get
 * real content+captured rooms, "mock-" ids (mock provider OR the quota-guard
 * fallback) get deterministic mock detail. Content is lazy + permanently
 * cached; rooms come from search-time capture (option A — zero extra calls).
 */
export async function getStayDetail(hotelId: string): Promise<StayDetail> {
  if (hotelId.startsWith("hb-")) {
    const code = hotelId.slice(3);
    const [content, captured] = await Promise.all([
      getHotelbedsContent(code),
      getCapturedRooms(code),
    ]);
    return {
      mock: false,
      hotelProvider: "hotelbeds",
      hotelCode: code,
      name: content?.name,
      description: content?.description,
      images: content?.images ?? [],
      amenities: content?.amenities ?? [],
      address: content?.address,
      area: content?.area,
      reviewScore: content?.reviewScore,
      reviewCount: content?.reviewCount,
      rooms: attachRoomImages(captured?.rooms ?? null, content?.roomImages),
      currency: captured?.currency,
      pricedFor: captured
        ? {
            checkIn: captured.checkIn,
            checkOut: captured.checkOut,
            guests: captured.guests,
          }
        : undefined,
    };
  }
  return mockStayDetail(hotelId);
}
