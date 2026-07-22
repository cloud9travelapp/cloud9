import "server-only";
import type { AttractionDetail } from "./types";
import { mockAttractionDetail } from "./mock-detail";

/**
 * Provider-agnostic attraction detail, dispatched by the offer id's namespace
 * ("hb-" → hotelbeds content, everything else → mock) — mirrors getStayDetail.
 * Content (images/description/what's-included) is lazy + permanently cached in
 * a real provider; the mock generates it deterministically.
 */
export async function getAttractionDetail(
  attractionId: string,
): Promise<AttractionDetail> {
  // if (attractionId.startsWith("hb-")) return hotelbedsAttractionDetail(attractionId.slice(3));
  return mockAttractionDetail(attractionId);
}

/**
 * Gallery images only — the light path behind the card's lazy in-view gallery
 * (no description/what's-included compute). Mirrors getStayImages.
 */
export async function getAttractionImages(
  attractionId: string,
): Promise<string[]> {
  // if (attractionId.startsWith("hb-")) return (await getHotelbedsActivityContent(attractionId.slice(3)))?.images ?? [];
  return (await mockAttractionDetail(attractionId)).images;
}
