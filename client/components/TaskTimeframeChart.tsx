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
import { TrendingUp } from "lucide-react";

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

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        // Flip to left if tooltip would overflow right edge of the container
        ...(pos.flipLeft
          ? { right: pos.flipRight, top: pos.y - 20 }
          : { left: pos.x + 16, top: pos.y - 20 }),
        zIndex: 50,
        pointerEvents: "all",
      }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl p-3"
      onWheel={(e) => e.stopPropagation()}
    >
      <div style={{ width: 320, maxHeight: 300, overflowY: "auto", overflowX: "hidden" }}>
        <p className="font-semibold text-gray-900 mb-2 sticky top-0 bg-white pb-1 border-b border-gray-100">
          {hourData.hour_label} —{" "}
          <span className="text-blue-600">{count}</span> active{" "}
          {viewType === "task" ? "tasks" : "subtasks"}
        </p>
        <div className="space-y-1 mt-1">
          {unique.map((t, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs border-b border-gray-50 pb-1"
            >
              <span
                className="mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLOR[t.status] || "#9CA3AF" }}
              />
              <div className="min-w-0">
                <span className="font-medium text-gray-800">
                  {viewType === "task" ? t.task_name : t.subtask_name}
                </span>
                {viewType === "subtask" && (
                  <span className="text-gray-400 ml-1 text-[10px]">({t.task_name})</span>
                )}
                <div className="text-gray-500 text-[10px] mt-0.5">
                  Start: {t.scheduled_time?.slice(0, 5) || "—"}
                  {t.completed_at && <> · Done: {t.completed_at.slice(11, 16)}</>}
                  {" · "}
                  <span style={{ color: STATUS_COLOR[t.status] || "#9CA3AF" }}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {unique.length === 0 && (
            <p className="text-xs text-gray-400">No tasks active at this hour</p>
          )}
        </div>
      </div>
    </div>
  );
}

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

  const handleChartMouseMove = useCallback(
    (state: any, event: React.MouseEvent) => {
      isOverChart.current = true;
      if (hideTimer.current) clearTimeout(hideTimer.current);

      if (state?.activePayload?.length) {
        const hourData: HourData = state.activePayload[0].payload;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cursorX = event.clientX - rect.left;
          const cursorY = event.clientY - rect.top;
          const tooltipWidth = 340; // panel width + padding
          const willOverflowRight = cursorX + 16 + tooltipWidth > rect.width;
          setTooltipPos({
            x: cursorX,
            y: cursorY,
            flipLeft: willOverflowRight,
            flipRight: rect.width - cursorX + 8,
          });
        }
        setTooltipData(hourData);
      }
    },
    []
  );

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
    ...chartData.map((d) =>
      viewType === "task" ? d.active_tasks : d.active_subtasks
    ),
    0
  );

  return (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Task based timeframe Hourly
          </CardTitle>

          <div className="flex items-center gap-3">
            {/* Task / Subtask toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewType("task")}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  viewType === "task"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Task
              </button>
              <button
                onClick={() => setViewType("subtask")}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  viewType === "subtask"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Subtask
              </button>
            </div>

            {/* Date picker */}
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

        <p className="text-sm text-gray-500 mt-1">
          {viewType === "task" ? "Tasks" : "Subtasks"} active at each hour based on scheduled
          start → actual completion.{" "}
          <span className="font-medium text-blue-600">
            High line = more tasks still running (late)
          </span>
          . Hover a point to see the list — scroll inside the popup to browse.
        </p>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Loading chart…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            No data available for {selectedDate}
          </div>
        ) : (
          <>
            {/* Wrapper with relative positioning so tooltip is positioned inside it */}
            <div ref={containerRef} style={{ position: "relative" }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
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
                  {/* Peak reference line */}
                  {peakCount > 0 && (
                    <ReferenceLine
                      y={peakCount}
                      stroke="#EF4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `Peak: ${peakCount}`,
                        position: "right",
                        fontSize: 11,
                        fill: "#EF4444",
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={viewType === "task" ? "active_tasks" : "active_subtasks"}
                    name={viewType === "task" ? "Active Tasks" : "Active Subtasks"}
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#3B82F6" }}
                    activeDot={{ r: 6, fill: "#1D4ED8", stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Sticky scrollable tooltip panel */}
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
            <div className="mt-4 flex gap-6 text-sm text-gray-600 border-t pt-3">
              <span>
                <span className="font-semibold text-blue-600">{peakCount}</span> peak active{" "}
                {viewType === "task" ? "tasks" : "subtasks"}
              </span>
              <span>
                <span className="font-semibold text-gray-800">
                  {viewType === "task"
                    ? new Set(chartData.flatMap((d) => d.task_list.map((t) => t.task_id))).size
                    : chartData
                        .flatMap((d) => d.task_list.map((t) => t.subtask_id))
                        .filter((v, i, a) => a.indexOf(v) === i).length}
                </span>{" "}
                total {viewType === "task" ? "tasks" : "subtasks"} for {selectedDate}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
