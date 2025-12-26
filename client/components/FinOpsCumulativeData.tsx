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

  const tasksList = useMemo(() => {
    const rows = Array.isArray(tracker) ? tracker.slice() : [];
    // Sort by run_date desc then task_id asc for stable ordering
    rows.sort((a: any, b: any) => {
      const da = a.run_date ? String(a.run_date) : "";
      const db = b.run_date ? String(b.run_date) : "";
      if (db === da) return (a.task_id || a.id || 0) - (b.task_id || b.id || 0);
      return db.localeCompare(da);
    });
    return rows;
  }, [tracker]);

  const exportAll = () => {
    const rows: any[] = [];
    (tasksList || []).forEach((t: any) => {
      const subt = Array.isArray(t.subtasks) ? t.subtasks : [];
      if (subt.length === 0) {
        rows.push({ run_date: t.run_date || "", task: t.task_name });
      } else {
        subt.forEach((s: any) =>
          rows.push({
            run_date: t.run_date || "",
            task: t.task_name,
            subtask: s.subtask_name || s.name,
            status: s.status,
            start_time: s.scheduled_time || s.start_time || "",
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
    saveAs(new Blob([wbout]), `finops_cumulative_all.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cumulative Data</h3>
        <div className="flex gap-2">
          <Button onClick={exportAll} disabled={isLoading}>
            Export All XLSX
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="space-y-3">
        {(tasksList || []).map((t: any, idx: number) => (
          <Card key={`${t.task_id || t.id}-${t.run_date || idx}`}>
            <CardHeader>
              <div className="flex justify-between items-center w-full">
                <div>
                  <CardTitle>{t.task_name}</CardTitle>
                  <CardDescription>{t.period || ""}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(t.subtasks || []).map((s: any) => (
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
                      {s.completed_at ? ` • Completed: ${s.completed_at}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
