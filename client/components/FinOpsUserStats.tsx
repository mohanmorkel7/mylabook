import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Building2, CheckCircle } from "lucide-react";
import * as Recharts from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import HourlyTaskStatusTimeline from "@/components/HourlyTaskStatusTimeline";
import TaskTimeframeChart from "@/components/TaskTimeframeChart";

export default function FinOpsUserStats() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");

  const humanPeriod = period === "daily" ? "Today" : period === "weekly" ? "Last 7 days" : "This month";

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

  // Safe getters with fallbacks
  const totalTasks = metrics?.total_tasks ?? metrics?.tasks?.total ?? 0;
  const totalSubtasks = metrics?.total_subtasks ?? metrics?.subtasks?.total ?? 0;
  const completedSubtasks = metrics?.completed_subtasks ?? metrics?.subtasks?.completed ?? 0;
  const activeClients = metrics?.active_clients ?? metrics?.clients?.active ?? 0;

  // Client-wise / User-wise data (optional, show fallback message if not available)
  const clientSummary = metrics?.client_summary ?? metrics?.clients ?? null;
  const userSummary = metrics?.user_summary ?? metrics?.users ?? null;

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

      {/* Task Timeframe Hourly Line Chart */}
      <div className="grid grid-cols-2 gap-6">
        <TaskTimeframeChart />
      </div>
    </div>
  );
}
