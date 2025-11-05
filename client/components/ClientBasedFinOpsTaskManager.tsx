import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

// ApprovalTimer component: shows countdown until next approval call (for reporting managers)
function ApprovalTimer({
  taskId,
  subtaskId,
}: {
  taskId: number;
  subtaskId: number;
}) {
  const [nextCallAt, setNextCallAt] = React.useState<Date | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    async function fetchNext() {
      try {
        const res = await apiClient.get(
          `/finops-production/external-alerts?task_id=${taskId}&subtask_id=${subtaskId}`,
        );
        const next = res?.next_call_at ? new Date(res.next_call_at) : null;
        if (!mountedRef.current) return;
        setNextCallAt(next);
        setRemaining(
          next
            ? Math.max(0, Math.floor((next.getTime() - Date.now()) / 1000))
            : null,
        );
      } catch (e) {
        console.warn("ApprovalTimer fetch error:", e);
      }
    }

    fetchNext();

    const refetchInterval = setInterval(() => {
      fetchNext();
    }, 30 * 1000); // refresh every 30s in case schedule updated

    return () => {
      mountedRef.current = false;
      clearInterval(refetchInterval);
    };
  }, [taskId, subtaskId]);

  // countdown tick
  React.useEffect(() => {
    if (remaining === null) return;
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return null;
        if (r <= 1) return 0;
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  if (!nextCallAt || remaining === null) return null;

  const minutes = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className="text-sm text-gray-600 mt-2">
      <div>
        Approve call in:{" "}
        <strong>
          {minutes}:{seconds}
        </strong>
      </div>
      <div className="text-xs text-gray-500">
        Next scheduled call: {format(nextCallAt, "dd MMM yyyy HH:mm:ss")}{" "}
        (server time)
      </div>
    </div>
  );
}

export default function ClientBasedFinOpsTaskManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: finopsTasks = [], isLoading } = useQuery({
    queryKey: ["finops-tasks"],
    queryFn: () => apiClient.getFinOpsTasks(),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      approverName,
    }: {
      subtaskId: number;
      approverName: string;
    }) => {
      return await apiClient.approveFinOpsSubtask(subtaskId, approverName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finops-tasks"] });
    },
  });

  const normalize = (s?: string) => (s || "").trim().toLowerCase();

  if (isLoading) return <div>Loading FinOps tasks...</div>;

  return (
    <div className="space-y-6">
      {Array.isArray(finopsTasks) && finopsTasks.length === 0 && (
        <div className="text-sm text-gray-500">No FinOps tasks found.</div>
      )}

      {finopsTasks.map((task: any) => (
        <div key={`task-${task.id}`} className="p-4 border rounded-md bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{task.task_name}</h3>
              <p className="text-sm text-gray-500">
                Client: {task.client_name || "Unknown Client"}
              </p>
            </div>
            <div className="text-sm text-gray-500">
              Last run: {task.last_run || "N/A"}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {Array.isArray(task.subtasks) &&
              task.subtasks.map((subtask: any) => {
                const isApproved = Boolean((subtask as any)?.approved_by);

                // Determine if current user is a reporting manager for this task
                const reportingList: string[] = Array.isArray(
                  task.reporting_managers,
                )
                  ? task.reporting_managers
                  : typeof task.reporting_managers === "string" &&
                      task.reporting_managers
                    ? JSON.parse(task.reporting_managers)
                    : [];

                const isReporting = reportingList.some(
                  (r) => normalize(r) === normalize(user?.name),
                );

                return (
                  <div
                    key={`sub-${subtask.id}`}
                    className="p-3 border rounded-md bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{subtask.name}</div>
                        <div className="text-xs text-gray-500">
                          Status: {subtask.status}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {subtask.status === "completed" &&
                          !isApproved &&
                          isReporting && (
                            <div className="flex items-center gap-3">
                              <Button
                                onClick={async () => {
                                  try {
                                    const approverName = user?.name || "";
                                    await approveMutation.mutateAsync({
                                      subtaskId: Number(subtask.id),
                                      approverName,
                                    });
                                  } catch (e) {
                                    alert("Failed to approve");
                                  }
                                }}
                                size="sm"
                              >
                                Approve
                              </Button>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Show ApprovalTimer only to reporting managers when subtask completed and not approved */}
                    {subtask.status === "completed" &&
                      !isApproved &&
                      isReporting && (
                        <ApprovalTimer
                          taskId={task.id}
                          subtaskId={Number(subtask.id)}
                        />
                      )}

                    {/* If approved, show approval info */}
                    {isApproved && (
                      <div className="mt-2 text-sm text-green-700">
                        Approved by {(subtask as any).approved_by} at{" "}
                        {(subtask as any).approved_at || ""}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
