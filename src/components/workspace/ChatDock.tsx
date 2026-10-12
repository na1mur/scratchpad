"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { api } from "@/lib/fetcher";
import type { ChatLayout } from "@/models/User";

/**
 * Where the chat sits. Lives in the page component (which stays mounted while runs load and finish), so a
 * change sticks until the next page load, which reads the saved one.
 */
export function useChatDock(initial: ChatLayout) {
  const [layout, setLayoutState] = useState(initial);

  function setLayout(next: ChatLayout) {
    setLayoutState(next);
    // The choice applies to every problem, so it's saved on the user. A failed save only costs persistence.
    api("/api/settings/preferences", { method: "PATCH", body: { chatLayout: next } }).catch(() =>
      toast.error("Couldn't save where the chat goes; it'll be back to the old place next time."),
    );
  }

  return { layout, setLayout };
}
export type ChatDockState = ReturnType<typeof useChatDock>;

/**
 * The run's chat, under the run or filling a column on the right of the page (`layout: "drawer"`, the
 * stored name from when it was a drawer). The page decides where to put it: see `chatOnSide()`.
 */
export function ChatDock({
  dock,
  side,
  ...chat
}: { dock: ChatDockState; side: boolean } & Omit<
  React.ComponentProps<typeof ChatPanel>,
  "layout" | "onLayoutChange"
>) {
  return (
    <div data-tour="chat" className={side ? "h-full" : undefined}>
      <ChatPanel {...chat} layout={side ? "drawer" : "inline"} onLayoutChange={dock.setLayout} />
    </div>
  );
}

/** The side column needs the desktop split; on phones the chat always sits under the run. */
export function chatOnSide(dock: ChatDockState, isDesktop: boolean): boolean {
  return isDesktop && dock.layout === "drawer";
}

/**
 * Default column sizes for the page's split. The panel library rebuilds the layout from these whenever a
 * panel is added or removed, so with the chat column the other two give it room and all three add up to 100.
 */
export function splitSizes(withChat: boolean) {
  return withChat ? { left: "30%", right: "46%", chat: "24%" } : { left: "38%", right: "62%", chat: "0%" };
}
