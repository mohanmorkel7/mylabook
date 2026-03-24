import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { TrendingUp, AlertTriangle, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface TaskItem {
  task_id: number;
  task_name: string;
  subtask_id: number;
  subtask_name: string;
  scheduled_time: string;
  completed_at: string | null;
  started_at: string | null;
  overdue_at: string | null;
  delayed_at: string | null;
  delay_reason: string | null;
  delay_notes: string | null;
  completed_by: string | null;
  assigned_to: string | null;
  client_name: string | null;
  status: string;
}

interface HourData {
  hour: number;
  hour_label: string;
  active_tasks: number;
  active_subtasks: number;
  task_list: TaskItem[];
}

const STATUS_COLOR: Record<string, string> = {
  completed: "#10B981",
  in_progress: "#3B82F6",
  pending: "#F59E0B",
  delayed: "#8B5CF6",
  overdue: "#EF4444",
};

/** Calculate duration in decimal hours between scheduled_time ("HH:MM:SS") and completed_at timestamp */
function calcDurationHours(scheduled_time: string, completed_at: string | null): number | null {
  if (!scheduled_time || !completed_at) return null;
  try {
    const [sh, sm] = scheduled_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const d = new Date(completed_at.replace(" ", "T"));
    if (isNaN(d.getTime())) return null;
    const endMin = d.getHours() * 60 + d.getMinutes();
    const diff = endMin - startMin;
    return diff > 0 ? diff / 60 : null;
  } catch {
    return null;
  }
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts.replace(" ", "T")).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return ts;
  }
}

/** Color scale: green → yellow → orange → red based on hours taken */
function durationColor(hours: number): string {
  if (hours >= 8) return "#EF4444";
  if (hours >= 5) return "#F97316";
  if (hours >= 2) return "#F59E0B";
  return "#10B981";
}

function durationLabel(hours: number): string {
  if (hours >= 8) return "Critical";
  if (hours >= 5) return "High";
  if (hours >= 2) return "Moderate";
  return "Normal";
}

function maxDurationInHour(hourData: HourData): number {
  let max = 0;
  for (const t of hourData.task_list) {
    const d = calcDurationHours(t.scheduled_time, t.completed_at);
    if (d !== null && d > max) max = d;
  }
  return max;
}

// ─── Custom chart dot ─────────────────────────────────────────────────────────
function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const maxDur = maxDurationInHour(payload as HourData);
  const color = maxDur >= 2 ? durationColor(maxDur) : "#3B82F6";
  const r = maxDur >= 5 ? 6 : maxDur >= 2 ? 5 : 3;
  return (
    <circle
      key={`dot-${(payload as HourData).hour}`}
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      stroke="#fff"
      strokeWidth={maxDur >= 2 ? 1.5 : 0}
    />
  );
}

