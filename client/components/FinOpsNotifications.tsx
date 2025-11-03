import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  User,
  Calendar,
  MessageSquare,
  Filter,
  RefreshCw,
  ExternalLink,
  Trash2,
  UserX,
  Shield,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  formatToISTDateTime,
  getRelativeTimeIST,
  convertToIST,
} from "@/lib/dateUtils";

interface FinOpsNotification {
  id: string;
  type:
    | "pre_start_alert"
    | "sla_warning"
    | "escalation_alert"
    | "task_completed"
    | "task_overdue"
    | "overdue_reason_required"
    | "daily_reminder"
    | "task_pending"
    | "task_delayed";
  title: string;
  message: string;
  task_name: string;
  client_name?: string;
  subtask_name?: string;
  assigned_to: string; // Summary string for list
  assigned_users?: string[]; // Parsed list from DB
  reporting_managers: string[];
  escalation_managers?: string[];
  priority: "low" | "medium" | "high" | "critical";
  status: "unread" | "read" | "archived";
  created_at: string;
  action_required: boolean;
  delay_reason?: string;
  sla_remaining?: string;
  overdue_minutes?: number;
  members_list?: string[];
  scheduled_time_ist?: string;
  time_diff_minutes?: number;
}

// Mock notifications data
// Transform database notifications to match our interface
const transformDbNotifications = (
  dbNotifications: any[],
  currentTime?: Date,
): FinOpsNotification[] => {
  console.log("🔄 Transform input:", dbNotifications.slice(0, 2)); // Log first 2 items for debugging

  // Filter out completed and overdue tasks from notifications (these go to activity log only)
  const activeNotifications = dbNotifications.filter((dbNotif) => {
    // Don't show completed tasks in notifications tab
    if (dbNotif.action === "task_completed") return false;

    // Don't show overdue tasks in notifications tab (they go to activity log)
    if (dbNotif.action === "task_overdue") return false;

    // Don't show daily reset notifications in notifications tab
    if (dbNotif.action === "daily_reset") return false;

    // Always show overdue reason required notifications (high priority)
    if (dbNotif.action === "overdue_reason_required") return true;

    return true;
  });

  const parseManagers = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val))
      return val
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
    if (typeof val === "string") {
      let s = val.trim();
      if (s.startsWith("{") && s.endsWith("}")) {
        s = s.slice(1, -1);
        return s
          .split(",")
          .map((x) => x.trim())
          .map((x) => x.replace(/^\"|\"$/g, ""))
          .filter(Boolean);
      }
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed))
          return parsed
            .map(String)
            .map((x) => x.trim())
            .filter(Boolean);
      } catch {}
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed)
        ? parsed
            .map(String)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
    } catch {
      return [];
    }
  };

  return activeNotifications.map((dbNotif, index) => {
    // Initialize all variables at the beginning to avoid reference errors
    let realTimeDetails = dbNotif.details;
    let realTimeTitle = dbNotif.details;
    let realTimeSlaRemaining = undefined;
    let isExpiredSLA = false;
    let overdueMinutesFromSLA = 0;

    // Extract timing information from details
    const overdueMatch =
      dbNotif.details?.match(/overdue by (\d+) min/i) ||
      dbNotif.details?.match(/overdue by (\d+) minutes?/i) ||
      dbNotif.details?.match(/(\d+) minutes late/i);
    let overdueMinutes = overdueMatch ? parseInt(overdueMatch[1]) : undefined;

    // Extract IST time information
    const istTimeMatch = dbNotif.details?.match(
      /(\d{1,2}:\d{2}(?::\d{2})?) IST/i,
    );
    const istTime = istTimeMatch ? istTimeMatch[1] : undefined;

    // Extract time remaining information
    const timeRemainingMatch = dbNotif.details?.match(
      /starts in (\d+) minutes?/i,
    );
    const timeRemaining = timeRemainingMatch
      ? parseInt(timeRemainingMatch[1])
      : undefined;

    // For existing overdue notifications, calculate current overdue time
    if (
      overdueMinutes &&
      currentTime &&
      dbNotif.created_at &&
      dbNotif.action === "overdue_notification_sent"
    ) {
      const notificationTime = new Date(dbNotif.created_at);
      const timeSinceNotificationMs =
        currentTime.getTime() - notificationTime.getTime();
      const minutesSinceNotification = Math.floor(
        timeSinceNotificationMs / 60000,
      );

      // Current overdue minutes = original overdue + time passed since notification
      const currentOverdueMinutes = overdueMinutes + minutesSinceNotification;
      const totalTimeAgo = Math.floor(timeSinceNotificationMs / 60000) + 2; // Add base overdue time

      // Update details with current overdue time
      realTimeDetails = dbNotif.details.replace(
        /overdue by (\d+) min • (\d+) min ago/i,
        `Overdue by ${currentOverdueMinutes} min • ${totalTimeAgo} min ago`,
      );
      realTimeTitle = `SLA Overdue - ${currentOverdueMinutes} min overdue`;

      overdueMinutes = currentOverdueMinutes;

      console.log(
        `🚨 Real-time overdue calculation: Originally ${overdueMatch[1]} min → Now ${currentOverdueMinutes} min overdue (${minutesSinceNotification} min since notification)`,
      );
    }

    // Extract start time if present
    const startTimeMatch = dbNotif.details?.match(/Start: (\d+:\d+ [AP]M)/i);
    const startTime = startTimeMatch ? startTimeMatch[1] : undefined;

    // Calculate real-time remaining minutes for SLA warnings with improved precision

    if (
      currentTime &&
      dbNotif.details?.includes("SLA Warning - ") &&
      dbNotif.details?.includes("min remaining")
    ) {
      const originalMinMatch = dbNotif.details.match(/(\d+) min remaining/);
      if (originalMinMatch && dbNotif.created_at) {
        const originalMinutes = parseInt(originalMinMatch[1]);
        const notificationTime = new Date(dbNotif.created_at);

        // More precise calculation with seconds consideration
        const timeDiffMs = currentTime.getTime() - notificationTime.getTime();
        const minutesPassed = Math.floor(timeDiffMs / 60000);
        const secondsPassed = Math.floor((timeDiffMs % 60000) / 1000);

        // Calculate current remaining minutes with better rounding
        const exactRemainingMinutes = originalMinutes - timeDiffMs / 60000;
        const currentRemainingMinutes = Math.max(
          0,
          Math.ceil(exactRemainingMinutes),
        );

        // Check if SLA has expired
        if (exactRemainingMinutes <= 0) {
          isExpiredSLA = true;
          overdueMinutesFromSLA = Math.floor(Math.abs(exactRemainingMinutes));

          // Convert to overdue notification
          realTimeDetails = `Overdue by ${overdueMinutesFromSLA} min • ${Math.floor(timeDiffMs / 60000)} min ago`;
          realTimeTitle = `SLA Overdue - ${overdueMinutesFromSLA} min overdue`;
          realTimeSlaRemaining = `Overdue by ${overdueMinutesFromSLA} min`;

          console.log(
            `🚨 SLA EXPIRED: ${originalMinutes} min → OVERDUE by ${overdueMinutesFromSLA} min (${minutesPassed}:${secondsPassed.toString().padStart(2, "0")} elapsed)`,
          );
        } else {
          // Still within SLA - preserve any text after "min remaining" like "• need to start"
          realTimeDetails = dbNotif.details.replace(
            /(\d+) min remaining(.*)$/,
            `${currentRemainingMinutes} min remaining$2`,
          );
          realTimeTitle = realTimeDetails;
          realTimeSlaRemaining = `${currentRemainingMinutes} min remaining`;

          console.log(
            `🕒 Real-time SLA calculation (precise): ${originalMinutes} min → ${currentRemainingMinutes} min (${minutesPassed}:${secondsPassed.toString().padStart(2, "0")} elapsed, exact: ${exactRemainingMinutes.toFixed(2)})`,
          );
        }
      }
    }

    // Use API-provided type if available, otherwise determine from action types
    let notificationType = dbNotif.type || "task_pending"; // Respect API type first

    console.log("🔍 Type determination:", {
      apiType: dbNotif.type,
      computedType: notificationType,
      action: dbNotif.action,
    });

    // Only override if API didn't provide type or for special real-time cases
    if (!dbNotif.type) {
      if (dbNotif.action === "overdue_reason_required") {
        notificationType = "overdue_reason_required";
      } else if (isExpiredSLA) {
        // SLA warning has expired, convert to overdue
        notificationType = "escalation_alert";
      } else if (dbNotif.action === "pre_start_notification") {
        notificationType = "pre_start_alert";
      } else if (
        dbNotif.action === "sla_alert" ||
        dbNotif.action === "sla_warning" ||
        dbNotif.details?.includes("SLA Warning") ||
        dbNotif.details?.includes("min remaining") ||
        dbNotif.details?.includes("minutes late")
      ) {
        notificationType = "sla_warning";
      } else if (
        dbNotif.action === "escalation_notification" ||
        dbNotif.details?.includes("ESCALATION") ||
        dbNotif.details?.includes("Immediate action required")
      ) {
        notificationType = "escalation_alert";
      } else if (
        dbNotif.action === "overdue_notification_sent" ||
        dbNotif.details?.toLowerCase().includes("overdue")
      ) {
        notificationType = "sla_warning";
      } else if (
        (dbNotif.details?.toLowerCase().includes("pending") &&
          dbNotif.details?.toLowerCase().includes("need to start")) ||
        dbNotif.details?.toLowerCase().includes("pending status")
      ) {
        notificationType = "task_pending";
      } else if (dbNotif.action === "task_completed") {
        notificationType = "task_completed";
      } else if (dbNotif.action === "task_overdue") {
        notificationType = "task_overdue";
      } else if (dbNotif.details?.includes("starts in")) {
        notificationType = "pre_start_alert";
      }
    } else if (isExpiredSLA) {
      // Override API type only for real-time SLA expiry
      notificationType = "escalation_alert";
    }

    // Mock member data based on task type
    const getMembersForTask = (taskId: number, type: string) => {
      const taskMembers = {
        1: {
          // CLEARING - FILE TRANSFER AND VALIDATION
          assigned_to: "John Durairaj",
          reporting_managers: ["Albert Kumar", "Hari Prasad"],
          escalation_managers: ["Sarah Wilson", "Mike Johnson"],
          members_list: [
            "John Durairaj",
            "Albert Kumar",
            "Hari Prasad",
            "Sarah Wilson",
            "Mike Johnson",
          ],
        },
        2: {
          assigned_to: "Maria Garcia",
          reporting_managers: ["Robert Chen"],
          escalation_managers: ["David Lee"],
          members_list: ["Maria Garcia", "Robert Chen", "David Lee"],
        },
        3: {
          assigned_to: "Alex Thompson",
          reporting_managers: ["Jennifer Smith", "Mark Davis"],
          escalation_managers: ["Lisa Brown"],
          members_list: [
            "Alex Thompson",
            "Jennifer Smith",
            "Mark Davis",
            "Lisa Brown",
          ],
        },
        4: {
          assigned_to: "Test User",
          reporting_managers: ["Manager One", "Manager Two"],
          escalation_managers: ["Escalation Manager"],
          members_list: [
            "Test User",
            "Manager One",
            "Manager Two",
            "Escalation Manager",
          ],
        },
        5: {
          // RECONCILIATION - DAILY SETTLEMENT PROCESS
          assigned_to: "Maria Garcia",
          reporting_managers: ["Robert Chen"],
          escalation_managers: ["Sarah Wilson"],
          members_list: ["Maria Garcia", "Robert Chen", "Sarah Wilson"],
        },
        6: {
          // RECONCILIATION - DAILY SETTLEMENT PROCESS (Enterprise Banking)
          assigned_to: "Maria Garcia",
          reporting_managers: ["Robert Chen"],
          escalation_managers: ["Sarah Wilson"],
          members_list: ["Maria Garcia", "Robert Chen", "Sarah Wilson"],
        },
        16: {
          // Check task (PaySwiff)
          assigned_to: "Sanjay Kumar",
          reporting_managers: ["Sarumathi Manickam", "Vishnu Vardhan"],
          escalation_managers: ["Harini NL", "Vishal S"],
          members_list: [
            "Sanjay Kumar",
            "Mugundhan Selvam",
            "Sarumathi Manickam",
            "Vishnu Vardhan",
            "Harini NL",
            "Vishal S",
          ],
        },
      };
      return (
        taskMembers[taskId] || {
          assigned_to: "Unassigned",
          reporting_managers: [],
          escalation_managers: [],
          members_list: [],
        }
      );
    };

    const members = getMembersForTask(dbNotif.task_id, notificationType);

    const transformed = {
      id: String(dbNotif.id),
      type: notificationType,
      title:
        realTimeTitle && realTimeTitle !== dbNotif.details
          ? realTimeTitle
          : realTimeDetails?.includes("FinOps: sla warning")
            ? realTimeDetails
            : realTimeDetails?.includes("SLA Warning - ") &&
                realTimeDetails?.includes("min remaining")
              ? realTimeDetails
              : realTimeDetails?.includes("Overdue by")
                ? realTimeTitle || `SLA Overdue - ${overdueMinutes} min overdue`
                : realTimeDetails?.includes("Subtasks (0/1 completed)")
                  ? realTimeDetails.split("Start:")[0].trim()
                  : realTimeDetails?.includes(
                        "CLEARING - FILE TRANSFER AND VALIDATION",
                      )
                    ? "CLEARING - FILE TRANSFER AND VALIDATION"
                    : startTime
                      ? `Task (Start: ${startTime})`
                      : dbNotif.details && !dbNotif.details.includes("FinOps: ")
                        ? dbNotif.details
                        : dbNotif.action
                          ? dbNotif.action.replace(/_/g, " ").toUpperCase()
                          : "FinOps Notification",
      message: realTimeDetails || "",
      task_name:
        dbNotif.task_name ||
        (dbNotif.task_id === 5 || dbNotif.task_id === 6
          ? "RECONCILIATION - DAILY SETTLEMENT PROCESS"
          : dbNotif.task_id === 16
            ? "Check"
            : startTime
              ? `Task scheduled for ${startTime}`
              : "CLEARING - FILE TRANSFER AND VALIDATION"),
      client_name:
        dbNotif.client_name ||
        (dbNotif.task_id === 6
          ? "Enterprise Banking Solutions"
          : dbNotif.task_id === 16
            ? "PaySwiff"
            : "ABC Corporation"),
      subtask_name: dbNotif.subtask_name,
      assigned_users:
        parseManagers(dbNotif.assigned_to) ||
        (members.assigned_to ? [members.assigned_to] : []),
      assigned_to: parseManagers(dbNotif.assigned_to).length
        ? parseManagers(dbNotif.assigned_to).join(", ")
        : dbNotif.user_name || members.assigned_to || "Unassigned",
      reporting_managers:
        parseManagers(dbNotif.reporting_managers) || members.reporting_managers,
      escalation_managers:
        parseManagers(dbNotif.escalation_managers) ||
        members.escalation_managers,
      priority:
        dbNotif.priority ||
        (notificationType === "overdue_reason_required"
          ? "critical"
          : notificationType === "escalation_alert" || isExpiredSLA
            ? "critical"
            : notificationType === "sla_warning" || overdueMinutes
              ? "high"
              : notificationType === "pre_start_alert"
                ? "medium"
                : "medium"), // Default to medium instead of low
      status: dbNotif.read ? "read" : "unread",
      created_at: dbNotif.created_at,
      action_required:
        notificationType === "overdue_reason_required" ||
        notificationType === "sla_overdue" ||
        notificationType === "escalation" ||
        isExpiredSLA ||
        (notificationType === "sla_warning" &&
          (dbNotif.details?.includes("min remaining") ||
            dbNotif.details?.includes("need to start"))),
      delay_reason:
        dbNotif.overdue_reason || // Use overdue reason from API response
        (dbNotif.action === "delay_reported" ? "Process delayed" : undefined),
      sla_remaining:
        realTimeSlaRemaining ||
        (overdueMinutes ? `Overdue by ${overdueMinutes} min` : undefined),
      overdue_minutes: overdueMinutes,
      members_list: members.members_list,
      scheduled_time_ist: istTime,
      time_diff_minutes:
        timeRemaining || (overdueMinutes ? -overdueMinutes : undefined),
    };

    console.log("🔄 API data input:", {
      id: dbNotif.id,
      priority: dbNotif.priority,
      user_name: dbNotif.user_name,
      created_at: dbNotif.created_at,
      details: dbNotif.details,
    });
    console.log("🔄 Transformed notification:", {
      id: transformed.id,
      priority: transformed.priority,
      assigned_to: transformed.assigned_to,
      created_at: transformed.created_at,
      title: transformed.title,
    });
    return {
      ...transformed,
      created_by: (dbNotif as any).created_by,
      updated_by: (dbNotif as any).updated_by,
    };
  });
};

