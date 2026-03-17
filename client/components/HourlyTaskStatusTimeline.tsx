import { useState } from "react";
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

  // Render different layouts for daily vs weekly/monthly
  if (period === "daily") {
    return <DailyTimeline data={timelineData} />;
  }

  return <WeeklyMonthlyTimeline data={timelineData} />;
}

function DailyTimeline({ data }: { data: any[] }) {
  const [expandedHour, setExpandedHour] = useState<number | null>(null);

  // Calculate summary statistics
  const summary = {
    pending: data.reduce((sum, item) => sum + (item.pending || 0), 0),
    inprogress: data.reduce((sum, item) => sum + (item.inprogress || 0), 0),
    completed: data.reduce((sum, item) => sum + (item.completed || 0), 0),
    overdue: data.reduce((sum, item) => sum + (item.overdue || 0), 0),
    delayed: data.reduce((sum, item) => sum + (item.delayed || 0), 0),
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" /> Task Status Timeline - Hourly Breakdown
          </CardTitle>
          <p className="text-sm text-gray-500 mt-2">
            Detailed hourly breakdown of task statuses from 12:00 AM to 11:59 PM
          </p>
        </CardHeader>
        <CardContent>
          {/* Hourly bar chart */}
          <div style={{ height: 500, overflowX: "auto" }} className="mb-6">
            <ChartContainer
              id="hourly-timeline-daily"
              config={{
                pending: { color: STATUS_COLORS.pending, label: STATUS_LABELS.pending },
                inprogress: { color: STATUS_COLORS.inprogress, label: STATUS_LABELS.inprogress },
                completed: { color: STATUS_COLORS.completed, label: STATUS_LABELS.completed },
                overdue: { color: STATUS_COLORS.overdue, label: STATUS_LABELS.overdue },
                delayed: { color: STATUS_COLORS.delayed, label: STATUS_LABELS.delayed },
              }}
            >
              <Recharts.ResponsiveContainer width="100%" height={450}>
                <Recharts.BarChart
                  data={data}
                  margin={{ top: 8, right: 16, left: 0, bottom: 80 }}
                >
                  <Recharts.CartesianGrid strokeDasharray="3 3" />
                  <Recharts.XAxis
                    dataKey="hour"
                    type="category"
                    tick={{ fontSize: 11, angle: -45, textAnchor: "end" }}
                    height={100}
                    interval={0}
                  />
                  <Recharts.YAxis 
                    type="number" 
                    tick={{ fontSize: 12 }} 
                    label={{ value: "Task Count", angle: -90, position: "insideLeft" }} 
                  />
                  <Recharts.Tooltip 
                    content={<ChartTooltipContent />}
                    contentStyle={{ fontSize: "12px" }}
                    formatter={(value) => String(value)}
                    labelFormatter={(label) => `${label}`}
                  />
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
              </Recharts.ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Summary statistics cards */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div
                key={key}
                className="p-4 bg-gradient-to-br rounded-lg border"
                style={{
                  borderColor: STATUS_COLORS[key],
                  backgroundColor: `${STATUS_COLORS[key]}15`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[key] }}
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    {label}
                  </span>
                </div>
                <div className="text-2xl font-bold" style={{ color: STATUS_COLORS[key] }}>
                  {summary[key as keyof typeof summary] || 0}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed hourly table */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-b">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Hour</th>
                  <th className="text-right py-3 px-4 font-semibold" style={{ color: STATUS_COLORS.pending }}>
                    Pending
                  </th>
                  <th className="text-right py-3 px-4 font-semibold" style={{ color: STATUS_COLORS.inprogress }}>
                    In Progress
                  </th>
                  <th className="text-right py-3 px-4 font-semibold" style={{ color: STATUS_COLORS.completed }}>
                    Completed
                  </th>
                  <th className="text-right py-3 px-4 font-semibold" style={{ color: STATUS_COLORS.overdue }}>
                    Overdue
                  </th>
                  <th className="text-right py-3 px-4 font-semibold" style={{ color: STATUS_COLORS.delayed }}>
                    Delayed
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => {
                  const total = (item.pending || 0) + (item.inprogress || 0) + (item.completed || 0) + (item.overdue || 0) + (item.delayed || 0);
                  const hasActivity = total > 0;
                  return (
                    <tr
                      key={idx}
                      className={`border-b transition-colors ${
                        hasActivity ? "hover:bg-gray-50" : "bg-gray-50 opacity-60"
                      } ${expandedHour === idx ? "bg-blue-50" : ""}`}
                      onClick={() => setExpandedHour(expandedHour === idx ? null : idx)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="py-3 px-4 font-semibold text-gray-900">{item.hour}</td>
                      <td className="text-right py-3 px-4 font-medium" style={{ color: STATUS_COLORS.pending }}>
                        {item.pending || 0}
                      </td>
                      <td className="text-right py-3 px-4 font-medium" style={{ color: STATUS_COLORS.inprogress }}>
                        {item.inprogress || 0}
                      </td>
                      <td className="text-right py-3 px-4 font-medium" style={{ color: STATUS_COLORS.completed }}>
                        {item.completed || 0}
                      </td>
                      <td className="text-right py-3 px-4 font-medium" style={{ color: STATUS_COLORS.overdue }}>
                        {item.overdue || 0}
                      </td>
                      <td className="text-right py-3 px-4 font-medium" style={{ color: STATUS_COLORS.delayed }}>
                        {item.delayed || 0}
                      </td>
                      <td className="text-right py-3 px-4 font-semibold text-gray-900">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Information note */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <strong>About this view:</strong> This chart displays all 24 hours from 12:00 AM to 11:59 PM. Tasks appearing in multiple hours indicate that they spanned multiple hours. For example, a task "in progress" at 10:00 AM but not completed by 12:00 PM will appear in both hours.
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function WeeklyMonthlyTimeline({ data }: { data: any[] }) {
  const summary = {
    pending: data.reduce((sum, item) => sum + (item.pending || 0), 0),
    inprogress: data.reduce((sum, item) => sum + (item.inprogress || 0), 0),
    completed: data.reduce((sum, item) => sum + (item.completed || 0), 0),
    overdue: data.reduce((sum, item) => sum + (item.overdue || 0), 0),
    delayed: data.reduce((sum, item) => sum + (item.delayed || 0), 0),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="w-4 h-4" /> Task Status Timeline
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">Daily task status distribution</p>
      </CardHeader>
      <CardContent>
        <div style={{ height: 350 }}>
          <ChartContainer
            id="timeline-weekly-monthly"
            config={{
              pending: { color: STATUS_COLORS.pending, label: STATUS_LABELS.pending },
              inprogress: { color: STATUS_COLORS.inprogress, label: STATUS_LABELS.inprogress },
              completed: { color: STATUS_COLORS.completed, label: STATUS_LABELS.completed },
              overdue: { color: STATUS_COLORS.overdue, label: STATUS_LABELS.overdue },
              delayed: { color: STATUS_COLORS.delayed, label: STATUS_LABELS.delayed },
            }}
          >
            <Recharts.ResponsiveContainer width="100%" height={300}>
              <Recharts.BarChart
                data={data}
                margin={{ top: 8, right: 16, left: 0, bottom: 20 }}
              >
                <Recharts.CartesianGrid strokeDasharray="3 3" />
                <Recharts.XAxis
                  dataKey="timeLabel"
                  type="category"
                  tick={{ fontSize: 12 }}
                  height={40}
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
            </Recharts.ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-5 gap-2">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
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
              <div className="text-lg font-bold text-gray-900">{summary[key as keyof typeof summary] || 0}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
