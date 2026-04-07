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
import { Download } from "lucide-react";
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
  // Date range filter state
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Fetch raw task data for the selected date range (not pre-aggregated)
  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ["finops-history-raw-tasks", fromDate, toDate],
    queryFn: async () => {
      try {
        console.log("Fetching raw task data for date range:", { fromDate, toDate });
        // Use the same endpoint as Task Management to get raw task data
        // For each date in the range, fetch the tasks for that date
        const toDateToUse = toDate || fromDate || IST_DATE_STRING();
        const fromDateToUse = fromDate || toDateToUse;

        // Fetch tasks for the from date (this will return tasks for that specific date)
        const result = await apiClient.getFinOpsTasks(fromDateToUse);
        return Array.isArray(result) ? result : [];
      } catch (e) {
        console.error("Failed to fetch raw task data:", e);
        return [];
      }
    },
    staleTime: 30_000,
  });

  const today = IST_DATE_STRING();

  // Helper: Format date string (YYYY-MM-DD) as local date without timezone shifts
  const formatDateString = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-');
      // Create date as local date (not UTC) to avoid timezone shift
      const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return localDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        weekday: "short",
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Calculate summary from raw filtered tasks (matching Task Management logic)
  const cumulativeMetrics = useMemo(() => {
    let totalTasks = 0;
    let totalSubtasks = 0;
    let completed = 0;
    let delayed = 0;
    let overdue = 0;
    let pending = 0;
    let inProgress = 0;
    const clientsSet = new Set<string>();

    // Use raw tasks like Task Management does
    rawTasks.forEach((task: any) => {
      if (!task || task.deleted_at) return;

      if (task.client_id) clientsSet.add(String(task.client_id));
      totalTasks++;

      const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
      if (subtasks.length === 0) {
        // If no subtasks, count the task itself as a subtask
        totalSubtasks++;
        const status = String(task.status || "").toLowerCase();
        if (status === "completed") completed++;
        else if (status === "delayed") delayed++;
        else if (status === "overdue") overdue++;
        else if (status === "pending") pending++;
        else if (status === "in_progress") inProgress++;
      } else {
        // Count all subtasks
        subtasks.forEach((subtask: any) => {
          totalSubtasks++;
          const status = String(subtask.status || "").toLowerCase();
          if (status === "completed") completed++;
          else if (status === "delayed") delayed++;
          else if (status === "overdue") overdue++;
          else if (status === "pending") pending++;
          else if (status === "in_progress") inProgress++;
        });
      }
    });

    return {
      total_tasks: totalTasks,
      total_subtasks: totalSubtasks,
      completed_subtasks: completed,
      delayed_subtasks: delayed,
      overdue_subtasks: overdue,
      pending_subtasks: pending,
      in_progress_subtasks: inProgress,
      active_clients: clientsSet.size,
    };
  }, [rawTasks]);

  // Create a simple byDate structure for displaying per-date metrics
  const byDate = useMemo(() => {
    // Return a single entry with the summary for the selected date
    const toDateToUse = toDate || fromDate || today;
    const fromDateToUse = fromDate || toDateToUse;
    const dateToShow = fromDateToUse;

    if (cumulativeMetrics.total_tasks === 0 && rawTasks.length === 0) {
      return [];
    }

    return [[
      dateToShow,
      cumulativeMetrics,
    ]];
  }, [cumulativeMetrics, fromDate, toDate, rawTasks.length, today]);

  const exportAll = () => {
    // Export only metrics summary per date
    const rows = byDate.map(([date, metrics]) => ({
      run_date: date,
      total_tasks: metrics.total_tasks || 0,
      total_subtasks: metrics.total_subtasks || 0,
      completed: metrics.completed_subtasks || 0,
      delayed: metrics.delayed_subtasks || 0,
      overdue: metrics.overdue_subtasks || 0,
      pending: metrics.pending_subtasks || 0,
      in_progress: metrics.in_progress_subtasks || 0,
      active_clients: metrics.active_clients || 0,
    }));

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
        <h3 className="text-lg font-semibold">History (Date-wise)</h3>
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
            No history data available for the selected date range
          </div>
        ) : (
          byDate.map(([date, metrics]) => {
            return (
              <div
                key={date}
                className="border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow p-4 bg-white"
              >
                {/* Date Header */}
                <div className="mb-4">
                  <h4 className="font-semibold text-base text-gray-900">
                    {formatDateString(date)}
                  </h4>
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
              </div>
            );
          })
        )}

        {/* Cumulative Summary Section */}
        {byDate.length > 0 && (
          <div className="mt-8 pt-6 border-t-2 border-gray-300">
            <h4 className="font-semibold text-lg text-gray-900 mb-4">
              Cumulative Summary
              {fromDate && toDate && ` (${formatDateString(fromDate)} to ${formatDateString(toDate)})`}
            </h4>

            {/* Cumulative Metric Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {/* Total Tasks */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 shadow-md border border-blue-200">
                <div className="text-3xl font-bold text-blue-600">
                  {cumulativeMetrics.total_tasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Total Tasks</div>
              </div>

              {/* Total Subtasks */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 shadow-md border border-gray-200">
                <div className="text-3xl font-bold text-gray-900">
                  {cumulativeMetrics.total_subtasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Total Subtasks</div>
              </div>

              {/* Completed */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 shadow-md border border-green-200">
                <div className="text-3xl font-bold text-green-600">
                  {cumulativeMetrics.completed_subtasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Completed</div>
              </div>

              {/* Delayed */}
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 shadow-md border border-yellow-200">
                <div className="text-3xl font-bold text-yellow-600">
                  {cumulativeMetrics.delayed_subtasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Delayed</div>
              </div>

              {/* Overdue */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 shadow-md border border-red-200">
                <div className="text-3xl font-bold text-red-600">
                  {cumulativeMetrics.overdue_subtasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Overdue</div>
              </div>

              {/* Pending */}
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 shadow-md border border-indigo-200">
                <div className="text-3xl font-bold text-indigo-600">
                  {cumulativeMetrics.pending_subtasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Pending</div>
              </div>

              {/* In-Progress */}
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 shadow-md border border-cyan-200">
                <div className="text-3xl font-bold text-cyan-600">
                  {cumulativeMetrics.in_progress_subtasks || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">In-Progress</div>
              </div>

              {/* Active Clients */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 shadow-md border border-purple-200">
                <div className="text-3xl font-bold text-purple-600">
                  {cumulativeMetrics.active_clients || 0}
                </div>
                <div className="text-xs text-gray-700 font-medium">Active Clients</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
