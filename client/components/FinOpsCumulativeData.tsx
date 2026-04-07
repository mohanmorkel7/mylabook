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

const getFirstDayOfMonth = (): string => {
  const ist = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

export default function FinOpsCumulativeData() {
  const [fromDate, setFromDate] = useState(getFirstDayOfMonth());
  const [toDate, setToDate] = useState(IST_DATE_STRING());

  const { data: rawTaskData = [], isLoading } = useQuery({
    queryKey: ["finops-history-tasks", fromDate, toDate],
    queryFn: async () => {
      try {
        console.log("Fetching history task data with dates:", { fromDate, toDate });
        return await apiClient.getFinOpsHistoryTasks(fromDate, toDate);
      } catch (e) {
        console.error("Failed to fetch history tasks:", e);
        return [];
      }
    },
    staleTime: 30_000,
  });

  const today = IST_DATE_STRING();

  const formatDateString = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-');
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

  // Group raw tasks by date and calculate metrics
  const byDate = useMemo(() => {
    const dateGroups: Record<string, any> = {};

    (rawTaskData || []).forEach((row: any) => {
      if (!row || row.deleted_at) return;

      const runDate = row.run_date ? String(row.run_date).slice(0, 10) : today;
      
      if (!dateGroups[runDate]) {
        dateGroups[runDate] = {
          date: runDate,
          tasks: {},
          totalTasks: 0,
          totalSubtasks: 0,
          completed: 0,
          delayed: 0,
          overdue: 0,
          pending: 0,
          inProgress: 0,
          clients: new Set<string>(),
        };
      }

      const taskKey = String(row.task_id);
      if (!dateGroups[runDate].tasks[taskKey]) {
        dateGroups[runDate].tasks[taskKey] = {
          task_id: row.task_id,
          task_name: row.task_name,
          client_id: row.client_id,
          client_name: row.client_name,
          assigned_to: row.assigned_to,
          status: row.status,
          subtasks: [],
        };
        dateGroups[runDate].totalTasks++;
        if (row.client_id) dateGroups[runDate].clients.add(String(row.client_id));
      }

      if (row.subtask_id) {
        dateGroups[runDate].tasks[taskKey].subtasks.push({
          subtask_id: row.subtask_id,
          status: row.status,
        });
        dateGroups[runDate].totalSubtasks++;
        
        const status = String(row.status || "").toLowerCase();
        if (status === "completed") dateGroups[runDate].completed++;
        else if (status === "delayed") dateGroups[runDate].delayed++;
        else if (status === "overdue") dateGroups[runDate].overdue++;
        else if (status === "pending") dateGroups[runDate].pending++;
        else if (status === "in_progress") dateGroups[runDate].inProgress++;
      }
    });

    return Object.entries(dateGroups)
      .map(([date, data]) => [
        date,
        {
          total_tasks: data.totalTasks,
          total_subtasks: data.totalSubtasks,
          completed_subtasks: data.completed,
          delayed_subtasks: data.delayed,
          overdue_subtasks: data.overdue,
          pending_subtasks: data.pending,
          in_progress_subtasks: data.inProgress,
          active_clients: data.clients.size,
          tasks: Object.values(data.tasks),
        },
      ])
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [rawTaskData, today]);

  const cumulativeMetrics = useMemo(() => {
    let totalTasks = 0;
    let totalSubtasks = 0;
    let completed = 0;
    let delayed = 0;
    let overdue = 0;
    let pending = 0;
    let inProgress = 0;

    byDate.forEach(([date, metrics]) => {
      totalTasks += metrics.total_tasks || 0;
      totalSubtasks += metrics.total_subtasks || 0;
      completed += metrics.completed_subtasks || 0;
      delayed += metrics.delayed_subtasks || 0;
      overdue += metrics.overdue_subtasks || 0;
      pending += metrics.pending_subtasks || 0;
      inProgress += metrics.in_progress_subtasks || 0;
    });

    return {
      total_tasks: totalTasks,
      total_subtasks: totalSubtasks,
      completed_subtasks: completed,
      delayed_subtasks: delayed,
      overdue_subtasks: overdue,
      pending_subtasks: pending,
      in_progress_subtasks: inProgress,
      active_clients: Math.max(...byDate.map(([_, m]) => m.active_clients || 0), 0),
    };
  }, [byDate]);

  const exportAll = () => {
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
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">History (Date-wise)</h3>
        <Button onClick={exportAll} disabled={isLoading || byDate.length === 0} size="sm">
          <Download size={16} className="mr-2" />
          Export All
        </Button>
      </div>

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

      <div className="space-y-6">
        {byDate.length === 0 ? (
          <div className="text-sm text-gray-600 p-4 text-center">
            No history data available for the selected date range
          </div>
        ) : (
          byDate.map(([date, metrics]: any) => (
            <div key={date} className="border border-gray-200 rounded-lg shadow-sm p-6 bg-white">
              <h4 className="font-semibold text-base text-gray-900 mb-4">{formatDateString(date)}</h4>

              {/* Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-blue-600">{metrics.total_tasks || 0}</div>
                  <div className="text-xs text-gray-600">Total Tasks</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-gray-900">{metrics.total_subtasks || 0}</div>
                  <div className="text-xs text-gray-600">Total Subtasks</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-green-600">{metrics.completed_subtasks || 0}</div>
                  <div className="text-xs text-gray-600">Completed</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-yellow-600">{metrics.delayed_subtasks || 0}</div>
                  <div className="text-xs text-gray-600">Delayed</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-red-600">{metrics.overdue_subtasks || 0}</div>
                  <div className="text-xs text-gray-600">Overdue</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-indigo-600">{metrics.pending_subtasks || 0}</div>
                  <div className="text-xs text-gray-600">Pending</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-blue-600">{metrics.in_progress_subtasks || 0}</div>
                  <div className="text-xs text-gray-600">In-Progress</div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="text-lg font-bold text-purple-600">{metrics.active_clients || 0}</div>
                  <div className="text-xs text-gray-600">Active Clients</div>
                </div>
              </div>

            </div>
          ))
        )}

        {/* Cumulative Summary */}
        {byDate.length > 0 && (
          <div className="mt-8 pt-6 border-t-2 border-gray-300">
            <h4 className="font-semibold text-lg text-gray-900 mb-4">
              Cumulative Summary {fromDate && toDate && `(${formatDateString(fromDate)} to ${formatDateString(toDate)})`}
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 shadow-md border border-blue-200">
                <div className="text-3xl font-bold text-blue-600">{cumulativeMetrics.total_tasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Total Tasks</div>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 shadow-md border border-gray-200">
                <div className="text-3xl font-bold text-gray-900">{cumulativeMetrics.total_subtasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Total Subtasks</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 shadow-md border border-green-200">
                <div className="text-3xl font-bold text-green-600">{cumulativeMetrics.completed_subtasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Completed</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 shadow-md border border-yellow-200">
                <div className="text-3xl font-bold text-yellow-600">{cumulativeMetrics.delayed_subtasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Delayed</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 shadow-md border border-red-200">
                <div className="text-3xl font-bold text-red-600">{cumulativeMetrics.overdue_subtasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Overdue</div>
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 shadow-md border border-indigo-200">
                <div className="text-3xl font-bold text-indigo-600">{cumulativeMetrics.pending_subtasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Pending</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 shadow-md border border-cyan-200">
                <div className="text-3xl font-bold text-cyan-600">{cumulativeMetrics.in_progress_subtasks || 0}</div>
                <div className="text-xs text-gray-700 font-medium">In-Progress</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 shadow-md border border-purple-200">
                <div className="text-3xl font-bold text-purple-600">{cumulativeMetrics.active_clients || 0}</div>
                <div className="text-xs text-gray-700 font-medium">Active Clients</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
