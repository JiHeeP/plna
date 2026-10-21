"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * 수정 모드에서 항목 순서를 바꾸는 공용 목록.
 * 마우스·터치 모두 지원하고(손잡이를 잡고 끌기), enabled=false면 일반 목록처럼 동작한다.
 */
export function SortableList<T extends { id: string }>({
  items,
  enabled,
  onReorder,
  children,
}: {
  items: T[];
  enabled: boolean;
  /** 이동이 끝났을 때 새 순서의 전체 목록을 넘겨준다. */
  onReorder: (ordered: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
        disabled={!enabled}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** SortableList 안의 한 줄. 손잡이 노드는 children 함수의 인자로 받아 원하는 위치에 놓는다(수정 모드가 아니면 null). */
export function SortableRow({
  id,
  enabled,
  className,
  children,
}: {
  id: string;
  enabled: boolean;
  className?: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  const handle = enabled ? (
    <button
      type="button"
      aria-label="순서 바꾸기"
      title="끌어서 순서 바꾸기"
      className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-0.5 rounded text-muted-foreground hover:bg-muted"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  ) : null;

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children(handle)}
    </div>
  );
}
