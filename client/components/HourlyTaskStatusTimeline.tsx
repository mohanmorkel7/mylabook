import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as Recharts from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Clock } from "lucide-react";

interface HourlyTaskStatusTimelineProps {
  period: "daily" | "weekly" | "monthly";
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",    // Amber
  inprogress: "#3B82F6", // Blue
  completed: "#10B981",  // Green
  overdue: "#EF4444",    // Red
  delayed: "#8B5CF6",    // Purple
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  inprogress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
  delayed: "Delayed",
};

export default function HourlyTaskStatusTimeline({
  period,
}: HourlyTaskStatusTimelineProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["finops-hourly-timeline", period],
    queryFn: async () => {
      try {
        const resp = await apiClient.getHourlyTaskStatusTimeline(period);
        return resp || { data: [] };
      } catch (e) {
        console.error("Failed to fetch hourly timeline:", e);
        return { data: [] };
      }
    },
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Task Status Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading timeline data...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Task Status Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600">Failed to load timeline data</div>
        </CardContent>
      </Card>
    );
  }

  const timelineData = data?.data || [];

  if (!timelineData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Task Status Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">
            No task status data available for the selected period.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartHeight = period === "daily" ? 400 : 350;
  const timeLabel = period === "daily" ? "hour" : "timeLabel";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="w-4 h-4" /> Task Status Timeline
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          {period === "daily"
            ? "Hourly breakdown of task statuses"
            : "Daily task status distribution"}
        </p>
      </CardHeader>
      <CardContent>
        <div style={{ height: chartHeight }}>
          <ChartContainer
            id="hourly-timeline"
            config={{
              pending: { color: STATUS_COLORS.pending, label: STATUS_LABELS.pending },
              inprogress: { color: STATUS_COLORS.inprogress, label: STATUS_LABELS.inprogress },
              completed: { color: STATUS_COLORS.completed, label: STATUS_LABELS.completed },
              overdue: { color: STATUS_COLORS.overdue, label: STATUS_LABELS.overdue },
              delayed: { color: STATUS_COLORS.delayed, label: STATUS_LABELS.delayed },
            }}
          >
            <Recharts.BarChart
              data={timelineData}
              margin={{ top: 8, right: 16, left: 0, bottom: period === "daily" ? 40 : 20 }}
            >
              <Recharts.CartesianGrid strokeDasharray="3 3" />
              <Recharts.XAxis
                dataKey={timeLabel}
                type="category"
                tick={{ fontSize: 12 }}
                angle={period === "daily" ? -45 : 0}
                textAnchor={period === "daily" ? "end" : "middle"}
                height={period === "daily" ? 80 : 40}
              />
              <Recharts.YAxis type="number" tick={{ fontSize: 12 }} label={{ value: "Count", angle: -90, position: "insideLeft" }} />
              <Recharts.Tooltip content={<ChartTooltipContent />} />
              <Recharts.Legend
                wrapperStyle={{ paddingTop: "16px" }}
                formatter={(value) => STATUS_LABELS[value] || value}
              />

              {/* Grouped bars for each status */}
              <Recharts.Bar dataKey="pending" fill={STATUS_COLORS.pending} />
              <Recharts.Bar dataKey="inprogress" fill={STATUS_COLORS.inprogress} />
              <Recharts.Bar dataKey="completed" fill={STATUS_COLORS.completed} />
              <Recharts.Bar dataKey="overdue" fill={STATUS_COLORS.overdue} />
              <Recharts.Bar dataKey="delayed" fill={STATUS_COLORS.delayed} />
            </Recharts.BarChart>
          </ChartContainer>
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-5 gap-2">
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const total = timelineData.reduce(
              (sum, item) => sum + (item[key] || 0),
              0,
            );
            return (
              <div
                key={key}
                className="p-3 bg-gray-50 rounded border border-gray-200"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: STATUS_COLORS[key] }}
                  />
                  <span className="text-xs font-medium text-gray-700">
                    {label}
                  </span>
                </div>
                <div className="text-lg font-bold text-gray-900">{total}</div>
              </div>
            );
          })}
        </div>

        {/* Highlight long-running tasks notice */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
          <strong>Note:</strong> Tasks appearing in multiple hours indicate tasks
          that spanned that duration. For example, a task "in progress" at 10:00 AM
          but not completed by 12:00 PM will appear in both hours.
        </div>
      </CardContent>
    </Card>
  );
}
