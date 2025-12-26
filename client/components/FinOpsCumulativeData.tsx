import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const IST_DATE_STRING = (): string => {
  const ist = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  return ist.toISOString().slice(0, 10);
};

export default function FinOpsCumulativeData() {
  const { data: tracker = [], isLoading } = useQuery({
    queryKey: ["finops-tracker-all"],
    queryFn: async () => {
      try {
        return await apiClient.getFinOpsTracker();
      } catch (e) {
        console.error("Failed to fetch finops tracker:", e);
        return [];
      }
    },
    staleTime: 60_000,
  });

  // Group tracker rows by run_date (exclude today's IST date)
  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    const today = IST_DATE_STRING();
    (tracker || []).forEach((row: any) => {
      const d = row.run_date ? String(row.run_date) : "unknown";
      if (!d) return;
      if (d === today) return; // skip today's date as requested
      if (!map[d]) map[d] = [];
      map[d].push(row);
    });
    // sort dates descending
    const ordered: [string, any[]][] = Object.entries(map).sort((a, b) =>
      b[0].localeCompare(a[0]),
    );
    return ordered; // array of [date, rows]
  }, [tracker]);

  // Counts per date excluding 'completed'
  const countsPerDate = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    byDate.forEach(([date, rows]) => {
      const c = {
        pending: 0,
        in_progress: 0,
        overdue: 0,
        delayed: 0,
        open: 0,
      } as Record<string, number>;
      rows.forEach((t: any) => {
        const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
        subs.forEach((s: any) => {
          const st = String(s.status || "").toLowerCase();
          if (st === "completed") return; // skip completed
          if (st === "pending") {
            c.pending++;
            c.open++;
          } else if (st === "in_progress") c.in_progress++;
          else if (st === "overdue") c.overdue++;
          else if (st === "delayed") c.delayed++;
          else c.open++;
        });
      });
      counts[date] = c;
    });
    return counts;
  }, [byDate]);

  const exportDate = (date: string) => {
    const rows: any[] = [];
    const groups = byDate.find(([d]) => d === date);
    if (!groups) return;
    const rowsForDate = groups[1];
    rowsForDate.forEach((t: any) => {
      const subt = Array.isArray(t.subtasks) ? t.subtasks : [];
      subt.forEach((s: any) => {
        if (String(s.status || "").toLowerCase() === "completed") return; // skip completed
        rows.push({
          run_date: date,
          task: t.task_name,
          subtask: s.subtask_name || s.name,
          status: s.status,
          start_time: s.scheduled_time || s.start_time || "",
          started_at: s.started_at || "",
          completed_at: s.completed_at || "",
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CumulativeData");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), `finops_cumulative_${date}.xlsx`);
  };

  const exportAll = () => {
    const rows: any[] = [];
    byDate.forEach(([date, rowsForDate]) => {
      rowsForDate.forEach((t: any) => {
        const subt = Array.isArray(t.subtasks) ? t.subtasks : [];
        subt.forEach((s: any) => {
          if (String(s.status || "").toLowerCase() === "completed") return;
          rows.push({
            run_date: date,
            task: t.task_name,
            subtask: s.subtask_name || s.name,
            status: s.status,
            start_time: s.scheduled_time || s.start_time || "",
            started_at: s.started_at || "",
            completed_at: s.completed_at || "",
          });
        });
      });
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CumulativeData");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), `finops_cumulative_all.xlsx`);
  };

  if (isLoading) return <div>Loading cumulative data...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Cumulative Data (historical dates)
        </h3>
        <div className="flex gap-2">
          <Button onClick={exportAll} disabled={isLoading}>
            Export All XLSX
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="space-y-8">
        {byDate.length === 0 && (
          <div className="text-sm text-gray-600">
            No historical dates available
          </div>
        )}

        {byDate.map(([date, rows]) => (
          <div key={date} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h4 className="font-semibold">{date}</h4>
                <div className="text-sm text-gray-500">
                  {rows.length} task(s)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => exportDate(date)}>
                  Export {date}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* counts cards */}
              {[
                { key: "pending", label: "Pending" },
                { key: "in_progress", label: "In-Progress" },
                { key: "overdue", label: "Overdue" },
                { key: "delayed", label: "Delayed" },
              ].map((c) => (
                <Card key={c.key} className="p-0">
                  <CardHeader>
                    <CardTitle className="text-sm">{c.label}</CardTitle>
                    <CardDescription className="text-lg font-medium">
                      {(countsPerDate[date] && countsPerDate[date][c.key]) || 0}
                    </CardDescription>
                  </CardHeader>
                  <CardContent />
                </Card>
              ))}
            </div>

            {/* Task list for this date */}
            <div className="space-y-3">
              {rows.map((t: any) => (
                <Card key={`${t.task_id || t.id}-${date}`}>
                  <CardHeader>
                    <div className="flex justify-between items-center w-full">
                      <div>
                        <CardTitle>{t.task_name}</CardTitle>
                        <CardDescription>{t.period || ""}</CardDescription>
                      </div>
                      <div className="text-sm text-gray-500">
                        {t.task_name ? "" : ""}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(t.subtasks || [])
                        .filter(
                          (s: any) =>
                            String(s.status || "").toLowerCase() !==
                            "completed",
                        )
                        .map((s: any) => (
                          <div
                            key={s.subtask_id || s.id}
                            className="flex justify-between items-center border-b pb-2"
                          >
                            <div>
                              <div className="font-medium">
                                {s.subtask_name || s.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                Status: {s.status} • Start:{" "}
                                {s.scheduled_time || s.start_time || "-"}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              {s.started_at ? `Started: ${s.started_at}` : ""}
                              {s.completed_at
                                ? ` • Completed: ${s.completed_at}`
                                : ""}
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
