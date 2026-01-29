import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/use-toast";
import { formatToISTDateTime } from "@/lib/dateUtils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Clock,
  AlertTriangle,
  CheckCircle,
  PlayCircle,
  Calendar,
  User,
  Timer,
  Save,
  X,
  Bell,
  MessageSquare,
  AlertCircle,
  Target,
  Users,
  Activity,
  Filter,
  Building2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  addHours,
  addMinutes,
  isBefore,
  isAfter,
} from "date-fns";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// Helper function to extract name from "Name (email)" format or messy JSON-like strings (silent + memoized)
const __nameParseCache = new Map<string, string>();
const extractNameFromValue = (raw: any, depth: number = 0): string => {
  if (raw === null || raw === undefined) return "";

  // If it's already a non-empty string, proceed with existing normalization
  if (typeof raw === "string") {
    const cached = __nameParseCache.get(raw);
    if (cached) return cached;
    if (depth > 5) {
      __nameParseCache.set(raw, raw);
      return raw;
    }
    let value = raw.trim();

    // Strip surrounding braces {..} or quotes ".."
    if (value.startsWith("{") && value.endsWith("}")) {
      value = value.slice(1, -1).trim();
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Unescape common escaped quotes \"...\"
    if (value.startsWith('\\"') && value.endsWith('\\"')) {
      value = value.slice(2, -2);
    }

    // If still looks like JSON string, try parse once
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("{") && value.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(value);
        const res =
          typeof parsed === "string"
            ? extractNameFromValue(parsed, depth + 1)
            : extractNameFromValue(parsed, depth + 1);
        __nameParseCache.set(raw, res);
        return res;
      } catch {}
    }

    // Name (email) => take name only
    const m = value.match(/^(.+)\s\([^)]+\)$/);
    if (m) {
      __nameParseCache.set(raw, m[1]);
      return m[1];
    }

    __nameParseCache.set(raw, value);
    return value;
  }

  // If raw is an array, map each element to a name and join
  if (Array.isArray(raw)) {
    const parts = raw
      .map((r) => extractNameFromValue(r, depth + 1))
      .filter(Boolean);
    return parts.join(", ");
  }

  // If raw is an object, try common properties
  if (typeof raw === "object") {
    try {
      // Common shapes: { name: 'Naveen Kumar' } or { first_name, last_name }
      if (raw.name && typeof raw.name === "string") return raw.name.trim();
      if (raw.full_name && typeof raw.full_name === "string")
        return raw.full_name.trim();
      const first = raw.first_name || raw.firstname || raw.firstName;
      const last = raw.last_name || raw.lastname || raw.lastName;
      if (first || last)
        return `${(first || "").toString().trim()} ${(last || "").toString().trim()}`.trim();

      // Some payloads use user_name / username
      if (raw.user_name || raw.username || raw.userName)
        return (raw.user_name || raw.username || raw.userName)
          .toString()
          .trim();

      // If email is present, prefer a display-friendly local part
      if (raw.email && typeof raw.email === "string") {
        const email = raw.email.trim();
        // Use name if available in object as name + email
        if (raw.name) return raw.name;
        return email;
      }

      // If object contains nested tracker info with run_date and completed_by etc, try to extract name fields
      if (raw.completed_by)
        return extractNameFromValue(raw.completed_by, depth + 1);
      if (raw.approved_by)
        return extractNameFromValue(raw.approved_by, depth + 1);

      // Fallback: stringify and attempt to parse
      const str = JSON.stringify(raw);
      return extractNameFromValue(str, depth + 1);
    } catch (e) {
      return "";
    }
  }

  // Fallback to empty string for unexpected types
  return "";
};

// Helper function to convert name to "Name (email)" format
const convertNameToValueFormat = (name: string, users: any[]): string => {
  if (name.includes("(") && name.includes(")")) {
    return name; // Already in new format
  }
  const user = users.find((u) => `${u.first_name} ${u.last_name}` === name);
  return user ? `${name} (${user.email || "no-email"})` : `${name} (no-email)`;
};

// Format ISO timestamp to "YYYY-MM-DD h:mm:ss AM/PM"
const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return format(d, "yyyy-MM-dd h:mm:ss a");
  } catch (e) {
    return "";
  }
};

