import React, { useState } from "react";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Building2, CheckCircle } from "lucide-react";

export default function FinOpsUserStats() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");

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
          <p className="text-gray-600 mt-1">FinOps user & client metrics ({period})</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
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
              <div className="space-y-2">
                {Object.entries(clientSummary).map(([client, val]: any) => (
                  <div key={client} className="flex items-center justify-between">
                    <div className="text-sm">{client}</div>
                    <div className="text-sm font-medium">{String(val.total_tasks ?? val.tasks ?? val)}</div>
                  </div>
                ))}
              </div>
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
              <div className="space-y-2">
                {Object.entries(userSummary).map(([user, val]: any) => (
                  <div key={user} className="flex items-center justify-between">
                    <div className="text-sm">{user}</div>
                    <div className="text-sm font-medium">{String(val.total_tasks ?? val.tasks ?? val)}</div>
                  </div>
                ))}
              </div>
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
              <div className="space-y-2">
                {Object.entries(metrics.overdue_by_client).map(([c, v]: any) => (
                  <div key={c} className="flex items-center justify-between">
                    <div className="text-sm">{c}</div>
                    <div className="text-sm font-medium">{v}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No overdue data available for the selected period.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> On-time (by Client)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.ontime_by_client ? (
              <div className="space-y-2">
                {Object.entries(metrics.ontime_by_client).map(([c, v]: any) => (
                  <div key={c} className="flex items-center justify-between">
                    <div className="text-sm">{c}</div>
                    <div className="text-sm font-medium">{v}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No on-time data available for the selected period.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
