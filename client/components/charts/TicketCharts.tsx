import React, { useEffect, useState } from "react";
import api from "@/lib/api";

interface AssignedCount {
  user_id: number | null;
  name: string;
  count: number;
}

interface StatusCount {
  status: string;
  count: number;
}

export default function TicketCharts({
  dateFrom,
  dateTo,
}: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const [assigned, setAssigned] = useState<AssignedCount[]>([]);
  const [statuses, setStatuses] = useState<StatusCount[]>([]);
  const [userStatus, setUserStatus] = useState<any[]>([]); // [{ user_id, name, counts: { statusName: count } }]
  const [tagStatus, setTagStatus] = useState<any[]>([]); // [{ tag, counts: { statusName: count } }]
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

    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        const useFrom =
          range === "all" ? undefined : (dateFrom ?? computedFrom);
        const useTo = range === "all" ? undefined : (dateTo ?? computedTo);
        if (useFrom) params.append("date_from", useFrom);
        if (useTo) params.append("date_to", useTo);
        const query = params.toString() ? `?${params.toString()}` : "";
        const resp = await api.get(`/tickets/summary${query}`);
        const payload = resp?.data ?? resp;
        if (!mounted) return;
        setAssigned(payload.assigned || []);
        setStatuses(payload.statuses || []);

        // Fetch user-status summary in parallel
        try {
          const resp2 = await api.get(`/tickets/summary/user-status${query}`);
          const p2 = resp2?.data ?? resp2;
          if (mounted) setUserStatus(p2?.users || []);
        } catch (e2) {
          console.warn("TicketCharts: failed to fetch user-status summary", e2);
        }

        // Fetch tag-status summary
        try {
          const resp3 = await api.get(`/tickets/summary/by-tag${query}`);
          const p3 = resp3?.data ?? resp3;
          if (mounted) setTagStatus(p3?.tags || []);
        } catch (e3) {
          console.warn("TicketCharts: failed to fetch tag-status summary", e3);
        }
      } catch (e) {
        console.error("TicketCharts: failed to fetch summary", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Initial fetch
    fetchData();

    return () => {
      mounted = false;
    };
  }, [dateFrom, dateTo, range]);

  // Vertical bar chart component
  const VerticalBarChart = ({
    items,
    labelKey,
    valueKey,
  }: {
    items: any[];
    labelKey: string;
    valueKey: string;
  }) => {
    const max = items.reduce((m, it) => Math.max(m, it[valueKey] || 0), 0) || 1;
    const MAX_PX = 160;
    const MIN_PX = 8;

    // Color palettes for better visual distinction
    const palette = [
      "#3B82F6",
      "#10B981",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
      "#06B6D4",
      "#F472B6",
      "#7C3AED",
    ];

    return (
      <div className="flex flex-col">
        <div className="flex items-end gap-4 px-2" style={{ height: MAX_PX }}>
          {items.map((it, idx) => {
            const val = Number(it[valueKey] || 0);
            const h = Math.max(MIN_PX, Math.round((val / max) * MAX_PX));
            const color = palette[idx % palette.length];
            return (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div className="text-sm text-gray-700 mb-2">{val}</div>
                <div
                  className="w-full flex items-end justify-center"
                  style={{ minHeight: 0 }}
                >
                  <div
                    style={{
                      width: 28,
                      height: h,
                      background: color,
                      borderTopLeftRadius: 6,
                      borderTopRightRadius: 6,
                    }}
                    title={`${it[labelKey]}: ${val}`}
                    className="transition-all"
                  />
                </div>
                <div
                  className="mt-2 text-xs text-center text-gray-700 truncate"
                  style={{ maxWidth: "6rem" }}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        background: color,
                        display: "inline-block",
                        borderRadius: 4,
                      }}
                    />
                    <span
                      style={{
                        maxWidth: 80,
                        display: "inline-block",
                        verticalAlign: "middle",
                      }}
                    >
                      {it[labelKey]}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const totalTickets = statuses.reduce((s, r) => s + Number(r.count || 0), 0);
  const totalAssigned = assigned.reduce((s, r) => s + Number(r.count || 0), 0);

  // Grouped side-by-side vertical bars per user (each user's column contains bars for each status)
  const GroupedBarChart = ({
    users,
    statuses,
  }: {
    users: any[];
    statuses: StatusCount[];
  }) => {
    const MAX_PX = 160;
    const MIN_PX = 10; // visible but not too tall
    // compute union of status names from both statuses list and users' counts
    const derivedFromUsers = Array.from(
      new Set(users.flatMap((u) => (u.counts ? Object.keys(u.counts) : []))),
    );
    const statusNames = Array.from(
      new Set([...(statuses || []).map((s) => s.status), ...derivedFromUsers]),
    );

    // fixed bar width and gap
    const gap = 8;
    const fixedBarWidth = 14; // px per small bar
    const totalColWidth = Math.max(
      56,
      statusNames.length * (fixedBarWidth + gap) + 8,
    );

    const palette = [
      "#3B82F6",
      "#10B981",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
      "#06B6D4",
      "#F472B6",
      "#7C3AED",
    ];

    // stable color map for statuses
    const colorMap: Record<string, string> = {};
    statusNames.forEach((st, i) => {
      colorMap[st] = palette[i % palette.length];
    });

    // global max value across all users/statuses for consistent scaling
    const maxVal = Math.max(
      1,
      ...users.flatMap((u) =>
        statusNames.map((st) => Number((u.counts && u.counts[st]) || 0)),
      ),
    );

    const barWidth = fixedBarWidth;

    return (
      <div className="flex flex-col">
        <div className="flex items-end gap-4 px-2" style={{ height: MAX_PX }}>
          {users.map((u, ui) => {
            const name = u.name || `User ${u.user_id}`;
            // Per-user scaling: ensure every non-zero status gets a minimum visible height
            const userMax = Math.max(
              1,
              ...statusNames.map((st) =>
                Number((u.counts && u.counts[st]) || 0),
              ),
            );
            const nonZeroMinHeight = Math.round(MAX_PX * 0.22); // ~22% of chart height
            const zeroHeight = Math.max(4, Math.round(nonZeroMinHeight * 0.18));

            const bars = statusNames.map((st, idx) => {
              const val = Number((u.counts && u.counts[st]) || 0);
              let h = 0;
              if (val === 0) {
                h = zeroHeight;
              } else {
                const proportion = val / userMax;
                h = Math.max(nonZeroMinHeight, Math.round(proportion * MAX_PX));
              }
              return {
                val,
                h,
                color: colorMap[st] || palette[idx % palette.length],
                status: st,
              };
            });

            return (
              <div key={ui} className="flex-1 flex flex-col items-center">
                <div className="text-sm text-gray-700 mb-2">
                  {statusNames.reduce(
                    (s, st) => s + Number((u.counts && u.counts[st]) || 0),
                    0,
                  )}
                </div>
                <div
                  className="w-full flex items-end justify-center"
                  style={{ minHeight: 0 }}
                >
                  <div
                    style={{ width: totalColWidth }}
                    title={`${name}`}
                    className="overflow-hidden"
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        gap: 6,
                        minWidth: Math.max(
                          120,
                          statusNames.length * (barWidth + gap),
                        ),
                      }}
                    >
                      {bars.map((bar, bi) => (
                        <div
                          key={bi}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              color: "#374151",
                              marginBottom: 4,
                            }}
                          >
                            {bar.val}
                          </div>
                          <div
                            style={{
                              width: barWidth,
                              height: bar.h,
                              background: bar.color,
                              borderTopLeftRadius: 4,
                              borderTopRightRadius: 4,
                              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                              border: "1px solid rgba(0,0,0,0.04)",
                            }}
                            title={`${name} - ${bar.status}: ${bar.val}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  className="mt-2 text-xs text-center text-gray-700 truncate"
                  style={{ maxWidth: "6rem" }}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        background: "#666",
                        display: "inline-block",
                        borderRadius: 4,
                      }}
                    />
                    <span
                      style={{
                        maxWidth: 80,
                        display: "inline-block",
                        verticalAlign: "middle",
                      }}
                    >
                      {name}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {statusNames.map((st, i) => (
            <div key={st} className="text-xs inline-flex items-center gap-2">
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: colorMap[st] || palette[i % palette.length],
                  display: "inline-block",
                  borderRadius: 3,
                }}
              />
              <span className="text-gray-700">{st}</span>
            </div>
          ))}
        </div>
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

      {/* Three cards in a single row */}
      <div className="flex gap-4 items-stretch flex-col md:flex-row">
        {/* Assigned To Card */}
        <div className="bg-white shadow rounded p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Assigned To</h4>
            <div className="text-sm text-gray-600">
              Total:{" "}
              <span className="font-medium text-gray-900">{totalAssigned}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : assigned.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <div className="min-w-[220px]">
                <VerticalBarChart
                  items={assigned}
                  labelKey="name"
                  valueKey="count"
                />
              </div>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-white shadow rounded p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Status</h4>
            <div className="text-sm text-gray-600">
              Total:{" "}
              <span className="font-medium text-gray-900">{totalTickets}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : statuses.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <div className="min-w-[220px]">
                <VerticalBarChart
                  items={statuses}
                  labelKey="status"
                  valueKey="count"
                />
              </div>
            )}
          </div>
        </div>

        {/* By User (Status) Card */}
        <div className="bg-white shadow rounded p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">By User (Status)</h4>
            <div className="text-sm text-gray-600">
              Users:{" "}
              <span className="font-medium text-gray-900">
                {userStatus.length}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : userStatus.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <div className="min-w-[320px]">
                <GroupedBarChart users={userStatus} statuses={statuses} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
