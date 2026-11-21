import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@jaetask/toolkit/ui/resizable";
import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";

export function Split({
  id,
  left,
  right,
  leftSize,
  minLeft,
  maxLeft,
  minRight,
  leftId,
  rightId,
}: {
  id: string;
  left: ReactNode;
  right: ReactNode;
  leftSize: number;
  minLeft: number;
  maxLeft: number;
  minRight: number;
  leftId: string;
  rightId: string;
}) {
  const saved = useDefaultLayout({
    id,
    storage: localStorage,
    panelIds: [leftId, rightId],
    onlySaveAfterUserInteractions: true,
  });
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={id}
      defaultLayout={saved.defaultLayout}
      onLayoutChanged={saved.onLayoutChanged}
      className="min-w-0 flex-1"
    >
      <ResizablePanel
        id={leftId}
        defaultSize={`${leftSize}`}
        minSize={`${minLeft}`}
        maxSize={`${maxLeft}`}
        className="flex min-w-0"
      >
        {left}
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label="Drag to resize"
        className="aria-[orientation=vertical]:h-auto aria-[orientation=vertical]:w-px aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:left-1/2 aria-[orientation=vertical]:after:h-auto aria-[orientation=vertical]:after:w-1 aria-[orientation=vertical]:after:-translate-x-1/2 aria-[orientation=vertical]:after:translate-y-0 [&[aria-orientation=vertical]>div]:rotate-0"
      />
      <ResizablePanel id={rightId} minSize={`${minRight}`} className="flex min-w-0">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
