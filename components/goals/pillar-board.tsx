"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { PILLAR_LABELS } from "@/lib/constants";
import { Plus } from "lucide-react";
import { SortableCard } from "./sortable-card";
import type { Pillar } from "@/lib/types";

const PILLAR_ORDER: Pillar[] = ["career", "identity", "assets"];

const PILLAR_BADGE_STYLES: Record<string, string> = {
  career: "bg-blue-100 text-blue-700 border-blue-200",
  identity: "bg-emerald-100 text-emerald-700 border-emerald-200",
  assets: "bg-amber-100 text-amber-700 border-amber-200",
};

interface BoardItem {
  id: string;
  pillar: string;
  sort_order: number;
}

interface PillarBoardProps<T extends BoardItem> {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  renderDragOverlay?: (item: T) => React.ReactNode;
  renderAddForm: (pillar: Pillar, onClose: () => void) => React.ReactNode;
  onReorder: (items: { id: string; pillar: string; sort_order: number }[]) => Promise<void>;
  title: string;
  headerRight?: React.ReactNode;
}

function DroppableColumn({ pillar, children }: { pillar: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${pillar}` });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] space-y-2 transition-colors rounded-lg p-1 ${
        isOver ? "bg-muted/50" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function PillarBoard<T extends BoardItem>({
  items,
  renderCard,
  renderDragOverlay,
  renderAddForm,
  onReorder,
  title,
  headerRight,
}: PillarBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingPillar, setAddingPillar] = useState<Pillar | null>(null);
  const [localItems, setLocalItems] = useState<T[]>(items);

  // Sync local items with props when items change (from parent fetch)
  const itemsKey = items.map((i) => `${i.id}-${i.pillar}-${i.sort_order}`).join(",");
  useEffect(() => {
    setLocalItems(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const grouped = useMemo(() => {
    const result: Record<string, T[]> = { career: [], identity: [], assets: [] };
    localItems
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((item) => {
        if (result[item.pillar]) {
          result[item.pillar].push(item);
        }
      });
    return result;
  }, [localItems]);

  const activeItem = activeId ? localItems.find((i) => i.id === activeId) : null;

  const findContainer = useCallback(
    (id: string): string | null => {
      // Check if it's a column id
      if (id.startsWith("column-")) return id.replace("column-", "");
      // Find which pillar contains this item
      for (const pillar of PILLAR_ORDER) {
        if (grouped[pillar]?.some((item) => item.id === id)) {
          return pillar;
        }
      }
      return null;
    },
    [grouped]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // Move item to new container (optimistic)
    setLocalItems((prev) => {
      const updated = prev.map((item) =>
        item.id === active.id ? { ...item, pillar: overContainer } : item
      );
      return updated;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer) return;

    const containerItems = [...grouped[overContainer]];
    const activeIndex = containerItems.findIndex((i) => i.id === active.id);
    const overIndex = containerItems.findIndex((i) => i.id === over.id);

    let reorderedColumn = containerItems;
    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
      reorderedColumn = arrayMove(containerItems, activeIndex, overIndex);
    }

    // Build the full reorder payload for affected columns
    const reorderPayload: { id: string; pillar: string; sort_order: number }[] = [];

    for (const pillar of PILLAR_ORDER) {
      const colItems = pillar === overContainer ? reorderedColumn : grouped[pillar];
      colItems.forEach((item, idx) => {
        reorderPayload.push({ id: item.id, pillar, sort_order: idx });
      });
    }

    // Optimistic update
    setLocalItems((prev) =>
      prev.map((item) => {
        const update = reorderPayload.find((r) => r.id === item.id);
        return update ? { ...item, pillar: update.pillar as string, sort_order: update.sort_order } : item;
      }) as T[]
    );

    await onReorder(reorderPayload);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {headerRight}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLAR_ORDER.map((pillar) => {
            const colItems = grouped[pillar] || [];
            return (
              <div key={pillar} className="bg-muted/30 rounded-xl p-3 space-y-3">
                {/* Column header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`${PILLAR_BADGE_STYLES[pillar]} text-xs font-medium border`}
                    >
                      {PILLAR_LABELS[pillar]}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">
                      {colItems.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <DroppableColumn pillar={pillar}>
                  <SortableContext
                    items={colItems.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {colItems.map((item) => (
                      <SortableCard key={item.id} id={item.id}>
                        {renderCard(item)}
                      </SortableCard>
                    ))}
                  </SortableContext>
                </DroppableColumn>

                {/* Add form or button */}
                {addingPillar === pillar ? (
                  renderAddForm(pillar, () => setAddingPillar(null))
                ) : (
                  <button
                    onClick={() => setAddingPillar(pillar)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    새로 만들기
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activeItem && renderDragOverlay
            ? renderDragOverlay(activeItem)
            : activeItem
              ? renderCard(activeItem)
              : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
