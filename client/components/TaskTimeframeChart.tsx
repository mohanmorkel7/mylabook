import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, AlertTriangle } from "lucide-react";

interface TaskItem {
  task_id: number;
  task_name: string;
  subtask_id: number;
  subtask_name: string;
  scheduled_time: string;
  completed_at: string | null;
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

/** Color scale: green → yellow → orange → red based on hours taken */
function durationColor(hours: number): string {
  if (hours >= 8) return "#EF4444"; // red   – severe
  if (hours >= 5) return "#F97316"; // orange – high
  if (hours >= 2) return "#F59E0B"; // amber  – moderate
  return "#10B981";                 // green  – normal
}

function durationLabel(hours: number): string {
  if (hours >= 8) return "Critical";
  if (hours >= 5) return "High";
  if (hours >= 2) return "Moderate";
  return "Normal";
}

/** Get the worst (max) duration in hours among all tasks for a given hour data point */
function maxDurationInHour(hourData: HourData): number {
  let max = 0;
  for (const t of hourData.task_list) {
    const d = calcDurationHours(t.scheduled_time, t.completed_at);
    if (d !== null && d > max) max = d;
  }
  return max;
}

// ─── Custom chart dot: colored by worst task duration in that hour ─────────────
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

  // Annotate with duration and sort worst-first
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
      <div style={{ width: 340, maxHeight: 340, overflowY: "auto", overflowX: "hidden" }}>
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
                style={isLong ? { backgroundColor: durationColor(dur!) + "0d", borderRadius: 6, padding: "4px 4px 4px 4px" } : {}}
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
                  </div>
                  {viewType === "subtask" && (
                    <span className="text-gray-400 text-[10px]">({t.task_name})</span>
                  )}
                  <div className="text-gray-500 text-[10px] mt-0.5">
                    Start: <span className="font-medium">{t.scheduled_time?.slice(0, 5) || "—"}</span>
                    {t.completed_at && (
                      <> · Done: <span className="font-medium">{t.completed_at.slice(11, 16)}</span></>
                    )}
                    {" · "}
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

// ─── Main chart component ──────────────────────────────────────────────────────
export default function TaskTimeframeChart() {
  const getTodayIST = () => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(new Date().getTime() + istOffsetMs);
    return `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayIST());
  const [viewType, setViewType] = useState<"task" | "subtask">("subtask");

  // Sticky tooltip state
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
        const willOverflowRight = cursorX + 16 + 360 > rect.width;
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

  // Find the worst offender across all hours (for summary)
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

          <div className="flex items-center gap-3">
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
          </div>
        </div>

        <div className="flex items-center gap-4 mt-1 flex-wrap">
          <p className="text-sm text-gray-500">
            {viewType === "task" ? "Tasks" : "Subtasks"} active at each hour based on scheduled start → actual completion.{" "}
            <span className="font-medium text-blue-600">High line = more tasks still running (late)</span>.
            Hover a point to see details.
          </p>
          {/* Duration legend */}
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
