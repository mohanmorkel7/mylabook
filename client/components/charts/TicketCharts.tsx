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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (dateFrom) params.append("date_from", dateFrom);
        if (dateTo) params.append("date_to", dateTo);
        const resp = await api.get(`/tickets/summary?${params.toString()}`);
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
  }, [dateFrom, dateTo]);

  // Simple horizontal bar for a set of items
  const BarList = ({
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
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-36 text-sm text-gray-700 truncate">
              {it[labelKey]}
            </div>
            <div className="flex-1 bg-gray-100 rounded h-4 relative">
              <div
                className="absolute left-0 top-0 h-4 bg-indigo-500 rounded"
                style={{ width: `${(it[valueKey] / max) * 100}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm font-medium text-gray-800">
              {it[valueKey]}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div className="p-4 bg-white shadow rounded">
        <h4 className="text-sm font-semibold mb-3">Assigned To (count)</h4>
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : assigned.length === 0 ? (
          <div className="text-sm text-gray-500">No data</div>
        ) : (
          <BarList items={assigned} labelKey="name" valueKey="count" />
        )}
      </div>
      <div className="p-4 bg-white shadow rounded">
        <h4 className="text-sm font-semibold mb-3">Status (count)</h4>
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : statuses.length === 0 ? (
          <div className="text-sm text-gray-500">No data</div>
        ) : (
          <BarList items={statuses} labelKey="status" valueKey="count" />
        )}
      </div>
    </div>
  );
}
