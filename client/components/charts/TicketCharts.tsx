import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignedCount {
  user_id: number | null;
  name: string;
  count: number;
  client_names?: string[];
}

interface StatusCount {
  status: string;
  count: number;
  client_names?: string[];
}

interface GroupedStatusCount {
  user_id: number | string | null;
  name: string;
  counts: Record<string, number>;
  client_names?: string[];
}

type StackedRow = { name: string; total: number; client_names?: string[] } & Record<string, any>;

// ─── Palette ──────────────────────────────────────────────────────────────────

const STATUS_ORDER = ["Open", "In Progress", "Pending", "Overdue", "Closed"];

const STATUS_COLORS: Record<string, string> = {
  Open: "#6366f1",
  "In Progress": "#06b6d4",
  Pending: "#f59e0b",
  Overdue: "#f43f5e",
  Closed: "#10b981",
};

const ASSIGNEE_COLORS = [
  "#6366f1", "#06b6d4", "#f59e0b", "#f43f5e", "#10b981",
  "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#f97316",
];

function statusColor(status: string, idx: number): string {
  return STATUS_COLORS[status] ?? ASSIGNEE_COLORS[idx % ASSIGNEE_COLORS.length];
}

function statusRank(status?: string): number {
  const n = String(status || "").trim();
  const i = STATUS_ORDER.findIndex(s => s.toLowerCase() === n.toLowerCase());
  return i === -1 ? STATUS_ORDER.length : i;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeClientNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(v => v.trim()).filter(Boolean);
  return [];
}

function fmtTooltip({ label, count, pct, clients }: { label: string; count: number; pct?: number; clients?: string[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-1 text-xs text-slate-500">
        {count.toLocaleString()} ticket{count !== 1 ? "s" : ""}
        {pct != null ? <span className="ml-2 font-medium text-slate-700">{pct}%</span> : null}
      </p>
      {clients && clients.length > 0 && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          {clients.slice(0, 3).join(", ")}
          {clients.length > 3 ? ` +${clients.length - 3} more` : ""}
        </p>
      )}
    </div>
  );
}

// ─── Custom X-axis tick with truncation ───────────────────────────────────────

function CustomXTick({ x, y, payload }: any) {
  const name: string = payload?.value ?? "";
  const short = name.length > 13 ? name.slice(0, 12) + "…" : name;
  return (
    <g transform={`translate(${x},${y + 4})`}>
      <text
        x={0}
        y={0}
        dy={4}
        dx={-2}
        textAnchor="end"
        fill="#475569"
        fontSize={10}
        fontFamily="inherit"
        transform="rotate(-38)"
      >
        {short}
      </text>
    </g>
  );
}

// ─── Shared constants ────────────────────────────────────────────────────────

const SLOT_W = 54; // px per bar slot for scrollable charts

// ─── Chart: Assignee — vertical bars, ALL agents, horizontal scroll ────────────

