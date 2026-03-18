import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";

interface HourlyTimelineData {
  date: string;
  hour: number;
  hour_label: string;
  pending_count: number;
  inprogress_count: number;
  completed_count: number;
  overdue_count: number;
  delayed_count: number;
  total_count: number;
}

export default function HourlyTaskStatusTimeline() {
  const getTodayIST = () => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(new Date().getTime() + istOffsetMs);
    const istYear = istNow.getUTCFullYear();
    const istMonth = String(istNow.getUTCMonth() + 1).padStart(2, "0");
    const istDay = String(istNow.getUTCDate()).padStart(2, "0");
    return `${istYear}-${istMonth}-${istDay}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayIST());

  const { data, isLoading, error } = useQuery({
    queryKey: ["finops-hourly-timeline-stored", selectedDate],
    queryFn: async () => {
      try {
        const resp = await apiClient.getHourlyTimelineStored(selectedDate);
        return resp || { date: selectedDate, data: [] };
      } catch (e) {
        console.error("Failed to fetch hourly timeline:", e);
        return { date: selectedDate, data: [] };
      }
    },
    staleTime: 60_000,
    refetchInterval: 60 * 60 * 1000, // auto-refresh every 1 hour
    refetchOnWindowFocus: true,
  });

  const timelineData: HourlyTimelineData[] = data?.data || [];

  // Grand Total = total tasks for the day (constant across all hours in cumulative snapshot)
  // Take max total_count from non-zero rows since future hours are zeroed out
  const grandTotal = Math.max(...timelineData.map((r) => r.total_count), 0);

  // Summary stats = the LATEST non-zero hour snapshot (current actual status)
  const latestNonZeroRow = [...timelineData]
    .reverse()
    .find((r) => r.total_count > 0);

  const currentSnapshot = latestNonZeroRow ?? {
    pending_count: 0,
    inprogress_count: 0,
    completed_count: 0,
    overdue_count: 0,
    delayed_count: 0,
    total_count: 0,
  };

  const handlePreviousDay = () => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() - 1);
    setSelectedDate(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    );
  };

  const handleNextDay = () => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() + 1);
    setSelectedDate(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    );
  };

  const formatDateDisplay = (dateStr: string) =>
    new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Task Status Timeline - Hourly Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading timeline data...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Task Status Timeline - Hourly Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600">Failed to load timeline data</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" /> Task Status Timeline - Hourly Breakdown
          </CardTitle>
          <span className="text-xs text-gray-400">Auto-updates every hour</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Snapshot of all daily task statuses at each hour of the day
        </p>
      </CardHeader>
      <CardContent>
        {/* Date Navigation */}
        <div className="mb-6 flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <button
            onClick={handlePreviousDay}
            className="p-2 hover:bg-gray-200 rounded transition"
            title="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setSelectedDate(getTodayIST())}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              Today
            </button>
          </div>

          <button
            onClick={handleNextDay}
            className="p-2 hover:bg-gray-200 rounded transition"
            title="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Current Snapshot Summary */}
        <div className="mb-6 grid grid-cols-5 gap-3">
          <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
            <div className="text-xs font-semibold text-gray-600 mb-1">Pending</div>
            <div className="text-2xl font-bold text-amber-600">
              {currentSnapshot.pending_count}
            </div>
          </div>
          <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
            <div className="text-xs font-semibold text-gray-600 mb-1">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">
              {currentSnapshot.inprogress_count}
            </div>
          </div>
          <div className="p-4 rounded-lg border border-green-200 bg-green-50">
            <div className="text-xs font-semibold text-gray-600 mb-1">Completed</div>
            <div className="text-2xl font-bold text-green-600">
              {currentSnapshot.completed_count}
            </div>
          </div>
          <div className="p-4 rounded-lg border border-red-200 bg-red-50">
            <div className="text-xs font-semibold text-gray-600 mb-1">Overdue</div>
            <div className="text-2xl font-bold text-red-600">
              {currentSnapshot.overdue_count}
            </div>
          </div>
          <div className="p-4 rounded-lg border border-purple-200 bg-purple-50">
            <div className="text-xs font-semibold text-gray-600 mb-1">Delayed</div>
            <div className="text-2xl font-bold text-purple-600">
              {currentSnapshot.delayed_count}
            </div>
          </div>
        </div>

        {/* Hourly Breakdown Table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Time</th>
                <th className="text-right py-3 px-4 font-semibold text-amber-600">Pending</th>
                <th className="text-right py-3 px-4 font-semibold text-blue-600">In Progress</th>
                <th className="text-right py-3 px-4 font-semibold text-green-600">Completed</th>
                <th className="text-right py-3 px-4 font-semibold text-red-600">Overdue</th>
                <th className="text-right py-3 px-4 font-semibold text-purple-600">Delayed</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {timelineData.map((item, idx) => {
                const isFuture = item.total_count === 0;
                return (
                  <tr
                    key={idx}
                    className={`border-b transition-colors ${
                      isFuture
                        ? "bg-gray-50 text-gray-400"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className={`py-3 px-4 font-semibold ${isFuture ? "text-gray-400" : "text-gray-900"}`}>
                      {item.hour_label}
                    </td>
                    <td className={`text-right py-3 px-4 font-medium ${isFuture ? "text-gray-400" : "text-amber-600"}`}>
                      {item.pending_count}
                    </td>
                    <td className={`text-right py-3 px-4 font-medium ${isFuture ? "text-gray-400" : "text-blue-600"}`}>
                      {item.inprogress_count}
                    </td>
                    <td className={`text-right py-3 px-4 font-medium ${isFuture ? "text-gray-400" : "text-green-600"}`}>
                      {item.completed_count}
                    </td>
                    <td className={`text-right py-3 px-4 font-medium ${isFuture ? "text-gray-400" : "text-red-600"}`}>
                      {item.overdue_count}
                    </td>
                    <td className={`text-right py-3 px-4 font-medium ${isFuture ? "text-gray-400" : "text-purple-600"}`}>
                      {item.delayed_count}
                    </td>
                    <td className={`text-right py-3 px-4 font-semibold ${isFuture ? "text-gray-400" : "text-gray-900"}`}>
                      {item.total_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Grand Total */}
        <div className="mt-4 p-4 bg-gray-100 rounded-lg border border-gray-200 flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-900">
            Total Daily Tasks — {formatDateDisplay(selectedDate)}
          </span>
          <span className="text-2xl font-bold text-gray-900">{grandTotal}</span>
        </div>
      </CardContent>
    </Card>
  );
}
