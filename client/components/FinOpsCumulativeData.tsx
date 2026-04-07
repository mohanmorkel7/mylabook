import React, { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Download } from "lucide-react";
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

  // Date range filter state
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Get all unique dates from data
  const allDates = useMemo(() => {
    const datesSet = new Set<string>();
    (tracker || []).forEach((row: any) => {
      const runDate = toISTDateString(
        row.run_date || row.run_date_at || row.date || row.run_date_string,
      );
      if (runDate && runDate !== "unknown" && runDate !== today) {
        datesSet.add(runDate);
      }
    });
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [tracker, today]);

  // Filter data by date range and group by date
  const byDate = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};

    (tracker || []).forEach((row: any) => {
      if (row.deleted_at) return;

      const duration =
        (row.duration ||
          row.period ||
          row.task_duration ||
          row.task_period ||
          "") + "";
      if (duration.toLowerCase() !== "daily") return;

      const runDate = toISTDateString(
        row.run_date || row.run_date_at || row.date || row.run_date_string,
      );
      if (!runDate || runDate === "unknown" || runDate === today) return;

      // Apply date range filter
      if (fromDate && runDate < fromDate) return;
      if (toDate && runDate > toDate) return;

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

      if (subtaskId || subtaskName || subtaskObj.status) {
        tasksMap[taskIdKey].subtasks.push(subtaskObj);
      }
    });

    const ordered: [string, any[]][] = Object.entries(map)
      .map(([date, tasksMap]) => [date, Object.values(tasksMap)])
      .sort((a, b) => b[0].localeCompare(a[0]));

    return ordered;
  }, [tracker, today, fromDate, toDate]);

  // Calculate metrics per date
  const metricsPerDate = useMemo(() => {
    const metrics: Record<string, any> = {};

    byDate.forEach(([date, tasks]) => {
      const clientsSet = new Set<string>();
      let totalTasks = 0;
      let totalSubtasks = 0;
      let completed = 0;
      let delayed = 0;
      let overdue = 0;
      let pending = 0;
      let inProgress = 0;

      tasks.forEach((task: any) => {
        if (task.client_id) clientsSet.add(String(task.client_id));
        totalTasks++;

        const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
        if (subtasks.length === 0 && task.status) {
          const status = String(task.status).toLowerCase();
          totalSubtasks++;
          if (status === "completed") completed++;
          else if (status === "delayed") delayed++;
          else if (status === "overdue") overdue++;
          else if (status === "pending") pending++;
          else if (status === "in_progress") inProgress++;
        } else {
          subtasks.forEach((s: any) => {
            const status = String(s.status || "").toLowerCase();
            if (status && status !== "completed" && allowedStatuses.has(status)) {
              totalSubtasks++;
              if (status === "delayed") delayed++;
              else if (status === "overdue") overdue++;
              else if (status === "pending") pending++;
              else if (status === "in_progress") inProgress++;
            }
          });
        }
      });

      metrics[date] = {
        total_tasks: totalTasks,
        total_subtasks: totalSubtasks,
        completed_subtasks: completed,
        delayed_subtasks: delayed,
        overdue_subtasks: overdue,
        pending_subtasks: pending,
        in_progress_subtasks: inProgress,
        active_clients: clientsSet.size,
      };
    });

    return metrics;
  }, [byDate]);

  const exportDate = (date: string) => {
    const rows: any[] = [];
    const groups = byDate.find(([d]) => d === date);
    if (!groups) return;
    const rowsForDate = groups[1];
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

  if (isLoading) return <div className="p-4">Loading cumulative data...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cumulative Data (Date-wise)</h3>
        <div className="flex gap-2">
          <Button onClick={exportAll} disabled={isLoading || byDate.length === 0} size="sm">
            <Download size={16} className="mr-2" />
            Export All
          </Button>
        </div>
      </div>

      {/* Date Range Filters */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[180px]">
              <Label htmlFor="from-date" className="text-xs font-medium">From Date</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="font-medium"
              />
            </div>

            <div className="min-w-[180px]">
              <Label htmlFor="to-date" className="text-xs font-medium">To Date</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="font-medium"
              />
            </div>

            <div className="flex-1 text-xs text-gray-600">
              {byDate.length} date(s) found
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date-wise rows with metrics */}
      <div className="space-y-3">
        {byDate.length === 0 ? (
          <div className="text-sm text-gray-600 p-4 text-center">
            No cumulative data available for the selected date range
          </div>
        ) : (
          byDate.map(([date, tasks]) => {
            const metrics = metricsPerDate[date] || {};
            const isExpanded = expandedDate === date;

            return (
              <div
                key={date}
                className="border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Date Row with Metric Cards */}
                <button
                  onClick={() => setExpandedDate(isExpanded ? null : date)}
                  className="w-full text-left p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        size={20}
                        className={`text-gray-600 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                      <h4 className="font-semibold text-base text-gray-900">
                        {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          weekday: "short",
                        })}
                      </h4>
                      <span className="text-xs text-gray-500">({tasks.length} tasks)</span>
                    </div>
                  </div>

                  {/* Metric Cards Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                    {/* Total Tasks */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-blue-600">
                        {metrics.total_tasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">Total Tasks</div>
                    </div>

                    {/* Total Subtasks */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-gray-900">
                        {metrics.total_subtasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">Total Subtasks</div>
                    </div>

                    {/* Completed */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-green-600">
                        {metrics.completed_subtasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">Completed</div>
                    </div>

                    {/* Delayed */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-yellow-600">
                        {metrics.delayed_subtasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">Delayed</div>
                    </div>

                    {/* Overdue */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-red-600">
                        {metrics.overdue_subtasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">Overdue</div>
                    </div>

                    {/* Pending */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-indigo-600">
                        {metrics.pending_subtasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">Pending</div>
                    </div>

                    {/* In-Progress */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-blue-600">
                        {metrics.in_progress_subtasks || 0}
                      </div>
                      <div className="text-xs text-gray-600">In-Progress</div>
                    </div>

                    {/* Active Clients */}
                    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                      <div className="text-lg font-bold text-purple-600">
                        {metrics.active_clients || 0}
                      </div>
                      <div className="text-xs text-gray-600">Active Clients</div>
                    </div>
                  </div>
                </button>

                {/* Accordion Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-white p-4 space-y-4">
                    {/* Summary Stats */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
                      <h5 className="font-semibold text-sm text-gray-900 mb-3">Summary for {date}</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-600">Total Tasks</div>
                          <div className="text-2xl font-bold text-blue-600">
                            {metrics.total_tasks || 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">Total Subtasks</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {metrics.total_subtasks || 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">Completed</div>
                          <div className="text-2xl font-bold text-green-600">
                            {metrics.completed_subtasks || 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">Active Clients</div>
                          <div className="text-2xl font-bold text-purple-600">
                            {metrics.active_clients || 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tasks List */}
                    <div>
                      <h5 className="font-semibold text-sm text-gray-900 mb-3">Tasks & Subtasks</h5>
                      <div className="space-y-3">
                        {tasks.map((task: any) => (
                          <Card key={`${task.task_id || task.id}-${date}`}>
                            <CardHeader className="pb-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <CardTitle className="text-sm">{task.task_name || "Unnamed Task"}</CardTitle>
                                  {task.client_name && (
                                    <CardDescription>Client: {task.client_name}</CardDescription>
                                  )}
                                  {task.assigned_to && (
                                    <CardDescription className="text-xs">
                                      Assigned: {Array.isArray(task.assigned_to) ? task.assigned_to.join(", ") : task.assigned_to}
                                    </CardDescription>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                            {task.subtasks && task.subtasks.length > 0 && (
                              <CardContent className="pt-0">
                                <div className="space-y-2">
                                  {task.subtasks
                                    .filter((s: any) => {
                                      const st = String(s.status || "").toLowerCase();
                                      return st !== "completed" && allowedStatuses.has(st);
                                    })
                                    .map((subtask: any) => (
                                      <div
                                        key={subtask.subtask_id || subtask.id}
                                        className="border-l-4 border-gray-200 pl-3 py-2"
                                      >
                                        <div className="font-medium text-sm">
                                          {subtask.subtask_name || "Unnamed Subtask"}
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1">
                                          Status: <span className="font-medium">{subtask.status}</span>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Export Button */}
                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() => exportDate(date)}
                        size="sm"
                        variant="outline"
                      >
                        <Download size={14} className="mr-2" />
                        Export {date}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
