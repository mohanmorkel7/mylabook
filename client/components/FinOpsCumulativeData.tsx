import React, { useMemo, useState } from "react";
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

export default function FinOpsCumulativeData() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const dates = useMemo(() => {
    const set = new Set<string>();
    (tracker || []).forEach((r: any) => {
      if (r.run_date) set.add(r.run_date.toString());
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [tracker]);

  // Counts per date (excluding completed as per request)
  const countsPerDate = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    (tracker || []).forEach((r: any) => {
      const d = r.run_date ? r.run_date.toString() : "unknown";
      if (!map[d])
        map[d] = {
          pending: 0,
          in_progress: 0,
          overdue: 0,
          delayed: 0,
          open: 0,
        };
      const subs = Array.isArray(r.subtasks) ? r.subtasks : [];
      subs.forEach((s: any) => {
        const st = String(s.status || "").toLowerCase();
        if (st === "completed") return; // skip completed
        if (st === "pending") {
          map[d].pending++;
          map[d].open++;
        } else if (st === "in_progress") map[d].in_progress++;
        else if (st === "overdue") map[d].overdue++;
        else if (st === "delayed") map[d].delayed++;
        else map[d].open++;
      });
    });
    return map;
  }, [tracker]);

  const { data: tasksForDate = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["finops-tasks-for-date", selectedDate],
    queryFn: async () => {
      if (!selectedDate) return [];
      try {
        return await apiClient.getFinOpsTasks(selectedDate);
      } catch (e) {
        console.error("Failed to fetch tasks for date", selectedDate, e);
        return [];
      }
    },
    enabled: !!selectedDate,
  });

  const exportTasks = async () => {
    if (!selectedDate) return;
    const rows: any[] = [];
    (tasksForDate || []).forEach((t: any) => {
      const subt = Array.isArray(t.subtasks) ? t.subtasks : [];
      if (subt.length === 0) {
        rows.push({ date: selectedDate, task: t.task_name });
      } else {
        subt.forEach((s: any) =>
          rows.push({
            date: selectedDate,
            task: t.task_name,
            subtask: s.name,
            status: s.status,
            start_time: s.start_time || s.scheduled_time || "",
            started_at: s.started_at || "",
            completed_at: s.completed_at || "",
          }),
        );
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CumulativeData");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), `finops_cumulative_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Dates
          </label>
          <div className="mt-1 flex gap-2 flex-wrap">
            {isLoading ? (
              <div>Loading...</div>
            ) : (
              dates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1 rounded-lg border text-sm ${selectedDate === d ? "bg-blue-600 text-white" : "bg-white text-gray-700 border-gray-200"}`}
                >
                  {d}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={() => {
              setSelectedDate(dates[0] || null);
            }}
          >
            Select Latest
          </Button>
          <Button
            onClick={() => {
              setSelectedDate(null);
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {selectedDate ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {["pending", "in_progress", "overdue", "delayed"].map((k) => (
            <Card key={k} className="p-0">
              <CardHeader>
                <CardTitle className="text-sm capitalize">
                  {k.replace(/_/g, " ")}
                </CardTitle>
                <CardDescription>
                  {(countsPerDate[selectedDate] &&
                    countsPerDate[selectedDate][k]) ||
                    0}
                </CardDescription>
              </CardHeader>
              <CardContent></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-600">
          Select a date to view cumulative counts and tasks
        </div>
      )}

      {selectedDate && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Tasks for {selectedDate}</h3>
            <div className="flex gap-2">
              <Button onClick={exportTasks} disabled={tasksLoading}>
                Export XLSX
              </Button>
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>

          <div className="space-y-2">
            {(tasksForDate || []).map((t: any) => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle>{t.task_name}</CardTitle>
                  <CardDescription>{t.client_name || ""}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(t.subtasks || []).map((s: any) => (
                      <div
                        key={s.id}
                        className="flex justify-between items-center border-b pb-2"
                      >
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-gray-500">
                            Status: {s.status} • Start:{" "}
                            {s.start_time || s.scheduled_time || "-"}
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
      )}
    </div>
  );
}
