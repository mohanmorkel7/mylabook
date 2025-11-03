import React, { useState } from "react";
import * as XLSX from "xlsx";

const TaskUploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const normalizeExcelDate = (value: string | number): string | null => {
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
    } else if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      return date.toISOString().split("T")[0];
    }
    return null;
  };

  const convertTo24Hour = (timeStr: string | undefined | null): string | null => {
    if (!timeStr) return null;
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);

    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:00`;
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select an Excel file first.");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      // ✅ Group tasks
      const taskMap = new Map<string, any>();

      for (const row of rows as any[]) {
        const key = `${row["Client ID"]}_${row["Task Name"]}`;

        if (!taskMap.has(key)) {
          taskMap.set(key, {
            task_name: row["Task Name"],
            description: row["Description"],
            client_id: row["Client ID"],
            client_name: row["Client Name"],
            assigned_to: row["Assigned To"] ? row["Assigned To"].split(",").map((name: string) => name.trim())
              : [],
            reporting_managers: row["Reporting Manager"]
              ? row["Reporting Manager"].split(",").map((name: string) => name.trim())
              : [],
            escalation_managers: row["Escalation Manager"]
              ? row["Escalation Manager"].split(",").map((name: string) => name.trim())
              : [],
            effective_from: normalizeExcelDate(row["Effective From"]),
            duration: row["Duration (days)"],
            is_active: true,
            created_by: row["Created By"],
            subtasks: [],
          });
        }

        const taskObj = taskMap.get(key);
        taskObj.subtasks.push({
          name: row["Subtask Name"],
          description: row["Subtask Description"],
          start_time: convertTo24Hour(row["Subtask Start Time"]),
          sla_hours: row["SLA Hours"] ? Number(row["SLA Hours"]) : null,
          sla_minutes: row["SLA Minutes"] ? Number(row["SLA Minutes"]) : null,
          order_position: Number(row["Order Position"] || taskObj.subtasks.length + 1),
        });
      }

      // ✅ Upload tasks
      setUploading(true);
      for (const task of taskMap.values()) {
        await fetch("/api/finops/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        });
      }
      setUploading(false);
      alert("Excel uploaded successfully!");
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "500px",
        margin: "50px auto",
        backgroundColor: "#f9f9f9",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      <h2 style={{ marginBottom: "20px", color: "#333", textAlign: "center" }}>
        📁 Upload Tasks Excel
      </h2>

      <input
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileChange}
        style={{
          display: "block",
          marginBottom: "20px",
          width: "100%",
          padding: "10px",
          borderRadius: "6px",
          border: "1px solid #ccc",
          backgroundColor: "#fff",
          fontSize: "14px",
        }}
      />

      <button
        onClick={handleUpload}
        disabled={uploading}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: uploading ? "#ccc" : "#0078D4",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "16px",
          cursor: uploading ? "not-allowed" : "pointer",
          transition: "background-color 0.3s ease",
        }}
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
};

export default TaskUploadPage;
