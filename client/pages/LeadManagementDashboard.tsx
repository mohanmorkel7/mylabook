import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Clock,
  AlertCircle,
  TrendingUp,
  MapPin,
  Building2,
  Eye,
  ChevronRight,
  Video,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "@/components/ui/use-toast";

// Types
interface Lead {
  id: number;
  company_name: string;
  industry: string;
  company_size: string;
  country: string;
  city?: string;
  status: "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";
  created_at: string;
  updated_at: string;
}

interface FollowUp {
  id: number;
  lead_id: number;
  follow_up_date: string;
  status: "Pending" | "Completed" | "Cancelled" | "Delayed" | "Overdue";
  notes: string;
  title?: string;
  company_name: string;
  assigned_to_user_id?: number;
}

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  Contacted: "bg-purple-100 text-purple-800",
  Qualified: "bg-yellow-100 text-yellow-800",
  "Proposal Sent": "bg-orange-100 text-orange-800",
  Won: "bg-green-100 text-green-800",
  Lost: "bg-red-100 text-red-800",
};

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444"];
const INDUSTRIES = ["Banking", "Fintech", "Payments", "Insurance", "Retail", "Telecom", "Government", "Other"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];
const FOLLOW_UP_STATUS_COLORS: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800",
  Completed: "bg-green-100 text-green-800",
  Cancelled: "bg-gray-100 text-gray-800",
  Delayed: "bg-orange-100 text-orange-800",
  Overdue: "bg-red-100 text-red-800",
};

// API
async function fetchLeads(params: Record<string, any>) {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== "all") queryParams.append(key, String(value));
  });
  const res = await fetch(`/api/lead-management?${queryParams}`);
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

async function fetchDashboardStats() {
  const res = await fetch("/api/lead-management/dashboard/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

async function deleteLead(id: number) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to delete lead");
  return res.json();
}

async function updateLeadStatus(id: number, status: string) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update lead");
  return res.json();
}

async function fetchFollowUpSummary() {
  const res = await fetch("/api/lead-followups/dashboard/summary");
  if (!res.ok) throw new Error("Failed to fetch follow-up summary");
  return res.json();
}

