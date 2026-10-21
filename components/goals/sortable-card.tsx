"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableCardProps {
  id: string;
  /** false면 손잡이를 숨기고 끌기를 막는다 (수정 모드에서만 true). */
  enabled?: boolean;
  children: React.ReactNode;
}

export function SortableCard({ id, enabled = true, children }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !enabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/card relative">
      {enabled && (
        <div
          {...attributes}
          {...listeners}
          title="끌어서 순서 바꾸기"
          className="absolute left-1 top-1/2 -translate-y-1/2 touch-none cursor-grab active:cursor-grabbing z-10 p-0.5 rounded hover:bg-muted"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      {children}
    </div>
  );
}
