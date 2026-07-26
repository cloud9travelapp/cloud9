import type Anthropic from "@anthropic-ai/sdk";

/**
 * Prompt-caching for conversation history: returns a copy of `messages` with a
 * cache_control breakpoint on the LAST content block of the LAST message.
 *
 * The static prefix (tools + systemStatic) already has its own breakpoint in
 * the route; this adds the second, MOVING breakpoint so the ever-growing
 * history is read from cache each turn instead of re-billed at full price.
 * The input array is never mutated — the route mutates `anthropicMessages`
 * across tool-loop hops, so markers must never leak back into it (a stale
 * marker on a non-final message would waste one of the 4 allowed breakpoints
 * and could split the prefix).
 */
export function withHistoryCacheBreakpoint(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const ephemeral = { type: "ephemeral" as const };

  let content: Anthropic.MessageParam["content"];
  if (typeof last.content === "string") {
    content = [{ type: "text", text: last.content, cache_control: ephemeral }];
  } else if (last.content.length === 0) {
    content = last.content;
  } else {
    content = last.content.map((block, i) =>
      i === last.content.length - 1
        ? { ...block, cache_control: ephemeral }
        : block,
    );
  }

  return [...messages.slice(0, -1), { ...last, content }];
}
