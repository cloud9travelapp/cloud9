import "server-only";
import type { StayDetail } from "./types";
import { mockStayDetail } from "./mock-detail";
import { getCapturedRooms } from "./hotelbeds";
import { getHotelbedsContent } from "./hotelbeds-content";

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
      rooms: captured?.rooms ?? null,
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
