import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { withHistoryCacheBreakpoint } from "@/lib/chat/cache";

const ephemeral = { type: "ephemeral", ttl: "1h" };

describe("withHistoryCacheBreakpoint", () => {
  it("returns the same (empty) array when there are no messages", () => {
    const messages: Anthropic.MessageParam[] = [];
    expect(withHistoryCacheBreakpoint(messages)).toBe(messages);
  });

  it("converts a string-content last message to a marked text block", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "find me a hotel" },
    ];
    const out = withHistoryCacheBreakpoint(messages);
    expect(out[2].content).toEqual([
      { type: "text", text: "find me a hotel", cache_control: ephemeral },
    ]);
    // earlier messages pass through untouched (same references)
    expect(out[0]).toBe(messages[0]);
    expect(out[1]).toBe(messages[1]);
  });

  it("marks only the last block of a block-array last message", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "hi" },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: "r1" },
          { type: "tool_result", tool_use_id: "b", content: "r2" },
        ],
      },
    ];
    const out = withHistoryCacheBreakpoint(messages);
    const blocks = out[1].content as Anthropic.ToolResultBlockParam[];
    expect(blocks[0]).not.toHaveProperty("cache_control");
    expect(blocks[1].cache_control).toEqual(ephemeral);
  });

  it("never mutates the input array or its messages", () => {
    const last: Anthropic.MessageParam = { role: "user", content: "hi" };
    const messages = [last];
    withHistoryCacheBreakpoint(messages);
    expect(last.content).toBe("hi");
    expect(messages).toHaveLength(1);
  });

  it("leaves an empty block-array content as-is", () => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: [] }];
    const out = withHistoryCacheBreakpoint(messages);
    expect(out[0].content).toEqual([]);
  });
});
