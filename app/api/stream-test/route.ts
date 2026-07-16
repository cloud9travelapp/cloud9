// TEMPORARY diagnostic route for the streaming investigation — no auth, no
// env. Streams 20 words over ~3s with the same shape/headers as /api/chat.
// Delete after the investigation.

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 1; i <= 20; i++) {
        controller.enqueue(encoder.encode(`word${i} `));
        await new Promise((r) => setTimeout(r, 150));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Trip-Id": "stream-test",
    },
  });
}

export const GET = POST;
