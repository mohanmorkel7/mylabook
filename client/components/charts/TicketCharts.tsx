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
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        // Use local range unless explicitly set to 'all' (parent date props were defaulting to today)
        const useFrom = range === "all" ? undefined : (dateFrom ?? computedFrom);
        const useTo = range === "all" ? undefined : (dateTo ?? computedTo);
        if (useFrom) params.append("date_from", useFrom);
        if (useTo) params.append("date_to", useTo);
        const query = params.toString() ? `?${params.toString()}` : "";
        const resp = await api.get(`/tickets/summary${query}`);
        const payload = resp?.data ?? resp;
        if (!mounted) return;
        setAssigned(payload.assigned || []);
        setStatuses(payload.statuses || []);
      } catch (e) {
        console.error("TicketCharts: failed to fetch summary", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
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
    return (
      <div className="flex flex-col h-64">
        <div className="flex-1 flex items-end gap-4 px-2">
          {items.map((it, idx) => {
            const val = Number(it[valueKey] || 0);
            const heightPct = (val / max) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div className="text-sm text-gray-700 mb-2">{val}</div>
                <div className="w-full flex items-end">
                  <div
                    className="mx-auto bg-indigo-500 rounded-t transition-all"
                    style={{ width: "60%", height: `${heightPct}%` }}
                  />
                </div>
                <div
                  className="mt-2 text-xs text-center text-gray-600 truncate"
                  style={{ maxWidth: "6rem" }}
                >
                  {it[labelKey]}
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

  return (
    <div className="mb-6">
      <div className="p-4 bg-white shadow rounded">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Assigned To</h4>
              <div className="text-sm text-gray-600">
                Total:{" "}
                <span className="font-medium text-gray-900">
                  {totalAssigned}
                </span>
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : assigned.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <VerticalBarChart
                items={assigned}
                labelKey="name"
                valueKey="count"
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Status</h4>
              <div className="text-sm text-gray-600">
                Total:{" "}
                <span className="font-medium text-gray-900">
                  {totalTickets}
                </span>
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : statuses.length === 0 ? (
              <div className="text-sm text-gray-500">No data</div>
            ) : (
              <VerticalBarChart
                items={statuses}
                labelKey="status"
                valueKey="count"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