// Time conversion utilities for AM/PM format
const convertTo12Hour = (time24: string): { time: string; period: string } => {
  if (!time24) return { time: "", period: "AM" };

  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const adjustedHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  return {
    time: `${adjustedHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
    period,
  };
};

const convertTo24Hour = (time12: string, period: string): string => {
  if (!time12) return "";

  const [hours, minutes] = time12.split(":").map(Number);
  let adjustedHours = hours;

  if (period === "PM" && hours !== 12) {
    adjustedHours = hours + 12;
  } else if (period === "AM" && hours === 12) {
    adjustedHours = 0;
  }

  return `${adjustedHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const dayNameToIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const weeklyDaysToNumbers = (raw: any): number[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((d: any) => {
        if (typeof d === "number") return d;
        const s = String(d).toLowerCase().trim();
        if (/^\d+$/.test(s)) return Number(s);
        if (s in dayNameToIndex) return dayNameToIndex[s];
        const short = s.slice(0, 3);
        for (const [k, v] of Object.entries(dayNameToIndex)) {
          if (k.slice(0, 3) === short) return v;
        }
        return NaN;
      })
      .filter((n: number) => !isNaN(n));
  }
  return [];
};

// Enhanced interfaces with client integration
interface ClientBasedFinOpsSubTask {
  id: string;
  name: string;
  description?: string;
  start_time: string; // Daily start time (e.g., "05:00")
  order_position: number;
  status: "pending" | "in_progress" | "completed" | "delayed" | "overdue";
  assigned_to?: string;
  started_at?: string;
  completed_at?: string;
  due_at?: string;
  delay_reason?: string;
  delay_notes?: string;
  alerts_sent?: string[];
  // reporting_managers?: string[];
  // escalation_managers?: string[];
}

interface ClientBasedFinOpsTask {
  id: number;
  task_name: string;
  description: string;
  client_id: number;
  client_name: string;
  assigned_to: string[]; // Changed to array for multiple assignments
  reporting_managers: string[];
  escalation_managers: string[];
  effective_from: string;
  duration: "daily" | "weekly" | "monthly";
  weekly_days?: any;
  monthly_day?: number | null;
  is_active: boolean;
  subtasks: ClientBasedFinOpsSubTask[];
  created_at: string;
  updated_at: string;
  created_by: string;
  last_run?: string;
  next_run?: string;
  status: "active" | "inactive" | "completed" | "overdue" | "delayed";
  can_edit?: boolean; // User permission to edit this task
  can_admin?: boolean; // Admin permission to edit this task
}

// Time Picker Component with AM/PM support
interface TimePickerWithAmPmProps {
  value: string; // 24-hour format (e.g., "14:30")
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function TimePickerWithAmPm({
  value,
  onChange,
  placeholder = "Select time",
  required = false,
}: TimePickerWithAmPmProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Convert current value to 12-hour format for display
  const { time: currentTime12, period: currentPeriod } = convertTo12Hour(value);

  // Generate time options for 12-hour format
  const timeOptions = [];
  for (let hour = 1; hour <= 12; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      // 15-minute intervals
      const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      timeOptions.push(timeStr);
    }
  }

  // Filter time options based on search
  const filteredTimes = timeOptions.filter((time) =>
    time.includes(searchTerm.toLowerCase()),
  );

  const handleTimeSelect = (time12: string, period: string) => {
    const time24 = convertTo24Hour(time12, period);
    onChange(time24);
  };

  return (
    <div className="relative">
      <Select
        value={value ? `${currentTime12} ${currentPeriod}` : ""}
        onValueChange={(selected) => {
          const [time12, period] = selected.split(" ");
          handleTimeSelect(time12, period);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <div className="p-2 border-b">
            <Input
              placeholder="Search time (e.g., 9:00)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {["AM", "PM"].map((period) => (
              <div key={period}>
                <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">
                  {period}
                </div>
                {filteredTimes.map((time) => (
                  <SelectItem
                    key={`${time}-${period}`}
                    value={`${time} ${period}`}
                    className="pl-6"
                  >
                    {time} {period}
                  </SelectItem>
                ))}
              </div>
            ))}
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}

// Enhanced Sortable SubTask Component with inline status change
interface SortableSubTaskItemProps {
  subtask: ClientBasedFinOpsSubTask;
  task: ClientBasedFinOpsTask;
  index: number;
  onUpdate: (index: number, field: string, value: any) => void;
  onRemove: (index: number) => void;
  onStatusChange?: (
    subtaskId: string,
    status: string,
    delayReason?: string,
    delayNotes?: string,
  ) => void;
  isInline?: boolean;
}

function SortableSubTaskItem({
  subtask,
  task,
  index,
  onUpdate,
  onRemove,
  onStatusChange,
  isInline = false,
}: SortableSubTaskItemProps) {
  // console.log("Tasks : " , subtask)
  const [showDelayDialog, setShowDelayDialog] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [delayNotes, setDelayNotes] = useState("");

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: subtask.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleStatusChange = (newStatus: string) => {
    if (isInline && onStatusChange) {
      if (newStatus === "delayed") {
        setShowDelayDialog(true);
      } else {
        onStatusChange(subtask.id, newStatus);
      }
    } else {
      onUpdate(index, "status", newStatus);
    }
  };

  const handleDelaySubmit = () => {
    if (isInline && onStatusChange) {
      onStatusChange(subtask.id, "delayed", delayReason, delayNotes);
    }
    setShowDelayDialog(false);
    setDelayReason("");
    setDelayNotes("");
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="border rounded-lg p-4 bg-gray-50"
      >
        <div className="flex items-start gap-3">
          {!isInline && (
            <div {...attributes} {...listeners} className="mt-2 cursor-grab">
              <GripVertical className="w-4 h-4 text-gray-400" />
            </div>
          )}

          <div className="flex-1 space-y-3">
            {isInline ? (
              // Inline view for task management
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm break-words whitespace-pre-wrap">
                      {subtask.name}
                    </h4>
                    {subtask.description && (
                      <p className="text-xs text-gray-600 mt-1 break-words whitespace-pre-wrap">
                        {subtask.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>
                        Start: {(() => {
                          if (!subtask.start_time) return "Not set";
                          const { time, period } = convertTo12Hour(
                            subtask.start_time,
                          );
                          return time
                            ? `${time} ${period}`
                            : subtask.start_time;
                        })()}
                      </span>

                      {subtask.started_at && (
                        <span>
                          In progress: {new Date(subtask.started_at).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" },
                          )}
                        </span>
                      )}

                      {subtask.delayed_at && (
                        <span className="text-yellow-700">
                          Delayed: {new Date(subtask.delayed_at).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" },
                          )}
                        </span>
                      )}

                      {subtask.overdue_at && (
                        <span className="text-red-700">
                          Overdue: {new Date(subtask.overdue_at).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" },
                          )}
                        </span>
                      )}

                      {subtask.completed_at && (
                        <span className="text-green-700">
                          Completed: {new Date(subtask.completed_at).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" },
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {/* Disable status changes for pending subtasks until 30 minutes before scheduled IST start time */}
                    {(() => {
                      let isEditable = true;
                      try {
                        if (
                          subtask.start_time &&
                          subtask.status === "pending"
                        ) {
                          const istNow = new Date(
                            new Date().toLocaleString("en-US", {
                              timeZone: "Asia/Kolkata",
                            }),
                          );
                          const [hh, mm] = (subtask.start_time || "")
                            .split(":")
                            .map(Number);
                          const scheduled = new Date(
                            istNow.getFullYear(),
                            istNow.getMonth(),
                            istNow.getDate(),
                            hh || 0,
                            mm || 0,
                          );
                          const scheduledMinus30 = new Date(
                            scheduled.getTime() - 30 * 60000,
                          );
                          if (istNow.getTime() < scheduledMinus30.getTime())
                            isEditable = false;
                        }
                      } catch (e) {
                        // on parse errors, leave editable
                      }

                      return (
                        <Select
                          value={subtask.status}
                          onValueChange={handleStatusChange}
                          disabled={!isEditable}
                        >
                          <SelectTrigger
                            className="w-32 h-8"
                            title={
                              isEditable
                                ? undefined
                                : "Locked until 30 minutes before Start time (IST)"
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">
                              In Progress
                            </SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="delayed">Delayed</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    {/* Approve button: visible to admin, reporting managers, or escalation managers when subtask completed */}
                    {(() => {
                      try {
                        const currentUser = (useAuth() as any)?.user || null;

                        const normalize = (value: string) =>
                          (value || "")
                            .toLowerCase()
                            .replace(/\s+/g, " ")
                            .trim();

                        const normalizedUserName = normalize(
                          currentUser?.name || currentUser?.email || "",
                        );

                        const isAdmin = currentUser?.role === "admin";

                        const isReporting =
                          Array.isArray(task?.reporting_managers) &&
                          task.reporting_managers
                            .map(normalize)
                            .includes(normalizedUserName);

                        const isEscalation =
                          Array.isArray(task?.escalation_managers) &&
                          task.escalation_managers
                            .map(normalize)
                            .includes(normalizedUserName);

                        const isAssigned =
                          Array.isArray(task?.assigned_to) &&
                          task.assigned_to
                            .map(normalize)
                            .includes(normalizedUserName);

                        const isApproved = Boolean(
                          (subtask as any)?.approved_by,
                        );

                        // ✅ Only allow reporting, escalation, or admin users (not assigned ones)

                        const canSeeApproveButton =
                          (isReporting || isEscalation || isAdmin) &&
                          !isAssigned &&
                          ["completed", "approved"].includes(subtask.status) &&
                          !isApproved;

                        if (canSeeApproveButton) {
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                if (!confirm("Approve this subtask?")) return;

                                try {
                                  const approverName =
                                    currentUser?.name ||
                                    currentUser?.email ||
                                    "";

                                  await apiClient.approveFinOpsSubtask(
                                    Number(subtask.id),
                                    approverName,
                                    undefined,
                                    (subtask as any)?.tracker_id,
                                  );

                                  try {
                                    queryClient.invalidateQueries({
                                      queryKey: ["client-finops-tasks"],
                                    });
                                  } catch {}

                                  toast({
                                    title: "Approved",

                                    description: `Approved by ${approverName}`,
                                  });
                                } catch (e) {
                                  alert("Failed to approve");
                                }
                              }}
                            >
                              Approve
                            </Button>
                          );
                        }
                      } catch {
                        // safely ignore any runtime errors
                      }

                      return null;
                    })()}
                  </div>
                </div>

                {/* Show approval info if present */}
                {subtask.status === "completed" &&
                  (subtask as any).approved_by && (
                    <div className="mt-2">
                      <Badge
                        variant="outline"
                        className="text-green-700 border-green-300 bg-green-50"
                      >
                        Approved by {(subtask as any).approved_by}
                        {(subtask as any).approved_at
                          ? ` on ${formatToISTDateTime((subtask as any).approved_at, { second: "2-digit" })} IST (+05:30)`
                          : ""}
                      </Badge>
                    </div>
                  )}

                {/* Show delay information if present */}
                {subtask.status === "delayed" && subtask.delay_reason && (
                  <Alert className="border-yellow-200 bg-yellow-50">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800">Delayed</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                      <div>
                        <strong>Reason:</strong> {subtask.delay_reason}
                      </div>
                      {subtask.delay_notes && (
                        <div>
                          <strong>Notes:</strong> {subtask.delay_notes}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              // Form view for add/edit
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Subtask Name *</Label>
                  <Input
                    value={subtask.name || ""}
                    onChange={(e) => onUpdate(index, "name", e.target.value)}
                    placeholder="e.g., RBL DUMP VS TCP DATA (DAILY ALERT MAIL)"
                    required
                  />
                </div>

                <div>
                  <Label>Daily Start Time *</Label>
                  <TimePickerWithAmPm
                    value={subtask.start_time || ""}
                    onChange={(value) => onUpdate(index, "start_time", value)}
                    placeholder="Select start time"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={subtask.description || ""}
                    onChange={(e) =>
                      onUpdate(index, "description", e.target.value)
                    }
                    placeholder="Additional details about this subtask..."
                    rows={2}
                  />
                </div>

                <div>
                  <Label>Status</Label>
                  {(() => {
                    let isEditable = true;
                    try {
                      if (subtask.start_time && subtask.status === "pending") {
                        const istNow = new Date(
                          new Date().toLocaleString("en-US", {
                            timeZone: "Asia/Kolkata",
                          }),
                        );
                        const [hh, mm] = (subtask.start_time || "")
                          .split(":")
                          .map(Number);
                        const scheduled = new Date(
                          istNow.getFullYear(),
                          istNow.getMonth(),
                          istNow.getDate(),
                          hh || 0,
                          mm || 0,
                        );
                        const scheduledMinus30 = new Date(
                          scheduled.getTime() - 30 * 60000,
                        );
                        if (istNow.getTime() < scheduledMinus30.getTime())
                          isEditable = false;
                      }
                    } catch (e) {}

                    return (
                      <Select
                        value={subtask.status}
                        onValueChange={handleStatusChange}
                        disabled={!isEditable}
                      >
                        <SelectTrigger
                          title={
                            isEditable
                              ? undefined
                              : "Locked until 30 minutes before Start time (IST)"
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">
                            In Progress
                          </SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="delayed">Delayed</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {!isInline && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRemove(index)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Delay Reason Dialog */}
      <Dialog open={showDelayDialog} onOpenChange={setShowDelayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Delayed</DialogTitle>
            <DialogDescription>
              Please provide a reason for the delay. This will trigger
              notifications to reporting managers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Delay Reason *</Label>
              <Select value={delayReason} onValueChange={setDelayReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delay reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical_issue">
                    Technical Issue
                  </SelectItem>
                  <SelectItem value="data_unavailable">
                    Data Unavailable
                  </SelectItem>
                  <SelectItem value="external_dependency">
                    External Dependency
                  </SelectItem>
                  <SelectItem value="resource_constraint">
                    Resource Constraint
                  </SelectItem>
                  <SelectItem value="process_change">Process Change</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Additional Notes</Label>
              <Textarea
                value={delayNotes}
                onChange={(e) => setDelayNotes(e.target.value)}
                placeholder="Provide additional context about the delay..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelayDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDelaySubmit} disabled={!delayReason}>
              Mark as Delayed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ClientBasedFinOpsTaskManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const getUserDisplayName = (u: any) => {
    if (!u) return undefined;
    if (typeof u.name === "string" && u.name.trim()) return u.name.trim();
    if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
    return undefined;
  };

  // Check if user can edit FinOps tasks
  const canEditFinOpsTasks = (task: ClientBasedFinOpsTask): boolean => {
    if (!user) return false;
    // Admin can edit everything
    if (user.role === "admin") return true;

    // Check if user is in reporting managers
    if (
      task.reporting_managers.some(
        (manager) =>
          extractNameFromValue(manager) === user.name ||
          manager.includes(user.email || ""),
      )
    )
      return true;

    // Check if user is in escalation managers
    if (
      task.escalation_managers.some(
        (manager) =>
          extractNameFromValue(manager) === user.name ||
          manager.includes(user.email || ""),
      )
    )
      return true;

    return false;
  };

  // Check if user can only change status (view-only users)
  const canOnlyChangeStatus = (task: ClientBasedFinOpsTask): boolean => {
    if (!user) return false;

    // Admin and managers can do full edits
    if (canEditFinOpsTasks(task)) return false;

    // Other users can only change status
    return true;
  };
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ClientBasedFinOpsTask | null>(
    null,
  );

  // Client creation states
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  // Filter states
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState(
    new Date().toISOString().split("T")[0],
  ); // Default to today
  const [viewMode, setViewMode] = useState<"all" | "daily">("daily");

  // Show more/less states for subtasks
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  // Selected client from summary
  const [selectedClientFromSummary, setSelectedClientFromSummary] = useState<
    string | null
  >(null);

  // Search states for dropdowns
  const [assignedToSearch, setAssignedToSearch] = useState("");
  const [reportingManagerSearch, setReportingManagerSearch] = useState("");
  const [escalationManagerSearch, setEscalationManagerSearch] = useState("");

  // Real-time timer state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Keep the "X min ago" labels updating in real time, independent of data fetching
  useEffect(() => {
    const tick = setInterval(() => setCurrentTime(new Date()), 10000); // 10s cadence
    return () => clearInterval(tick);
  }, []);

  // Overdue reason dialog states
  const [showOverdueReasonDialog, setShowOverdueReasonDialog] = useState(false);
  const [overdueReasonData, setOverdueReasonData] = useState<{
    taskId: number;
    subtaskId: string;
    newStatus: string;
    taskName: string;
    subtaskName: string;
  } | null>(null);
  const [overdueReason, setOverdueReason] = useState("");

  // Form state for creating/editing tasks
  const [taskForm, setTaskForm] = useState({
    task_name: "",
    description: "",
    client_id: "",
    assigned_to: [] as string[], // Changed to array for multiple assignments
    reporting_managers: [] as string[],
    escalation_managers: [] as string[],
    effective_from: new Date().toISOString().split("T")[0],
    duration: "daily" as "daily" | "weekly" | "monthly",
    weekly_days: [] as number[],
    monthly_day: null as number | null,
    is_active: true,
    subtasks: [] as ClientBasedFinOpsSubTask[],
  });

  // Fetch FinOps tasks with enhanced error handling
  const {
    data: finopsTasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["client-finops-tasks", dateFilter],
    queryFn: async () => {
      try {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.log("🔍 Fetching FinOps tasks...", { dateFilter });
        const result = await apiClient.getFinOpsTasks(dateFilter);
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.log(
            "��� FinOps tasks query successful:",
            Array.isArray(result) ? result.length : "unknown",
          );
        return Array.isArray(result) ? result : [];
      } catch (error) {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.error("❌ FinOps tasks query failed:", error);
        // Return empty array to prevent UI crashes
        return [];
      }
    },
    refetchInterval: 30000, // Auto-refetch every 30 seconds
    retry: 1, // Only retry once to avoid spam
    retryDelay: 3000, // Wait 3 seconds before retry
    staleTime: 30000, // Consider data stale after 30 seconds
    onError: (error) => {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.error("🚨 FinOps tasks query error:", error);
    },
    onSuccess: (data) => {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log(
          "�� FinOps tasks query success:",
          data?.length || 0,
          "tasks",
        );
    },
  });

  // Mutations for CRUD operations (moved here to fix reference error)
  const updateSubTaskMutation = useMutation({
    mutationFn: ({
      taskId,
      subTaskId,
      status,
      userName,
      delayReason,
      delayNotes,
      date,
    }: {
      taskId: number;
      subTaskId: string;
      status: string;
      userName?: string;
      delayReason?: string;
      delayNotes?: string;
      date?: string;
    }) =>
      apiClient.updateFinOpsSubTask(taskId, subTaskId, status, userName, date),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-finops-tasks"],
        exact: false,
      });
    },
  });

  // Track recent manual updates to avoid client-side race causing immediate auto-overdue
  const recentManualUpdates = useRef<Record<string, number>>({});
  const UPDATE_BLOCK_WINDOW = 60 * 1000; // 1 minute

  // Wrapper to mark manual updates and call mutation
  const performSubtaskUpdate = (args: {
    taskId: number;
    subTaskId: string;
    status: string;
    userName?: string;
    delayReason?: string;
    delayNotes?: string;
    date?: string;
  }) => {
    const key = `${args.taskId}-${args.subTaskId}`;
    try {
      recentManualUpdates.current[key] = Date.now();
    } catch {}
    updateSubTaskMutation.mutate(args as any);
  };

  // Real-time updates for SLA warnings and automatic status updates
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Automatic status updates for overdue tasks
      if (finopsTasks && finopsTasks.length > 0) {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.log(
            "🔄 Checking for overdue tasks at",
            now.toLocaleTimeString(),
          );

        finopsTasks.forEach((task) => {
          if (!task.subtasks) return;

          task.subtasks.forEach((subtask) => {
            // Only update pending tasks that should become overdue
            if (subtask.status === "pending" && subtask.start_time) {
              const slaWarning = getSLAWarning(
                subtask.start_time,
                subtask.status,
              );

              // If task is overdue but status is still pending, auto-update it
              if (slaWarning && slaWarning.type === "overdue") {
                if (
                  typeof window !== "undefined" &&
                  (window as any).__APP_DEBUG
                )
                  console.log(
                    `🚨 Auto-updating task ${subtask.name} from pending to overdue`,
                  );

                // Trigger status update (skip if recently manually updated)
                const key = `${task.id}-${subtask.id}`;
                const last = recentManualUpdates.current[key];
                if (last && Date.now() - last < UPDATE_BLOCK_WINDOW) {
                  if (
                    typeof window !== "undefined" &&
                    (window as any).__APP_DEBUG
                  )
                    console.log(
                      `Skipping auto-overdue for ${subtask.id} due to recent manual update`,
                    );
                } else {
                  performSubtaskUpdate({
                    taskId: task.id,
                    subTaskId: subtask.id,
                    status: "overdue",
                    userName: "System Auto-Update",
                    date: dateFilter,
                  });
                }
              }
            }
          });
        });
      }
    }, 30000); // Update every 30 seconds for faster overdue detection

    return () => clearInterval(timer);
  }, [finopsTasks, updateSubTaskMutation]);

  // Fetch FinOps clients (separate from sales leads)
  const {
    data: rawClients = [],
    isLoading: clientsLoading,
    error: clientsError,
  } = useQuery({
    queryKey: ["finops-clients"],
    queryFn: async () => {
      try {
        // Use dedicated FinOps clients API (not leads)
        const finopsClients = await apiClient.getFinOpsClients();
        return finopsClients;
      } catch (error) {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.error("❌ Error fetching FinOps clients:", error);
        // Return empty array if API fails
        return [];
      }
    },
    retry: 1, // Only retry once
    retryDelay: 3000, // Wait 3 seconds before retry
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 60000, // Auto-refetch every 60 seconds
  });

  // Deduplicate clients at the component level to prevent dropdown duplicates
  const clients = React.useMemo(() => {
    const uniqueClients = rawClients.filter(
      (client: any, index: number, arr: any[]) => {
        const clientName =
          client.company_name || client.client_name || `Client ${client.id}`;
        const firstIndex = arr.findIndex((c: any) => {
          const cName = c.company_name || c.client_name || `Client ${c.id}`;
          return cName === clientName;
        });
        return firstIndex === index;
      },
    );
    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log(
        "Raw clients count:",
        rawClients.length,
        "Unique clients count:",
        uniqueClients.length,
      );
    if (rawClients.length !== uniqueClients.length) {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.warn(
          "Duplicate clients detected and removed:",
          rawClients.length - uniqueClients.length,
          "\nDuplicates:",
          rawClients.filter((client: any, index: number) => {
            const clientName =
              client.company_name ||
              client.client_name ||
              `Client ${client.id}`;
            return !uniqueClients.some((uc: any) => {
              const ucName =
                uc.company_name || uc.client_name || `Client ${uc.id}`;
              return ucName === clientName && uc.id === client.id;
            });
          }),
        );
    }
    return uniqueClients;
  }, [rawClients]);

  // Fetch users for assignment
  const { data: users = [], error: usersError } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      try {
        return await apiClient.getUsers();
      } catch (error) {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.error("❌ Error fetching users:", error);
        return [];
      }
    },
    retry: 1,
    retryDelay: 3000,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Control refetch intervals based on error states
  useEffect(() => {
    if (error || clientsError || usersError) {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log("🚫 Errors detected, reducing refetch frequency");
      // Could implement more sophisticated error-based refetch control here
    }
  }, [error, clientsError, usersError]);

  // Mutations for CRUD operations
  const createTaskMutation = useMutation({
    mutationFn: (taskData: any) => apiClient.createFinOpsTask(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-finops-tasks"],
        exact: false,
      });
      setIsCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, taskData }: { id: number; taskData: any }) =>
      apiClient.updateFinOpsTask(id, taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-finops-tasks"],
        exact: false,
      });
      setEditingTask(null);
      setIsCreateDialogOpen(false);
      resetForm();
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteFinOpsTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-finops-tasks"],
        exact: false,
      });
    },
  });

  // FinOps client mutations
  const createFinOpsClientMutation = useMutation({
    mutationFn: (clientData: any) => apiClient.createFinOpsClient(clientData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finops-clients"] });
      setIsAddClientDialogOpen(false);
      setNewClientForm({
        company_name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
      });
    },
  });

  const resetForm = () => {
    setTaskForm({
      task_name: "",
      description: "",
      client_id: "",
      assigned_to: [], // Changed to empty array for multiple assignments
      reporting_managers: [],
      escalation_managers: [],
      effective_from: new Date().toISOString().split("T")[0],
      duration: "daily",
      weekly_days: [] as number[],
      monthly_day: null as number | null,
      is_active: true,
      subtasks: [],
    });
    // Reset search states
    setAssignedToSearch("");
    setReportingManagerSearch("");
    setEscalationManagerSearch("");
  };

  const addSubTask = () => {
    const newSubTask: ClientBasedFinOpsSubTask = {
      id: Date.now().toString(),
      name: "",
      description: "",
      start_time: "05:00",
      order_position: taskForm.subtasks.length,
      status: "pending",
    };
    setTaskForm((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, newSubTask],
    }));
  };

  const updateSubTask = (index: number, field: string, value: any) => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((subtask, i) =>
        i === index ? { ...subtask, [field]: value } : subtask,
      ),
    }));
  };

  const removeSubTask = (index: number) => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index),
    }));
  };

  const handleInlineSubTaskStatusChange = (
    taskId: number,
    subtaskId: string,
    newStatus: string,
    delayReason?: string,
    delayNotes?: string,
  ) => {
    // Find the current subtask to check its current status
    const currentTask = finopsTasks?.find((task) => task.id === taskId);
    const currentSubtask = currentTask?.subtasks?.find(
      (subtask) => subtask.id === subtaskId,
    );
    const currentStatus = currentSubtask?.status;

    // Enforce active-day rule: allow status change only on scheduled day(s)
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const today = dateFilter ? new Date(dateFilter) : new Date();
    const taskStart = currentTask?.effective_from
      ? new Date(currentTask.effective_from)
      : today;
    const isActiveToday = (() => {
      if (!currentTask) return true;
      if (currentTask.duration === "daily") return taskStart <= today;
      if (currentTask.duration === "weekly") {
        const days = weeklyDaysToNumbers((currentTask as any).weekly_days);
        if (days.length === 0) return false;
        const dayIndex = today.getDay();
        return taskStart <= today && days.includes(dayIndex);
      }
      if (currentTask.duration === "monthly") {
        const monthlyDay =
          (currentTask as any).monthly_day ??
          (currentTask.effective_from
            ? new Date(currentTask.effective_from).getDate()
            : null);
        if (!monthlyDay) return false;
        return taskStart <= today && monthlyDay === today.getDate();
      }
      return taskStart.toDateString() === today.toDateString();
    })();

    if (!isActiveToday) {
      toast({
        title: "Not scheduled today",
        description:
          "This weekly task can only be updated on its scheduled day(s).",
        variant: "destructive",
      });
      return;
    }

    // Check if status is changing FROM "overdue" TO any other status
    if (currentStatus === "overdue" && newStatus !== "overdue") {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log(
          "🚨 Status change from overdue detected, showing reason dialog",
        );

      // Store the data and show the reason dialog
      setOverdueReasonData({
        taskId,
        subtaskId,
        newStatus,
        taskName: currentTask?.task_name || "Unknown Task",
        subtaskName: currentSubtask?.name || "Unknown Subtask",
      });
      setShowOverdueReasonDialog(true);
      return; // Don't proceed with status change yet
    }

    // Proceed with normal status change
    performSubtaskUpdate({
      taskId,
      subTaskId: subtaskId,
      status: newStatus,
      userName: getUserDisplayName(user),
      delayReason,
      delayNotes,
      date: dateFilter,
    });
  };

  const submitOverdueReason = async () => {
    try {
      // Store the overdue reason in database
      await apiClient.request("/finops-production/tasks/overdue-reason", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task_id: overdueReasonData?.taskId,
          subtask_id: overdueReasonData?.subtaskId,
          reason: overdueReason,
          created_by: user?.id || 1,
          created_at: new Date().toISOString(),
        }),
      });

      // Now proceed with the status change
      if (overdueReasonData) {
        performSubtaskUpdate({
          taskId: overdueReasonData.taskId,
          subTaskId: overdueReasonData.subtaskId,
          status: overdueReasonData.newStatus,
          userName: getUserDisplayName(user),
          date: dateFilter,
        });
      }

      // Close dialog and reset
      setShowOverdueReasonDialog(false);
      setOverdueReasonData(null);
      setOverdueReason("");
    } catch (error) {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.error("Failed to submit overdue reason:", error);
      alert("Failed to submit overdue reason. Please try again.");
    }
  };

  // Force update all overdue statuses immediately
  const forceUpdateOverdueStatuses = () => {
    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log("🔧 Force updating all overdue statuses...");
    let updatedCount = 0;

    finopsTasks?.forEach((task) => {
      if (!task.subtasks) return;

      task.subtasks.forEach((subtask) => {
        if (subtask.status === "pending" && subtask.start_time) {
          const slaWarning = getSLAWarning(subtask.start_time, subtask.status);

          if (slaWarning && slaWarning.type === "overdue") {
            if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
              console.log(`🚨 Force updating ${subtask.name} to overdue`);
            updatedCount++;

            const keyManual = `${task.id}-${subtask.id}`;
            const lastManual = recentManualUpdates.current[keyManual];
            if (lastManual && Date.now() - lastManual < UPDATE_BLOCK_WINDOW) {
              if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
                console.log(
                  `Skipping force-update auto-overdue for ${subtask.id} due to recent manual update`,
                );
            } else {
              performSubtaskUpdate({
                taskId: task.id,
                subTaskId: subtask.id,
                status: "overdue",
                userName: "Manual Status Update",
                date: dateFilter,
              });
            }
          }
        }
      });
    });

    if (updatedCount === 0) {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log("✅ No overdue tasks found that need status updates");
    } else {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log(`✅ Force updated ${updatedCount} tasks to overdue status`);
    }
  };

  const toggleTaskExpansion = (taskId: number) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const getTimeSinceStart = (startTime: string) => {
    if (!startTime || typeof startTime !== "string") return "N/A";

    const [hours, minutes] = startTime.split(":").map(Number);
    const taskStartTime = new Date();
    taskStartTime.setHours(hours, minutes, 0, 0);

    const diffMs = currentTime.getTime() - taskStartTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 0) {
      const remaining = Math.abs(diffMinutes);
      // Show "need to start" when within 15 minutes of start time
      if (remaining <= 15) {
        return "need to start";
      }
      const h = Math.floor(remaining / 60);
      const m = remaining % 60;
      return h > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${m}m`;
    } else if (diffMinutes <= 15) {
      // Show "need to start" for the first 15 minutes after start time
      return "need to start";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}h ${diffMinutes % 60}m ago`;
    }
  };

  const getTimeSinceStartStrict = (startTime: string) => {
    if (!startTime || typeof startTime !== "string") return "";

    const [hours, minutes] = startTime.split(":").map(Number);
    const taskStartTime = new Date();
    taskStartTime.setHours(hours, minutes, 0, 0);

    const diffMs = currentTime.getTime() - taskStartTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 0) {
      const remaining = Math.abs(diffMinutes);
      const h = Math.floor(remaining / 60);
      const m = remaining % 60;
      return h > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${m}m`;
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;
    return `${h}h ${m}m ago`;
  };

  const getSLAWarning = (startTime: string, status: string) => {
    if (status === "completed" || !startTime || typeof startTime !== "string")
      return null;

    const [hours, minutes] = startTime.split(":").map(Number);
    const taskStartTime = new Date();
    taskStartTime.setHours(hours, minutes, 0, 0);

    // Calculate time difference from start time (not SLA deadline)
    const diffMs = currentTime.getTime() - taskStartTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log(`⏰ SLA check for task starting at ${startTime}:`, {
        taskStartTime: taskStartTime.toLocaleTimeString(),
        currentTime: currentTime.toLocaleTimeString(),
        diffMinutes,
        status,
      });

    // Task is overdue if it's past start time (for both pending and overdue status)
    if (diffMinutes > 0 && (status === "pending" || status === "overdue")) {
      return {
        type: "overdue",
        message: `Overdue by ${diffMinutes} min`,
      };
    }
    // SLA warning if within 15 minutes of start time (and still pending)
    else if (diffMinutes >= -15 && diffMinutes <= 0 && status === "pending") {
      const remainingMinutes = Math.abs(diffMinutes);
      return {
        type: "warning",
        message: `SLA Warning - ${remainingMinutes} min remaining`,
      };
    }

    return null;
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setTaskForm((prev) => {
        const oldIndex = prev.subtasks.findIndex(
          (item) => item.id === active.id,
        );
        const newIndex = prev.subtasks.findIndex(
          (item) => item.id === over?.id,
        );

        const reorderedSubtasks = arrayMove(prev.subtasks, oldIndex, newIndex);

        const updatedItems = reorderedSubtasks.map((item, index) => ({
          ...item,
          order_position: index,
        }));

        return { ...prev, subtasks: updatedItems };
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that at least one assignee is selected
    if (taskForm.assigned_to.length === 0) {
      alert("Please select at least one assignee for this task.");
      return;
    }

    const selectedClientData = clients.find(
      (c: any) => c.id.toString() === taskForm.client_id,
    );

    const taskData = {
      ...taskForm,
      assigned_to: taskForm.assigned_to.map(extractNameFromValue),
      reporting_managers: taskForm.reporting_managers.map(extractNameFromValue),
      escalation_managers:
        taskForm.escalation_managers.map(extractNameFromValue),
      client_name: selectedClientData?.company_name || "",
      created_by: user?.id || 1,
    };

    if (editingTask) {
      updateTaskMutation.mutate({ id: editingTask.id, taskData });
    } else {
      createTaskMutation.mutate(taskData);
    }
  };

  // Check if user can edit a task (full edit permissions)
  const canEditTask = (task: ClientBasedFinOpsTask): boolean => {
    // Admin can edit any task
    if (user?.role === "admin") {
      return true;
    }
    console.log("USER ROLE", user.name);
    // Creator can edit their own task
    if (
      task.created_by === user?.id?.toString() ||
      task.created_by === user?.name
    ) {
      return true;
    }

    // Assigned users can edit the task
    const userName = user.name;
    const userEmail = user?.email;

    // Check assigned users
    if (Array.isArray(task.assigned_to)) {
      const isAssigned = task.assigned_to.some(
        (assignee) =>
          extractNameFromValue(assignee) === userName ||
          assignee.includes(userEmail || ""),
      );
      if (isAssigned) return true;
    } else if (task.assigned_to) {
      const assignedName = extractNameFromValue(task.assigned_to);
      if (
        assignedName === userName ||
        task.assigned_to.includes(userEmail || "")
      ) {
        return true;
      }
    }

    // Reporting managers can edit
    if (Array.isArray(task.reporting_managers)) {
      const isReportingManager = task.reporting_managers.some(
        (manager) =>
          extractNameFromValue(manager) === userName ||
          manager.includes(userEmail || ""),
      );
      if (isReportingManager) return true;
    }

    // Escalation managers can edit
    if (Array.isArray(task.escalation_managers)) {
      const isEscalationManager = task.escalation_managers.some(
        (manager) =>
          extractNameFromValue(manager) === userName ||
          manager.includes(userEmail || ""),
      );
      if (isEscalationManager) return true;
    }

    return false;
  };

  // Check if user can only change status (not full edit)
  const canChangeStatusOnly = (task: ClientBasedFinOpsTask): boolean => {
    if (canEditTask(task)) return false; // Already has full edit permission

    // Any user involved in the task can change status
    const userName = `${user?.first_name} ${user?.last_name}`;
    const userEmail = user?.email;

    // Check if user is mentioned anywhere in the task
    const allInvolvedUsers = [
      ...(Array.isArray(task.assigned_to)
        ? task.assigned_to
        : [task.assigned_to].filter(Boolean)),
      ...task.reporting_managers,
      ...task.escalation_managers,
    ];

    const isInvolved = allInvolvedUsers.some(
      (person) =>
        person &&
        (extractNameFromValue(person) === userName ||
          person.includes(userEmail || "")),
    );

    return isInvolved;
  };

  const startEditing = (task: ClientBasedFinOpsTask) => {
    // Check permissions before allowing edit
    if (!canEditTask(task)) {
      alert(
        "You do not have permission to edit this task. Only the creator, assigned users, reporting managers, escalation managers, and admins can edit tasks.",
      );
      return;
    }
    setEditingTask(task);
    setTaskForm({
      task_name: task.task_name || "",
      description: task.description || "",
      client_id: task.client_id?.toString() || "",
      assigned_to: (() => {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.log(
            "🔍 Edit form - raw task.assigned_to:",
            JSON.stringify(task.assigned_to),
          );

        let assignedArray = [];

        if (Array.isArray(task.assigned_to)) {
          assignedArray = task.assigned_to;
        } else if (task.assigned_to) {
          // Extract and parse the assigned_to value
          const extracted = extractNameFromValue(task.assigned_to);
          if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
            console.log(
              "🔄 Edit form - after extractNameFromValue:",
              extracted,
            );

          // Check if it contains comma-separated names
          if (
            extracted.includes('","') ||
            extracted.includes('", "') ||
            extracted.includes(",")
          ) {
            // Split by various comma patterns and clean up
            assignedArray = extracted
              .split(/,\s*"?|",\s*"?|"\s*,\s*"?/)
              .map((name) => name.replace(/^"|"$/g, "").trim())
              .filter((name) => name.length > 0);
            if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
              console.log("��� Edit form - split names:", assignedArray);
          } else {
            // Single name
            assignedArray = [extracted];
          }
        }

        const result = assignedArray.map((name) =>
          convertNameToValueFormat(extractNameFromValue(name), users),
        );
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.log("✅ Edit form - final assigned_to array:", result);
        return result;
      })(),
      reporting_managers: (task.reporting_managers || []).map((name) =>
        convertNameToValueFormat(extractNameFromValue(name), users),
      ),
      escalation_managers: (task.escalation_managers || []).map((name) =>
        convertNameToValueFormat(extractNameFromValue(name), users),
      ),
      effective_from: task.effective_from
        ? new Date(task.effective_from).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      duration: task.duration || "daily",
      weekly_days: (() => {
        const raw = (task as any).weekly_days;
        if (!raw) return [] as number[];
        if (Array.isArray(raw)) {
          return raw
            .map((d: any) => {
              if (typeof d === "number") return d;
              const s = String(d).toLowerCase().trim();
              const dayMap: Record<string, number> = {
                sunday: 0,
                monday: 1,
                tuesday: 2,
                wednesday: 3,
                thursday: 4,
                friday: 5,
                saturday: 6,
              };
              if (/^\d+$/.test(s)) return Number(s);
              if (s in dayMap) return dayMap[s];
              return null;
            })
            .filter((n: any) => n !== null) as number[];
        }
        return [] as number[];
      })(),
      monthly_day: (task as any).monthly_day ?? null,
      is_active: task.is_active ?? true,
      subtasks: (task.subtasks || []).map((subtask) => ({
        ...subtask,
        name: subtask.name || "",
        description: subtask.description || "",
        start_time: subtask.start_time || "05:00",
      })),
    });
    setIsCreateDialogOpen(true);
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    createFinOpsClientMutation.mutate({
      ...newClientForm,
      created_by: user?.id || 1,
    });
  };

  // Filter tasks based on client, status, search, and date
  let filteredTasks = finopsTasks.filter((task: ClientBasedFinOpsTask) => {
    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log("Processing task:", task.task_name, "for filtering");
    // Client filter from summary (takes priority)
    if (selectedClientFromSummary) {
      if (task.client_name !== selectedClientFromSummary) return false;
    } else {
      // Regular client filter
      if (selectedClient !== "all") {
        if (selectedClient === "unknown") {
          if (
            task.client_id &&
            task.client_name &&
            task.client_name !== "Unknown Client"
          )
            return false;
        } else {
          if (task.client_id?.toString() !== selectedClient) return false;
        }
      }
    }

    // Status filter - filter by subtask status, not task status
    if (statusFilter !== "all") {
      // Check if any subtask has the selected status
      const hasSubtaskWithStatus =
        task.subtasks && task.subtasks.length > 0
          ? task.subtasks.some((subtask) => subtask.status === statusFilter)
          : false;

      // Only include task if it has at least one subtask with the selected status
      if (!hasSubtaskWithStatus) return false;
    }

    // Search filter
    if (
      searchTerm &&
      !task.task_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !task.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false;

    // Date filter for daily tasks (always enabled)
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      const taskDate = new Date(task.effective_from);

      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log("Date filtering:", {
          filterDate: filterDate.toDateString(),
          taskDate: taskDate.toDateString(),
          taskName: task.task_name,
          duration: task.duration,
          effective_from: task.effective_from,
        });

      // Determine if task is active on the selected date (supports weekly days)
      const dayNames = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const isActiveOnDate = (() => {
        if (task.duration === "daily") {
          return taskDate <= filterDate;
        }
        if (task.duration === "weekly") {
          const days = weeklyDaysToNumbers((task as any).weekly_days);
          if (days.length === 0) return false;
          const dayIndex = filterDate.getDay();
          return taskDate <= filterDate && days.includes(dayIndex);
        }
        if (task.duration === "monthly") {
          const monthlyDay =
            (task as any).monthly_day ??
            (task.effective_from
              ? new Date(task.effective_from).getDate()
              : null);
          if (!monthlyDay) return false;
          return taskDate <= filterDate && monthlyDay === filterDate.getDate();
        }
        return taskDate.toDateString() === filterDate.toDateString();
      })();
      if (!isActiveOnDate) {
        if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
          console.log("Filtering out task - not active on selected date");
        return false;
      }
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log("Task passed date filter");
    }

    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log("Task passed all filters:", task.task_name);
    return true;
  });
  // Normalize username/email
  const normalize = (value: string) =>
    (value || "").toLowerCase().replace(/\s+/g, " ").trim();

  const normalizedUserName = normalize(user?.name || user?.email || "");

  const isAdmin =
    user?.role === "admin" ||
    (!!user?.department_admin &&
      String(user?.admin_for_department || "").toLowerCase() === "finops");

  // Role-based visibility: non-admins see only tasks where they are assigned_to, reporting manager, or escalation manager
  if (!isAdmin) {
    filteredTasks = filteredTasks.filter((task: ClientBasedFinOpsTask) => {
      const allInvolvedUsers = [
        ...(Array.isArray(task.assigned_to)
          ? task.assigned_to
          : [task.assigned_to].filter(Boolean)),
        ...(Array.isArray(task.reporting_managers)
          ? task.reporting_managers
          : []),
        ...(Array.isArray(task.escalation_managers)
          ? task.escalation_managers
          : []),
      ];
      return allInvolvedUsers.some((person) => {
        if (!person) return false;
        const name = extractNameFromValue(person);
        const normalized = normalize(name);
        return (
          normalized === normalizedUserName ||
          (typeof person === "string" && person.includes(user?.email || ""))
        );
      });
    });
  }

  // <-- Add this here, after filteredTasks is available -->
  const canCreateTask =
    isAdmin ||
    filteredTasks.some(
      (task) =>
        (Array.isArray(task.reporting_managers) &&
          task.reporting_managers
            .map(normalize)
            .includes(normalizedUserName)) ||
        (Array.isArray(task.escalation_managers) &&
          task.escalation_managers.map(normalize).includes(normalizedUserName)),
    );

  if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
    console.log(
      "Total tasks:",
      finopsTasks.length,
      "Filtered tasks:",
      filteredTasks.length,
    );

  // Overdue direct-call timers (seconds remaining per task)
  const [overdueTimers, setOverdueTimers] = useState<Record<number, number>>(
    {},
  );

  // Initialize timers for overdue tasks when filteredTasks change (use persisted next-call)
  useEffect(() => {
    const initial: Record<number, number> = { ...overdueTimers };

    filteredTasks.forEach((task: ClientBasedFinOpsTask) => {
      const hasOverdue = (task.subtasks || []).some(
        (st) => st.status === "overdue",
      );
      const key = `finops_next_call_${task.id}`;
      if (hasOverdue) {
        const stored =
          typeof window !== "undefined" ? localStorage.getItem(key) : null;
        if (stored) {
          const nextMs = parseInt(stored, 10);
          const diff = Math.max(0, Math.ceil((nextMs - Date.now()) / 1000));
          initial[task.id] = !isNaN(diff) ? diff : 15 * 60;
        } else {
          const next = Date.now() + 15 * 60 * 1000;
          try {
            if (typeof window !== "undefined")
              localStorage.setItem(key, String(next));
          } catch {}
          initial[task.id] = 15 * 60;
        }
      } else {
        if (initial[task.id]) delete initial[task.id];
        try {
          if (typeof window !== "undefined") localStorage.removeItem(key);
        } catch {}
      }
    });
    setOverdueTimers(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks]);

  // Countdown interval
  useEffect(() => {
    const interval = setInterval(() => {
      setOverdueTimers((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((k) => {
          const id = Number(k);
          updated[id] = Math.max(0, (updated[id] || 0) - 1);
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Trigger direct-call when timer reaches 0
  useEffect(() => {
    Object.entries(overdueTimers).forEach(async ([taskIdStr, seconds]) => {
      const taskId = Number(taskIdStr);
      if (seconds === 0) {
        const task = filteredTasks.find((t) => t.id === taskId);
        if (!task) return;
        (task.subtasks || [])
          .filter((st) => st.status === "overdue")
          .forEach(async (subtask) => {
            try {
              const title = `Kindly take prompt action on the overdue subtask ${subtask.name} from the task ${task.task_name} for the client ${task.client_name || "Unknown Client"}.`;
              try {
                await apiClient.sendFinOpsManualAlert(
                  task.id,
                  subtask.id,
                  "sla_overdue",
                  title,
                );
              } catch {}
            } catch (err) {
              if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
                console.warn(
                  "Failed to trigger direct-call for overdue subtask:",
                  err,
                );
            }
          });
        // schedule next call 15 minutes from now and persist
        const nextMs = Date.now() + 15 * 60 * 1000;
        try {
          if (typeof window !== "undefined")
            localStorage.setItem(`finops_next_call_${taskId}`, String(nextMs));
        } catch {}
        // reset timer
        setOverdueTimers((prev) => ({ ...prev, [taskId]: 15 * 60 }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdueTimers]);

  // End timers setup

  if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
    console.log(filteredTasks.length, "Date filter:", dateFilter);

  // Calculate summary statistics
  const getOverallSummary = () => {
    const summary = {
      total_tasks: filteredTasks.length,
      total_subtasks: 0,
      completed_tasks: 0,
      delayed_tasks: 0,
      overdue_tasks: 0,
      // Added counts
      pending_tasks: 0,
      in_progress_tasks: 0,
      completed_subtasks: 0,
      delayed_subtasks: 0,
      overdue_subtasks: 0,
      pending_subtasks: 0,
      in_progress_subtasks: 0,
    };

    filteredTasks.forEach((task: ClientBasedFinOpsTask) => {
      summary.total_subtasks += task.subtasks?.length || 0;
      if (task.status === "completed") summary.completed_tasks++;
      if (task.status === "delayed") summary.delayed_tasks++;
      if (task.status === "overdue") summary.overdue_tasks++;
      if (task.status === "pending") summary.pending_tasks++;
      if (task.status === "in_progress") summary.in_progress_tasks++;

      task.subtasks?.forEach((subtask) => {
        if (subtask.status === "completed") summary.completed_subtasks++;
        if (subtask.status === "delayed") summary.delayed_subtasks++;
        if (subtask.status === "overdue") summary.overdue_subtasks++;
        if (subtask.status === "pending") summary.pending_subtasks++;
        if (subtask.status === "in_progress") summary.in_progress_subtasks++;
      });
    });

    return summary;
  };

  // Get client-wise summary
  const getClientSummary = () => {
    const clientSummary: { [key: string]: any } = {};

    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log("Filtered tasks for client summary:", filteredTasks);

    filteredTasks.forEach((task: ClientBasedFinOpsTask) => {
      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log(
          "Processing task:",
          task.task_name,
          "Client:",
          task.client_name,
          "Client ID:",
          task.client_id,
        );

      // Resolve client name with proper fallback logic
      let clientName = "Unknown Client";

      if (
        task.client_name &&
        task.client_name !== "" &&
        task.client_name !== "undefined"
      ) {
        // Use the client_name if available and valid
        clientName = task.client_name;
      } else if (task.client_id) {
        // Look up client by ID in the clients array
        const foundClient = clients.find(
          (c: any) => c.id.toString() === task.client_id.toString(),
        );
        if (foundClient) {
          clientName =
            foundClient.company_name ||
            foundClient.client_name ||
            `Client ${foundClient.id}`;
        } else {
          clientName = `Client ${task.client_id}`;
        }
      }

      if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
        console.log(
          `📝 Task "${task.task_name}" -> Client: "${clientName}" (ID: ${task.client_id})`,
        );

      if (!clientSummary[clientName]) {
        clientSummary[clientName] = {
          total_tasks: 0,
          total_subtasks: 0,
          completed_subtasks: 0,
          delayed_subtasks: 0,
          overdue_subtasks: 0,
          // New per-client counts
          pending_subtasks: 0,
          in_progress_subtasks: 0,
        };
      }

      clientSummary[clientName].total_tasks++;
      clientSummary[clientName].total_subtasks += task.subtasks?.length || 0;

      task.subtasks?.forEach((subtask) => {
        if (subtask.status === "completed")
          clientSummary[clientName].completed_subtasks++;
        if (subtask.status === "delayed")
          clientSummary[clientName].delayed_subtasks++;
        if (subtask.status === "overdue")
          clientSummary[clientName].overdue_subtasks++;
        if (subtask.status === "pending")
          clientSummary[clientName].pending_subtasks++;
        if (subtask.status === "in_progress")
          clientSummary[clientName].in_progress_subtasks++;
      });
    });

    if (typeof window !== "undefined" && (window as any).__APP_DEBUG)
      console.log("Client summary result:", clientSummary);
    return clientSummary;
  };

  const overallSummary = getOverallSummary();
  const clientSummary = getClientSummary();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return CheckCircle;
      case "in_progress":
        return PlayCircle;
      case "delayed":
        return Clock;
      case "overdue":
        return AlertTriangle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-100";
      case "in_progress":
        return "text-blue-600 bg-blue-100";
      case "delayed":
        return "text-yellow-600 bg-yellow-100";
      case "overdue":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Summary Cards */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              FinOps Daily Process -{" "}
              {format(new Date(dateFilter), "MMM d, yyyy")}
            </h2>
            <p className="text-gray-600 mt-1">
              Daily process tracking and task execution monitoring for the
              selected date
            </p>
          </div>
        </div>
        {/* Real-time Status and Buttons (side-by-side, separate outlines) */}
        <div className="mt-2 flex items-center justify-between">
          {/* 🕒 Left: Status box with its own border */}
          <div className="text-xs text-gray-600 bg-gray-50 px-3 py-1 rounded border inline-block">
            🕒 Auto-Status Updates: Every 30s | Current Time:{" "}
            {currentTime.toLocaleTimeString()} |{" "}
            {finopsTasks?.reduce(
              (acc, task) =>
                acc +
                (task.subtasks?.filter(
                  (st) => st.status === "pending" && st.start_time,
                ).length || 0),
              0,
            )}{" "}
            pending tasks monitored
          </div>

          {/* 🎯 Right: Action buttons (normal size, outside the box) */}
          <div className="flex gap-2 ml-4 items-center">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  // Build workbook
                  const wb = XLSX.utils.book_new();

                  // Summary sheet - prefer authoritative server summary when available
                  const summaryHeaders = [
                    "Total Task",
                    "Total Subtasks",
                    "Completed",
                    "Delayed",
                    "Overdue",
                    "Active Clients",
                    "Pending",
                    "In-Progress",
                  ];

                  // Fetch authoritative data from server once (tasks + summary)
                  let serverResp: any = null;
                  try {
                    serverResp =
                      await apiClient.getFinOpsDailyTasks(dateFilter);
                  } catch (err) {
                    console.warn(
                      "Failed to fetch daily tasks from server for export:",
                      err,
                    );
                  }

                  const serverSummary: any =
                    serverResp && serverResp.summary
                      ? serverResp.summary
                      : null;
                  const tasksForExport: any[] =
                    serverResp && Array.isArray(serverResp.tasks)
                      ? serverResp.tasks
                      : filteredTasks;

                  const summaryRow = serverSummary
                    ? [
                        serverSummary.total_tasks ?? 0,
                        serverSummary.total_subtasks ?? 0,
                        serverSummary.completed_subtasks ?? 0,
                        serverSummary.delayed_subtasks ?? 0,
                        serverSummary.overdue_subtasks ?? 0,
                        Object.keys(clientSummary).length,
                        serverSummary.pending_subtasks ?? 0,
                        serverSummary.in_progress_subtasks ?? 0,
                      ]
                    : [
                        overallSummary.total_tasks,
                        overallSummary.total_subtasks,
                        overallSummary.completed_subtasks,
                        overallSummary.delayed_subtasks,
                        overallSummary.overdue_subtasks,
                        Object.keys(clientSummary).length,
                        overallSummary.pending_subtasks,
                        overallSummary.in_progress_subtasks,
                      ];

                  const wsSummary = XLSX.utils.aoa_to_sheet([
                    summaryHeaders,
                    summaryRow,
                  ]);
                  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

                  // Build client sheets based on server data
                  const clientNames = Array.from(
                    new Set(
                      tasksForExport.map(
                        (t: any) =>
                          t.client_name ||
                          (t.client_id
                            ? `Client ${t.client_id}`
                            : "Unknown Client"),
                      ),
                    ),
                  );

                  clientNames.forEach((clientName: string) => {
                    const rows: any[] = [];
                    rows.push([
                      "Task name",
                      "Sub task Name",
                      "Client name",
                      "Period",
                      "start time",
                      "completed time",
                      "status",
                      "completed_by",
                      "approved_by",
                      "assigned_to",
                      "Reporting manager",
                      "Escalation manager",
                      "Reason",
                    ]);

                    tasksForExport.forEach((task: any) => {
                      const tClientName =
                        task.client_name ||
                        (task.client_id
                          ? `Client ${task.client_id}`
                          : "Unknown Client");
                      if ((tClientName || "").toString() !== clientName) return;
                      const period = task.duration || "daily";
                      (task.subtasks || []).forEach((st: any) => {
                        rows.push([
                          task.task_name || "",
                          st.name || "",
                          clientName,
                          period,
                          st.start_time || "",
                          formatDateTime(st.completed_at) || "",
                          st.status || "",
                          extractNameFromValue(
                            st.completed_by ||
                              st.completedBy ||
                              st.completed_by ||
                              "",
                          ),
                          extractNameFromValue(
                            st.approved_by || st.approvedBy || "",
                          ),
                          Array.isArray(task.assigned_to)
                            ? task.assigned_to.join(", ")
                            : task.assigned_to || "",
                          Array.isArray(task.reporting_managers)
                            ? task.reporting_managers.join(", ")
                            : task.reporting_managers || "",
                          Array.isArray(task.escalation_managers)
                            ? task.escalation_managers.join(", ")
                            : task.escalation_managers || "",
                          st.delay_reason || st.delay_notes || "",
                        ]);
                      });
                    });

                    const ws = XLSX.utils.aoa_to_sheet(rows);
                    const safeName = (clientName || "Client")
                      .toString()
                      .slice(0, 31);
                    XLSX.utils.book_append_sheet(wb, ws, safeName || "Client");
                  });

                  // Client Summary built from server data
                  const clientSummaryRows: any[] = [];
                  clientSummaryRows.push([
                    "Client Name",
                    "Total Tasks",
                    "Total Subtasks",
                    "Completed Subtasks",
                    "Delayed Subtasks",
                    "Overdue Subtasks",
                    "Pending Subtasks",
                    "In-Progress Subtasks",
                  ]);

                  const clientAgg: Record<string, any> = {};
                  tasksForExport.forEach((task: any) => {
                    const name =
                      task.client_name ||
                      (task.client_id
                        ? `Client ${task.client_id}`
                        : "Unknown Client");
                    if (!clientAgg[name])
                      clientAgg[name] = {
                        total_tasks: 0,
                        total_subtasks: 0,
                        completed_subtasks: 0,
                        delayed_subtasks: 0,
                        overdue_subtasks: 0,
                        pending_subtasks: 0,
                        in_progress_subtasks: 0,
                      };
                    clientAgg[name].total_tasks += 1;
                    clientAgg[name].total_subtasks += (
                      task.subtasks || []
                    ).length;
                    (task.subtasks || []).forEach((st: any) => {
                      if (st.status === "completed")
                        clientAgg[name].completed_subtasks++;
                      if (st.status === "delayed")
                        clientAgg[name].delayed_subtasks++;
                      if (st.status === "overdue")
                        clientAgg[name].overdue_subtasks++;
                      if (st.status === "pending")
                        clientAgg[name].pending_subtasks++;
                      if (st.status === "in_progress")
                        clientAgg[name].in_progress_subtasks++;
                    });
                  });

                  Object.entries(clientAgg).forEach(([cName, sum]: any) => {
                    clientSummaryRows.push([
                      cName,
                      sum.total_tasks || 0,
                      sum.total_subtasks || 0,
                      sum.completed_subtasks || 0,
                      sum.delayed_subtasks || 0,
                      sum.overdue_subtasks || 0,
                      sum.pending_subtasks || 0,
                      sum.in_progress_subtasks || 0,
                    ]);
                  });

                  const wsClient = XLSX.utils.aoa_to_sheet(clientSummaryRows);
                  XLSX.utils.book_append_sheet(wb, wsClient, "Client Summary");

                  // Status Summary built from server data
                  const statusSummaryRows: any[] = [];
                  statusSummaryRows.push(["Status", "Count"]);
                  const statusCounts: Record<string, number> = {
                    completed: 0,
                    in_progress: 0,
                    pending: 0,
                    delayed: 0,
                    overdue: 0,
                  };
                  tasksForExport.forEach((task: any) => {
                    (task.subtasks || []).forEach((st: any) => {
                      statusCounts[st.status] =
                        (statusCounts[st.status] || 0) + 1;
                    });
                  });

                  Object.entries(statusCounts).forEach(([status, cnt]) => {
                    statusSummaryRows.push([status, cnt]);
                  });

                  const wsStatus = XLSX.utils.aoa_to_sheet(statusSummaryRows);
                  XLSX.utils.book_append_sheet(wb, wsStatus, "Status Summary");

                  const wbout = XLSX.write(wb, {
                    bookType: "xlsx",
                    type: "array",
                  });
                  const blob = new Blob([wbout], {
                    type: "application/octet-stream",
                  });
                  saveAs(blob, `finops-daily-process-${dateFilter}.xlsx`);
                } catch (err) {
                  console.error("Failed to export Excel:", err);
                }
              }}
            >
              Export Excel
            </Button>
            {/* Admin buttons */}
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    // Seed tracker logic
                  }}
                >
                  Seed Daily Tracker
                </Button>

                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Task
                </Button>
              </>
            )}

            {/* Reporting/Escalation managers */}
            {!isAdmin && canCreateTask && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Task
              </Button>
            )}
          </div>
        </div>

        {/* Database Status Alert */}
        {(error || clientsError || usersError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Database Connection Issue:</strong> Unable to connect to
              the database. Task management features may be limited. Please
              ensure PostgreSQL is running.
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer">Error Details</summary>
                <div className="mt-1 space-y-1">
                  {error && <div>• Tasks API: Connection failed</div>}
                  {clientsError && <div>• Clients API: Connection failed</div>}
                  {usersError && <div>• Users API: Connection failed</div>}
                </div>
              </details>
            </AlertDescription>
          </Alert>
        )}

        {/* Overall Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {overallSummary.total_tasks}
              </div>
              <div className="text-xs text-gray-600">Total Tasks</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {overallSummary.total_subtasks}
              </div>
              <div className="text-xs text-gray-600">Total Subtasks</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {overallSummary.completed_subtasks}
              </div>
              <div className="text-xs text-gray-600">Completed</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {overallSummary.delayed_subtasks}
              </div>
              <div className="text-xs text-gray-600">Delayed</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">
                {overallSummary.overdue_subtasks}
              </div>
              <div className="text-xs text-gray-600">Overdue</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-indigo-600">
                {overallSummary.pending_subtasks}
              </div>
              <div className="text-xs text-gray-600">Pending</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {overallSummary.in_progress_subtasks}
              </div>
              <div className="text-xs text-gray-600">In-Progress</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Object.keys(clientSummary).length}
              </div>
              <div className="text-xs text-gray-600">Active Clients</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[150px]">
              <Label>Date</Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="font-medium"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label>Search Tasks</Label>
              <Input
                placeholder="Search by task name or client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="min-w-[150px]">
              <Label>Filter by Client</Label>
              <Select
                value={
                  selectedClientFromSummary
                    ? "summary-selected"
                    : selectedClient
                }
                onValueChange={
                  selectedClientFromSummary ? undefined : setSelectedClient
                }
                disabled={!!selectedClientFromSummary}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedClientFromSummary
                        ? `Selected: ${selectedClientFromSummary}`
                        : "Select client"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.length > 0 ? (
                    clients.map((client: any) => (
                      <SelectItem
                        key={`filter-client-${client.id}`}
                        value={client.id.toString()}
                      >
                        {client.company_name ||
                          client.client_name ||
                          `Client ${client.id}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-clients" disabled>
                      No clients available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {selectedClientFromSummary && (
                <p className="text-xs text-blue-600 mt-1">
                  Client selected from summary above
                </p>
              )}
            </div>

            <div className="min-w-[150px]">
              <Label>Filter by Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In-Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client-wise Summary */}
      {filteredTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Daily Process Summary by Client
              <Badge variant="outline" className="ml-2">
                {format(new Date(dateFilter), "MMM d, yyyy")}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(clientSummary).length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Client Data Available
                </h3>
                <p className="text-gray-600 mb-4">
                  Tasks exist but client information is not properly configured.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["clients"] });
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Client Data
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                {Object.entries(clientSummary).map(
                  ([clientName, summary]: [string, any]) => (
                    <div
                      key={clientName}
                      className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                        selectedClientFromSummary === clientName
                          ? "bg-blue-50 border-blue-300 shadow-md"
                          : "bg-gray-50 hover:bg-gray-100"
                      }`}
                      onClick={() => {
                        if (selectedClientFromSummary === clientName) {
                          setSelectedClientFromSummary(null);
                        } else {
                          setSelectedClientFromSummary(clientName);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">{clientName}</h4>
                        {selectedClientFromSummary === clientName && (
                          <Badge variant="secondary" className="text-xs">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold text-blue-600">
                            {summary.total_tasks}
                          </div>
                          <div className="text-xs text-gray-600">Tasks</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-gray-900">
                            {summary.total_subtasks}
                          </div>
                          <div className="text-xs text-gray-600">Subtasks</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-600">
                            {summary.completed_subtasks}
                          </div>
                          <div className="text-xs text-gray-600">Done</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-yellow-600">
                            {summary.delayed_subtasks}
                          </div>
                          <div className="text-xs text-gray-600">Delayed</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-red-600">
                            {summary.overdue_subtasks}
                          </div>
                          <div className="text-xs text-gray-600">Overdue</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-indigo-600">
                            {summary.pending_subtasks}
                          </div>
                          <div className="text-xs text-gray-600">Pending</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-600">
                            {summary.in_progress_subtasks}
                          </div>
                          <div className="text-xs text-gray-600">
                            In-Progress
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 text-center">
                        Click to{" "}
                        {selectedClientFromSummary === clientName
                          ? "show all"
                          : "filter"}{" "}
                        tasks
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      {selectedClientFromSummary && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  Showing tasks for:{" "}
                  <strong>{selectedClientFromSummary}</strong>
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedClientFromSummary(null)}
                className="text-blue-600 border-blue-300 hover:bg-blue-100"
              >
                <X className="w-3 h-3 mr-1" />
                Show All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>Loading tasks...</p>
            </CardContent>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Target className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Tasks Found
              </h3>
              <p className="text-gray-600 mb-4">
                {finopsTasks.length === 0
                  ? "Create your first task to get started."
                  : "No tasks match your current filters."}
              </p>
              {finopsTasks.length === 0 && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Task
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task: ClientBasedFinOpsTask) => {
            const completedSubtasks =
              task.subtasks?.filter((st) => st.status === "completed").length ||
              0;
            const totalSubtasks = task.subtasks?.length || 0;
            const delayedSubtasks =
              task.subtasks?.filter((st) => st.status === "delayed").length ||
              0;
            const overdueSubtasks =
              task.subtasks?.filter((st) => st.status === "overdue").length ||
              0;

            const taskStatus =
              overdueSubtasks > 0
                ? "overdue"
                : delayedSubtasks > 0
                  ? "delayed"
                  : completedSubtasks === totalSubtasks && totalSubtasks > 0
                    ? "completed"
                    : completedSubtasks > 0
                      ? "in_progress"
                      : "pending";
            const StatusIcon = getStatusIcon(taskStatus);

            return (
              <Card key={task.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg break-words">
                          {task.task_name}
                        </CardTitle>
                        {task.client_name &&
                          task.client_name !== "Unknown Client" && (
                            <Badge variant="outline" className="text-blue-600">
                              {task.client_name}
                            </Badge>
                          )}
                        <Badge
                          variant={task.is_active ? "default" : "secondary"}
                        >
                          {task.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge className={getStatusColor(taskStatus)}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {taskStatus.charAt(0).toUpperCase() +
                            taskStatus.slice(1).replace("_", " ")}
                        </Badge>
                      </div>
                      <CardDescription className="break-words whitespace-pre-wrap">
                        {task.description}
                      </CardDescription>

                      <div className="flex items-center gap-6 mt-3 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>
                            Assigned:{" "}
                            {(() => {
                              if (
                                typeof window !== "undefined" &&
                                (window as any).__APP_DEBUG
                              )
                                console.log(
                                  "🔍 Raw task.assigned_to:",
                                  JSON.stringify(task.assigned_to),
                                );

                              // Handle various formats of assigned_to
                              let assignedArray = [];

                              if (Array.isArray(task.assigned_to)) {
                                if (
                                  typeof window !== "undefined" &&
                                  (window as any).__APP_DEBUG
                                )
                                  console.log(
                                    "✅ Already an array:",
                                    task.assigned_to,
                                  );
                                assignedArray = task.assigned_to;
                              } else if (task.assigned_to) {
                                // First try to extract using our helper function
                                const extracted = extractNameFromValue(
                                  task.assigned_to,
                                );
                                if (
                                  typeof window !== "undefined" &&
                                  (window as any).__APP_DEBUG
                                )
                                  console.log(
                                    "🔄 After extractNameFromValue:",
                                    extracted,
                                  );

                                // Check if the result looks like multiple names separated by comma
                                if (
                                  extracted.includes('","') ||
                                  extracted.includes('", "') ||
                                  extracted.includes(",")
                                ) {
                                  // Split by various comma patterns
                                  const splitNames = extracted
                                    .split(/,\s*"?|",\s*"?|"\s*,\s*"?/)
                                    .map((name) =>
                                      name.replace(/^"|"$/g, "").trim(),
                                    )
                                    .filter((name) => name.length > 0);
                                  if (
                                    typeof window !== "undefined" &&
                                    (window as any).__APP_DEBUG
                                  )
                                    console.log("🔄 Split names:", splitNames);
                                  assignedArray = splitNames;
                                } else {
                                  // Single name
                                  assignedArray = [extracted];
                                }
                              }

                              const result =
                                assignedArray.length > 0
                                  ? assignedArray
                                      .map((name) => extractNameFromValue(name))
                                      .join(", ")
                                  : "Unassigned";

                              if (
                                typeof window !== "undefined" &&
                                (window as any).__APP_DEBUG
                              )
                                console.log("��� Final result:", result);
                              return result;
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{task.duration}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Activity className="w-4 h-4" />
                          <span>
                            {completedSubtasks}/{totalSubtasks} completed
                          </span>
                        </div>
                        {task.duration === "daily" && (
                          <div className="flex items-center gap-1">
                            <Timer className="w-4 h-4" />
                            <span>
                              {task.subtasks && task.subtasks.length > 0
                                ? (() => {
                                    const subtasksWithTime =
                                      task.subtasks.filter(
                                        (st) => st.start_time,
                                      );
                                    if (subtasksWithTime.length === 0)
                                      return "No schedule set";
                                    const sorted = subtasksWithTime.sort(
                                      (a, b) =>
                                        (a.start_time || "").localeCompare(
                                          b.start_time || "",
                                        ),
                                    );
                                    const { time, period } = convertTo12Hour(
                                      sorted[0].start_time,
                                    );
                                    return `Starts: ${time ? `${time} ${period}` : sorted[0].start_time}`;
                                  })()
                                : "No schedule set"}
                            </span>
                          </div>
                        )}

                        {/* Next direct-call countdown for overdue tasks */}
                        {taskStatus === "overdue" && (
                          <div className="flex items-center gap-1">
                            <Timer className="w-4 h-4" />
                            <span className="text-red-600">
                              Next call in:{" "}
                              {(() => {
                                // Prefer server-provided next_call_at if available
                                let seconds = overdueTimers[task.id] || 15 * 60;
                                try {
                                  if ((task as any).next_call_at) {
                                    const nextMs = new Date(
                                      (task as any).next_call_at,
                                    ).getTime();
                                    const diff = Math.max(
                                      0,
                                      Math.ceil((nextMs - Date.now()) / 1000),
                                    );
                                    if (!isNaN(diff)) seconds = diff;
                                  } else {
                                    const stored =
                                      typeof window !== "undefined"
                                        ? localStorage.getItem(
                                            `finops_next_call_${task.id}`,
                                          )
                                        : null;
                                    if (stored) {
                                      const nextMs = parseInt(stored, 10);
                                      const diff = Math.max(
                                        0,
                                        Math.ceil((nextMs - Date.now()) / 1000),
                                      );
                                      if (!isNaN(diff)) seconds = diff;
                                    }
                                  }
                                } catch {}
                                const mins = Math.floor(seconds / 60);
                                const secs = seconds % 60;
                                return `${mins}m ${secs.toString().padStart(2, "0")}s`;
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canEditFinOpsTasks(task) ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(task)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit Task
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to delete "${task.task_name}"?`,
                                )
                              ) {
                                deleteTaskMutation.mutate(task.id);
                              }
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : canOnlyChangeStatus(task) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(task)}
                        >
                          <Activity className="w-4 h-4 mr-1" />
                          Update Status Only
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="text-gray-400"
                        >
                          <Activity className="w-4 h-4 mr-1" />
                          View Only
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {/* Inline Subtasks Management */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="border-t pt-4">
                      <h4 className="font-medium flex items-center gap-2 mb-3 justify-center">
                        <Activity className="w-4 h-4" />
                        Subtasks ({completedSubtasks}/{totalSubtasks} completed)
                      </h4>

                      <div className="space-y-3">
                        {(() => {
                          const inProgressSubtasks = task.subtasks.filter(
                            (st) => st.status === "in_progress",
                          );
                          const otherSubtasks = task.subtasks.filter(
                            (st) => st.status !== "in_progress",
                          );
                          const isExpanded = expandedTasks.has(task.id);

                          // Always show in-progress subtasks
                          let subtasksToShow = [...inProgressSubtasks];

                          if (isExpanded) {
                            // Show all subtasks when expanded
                            subtasksToShow = task.subtasks;
                          } else {
                            // Show in-progress + up to 2 others
                            subtasksToShow = [
                              ...inProgressSubtasks,
                              ...otherSubtasks.slice(
                                0,
                                Math.max(0, 3 - inProgressSubtasks.length),
                              ),
                            ];
                          }

                          return subtasksToShow.map((subtask) => {
                            const slaWarning = getSLAWarning(
                              subtask.start_time,
                              subtask.status,
                            );
                            return (
                              <div key={subtask.id}>
                                <SortableSubTaskItem
                                  subtask={subtask}
                                  task={task}
                                  index={0}
                                  onUpdate={() => {}}
                                  onRemove={() => {}}
                                  onStatusChange={(
                                    subtaskId,
                                    status,
                                    delayReason,
                                    delayNotes,
                                  ) =>
                                    handleInlineSubTaskStatusChange(
                                      task.id,
                                      subtaskId,
                                      status,
                                      delayReason,
                                      delayNotes,
                                    )
                                  }
                                  isInline={true}
                                />
                                {(slaWarning || subtask.start_time) &&
                                  (() => {
                                    const today = dateFilter
                                      ? new Date(dateFilter)
                                      : new Date();
                                    const taskStart = task.effective_from
                                      ? new Date(task.effective_from)
                                      : today;

                                    const show = (() => {
                                      if (task.duration === "daily")
                                        return taskStart <= today;
                                      if (task.duration === "weekly") {
                                        const days = weeklyDaysToNumbers(
                                          (task as any).weekly_days,
                                        );
                                        if (days.length === 0) return false;
                                        const dayIndex = today.getDay();
                                        return (
                                          taskStart <= today &&
                                          days.includes(dayIndex)
                                        );
                                      }
                                      if (task.duration === "monthly") {
                                        const monthlyDay =
                                          (task as any).monthly_day ??
                                          (task.effective_from
                                            ? new Date(
                                                task.effective_from,
                                              ).getDate()
                                            : null);
                                        if (!monthlyDay) return false;
                                        return (
                                          taskStart <= today &&
                                          monthlyDay === today.getDate()
                                        );
                                      }
                                      return (
                                        taskStart.toDateString() ===
                                        today.toDateString()
                                      );
                                    })();
                                    return show;
                                  })() && (
                                    <Alert
                                      className={`mt-2 p-2 ${
                                        slaWarning?.type === "overdue" ||
                                        subtask.status === "overdue"
                                          ? "border-red-200 bg-red-50"
                                          : slaWarning?.type === "warning"
                                            ? "border-orange-200 bg-orange-50"
                                            : "border-blue-200 bg-blue-50"
                                      }`}
                                    >
                                      <div className="flex items-center gap-1">
                                        <Clock
                                          className={`h-3 w-3 flex-shrink-0 ${
                                            slaWarning?.type === "overdue" ||
                                            subtask.status === "overdue"
                                              ? "text-red-600"
                                              : slaWarning?.type === "warning"
                                                ? "text-orange-600"
                                                : "text-blue-600"
                                          }`}
                                        />
                                        <AlertDescription
                                          className={`text-xs ${
                                            slaWarning?.type === "overdue" ||
                                            subtask.status === "overdue"
                                              ? "text-red-700"
                                              : slaWarning?.type === "warning"
                                                ? "text-orange-700"
                                                : "text-blue-700"
                                          }`}
                                        >
                                          {(() => {
                                            const overdue =
                                              slaWarning?.type === "overdue" ||
                                              subtask.status === "overdue";
                                            const timeText = subtask.start_time
                                              ? overdue
                                                ? getTimeSinceStartStrict(
                                                    subtask.start_time,
                                                  )
                                                : getTimeSinceStart(
                                                    subtask.start_time,
                                                  )
                                              : "";
                                            if (overdue) {
                                              return `Overdue${timeText ? " • " + timeText : ""}`;
                                            }
                                            if (slaWarning?.message) {
                                              return `${slaWarning.message}${timeText ? " • " + timeText : ""}`;
                                            }
                                            return timeText
                                              ? `Status • ${timeText}`
                                              : "Status";
                                          })()}
                                        </AlertDescription>
                                      </div>
                                    </Alert>
                                  )}
                              </div>
                            );
                          });
                        })()}

                        {!expandedTasks.has(task.id) &&
                          task.subtasks.length > 3 && (
                            <div className="text-center py-2">
                              <span className="text-sm text-gray-500">
                                {task.subtasks.length -
                                  Math.min(
                                    3,
                                    task.subtasks.filter(
                                      (st) => st.status === "in_progress",
                                    ).length +
                                      Math.max(
                                        0,
                                        3 -
                                          task.subtasks.filter(
                                            (st) => st.status === "in_progress",
                                          ).length,
                                      ),
                                  )}{" "}
                                more subtasks hidden
                              </span>
                            </div>
                          )}

                        {/* Show More / Show Less Button */}
                        {task.subtasks.length > 3 && (
                          <div className="flex justify-center mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTaskExpansion(task.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {expandedTasks.has(task.id)
                                ? "Show Less"
                                : "Show More"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Create/Edit Task Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setEditingTask(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? "Edit FinOps Task" : "Create New FinOps Task"}
            </DialogTitle>
            <DialogDescription>
              Configure client-based FinOps processes with comprehensive
              tracking.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task_name">Task Name *</Label>
                <Input
                  id="task_name"
                  value={taskForm.task_name}
                  onChange={(e) =>
                    setTaskForm((prev) => ({
                      ...prev,
                      task_name: e.target.value,
                    }))
                  }
                  placeholder="e.g., CLEARING - FILE TRANSFER AND VALIDATION"
                  required
                />
              </div>

              <div>
                <Label htmlFor="client_id">Client *</Label>
                <div className="flex gap-2">
                  <Select
                    value={taskForm.client_id}
                    onValueChange={(value) =>
                      setTaskForm((prev) => ({ ...prev, client_id: value }))
                    }
                    required
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        if (
                          typeof window !== "undefined" &&
                          (window as any).__APP_DEBUG
                        )
                          console.log("🎯 Rendering client dropdown:", {
                            isLoading: clientsLoading,
                            clientsCount: clients.length,
                            rawClientsCount: rawClients.length,
                            hasError: !!clientsError,
                            error: clientsError?.message,
                          });

                        if (clientsLoading) {
                          return (
                            <SelectItem value="loading" disabled>
                              Loading FinOps clients...
                            </SelectItem>
                          );
                        }

                        if (clients.length > 0) {
                          return clients.map((client: any) => (
                            <SelectItem
                              key={`create-client-${client.id}`}
                              value={client.id.toString()}
                            >
                              {client.company_name ||
                                client.client_name ||
                                `Client ${client.id}`}
                            </SelectItem>
                          ));
                        }

                        return (
                          <SelectItem value="no-clients" disabled>
                            No FinOps clients available
                          </SelectItem>
                        );
                      })()}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddClientDialogOpen(true)}
                    className="whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Client
                  </Button>
                </div>
                <div className="mt-2">
                  {!clientsLoading && clients.length === 0 && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-700 font-medium">
                        🎯 No FinOps clients found
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        Create your first FinOps client by clicking "Add Client"
                        above. These clients are separate from your sales leads.
                      </p>
                    </div>
                  )}
                  {clientsError && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">
                        ❌ Failed to load FinOps clients
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {clientsError.message}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          queryClient.invalidateQueries({
                            queryKey: ["finops-clients"],
                          });
                        }}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry Loading
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="duration">Duration *</Label>
                <Select
                  value={taskForm.duration}
                  onValueChange={(value) =>
                    setTaskForm((prev) => ({ ...prev, duration: value as any }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>

                {taskForm.duration === "weekly" && (
                  <div className="mt-3">
                    <Label>Select day(s)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        onValueChange={(value) => {
                          const day = value.toLowerCase();
                          const dayMap: Record<string, number> = {
                            sunday: 0,
                            monday: 1,
                            tuesday: 2,
                            wednesday: 3,
                            thursday: 4,
                            friday: 5,
                            saturday: 6,
                          };
                          const idx = dayMap[day];
                          if (idx === undefined) return;
                          setTaskForm((prev) => ({
                            ...prev,
                            weekly_days: prev.weekly_days.includes(idx)
                              ? prev.weekly_days
                              : prev.weekly_days.length < 2
                                ? [...prev.weekly_days, idx]
                                : prev.weekly_days,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue placeholder="Select day (max 2)" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Sunday",
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                            "Saturday",
                          ].map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2">
                        {taskForm.weekly_days.map((d, idx) => (
                          <Badge
                            key={`${d}-${idx}`}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() =>
                              setTaskForm((prev) => ({
                                ...prev,
                                weekly_days: prev.weekly_days.filter(
                                  (x) => x !== d,
                                ),
                              }))
                            }
                          >
                            {
                              [
                                "Sunday",
                                "Monday",
                                "Tuesday",
                                "Wednesday",
                                "Thursday",
                                "Friday",
                                "Saturday",
                              ][d]
                            }{" "}
                            ×
                          </Badge>
                        ))}
                      </div>
                      {taskForm.weekly_days.length === 0 && (
                        <span className="text-xs text-gray-500">
                          Pick up to two days
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {taskForm.duration === "monthly" && (
                  <div className="mt-3 w-full">
                    <Label>Day of month</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={
                          taskForm.monthly_day
                            ? String(taskForm.monthly_day)
                            : ""
                        }
                        onValueChange={(val) => {
                          const num = val ? Number(val) : null;
                          setTaskForm((prev) => ({
                            ...prev,
                            monthly_day: num,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select day of month" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 31 }).map((_, i) => (
                            <SelectItem
                              key={`md-${i + 1}`}
                              value={String(i + 1)}
                            >
                              {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex flex-wrap gap-2">
                        {taskForm.monthly_day ? (
                          <Badge variant="secondary">
                            {taskForm.monthly_day} ×
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-500">
                            Leave empty to use effective from day
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label>Assigned To *</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !taskForm.assigned_to.includes(value)) {
                        setTaskForm((prev) => ({
                          ...prev,
                          assigned_to: [...prev.assigned_to, value],
                        }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignees (multiple)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      <div className="p-2 border-b bg-white sticky top-0 z-10">
                        <Input
                          placeholder="Search users..."
                          value={assignedToSearch}
                          className="h-8"
                          onChange={(e) => setAssignedToSearch(e.target.value)}
                          onKeyDown={(e) => {
                            // Prevent Select from closing when typing
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            // Prevent Select from capturing mouse events
                            e.stopPropagation();
                          }}
                          autoFocus={false}
                        />
                      </div>
                      {users
                        .filter(
                          (user: any, index: number, arr: any[]) =>
                            arr.findIndex((u) => u.id === user.id) === index,
                        )
                        .filter((user: any) => {
                          const userValue = `${user.first_name} ${user.last_name} (${user.email || "no-email"})`;
                          return !taskForm.assigned_to.includes(userValue);
                        })
                        .filter((user: any) => {
                          const fullName =
                            `${user.first_name} ${user.last_name}`.toLowerCase();
                          const email = (user.email || "").toLowerCase();
                          const searchTerm = assignedToSearch.toLowerCase();
                          return (
                            fullName.includes(searchTerm) ||
                            email.includes(searchTerm)
                          );
                        })
                        .map((user: any, index: number) => {
                          const fullName = `${user.first_name} ${user.last_name}`;
                          const userValue = `${fullName} (${user.email || "no-email"})`;
                          return (
                            <SelectItem
                              key={`assigned-to-${user.id}`}
                              value={userValue}
                            >
                              {fullName}{" "}
                              <span className="text-xs text-gray-500">
                                ({user.email || "no-email"})
                              </span>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {taskForm.assigned_to.map((assignee, index) => (
                    <Badge
                      key={`assignee-${assignee}-${index}`}
                      variant="default"
                      className="gap-1"
                    >
                      {extractNameFromValue(assignee)}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() =>
                          setTaskForm((prev) => ({
                            ...prev,
                            assigned_to: prev.assigned_to.filter(
                              (_, i) => i !== index,
                            ),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                  {taskForm.assigned_to.length === 0 && (
                    <span className="text-sm text-gray-500">
                      No assignees selected. Please select at least one.
                    </span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={taskForm.description}
                  onChange={(e) =>
                    setTaskForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="e.g., clearing daily steps for file transfer"
                  required
                />
              </div>

              <div className="md:col-start-1">
                <Label htmlFor="effective_from">Effective From *</Label>
                <Input
                  id="effective_from"
                  type="date"
                  value={taskForm.effective_from}
                  onChange={(e) =>
                    setTaskForm((prev) => ({
                      ...prev,
                      effective_from: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="flex items-center space-x-2 md:col-start-2">
                <Switch
                  checked={taskForm.is_active}
                  onCheckedChange={(checked) =>
                    setTaskForm((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label>Task is active</Label>
              </div>
            </div>

            {/* Team Management */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Team & Escalation</h3>

              <div>
                <Label>Reporting Managers</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (
                        value &&
                        !taskForm.reporting_managers.includes(value)
                      ) {
                        setTaskForm((prev) => ({
                          ...prev,
                          reporting_managers: [
                            ...prev.reporting_managers,
                            value,
                          ],
                        }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reporting manager" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      <div className="p-2 border-b bg-white sticky top-0 z-10">
                        <Input
                          placeholder="Search reporting managers..."
                          value={reportingManagerSearch}
                          className="h-8"
                          onChange={(e) =>
                            setReportingManagerSearch(e.target.value)
                          }
                          onKeyDown={(e) => {
                            // Prevent Select from closing when typing
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            // Prevent Select from capturing mouse events
                            e.stopPropagation();
                          }}
                          autoFocus={false}
                        />
                      </div>
                      {users
                        .filter(
                          (user: any, index: number, arr: any[]) =>
                            arr.findIndex((u) => u.id === user.id) === index,
                        )
                        .filter((user: any) => {
                          const userValue = `${user.first_name} ${user.last_name} (${user.email || "no-email"})`;
                          return !taskForm.reporting_managers.includes(
                            userValue,
                          );
                        })
                        .filter((user: any) => {
                          const fullName =
                            `${user.first_name} ${user.last_name}`.toLowerCase();
                          const email = (user.email || "").toLowerCase();
                          const searchTerm =
                            reportingManagerSearch.toLowerCase();
                          return (
                            fullName.includes(searchTerm) ||
                            email.includes(searchTerm)
                          );
                        })
                        .map((user: any, index: number) => {
                          const fullName = `${user.first_name} ${user.last_name}`;
                          const userValue = `${fullName} (${user.email || "no-email"})`;
                          return (
                            <SelectItem
                              key={`reporting-manager-${user.id}`}
                              value={userValue}
                            >
                              {fullName}{" "}
                              <span className="text-xs text-gray-500">
                                ({user.email || "no-email"})
                              </span>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {taskForm.reporting_managers.map((manager, index) => (
                    <Badge
                      key={`manager-${manager}-${index}`}
                      variant="secondary"
                      className="gap-1"
                    >
                      {extractNameFromValue(manager)}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() =>
                          setTaskForm((prev) => ({
                            ...prev,
                            reporting_managers: prev.reporting_managers.filter(
                              (_, i) => i !== index,
                            ),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Escalation Managers</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (
                        value &&
                        !taskForm.escalation_managers.includes(value)
                      ) {
                        setTaskForm((prev) => ({
                          ...prev,
                          escalation_managers: [
                            ...prev.escalation_managers,
                            value,
                          ],
                        }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select escalation manager" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      <div className="p-2 border-b bg-white sticky top-0 z-10">
                        <Input
                          placeholder="Search escalation managers..."
                          value={escalationManagerSearch}
                          className="h-8"
                          onChange={(e) =>
                            setEscalationManagerSearch(e.target.value)
                          }
                          onKeyDown={(e) => {
                            // Prevent Select from closing when typing
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            // Prevent Select from capturing mouse events
                            e.stopPropagation();
                          }}
                          autoFocus={false}
                        />
                      </div>
                      {users
                        .filter(
                          (user: any, index: number, arr: any[]) =>
                            arr.findIndex((u) => u.id === user.id) === index,
                        )
                        .filter((user: any) => {
                          const userValue = `${user.first_name} ${user.last_name} (${user.email || "no-email"})`;
                          return !taskForm.escalation_managers.includes(
                            userValue,
                          );
                        })
                        .filter((user: any) => {
                          const fullName =
                            `${user.first_name} ${user.last_name}`.toLowerCase();
                          const email = (user.email || "").toLowerCase();
                          const searchTerm =
                            escalationManagerSearch.toLowerCase();
                          return (
                            fullName.includes(searchTerm) ||
                            email.includes(searchTerm)
                          );
                        })
                        .map((user: any, index: number) => {
                          const fullName = `${user.first_name} ${user.last_name}`;
                          const userValue = `${fullName} (${user.email || "no-email"})`;
                          return (
                            <SelectItem
                              key={`escalation-manager-${user.id}`}
                              value={userValue}
                            >
                              {fullName}{" "}
                              <span className="text-xs text-gray-500">
                                ({user.email || "no-email"})
                              </span>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {taskForm.escalation_managers.map((manager, index) => (
                    <Badge
                      key={`escalation-${manager}-${index}`}
                      variant="destructive"
                      className="gap-1"
                    >
                      {extractNameFromValue(manager)}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() =>
                          setTaskForm((prev) => ({
                            ...prev,
                            escalation_managers:
                              prev.escalation_managers.filter(
                                (_, i) => i !== index,
                              ),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Subtasks without SLA Hours/Minutes */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Subtasks</h3>
                <Button
                  type="button"
                  onClick={addSubTask}
                  variant="outline"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Subtask
                </Button>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={taskForm.subtasks.map((st) => st.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {taskForm.subtasks.map((subtask, index) => (
                      <SortableSubTaskItem
                        key={subtask.id}
                        subtask={subtask}
                        index={index}
                        onUpdate={updateSubTask}
                        onRemove={removeSubTask}
                        isInline={false}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {taskForm.subtasks.length === 0 && (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  <Timer className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No subtasks added yet</p>
                  <p className="text-sm">
                    Add subtasks to break down your process
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createTaskMutation.isPending || updateTaskMutation.isPending
                }
              >
                <Save className="w-4 h-4 mr-2" />
                {editingTask ? "Update Task" : "Create Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog
        open={isAddClientDialogOpen}
        onOpenChange={setIsAddClientDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New FinOps Client</DialogTitle>
            <DialogDescription>
              Create a new client for FinOps task management. This client will
              be separate from sales leads.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateClient} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={newClientForm.company_name}
                onChange={(e) =>
                  setNewClientForm((prev) => ({
                    ...prev,
                    company_name: e.target.value,
                  }))
                }
                placeholder="e.g., Acme Corporation"
                required
              />
            </div>

            <div>
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={newClientForm.contact_person}
                onChange={(e) =>
                  setNewClientForm((prev) => ({
                    ...prev,
                    contact_person: e.target.value,
                  }))
                }
                placeholder="e.g., John Smith"
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newClientForm.email}
                onChange={(e) =>
                  setNewClientForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="e.g., contact@acme.com"
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newClientForm.phone}
                onChange={(e) =>
                  setNewClientForm((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                placeholder="e.g., +1 (555) 123-4567"
              />
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={newClientForm.address}
                onChange={(e) =>
                  setNewClientForm((prev) => ({
                    ...prev,
                    address: e.target.value,
                  }))
                }
                placeholder="Client address..."
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={newClientForm.notes}
                onChange={(e) =>
                  setNewClientForm((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                placeholder="Additional notes about the client..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddClientDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createFinOpsClientMutation.isPending}
              >
                {createFinOpsClientMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Overdue Reason Dialog */}
      <Dialog
        open={showOverdueReasonDialog}
        onOpenChange={setShowOverdueReasonDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Reason for Overdue Status
            </DialogTitle>
            <DialogDescription>
              This task was overdue and is now being changed to a different
              status. Please provide a reason for why it was overdue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="text-sm font-medium text-red-800">
                Task: {overdueReasonData?.taskName}
              </div>
              <div className="text-sm text-red-700">
                Subtask: {overdueReasonData?.subtaskName}
              </div>
              <div className="text-sm text-red-600">
                Status changing from: Overdue → {overdueReasonData?.newStatus}
              </div>
            </div>

            <div>
              <Label htmlFor="overdue_reason">Reason for Overdue *</Label>
              <Select value={overdueReason} onValueChange={setOverdueReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select overdue reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical_issue">
                    Technical Issue
                  </SelectItem>
                  <SelectItem value="data_unavailable">
                    Data Unavailable
                  </SelectItem>
                  <SelectItem value="external_dependency">
                    External Dependency
                  </SelectItem>
                  <SelectItem value="resource_constraint">
                    Resource Constraint
                  </SelectItem>
                  <SelectItem value="process_change">Process Change</SelectItem>
                  <SelectItem value="client_delay">Client Delay</SelectItem>
                  <SelectItem value="system_downtime">
                    System Downtime
                  </SelectItem>
                  <SelectItem value="urgent_priority_task">
                    Urgent Priority Task
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {overdueReason === "other" && (
              <div>
                <Label htmlFor="custom_reason">Please specify</Label>
                <Textarea
                  id="custom_reason"
                  placeholder="Please describe the specific reason..."
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOverdueReasonDialog(false);
                setOverdueReasonData(null);
                setOverdueReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submitOverdueReason}
              disabled={!overdueReason}
              className="bg-red-600 hover:bg-red-700"
            >
              Submit Reason & Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