// Type and priority mapping functions removed since API already returns correct format

const mockNotifications: FinOpsNotification[] = [
  {
    id: "1",
    type: "sla_overdue",
    title: "SLA Overdue Alert",
    message: "MASTER AND VISA FILE VALIDATION subtask is overdue by 2 hours",
    task_name: "CLEARING - FILE TRANSFER AND VALIDATION",
    client_name: "ABC Corporation",
    subtask_name: "MASTER AND VISA FILE VALIDATION",
    assigned_to: "John Durairaj",
    reporting_managers: ["Albert", "Hari"],
    priority: "critical",
    status: "unread",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    action_required: true,
    sla_remaining: "-2 hours",
  },
  {
    id: "2",
    type: "sla_warning",
    title: "SLA Warning - 15 Minutes Remaining",
    message:
      "VISA - VALIDATION OF THE BASE 2 FILE will breach SLA in 15 minutes",
    task_name: "CLEARING - FILE TRANSFER AND VALIDATION",
    client_name: "ABC Corporation",
    subtask_name: "VISA - VALIDATION OF THE BASE 2 FILE",
    assigned_to: "John Durairaj",
    reporting_managers: ["Albert", "Hari"],
    priority: "high",
    status: "unread",
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
    action_required: true,
    sla_remaining: "15 minutes",
  },
  {
    id: "3",
    type: "task_delayed",
    title: "Task Marked as Delayed",
    message:
      "SHARING OF THE FILE TO M2P has been marked as delayed due to external dependency",
    task_name: "CLEARING - FILE TRANSFER AND VALIDATION",
    client_name: "ABC Corporation",
    subtask_name: "SHARING OF THE FILE TO M2P",
    assigned_to: "John Durairaj",
    reporting_managers: ["Albert", "Hari"],
    priority: "medium",
    status: "read",
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 minutes ago
    action_required: false,
    delay_reason: "External Dependency",
  },
  {
    id: "4",
    type: "task_completed",
    title: "Task Completed Successfully",
    message:
      "RBL DUMP VS TCP DATA (DAILY ALERT MAIL) has been completed on time",
    task_name: "CLEARING - FILE TRANSFER AND VALIDATION",
    client_name: "ABC Corporation",
    subtask_name:
      "RBL DUMP VS TCP DATA (DAILY ALERT MAIL) VS DAILY STATUS FILE COUNT",
    assigned_to: "John Durairaj",
    reporting_managers: ["Albert", "Hari"],
    priority: "low",
    status: "read",
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    action_required: false,
  },
  {
    id: "5",
    type: "daily_reminder",
    title: "Daily Process Starting Soon",
    message:
      "Daily clearing process will start in 30 minutes. Please ensure all prerequisites are met.",
    task_name: "CLEARING - FILE TRANSFER AND VALIDATION",
    client_name: "ABC Corporation",
    assigned_to: "John Durairaj",
    reporting_managers: ["Albert", "Hari"],
    priority: "medium",
    status: "unread",
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    action_required: true,
  },
  {
    id: "6",
    type: "escalation",
    title: "Escalation Required",
    message:
      "Multiple subtasks are overdue. Escalation managers have been notified.",
    task_name: "DATA RECONCILIATION PROCESS",
    client_name: "XYZ Industries",
    assigned_to: "Sarah Wilson",
    reporting_managers: ["Albert", "Hari"],
    priority: "critical",
    status: "unread",
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    action_required: true,
  },
  {
    id: "7",
    type: "sla_warning",
    title: "SLA Warning - Client Meeting",
    message: "Prepare client presentation materials - SLA expires in 1 hour",
    task_name: "CLIENT REPORTING AND PRESENTATION",
    client_name: "LMN Enterprises",
    assigned_to: "Mike Johnson",
    reporting_managers: ["Jennifer", "Robert"],
    priority: "high",
    status: "read",
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    action_required: true,
    sla_remaining: "1 hour",
  },
];

