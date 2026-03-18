import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface HourlyTimelineData {
  date: string;
  hour_label: string;
  pending_count: number;
  inprogress_count: number;
  completed_count: number;
  overdue_count: number;
  delayed_count: number;
  total_count: number;
}

const STATUS_COLORS = {
  pending: "#F59E0B",    // Amber
  inprogress: "#3B82F6", // Blue
  completed: "#10B981",  // Green
  overdue: "#EF4444",    // Red
  delayed: "#8B5CF6",    // Purple
};

export default function HourlyTaskStatusTimeline() {
  // Get today's date in IST
  const getTodayIST = () => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(new Date().getTime() + istOffsetMs);
    const istYear = istNow.getUTCFullYear();
    const istMonth = String(istNow.getUTCMonth() + 1).padStart(2, "0");
    const istDay = String(istNow.getUTCDate()).padStart(2, "0");
    return `${istYear}-${istMonth}-${istDay}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayIST());
  const [isAggregating, setIsAggregating] = useState(false);
  const queryClient = useQueryClient();

  const handleAggregateData = async () => {
    try {
      setIsAggregating(true);
      console.log(`Aggregating data for ${selectedDate}...`);

      const response = await fetch(
        "http://localhost:8080/api/finops/aggregate-hourly-timeline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate }),
        }
      );

      if (!response.ok) {
        throw new Error(`Aggregation failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Aggregation result:", result);

      // Refresh the query to fetch updated data
      await queryClient.invalidateQueries({
        queryKey: ["finops-hourly-timeline-stored", selectedDate],
      });

      alert(`Data aggregated successfully for ${selectedDate}`);
    } catch (error) {
      console.error("Aggregation error:", error);
      alert(`Failed to aggregate data: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsAggregating(false);
    }
  };

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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const timelineData: HourlyTimelineData[] = data?.data || [];

  // Date navigation helpers
  const handlePreviousDay = () => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const handleNextDay = () => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const handleToday = () => {
    setSelectedDate(getTodayIST());
  };

  // Calculate totals
  const totals = {
    pending: timelineData.reduce((sum, item) => sum + (item.pending_count || 0), 0),
    inprogress: timelineData.reduce((sum, item) => sum + (item.inprogress_count || 0), 0),
    completed: timelineData.reduce((sum, item) => sum + (item.completed_count || 0), 0),
    overdue: timelineData.reduce((sum, item) => sum + (item.overdue_count || 0), 0),
    delayed: timelineData.reduce((sum, item) => sum + (item.delayed_count || 0), 0),
  };

  const grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0);

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

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
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Hourly task status distribution from 12:00 AM to 11:59 PM
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
              onClick={handleToday}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              Today
            </button>
            <button
              onClick={handleAggregateData}
              disabled={isAggregating}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh hourly data from database"
            >
              <RefreshCw className={`w-4 h-4 ${isAggregating ? "animate-spin" : ""}`} />
              {isAggregating ? "Aggregating..." : "Refresh Data"}
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

        {/* Summary Statistics */}
        <div className="mb-6 grid grid-cols-5 gap-3">
          <div className="p-4 bg-gradient-to-br rounded-lg border border-amber-200 bg-amber-50">
            <div className="text-xs font-semibold text-gray-700 mb-1">Pending</div>
            <div className="text-2xl font-bold text-amber-600">{totals.pending}</div>
          </div>
          <div className="p-4 bg-gradient-to-br rounded-lg border border-blue-200 bg-blue-50">
            <div className="text-xs font-semibold text-gray-700 mb-1">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">{totals.inprogress}</div>
          </div>
          <div className="p-4 bg-gradient-to-br rounded-lg border border-green-200 bg-green-50">
            <div className="text-xs font-semibold text-gray-700 mb-1">Completed</div>
            <div className="text-2xl font-bold text-green-600">{totals.completed}</div>
          </div>
          <div className="p-4 bg-gradient-to-br rounded-lg border border-red-200 bg-red-50">
            <div className="text-xs font-semibold text-gray-700 mb-1">Overdue</div>
            <div className="text-2xl font-bold text-red-600">{totals.overdue}</div>
          </div>
          <div className="p-4 bg-gradient-to-br rounded-lg border border-purple-200 bg-purple-50">
            <div className="text-xs font-semibold text-gray-700 mb-1">Delayed</div>
            <div className="text-2xl font-bold text-purple-600">{totals.delayed}</div>
          </div>
        </div>

        {/* Hourly Breakdown Table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-b">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Hour</th>
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
                const hasActivity = item.total_count > 0;
                return (
                  <tr
                    key={idx}
                    className={`border-b transition-colors ${
                      hasActivity ? "hover:bg-gray-50" : "bg-gray-50 opacity-60"
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {item.hour_label}
                    </td>
                    <td className="text-right py-3 px-4 font-medium text-amber-600">
                      {item.pending_count}
                    </td>
                    <td className="text-right py-3 px-4 font-medium text-blue-600">
                      {item.inprogress_count}
                    </td>
                    <td className="text-right py-3 px-4 font-medium text-green-600">
                      {item.completed_count}
                    </td>
                    <td className="text-right py-3 px-4 font-medium text-red-600">
                      {item.overdue_count}
                    </td>
                    <td className="text-right py-3 px-4 font-medium text-purple-600">
                      {item.delayed_count}
                    </td>
                    <td className="text-right py-3 px-4 font-semibold text-gray-900">
                      {item.total_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Grand Total */}
        <div className="mt-4 p-4 bg-gradient-to-r from-gray-100 to-gray-50 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">Grand Total ({formatDateDisplay(selectedDate)})</span>
            <span className="text-2xl font-bold text-gray-900">{grandTotal} tasks</span>
          </div>
        </div>

        {/* Info Note */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <strong>About this view:</strong> Shows the number of tasks created during each hour. Use the date picker above to view data for different dates. Default shows today's data.
        </div>
      </CardContent>
    </Card>
  );
}