const AssigneeChart = React.memo(function AssigneeChart({
  data,
}: {
  data: { name: string; value: number; client_names?: string[] }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const innerW = Math.max(data.length * SLOT_W, 280);
  return (
    <div style={{ overflowX: "auto", overflowY: "hidden" }}>
      <div style={{ width: innerW, height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 8, left: 0, bottom: 65 }}
            barCategoryGap="35%"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={<CustomXTick />}
              interval={0}
              height={65}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "rgba(99,102,241,0.06)" }}
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload || {};
                const pct = total ? Math.round((row.value / total) * 100) : 0;
                return fmtTooltip({ label: row.name, count: row.value, pct, clients: normalizeClientNames(row.client_names) });
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false} minPointSize={3}>
              {data.map((entry, idx) => (
                <Cell key={`${entry.name}-${idx}`} fill={ASSIGNEE_COLORS[idx % ASSIGNEE_COLORS.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                fill="#64748b"
                fontSize={10}
                formatter={(v: number) => v.toLocaleString()}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// ─── Chart: Status — donut, Closed excluded ──────────────────────────────────

const StatusDonut = React.memo(function StatusDonut({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const RADIAN = Math.PI / 180;

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.04) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="600">
        {`${Math.round(percent * 100)}%`}
      </text>
    );
  };

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="44%"
            innerRadius={62}
            outerRadius={98}
            paddingAngle={3}
            labelLine={false}
            label={renderLabel}
            isAnimationActive={false}
          >
            {data.map((entry, idx) => (
              <Cell key={`${entry.name}-${idx}`} fill={statusColor(entry.name, idx)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload || {};
              const pct = total ? Math.round((row.value / total) * 100) : 0;
              return fmtTooltip({ label: row.name, count: row.value, pct });
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => <span style={{ fontSize: 11, color: "#475569" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});

// ─── Chart: By User — vertical stacked bars, Closed excluded, horizontal scroll ─

const UserStackedScrollChart = React.memo(function UserStackedScrollChart({
  data,
  statusKeys,
}: {
  data: StackedRow[];
  statusKeys: string[]; // Closed already excluded by caller
}) {
  const innerW = Math.max(data.length * SLOT_W, 280);
  return (
    <>
      <div style={{ overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ width: innerW, height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 20, right: 8, left: 0, bottom: 65 }}
              barCategoryGap="35%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={<CustomXTick />}
                interval={0}
                height={65}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                width={28}
              />
              <Tooltip
                cursor={{ fill: "rgba(99,102,241,0.06)" }}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload || {};
                  // filter out placeholder "Unknown Client" — only show real client names
                  const clients = normalizeClientNames(row.client_names)
                    .filter(c => c.toLowerCase() !== "unknown client");
                  return (
                    <div className="rounded-xl border border-slate-100 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
                      <p className="text-sm font-semibold text-slate-800">{row.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {statusKeys.reduce((s, st) => s + Number(row[st] || 0), 0).toLocaleString()} active tickets
                      </p>
                      <div className="mt-2 space-y-1">
                        {statusKeys.map((status, idx) => {
                          const val = Number(row[status] || 0);
                          if (!val) return null;
                          return (
                            <div key={status} className="flex items-center justify-between gap-6 text-xs">
                              <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor(status, idx) }} />
                                {status}
                              </span>
                              <span className="font-semibold text-slate-800">{val.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                      {clients.length > 0 && (
                        <p className="mt-2 text-[11px] text-slate-400">
                          {clients.slice(0, 3).join(", ")}
                          {clients.length > 3 ? ` +${clients.length - 3} more` : ""}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              {statusKeys.map((status, idx) => (
                <Bar
                  key={status}
                  dataKey={status}
                  stackId="s"
                  fill={statusColor(status, idx)}
                  isAnimationActive={false}
                  minPointSize={2}
                  radius={idx === statusKeys.length - 1 ? [6, 6, 0, 0] : 0}
                >
                  {/* Show active total count on top of the last stack segment */}
                  {idx === statusKeys.length - 1 && (
                    <LabelList
                      content={({ x, y, width, index }: any) => {
                        const row = data[index];
                        if (!row) return null;
                        const activeTotal = statusKeys.reduce((s, st) => s + Number(row[st] || 0), 0);
                        if (!activeTotal) return null;
                        return (
                          <text
                            x={Number(x) + Number(width) / 2}
                            y={Number(y) - 4}
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize={9}
                          >
                            {activeTotal.toLocaleString()}
                          </text>
                        );
                      }}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* pinned legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-2">
        {statusKeys.map((status, idx) => (
          <span key={status} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor(status, idx) }} />
            {status}
          </span>
        ))}
      </div>
    </>
  );
});

// ─── Chart: Stacked bar vertical (By Tag) ────────────────────────────────────

const StackedChart = React.memo(function StackedChart({
  data,
  statusKeys,
}: {
  data: StackedRow[];
  statusKeys: string[];
}) {
  const display = data.slice(0, 10);
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={display}
          margin={{ top: 20, right: 8, left: 0, bottom: 65 }}
          barCategoryGap="35%"
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={<CustomXTick />}
            interval={0}
            height={65}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "rgba(6,182,212,0.06)" }}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload || {};
              return (
                <div className="rounded-xl border border-slate-100 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
                  <p className="text-sm font-semibold text-slate-800">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{Number(row.total || 0).toLocaleString()} total</p>
                  <div className="mt-2 space-y-1">
                    {statusKeys.map((status, idx) => {
                      const val = Number(row[status] || 0);
                      if (!val) return null;
                      return (
                        <div key={status} className="flex items-center justify-between gap-6 text-xs">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor(status, idx) }} />
                            {status}
                          </span>
                          <span className="font-semibold text-slate-800">{val.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingTop: 4 }}
            formatter={(value: string) => <span style={{ fontSize: 11, color: "#475569" }}>{value}</span>}
          />
          {statusKeys.map((status, idx) => (
            <Bar
              key={status}
              dataKey={status}
              stackId="s"
              fill={statusColor(status, idx)}
              isAnimationActive={false}
              minPointSize={2}
              radius={idx === statusKeys.length - 1 ? [6, 6, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

// ─── Chart: Scrollable horizontal stacked bars (By User — all users) ──────────

const UserScrollChart = React.memo(function UserScrollChart({
  data,
  statusKeys,
}: {
  data: StackedRow[];
  statusKeys: string[];
}) {
  const ROW_H = 30;
  const chartHeight = data.length * ROW_H + 24; // 24 = top/bottom margin

  return (
    <>
      {/* scrollable chart area */}
      <div style={{ overflowY: "auto", overflowX: "hidden", maxHeight: 252 }}>
        <div style={{ width: "100%", height: Math.max(chartHeight, 100) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={112}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#475569" }}
                tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + "…" : v}
              />
              <Tooltip
                cursor={{ fill: "rgba(99,102,241,0.06)" }}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload || {};
                  const clients = normalizeClientNames(row.client_names);
                  return (
                    <div className="rounded-xl border border-slate-100 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
                      <p className="text-sm font-semibold text-slate-800">{row.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{Number(row.total || 0).toLocaleString()} total tickets</p>
                      <div className="mt-2 space-y-1">
                        {statusKeys.map((status, idx) => {
                          const val = Number(row[status] || 0);
                          if (!val) return null;
                          return (
                            <div key={status} className="flex items-center justify-between gap-6 text-xs">
                              <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor(status, idx) }} />
                                {status}
                              </span>
                              <span className="font-semibold text-slate-800">{val.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                      {clients.length > 0 && (
                        <p className="mt-2 text-[11px] text-slate-400">
                          {clients.slice(0, 3).join(", ")}
                          {clients.length > 3 ? ` +${clients.length - 3} more` : ""}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              {statusKeys.map((status, idx) => (
                <Bar
                  key={status}
                  dataKey={status}
                  stackId="s"
                  fill={statusColor(status, idx)}
                  isAnimationActive={false}
                  barSize={16}
                  minPointSize={2}
                  radius={idx === statusKeys.length - 1 ? [0, 4, 4, 0] : 0}
                >
                  {idx === statusKeys.length - 1 && (
                    <LabelList
                      dataKey="total"
                      position="right"
                      fill="#64748b"
                      fontSize={10}
                      formatter={(v: number) => v > 0 ? v.toLocaleString() : ""}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* legend pinned below scroll area */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-2">
        {statusKeys.map((status, idx) => (
          <span key={status} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor(status, idx) }} />
            {status}
          </span>
        ))}
      </div>
    </>
  );
});

// ─── Skeleton loader ───────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-3 pt-4">
      {[80, 60, 90, 50, 70].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 rounded bg-slate-100" style={{ width: 110 }} />
          <div className="h-5 rounded-lg bg-slate-100" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  badge,
  loading,
  hasData,
  wide,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  loading?: boolean;
  hasData?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex-shrink-0 flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={{ minWidth: 200, flex: wide ? "2 1 0" : "1 1 0" }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
        </div>
        {badge && (
          <span className="mt-0.5 shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
            {badge}
          </span>
        )}
      </div>

      <div className="px-2 pb-4">
        {loading ? (
          <div className="px-3"><ChartSkeleton /></div>
        ) : !hasData ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
            No data available
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function TicketCharts({
  dateFrom,
  dateTo,
  onSummaryFetched,
  tickets,
  classifyTicketTag,
}: {
  dateFrom?: string;
  dateTo?: string;
  onSummaryFetched?: (summary: any) => void;
  tickets?: any[];
  classifyTicketTag?: (ticket: any) => string;
}) {
  const [assigned, setAssigned] = useState<AssignedCount[]>([]);
  const [statuses, setStatuses] = useState<StatusCount[]>([]);
  const [userStatus, setUserStatus] = useState<GroupedStatusCount[]>([]);
  const [tagStatus, setTagStatus] = useState<GroupedStatusCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"all" | "today" | "7days" | "month">("all");

  // IST-aware date range helper
  const computeRange = () => {
    if (range === "all") return { df: undefined as string | undefined, dt: undefined as string | undefined };
    const now = new Date();
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const y = istNow.getUTCFullYear();
    const m = istNow.getUTCMonth() + 1;
    const d = istNow.getUTCDate();
    const fmt = (yy: number, mm: number, dd: number) =>
      `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const today = fmt(y, m, d);
    if (range === "today") return { df: today, dt: today };
    if (range === "7days") {
      const past = new Date(istNow.getTime() - 6 * 24 * 3600 * 1000);
      return { df: fmt(past.getUTCFullYear(), past.getUTCMonth() + 1, past.getUTCDate()), dt: today };
    }
    return { df: fmt(y, m, 1), dt: today };
  };

  const { df: computedFrom, dt: computedTo } = computeRange();

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        const useFrom = (dateFrom && String(dateFrom).trim()) ? dateFrom : (range === "all" ? undefined : computedFrom);
        const useTo = (dateTo && String(dateTo).trim()) ? dateTo : (range === "all" ? undefined : computedTo);
        if (useFrom) params.append("date_from", useFrom);
        if (useTo) params.append("date_to", useTo);
        const q = params.toString() ? `?${params.toString()}` : "";

        const [summaryResp, userStatusResp, tagResp] = await Promise.allSettled([
          api.get(`/tickets/summary${q}`),
          api.get(`/tickets/summary/user-status${q}`),
          api.get(`/tickets/summary/by-tag${q}`),
        ]);

        if (!mounted) return;

        if (summaryResp.status === "fulfilled") {
          const payload = (summaryResp.value as any)?.data ?? summaryResp.value;
          setAssigned(payload.assigned || []);
          setStatuses(payload.statuses || []);
          try { onSummaryFetched?.(payload); } catch {}
        }

        if (userStatusResp.status === "fulfilled") {
          const payload = (userStatusResp.value as any)?.data ?? userStatusResp.value;
          const rawData = Array.isArray(payload) ? payload : payload?.data || [];
          const grouped: Record<number, GroupedStatusCount & { client_names: string[] }> = {};
          rawData.forEach((row: any) => {
            const uid = row.user_id || 0;
            if (!grouped[uid]) {
              grouped[uid] = { user_id: uid, name: row.user_name || "Unknown", counts: {}, client_names: [] };
            }
            grouped[uid].counts[row.status_name || "Unknown"] = Number(row.count || 0);
            normalizeClientNames(row.client_names).forEach(cn => {
              if (!grouped[uid].client_names.includes(cn)) grouped[uid].client_names.push(cn);
            });
          });
          if (mounted) setUserStatus(Object.values(grouped));
        }

        const buildTagFromTickets = (): GroupedStatusCount[] => {
          const grouped: Record<string, Record<string, number>> = {};
          for (const t of Array.isArray(tickets) ? tickets : []) {
            const tag = classifyTicketTag ? classifyTicketTag(t) : "Manual";
            const status = t?.status?.name || t?.status_name || "Unknown";
            if (!grouped[tag]) grouped[tag] = {};
            grouped[tag][status] = (grouped[tag][status] || 0) + 1;
          }
          return Object.entries(grouped).map(([tag, counts]) => ({ user_id: tag, name: tag, counts, client_names: [] }));
        };

        if (tagResp.status === "fulfilled") {
          const payload = (tagResp.value as any)?.data ?? tagResp.value;
          const tags: any[] = Array.isArray(payload) ? payload : payload?.tags || [];
          if (mounted) {
            setTagStatus(
              tags.length > 0
                ? tags.map((r: any) => ({
                    user_id: r.tag, name: r.tag, counts: r.counts || {},
                    client_names: normalizeClientNames(r.client_names),
                  }))
                : buildTagFromTickets(),
            );
          }
        } else if (mounted) {
          setTagStatus(buildTagFromTickets());
        }
      } catch (e) {
        console.error("TicketCharts: fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [dateFrom, dateTo, range]);

  // ── Computed data (memoised, zero-values filtered out) ─────────────────────

  const statusKeys = useMemo(() => {
    const keys = new Set<string>(STATUS_ORDER);
    statuses.forEach(s => { if (s.status) keys.add(s.status); });
    userStatus.forEach(r => Object.keys(r.counts).forEach(k => keys.add(k)));
    tagStatus.forEach(r => Object.keys(r.counts).forEach(k => keys.add(k)));
    return Array.from(keys).sort((a, b) => statusRank(a) - statusRank(b));
  }, [statuses, userStatus, tagStatus]);

  const assignedData = useMemo(
    () => assigned
      .map(a => ({ name: a.name || "Unknown", value: Number(a.count || 0), client_names: a.client_names || [] }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value),
    [assigned],
  );

  const statusData = useMemo(
    () => statuses
      .map(s => ({ name: s.status || "Unknown", value: Number(s.count || 0) }))
      .filter(d => d.value > 0)
      .sort((a, b) => statusRank(a.name) - statusRank(b.name)),
    [statuses],
  );

  const userStackData = useMemo(
    () => userStatus.map(row => {
      const r: StackedRow = { name: row.name || "Unknown", total: 0, client_names: row.client_names || [] };
      statusKeys.forEach(st => { const v = Number(row.counts?.[st] || 0); r[st] = v; r.total += v; });
      return r;
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total),
    [statusKeys, userStatus],
  );

  const tagStackData = useMemo(
    () => tagStatus.map(row => {
      const r: StackedRow = { name: row.name || String(row.user_id || "Unknown"), total: 0, client_names: row.client_names || [] };
      statusKeys.forEach(st => { const v = Number(row.counts?.[st] || 0); r[st] = v; r.total += v; });
      return r;
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total),
    [statusKeys, tagStatus],
  );

  // Only include status keys that actually have non-zero values in user/tag data
  const activeStatusKeys = useMemo(
    () => statusKeys.filter(st =>
      userStackData.some(r => Number(r[st] || 0) > 0) ||
      tagStackData.some(r => Number(r[st] || 0) > 0),
    ),
    [statusKeys, userStackData, tagStackData],
  );

  // Status keys for By User — exclude Closed
  const userStatusKeys = useMemo(
    () => activeStatusKeys.filter(st => st !== "Closed"),
    [activeStatusKeys],
  );

  // Status data for Status chart — exclude Closed
  const activeStatusData = useMemo(
    () => statusData.filter(d => d.name !== "Closed"),
    [statusData],
  );

  const totalTickets = statuses.reduce((s, r) => s + Number(r.count || 0), 0);
  // Active = everything except Closed (for badges)
  const totalActive = statuses
    .filter(s => s.status !== "Closed")
    .reduce((s, r) => s + Number(r.count || 0), 0);
  const totalAssigned = assigned.reduce((s, r) => s + Number(r.count || 0), 0);
  const totalAssignedActive = useMemo(
    () => userStackData.reduce((s, r) => {
      const closed = Number(r["Closed"] || 0);
      return s + Number(r.total || 0) - closed;
    }, 0),
    [userStackData],
  );

  return (
    <div className="mb-8">
      {/* Header row */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Tickets Overview</h3>
          <p className="text-xs text-slate-500">
            {totalActive.toLocaleString()} active tickets · {totalTickets.toLocaleString()} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Range</span>
          <select
            value={range}
            onChange={e => setRange(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="month">This month</option>
          </select>
        </div>
      </div>

      {/* Single scrollable row of cards */}
      <div className="flex gap-3 w-full">
        {/* 1 – Assigned To */}
        <ChartCard
          title="Assigned To"
          subtitle={`${assignedData.length} agents with tickets`}
          badge={totalAssignedActive.toLocaleString() + " active"}
          loading={loading}
          hasData={assignedData.length > 0}
        >
          <AssigneeChart data={assignedData} />
        </ChartCard>

        {/* 2 – Status Distribution */}
        <ChartCard
          title="Status"
          subtitle="Ticket distribution by current status"
          badge={totalActive.toLocaleString() + " active"}
          loading={loading}
          hasData={statusData.length > 0}
        >
          <StatusDonut data={activeStatusData} />
        </ChartCard>

        {/* 3 – By User (Status) — scrollable, all users */}
        <ChartCard
          title="By User"
          subtitle={`${userStackData.length} agents · scroll to see all`}
          badge={`${userStackData.length} users`}
          loading={loading}
          hasData={userStackData.length > 0}
          wide
        >
          <UserStackedScrollChart data={userStackData} statusKeys={userStatusKeys} />
        </ChartCard>

        {/* 4 – By Tag (Status) */}
        <ChartCard
          title="By Tag"
          subtitle="Ticket source tags with status breakdown"
          badge={`${tagStackData.length} tags`}
          loading={loading}
          hasData={tagStackData.length > 0}
        >
          <StackedChart data={tagStackData} statusKeys={activeStatusKeys} />
        </ChartCard>
      </div>
    </div>
  );
}

export default React.memo(TicketCharts);
