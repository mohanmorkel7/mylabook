import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";

interface AssignedCount {
  user_id: number | null;
  name: string;
  count: number;
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

const CHART_COLORS = [
  "#2563eb",
  "#0f766e",
  "#f59e0b",
  "#ef4444",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#16a34a",
];

const STATUS_ORDER = ["Open", "In Progress", "Pending", "Overdue", "Closed"];

function normalizeClientNames(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [] as string[];
}

function getStatusRank(status?: string) {
  const name = String(status || "Unknown").trim();
  const order = STATUS_ORDER.findIndex(
    (item) => item.toLowerCase() === name.toLowerCase(),
  );
  return order === -1 ? STATUS_ORDER.length + (name.toLowerCase().charCodeAt(0) || 0) : order;
}

export default function TicketCharts({
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
  const [range, setRange] = useState<"all" | "today" | "7days" | "month">(
    "all",
  );

  // Compute date_from/date_to based on selected range (IST day handling)
  const computeRange = () => {
    if (range === "all")
      return {
        df: undefined as string | undefined,
        dt: undefined as string | undefined,
      };
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const yyyy = istNow.getUTCFullYear();
    const mm = String(istNow.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(istNow.getUTCDate()).padStart(2, "0");

    const isoDate = (y: number, m: number, d: number) =>
      `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    if (range === "today") {
      return {
        df: isoDate(yyyy, Number(mm), Number(dd)),
        dt: isoDate(yyyy, Number(mm), Number(dd)),
      };
    }

    if (range === "7days") {
      const past = new Date(istNow.getTime() - 6 * 24 * 3600 * 1000); // include today => last 7 days
      const pY = past.getUTCFullYear();
      const pM = past.getUTCMonth() + 1;
      const pD = past.getUTCDate();
      return {
        df: isoDate(pY, pM, pD),
        dt: isoDate(yyyy, Number(mm), Number(dd)),
      };
    }

    if (range === "month") {
      const start = new Date(Date.UTC(yyyy, istNow.getUTCMonth(), 1));
      const sY = start.getUTCFullYear();
      const sM = start.getUTCMonth() + 1;
      const sD = 1;
      return {
        df: isoDate(sY, sM, sD),
        dt: isoDate(yyyy, Number(mm), Number(dd)),
      };
    }
    return {
      df: undefined as string | undefined,
      dt: undefined as string | undefined,
    };
  };

  const { df: computedFrom, dt: computedTo } = computeRange();

  useEffect(() => {
    let mounted = true;

    // Always fetch from summary API — it covers ALL tickets, not just the current page
    // Local summaries from the 50-ticket page would show wrong counts (e.g. Total: 50 instead of 5251)

    const fetchData = async () => {
      try {
        setLoading(true);
        console.log("TicketCharts: fetchData called with", {
          range,
          dateFrom,
          dateTo,
          computedFrom,
          computedTo,
        });
        const params = new URLSearchParams();
        const useFrom =
          dateFrom && String(dateFrom).trim()
            ? dateFrom
            : range === "all"
              ? undefined
              : computedFrom;
        const useTo =
          dateTo && String(dateTo).trim()
            ? dateTo
            : range === "all"
              ? undefined
              : computedTo;
        if (useFrom) params.append("date_from", useFrom);
        if (useTo) params.append("date_to", useTo);
        const query = params.toString() ? `?${params.toString()}` : "";
        const [summaryResp, userStatusResp, tagResp] = await Promise.allSettled([
          api.get(`/tickets/summary${query}`),
          api.get(`/tickets/summary/user-status${query}`),
          api.get(`/tickets/summary/by-tag${query}`),
        ]);

        if (!mounted) return;

        if (summaryResp.status === "fulfilled") {
          const summaryPayload = (summaryResp.value as any)?.data ?? summaryResp.value;
          setAssigned(summaryPayload.assigned || []);
          setStatuses(summaryPayload.statuses || []);
          if (onSummaryFetched) {
            try {
              onSummaryFetched(summaryPayload);
            } catch (e) {
              console.warn("onSummaryFetched callback failed", e);
            }
          }
        }

        if (userStatusResp.status === "fulfilled") {
          const userStatusPayload = (userStatusResp.value as any)?.data ?? userStatusResp.value;
          const rawData = Array.isArray(userStatusPayload)
            ? userStatusPayload
            : userStatusPayload?.data || [];
          const grouped: Record<
            number,
            { user_id: number; name: string; counts: Record<string, number>; client_names: string[] }
          > = {};
          rawData.forEach((row: any) => {
            const userId = row.user_id || 0;
            if (!grouped[userId]) {
              grouped[userId] = {
                user_id: userId,
                name: row.user_name || "Unknown",
                counts: {},
                client_names: [],
              };
            }
            const statusName = row.status_name || "Unknown";
            grouped[userId].counts[statusName] = row.count || 0;
            const clientNames = normalizeClientNames(row.client_names);
            clientNames.forEach((clientName) => {
              if (!grouped[userId].client_names.includes(clientName)) {
                grouped[userId].client_names.push(clientName);
              }
            });
          });
          if (mounted) setUserStatus(Object.values(grouped));
        }

        const buildTagSummaryFromTickets = (): GroupedStatusCount[] => {
          const grouped: Record<string, Record<string, number>> = {};
          const sourceTickets = Array.isArray(tickets) ? tickets : [];
          for (const ticket of sourceTickets) {
            const tag = classifyTicketTag ? classifyTicketTag(ticket) : "Manual";
            const statusName = ticket?.status?.name || ticket?.status_name || "Unknown";
            if (!grouped[tag]) grouped[tag] = {};
            grouped[tag][statusName] = (grouped[tag][statusName] || 0) + 1;
          }
          return Object.entries(grouped).map(([tag, counts]) => ({
            user_id: tag,
            name: tag,
            counts,
            client_names: [],
          }));
        };

        if (tagResp.status === "fulfilled") {
          const tagPayload = (tagResp.value as any)?.data ?? tagResp.value;
          const tags = Array.isArray(tagPayload) ? tagPayload : tagPayload?.tags || [];
          if (mounted) {
            if (tags.length > 0) {
              setTagStatus(
                tags.map((tagRow: any) => ({
                  user_id: tagRow.tag,
                  name: tagRow.tag,
                  counts: tagRow.counts || {},
                  client_names: normalizeClientNames(tagRow.client_names),
                })),
              );
            } else {
              setTagStatus(buildTagSummaryFromTickets());
            }
          }
        } else if (mounted) {
          setTagStatus(buildTagSummaryFromTickets());
        }
      } catch (e) {
        console.error("TicketCharts: failed to fetch summary", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [dateFrom, dateTo, range]);

  const VerticalBarChart = ({
    items,
    labelKey,
    valueKey,
  }: {
    items: any[];
    labelKey: string;
    valueKey: string;
  }) => {
    const data = [...items]
      .map((item) => ({
        ...item,
        clientNames: normalizeClientNames(item.client_names),
      }))
      .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0));

    const tooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const row = payload[0]?.payload || {};
      const clients = normalizeClientNames(row.clientNames || row.client_names);
      const count = Number(row[valueKey] || payload[0]?.value || 0);

      return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{label || row[labelKey]}</div>
          <div className="mt-1 text-xs text-slate-600">Tickets: {count}</div>
          {clients.length > 0 && (
            <div className="mt-2 max-w-[240px] text-xs text-slate-500">
              <span className="font-medium text-slate-700">Clients:</span> {clients.slice(0, 4).join(", ")}
              {clients.length > 4 ? ` +${clients.length - 4} more` : ""}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis
              dataKey={labelKey}
              type="category"
              width={126}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={tooltip} cursor={{ fill: "rgba(37, 99, 235, 0.08)" }} />
            <Bar dataKey={valueKey} radius={[0, 10, 10, 0]} barSize={20}>
              {data.map((entry, idx) => (
                <Cell key={`${entry[labelKey] || idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const DonutChart = ({
    items,
    labelKey,
    valueKey,
  }: {
    items: any[];
    labelKey: string;
    valueKey: string;
  }) => {
    const data = [...items]
      .map((item) => ({
        ...item,
        clientNames: normalizeClientNames(item.client_names),
      }))
      .sort(
        (a, b) =>
          getStatusRank(a[labelKey]) - getStatusRank(b[labelKey]) ||
          Number(b[valueKey] || 0) - Number(a[valueKey] || 0),
      );

    const total = data.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);

    const tooltip = ({ active, payload }: any) => {
      if (!active || !payload?.length) return null;
      const row = payload[0]?.payload || {};
      const clients = normalizeClientNames(row.clientNames || row.client_names);
      const count = Number(row[valueKey] || 0);
      const percent = total ? Math.round((count / total) * 100) : 0;

      return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{row[labelKey]}</div>
          <div className="mt-1 text-xs text-slate-600">
            {count} tickets • {percent}% of total
          </div>
          {clients.length > 0 && (
            <div className="mt-2 max-w-[240px] text-xs text-slate-500">
              <span className="font-medium text-slate-700">Clients:</span> {clients.slice(0, 4).join(", ")}
              {clients.length > 4 ? ` +${clients.length - 4} more` : ""}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="relative h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={tooltip} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" />
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={labelKey}
              innerRadius={58}
              outerRadius={88}
              paddingAngle={3}
              stroke="rgba(255,255,255,0.9)"
              strokeWidth={2}
            >
              {data.map((entry, idx) => (
                <Cell key={`${entry[labelKey] || idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-white/95 px-4 py-3 text-center shadow-sm ring-1 ring-slate-200">
            <div className="text-2xl font-semibold text-slate-900">{total}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Tickets</div>
          </div>
        </div>
      </div>
    );
  };

  const totalTickets = statuses.reduce((s, r) => s + Number(r.count || 0), 0);
  const totalAssigned = assigned.reduce((s, r) => s + Number(r.count || 0), 0);

  const GroupedBarChart = ({
    users,
    statuses,
  }: {
    users: GroupedStatusCount[];
    statuses: StatusCount[];
  }) => {
    const statusNames = Array.from(
      new Set([
        ...(statuses || []).map((item) => item.status),
        ...users.flatMap((user) => Object.keys(user.counts || {})),
      ]),
    ).sort((a, b) => getStatusRank(a) - getStatusRank(b) || a.localeCompare(b));

    const data = users
      .map((user) => {
        const row: Record<string, any> = {
          name: user.name || `User ${user.user_id}`,
          clientNames: normalizeClientNames(user.client_names),
        };

        let total = 0;
        statusNames.forEach((status) => {
          const value = Number(user.counts?.[status] || 0);
          row[status] = value;
          total += value;
        });
        row.total = total;
        return row;
      })
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

    const tooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const row = payload[0]?.payload || {};
      const clients = normalizeClientNames(row.clientNames || row.client_names);
      const values = statusNames
        .map((status, index) => ({
          status,
          value: Number(row[status] || 0),
          color: CHART_COLORS[index % CHART_COLORS.length],
        }))
        .filter((item) => item.value > 0);

      return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{label || row.name}</div>
          <div className="mt-1 text-xs text-slate-600">Total tickets: {Number(row.total || 0)}</div>
          <div className="mt-2 space-y-1">
            {values.map((item) => (
              <div key={item.status} className="flex items-center justify-between gap-4 text-xs">
                <span className="inline-flex items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
                  {item.status}
                </span>
                <span className="font-medium text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
          {clients.length > 0 && (
            <div className="mt-2 max-w-[260px] text-xs text-slate-500">
              <span className="font-medium text-slate-700">Clients:</span> {clients.slice(0, 4).join(", ")}
              {clients.length > 4 ? ` +${clients.length - 4} more` : ""}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={132}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={tooltip} cursor={{ fill: "rgba(15, 23, 42, 0.06)" }} />
            <Legend verticalAlign="bottom" height={34} iconType="circle" />
            {statusNames.map((status, index) => (
              <Bar
                key={status}
                dataKey={status}
                stackId="tickets"
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                radius={index === statusNames.length - 1 ? [0, 10, 10, 0] : 0}
                barSize={18}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Tickets Overview</h3>
          <div className="text-sm text-gray-600">
            Total:{" "}
            <span className="font-medium text-gray-900">{totalTickets}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Range</label>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="month">This month</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Assigned To Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Assigned To</h4>
              <p className="text-xs text-slate-500">Tickets by assignee, sorted high to low</p>
            </div>
            <div className="text-sm text-slate-600">
              Total: {" "}
              <span className="font-medium text-slate-900">{totalAssigned}</span>
            </div>
          </div>
          <div className="pt-2">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : assigned.length === 0 ? (
              <div className="text-sm text-slate-500">No data</div>
            ) : (
              <VerticalBarChart items={assigned} labelKey="name" valueKey="count" />
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Status</h4>
              <p className="text-xs text-slate-500">Overall ticket mix with client context on hover</p>
            </div>
            <div className="text-sm text-slate-600">
              Total: {" "}
              <span className="font-medium text-slate-900">{totalTickets}</span>
            </div>
          </div>
          <div className="pt-2">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : statuses.length === 0 ? (
              <div className="text-sm text-slate-500">No data</div>
            ) : (
              <DonutChart items={statuses} labelKey="status" valueKey="count" />
            )}
          </div>
        </div>

        {/* By User (Status) Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">By User (Status)</h4>
              <p className="text-xs text-slate-500">Stacked status mix per assignee</p>
            </div>
            <div className="text-sm text-slate-600">
              Users:{" "}
              <span className="font-medium text-slate-900">
                {userStatus.length}
              </span>
            </div>
          </div>
          <div className="pt-2">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : userStatus.length === 0 ? (
              <div className="text-sm text-slate-500">No data</div>
            ) : (
              <GroupedBarChart users={userStatus} statuses={statuses} />
            )}
          </div>
        </div>

        {/* Tag (Status) Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">By Tag (Status)</h4>
              <p className="text-xs text-slate-500">Ticket tags with status breakdown</p>
            </div>
            <div className="text-sm text-slate-600">
              Tags:{" "}
              <span className="font-medium text-slate-900">
                {tagStatus.length}
              </span>
            </div>
          </div>

          <div className="pt-2">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : tagStatus.length === 0 ? (
              <div className="text-sm text-slate-500">No data</div>
            ) : (
              <GroupedBarChart users={tagStatus} statuses={statuses} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