export default function FinOpsNotifications() {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [overdueReasonDialog, setOverdueReasonDialog] = useState<{
    open: boolean;
    notificationId: string;
    taskName: string;
  }>({ open: false, notificationId: "", taskName: "" });
  const [detailsDialog, setDetailsDialog] = useState<{
    open: boolean;
    notification: FinOpsNotification | null;
  }>({ open: false, notification: null });
  const [overdueReason, setOverdueReason] = useState("");
  const [debugMode, setDebugMode] = useState(false);

  // Date filter state - default to today
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  // Fetch notifications from database (moved before useEffect to fix refetch dependency)
  const {
    data: dbNotifications,
    isLoading,
    refetch,
    error,
  } = useQuery({
    queryKey: ["finops-notifications", selectedDate],
    queryFn: async () => {
      try {
        console.log(
          "🔍 Fetching FinOps notifications from API for date:",
          selectedDate,
        );
        const url = selectedDate
          ? `/notifications-production?date=${selectedDate}`
          : "/notifications-production";
        const result = await apiClient.request(url);
        console.log("✅ FinOps notifications API response:", result);
        return result;
      } catch (error) {
        console.error("❌ FinOps notifications API failed:", error);

        // Check if it's timeout error
        if (error instanceof Error && error.message.includes("timeout")) {
          console.warn("⏱️ Request timeout - using empty notifications");
          return {
            notifications: [],
            pagination: { total: 0, limit: 50, offset: 0, has_more: false },
            unread_count: 0,
          };
        }

        // Check if it's FullStory interference
        if (
          error instanceof Error &&
          (error.message.includes("Failed to fetch") ||
            error.stack?.includes("fullstory") ||
            error.stack?.includes("fs.js"))
        ) {
          console.warn(
            "🚨 FullStory interference detected in notifications query",
          );
          // Return empty structure to prevent component crash
          return {
            notifications: [],
            pagination: { total: 0, limit: 50, offset: 0, has_more: false },
            unread_count: 0,
          };
        }

        throw error;
      }
    },
    refetchInterval: 15000, // Refresh every 15 seconds for real-time monitoring
    staleTime: 10000, // Consider data stale after 10 seconds
    retry: (failureCount, error) => {
      console.log(`🔄 Retry attempt ${failureCount} for notifications`);

      // Don't retry timeout errors immediately
      if (error instanceof Error && error.message.includes("timeout")) {
        return failureCount < 1; // Only 1 retry for timeouts
      }

      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  // Real-time timer for live time updates and SLA monitoring
  React.useEffect(() => {
    // Initial update
    setCurrentTime(new Date());

    let timer: NodeJS.Timeout;
    let slaTimer: NodeJS.Timeout;

    // Set up real-time updates every 10 seconds for better responsiveness
    timer = setInterval(() => {
      setCurrentTime(new Date());
      console.log("🔄 Real-time timer update:", new Date().toISOString());
    }, 10000); // Update every 10 seconds for better real-time feel

    // Set up SLA monitoring every 30 seconds to check for overdue tasks
    slaTimer = setInterval(async () => {
      try {
        console.log("🔍 Triggering real-time SLA check...");
        // Trigger SLA monitoring on the server
        const response = await apiClient.request(
          "/notifications-production/auto-sync",
          {
            method: "POST",
          },
        );

        console.log("📊 Auto-sync response:", response);

        // Always refresh notifications after auto-sync attempt
        refetch();
      } catch (error) {
        // Check if it's a 503 (database unavailable) error
        if (error.status === 503) {
          console.log("⚠️ SLA monitoring paused: Database unavailable");
        } else {
          console.log(
            "SLA monitoring error (non-critical):",
            error.message || error,
          );
        }
        // Still refresh notifications even if auto-sync fails
        refetch();
      }
    }, 30000); // Check every 30 seconds for faster overdue detection

    return () => {
      if (timer) clearInterval(timer);
      if (slaTimer) clearInterval(slaTimer);
    };
  }, [refetch]);

  // Transform database notifications - DATABASE ONLY (no mock fallback)
  const notifications = React.useMemo(() => {
    console.log("🔍 Processing notifications data (DATABASE-ONLY MODE):", {
      dbNotifications,
      hasError: !!error,
      isLoading,
      dbStructure: dbNotifications ? Object.keys(dbNotifications) : null,
    });

    // Only use database data - no mock fallback
    if (
      dbNotifications &&
      typeof dbNotifications === "object" &&
      "notifications" in dbNotifications
    ) {
      console.log("✅ Using REAL DATABASE data:", {
        notificationsArray: dbNotifications.notifications,
        arrayLength: dbNotifications.notifications?.length,
        pagination: dbNotifications.pagination,
        unreadCount: dbNotifications.unread_count,
      });

      // Log first notification in detail for debugging
      if (
        dbNotifications.notifications &&
        dbNotifications.notifications.length > 0
      ) {
        console.log("🔍 DEBUGGING: First notification from API:", {
          raw: dbNotifications.notifications[0],
          priority: dbNotifications.notifications[0]?.priority,
          user_name: dbNotifications.notifications[0]?.user_name,
          created_at: dbNotifications.notifications[0]?.created_at,
          details: dbNotifications.notifications[0]?.details,
          hasRequiredFields: {
            hasPriority: "priority" in dbNotifications.notifications[0],
            hasUserName: "user_name" in dbNotifications.notifications[0],
            hasCreatedAt: "created_at" in dbNotifications.notifications[0],
          },
        });
      }

      if (
        dbNotifications.notifications &&
        dbNotifications.notifications.length > 0
      ) {
        console.log(
          `📊 Transforming ${dbNotifications.notifications.length} database notifications`,
        );
        const transformed = transformDbNotifications(
          dbNotifications.notifications,
          currentTime,
        );
        console.log(
          `✅ Database transformation complete: ${transformed.length} notifications processed`,
        );
        return transformed;
      } else {
        console.log("📭 Database returned empty notifications array");
        return []; // Database is empty - this is valid
      }
    }

    // Return empty array if database is unavailable (no mock fallback)
    console.log(
      "❌ Database unavailable - showing empty notifications (database-only mode)",
    );
    return [];
  }, [dbNotifications, error, isLoading, currentTime]);

  // Manual sync function for debugging time gaps (defined after refetch is available)
  const forceTimeSync = React.useCallback(() => {
    console.log("🔧 Force time synchronization triggered");
    setCurrentTime(new Date());
    refetch(); // Refresh notifications from API
  }, [refetch]);

  // Auto-open overdue reason dialog for critical notifications
  React.useEffect(() => {
    const overdueReasonNotifications = notifications.filter(
      (n) => n.type === "overdue_reason_required" && n.status === "unread",
    );

    // Auto-open the first unread overdue reason required notification
    if (overdueReasonNotifications.length > 0 && !overdueReasonDialog.open) {
      const firstOverdue = overdueReasonNotifications[0];
      console.log(
        "🚨 Auto-opening overdue reason dialog for:",
        firstOverdue.task_name,
      );

      setOverdueReasonDialog({
        open: true,
        notificationId: firstOverdue.id,
        taskName: firstOverdue.task_name,
      });
    }
  }, [notifications, overdueReasonDialog.open]);

  // Expose debug functions to window for console access (after all dependencies are available)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).finopsDebug = {
        forceTimeSync,
        getCurrentTime: () => currentTime,
        toggleDebugMode: () => setDebugMode(!debugMode),
        getNotifications: () => notifications,
        refetchNotifications: refetch,
      };
    }
  }, [forceTimeSync, currentTime, debugMode, notifications, refetch]);

  // Filter notifications
  const filteredNotifications = notifications.filter((notification) => {
    if (filterType !== "all" && notification.type !== filterType) return false;
    if (filterPriority !== "all" && notification.priority !== filterPriority)
      return false;
    if (filterStatus !== "all" && notification.status !== filterStatus)
      return false;

    // Date filter - only show notifications from selected date
    if (selectedDate) {
      const notificationDate = new Date(notification.created_at)
        .toISOString()
        .split("T")[0];
      if (notificationDate !== selectedDate) return false;
    }

    return true;
  });

  const markAsRead = async (
    notificationId: string,
    isOverdue = false,
    taskName = "",
    notificationType = "",
  ) => {
    // Auto-open overdue reason dialog for critical overdue notifications
    if (isOverdue || notificationType === "overdue_reason_required") {
      // Open dialog for overdue reason
      setOverdueReasonDialog({
        open: true,
        notificationId,
        taskName,
      });
      return;
    }

    try {
      await apiClient.request(
        `/notifications-production/${notificationId}/read`,
        {
          method: "PUT",
        },
      );
      refetch(); // Refresh the data
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const submitOverdueReason = async () => {
    try {
      // First, store the overdue reason
      await apiClient.request("/notifications-production/overdue-reason", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notification_id: overdueReasonDialog.notificationId,
          task_name: overdueReasonDialog.taskName,
          overdue_reason: overdueReason,
          created_at: new Date().toISOString(),
        }),
      });

      // Then mark as read
      await apiClient.request(
        `/notifications-production/${overdueReasonDialog.notificationId}/read`,
        {
          method: "PUT",
        },
      );

      // Close dialog and refresh
      setOverdueReasonDialog({ open: false, notificationId: "", taskName: "" });
      setOverdueReason("");
      refetch();
    } catch (error) {
      console.error("Failed to submit overdue reason:", error);
    }
  };

  const markAsArchived = async (notificationId: string) => {
    try {
      await apiClient.request(`/notifications-production/${notificationId}`, {
        method: "DELETE",
      });
      refetch(); // Refresh the data
    } catch (error) {
      console.error("Failed to archive notification:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      // Mark all unread notifications as read
      const unreadNotifications = notifications.filter(
        (n) => n.status === "unread",
      );
      await Promise.all(
        unreadNotifications.map((notification) =>
          apiClient.request(
            `/notifications-production/${notification.id}/read`,
            {
              method: "PUT",
            },
          ),
        ),
      );
      refetch(); // Refresh the data
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "overdue_reason_required":
        return AlertTriangle;
      case "sla_overdue":
      case "escalation_alert":
        return AlertTriangle;
      case "sla_warning":
        return Clock;
      case "task_completed":
        return CheckCircle;
      case "task_delayed":
        return MessageSquare;
      case "task_pending":
        return Clock;
      case "daily_reminder":
        return Calendar;
      default:
        return Bell;
    }
  };

  const getNotificationColor = (priority: string, type?: string) => {
    // Special styling for overdue reason required
    if (type === "overdue_reason_required") {
      return "border-l-red-600 bg-red-100 border-2 animate-pulse";
    }

    switch (priority) {
      case "critical":
        return "border-l-red-500 bg-red-50";
      case "high":
        return "border-l-orange-500 bg-orange-50";
      case "medium":
        return "border-l-blue-500 bg-blue-50";
      case "low":
        return "border-l-green-500 bg-green-50";
      default:
        return "border-l-gray-500 bg-gray-50";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "text-red-600 bg-red-100";
      case "high":
        return "text-orange-600 bg-orange-100";
      case "medium":
        return "text-blue-600 bg-blue-100";
      case "low":
        return "text-green-600 bg-green-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getRelativeTime = (dateString: string) => {
    // Use IST-aware helper to avoid -5:30 offset issues
    try {
      return getRelativeTimeIST(dateString);
    } catch (e) {
      // Fallback to simple display in case of parsing issues
      const d = new Date(dateString);
      return formatToISTDateTime(d, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  };

  // Calculate summary statistics
  const unreadCount = notifications.filter((n) => n.status === "unread").length;
  const criticalCount = notifications.filter(
    (n) => n.priority === "critical" && n.status !== "archived",
  ).length;
  const actionRequiredCount = notifications.filter(
    (n) => n.action_required && n.status !== "archived",
  ).length;

  // Determine database connection status (database-only mode)
  const isDatabaseConnected =
    dbNotifications &&
    typeof dbNotifications === "object" &&
    "notifications" in dbNotifications;
  const isDatabaseEmpty =
    isDatabaseConnected &&
    (!dbNotifications.notifications ||
      dbNotifications.notifications.length === 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6" />
            FinOps Notifications
            {isDatabaseConnected ? (
              <Badge
                variant="outline"
                className="ml-2 text-green-600 bg-green-50 border-green-200"
              >
                Database Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="ml-2 text-red-600 bg-red-50 border-red-200"
              >
                Database Unavailable
              </Badge>
            )}
            <Badge
              variant="outline"
              className="ml-2 text-blue-600 bg-blue-50 border-blue-200"
            >
              Real-time: {format(currentTime, "HH:mm:ss")}
            </Badge>
          </h2>
          <p className="text-gray-600 mt-1">
            Automated SLA monitoring with 15-minute warnings and overdue alerts
            {isDatabaseConnected && " �� Real-time database monitoring active"}
            {!isDatabaseConnected && " • Database connection required"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCircle className="w-4 h-4 mr-1" />
            Mark All Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={forceTimeSync}
            title="Force sync current time and refresh data"
          >
            <Clock className="w-4 h-4 mr-1" />
            Force Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {notifications.length}
            </div>
            <div className="text-xs text-gray-600">Total Notifications</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {unreadCount}
            </div>
            <div className="text-xs text-gray-600">Unread</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {criticalCount}
            </div>
            <div className="text-xs text-gray-600">Critical</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {actionRequiredCount}
            </div>
            <div className="text-xs text-gray-600">Action Required</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[150px]">
              <Label>Filter by Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sla_overdue">SLA Overdue</SelectItem>
                  <SelectItem value="sla_warning">SLA Warning</SelectItem>
                  <SelectItem value="overdue_reason_required">
                    Overdue Reason Required
                  </SelectItem>
                  <SelectItem value="task_delayed">Task Delayed</SelectItem>
                  <SelectItem value="task_completed">Task Completed</SelectItem>
                  <SelectItem value="daily_reminder">Daily Reminder</SelectItem>
                  <SelectItem value="escalation">Escalation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label>Filter by Priority</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label>Filter by Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label>Filter by Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full"
              />
              <div className="text-xs text-gray-500 mt-1">
                {selectedDate === new Date().toISOString().split("T")[0]
                  ? "Today's notifications"
                  : `Notifications from ${new Date(selectedDate).toLocaleDateString()}`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      {criticalCount > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Critical Alerts</AlertTitle>
          <AlertDescription className="text-red-700">
            You have {criticalCount} critical notification(s) that require
            immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Bell className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Notifications
              </h3>
              <p className="text-gray-600">
                {notifications.length === 0
                  ? isDatabaseEmpty
                    ? "✅ Database connected. No notifications yet. The system automatically monitors subtask start_time and creates SLA warnings 15 minutes before and overdue alerts 15 minutes after scheduled times."
                    : isDatabaseConnected
                      ? "Database connected but no notifications found. Check subtasks table for entries with start_time to enable automatic notifications."
                      : "�� Database unavailable. Please ensure database connection is working to see automated SLA notifications."
                  : "No notifications match your current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredNotifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            return (
              <Card
                key={notification.id}
                className={`${getNotificationColor(notification.priority, notification.type)} border-l-4 ${
                  notification.status === 'unread" ? "shadow-md" : '
                } ${
                  notification.type ===
                  'overdue_reason_required" ? "ring-2 ring-red-300" : '
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3 flex-1">
                      <Icon
                        className={`w-5 h-5 mt-0.5 ${
                          notification.priority === "critical"
                            ? "text-red-600"
                            : notification.priority === "high"
                              ? "text-orange-600"
                              : notification.priority === "medium"
                                ? "text-blue-600"
                                : "text-green-600"
                        }`}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4
                              className={`font-medium text-sm ${
                                notification.status === "unread"
                                  ? "font-semibold"
                                  : ""
                              }`}
                            >
                              {notification.title}
                            </h4>
                            {notification.message &&
                              notification.title &&
                              notification.message.trim() !==
                                notification.title.trim() && (
                                <p className="text-sm text-gray-700 mt-1 break-words">
                                  {notification.message}
                                </p>
                              )}
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <Badge
                              className={getPriorityColor(
                                notification.priority,
                              )}
                            >
                              {notification.priority}
                            </Badge>
                            {notification.status === "unread" && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {notification.task_name}
                          </span>
                          {notification.client_name && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {notification.client_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {notification.assigned_to}
                          </span>
                          <span>
                            {getRelativeTime(notification.created_at)}
                          </span>
                        </div>

                        {notification.subtask_name && (
                          <div className="text-xs text-gray-600 mb-2">
                            <strong>Subtask:</strong>{" "}
                            {notification.subtask_name}
                          </div>
                        )}

                        {notification.delay_reason && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mb-2">
                            <div className="text-xs text-yellow-800 font-medium mb-1 flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {notification.message
                                .toLowerCase()
                                .includes("overdue")
                                ? "Previous Overdue Reason:"
                                : "Delay Reason:"}
                            </div>
                            <div className="text-xs text-yellow-700 font-medium">
                              {notification.delay_reason}
                            </div>
                          </div>
                        )}

                        {notification.sla_remaining && (
                          <div
                            className={`text-xs mb-2 font-semibold ${
                              notification.type === "sla_overdue"
                                ? "text-red-600"
                                : "text-orange-600"
                            }`}
                          >
                            <strong>SLA Status:</strong>{" "}
                            {notification.sla_remaining}
                          </div>
                        )}

                        {/* Members List - Enhanced Display */}
                        {notification.members_list &&
                          notification.members_list.length > 0 && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
                              <div className="text-xs font-medium text-gray-800 mb-2">
                                Team Members:
                              </div>

                              {/* Assigned To */}
                              <div className="mb-2">
                                <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  Assigned: {notification.assigned_to}
                                </span>
                              </div>

                              {/* Reporting Managers - Show for tasks <15 min or overdue */}
                              {notification.reporting_managers &&
                                notification.reporting_managers.length > 0 && (
                                  <div className="mb-2">
                                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      Reporting Managers:{" "}
                                      {notification.reporting_managers.join(
                                        ", ",
                                      )}
                                    </span>
                                  </div>
                                )}

                              {/* Escalation Managers - Show for overdue tasks */}
                              {notification.type === "sla_overdue" &&
                                notification.escalation_managers &&
                                notification.escalation_managers.length > 0 && (
                                  <div className="mb-2">
                                    <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                                      <Shield className="w-3 h-3" />
                                      Escalation Managers:{" "}
                                      {notification.escalation_managers.join(
                                        ", ",
                                      )}
                                    </span>
                                  </div>
                                )}
                            </div>
                          )}

                        {notification.action_required && (
                          <Alert
                            className={`mt-3 p-2 ${
                              notification.type === "overdue_reason_required"
                                ? "border-red-300 bg-red-100"
                                : "border-orange-200 bg-orange-50"
                            }`}
                          >
                            <AlertCircle
                              className={`h-3 w-3 ${
                                notification.type === "overdue_reason_required"
                                  ? "text-red-700"
                                  : "text-orange-600"
                              }`}
                            />
                            <AlertDescription
                              className={`text-xs ml-1 ${
                                notification.type === "overdue_reason_required"
                                  ? "text-red-800 font-semibold"
                                  : "text-orange-700"
                              }`}
                            >
                              {notification.type === "overdue_reason_required"
                                ? "🚨 URGENT: Overdue reason required - Click to provide explanation"
                                : "Action required - Please review and take necessary steps"}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 ml-3">
                      {notification.status === "unread" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            markAsRead(
                              notification.id,
                              notification.type === "sla_overdue" ||
                                notification.type === "overdue_reason_required",
                              notification.task_name,
                              notification.type,
                            )
                          }
                          className="h-8 px-2"
                          title={
                            notification.type === "sla_overdue"
                              ? "Mark as read and provide reason"
                              : "Mark as read"
                          }
                        >
                          <CheckCircle className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsArchived(notification.id)}
                        className="h-8 px-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => {
                          setDetailsDialog({ open: true, notification });
                        }}
                        title="View Details"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* View Details Dialog */}
      <Dialog
        open={detailsDialog.open}
        onOpenChange={(open) => {
          if (!open) setDetailsDialog({ open: false, notification: null });
        }}
      >
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 rounded-md bg-blue-50 p-2 text-blue-700">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle className="text-base leading-tight">
                    {detailsDialog.notification?.title ||
                      "Notification Details"}
                  </DialogTitle>
                  {detailsDialog.notification?.message && (
                    <DialogDescription className="mt-1">
                      {detailsDialog.notification.message}
                    </DialogDescription>
                  )}
                </div>
              </div>
              {detailsDialog.notification && (
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      detailsDialog.notification.priority === "critical"
                        ? "bg-red-600 text-white"
                        : detailsDialog.notification.priority === "high"
                          ? "bg-orange-600 text-white"
                          : detailsDialog.notification.priority === "medium"
                            ? "bg-amber-500 text-white"
                            : "bg-gray-500 text-white"
                    }
                  >
                    {detailsDialog.notification.priority}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {detailsDialog.notification.type.replaceAll("_", " ")}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {detailsDialog.notification.status}
                  </Badge>
                </div>
              )}
            </div>
          </DialogHeader>

          {detailsDialog.notification && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="rounded-md border bg-white p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Overview
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> Task
                        </span>
                        <span className="font-medium text-right">
                          {detailsDialog.notification.task_name}
                        </span>
                      </div>
                      {detailsDialog.notification.subtask_name && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Subtask</span>
                          <span className="font-medium text-right">
                            {detailsDialog.notification.subtask_name}
                          </span>
                        </div>
                      )}
                      {detailsDialog.notification.client_name && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Client</span>
                          <span className="font-medium text-right">
                            {detailsDialog.notification.client_name}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 flex items-center gap-2">
                            <User className="w-4 h-4" /> Assignees
                          </span>
                          {!detailsDialog.notification.assigned_users
                            ?.length && (
                            <span className="font-medium text-right">
                              {detailsDialog.notification.assigned_to}
                            </span>
                          )}
                        </div>
                        {detailsDialog.notification.assigned_users?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2 justify-end">
                            {detailsDialog.notification.assigned_users.map(
                              (u, idx) => (
                                <Badge
                                  key={`assignee-${idx}`}
                                  variant="secondary"
                                  className="px-2 py-0.5"
                                >
                                  {u}
                                </Badge>
                              ),
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-white p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Timing
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Created
                        </span>
                        <span className="text-right">
                          <span className="block font-medium">
                            {getRelativeTimeIST(
                              detailsDialog.notification.created_at,
                            )}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {formatToISTDateTime(
                              detailsDialog.notification.created_at,
                            )}
                          </span>
                        </span>
                      </div>
                      {detailsDialog.notification.scheduled_time_ist && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Scheduled (IST)</span>
                          <span className="font-medium text-right">
                            {detailsDialog.notification.scheduled_time_ist}
                          </span>
                        </div>
                      )}
                      {typeof detailsDialog.notification.time_diff_minutes ===
                        "number" && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Time Diff</span>
                          <span className="font-medium text-right">
                            {detailsDialog.notification.time_diff_minutes} min
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-md border bg-white p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Stakeholders
                    </div>
                    <div className="space-y-3">
                      {detailsDialog.notification.reporting_managers?.length ? (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            Reporting Managers
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {detailsDialog.notification.reporting_managers.map(
                              (m, idx) => (
                                <Badge
                                  key={`rm-${idx}`}
                                  variant="secondary"
                                  className="px-2 py-0.5"
                                >
                                  {m}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}

                      {detailsDialog.notification.escalation_managers
                        ?.length ? (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            Escalation Managers
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {detailsDialog.notification.escalation_managers.map(
                              (m, idx) => (
                                <Badge
                                  key={`em-${idx}`}
                                  variant="outline"
                                  className="px-2 py-0.5"
                                >
                                  {m}
                                </Badge>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {(detailsDialog.notification.sla_remaining ||
                    detailsDialog.notification.delay_reason) && (
                    <div className="rounded-md border bg-white p-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        SLA & Status
                      </div>
                      <div className="space-y-3">
                        {detailsDialog.notification.sla_remaining && (
                          <div className="flex items-center gap-2 text-orange-700 font-semibold">
                            <Shield className="w-4 h-4" />{" "}
                            {detailsDialog.notification.sla_remaining}
                          </div>
                        )}
                        {detailsDialog.notification.delay_reason && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                            <div className="text-yellow-800 font-medium mb-1">
                              Delay/Overdue Reason
                            </div>
                            <div className="text-yellow-700 text-sm leading-relaxed">
                              {detailsDialog.notification.delay_reason}
                            </div>
                          </div>
                        )}

                        {/* Created/Updated By */}
                        <div className="rounded-md border bg-white p-4 mt-4">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                            Audit
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {((detailsDialog as any)?.notification as any)
                              ?.created_by && (
                              <div>
                                <div className="text-gray-500">Created by</div>
                                <div className="font-medium">
                                  {
                                    (
                                      (detailsDialog as any)
                                        ?.notification as any
                                    )?.created_by
                                  }
                                </div>
                              </div>
                            )}
                            {((detailsDialog as any)?.notification as any)
                              ?.updated_by && (
                              <div>
                                <div className="text-gray-500">Updated by</div>
                                <div className="font-medium">
                                  {
                                    (
                                      (detailsDialog as any)
                                        ?.notification as any
                                    )?.updated_by
                                  }
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {detailsDialog.notification &&
              detailsDialog.notification.status === "unread" && (
                <Button
                  onClick={() => markAsRead(detailsDialog.notification!.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Mark as Read
                </Button>
              )}
            <Button
              variant="outline"
              onClick={() =>
                setDetailsDialog({ open: false, notification: null })
              }
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Overdue Reason Dialog */}
      <Dialog
        open={overdueReasonDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setOverdueReasonDialog({
              open: false,
              notificationId: "",
              taskName: "",
            });
            setOverdueReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-6 h-6 text-red-600 animate-pulse" />
              🚨 URGENT: Overdue Task - Immediate Explanation Required
            </DialogTitle>
            <DialogDescription className="text-base">
              This task has exceeded its SLA deadline and requires an immediate
              explanation.
              <br />
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <strong className="text-red-800">
                  Task: {overdueReasonDialog.taskName}
                </strong>
                <br />
                <span className="text-red-600 text-sm">
                  Status automatically changed to OVERDUE
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label
                htmlFor="overdue-reason"
                className="text-red-700 font-semibold"
              >
                Overdue Explanation *
              </Label>
              <Textarea
                id="overdue-reason"
                placeholder="REQUIRED: Explain why this task became overdue and what corrective actions have been or will be taken...\n\nExample:\n- Root cause: Unexpected system downtime\n- Impact: 2-minute delay in file processing\n- Corrective action: Monitoring system upgraded\n- Prevention: Added automated alerts"
                value={overdueReason}
                onChange={(e) => setOverdueReason(e.target.value)}
                className="min-h-[120px] border-red-300 focus:border-red-500"
              />
              <p className="text-xs text-red-600">
                ⚠️ This explanation will be logged and may be reviewed by
                management.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOverdueReasonDialog({
                  open: false,
                  notificationId: "",
                  taskName: "",
                });
                setOverdueReason("");
              }}
              className="border-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={submitOverdueReason}
              disabled={
                !overdueReason.trim() || overdueReason.trim().length < 10
              }
              className="bg-red-600 hover:bg-red-700 text-white px-6"
            >
              ✓ Submit Explanation & Acknowledge
            </Button>
          </DialogFooter>

          {overdueReason.trim() && overdueReason.trim().length < 10 && (
            <div className="text-xs text-red-500 text-center mb-2">
              Please provide a detailed explanation (minimum 10 characters)
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
