import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Building2, CheckCircle, Download } from "lucide-react";
import * as Recharts from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import HourlyTaskStatusTimeline from "@/components/HourlyTaskStatusTimeline";
import TaskTimeframeChart from "@/components/TaskTimeframeChart";
import * as XLSX from "xlsx";

interface TrackerRow {
  id: number;
  run_date: string;
  period: string;
  task_id: number;
  task_name: string;
  subtask_id: number;
  subtask_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  assigned_to: string | null;
  reporting_managers: string | null;
  escalation_managers: string | null;
  approved_by: string | null;
  approved_at: string | null;
  delay_reason: string | null;
  delay_notes: string | null;
  description: string | null;
  sla_hours: number | null;
  sla_minutes: number | null;
  order_position: number | null;
  created_at: string;
  updated_at: string;
  client_name: string;
}

export default function FinOpsUserStats() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");

  const humanPeriod = period === "daily" ? "Today" : period === "weekly" ? "Last 7 days" : "This month";

  // Fetch finops users (department = finops)
  const { data: finopsUsers = [] } = useQuery({
    queryKey: ["finops-users"],
    queryFn: async () => {
      try {
        const resp = await apiClient.request("/admin/users");
        const allUsers = Array.isArray(resp) ? resp : resp?.data || [];
        // Filter to only finops department users
        return allUsers.filter((u: any) => u.department && u.department.toLowerCase() === "finops");
      } catch (e) {
        console.error("Failed to fetch finops users:", e);
        return [];
      }
    },
    staleTime: 300_000,
  });

  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ["finops-metrics", period],
    queryFn: async () => {
      try {
        const resp = await apiClient.getFinOpsMetrics(period);
        return resp || {};
      } catch (e) {
        console.error("Failed to fetch finops metrics:", e);
        return {};
      }
    },
    staleTime: 60_000,
    // Poll the server for near-real-time updates
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Fetch user productivity data based on filters
  const { data: productivityData = [], isLoading: isLoadingProductivity } = useQuery({
    queryKey: ["finops-user-productivity", fromDate, toDate, selectedUser],
    queryFn: async () => {
      try {
        const resp = await apiClient.getFinOpsUserProductivityData(
          fromDate || undefined,
          toDate || undefined,
          selectedUser || undefined,
        );
        return Array.isArray(resp) ? resp : resp?.data || [];
      } catch (e) {
        console.error("Failed to fetch user productivity data:", e);
        return [];
      }
    },
    enabled: !!(fromDate || toDate || selectedUser),
    staleTime: 30_000,
  });

  // Safe getters with fallbacks
  const totalTasks = metrics?.total_tasks ?? metrics?.tasks?.total ?? 0;
  const totalSubtasks = metrics?.total_subtasks ?? metrics?.subtasks?.total ?? 0;
  const completedSubtasks = metrics?.completed_subtasks ?? metrics?.subtasks?.completed ?? 0;
  const activeClients = metrics?.active_clients ?? metrics?.clients?.active ?? 0;

  // Client-wise / User-wise data (optional, show fallback message if not available)
  const clientSummary = metrics?.client_summary ?? metrics?.clients ?? null;
  const userSummary = metrics?.user_summary ?? metrics?.users ?? null;

  // Helper: Calculate duration in hours
  const calculateDuration = (startedAt: string | null, completedAt: string | null): number | null => {
    if (!startedAt || !completedAt) return null;
    const start = new Date(startedAt).getTime();
    const completed = new Date(completedAt).getTime();
    if (isNaN(start) || isNaN(completed)) return null;
    return (completed - start) / (1000 * 60 * 60); // Convert to hours
  };

  // Helper: Format duration as "X hours Y minutes"
  const formatDuration = (hours: number | null): string => {
    if (hours === null) return "N/A";
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (wholeHours === 0) return `${minutes}m`;
    if (minutes === 0) return `${wholeHours}h`;
    return `${wholeHours}h ${minutes}m`;
  };

  // Helper: Group productivity data by client
  const clientTaskCountData = useMemo(() => {
    if (!Array.isArray(productivityData) || productivityData.length === 0) {
      return [];
    }

    const clientMap: { [key: string]: { tasks: number; subtasks: number } } = {};
    productivityData.forEach((row: TrackerRow) => {
      const client = row.client_name || "Unknown";
      if (!clientMap[client]) {
        clientMap[client] = { tasks: 0, subtasks: 0 };
      }
      clientMap[client].subtasks += 1;
      if (row.subtask_id > 0) {
        clientMap[client].tasks += 1;
      }
    });

    return Object.entries(clientMap)
      .map(([client, counts]) => ({
        name: client,
        count: counts.subtasks,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 clients
  }, [productivityData]);

  // Helper: Export productivity data to Excel
  const exportProductivityToExcel = () => {
    if (!Array.isArray(productivityData) || productivityData.length === 0) {
      alert("No data to export");
      return;
    }

    const exportData = productivityData.map((row: TrackerRow) => {
      const duration = calculateDuration(row.started_at, row.completed_at);
      return {
        "Task Name": row.task_name || "",
        "Sub Task Name": row.subtask_name || "",
        "Client Name": row.client_name || "",
        "Period": row.period || "",
        "Start Time": row.started_at ? new Date(row.started_at).toLocaleString() : "",
        "Completed Time": row.completed_at ? new Date(row.completed_at).toLocaleString() : "",
        "Duration": formatDuration(duration),
        "Status": row.status || "",
        "Completed By": row.completed_by || "",
        "Approved By": row.approved_by || "",
        "Approved At": row.approved_at ? new Date(row.approved_at).toLocaleString() : "",
        "Assigned To": row.assigned_to || "",
        "Reporting Manager": row.reporting_managers ? (typeof row.reporting_managers === 'string' ? row.reporting_managers : JSON.stringify(row.reporting_managers)) : "",
        "Escalation Manager": row.escalation_managers ? (typeof row.escalation_managers === 'string' ? row.escalation_managers : JSON.stringify(row.escalation_managers)) : "",
        "Reason": row.delay_reason || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "User Productivity");

    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Task Name
      { wch: 20 }, // Sub Task Name
      { wch: 20 }, // Client Name
      { wch: 12 }, // Period
      { wch: 20 }, // Start Time
      { wch: 20 }, // Completed Time
      { wch: 12 }, // Duration
      { wch: 12 }, // Status
      { wch: 15 }, // Completed By
      { wch: 15 }, // Approved By
      { wch: 20 }, // Approved At
      { wch: 15 }, // Assigned To
      { wch: 20 }, // Reporting Manager
      { wch: 20 }, // Escalation Manager
      { wch: 20 }, // Reason
    ];
    ws["!cols"] = colWidths;

    const filename = `finops-user-productivity-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Stats</h2>
          <p className="text-gray-600 mt-1">FinOps user & client metrics — {humanPeriod}{metrics?.start_date ? ` (${metrics.start_date}${metrics.end_date && metrics.end_date !== metrics.start_date ? ` to ${metrics.end_date}` : ""})` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="weekly">Last 7 days</SelectItem>
              <SelectItem value="monthly">This month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* User Productivity Section */}
      <Card className="border-2 border-blue-100">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" /> User Productivity Chart
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">User</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Users</SelectItem>
                  {finopsUsers.map((user: any) => (
                    <SelectItem key={user.id} value={user.first_name + " " + user.last_name}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <button
                onClick={exportProductivityToExcel}
                disabled={isLoadingProductivity || productivityData.length === 0}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export to Excel
              </button>
            </div>
          </div>

          {/* Chart */}
          {isLoadingProductivity ? (
            <div className="text-center py-8 text-gray-500">Loading productivity data...</div>
          ) : clientTaskCountData.length > 0 ? (
            <div style={{ height: 350 }}>
              <ChartContainer
                id="client-productivity"
                config={{ count: { color: "#3B82F6", label: "Subtasks" } }}
              >
                <Recharts.BarChart data={clientTaskCountData} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                  <Recharts.CartesianGrid strokeDasharray="3 3" />
                  <Recharts.XAxis dataKey="name" angle={-45} textAnchor="end" height={100} tick={{ fontSize: 12 }} />
                  <Recharts.YAxis type="number" tick={{ fontSize: 12 }} />
                  <Recharts.Tooltip content={<ChartTooltipContent />} />
                  <Recharts.Bar dataKey="count" fill="var(--color-count)">
                    <Recharts.LabelList dataKey="count" position="top" />
                  </Recharts.Bar>
                </Recharts.BarChart>
              </ChartContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {fromDate || toDate || selectedUser ? "No data found for selected filters" : "Select date range and/or user to view chart"}
            </div>
          )}

          {/* Data Table Summary */}
          {Array.isArray(productivityData) && productivityData.length > 0 && (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold">Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-xs text-gray-600">Total Subtasks</div>
                  <div className="text-lg font-bold">{productivityData.length}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-xs text-gray-600">Completed</div>
                  <div className="text-lg font-bold text-green-600">
                    {productivityData.filter((r: TrackerRow) => r.status === "completed").length}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-xs text-gray-600">Avg Duration</div>
                  <div className="text-lg font-bold">
                    {formatDuration(
                      productivityData.reduce((sum: number, r: TrackerRow) => {
                        const dur = calculateDuration(r.started_at, r.completed_at);
                        return sum + (dur || 0);
                      }, 0) / productivityData.length
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-xs text-gray-600">Unique Clients</div>
                  <div className="text-lg font-bold">{clientTaskCountData.length}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Subtasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubtasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedSubtasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeClients}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts / summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Client-wise Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientSummary ? (
              (() => {
                const data = Object.entries(clientSummary).map(([client, val]: any) => ({
                  name: client,
                  tasks: Number((val as any)?.total_tasks ?? (val as any)?.tasks ?? 0),
                }));
                // sort desc and limit to top 8 for readability
                data.sort((a, b) => b.tasks - a.tasks);
                const top = data.slice(0, 8).reverse(); // reverse for horizontal bars
                const chartHeight = Math.min(440, Math.max(220, top.length * 36));
                return (
                  <div style={{ height: chartHeight }}>
                    <ChartContainer
                      id="client-summary"
                      config={{ tasks: { color: "#6366F1", label: "Tasks" } }}
                    >
                      <Recharts.BarChart data={top} layout="vertical" margin={{ left: 8, right: 20 }}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis type="number" tick={{ fontSize: 12 }} />
                        <Recharts.YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 12 }} />
                        <Recharts.Tooltip content={<ChartTooltipContent />} />
                        <Recharts.Bar dataKey="tasks" fill="var(--color-tasks)" barSize={14}>
                          <Recharts.LabelList dataKey="tasks" position="right" formatter={(v: any) => String(v)} />
                        </Recharts.Bar>
                      </Recharts.BarChart>
                    </ChartContainer>
                  </div>
                );
              })()
            ) : (
              <div className="text-sm text-gray-500">No client summary available for the selected period.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" /> User-wise Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userSummary ? (
              (() => {
                const data = Object.entries(userSummary).map(([user, val]: any) => ({
                  name: user,
                  tasks: Number((val as any)?.total_tasks ?? (val as any)?.tasks ?? 0),
                }));
                data.sort((a, b) => b.tasks - a.tasks);
                const top = data.slice(0, 8).reverse();
                const chartHeight = Math.min(440, Math.max(220, top.length * 36));
                return (
                  <div style={{ height: chartHeight }}>
                    <ChartContainer
                      id="user-summary"
                      config={{ tasks: { color: "#10B981", label: "Tasks" } }}
                    >
                      <Recharts.BarChart data={top} layout="vertical" margin={{ left: 8, right: 20 }}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis type="number" tick={{ fontSize: 12 }} />
                        <Recharts.YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 12 }} />
                        <Recharts.Tooltip content={<ChartTooltipContent />} />
                        <Recharts.Bar dataKey="tasks" fill="var(--color-tasks)" barSize={14}>
                          <Recharts.LabelList dataKey="tasks" position="right" formatter={(v: any) => String(v)} />
                        </Recharts.Bar>
                      </Recharts.BarChart>
                    </ChartContainer>
                  </div>
                );
              })()
            ) : (
              <div className="text-sm text-gray-500">No user summary available for the selected period.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task Timeframe Hourly Line Chart */}
      <div className="grid grid-cols-2 gap-6">
        <TaskTimeframeChart />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Overdues (by Client)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.overdue_by_client ? (
              (() => {
                const data = Object.entries(metrics.overdue_by_client).map(([c, v]: any) => ({ name: (c && String(c).trim()) || "Unknown", value: Number(v || 0) }));
                data.sort((a, b) => b.value - a.value);
                const top = data.slice(0, 8);
                if (!top.length) return <div className="text-sm text-gray-500">No overdue data available for the selected period.</div>;
                const chartHeight = Math.min(320, Math.max(160, top.length * 36));
                return (
                  <div style={{ height: chartHeight }}>
                    <ChartContainer id="overdue-by-client" config={{ value: { color: "#F59E0B", label: "Overdues" } }}>
                      <Recharts.BarChart data={top} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis dataKey="name" type="category" tick={{ fontSize: 12, angle: -35, textAnchor: 'end' }} interval={0} />
                        <Recharts.YAxis type="number" tick={{ fontSize: 12 }} />
                        <Recharts.Tooltip content={<ChartTooltipContent />} />
                        <Recharts.Bar dataKey="value" fill="var(--color-value)">
                          <Recharts.LabelList dataKey="value" position="top" formatter={(v: any) => String(v)} />
                        </Recharts.Bar>
                      </Recharts.BarChart>
                    </ChartContainer>
                  </div>
                );
              })()
            ) : (
              <div className="text-sm text-gray-500">No overdue data available for the selected period.</div>
            )}
          </CardContent>
        </Card>

        <HourlyTaskStatusTimeline />
      </div>

    </div>
  );
}