// ─── Tooltip panel ─────────────────────────────────────────────────────────────
interface TooltipPanelProps {
  hourData: HourData;
  viewType: "task" | "subtask";
  pos: { x: number; y: number; flipLeft: boolean; flipRight: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function TooltipPanel({ hourData, viewType, pos, onMouseEnter, onMouseLeave }: TooltipPanelProps) {
  const tasks = hourData.task_list || [];
  const count = viewType === "task" ? hourData.active_tasks : hourData.active_subtasks;

  const unique =
    viewType === "task"
      ? Array.from(new Map(tasks.map((t) => [t.task_id, t])).values())
      : tasks;

  const annotated = unique
    .map((t) => ({ ...t, durationHours: calcDurationHours(t.scheduled_time, t.completed_at) }))
    .sort((a, b) => (b.durationHours ?? 0) - (a.durationHours ?? 0));

  const longestDur = annotated[0]?.durationHours ?? 0;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        ...(pos.flipLeft
          ? { right: pos.flipRight, top: pos.y - 20 }
          : { left: pos.x + 16, top: pos.y - 20 }),
        zIndex: 50,
        pointerEvents: "all",
      }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl p-3"
      onWheel={(e) => e.stopPropagation()}
    >
      <div style={{ width: 360, maxHeight: 360, overflowY: "auto", overflowX: "hidden" }}>
        {/* Header */}
        <div className="sticky top-0 bg-white pb-1.5 border-b border-gray-100 mb-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">
              {hourData.hour_label} —{" "}
              <span className="text-blue-600">{count}</span> active{" "}
              {viewType === "task" ? "tasks" : "subtasks"}
            </p>
            {longestDur >= 2 && (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: durationColor(longestDur) + "20",
                  color: durationColor(longestDur),
                }}
              >
                <AlertTriangle className="w-3 h-3" />
                Max {formatDuration(longestDur)}
              </span>
            )}
          </div>
        </div>

        {/* Task rows */}
        <div className="space-y-1.5">
          {annotated.map((t, i) => {
            const dur = t.durationHours;
            const isLong = dur !== null && dur >= 2;
            const dotColor = isLong ? durationColor(dur!) : (STATUS_COLOR[t.status] || "#9CA3AF");

            return (
              <div
                key={i}
                className="flex items-start gap-2 text-xs pb-1.5 border-b border-gray-50"
                style={isLong ? { backgroundColor: durationColor(dur!) + "0d", borderRadius: 6, padding: "4px" } : {}}
              >
                <span
                  className="mt-0.5 inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium text-gray-800 break-words">
                      {viewType === "task" ? t.task_name : t.subtask_name}
                    </span>
                    {/* Duration badge */}
                    {dur !== null && (
                      <span
                        className="inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                        style={{
                          backgroundColor: durationColor(dur) + "25",
                          color: durationColor(dur),
                        }}
                      >
                        {isLong && <AlertTriangle className="w-2.5 h-2.5" />}
                        {formatDuration(dur)}
                        {isLong && <span className="ml-0.5">· {durationLabel(dur)}</span>}
                      </span>
                    )}
                    {/* Client name badge */}
                    {t.client_name && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 flex-shrink-0">
                        {t.client_name}
                      </span>
                    )}
                  </div>
                  {viewType === "subtask" && (
                    <span className="text-gray-400 text-[10px]">({t.task_name})</span>
                  )}
                  <div className="text-gray-500 text-[10px] mt-0.5 flex flex-wrap gap-x-2">
                    <span>Start: <span className="font-medium">{t.scheduled_time?.slice(0, 5) || "—"}</span></span>
                    {t.started_at && (
                      <span>In-progress: <span className="font-medium">{new Date(t.started_at.replace(" ", "T")).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span></span>
                    )}
                    {t.completed_at && (
                      <span>Done: <span className="font-medium">{t.completed_at.slice(11, 16)}</span></span>
                    )}
                    {t.overdue_at && (
                      <span className="text-red-500">Overdue: <span className="font-medium">{t.overdue_at.slice(11, 16)}</span></span>
                    )}
                    {t.delayed_at && (
                      <span className="text-purple-500">Delayed: <span className="font-medium">{t.delayed_at.slice(11, 16)}</span></span>
                    )}
                    <span style={{ color: STATUS_COLOR[t.status] || "#9CA3AF" }}>
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {annotated.length === 0 && (
            <p className="text-xs text-gray-400">No tasks active at this hour</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Excel export ─────────────────────────────────────────────────────────────
function exportToExcel(chartData: HourData[], selectedDate: string) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Detail (all tasks × hours) ──────────────────────────────────
  const allRows: any[] = [];
  const seen = new Set<string>();

  for (const hourData of chartData) {
    for (const t of hourData.task_list) {
      const key = `${t.task_id}-${t.subtask_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const dur = calcDurationHours(t.scheduled_time, t.completed_at);
      allRows.push({
        "Task ID": t.task_id,
        "Task Name": t.task_name,
        "Subtask ID": t.subtask_id,
        "Subtask Name": t.subtask_name,
        "Client Name": t.client_name || "",
        "Assigned To": t.assigned_to || "",
        "Status": t.status,
        "Scheduled Start": t.scheduled_time?.slice(0, 5) || "",
        "Started At (In-Progress)": formatTs(t.started_at),
        "Completed At": formatTs(t.completed_at),
        "Overdue At": formatTs(t.overdue_at),
        "Delayed At": formatTs(t.delayed_at),
        "Duration (hrs)": dur !== null ? Math.round(dur * 100) / 100 : "",
        "Duration (formatted)": dur !== null ? formatDuration(dur) : "",
        "Duration Category": dur !== null ? durationLabel(dur) : "",
        "Completed By": t.completed_by || "",
        "Delay Reason": t.delay_reason || "",
        "Delay Notes": t.delay_notes || "",
      });
    }
  }

  const detailWs = XLSX.utils.json_to_sheet(allRows);
  // Auto-width columns
  const colWidths = Object.keys(allRows[0] || {}).map((k) => ({
    wch: Math.max(k.length, ...allRows.map((r) => String(r[k] ?? "").length), 10),
  }));
  detailWs["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, detailWs, "Detail");

  // ── Sheet 2: Hourly Summary ───────────────────────────────────────────────
  const summaryRows = chartData.map((h) => {
    const statusCounts: Record<string, number> = {};
    for (const t of h.task_list) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    }
    const maxDur = maxDurationInHour(h);
    return {
      "Hour": h.hour_label,
      "Active Tasks": h.active_tasks,
      "Active Subtasks": h.active_subtasks,
      "Completed": statusCounts["completed"] || 0,
      "In Progress": statusCounts["in_progress"] || 0,
      "Pending": statusCounts["pending"] || 0,
      "Overdue": statusCounts["overdue"] || 0,
      "Delayed": statusCounts["delayed"] || 0,
      "Longest Duration (hrs)": maxDur > 0 ? Math.round(maxDur * 100) / 100 : "",
      "Longest Duration": maxDur > 0 ? formatDuration(maxDur) : "",
      "Duration Category": maxDur >= 2 ? durationLabel(maxDur) : "Normal",
    };
  });

  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  summaryWs["!cols"] = Object.keys(summaryRows[0] || {}).map((k) => ({
    wch: Math.max(k.length, ...summaryRows.map((r) => String(r[k] ?? "").length), 10),
  }));
  XLSX.utils.book_append_sheet(wb, summaryWs, "Hourly Summary");

  // ── Sheet 3: Overall Summary ──────────────────────────────────────────────
  const allTasks = chartData.flatMap((h) => h.task_list);
  const uniqueTasks = Array.from(new Map(allTasks.map((t) => [`${t.task_id}-${t.subtask_id}`, t])).values());

  const statusTotals: Record<string, number> = {};
  for (const t of uniqueTasks) {
    statusTotals[t.status] = (statusTotals[t.status] || 0) + 1;
  }

  const clientTotals: Record<string, { total: number; completed: number; overdue: number; delayed: number }> = {};
  for (const t of uniqueTasks) {
    const cn = t.client_name || "Unknown";
    if (!clientTotals[cn]) clientTotals[cn] = { total: 0, completed: 0, overdue: 0, delayed: 0 };
    clientTotals[cn].total++;
    if (t.status === "completed") clientTotals[cn].completed++;
    if (t.status === "overdue") clientTotals[cn].overdue++;
    if (t.status === "delayed") clientTotals[cn].delayed++;
  }

  const durations = uniqueTasks
    .map((t) => calcDurationHours(t.scheduled_time, t.completed_at))
    .filter((d): d is number => d !== null);
  const avgDur = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const maxDur = durations.length > 0 ? Math.max(...durations) : 0;

  const overallRows = [
    { Metric: "Date", Value: selectedDate },
    { Metric: "Total Unique Subtasks", Value: uniqueTasks.length },
    { Metric: "Total Unique Tasks", Value: new Set(uniqueTasks.map((t) => t.task_id)).size },
    { Metric: "Total Clients", Value: Object.keys(clientTotals).length },
    { Metric: "Completed", Value: statusTotals["completed"] || 0 },
    { Metric: "In Progress", Value: statusTotals["in_progress"] || 0 },
    { Metric: "Pending", Value: statusTotals["pending"] || 0 },
    { Metric: "Overdue", Value: statusTotals["overdue"] || 0 },
    { Metric: "Delayed", Value: statusTotals["delayed"] || 0 },
    { Metric: "Avg Duration (hrs)", Value: avgDur > 0 ? Math.round(avgDur * 100) / 100 : 0 },
    { Metric: "Max Duration (hrs)", Value: maxDur > 0 ? Math.round(maxDur * 100) / 100 : 0 },
    { Metric: "", Value: "" },
    { Metric: "── Client Breakdown ──", Value: "" },
    ...Object.entries(clientTotals).map(([cn, c]) => ({
      Metric: cn,
      Value: `Total: ${c.total} | Completed: ${c.completed} | Overdue: ${c.overdue} | Delayed: ${c.delayed}`,
    })),
  ];

  const overallWs = XLSX.utils.json_to_sheet(overallRows);
  overallWs["!cols"] = [{ wch: 30 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, overallWs, "Overall Summary");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([wbout], { type: "application/octet-stream" }), `finops-hourly-${selectedDate}.xlsx`);
}

// ─── Client bar chart ─────────────────────────────────────────────────────────
function ClientBarChart({ chartData }: { chartData: HourData[] }) {
  const [activeStatus, setActiveStatus] = useState<string | null>(null);

  // Deduplicate tasks across all hours
  const seen = new Set<string>();
  const uniqueTasks: TaskItem[] = [];
  for (const h of chartData) {
    for (const t of h.task_list) {
      const k = `${t.task_id}-${t.subtask_id}`;
      if (!seen.has(k)) { seen.add(k); uniqueTasks.push(t); }
    }
  }

  // Group by client name
  const clientMap: Record<string, Record<string, number>> = {};
  for (const t of uniqueTasks) {
    const cn = t.client_name || "Unknown";
    if (!clientMap[cn]) clientMap[cn] = { completed: 0, in_progress: 0, pending: 0, delayed: 0, overdue: 0 };
    clientMap[cn][t.status] = (clientMap[cn][t.status] || 0) + 1;
  }

  const barData = Object.entries(clientMap)
    .map(([client, counts]) => ({
      client,
      completed:   counts.completed   || 0,
      in_progress: counts.in_progress || 0,
      pending:     counts.pending     || 0,
      delayed:     counts.delayed     || 0,
      overdue:     counts.overdue     || 0,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total);

  if (barData.length === 0) return null;

  const BARS: { key: string; label: string; color: string }[] = [
    { key: "completed",   label: "Completed",   color: "#10B981" },
    { key: "in_progress", label: "In Progress", color: "#3B82F6" },
    { key: "pending",     label: "Pending",     color: "#F59E0B" },
    { key: "delayed",     label: "Delayed",     color: "#8B5CF6" },
    { key: "overdue",     label: "Overdue",     color: "#EF4444" },
  ];

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs min-w-[160px]">
        <p className="font-bold text-gray-900 mb-2 text-sm">{label}</p>
        {payload.map((p: any) => (
          p.value > 0 && (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: p.fill }} />
                <span className="text-gray-600">{p.name}</span>
              </span>
              <span className="font-bold" style={{ color: p.fill }}>{p.value}</span>
            </div>
          )
        ))}
        <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between">
          <span className="text-gray-500">Total</span>
          <span className="font-bold text-gray-900">{total}</span>
        </div>
      </div>
    );
  };

  // Label to shorten long client names on x-axis
  const tickFormatter = (val: string) => val.length > 14 ? val.slice(0, 13) + "…" : val;

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          <h3 className="text-sm font-bold text-gray-800">Client Task Breakdown</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{barData.length} clients</span>
        </div>
        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">Filter:</span>
          <button
            onClick={() => setActiveStatus(null)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${
              activeStatus === null ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >All</button>
          {BARS.map((b) => (
            <button
              key={b.key}
              onClick={() => setActiveStatus(activeStatus === b.key ? null : b.key)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                activeStatus === b.key ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
              style={activeStatus === b.key ? { backgroundColor: b.color, borderColor: b.color } : {}}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={barData.length > 6 ? 260 : 220}>
        <BarChart
          data={barData}
          margin={{ top: 4, right: 16, left: 0, bottom: barData.length > 5 ? 70 : 45 }}
          barCategoryGap="28%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="client"
            tick={{ fontSize: 11, fill: "#6B7280" }}
            tickFormatter={tickFormatter}
            angle={barData.length > 5 ? -40 : 0}
            textAnchor={barData.length > 5 ? "end" : "middle"}
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} allowDecimals={false} />
          <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "#F9FAFB" }} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {BARS.filter((b) => !activeStatus || b.key === activeStatus).map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.label} stackId="a" fill={b.color} radius={b.key === "overdue" ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Client summary pills */}
      <div className="flex flex-wrap gap-2 mt-3">
        {barData.map((d) => {
          const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
          return (
            <div key={d.client} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-800 leading-tight">{d.client}</span>
                <span className="text-[10px] text-gray-400">{d.total} tasks</span>
              </div>
              <div className="flex items-center gap-1 ml-1">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-bold text-green-600">{pct}%</span>
              </div>
              {d.overdue > 0 && (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">{d.overdue} overdue</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main chart component ──────────────────────────────────────────────────────
export default function TaskTimeframeChart() {
  const getTodayIST = () => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(new Date().getTime() + istOffsetMs);
    return `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayIST());
  const [viewType, setViewType] = useState<"task" | "subtask">("subtask");

  const [tooltipData, setTooltipData] = useState<HourData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, flipLeft: false, flipRight: 0 });
  const isOverTooltip = useRef(false);
  const isOverChart = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isOverTooltip.current && !isOverChart.current) {
        setTooltipData(null);
      }
    }, 400);
  }, []);

  const handleChartMouseMove = useCallback((state: any, event: React.MouseEvent) => {
    isOverChart.current = true;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (state?.activePayload?.length) {
      const hourData: HourData = state.activePayload[0].payload;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        const willOverflowRight = cursorX + 16 + 380 > rect.width;
        setTooltipPos({
          x: cursorX,
          y: cursorY,
          flipLeft: willOverflowRight,
          flipRight: rect.width - cursorX + 8,
        });
      }
      setTooltipData(hourData);
    }
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    isOverChart.current = false;
    scheduleHide();
  }, [scheduleHide]);

  const { data, isLoading } = useQuery({
    queryKey: ["task-timeframe-hourly", selectedDate],
    queryFn: async () => {
      try {
        const resp = await apiClient.getTaskTimeframeHourly(selectedDate);
        return resp || { date: selectedDate, data: [] };
      } catch (e) {
        console.error("Failed to fetch task timeframe:", e);
        return { date: selectedDate, data: [] };
      }
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const chartData: HourData[] = data?.data || [];

  const peakCount = Math.max(
    ...chartData.map((d) => (viewType === "task" ? d.active_tasks : d.active_subtasks)),
    0
  );

  const worstDuration = chartData.reduce((max, h) => {
    const d = maxDurationInHour(h);
    return d > max ? d : max;
  }, 0);

  return (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Task based timeframe Hourly
          </CardTitle>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewType("task")}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  viewType === "task" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Task
              </button>
              <button
                onClick={() => setViewType("subtask")}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  viewType === "subtask" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Subtask
              </button>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setSelectedDate(getTodayIST())}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              Today
            </button>
            <button
              onClick={() => exportToExcel(chartData, selectedDate)}
              disabled={chartData.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-1 flex-wrap">
          <p className="text-sm text-gray-500">
            {viewType === "task" ? "Tasks" : "Subtasks"} active at each hour based on scheduled start → actual completion.{" "}
            <span className="font-medium text-blue-600">High line = more tasks still running (late)</span>.
            Hover a point to see details + client.
          </p>
          <div className="flex items-center gap-3 text-[11px] flex-shrink-0">
            {[["#10B981", "< 2h"], ["#F59E0B", "2–5h"], ["#F97316", "5–8h"], ["#EF4444", "≥ 8h"]].map(([color, label]) => (
              <span key={label} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-gray-500">{label}</span>
              </span>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            No data available for {selectedDate}
          </div>
        ) : (
          <>
            <div ref={containerRef} style={{ position: "relative" }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 50, left: 0, bottom: 10 }}
                  onMouseMove={handleChartMouseMove as any}
                  onMouseLeave={handleChartMouseLeave}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis
                    dataKey="hour_label"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val, idx) => {
                      const row = chartData[idx];
                      return row && row.hour % 2 === 0 ? val : "";
                    }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    label={{
                      value: viewType === "task" ? "Tasks" : "Subtasks",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11 },
                    }}
                  />
                  <Legend />
                  {peakCount > 0 && (
                    <ReferenceLine
                      y={peakCount}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{ value: `Peak: ${peakCount}`, position: "right", fontSize: 11, fill: "#EF4444" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={viewType === "task" ? "active_tasks" : "active_subtasks"}
                    name={viewType === "task" ? "Active Tasks" : "Active Subtasks"}
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={<CustomDot />}
                    activeDot={{ r: 7, fill: "#1D4ED8", stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {tooltipData && (
                <TooltipPanel
                  hourData={tooltipData}
                  viewType={viewType}
                  pos={tooltipPos}
                  onMouseEnter={() => {
                    isOverTooltip.current = true;
                    if (hideTimer.current) clearTimeout(hideTimer.current);
                  }}
                  onMouseLeave={() => {
                    isOverTooltip.current = false;
                    scheduleHide();
                  }}
                />
              )}
            </div>

            {/* Summary row */}
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-600 border-t pt-3 items-center">
              <span>
                <span className="font-semibold text-blue-600">{peakCount}</span> peak active{" "}
                {viewType === "task" ? "tasks" : "subtasks"}
              </span>
              <span>
                <span className="font-semibold text-gray-800">
                  {viewType === "task"
                    ? new Set(chartData.flatMap((d) => d.task_list.map((t) => t.task_id))).size
                    : chartData.flatMap((d) => d.task_list.map((t) => t.subtask_id)).filter((v, i, a) => a.indexOf(v) === i).length}
                </span>{" "}
                total {viewType === "task" ? "tasks" : "subtasks"}
              </span>
              {worstDuration >= 2 && (
                <span
                  className="flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: durationColor(worstDuration) + "20",
                    color: durationColor(worstDuration),
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Longest task: {formatDuration(worstDuration)} · {durationLabel(worstDuration)} impact
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {new Set(chartData.flatMap((d) => d.task_list.map((t) => t.client_name).filter(Boolean))).size} clients
              </span>
            </div>

            {/* Client-based breakdown chart */}
            <ClientBarChart chartData={chartData} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
