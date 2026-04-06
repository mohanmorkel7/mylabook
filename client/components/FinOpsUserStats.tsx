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
  const [filterType, setFilterType] = useState<"completed_by" | "approved_by" | "in_progress">("completed_by");

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
    queryKey: ["finops-user-productivity", fromDate, toDate, selectedUser, filterType],
    queryFn: async () => {
      try {
        const resp = await apiClient.getFinOpsUserProductivityData(
          fromDate || undefined,
          toDate || undefined,
          selectedUser || undefined,
          filterType,
        );
        return Array.isArray(resp) ? resp : resp?.data || [];
      } catch (e) {
        console.error("Failed to fetch user productivity data:", e);
        return [];
      }
    },
    enabled: !!(fromDate || toDate), // Fetch when dates are selected
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

  // Helper: Check if duration is reasonable (has valid timestamps)
  const isReasonableDuration = (row: TrackerRow): boolean => {
    const duration = calculateDuration(row.started_at, row.completed_at);
    // Only filter out records with no duration (null values)
    // Allow all positive durations regardless of period type
    return duration !== null && duration > 0;
  };

  // Filter productivity data to only include records with valid durations
  const validProductivityData = useMemo(() => {
    if (!Array.isArray(productivityData)) return [];
    return productivityData.filter(isReasonableDuration);
  }, [productivityData]);

  // Calculate unique user count based on filter type
  const getUniqueUserCount = useMemo(() => {
    if (!Array.isArray(validProductivityData) || validProductivityData.length === 0) return 0;
    const users = new Set<string>();
    validProductivityData.forEach((row: TrackerRow) => {
      let user = "";
      if (filterType === "completed_by") {
        user = row.completed_by?.trim() || "";
      } else if (filterType === "approved_by") {
        user = row.approved_by?.trim() || "";
      } else if (filterType === "in_progress") {
        user = row.completed_by?.trim() || "";
      }
      if (user) users.add(user);
    });
    return users.size;
  }, [validProductivityData, filterType]);

  // Helper: Group productivity data by client
  const clientTaskCountData = useMemo(() => {
    if (!Array.isArray(validProductivityData) || validProductivityData.length === 0) {
      return [];
    }

    const clientMap: { [key: string]: { tasks: number; subtasks: number } } = {};
    validProductivityData.forEach((row: TrackerRow) => {
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
  }, [validProductivityData]);

  // Helper: Format date only (YYYY-MM-DD)
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-CA"); // YYYY-MM-DD format
  };

  // Helper: Format time only (HH:MM:SS)
  const formatTime = (dateString: string | null): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", { hour12: false });
  };

  // Helper: Get duration category color
  const getDurationColor = (hours: number | null): { color: string; label: string } => {
    if (hours === null) return { color: "#9CA3AF", label: "N/A" };
    if (hours <= 1) return { color: "#10B981", label: "≤1h (On Time)" };
    if (hours <= 2) return { color: "#F59E0B", label: "1-2h (Amber)" };
    if (hours <= 5) return { color: "#F97316", label: "2-5h (Orange)" };
    return { color: "#EF4444", label: ">5h (Red)" };
  };

  // Helper: Get hourly task completion data
  const getHourlyTaskData = useMemo(() => {
    if (!Array.isArray(validProductivityData) || validProductivityData.length === 0) {
      return [];
    }

    // Initialize 24 hours with duration categories
    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      "≤1h": 0,
      "1-2h": 0,
      "2-5h": 0,
      ">5h": 0,
      total: 0,
    }));

    // Group tasks by completion hour
    const hourlyTasks: Record<number, Array<{ name: string; duration: number }>> = {};

    validProductivityData.forEach((row: TrackerRow) => {
      const duration = calculateDuration(row.started_at, row.completed_at);
      if (!row.completed_at || duration === null) return;

      const completedDate = new Date(row.completed_at);
      const completionHour = completedDate.getHours(); // IST hour

      if (!hourlyTasks[completionHour]) {
        hourlyTasks[completionHour] = [];
      }

      // Store task details
      const taskKey = `${row.task_name} - ${row.subtask_name}`;
      hourlyTasks[completionHour].push({ name: taskKey, duration });

      // Categorize by duration
      if (duration <= 1) {
        hourlyData[completionHour]["≤1h"]++;
      } else if (duration <= 2) {
        hourlyData[completionHour]["1-2h"]++;
      } else if (duration <= 5) {
        hourlyData[completionHour]["2-5h"]++;
      } else {
        hourlyData[completionHour][">5h"]++;
      }
      hourlyData[completionHour].total++;
    });

    // Store hourly tasks for hover details
    return hourlyData;
  }, [validProductivityData]);

  // Helper: Parse managers field (handles string, JSON array, or null)
  const parseManagers = (value: any): string => {
    if (!value) return "";
    const strValue = String(value).trim();
    if (!strValue || strValue === "''") return "";

    // Try to parse if it looks like JSON
    if (strValue.startsWith('[') && strValue.endsWith(']')) {
      try {
        const parsed = JSON.parse(strValue);
        if (Array.isArray(parsed)) {
          return parsed.filter(v => v && v.trim()).join(", ");
        }
      } catch {
        // If JSON parse fails, try regex to extract quoted values
        const matches = strValue.match(/"([^"]+)"/g);
        if (matches && matches.length > 0) {
          return matches.map(m => m.replace(/"/g, '').trim()).filter(v => v).join(", ");
        }
      }
    }

    // Return as is if it's plain text
    return strValue;
  };

  // Helper: Export productivity data to Excel
  const exportProductivityToExcel = () => {
    if (!Array.isArray(validProductivityData) || validProductivityData.length === 0) {
      alert("No valid data to export");
      return;
    }

    // Create summary data
    const filterTypeLabel = {
      "completed_by": "Completed By",
      "approved_by": "Approved By",
      "in_progress": "In Progress By"
    }[filterType];

    const summaryData = [
      { "Metric": "Filter Type", "Value": filterTypeLabel },
      { "Metric": "Selected User", "Value": selectedUser || "All Users" },
      { "Metric": "From Date", "Value": fromDate || "N/A" },
      { "Metric": "To Date", "Value": toDate || "N/A" },
      { "Metric": "Total Subtasks", "Value": validProductivityData.length },
      { "Metric": "Completed", "Value": validProductivityData.filter((r: TrackerRow) => r.status === "completed").length },
      { "Metric": "Unique Users", "Value": getUniqueUserCount },
      { "Metric": "Unique Clients", "Value": clientTaskCountData.length },
    ];

    const exportData = validProductivityData.map((row: TrackerRow) => {
      const duration = calculateDuration(row.started_at, row.completed_at);
      return {
        "Task Name": row.task_name || "",
        "Sub Task Name": row.subtask_name || "",
        "Client Name": row.client_name || "",
        "Period": row.period || "",
        "Start Date": formatDate(row.started_at),
        "Start Time": formatTime(row.started_at),
        "Completed Date": formatDate(row.completed_at),
        "Completed Time": formatTime(row.completed_at),
        "Duration": formatDuration(duration),
        "Status": row.status || "",
        "Completed By": row.completed_by || "",
        "Approved By": row.approved_by || "",
        "Approved At": row.approved_at ? new Date(row.approved_at).toLocaleString() : "",
        "Assigned To": parseManagers(row.assigned_to || ""),
        "Reason": row.delay_reason || "",
      };
    });

    // Create hourly analytics pivot table
    const hourlyPivotData: any[] = [];

    // Create header row with duration categories
    const headerRow: any = { "Hour": "" };
    const durationCategories = ["≤1h", "1-2h", "2-5h", ">5h"];
    durationCategories.forEach(cat => {
      headerRow[cat] = cat;
    });
    headerRow["Total"] = "Total";
    hourlyPivotData.push(headerRow);

    // Add data for each hour
    getHourlyTaskData.forEach((hourData: any) => {
      const row: any = { "Hour": hourData.hour };
      durationCategories.forEach(cat => {
        row[cat] = hourData[cat] || 0;
      });
      row["Total"] = hourData.total || 0;
      hourlyPivotData.push(row);
    });

    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    summaryWs["!cols"] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Data sheet
    const dataWs = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 20 }, // Task Name
      { wch: 20 }, // Sub Task Name
      { wch: 20 }, // Client Name
      { wch: 12 }, // Period
      { wch: 12 }, // Start Date
      { wch: 12 }, // Start Time
      { wch: 12 }, // Completed Date
      { wch: 12 }, // Completed Time
      { wch: 12 }, // Duration
      { wch: 12 }, // Status
      { wch: 15 }, // Completed By
      { wch: 15 }, // Approved By
      { wch: 20 }, // Approved At
      { wch: 20 }, // Assigned To
      { wch: 20 }, // Reason
    ];
    dataWs["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, dataWs, "User Productivity");

    // Hourly Analytics sheet
    const hourlyWs = XLSX.utils.json_to_sheet(hourlyPivotData);
    hourlyWs["!cols"] = [
      { wch: 10 }, // Hour
      { wch: 12 }, // ≤1h
      { wch: 12 }, // 1-2h
      { wch: 12 }, // 2-5h
      { wch: 12 }, // >5h
      { wch: 12 }, // Total
    ];
    XLSX.utils.book_append_sheet(wb, hourlyWs, "Hourly Analytics");

    const filename = `finops-user-productivity-${filterTypeLabel.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
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
      <div className="space-y-4">
        {/* Filter Card */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-gray-800">
              <Users className="w-5 h-5 text-blue-600" /> User Productivity Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Filter Type</label>
                <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                  <SelectTrigger className="w-full rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed_by">Completed By</SelectItem>
                    <SelectItem value="approved_by">Approved By</SelectItem>
                    <SelectItem value="in_progress">In Progress By</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">User</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-full rounded-lg">
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
                  disabled={isLoadingProductivity || validProductivityData.length === 0}
                  className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-semibold hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Export Excel
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart Card */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="text-base font-semibold text-gray-800">Client-wise Subtask Count</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Show warning if data was filtered */}
            {productivityData.length > validProductivityData.length && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                ⚠️ Filtered {productivityData.length - validProductivityData.length} record(s) with unreasonably long durations (data quality issue)
              </div>
            )}
            {isLoadingProductivity ? (
              <div className="text-center py-12 text-gray-500">Loading productivity data...</div>
            ) : clientTaskCountData.length > 0 ? (
              <div className="w-full overflow-auto">
                <div style={{ minHeight: 400, width: "100%" }}>
                  <ChartContainer
                    id="client-productivity"
                    config={{ count: { color: "#3B82F6", label: "Subtasks" } }}
                  >
                    <Recharts.ResponsiveContainer width="100%" height={400}>
                      <Recharts.BarChart
                        data={clientTaskCountData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                      >
                        <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <Recharts.XAxis
                          dataKey="name"
                          angle={-45}
                          textAnchor="end"
                          height={120}
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                        />
                        <Recharts.YAxis
                          type="number"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          label={{ value: "Count", angle: -90, position: "insideLeft", offset: 5 }}
                        />
                        <Recharts.Tooltip
                          content={<ChartTooltipContent />}
                          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                        />
                        <Recharts.Bar dataKey="count" fill="#3B82F6" radius={[8, 8, 0, 0]}>
                          <Recharts.LabelList dataKey="count" position="top" fill="#374151" fontSize={12} />
                        </Recharts.Bar>
                      </Recharts.BarChart>
                    </Recharts.ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                {fromDate || toDate || selectedUser ? (
                  <div>
                    <p className="text-sm">No data found for selected filters</p>
                    <p className="text-xs text-gray-400 mt-1">Try adjusting your date range or user selection</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm">Select date range and/or user to view chart</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Task Completion Chart */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
            <CardTitle className="text-base font-semibold text-gray-800">Hourly Task Completion (12 AM - 11:59 PM IST)</CardTitle>
            <p className="text-xs text-gray-500 mt-2">Color-coded by task duration: Green (&lt;=1h) | Amber (1-2h) | Orange (2-5h) | Red (&gt;5h)</p>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoadingProductivity ? (
              <div className="text-center py-12 text-gray-500">Loading productivity data...</div>
            ) : getHourlyTaskData.some(d => d.total > 0) ? (
              <div className="w-full overflow-auto">
                <div style={{ minHeight: 400, width: "100%" }}>
                  <ChartContainer
                    id="hourly-completion"
                    config={{
                      "≤1h": { color: "#10B981", label: "On Time (≤1h)" },
                      "1-2h": { color: "#F59E0B", label: "Amber (1-2h)" },
                      "2-5h": { color: "#F97316", label: "Orange (2-5h)" },
                      ">5h": { color: "#EF4444", label: "Red (>5h)" },
                    }}
                  >
                    <Recharts.ResponsiveContainer width="100%" height={400}>
                      <Recharts.BarChart
                        data={getHourlyTaskData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <Recharts.CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <Recharts.XAxis
                          dataKey="hour"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          label={{ value: "Hour (IST)", position: "insideBottomRight", offset: -10 }}
                        />
                        <Recharts.YAxis
                          type="number"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          label={{ value: "Task Count", angle: -90, position: "insideLeft", offset: 5 }}
                        />
                        <Recharts.Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length > 0) {
                              const hour = payload[0].payload.hour;
                              const total = payload[0].payload.total;
                              return (
                                <div className="bg-white p-3 border border-gray-300 rounded shadow-lg text-sm">
                                  <p className="font-semibold text-gray-900">{hour} - {String(parseInt(hour) + 1).padStart(2, "0")}:00</p>
                                  <p className="text-gray-600 mt-1">Total Tasks: <strong>{total}</strong></p>
                                  {payload[0].payload["≤1h"] > 0 && <p className="text-green-600">✓ On Time (&lt;=1h): {payload[0].payload["≤1h"]}</p>}
                                  {payload[0].payload["1-2h"] > 0 && <p className="text-amber-600">⚠ Amber (1-2h): {payload[0].payload["1-2h"]}</p>}
                                  {payload[0].payload["2-5h"] > 0 && <p className="text-orange-600">⚠ Orange (2-5h): {payload[0].payload["2-5h"]}</p>}
                                  {payload[0].payload[">5h"] > 0 && <p className="text-red-600">✕ Red (&gt;5h): {payload[0].payload[">5h"]}</p>}
                                </div>
                              );
                            }
                            return null;
                          }}
                          contentStyle={{ borderRadius: "8px" }}
                        />
                        <Recharts.Legend />
                        <Recharts.Bar dataKey="≤1h" stackId="duration" fill="#10B981" />
                        <Recharts.Bar dataKey="1-2h" stackId="duration" fill="#F59E0B" />
                        <Recharts.Bar dataKey="2-5h" stackId="duration" fill="#F97316" />
                        <Recharts.Bar dataKey=">5h" stackId="duration" fill="#EF4444" />
                      </Recharts.BarChart>
                    </Recharts.ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                {fromDate || toDate || selectedUser ? (
                  <div>
                    <p className="text-sm">No hourly task data available for selected filters</p>
                    <p className="text-xs text-gray-400 mt-1">Try adjusting your date range or user selection</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm">Select date range and/or user to view hourly chart</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {Array.isArray(validProductivityData) && validProductivityData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {/* Total Subtasks Card */}
            <div className="group relative bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-default overflow-hidden">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-300 opacity-10 rounded-full -mr-10 -mt-10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-blue-50 text-xs font-semibold uppercase tracking-wider">Total Subtasks</p>
                  <p className="text-3xl font-bold text-white mt-2 whitespace-nowrap">{validProductivityData.length}</p>
                </div>
                <div className="bg-white bg-opacity-15 rounded-lg p-2 ml-2">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Completed Card */}
            <div className="group relative bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-default overflow-hidden">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-green-300 opacity-10 rounded-full -mr-10 -mt-10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-green-50 text-xs font-semibold uppercase tracking-wider">Completed</p>
                  <p className="text-3xl font-bold text-white mt-2 whitespace-nowrap">
                    {validProductivityData.filter((r: TrackerRow) => r.status === "completed").length}
                  </p>
                </div>
                <div className="bg-white bg-opacity-15 rounded-lg p-2 ml-2">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Avg Duration Card */}
            <div className="group relative bg-gradient-to-br from-indigo-400 to-indigo-500 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-default overflow-hidden">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-300 opacity-10 rounded-full -mr-10 -mt-10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-indigo-50 text-xs font-semibold uppercase tracking-wider">Avg Duration</p>
                  <p className="text-lg font-bold text-white mt-2 whitespace-nowrap">
                    {(() => {
                      const validDurations = validProductivityData
                        .map((r: TrackerRow) => calculateDuration(r.started_at, r.completed_at))
                        .filter((dur: number | null): dur is number => dur !== null);
                      if (validDurations.length === 0) return "N/A";
                      const avgDur = validDurations.reduce((a, b) => a + b, 0) / validDurations.length;
                      return formatDuration(avgDur);
                    })()}
                  </p>
                </div>
                <div className="bg-white bg-opacity-15 rounded-lg p-2 ml-2">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Total Duration Card */}
            <div className="group relative bg-gradient-to-br from-cyan-400 to-cyan-500 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-default overflow-hidden">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-300 opacity-10 rounded-full -mr-10 -mt-10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-cyan-50 text-xs font-semibold uppercase tracking-wider">Total Duration</p>
                  <p className="text-lg font-bold text-white mt-2 whitespace-nowrap">
                    {(() => {
                      const validDurations = validProductivityData
                        .map((r: TrackerRow) => calculateDuration(r.started_at, r.completed_at))
                        .filter((dur: number | null): dur is number => dur !== null);
                      if (validDurations.length === 0) return "N/A";
                      const totalDur = validDurations.reduce((a, b) => a + b, 0);
                      return formatDuration(totalDur);
                    })()}
                  </p>
                </div>
                <div className="bg-white bg-opacity-15 rounded-lg p-2 ml-2">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Unique Users Card */}
            <div className="group relative bg-gradient-to-br from-purple-400 to-purple-500 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-default overflow-hidden">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-purple-300 opacity-10 rounded-full -mr-10 -mt-10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-purple-50 text-xs font-semibold uppercase tracking-wider">Unique Users</p>
                  <p className="text-3xl font-bold text-white mt-2 whitespace-nowrap">{getUniqueUserCount}</p>
                </div>
                <div className="bg-white bg-opacity-15 rounded-lg p-2 ml-2">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Unique Clients Card */}
            <div className="group relative bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-default overflow-hidden">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-300 opacity-10 rounded-full -mr-10 -mt-10"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-orange-50 text-xs font-semibold uppercase tracking-wider">Unique Clients</p>
                  <p className="text-3xl font-bold text-white mt-2 whitespace-nowrap">{clientTaskCountData.length}</p>
                </div>
                <div className="bg-white bg-opacity-15 rounded-lg p-2 ml-2">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Quality Alert */}
        {Array.isArray(validProductivityData) && validProductivityData.length > 0 && (() => {
          const longDurationTasks = validProductivityData.filter((row: TrackerRow) => {
            const duration = calculateDuration(row.started_at, row.completed_at);
            return duration && duration > 24;
          });
          return longDurationTasks.length > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-amber-900 text-sm font-semibold flex items-center gap-2">
                ⚠️ Data Quality Note
              </p>
              <p className="text-amber-800 text-xs mt-2">
                {longDurationTasks.length} task(s) have durations spanning more than 24 hours. This includes tasks that started on one date but completed on another.
                <strong className="ml-1">Total Duration includes all actual hours worked.</strong>
              </p>
            </div>
          ) : null;
        })()}

        {/* Detailed Data Table */}
        {Array.isArray(validProductivityData) && validProductivityData.length > 0 && (
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
              <CardTitle className="text-base font-semibold text-gray-800">
                Detailed Task Breakdown ({validProductivityData.length} records)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Task</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Sub Task</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Client</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Start Date</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Start Time</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Completed Date</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Completed Time</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Duration</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-700">Completed By</th>
                  </tr>
                </thead>
                <tbody>
                  {validProductivityData.slice(0, 20).map((row: TrackerRow, idx: number) => {
                    const duration = calculateDuration(row.started_at, row.completed_at);
                    return (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 text-gray-900 max-w-xs truncate text-xs" title={row.task_name}>
                          {row.task_name}
                        </td>
                        <td className="px-3 py-3 text-gray-700 max-w-xs truncate text-xs" title={row.subtask_name}>
                          {row.subtask_name}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs">{row.client_name}</td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {formatDate(row.started_at) || "-"}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {formatTime(row.started_at) || "-"}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {formatDate(row.completed_at) || "-"}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {formatTime(row.completed_at) || "-"}
                        </td>
                        <td className="px-3 py-3 text-gray-700 font-medium text-xs">{formatDuration(duration)}</td>
                        <td className="px-3 py-3">
                          <Badge
                            className={`text-xs ${
                              row.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : row.status === "overdue"
                                ? "bg-red-100 text-red-800"
                                : row.status === "in_progress"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-xs">{row.completed_by || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {validProductivityData.length > 20 && (
                <p className="text-xs text-gray-500 mt-3 text-center">
                  Showing 20 of {validProductivityData.length} records. Download Excel to see all data.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

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
