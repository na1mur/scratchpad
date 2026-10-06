import type { MessageDoc } from "@/models/Message";

export function serializeMessage(m: MessageDoc) {
  return {
    id: String(m._id),
    role: m.role,
    content: m.content,
    focusStepIds: m.focusStepIds ?? [],
    producedSpecVersion: m.producedSpecVersion ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}
export type ChatMessage = ReturnType<typeof serializeMessage>;

export type ChatEvent =
  | { type: "user"; message: ChatMessage }
  | { type: "delta"; text: string }
  | { type: "regenerating"; reason: string }
  | { type: "spec"; specVersion: number }
  | { type: "replace"; text: string }
  | { type: "done"; message: ChatMessage }
  /** The question is discarded too, so history never holds an unanswered turn. */
  | { type: "error"; message: string; discardedMessageId: string };
