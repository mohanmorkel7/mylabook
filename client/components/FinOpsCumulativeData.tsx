import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const IST_DATE_STRING = (): string => {
  const ist = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  return ist.toISOString().slice(0, 10);
};

const toISTDateString = (val: any) => {
  try {
    if (!val) return "unknown";
    const d = new Date(val);
    const ist = new Date(
      d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    return ist.toISOString().slice(0, 10);
  } catch (e) {
    try {
      return String(val).slice(0, 10);
    } catch (e2) {
      return "unknown";
    }
  }
};

export default function FinOpsCumulativeData() {
  const { data: tracker = [], isLoading } = useQuery({
    queryKey: ["finops-tracker-all"],
    queryFn: async () => {
      try {
        // Use the new cumulative endpoint that matches the exact SQL filter
        return await apiClient.getFinOpsCumulative();
      } catch (e) {
        console.error("Failed to fetch finops tracker:", e);
        return [];
      }
    },
    staleTime: 60_000,
  });

  const today = IST_DATE_STRING();
  const allowedStatuses = new Set(["pending", "overdue", "open", "delayed"]);

  // filter rows according to SQL criteria and group by run_date (IST) excluding today's IST date
  // NOTE: the cumulative endpoint returns flat finops_tracker rows (one row per subtask/tracker).
  // Convert these flat rows into tasks with subtasks so the UI shows subtask_name correctly.
  const byDate = useMemo(() => {
    const map: Record<string, Record<string, any>> = {}; // date -> (taskId -> taskObj)

    (tracker || []).forEach((row: any) => {
      // Skip deleted tasks
      if (row.deleted_at) return;

      // Ensure duration = 'daily' (task-level or row-level)
      const duration =
        (row.duration ||
          row.period ||
          row.task_duration ||
          row.task_period ||
          "") + "";
      if (duration.toLowerCase() !== "daily") return;

      // Determine run_date in IST YYYY-MM-DD
      const runDate = toISTDateString(
        row.run_date || row.run_date_at || row.date || row.run_date_string,
      );
      if (!runDate || runDate === "unknown") return;

      // Exclude today (IST)
      if (runDate === today) return;

      // If row-level status exists, ensure it's in allowed set; otherwise proceed because subtasks may carry statuses
      if (row.status) {
        const rs = String(row.status).toLowerCase();
        if (!allowedStatuses.has(rs)) return;
      }

      if (!map[runDate]) map[runDate] = {};
      const tasksMap = map[runDate];

      const taskIdKey = String(
        row.task_id ||
          row.task ||
          row.task_name ||
          `task_${row.id || Math.random()}`,
      );
      if (!tasksMap[taskIdKey]) {
        tasksMap[taskIdKey] = {
          task_id: row.task_id || null,
          task_name: row.task_name || row.task || row.name || "",
          period: row.period || row.duration || row.task_period || "",
          client_name: row.client_name || null,
          client_id: row.client_id || null,
          assigned_to: row.assigned_to || row.assigned || null,
          reporting_managers: row.reporting_managers || null,
          escalation_managers: row.escalation_managers || null,
          subtasks: [] as any[],
        };
      }

      // Build subtask entry from tracker row fields (finops_tracker columns)
      const subtaskId = row.subtask_id || row.id || null;
      const subtaskName = row.subtask_name || row.name || row.subtask || "";
      const subtaskObj = {
        subtask_id: subtaskId,
        subtask_name: subtaskName,
        status: row.status || null,
        started_at: row.started_at || null,
        completed_at: row.completed_at || null,
        scheduled_time: row.scheduled_time || row.start_time || null,
      };

      // Only push meaningful subtasks (avoid pushing empty placeholder without name/status)
      if (subtaskId || subtaskName || subtaskObj.status) {
        tasksMap[taskIdKey].subtasks.push(subtaskObj);
      } else {
        // If no subtask data, still ensure the task exists (no subtasks)
      }
    });

    // Convert map to ordered array of [date, tasks[]]
    const ordered: [string, any[]][] = Object.entries(map)
      .map(([date, tasksMap]) => [date, Object.values(tasksMap)])
      .sort((a, b) => b[0].localeCompare(a[0]));

    return ordered; // array of [date, tasks]
  }, [tracker, today]);

  // Counts per date: total, pending, overdue, open, delayed (exclude 'completed')
  const countsPerDate = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    byDate.forEach(([date, rows]) => {
      const c: Record<string, number> = {
        total: 0,
        pending: 0,
        overdue: 0,
        open: 0,
        delayed: 0,
      };

      rows.forEach((t: any) => {
        const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
        subs.forEach((s: any) => {
          const st = String(s.status || s.state || "").toLowerCase();
          if (!st || st === "completed") return;
          if (!allowedStatuses.has(st)) return; // only count the SQL-requested statuses

          if (st === "pending") c.pending++;
          else if (st === "overdue") c.overdue++;
          else if (st === "open") c.open++;
          else if (st === "delayed") c.delayed++;

          c.total++;
        });

        // If there are no subtasks but row/status itself is a tracked status, count it
        if (
          (!Array.isArray(t.subtasks) || t.subtasks.length === 0) &&
          t.status
        ) {
          const rs = String(t.status).toLowerCase();
          if (allowedStatuses.has(rs)) {
            if (rs === "pending") c.pending++;
            else if (rs === "overdue") c.overdue++;
            else if (rs === "open") c.open++;
            else if (rs === "delayed") c.delayed++;
            c.total++;
          }
        }
      });
      counts[date] = c;
    });
    return counts;
  }, [byDate]);

  // Aggregate global counts across all dates
  const globalCounts = useMemo(() => {
    const totals = {
      totalDates: byDate.length,
      total: 0,
      pending: 0,
      overdue: 0,
      open: 0,
      delayed: 0,
    } as Record<string, number>;

    Object.values(countsPerDate).forEach((c) => {
      totals.total += c.total || 0;
      totals.pending += c.pending || 0;
      totals.overdue += c.overdue || 0;
      totals.open += c.open || 0;
      totals.delayed += c.delayed || 0;
    });

    return totals;
  }, [countsPerDate, byDate.length]);

  const exportDate = (date: string) => {
    const rows: any[] = [];
    const groups = byDate.find(([d]) => d === date);
    if (!groups) return;
    const rowsForDate = groups[1];
    rowsForDate.forEach((t: any) => {
      const subt = Array.isArray(t.subtasks) ? t.subtasks : [];
      if (subt.length === 0) {
        // include row-level statuses if present and allowed
        const rs = String(t.status || "").toLowerCase();
        if (allowedStatuses.has(rs)) {
          rows.push({
            run_date: date,
            task: t.task_name || t.name || "",
            subtask: "",
            status: t.status,
            start_time: t.scheduled_time || t.start_time || "",
            started_at: t.started_at || "",
            completed_at: t.completed_at || "",
          });
        }
      } else {
        subt.forEach((s: any) => {
          const st = String(s.status || s.state || "").toLowerCase();
          if (!allowedStatuses.has(st)) return;
          rows.push({
            run_date: date,
            task: t.task_name || t.name || "",
            subtask: s.subtask_name || s.name || "",
            status: s.status,
            start_time: s.scheduled_time || s.start_time || "",
            started_at: s.started_at || "",
            completed_at: s.completed_at || "",
          });
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CumulativeData");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), `finops_cumulative_${date}.xlsx`);
  };

  const exportAll = () => {
    const rows: any[] = [];
    byDate.forEach(([date, rowsForDate]) => {
      rowsForDate.forEach((t: any) => {
        const subt = Array.isArray(t.subtasks) ? t.subtasks : [];
        if (subt.length === 0) {
          const rs = String(t.status || "").toLowerCase();
          if (allowedStatuses.has(rs)) {
            rows.push({
              run_date: date,
              task: t.task_name || t.name || "",
              subtask: "",
              status: t.status,
              start_time: t.scheduled_time || t.start_time || "",
              started_at: t.started_at || "",
              completed_at: t.completed_at || "",
            });
          }
        } else {
          subt.forEach((s: any) => {
            const st = String(s.status || s.state || "").toLowerCase();
            if (!allowedStatuses.has(st)) return;
            rows.push({
              run_date: date,
              task: t.task_name || t.name || "",
              subtask: s.subtask_name || s.name || "",
              status: s.status,
              start_time: s.scheduled_time || s.start_time || "",
              started_at: s.started_at || "",
              completed_at: s.completed_at || "",
            });
          });
        }
      });
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CumulativeData");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), `finops_cumulative_all.xlsx`);
  };

  if (isLoading) return <div>Loading cumulative data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Cumulative Data (historical dates)
        </h3>
        <div className="flex gap-2">
          <Button onClick={exportAll} disabled={isLoading}>
            Export All XLSX
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {/* Top aggregated counts: total dates + status totals */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card className="p-0">
          <CardHeader>
            <CardTitle className="text-sm">Total Dates</CardTitle>
            <CardDescription className="text-lg font-medium">
              {globalCounts.totalDates}
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>

        {[
          { key: "total", label: "Total" },
          { key: "pending", label: "Pending" },
          { key: "overdue", label: "Overdue" },
          { key: "open", label: "Open" },
          { key: "delayed", label: "Delayed" },
        ].map((c) => (
          <Card key={c.key} className="p-0">
            <CardHeader>
              <CardTitle className="text-sm">{c.label}</CardTitle>
              <CardDescription className="text-lg font-medium">
                {globalCounts[c.key] || 0}
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {byDate.length === 0 && (
          <div className="text-sm text-gray-600">
            No historical dates available
          </div>
        )}

        {/* Dates as accordions (details/summary) - no counts inside accordion */}
        {byDate.map(([date, rows]) => (
          <details key={date} className="border rounded-md p-3">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <div className="flex items-center gap-3">
                <h4 className="font-semibold">{date}</h4>
                <div className="text-sm text-gray-500">
                  {rows.length} task(s)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    exportDate(date);
                  }}
                >
                  Export {date}
                </Button>
              </div>
            </summary>

            <div className="mt-3 space-y-3">
              {rows.map((t: any) => (
                <Card key={`${t.task_id || t.id}-${date}`}>
                  <CardHeader>
                    <div className="flex justify-between items-center w-full">
                      <div>
                        <CardTitle>{t.task_name || t.name}</CardTitle>
                        <CardDescription>
                          {t.period || t.duration || ""}
                        </CardDescription>
                        <div className="text-xs text-gray-500 mt-1">
                          {t.client_name ? `Client: ${t.client_name}` : ""}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {t.assigned_to
                            ? `Assigned: ${Array.isArray(t.assigned_to) ? (t.assigned_to as any[]).join(", ") : String(t.assigned_to)}`
                            : ""}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {t.reporting_managers
                            ? `Reporting: ${
                                typeof t.reporting_managers === "string"
                                  ? (() => {
                                      try {
                                        const p = JSON.parse(
                                          t.reporting_managers,
                                        );
                                        return Array.isArray(p)
                                          ? p.join(", ")
                                          : String(t.reporting_managers);
                                      } catch {
                                        return String(t.reporting_managers);
                                      }
                                    })()
                                  : Array.isArray(t.reporting_managers)
                                    ? t.reporting_managers.join(", ")
                                    : ""
                              }`
                            : ""}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {t.escalation_managers
                            ? `Escalation: ${
                                typeof t.escalation_managers === "string"
                                  ? (() => {
                                      try {
                                        const p = JSON.parse(
                                          t.escalation_managers,
                                        );
                                        return Array.isArray(p)
                                          ? p.join(", ")
                                          : String(t.escalation_managers);
                                      } catch {
                                        return String(t.escalation_managers);
                                      }
                                    })()
                                  : Array.isArray(t.escalation_managers)
                                    ? t.escalation_managers.join(", ")
                                    : ""
                              }`
                            : ""}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">{date}</div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(t.subtasks || [])
                        .filter((s: any) => {
                          const st = String(
                            s.status || s.state || "",
                          ).toLowerCase();
                          return st !== "completed" && allowedStatuses.has(st);
                        })
                        .map((s: any) => (
                          <div
                            key={s.subtask_id || s.id}
                            className="flex justify-between items-center border-b pb-2"
                          >
                            <div>
                              <div className="font-medium">
                                {s.subtask_name || s.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                Status: {s.status} • Start:{" "}
                                {s.scheduled_time || s.start_time || "-"}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              {s.started_at ? `Started: ${s.started_at}` : ""}
                              {s.completed_at
                                ? ` • Completed: ${s.completed_at}`
                                : ""}
                              <div>Run Date: {date}</div>
                            </div>
                          </div>
                        ))}

                      {/* handle row-level status when subtasks absent or none matched */}
                      {(!t.subtasks || t.subtasks.length === 0) &&
                        t.status &&
                        allowedStatuses.has(String(t.status).toLowerCase()) && (
                          <div className="flex justify-between items-center border-b pb-2">
                            <div>
                              <div className="font-medium">
                                {t.task_name || t.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                Status: {t.status}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              Run Date: {date}
                            </div>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
