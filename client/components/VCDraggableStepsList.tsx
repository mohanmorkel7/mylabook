import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import { VCEnhancedStepItem } from "./VCEnhancedStepItem";
import { useUpdateVCStep } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";

interface VCDraggableStepsListProps {
  vcId: number;
  steps: any[];
  expandedSteps?: Set<number>;
  onToggleExpansion: (stepId: number) => void;
  onDeleteStep: (stepId: number) => void;
  onReorderSteps: (steps: any[]) => void;
  updateStepStatus?: (stepId: number, payload: any) => void;
  stepApiBase?: "vc" | "fund-raises" | "business-offerings";
  focusStepId?: number;
  focusFollowUpId?: number;
}

export function VCDraggableStepsList({
  vcId,
  steps,
  expandedSteps,
  onToggleExpansion,
  onDeleteStep,
  onReorderSteps,
  updateStepStatus,
  stepApiBase,
  focusStepId,
  focusFollowUpId,
}: VCDraggableStepsListProps) {
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [items, setItems] = useState(steps);
  const [chatCounts, setChatCounts] = useState<Record<number, number>>({});
  const updateStepMutation = useUpdateVCStep();
  const { user } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  React.useEffect(() => {
    console.log(
      "VCDraggableStepsList received steps:",
      steps.map((s) => ({ id: s.id, name: s.name })),
    );

    // Deduplicate steps by ID to prevent React key conflicts
    const uniqueSteps = steps.filter(
      (step, index, self) => index === self.findIndex((s) => s.id === step.id),
    );

    if (uniqueSteps.length !== steps.length) {
      console.warn(
        `Removed ${steps.length - uniqueSteps.length} duplicate steps`,
      );
      console.warn("Original steps:", steps);
      console.warn("Unique steps:", uniqueSteps);
    }

    // Additional validation
    const idCounts = {} as Record<number, number>;
    steps.forEach((step) => {
      idCounts[step.id] = (idCounts[step.id] || 0) + 1;
    });

    Object.entries(idCounts).forEach(([id, count]) => {
      if ((count as number) > 1) {
        console.error(`Step ID ${id} appears ${count} times`);
      }
    });

    setItems(uniqueSteps);
  }, [steps]);

  // Prefetch chat counts so badges show immediately on load
  React.useEffect(() => {
    let isCancelled = false;
    const loadCounts = async () => {
      if (!stepApiBase || !items || items.length === 0) return;
      try {
        const entries = await Promise.all(
          items.map(async (s) => {
            try {
              const rows = await apiClient.request(
                `/${stepApiBase}/steps/${s.id}/chats`,
              );
              return [s.id, Array.isArray(rows) ? rows.length : 0] as const;
            } catch (e) {
              return [s.id, 0] as const;
            }
          }),
        );
        if (!isCancelled) {
          const map: Record<number, number> = {};
          entries.forEach(([id, count]) => (map[id] = count));
          setChatCounts(map);
        }
      } catch {}
    };
    loadCounts();
    return () => {
      isCancelled = true;
    };
  }, [items, stepApiBase]);

  const handleUpdateStatus = async (stepId: number, status: string) => {
    const step = items.find((item) => item.id === stepId);
    if (!step) {
      console.error("Step not found:", stepId);
      return;
    }

    // Don't allow status updates on template steps
    if (step.isTemplate) {
      console.warn("Cannot update status on template step:", stepId);
      alert(
        "This is a template step. Create a VC-specific step to track progress.",
      );
      return;
    }

    console.log(`Updating VC step ${stepId} status to ${status}`);

    const oldStatus = step.status;

    // Optimistically update local state
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === stepId
          ? {
              ...item,
              status,
              completed_date:
                status === "completed" ? new Date().toISOString() : null,
            }
          : item,
      ),
    );

    // Function to add status change message to team chat
    const addStatusChangeMessage = async () => {
      if (!user || oldStatus === status) return;

      const statusDisplayMap: Record<string, string> = {
        pending: "Pending",
        in_progress: "In Progress",
        completed: "Completed",
        cancelled: "Cancelled",
      };

      const oldStatusDisplay = statusDisplayMap[oldStatus] || oldStatus;
      const newStatusDisplay = statusDisplayMap[status] || status;

      const systemMessage = `Step status changed from "${oldStatusDisplay}" to "${newStatusDisplay}" by ${user.name}`;

      try {
        const apiBase =
          stepApiBase ??
          (typeof (updateStepStatus as any) === "function"
            ? "fund-raises"
            : "vc");

        // For fund-raises, the backend already creates the system chat message. Avoid posting duplicate from client.
        if (apiBase === "fund-raises") return;

        await apiClient.request(`/${apiBase}/steps/${stepId}/chats`, {
          method: "POST",
          body: JSON.stringify({
            user_id: parseInt(user.id || "0"),
            user_name: "System",
            message: systemMessage,
            message_type: "system",
            is_rich_text: false,
            attachments: [],
          }),
        });
      } catch (error) {
        console.error("Failed to add status change message to chat:", error);
      }
    };

    // Update via API
    if (typeof (updateStepStatus as any) === "function") {
      try {
        await (updateStepStatus as any)(stepId, {
          status,
          completed_date:
            status === "completed" ? new Date().toISOString() : null,
        });
        // Add status change message to chat after successful update
        await addStatusChangeMessage();
      } catch (error) {
        console.error("Failed to update step status:", error);
      }
    } else {
      updateStepMutation.mutate(
        {
          stepId,
          stepData: {
            status,
            completed_date:
              status === "completed" ? new Date().toISOString() : null,
          },
        },
        {
          onSuccess: async () => {
            // Add status change message to chat after successful update
            await addStatusChangeMessage();
          },
          onError: (error) => {
            console.error("Failed to update step status:", error);
          },
        },
      );
    }
  };

  const handleDragStart = (event: any) => {
    const { active } = event;
    setActiveId(active.id);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Let parent handle persisting order
        onReorderSteps(newItems);

        return newItems;
      });
    }

    setActiveId(null);
  };

  const activeItem = activeId
    ? items.find((item) => item.id === activeId)
    : null;

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">
          <div className="text-sm">No steps available</div>
        </div>
      </div>
    );
  }

  const apiBase =
    stepApiBase ??
    (typeof (updateStepStatus as any) === "function" ? "fund-raises" : "vc");

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {items.map((step) => {
            const stepWithCount = {
              ...step,
              message_count:
                typeof chatCounts[step.id] === "number"
                  ? chatCounts[step.id]
                  : step.message_count,
            };
            return (
              <VCEnhancedStepItem
                key={step.id}
                step={stepWithCount}
                vcId={vcId}
                isExpanded={expandedSteps?.has(step.id) || false}
                onToggleExpansion={() => onToggleExpansion(step.id)}
                onUpdateStatus={handleUpdateStatus}
                onDeleteStep={(id) => onDeleteStep(id)}
                stepApiBase={apiBase}
                focusStepId={focusStepId}
                focusFollowUpId={focusFollowUpId}
              />
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeItem ? (
          <VCEnhancedStepItem
            step={activeItem}
            vcId={vcId}
            isExpanded={false}
            onToggleExpansion={() => {}}
            onUpdateStatus={() => {}}
            onDeleteStep={() => {}}
            isDragOverlay
            stepApiBase={apiBase}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
