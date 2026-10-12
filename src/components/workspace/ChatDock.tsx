"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircleQuestionIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { api } from "@/lib/fetcher";
import type { ChatLayout } from "@/models/User";

/**
 * Where the chat sits, and whether its drawer is open. Lives in the page component (which stays mounted
 * while runs load and finish), so a change sticks until the next page load, which reads the saved one.
 */
export function useChatDock(initial: ChatLayout) {
  const [layout, setLayoutState] = useState(initial);
  const [open, setOpen] = useState(false);

  function setLayout(next: ChatLayout) {
    setLayoutState(next);
    setOpen(next === "drawer");
    // The choice applies to every problem, so it's saved on the user. A failed save only costs persistence.
    api("/api/settings/preferences", { method: "PATCH", body: { chatLayout: next } }).catch(() =>
      toast.error("Couldn't save where the chat goes; it'll be back to the old place next time."),
    );
  }

  return { layout, setLayout, open, setOpen };
}
export type ChatDockState = ReturnType<typeof useChatDock>;

/**
 * The run's chat, either under the run or in a drawer from the right that a tab on the screen's edge opens.
 * The drawer is non-modal so the timeline stays usable (shift-click steps to ask about them), and stays
 * mounted while hidden so an answer that's still streaming isn't lost.
 */
export function ChatDock({
  dock,
  ...chat
}: { dock: ChatDockState } & Omit<React.ComponentProps<typeof ChatPanel>, "layout" | "onLayoutChange" | "onClose">) {
  const title = chat.title ?? "Ask about this run";

  if (dock.layout === "inline") {
    return (
      <div data-tour="chat">
        <ChatPanel {...chat} layout="inline" onLayoutChange={dock.setLayout} />
      </div>
    );
  }

  return (
    <>
      <Sheet open={dock.open} onOpenChange={dock.setOpen} modal={false} disablePointerDismissal>
        <SheetContent
          side="right"
          overlay={false}
          keepMounted
          showCloseButton={false}
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <ChatPanel {...chat} layout="drawer" onLayoutChange={dock.setLayout} onClose={() => dock.setOpen(false)} />
        </SheetContent>
      </Sheet>
      {!dock.open && (
        <Button
          variant="brand"
          className="fixed top-1/2 right-0 z-30 h-auto -translate-y-1/2 flex-col gap-2 rounded-r-none px-2 py-3 shadow-lg"
          aria-label={title}
          data-tour="chat"
          onClick={() => dock.setOpen(true)}
        >
          <MessageCircleQuestionIcon />
          <span className="text-xs [writing-mode:vertical-rl]">Ask</span>
        </Button>
      )}
    </>
  );
}