// Timer component for follow-up cards
function FollowUpTimer({ followUpDate, isOverdue }: { followUpDate: string; isOverdue: boolean }) {
  const [timeDisplay, setTimeDisplay] = useState<string>("");

  useEffect(() => {
    const calculateTime = () => {
      const followUpTime = new Date(followUpDate);
      const now = new Date();

      if (isOverdue) {
        const diffMs = now.getTime() - followUpTime.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeDisplay(`Overdue: ${hours}h ${minutes}m`);
      } else {
        const diffMs = followUpTime.getTime() - now.getTime();
        if (diffMs > 0) {
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          setTimeDisplay(`${hours}h ${minutes}m remaining`);
        } else {
          setTimeDisplay("Due now");
        }
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 60000);

    return () => clearInterval(interval);
  }, [followUpDate, isOverdue]);

  return (
    <span className={`text-xs font-semibold ${isOverdue ? "text-red-600" : "text-blue-600"}`}>
      {timeDisplay}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
        {label || payload[0]?.name || "Metric"}
      </p>
      <div className="mt-1 space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey || entry.name} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-slate-600">{entry.name}</span>
            <span className="font-semibold text-slate-900">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Component
export default function LeadManagementDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // State
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterIndustry, setFilterIndustry] = useState("all");

  // Fetch data
  const { data: statsData } = useQuery({
    queryKey: ["lead-dashboard-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { data: followUpSummary } = useQuery({
    queryKey: ["lead-followup-summary"],
    queryFn: fetchFollowUpSummary,
    staleTime: 0,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["leads", filterStatus, search, filterIndustry],
    queryFn: () =>
      fetchLeads({
        status: filterStatus,
        search,
        industry: filterIndustry,
        limit: 50,
      }),
    staleTime: 5 * 60_000,
  });

  const leads = data?.leads || [];
  const stats = statsData || {};

  const statusFilterOptions = useMemo(() => {
    const apiStatuses = Array.isArray(statsData?.by_status)
      ? statsData.by_status.map((item: any) => item.status).filter(Boolean)
      : [];
    return apiStatuses.length ? Array.from(new Set([...STATUSES, ...apiStatuses])) : STATUSES;
  }, [statsData?.by_status]);

  const industryFilterOptions = useMemo(() => {
    const apiIndustries = Array.isArray(statsData?.by_industry)
      ? statsData.by_industry.map((item: any) => item.industry).filter(Boolean)
      : [];
    return apiIndustries.length ? Array.from(new Set([...INDUSTRIES, ...apiIndustries])) : INDUSTRIES;
  }, [statsData?.by_industry]);

  // Prepare chart data
  const statusChartData = useMemo(() => {
    if (!Array.isArray(stats.by_status)) return [];
    return stats.by_status.map((item: any) => ({
      name: item.status || "Unknown",
      value: Number(item.count) || 0,
    }));
  }, [stats.by_status]);

  const hasStatusChartData = statusChartData.some((item: any) => item.value > 0);

  const industryChartData = useMemo(() => {
    if (!stats.by_industry) return [];
    return stats.by_industry.slice(0, 6).map((item: any) => ({
      name: item.industry,
      count: item.count,
    }));
  }, [stats.by_industry]);

  const topStatus = statusChartData[0]?.name || "No data";
  const topIndustry = industryChartData[0]?.name || "No data";
  const statusTotal = statusChartData.reduce((sum: number, item: any) => sum + (Number(item.value) || 0), 0);
  const industryTotal = industryChartData.reduce((sum: number, item: any) => sum + (Number(item.count) || 0), 0);

  // Calculate summary metrics
  const totalLeads = stats.total_leads || 0;
  const todayFollowups = leads.filter((l: Lead) => {
    const created = new Date(l.created_at);
    const today = new Date();
    return created.toDateString() === today.toDateString();
  }).length;

  const wonLeads = stats.by_status?.find((s: any) => s.status === "Won")?.count || 0;
  const winRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : "0";

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sales Leads</h1>
            <p className="text-gray-600 mt-1">Manage and track your sales pipeline</p>
          </div>
          <Button onClick={() => navigate("/lead-management/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{totalLeads}</div>
              <p className="text-sm text-gray-600 mt-1">Total Leads</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{wonLeads}</div>
              <p className="text-sm text-gray-600 mt-1">Won Deals</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{winRate}%</div>
              <p className="text-sm text-gray-600 mt-1">Win Rate</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">{todayFollowups}</div>
              <p className="text-sm text-gray-600 mt-1">Today's Activities</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-xl shadow-slate-200/50">
        <div className="border-b border-slate-200/70 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-6 py-5 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-300">Live pipeline intelligence</p>
              <h2 className="mt-2 text-2xl font-semibold">Lead analytics</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                A richer snapshot of your pipeline with polished charts, live totals, and visual context.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs text-slate-300">Total leads</p>
                <p className="mt-1 text-2xl font-bold leading-none">{totalLeads}</p>
                <p className="mt-1 text-xs text-slate-400">Across all stages</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs text-slate-300">Win rate</p>
                <p className="mt-1 text-2xl font-bold leading-none">{winRate}%</p>
                <p className="mt-1 text-xs text-slate-400">Conversion trend</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
          <Card className="overflow-hidden border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-sky-50/40 shadow-lg shadow-slate-200/50">
            <CardHeader className="space-y-4 border-b border-slate-100 bg-white/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Leads by Status</CardTitle>
                  <CardDescription className="mt-1 text-sm">
                    Pipeline distribution with a modern doughnut view.
                  </CardDescription>
                </div>
                <Badge className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 hover:bg-sky-50">
                  {hasStatusChartData ? `${statusChartData.length} statuses` : "No data"}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Top status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{topStatus}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total stages</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{statusChartData.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Leads shown</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{statusTotal}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {statusChartData.slice(0, 4).map((item: any, index: number) => (
                  <div
                    key={item.name}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    {item.name}
                  </div>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-4">
              <div className="relative h-[340px] rounded-3xl bg-gradient-to-br from-slate-50 via-white to-sky-50/60 p-3 ring-1 ring-slate-200/60">
                {hasStatusChartData ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={72}
                          outerRadius={112}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {statusChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ paddingTop: 16 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full border border-slate-200 bg-white/90 px-6 py-5 text-center shadow-xl backdrop-blur-md">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Total</p>
                        <p className="mt-1 text-4xl font-bold leading-none text-slate-900">{totalLeads}</p>
                        <p className="mt-2 text-xs text-slate-500">Leads in pipeline</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                    No status data available yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40 shadow-lg shadow-slate-200/50">
            <CardHeader className="space-y-4 border-b border-slate-100 bg-white/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Leads by Industry</CardTitle>
                  <CardDescription className="mt-1 text-sm">
                    A cleaner industry mix with stronger visual hierarchy.
                  </CardDescription>
                </div>
                <Badge className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 hover:bg-indigo-50">
                  {industryChartData.length} sectors
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Top industry</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{topIndustry}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Tracked sectors</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{industryChartData.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Total leads</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{industryTotal}</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              <div className="relative h-[340px] rounded-3xl bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 p-3 ring-1 ring-slate-200/60">
                {industryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={industryChartData} barCategoryGap={18}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 8" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#64748b", fontSize: 12 }}
                        angle={-18}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" fill="#6366f1" radius={[12, 12, 0, 0]} barSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                    No industry data available yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Follow-ups Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Today's Follow-ups */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Today's Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {followUpSummary && followUpSummary.today && followUpSummary.today.length > 0 ? (
                <>
                  <div className="text-2xl font-bold text-blue-600">{followUpSummary.today_count}</div>
                  <div className="space-y-2 mt-3">
                    {followUpSummary.today.map((fu: FollowUp) => (
                      <div
                        key={fu.id}
                        className="p-3 bg-blue-50 rounded border-l-4 border-blue-300 cursor-pointer hover:shadow-sm transition"
                        onClick={() => navigate(`/lead-management/${fu.lead_id}/overview`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{fu.title || "Follow-up"}</p>
                            <p className="text-xs text-gray-600">{fu.company_name}</p>
                            {fu.notes && <p className="text-xs text-gray-500 mt-1">{fu.notes.substring(0, 50)}...</p>}
                          </div>
                          <Badge className={`shrink-0 ${FOLLOW_UP_STATUS_COLORS[fu.status] || "bg-gray-100 text-gray-800"}`}>
                            {fu.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-700 font-medium">
                            {new Date(fu.follow_up_date).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Kolkata',
                            })}
                          </span>
                          <FollowUpTimer followUpDate={fu.follow_up_date} isOverdue={fu.status === "Overdue"} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Follow-ups scheduled for today</p>
                  <div className="text-2xl font-bold text-blue-600">0</div>
                  <p className="text-xs text-gray-400">No follow-ups scheduled for today</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Overdue Follow-ups */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Overdue Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {followUpSummary && followUpSummary.overdue && followUpSummary.overdue.length > 0 ? (
                <>
                  <div className="text-2xl font-bold text-red-600">{followUpSummary.overdue_count}</div>
                  <div className="space-y-2 mt-3">
                    {followUpSummary.overdue.map((fu: FollowUp) => (
                      <div
                        key={fu.id}
                        className="p-3 bg-red-50 rounded border-l-4 border-red-300 cursor-pointer hover:shadow-sm transition"
                        onClick={() => navigate(`/lead-management/${fu.lead_id}/overview`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{fu.title || "Follow-up"}</p>
                            <p className="text-xs text-gray-600">{fu.company_name}</p>
                            {fu.notes && <p className="text-xs text-gray-500 mt-1">{fu.notes.substring(0, 50)}...</p>}
                          </div>
                          <Badge className={`shrink-0 ${FOLLOW_UP_STATUS_COLORS[fu.status] || "bg-gray-100 text-gray-800"}`}>
                            {fu.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-700 font-medium">
                            {new Date(fu.follow_up_date).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Kolkata',
                            })}
                          </span>
                          <FollowUpTimer followUpDate={fu.follow_up_date} isOverdue={fu.status === "Overdue"} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Follow-ups overdue for action</p>
                  <div className="text-2xl font-bold text-red-600">0</div>
                  <p className="text-xs text-gray-400">No overdue follow-ups</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusFilterOptions.map((st) => (
              <SelectItem key={st} value={st}>
                {st}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterIndustry} onValueChange={setFilterIndustry}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            {industryFilterOptions.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {ind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Leads List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading leads...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No leads found</div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead: Lead) => (
            <Card
              key={lead.id}
              className="p-5 hover:shadow-lg transition cursor-pointer border-l-4 border-l-gray-200 hover:border-l-blue-500"
              onClick={() => navigate(`/lead-management/${lead.id}/overview`)}
            >
              <div className="flex items-start justify-between">
                {/* Main Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-semibold text-lg">{lead.company_name}</h3>
                    <Badge className={`${STATUS_COLORS[lead.status]} font-semibold`}>
                      {lead.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Industry</p>
                      <p className="text-sm font-medium">{lead.industry}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Size</p>
                      <p className="text-sm font-medium">{lead.company_size}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Location</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {lead.city || lead.country}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Added</p>
                      <p className="text-sm font-medium">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">ID: {lead.id}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/lead-management/${lead.id}/overview`);
                    }}
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/lead-management/${lead.id}/edit`);
                    }}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-100 text-blue-700 hover:bg-blue-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/demo-workshop/new?lead_id=${lead.id}`);
                    }}
                    title="Create Demo"
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this lead?")) {
                        deleteLead(lead.id).then(() => {
                          qc.invalidateQueries({ queryKey: ["leads"] });
                          toast({ title: "Lead deleted" });
                        });
                      }
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
