import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Plus, Pencil, Trash2, X, CheckCircle2, Clock, AlertTriangle,
  AlertCircle, ShieldCheck, Briefcase, TrendingUp, Users, FileText,
  BarChart3, Sun, UserCheck, Bell, CalendarDays, CheckCheck,
  Hourglass, Lock, ChevronRight, Calendar, Circle, History, ClipboardList, Settings,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Activity {
  id: number;
  activity_id: string;
  category: string;
  activity_name: string;
  description: string;
  duration: string;
  status: string;
  reason_non_completion: string;
  due_date: string | null;
  assigned_to: string[];
  approval_users: string[];
  scheduled_day: number | null;
  scheduled_weekdays: number[];
  scheduled_start_date: string | null;
  pending_approval: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RecruitmentPosition {
  id: number;
  position_name: string;
  date_open: string | null;
  date_close: string | null;
  cvs_applied: number;
  cvs_shortlist: number;
  cvs_interviewed: number;
  cvs_on_hold: number;
  selected: number;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TABS = [
  { key: "dashboard",         label: "Dashboard",          icon: BarChart3 },
  { key: "finance_accounts",  label: "Finance & Accounts", icon: Briefcase },
  { key: "taxation",          label: "Taxation",           icon: FileText },
  { key: "secretarial",       label: "Secretarial",        icon: CheckCircle2 },
  { key: "hr_compliance",     label: "HR Compliance",      icon: Users },
  { key: "legal_contracts",   label: "Legal Contracts",    icon: ShieldCheck },
  { key: "agreement_summary", label: "Agreement Summary",  icon: CalendarDays },
  { key: "recruitment",       label: "Recruitment",        icon: UserCheck },
  { key: "history",           label: "History",            icon: History },
  { key: "management",        label: "Management",         icon: ClipboardList },
  { key: "admin",             label: "Admin",              icon: Settings },
];

const STATUSES = [
  { value: "pending",          label: "Pending",           color: "#6B7280", bg: "#F9FAFB", icon: Circle },
  { value: "in_progress",      label: "In Progress",       color: "#3B82F6", bg: "#EFF6FF", icon: Clock },
  { value: "pending_approval", label: "Pending Approval",  color: "#F97316", bg: "#FFF7ED", icon: Hourglass },
  { value: "verified",         label: "Verified",          color: "#8B5CF6", bg: "#F5F3FF", icon: ShieldCheck },
  { value: "completed",        label: "Completed",         color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2 },
  { value: "delayed",          label: "Delayed",           color: "#F59E0B", bg: "#FFFBEB", icon: AlertTriangle },
  { value: "overdue",          label: "Overdue",           color: "#EF4444", bg: "#FEF2F2", icon: AlertCircle },
];

const DURATIONS = [
  { value: "D", label: "Daily",       description: "Repeats every day · Deadline 5:00 PM IST" },
  { value: "W", label: "Weekly",      description: "Choose weekday(s) · Deadline 5:00 PM IST" },
  { value: "M", label: "Monthly",     description: "Choose day of month · Deadline 5:00 PM IST" },
  { value: "Q", label: "Quarterly",   description: "Every 4 months from start date · 5:00 PM IST" },
  { value: "H", label: "Half-yearly", description: "Every 6 months from start date · 5:00 PM IST" },
  { value: "Y", label: "Yearly",      description: "Same date each year · 5:00 PM IST" },
];

const WEEKDAYS = [
  { value: 0, short: "Sun", label: "Sunday" },
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));
const CAT_LABEL: Record<string, string> = {
  finance_accounts:  "Finance & Accounts",
  taxation:          "Taxation",
  secretarial:       "Secretarial",
  hr_compliance:     "HR Compliance",
  legal_contracts:   "Legal Contracts",
  agreement_summary: "Agreement Summary",
  admin:             "Admin",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/finance${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function extractName(v: string) { return v.split(" (")[0] || v; }
function extractEmail(v: string) {
  const m = v.match(/\(([^)]+)\)/);
  return m ? m[1] : v;
}

function getISTNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function isActivityDueToday(a: Activity): boolean {
  const ist = getISTNow();
  const todayStr = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  // If a specific due_date is set, only mark as "today" when it matches today's date
  if (a.due_date) {
    return a.due_date.slice(0, 10) === todayStr;
  }
  switch (a.duration) {
    case "D": return true;
    case "W": {
      const dow = ist.getDay();
      return (a.scheduled_weekdays ?? []).includes(dow);
    }
    case "M":
      return ist.getDate() === (a.scheduled_day ?? 1);
    case "Q": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      if (ist.getDate() !== start.getDate()) return false;
      const diff = (ist.getFullYear() - start.getFullYear()) * 12 + (ist.getMonth() - start.getMonth());
      return diff >= 0 && diff % 4 === 0;
    }
    case "H": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      if (ist.getDate() !== start.getDate()) return false;
      const diff = (ist.getFullYear() - start.getFullYear()) * 12 + (ist.getMonth() - start.getMonth());
      return diff >= 0 && diff % 6 === 0;
    }
    case "Y": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      return ist.getDate() === start.getDate() && ist.getMonth() === start.getMonth();
    }
    default: return false;
  }
}

function getScheduleLabel(a: Activity): string {
  switch (a.duration) {
    case "D": return "Daily — deadline 5:00 PM IST";
    case "W": {
      const days = (a.scheduled_weekdays ?? []).map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? d).join(", ");
      return days ? `Every ${days} — deadline 5:00 PM IST` : "Weekly (no days set)";
    }
    case "M":
      return a.scheduled_day ? `Monthly on ${a.scheduled_day}${ordinal(a.scheduled_day)} — 5:00 PM IST` : "Monthly";
    case "Q":
      return a.scheduled_start_date ? `Quarterly from ${fmtDate(a.scheduled_start_date)}` : "Quarterly";
    case "H":
      return a.scheduled_start_date ? `Half-yearly from ${fmtDate(a.scheduled_start_date)}` : "Half-yearly";
    case "Y":
      return a.scheduled_start_date ? `Yearly on ${fmtDate(a.scheduled_start_date)}` : "Yearly";
    default: return a.duration;
  }
}

function getDueLabel(a: Activity): string {
  switch (a.duration) {
    case "D": return "Every day — deadline 5:00 PM IST";
    case "W": {
      const days = (a.scheduled_weekdays ?? []).map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? d).join(", ");
      return days ? `Every ${days}` : "Every week";
    }
    case "M":
      return a.scheduled_day ? `Every ${a.scheduled_day}${ordinal(a.scheduled_day)} of the month` : "Every month";
    case "Q":
      return a.scheduled_start_date ? `Every quarter from ${fmtDate(a.scheduled_start_date)}` : "Every quarter";
    case "H":
      return a.scheduled_start_date ? `Every 6 months from ${fmtDate(a.scheduled_start_date)}` : "Every 6 months";
    case "Y":
      return a.scheduled_start_date
        ? `Every year on ${new Date(a.scheduled_start_date).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`
        : "Every year";
    default: return a.due_date ? `Due: ${fmtDate(a.due_date)}` : "";
  }
}

function ordinal(n: number) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return s[(v-20)%10] || s[v] || s[0];
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── SLA Notification system ─────────────────────────────────────────────────
function useSLANotifications(activities: Activity[]) {
  const notifiedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!activities.length) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const ist = getISTNow();
    // 4:30 PM IST = 16h 30m
    const target = new Date(ist);
    target.setHours(16, 30, 0, 0);
    const msUntil = target.getTime() - ist.getTime();

    if (msUntil <= 0) return; // Already past 4:30 PM

    const timer = setTimeout(() => {
      const pending = activities.filter(
        (a) =>
          isActivityDueToday(a) &&
          !["completed", "verified"].includes(a.status) &&
          !notifiedRef.current.has(a.id),
      );
      pending.forEach((a) => {
        notifiedRef.current.add(a.id);
        const st = STATUS_MAP[a.status];
        const notif = new Notification(`⏰ SLA Warning — 30 min left`, {
          body: `${a.activity_name}\nDue at 5:00 PM IST · ${st?.label ?? a.status}`,
          icon: "/favicon.ico",
          tag: `fm-sla-${a.id}`,
          requireInteraction: true,
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      });
    }, msUntil);

    return () => clearTimeout(timer);
  }, [activities]);
}

// ─── User MultiSelect ────────────────────────────────────────────────────────
function UserMultiSelect({
  label, selected, onChange, users, icon,
}: {
  label: string;
  selected: string[];
  onChange: (v: string[]) => void;
  users: any[];
  icon?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [dropStyle, setDropStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);

  const filtered = users
    .filter((u: any, i: number, arr: any[]) => arr.findIndex((x) => x.id === u.id) === i)
    .filter((u: any) => {
      const val = `${u.first_name} ${u.last_name} (${u.email || "no-email"})`;
      if (selected.includes(val)) return false;
      const q = search.toLowerCase();
      return `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
    });

  const addUser = (u: any) => {
    const val = `${u.first_name} ${u.last_name} (${u.email || "no-email"})`;
    onChange([...selected, val]);
    setSearch("");
  };

  const openDropdown = () => {
    if (!triggerRef.current) { setOpen(true); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    const dropH = 280; // approx max dropdown height
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < dropH && rect.top > dropH;
    setDropStyle(
      openUpward
        ? { position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 9999 }
        : { position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 },
    );
    setOpen(true);
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
        {icon} {label}
      </label>
      <div className="relative" ref={triggerRef}>
        <div
          className="w-full min-h-[38px] px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer bg-white hover:border-blue-400 transition-colors"
          onClick={openDropdown}
        >
          <div className="flex flex-wrap gap-1">
            {selected.map((val) => (
              <span key={val} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">
                {extractName(val)}
                <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter((v) => v !== val)); }}
                  className="hover:text-red-600 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {!selected.length && <span className="text-gray-400 text-sm">Click to select…</span>}
          </div>
        </div>
        {open && createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
            <div style={{ ...dropStyle, backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              <div className="p-2 border-b bg-gray-50">
                <Input autoFocus placeholder="Search by name or email…" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 text-sm border-gray-200" />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {!filtered.length ? (
                  <p className="text-xs text-gray-400 text-center py-4">No users found</p>
                ) : filtered.map((u: any) => (
                  <button key={u.id} type="button"
                    onClick={() => { addUser(u); setOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-xs">
                      {(u.first_name?.[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{u.first_name} {u.last_name}</p>
                      <p className="text-xs text-gray-500">{u.email || "no-email"} · {u.role || ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
      </div>
    </div>
  );
}

// ─── Schedule fields per duration ────────────────────────────────────────────
function ScheduleFields({
  duration, form, onChange,
}: {
  duration: string;
  form: any;
  onChange: (f: Partial<any>) => void;
}) {
  const dur = DURATIONS.find((d) => d.value === duration);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-800">Schedule — {dur?.label}</span>
      </div>
      <p className="text-xs text-blue-600">{dur?.description}</p>

      {/* Daily — no extra config needed */}
      {duration === "D" && (
        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="text-sm text-gray-700">Triggers every day at start. Overdue after 5:00 PM IST if incomplete.</span>
        </div>
      )}

      {/* Weekly — weekday picker */}
      {duration === "W" && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">Select day(s) of the week:</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const selected = (form.scheduled_weekdays ?? []).includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => {
                    const current = form.scheduled_weekdays ?? [];
                    onChange({
                      scheduled_weekdays: selected
                        ? current.filter((v: number) => v !== d.value)
                        : [...current, d.value],
                    });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                    selected
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          {(form.scheduled_weekdays ?? []).length === 0 && (
            <p className="text-xs text-red-500 mt-1">Please select at least one day</p>
          )}
        </div>
      )}

      {/* Monthly — day of month */}
      {duration === "M" && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Day of month (1–28):</label>
          <input
            type="number"
            min="1"
            max="28"
            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.scheduled_day ?? ""}
            onChange={(e) => onChange({ scheduled_day: parseInt(e.target.value) || null })}
            placeholder="e.g. 5"
          />
          {form.scheduled_day && (
            <p className="text-xs text-blue-600 mt-1">
              Activity runs on the {form.scheduled_day}{ordinal(form.scheduled_day)} of every month
            </p>
          )}
        </div>
      )}

      {/* Quarterly / Half-yearly / Yearly — start date */}
      {["Q", "H", "Y"].includes(duration) && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">
            {duration === "Q" ? "First occurrence date (repeats every 4 months):" :
             duration === "H" ? "First occurrence date (repeats every 6 months):" :
             "Annual date (same month/day each year):"}
          </label>
          <input
            type="date"
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.scheduled_start_date ?? ""}
            onChange={(e) => onChange({ scheduled_start_date: e.target.value || null })}
          />
          {form.scheduled_start_date && (
            <p className="text-xs text-blue-600 mt-1">
              {duration === "Q" && `Next occurrences: ${getNextQuarterlyDates(form.scheduled_start_date, 3).join(" · ")}`}
              {duration === "H" && `Next occurrences: ${getNextHalfYearlyDates(form.scheduled_start_date, 3).join(" · ")}`}
              {duration === "Y" && `Repeats on ${new Date(form.scheduled_start_date).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} every year`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function getNextQuarterlyDates(startDate: string, count: number): string[] {
  const start = new Date(startDate);
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; dates.length < count; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * 4);
    if (d >= now) dates.push(fmtDate(d.toISOString().split("T")[0]));
    if (i > 20) break;
  }
  return dates;
}

function getNextHalfYearlyDates(startDate: string, count: number): string[] {
  const start = new Date(startDate);
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; dates.length < count; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * 6);
    if (d >= now) dates.push(fmtDate(d.toISOString().split("T")[0]));
    if (i > 20) break;
  }
  return dates;
}

// ─── Activity Modal ───────────────────────────────────────────────────────────
function ActivityModal({
  open, onClose, category, activity, onSuccess, users,
}: {
  open: boolean;
  onClose: () => void;
  category: string;
  activity?: Activity | null;
  onSuccess: () => void;
  users: any[];
}) {
  const blank = {
    activity_name: "", description: "", duration: "D", status: "pending",
    reason_non_completion: "", due_date: "",
    assigned_to: [] as string[], approval_users: [] as string[],
    scheduled_day: null as number | null,
    scheduled_weekdays: [] as number[],
    scheduled_start_date: null as string | null,
  };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (activity) {
      setForm({
        activity_name: activity.activity_name || "",
        description: activity.description || "",
        duration: activity.duration || "D",
        status: activity.status || "in_progress",
        reason_non_completion: activity.reason_non_completion || "",
        due_date: activity.due_date ? activity.due_date.slice(0, 10) : "",
        assigned_to: activity.assigned_to || [],
        approval_users: activity.approval_users || [],
        scheduled_day: activity.scheduled_day ?? null,
        scheduled_weekdays: activity.scheduled_weekdays ?? [],
        scheduled_start_date: activity.scheduled_start_date ?? null,
      });
    } else { setForm(blank); }
    setError("");
  }, [activity, open]);

  if (!open) return null;

  const needsReason = ["delayed", "overdue"].includes(form.status);
  const setF = (patch: Partial<typeof blank>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.activity_name.trim()) { setError("Activity name is required"); return; }
    if (form.duration === "W" && form.scheduled_weekdays.length === 0) {
      setError("Please select at least one weekday"); return;
    }
    setSaving(true); setError("");
    try {
      const payload = { ...form, category };
      if (activity) {
        await apiFetch(`/activities/${activity.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/activities", { method: "POST", body: JSON.stringify(payload) });
      }
      onSuccess();
      onClose();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">
              {activity ? "Edit Activity" : "Create New Activity"}
            </h2>
            <p className="text-blue-200 text-sm mt-0.5">{CAT_LABEL[category] || category}</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Activity ID */}
          {activity && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <span className="text-xs text-gray-500 font-medium">Activity ID:</span>
              <span className="text-xs font-mono font-bold text-gray-700">{activity.activity_id}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Activity Name *</label>
            <input
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.activity_name}
              onChange={(e) => setF({ activity_name: e.target.value })}
              placeholder="Enter a clear, descriptive name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              value={form.description}
              onChange={(e) => setF({ description: e.target.value })}
              placeholder="Describe what this activity involves…"
            />
          </div>

          {/* Duration + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Duration *</label>
              <select
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                value={form.duration}
                onChange={(e) => setF({ duration: e.target.value, scheduled_weekdays: [], scheduled_day: null, scheduled_start_date: null })}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label} ({d.value})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Status *</label>
              <select
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                value={form.status}
                onChange={(e) => setF({ status: e.target.value })}
              >
                {STATUSES.filter((s) => s.value !== "pending_approval").map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Schedule fields — dynamic based on duration */}
          <ScheduleFields duration={form.duration} form={form} onChange={setF} />

          {/* Due date override */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Due Date (optional override)</label>
            <input
              type="date"
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.due_date}
              onChange={(e) => setF({ due_date: e.target.value })}
            />
          </div>

          {/* Reason for non-completion */}
          {needsReason && (
            <div>
              <label className="block text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1.5">Reason for Non-Completion *</label>
              <textarea
                className="w-full px-4 py-2.5 border border-orange-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-orange-50"
                rows={2}
                value={form.reason_non_completion}
                onChange={(e) => setF({ reason_non_completion: e.target.value })}
                placeholder="Explain why this activity could not be completed…"
              />
            </div>
          )}

          {/* Assign To */}
          <UserMultiSelect label="Assign To" selected={form.assigned_to}
            onChange={(v) => setF({ assigned_to: v })} users={users}
            icon={<UserCheck className="w-3 h-3 inline" />} />

          {/* Approval Users */}
          <UserMultiSelect label="Approval Users" selected={form.approval_users}
            onChange={(v) => setF({ approval_users: v })} users={users}
            icon={<ShieldCheck className="w-3 h-3 inline" />} />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl h-11">Cancel</Button>
            <Button type="submit" disabled={saving}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl h-11 font-semibold">
              {saving ? "Saving…" : activity ? "Update Activity" : "Create Activity"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Card ─────────────────────────────────────────────────────────────
function ActivityCard({
  act, canEdit, canDelete, canApprove, isAdmin, isFinance, onEdit, onDelete, onStatusChange, onApprove, userEmail,
}: {
  act: Activity;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  isAdmin: boolean;
  isFinance: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (id: number, status: string) => void;
  onApprove: (id: number) => void;
  userEmail: string;
}) {
  const st = STATUS_MAP[act.status] ?? { color: "#9CA3AF", bg: "#F9FAFB", label: act.status, icon: FileText };
  const Icon = st.icon;
  const isDueToday = isActivityDueToday(act);
  const isAssignedToMe = act.assigned_to.some((v) => extractEmail(v).toLowerCase() === userEmail.toLowerCase());
  // Approve: admin always, OR finance user who is assigned to this activity
  const showApproveButton = act.pending_approval && (isAdmin || (isFinance && isAssignedToMe));

  return (
    <div
      className={`relative bg-white rounded-2xl border-2 transition-all hover:shadow-lg ${
        act.pending_approval ? "border-orange-300 bg-orange-50/30" :
        act.status === "overdue" ? "border-red-300 bg-red-50/20" :
        isDueToday && act.status === "in_progress" ? "border-blue-200 bg-blue-50/10" :
        "border-gray-100"
      }`}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: st.color }} />

      <div className="pl-4 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Status icon */}
            <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: st.bg }}>
              <Icon className="w-4 h-4" style={{ color: st.color }} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-bold text-gray-900 text-sm">{act.activity_name}</span>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{act.activity_id}</span>
                {isDueToday && !["completed", "verified"].includes(act.status) && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <Sun className="w-2.5 h-2.5" /> Today
                  </span>
                )}
              </div>

              {/* Status badge + Duration — visual only */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* Status badge (read-only visual) */}
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style={{ backgroundColor: st.bg, color: st.color, borderColor: st.color + "40" }}
                >
                  <Icon className="w-3 h-3" />
                  {act.pending_approval ? "Pending Approval" : st.label}
                </span>

                {/* Duration badge */}
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
                  {DURATIONS.find((d) => d.value === act.duration)?.label || act.duration}
                </span>
              </div>

              {/* Description */}
              {act.description && (
                <p className="text-sm text-gray-500 mb-2 line-clamp-2 leading-relaxed">{act.description}</p>
              )}

              {/* Schedule */}
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                <Calendar className="w-3 h-3 text-blue-400" />
                <span>{getScheduleLabel(act)}</span>
              </div>

              {/* Reason */}
              {act.reason_non_completion && (
                <div className="flex items-start gap-1.5 bg-orange-50 rounded-lg px-2 py-1.5 mb-2 border border-orange-100">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700">{act.reason_non_completion}</p>
                </div>
              )}

              {/* Assignees + Approvers */}
              <div className="flex flex-wrap gap-3 text-xs">
                {act.assigned_to.length > 0 && (
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <UserCheck className="w-3 h-3 text-blue-500" />
                    <span>{act.assigned_to.map(extractName).join(", ")}</span>
                  </div>
                )}
                {act.approval_users.length > 0 && (
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <ShieldCheck className="w-3 h-3 text-purple-500" />
                    <span>Approval: {act.approval_users.map(extractName).join(", ")}</span>
                  </div>
                )}
              </div>

              {/* Due label */}
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1.5">
                <Clock className="w-3 h-3" />
                {getDueLabel(act)}
              </div>

              {/* Approval info */}
              {act.approved_at && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 mt-1.5">
                  <CheckCheck className="w-3 h-3" />
                  Approved by {act.approved_by} on {fmtDate(act.approved_at)}
                </div>
              )}
            </div>
          </div>

          {/* Right-side actions column */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0 min-w-[130px]">
            {/* Standalone status dropdown — always accessible, right side */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 text-right">Status</p>
              <select
                value={act.pending_approval ? "pending_approval" : act.status}
                onChange={(e) => onStatusChange(act.id, e.target.value)}
                className="text-xs font-semibold rounded-lg px-2.5 py-1.5 border-2 cursor-pointer outline-none w-full"
                style={{
                  backgroundColor: st.bg,
                  color: st.color,
                  borderColor: st.color + "60",
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Approve button — admin always, or finance+assigned_to */}
            {showApproveButton && (
              <button
                onClick={() => onApprove(act.id)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Approve
              </button>
            )}
            {/* Awaiting label for others */}
            {act.pending_approval && !showApproveButton && (
              <span className="text-[10px] text-orange-600 flex items-center gap-1 justify-end">
                <Lock className="w-3 h-3" /> Awaiting approval
              </span>
            )}

            {/* Edit / Delete */}
            <div className="flex gap-1.5">
              {canEdit && (
                <button onClick={onEdit}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {canDelete && (
                <button onClick={onDelete}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────
function ActivityTab({
  category, canCreate, canEditAll, userEmail, users,
}: {
  category: string;
  canCreate: boolean;
  canEditAll: boolean;
  userEmail: string;
  users: any[];
}) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDuration, setFilterDuration] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  // Overdue reason modal
  const [overdueTarget, setOverdueTarget] = useState<{ id: number; newStatus: string } | null>(null);
  const [overdueReason, setOverdueReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["finance-activities", category],
    queryFn: () => apiFetch(`/activities?category=${category}`),
    staleTime: 30_000,
  });

  const statusPatchMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: string; reason?: string }) =>
      apiFetch(`/activities/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason_non_completion: reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-activities", category] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
    },
  });

  const approveMut = useMutation({
    mutationFn: ({ id, by }: { id: number; by: string }) =>
      apiFetch(`/activities/${id}/approve`, { method: "POST", body: JSON.stringify({ approved_by: by }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-activities", category] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/activities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-activities", category] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      setDeleteId(null);
    },
  });

  const allActivities: Activity[] = data?.activities ?? [];

  // Role-based filtering: finance non-admin sees only their activities
  const activities = canEditAll
    ? allActivities
    : allActivities.filter((a) =>
        a.assigned_to.some((v) => extractEmail(v).toLowerCase() === userEmail.toLowerCase()) ||
        a.approval_users.some((v) => extractEmail(v).toLowerCase() === userEmail.toLowerCase()),
      );

  // Status counts (from filtered list)
  const counts = Object.fromEntries(STATUSES.map((s) => [s.value, 0]));
  activities.forEach((a) => { if (a.status in counts) counts[a.status]++; });

  // Today's pending
  const todayPending = activities.filter((a) => isActivityDueToday(a) && !["completed", "verified"].includes(a.status));

  // SLA notifications
  useSLANotifications(activities);

  let filtered = activities;
  if (filterStatus) filtered = filtered.filter((a) => a.status === filterStatus);
  if (filterDuration) filtered = filtered.filter((a) => a.duration === filterDuration);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((a) =>
      a.activity_name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.activity_id.toLowerCase().includes(q),
    );
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-activities", category] });
    qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
  };

  return (
    <div className="space-y-5">
      {/* Today's activities banner */}
      {todayPending.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center">
              <Sun className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900 text-sm">Today's Pending Activities</h3>
              <p className="text-xs text-amber-600">Deadline: 5:00 PM IST · Auto-overdue after deadline</p>
            </div>
            <span className="ml-auto bg-amber-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {todayPending.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {todayPending.map((a) => {
              const st = STATUS_MAP[a.status];
              return (
                <div key={a.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-amber-100 shadow-sm">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st?.color ?? "#9CA3AF" }} />
                  <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{a.activity_name}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: (st?.color ?? "#9CA3AF") + "20", color: st?.color ?? "#9CA3AF" }}>
                    {st?.label ?? a.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-3">
        {STATUSES.map((s) => {
          const Icon = s.icon;
          const isActive = filterStatus === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setFilterStatus(isActive ? "" : s.value)}
              className={`p-3 rounded-2xl border-2 text-left transition-all hover:shadow-md ${
                isActive ? "shadow-md scale-105" : "hover:scale-105"
              }`}
              style={{
                borderColor: isActive ? s.color : "#E5E7EB",
                backgroundColor: isActive ? s.color + "15" : "white",
              }}
            >
              <Icon className="w-4 h-4 mb-2" style={{ color: s.color }} />
              <p className="text-xl font-black" style={{ color: s.color }}>{counts[s.value]}</p>
              <p className="text-[10px] font-semibold text-gray-500 mt-0.5 leading-tight">{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* Search + filters + create */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Duration filter */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
          <button onClick={() => setFilterDuration("")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${!filterDuration ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            All
          </button>
          {DURATIONS.map((d) => (
            <button key={d.value} onClick={() => setFilterDuration(filterDuration === d.value ? "" : d.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${filterDuration === d.value ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              title={d.label}>{d.value}
            </button>
          ))}
        </div>

        {(filterStatus || filterDuration || search) && (
          <button onClick={() => { setFilterStatus(""); setFilterDuration(""); setSearch(""); }}
            className="text-xs text-blue-600 hover:underline">Clear all</button>
        )}

        {canCreate && (
          <Button onClick={() => { setEditActivity(null); setModalOpen(true); }}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl gap-1.5 ml-auto">
            <Plus className="w-4 h-4" /> Add Activity
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Showing {filtered.length} of {activities.length} activities
        {!canEditAll && <span className="ml-1 text-blue-600 font-medium">(filtered to your assigned activities)</span>}
      </p>

      {/* Activity cards */}
      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading activities…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-gray-400 gap-3">
          <FileText className="w-10 h-10 opacity-20" />
          <p className="text-sm">No activities found</p>
          {canCreate && !filterStatus && !filterDuration && !search && (
            <Button onClick={() => { setEditActivity(null); setModalOpen(true); }} size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              <Plus className="w-4 h-4 mr-1" /> Create First Activity
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((act) => {
            const isApproverForThis = act.approval_users.some(
              (v) => extractEmail(v).toLowerCase() === userEmail.toLowerCase(),
            );
            const isAssignedToThis = act.assigned_to.some(
              (v) => extractEmail(v).toLowerCase() === userEmail.toLowerCase(),
            );
            const canEditThis = canEditAll || isApproverForThis;
            return (
              <ActivityCard
                key={act.id}
                act={act}
                canEdit={canEditThis}
                canDelete={canEditThis}
                canApprove={isApproverForThis}
                isAdmin={canEditAll}
                isFinance={!canEditAll}
                userEmail={userEmail}
                onEdit={() => { setEditActivity(act); setModalOpen(true); }}
                onDelete={() => setDeleteId(act.id)}
                onStatusChange={(id, status) => {
                  if (act.status === "overdue" && status !== "overdue") {
                    setOverdueTarget({ id, newStatus: status });
                    setOverdueReason("");
                  } else {
                    statusPatchMut.mutate({ id, status });
                  }
                }}
                onApprove={(id) => approveMut.mutate({ id, by: userEmail })}
              />
            );
          })}
        </div>
      )}

      {/* Overdue Reason Modal */}
      {overdueTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-red-100">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-2xl px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Reason for Overdue Resolution</h3>
                  <p className="text-orange-100 text-sm">Please explain why this overdue activity is being updated</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Detailed Reason *</label>
              <textarea
                autoFocus
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
                placeholder="Explain the reason for resolving/changing this overdue activity (e.g. issue resolved, reassigned, deadline extended…)"
                value={overdueReason}
                onChange={(e) => setOverdueReason(e.target.value)}
              />
              {overdueReason.trim().length > 0 && (
                <p className="text-xs text-gray-400 mt-1 text-right">{overdueReason.trim().length} characters</p>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setOverdueTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!overdueReason.trim() || statusPatchMut.isPending}
                onClick={() => {
                  statusPatchMut.mutate(
                    { id: overdueTarget.id, status: overdueTarget.newStatus, reason: overdueReason.trim() },
                    { onSuccess: () => setOverdueTarget(null) },
                  );
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm Status Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-gray-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-center mb-1">Delete Activity?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">This action is permanent and cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 rounded-xl h-11">Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl h-11 font-semibold"
                onClick={() => deleteMut.mutate(deleteId!)} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ActivityModal open={modalOpen} onClose={() => setModalOpen(false)}
        category={category} activity={editActivity} onSuccess={refresh} users={users} />
    </div>
  );
}

// ─── Recruitment Tab ──────────────────────────────────────────────────────────
function RecruitmentTab({ canCreate }: { canCreate: boolean }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editPos, setEditPos] = useState<RecruitmentPosition | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-recruitment"],
    queryFn: () => apiFetch("/recruitment"),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/recruitment/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance-recruitment"] }); setDeleteId(null); },
  });

  const positions: RecruitmentPosition[] = data?.positions ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-recruitment"] });
    qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
  };
  const totals = positions.reduce((a, p) => ({
    applied: a.applied + p.cvs_applied, shortlisted: a.shortlisted + p.cvs_shortlist,
    interviewed: a.interviewed + p.cvs_interviewed, on_hold: a.on_hold + p.cvs_on_hold,
    selected: a.selected + p.selected,
  }), { applied: 0, shortlisted: 0, interviewed: 0, on_hold: 0, selected: 0 });

  const conversionRate = totals.applied > 0 ? Math.round((totals.selected / totals.applied) * 100) : 0;

  // Recruitment modal embedded
  const blank = { position_name: "", date_open: "", date_close: "", cvs_applied: 0, cvs_shortlist: 0, cvs_interviewed: 0, cvs_on_hold: 0, selected: 0 };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editPos) {
      setForm({
        position_name: editPos.position_name,
        date_open: editPos.date_open ? editPos.date_open.slice(0, 10) : "",
        date_close: editPos.date_close ? editPos.date_close.slice(0, 10) : "",
        cvs_applied: editPos.cvs_applied, cvs_shortlist: editPos.cvs_shortlist,
        cvs_interviewed: editPos.cvs_interviewed, cvs_on_hold: editPos.cvs_on_hold,
        selected: editPos.selected,
      });
    } else { setForm(blank); }
    setError("");
  }, [editPos, modalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.position_name.trim()) { setError("Position name is required"); return; }
    setSaving(true); setError("");
    try {
      if (editPos) {
        await apiFetch(`/recruitment/${editPos.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await apiFetch("/recruitment", { method: "POST", body: JSON.stringify(form) });
      }
      refresh();
      setModalOpen(false);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          { label: "Positions", value: positions.length, color: "#3B82F6" },
          { label: "Applied",   value: totals.applied,       color: "#8B5CF6" },
          { label: "Shortlisted", value: totals.shortlisted,  color: "#F59E0B" },
          { label: "Interviewed", value: totals.interviewed,  color: "#06B6D4" },
          { label: "On Hold",   value: totals.on_hold,        color: "#F97316" },
          { label: "Selected",  value: totals.selected,       color: "#10B981" },
          { label: "Conv. Rate", value: `${conversionRate}%`, color: "#6366F1" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-2xl p-4 text-center hover:shadow-md transition-shadow">
            <p className="text-2xl font-black" style={{ color: c.color }}>{c.value}</p>
            <p className="text-xs font-semibold text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900">Open Positions</h3>
          <p className="text-sm text-gray-500">{positions.length} position{positions.length !== 1 ? "s" : ""} tracked</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditPos(null); setModalOpen(true); }}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl gap-1.5">
            <Plus className="w-4 h-4" /> Add Position
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      ) : positions.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Users className="w-10 h-10 opacity-20" />
          <p className="text-sm">No positions tracked yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Position", "Date Open", "Date Close", "Applied", "Shortlisted", "Interviewed", "On Hold", "Selected", ""].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-gray-900">{p.position_name}</td>
                    <td className="px-4 py-3.5 text-gray-500">{fmtDate(p.date_open)}</td>
                    <td className="px-4 py-3.5 text-gray-500">{fmtDate(p.date_close)}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-purple-600">{p.cvs_applied}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-amber-600">{p.cvs_shortlist}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-cyan-600">{p.cvs_interviewed}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-orange-600">{p.cvs_on_hold}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 font-black px-2 py-0.5 rounded-full text-xs">
                        <CheckCheck className="w-3 h-3" /> {p.selected}
                      </span>
                    </td>
                    {canCreate && (
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1.5">
                          <button onClick={() => { setEditPos(p); setModalOpen(true); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(p.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">{editPos ? "Edit Position" : "Add New Position"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Position Name *</label>
                <input className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.position_name} onChange={(e) => setForm((f) => ({ ...f, position_name: e.target.value }))}
                  placeholder="e.g. Senior Software Engineer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["date_open","date_close"] as const).map((f) => (
                  <div key={f}>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{f === "date_open" ? "Date Opened" : "Date Closed"}</label>
                    <input type="date" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form[f]} onChange={(e) => setForm((ff) => ({ ...ff, [f]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["cvs_applied","cvs_shortlist","cvs_interviewed","cvs_on_hold","selected"] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                      {field.replace("cvs_","CVs ").replace("_"," ").replace(/\b\w/g,(c)=>c.toUpperCase())}
                    </label>
                    <input type="number" min="0" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form[field] as number} onChange={(e) => setForm((ff) => ({ ...ff, [field]: parseInt(e.target.value)||0 }))} />
                  </div>
                ))}
              </div>
              {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1 rounded-xl h-11">Cancel</Button>
                <Button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl h-11">
                  {saving ? "Saving…" : editPos ? "Update" : "Add Position"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 text-center mb-1">Delete Position?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 rounded-xl">Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl"
                onClick={() => deleteMut.mutate(deleteId!)} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Management Tab ───────────────────────────────────────────────────────────
interface MgmtTask {
  id: number;
  date_initiating: string | null;
  action_items: string;
  open_close: string;
  status_update: string;
  next_action_date: string | null;
  closed_date: string | null;
  created_at: string;
}

const OPEN_CLOSE_OPTS = [
  { value: "open",   label: "Open",   color: "#3B82F6" },
  { value: "closed", label: "Closed", color: "#10B981" },
];

const blankMgmt = {
  date_initiating: "", action_items: "", open_close: "open",
  status_update: "", next_action_date: "", closed_date: "",
};

function ManagementTab({ canCreate }: { canCreate: boolean }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<MgmtTask | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(blankMgmt);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-management-tasks"],
    queryFn: () => apiFetch("/management-tasks"),
    staleTime: 30_000,
  });
  const tasks: MgmtTask[] = data?.tasks ?? [];

  const saveMut = useMutation({
    mutationFn: (body: typeof blankMgmt) =>
      editTask
        ? apiFetch(`/management-tasks/${editTask.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/management-tasks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-management-tasks"] });
      setShowModal(false); setEditTask(null); setForm(blankMgmt);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/management-tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-management-tasks"] });
      setDeleteId(null);
    },
  });

  const openEdit = (t: MgmtTask) => {
    setEditTask(t);
    setForm({
      date_initiating: t.date_initiating?.slice(0, 10) ?? "",
      action_items: t.action_items,
      open_close: t.open_close,
      status_update: t.status_update,
      next_action_date: t.next_action_date?.slice(0, 10) ?? "",
      closed_date: t.closed_date?.slice(0, 10) ?? "",
    });
    setShowModal(true);
  };

  const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Management Tasks</h2>
          <p className="text-xs text-gray-500 mt-0.5">{tasks.length} total records</p>
        </div>
        {canCreate && (
          <button onClick={() => { setEditTask(null); setForm(blankMgmt); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                {["Sl No", "Date of Initiating", "Action Items", "Open / Close", "Status Update", "Next Action Date", "Closed Date", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No tasks yet. Click "Add Task" to get started.</p>
                </td></tr>
              ) : tasks.map((t, idx) => {
                const oc = OPEN_CLOSE_OPTS.find((o) => o.value === t.open_close) ?? OPEN_CLOSE_OPTS[0];
                return (
                  <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtD(t.date_initiating)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium max-w-[220px]">
                      <p className="line-clamp-2">{t.action_items}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
                        style={{ backgroundColor: oc.color + "18", color: oc.color }}>
                        {oc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px]">
                      <p className="line-clamp-2">{t.status_update || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtD(t.next_action_date)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtD(t.closed_date)}</td>
                    <td className="px-4 py-3">
                      {canCreate && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-t-2xl px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">{editTask ? "Edit Task" : "Add Management Task"}</h3>
              <button onClick={() => { setShowModal(false); setEditTask(null); }} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Date of Initiating</label>
                  <input type="date" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={form.date_initiating} onChange={(e) => setForm((f) => ({ ...f, date_initiating: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Open / Close</label>
                  <select className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={form.open_close} onChange={(e) => setForm((f) => ({ ...f, open_close: e.target.value }))}>
                    {OPEN_CLOSE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Action Items *</label>
                <textarea rows={3} required className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  placeholder="Describe the action items…"
                  value={form.action_items} onChange={(e) => setForm((f) => ({ ...f, action_items: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Status Update</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  placeholder="Current status or progress notes…"
                  value={form.status_update} onChange={(e) => setForm((f) => ({ ...f, status_update: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Next Action Date</label>
                  <input type="date" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={form.next_action_date} onChange={(e) => setForm((f) => ({ ...f, next_action_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Closed Date</label>
                  <input type="date" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={form.closed_date} onChange={(e) => setForm((f) => ({ ...f, closed_date: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditTask(null); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                  {saveMut.isPending ? "Saving…" : editTask ? "Update" : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-gray-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-center mb-1">Delete Task?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
interface HistoryRecord {
  id: number;
  activity_ref_id: number;
  history_date: string;
  activity_id: string;
  category: string;
  activity_name: string;
  duration: string;
  status: string;
  reason_non_completion: string;
  assigned_to: string[];
  recorded_at: string;
}

function HistoryTab() {
  const ist = getISTNow();
  const todayIST = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  const [selectedDate, setSelectedDate] = useState(todayIST);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-history", selectedDate],
    queryFn: () => apiFetch(`/history?date=${selectedDate}`),
    staleTime: 30_000,
    enabled: !!selectedDate,
  });

  const records: HistoryRecord[] = data?.history ?? [];

  // Group by category
  const grouped = records.reduce<Record<string, HistoryRecord[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  const totalByStatus = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s.value] = records.filter((r) => r.status === s.value).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header + Date Picker */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <History className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Activity History</h2>
              <p className="text-xs text-gray-500">End-of-day status snapshots per activity</p>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              max={todayIST}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
          </div>
        </div>

        {/* Summary badges */}
        {records.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500 self-center">Summary:</span>
            {STATUSES.filter((s) => totalByStatus[s.value] > 0).map((s) => {
              const Icon = s.icon;
              return (
                <span key={s.value} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: s.bg, color: s.color }}>
                  <Icon className="w-3 h-3" />
                  {s.label}: {totalByStatus[s.value]}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Records */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
          <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No history for this date</p>
          <p className="text-xs text-gray-400 mt-1">Status snapshots are recorded when activities are updated or at midnight IST reset</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, recs]) => (
          <div key={category} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Category header */}
            <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-gray-500" />
                <h3 className="font-bold text-gray-800 text-sm">{CAT_LABEL[category] || category}</h3>
              </div>
              <span className="text-xs text-gray-500 font-medium">{recs.length} activit{recs.length === 1 ? "y" : "ies"}</span>
            </div>

            {/* Activity rows */}
            <div className="divide-y divide-gray-50">
              {recs.map((r) => {
                const st = STATUS_MAP[r.status] ?? { label: r.status, color: "#6B7280", bg: "#F9FAFB", icon: Circle };
                const Icon = st.icon;
                const dur = DURATIONS.find((d) => d.value === r.duration);
                return (
                  <div key={r.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                    {/* Status dot */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: st.bg }}>
                      <Icon className="w-4 h-4" style={{ color: st.color }} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{r.activity_name}</p>
                        <span className="text-[10px] text-gray-400 font-mono">{r.activity_id}</span>
                        {dur && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
                            {dur.label}
                          </span>
                        )}
                      </div>
                      {r.reason_non_completion && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <AlertTriangle className="w-3 h-3 text-orange-500 flex-shrink-0" />
                          <p className="text-xs text-orange-700 line-clamp-1">{r.reason_non_completion}</p>
                        </div>
                      )}
                      {r.assigned_to.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <UserCheck className="w-3 h-3 text-blue-400" />
                          <p className="text-xs text-gray-500">{r.assigned_to.map(extractName).join(", ")}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        Recorded: {new Date(r.recorded_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })} IST
                      </p>
                    </div>

                    {/* Status badge */}
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: st.bg, color: st.color }}>
                      <Icon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ userEmail, canEditAll }: { userEmail: string; canEditAll: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: () => apiFetch("/dashboard"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const statusTotals: { status: string; count: number }[] = data?.status_totals ?? [];
  const activityStats: { category: string; status: string; count: number }[] = data?.activity_stats ?? [];
  const recruitment = data?.recruitment ?? {};
  const recentActivities = data?.recent_activities ?? [];
  const todayDaily: Activity[] = (data?.today_daily ?? []) as Activity[];
  const totalActivities = statusTotals.reduce((s, r) => s + Number(r.count), 0);

  const barData = Object.entries(CAT_LABEL).map(([key, label]) => {
    const row: any = { category: label.split(" ")[0] };
    STATUSES.forEach((s) => {
      const found = activityStats.find((a) => a.category === key && a.status === s.value);
      row[s.value] = found ? Number(found.count) : 0;
    });
    return row;
  });

  const pieData = statusTotals
    .filter((r) => Number(r.count) > 0)
    .map((r) => ({
      name: STATUS_MAP[r.status]?.label ?? r.status,
      value: Number(r.count),
      color: STATUS_MAP[r.status]?.color ?? "#9CA3AF",
    }));

  const funnelData = [
    { name: "Applied",     value: Number(recruitment.total_applied ?? 0),       color: "#8B5CF6" },
    { name: "Shortlisted", value: Number(recruitment.total_shortlisted ?? 0),   color: "#F59E0B" },
    { name: "Interviewed", value: Number(recruitment.total_interviewed ?? 0),   color: "#06B6D4" },
    { name: "On Hold",     value: Number(recruitment.total_on_hold ?? 0),       color: "#F97316" },
    { name: "Selected",    value: Number(recruitment.total_selected ?? 0),      color: "#10B981" },
  ];

  return (
    <div className="space-y-6">
      {/* Today's daily pending */}
      {todayDaily.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900">Today's Daily Activities — {todayDaily.length} pending</h3>
              <p className="text-xs text-amber-600 mt-0.5">All tasks due at 5:00 PM IST · Auto-overdue after deadline · SLA alert at 4:30 PM</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {todayDaily.map((a) => {
              const st = STATUS_MAP[a.status];
              return (
                <div key={a.id} className="flex items-center gap-2.5 bg-white rounded-xl px-3 py-2.5 border border-amber-100 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st?.color ?? "#9CA3AF" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.activity_name}</p>
                    <p className="text-xs text-gray-400">{CAT_LABEL[a.category]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-4">
        {STATUSES.map((s) => {
          const Icon = s.icon;
          const found = statusTotals.find((r) => r.status === s.value);
          const count = Number(found?.count ?? 0);
          const pct = totalActivities > 0 ? Math.round((count / totalActivities) * 100) : 0;
          return (
            <div key={s.value} className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.color + "20" }}>
                  <Icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <span className="text-xs font-bold text-gray-400">{pct}%</span>
              </div>
              <p className="text-3xl font-black" style={{ color: s.color }}>{count}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" /> Activities by Category & Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend iconSize={10} iconType="circle" />
                {STATUSES.map((s) => (
                  <Bar key={s.value} dataKey={s.value} name={s.label} stackId="a" fill={s.color} radius={s.value === "overdue" ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" /> Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value"
                    paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recruitment funnel */}
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" /> Recruitment Funnel
              <span className="ml-auto text-xs font-normal text-gray-500">{recruitment.total_positions ?? 0} positions open</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnelData.map((f, i) => {
                const max = funnelData[0].value || 1;
                const pct = Math.round((f.value / max) * 100);
                return (
                  <div key={f.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-gray-700">{f.name}</span>
                      <span className="font-black" style={{ color: f.color }}>{f.value}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: f.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent activities */}
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-orange-600" /> Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activities yet</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentActivities.map((a: any) => {
                  const st = STATUS_MAP[a.status];
                  const Icon = st?.icon ?? FileText;
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: (st?.color ?? "#9CA3AF") + "20" }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: st?.color ?? "#9CA3AF" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{a.activity_name}</p>
                        <p className="text-xs text-gray-400">{CAT_LABEL[a.category] ?? a.category}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: (st?.color ?? "#9CA3AF") + "20", color: st?.color ?? "#9CA3AF" }}>
                        {st?.label ?? a.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FinanceManagement() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { user } = useAuth();

  const role = (user as any)?.role ?? "";
  const userEmail = (user as any)?.email ?? (user as any)?.username ?? "";
  const isAdmin = role === "admin";
  const isDeptAdmin = role === "department_admin";
  const isFinance = role === "finance";

  // Admin or dept_admin with finance context → see everything
  const canCreate = isAdmin || isFinance;
  const canEditAll = isAdmin || isDeptAdmin;

  // Fetch users for dropdowns
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => { try { return await apiClient.getUsers(); } catch { return []; } },
    staleTime: 5 * 60_000,
  });

  const qcMain = useQueryClient();

  // Auto-overdue: trigger at 5:00 PM IST (Asia/Kolkata) and re-check every minute after
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runAutoOverdue = () => {
      apiFetch("/auto-overdue", { method: "POST" })
        .then(() => {
          qcMain.invalidateQueries({ queryKey: ["finance-activities"] });
          qcMain.invalidateQueries({ queryKey: ["finance-dashboard"] });
        })
        .catch(() => {});
    };

    const startPolling = () => {
      runAutoOverdue();
      intervalId = setInterval(runAutoOverdue, 60_000);
    };

    const ist = getISTNow();
    const istHour = ist.getHours();
    const istMin = ist.getMinutes();

    if (istHour > 17 || (istHour === 17 && istMin >= 0)) {
      // Already at or past 5:00 PM IST — start immediately
      startPolling();
    } else {
      // Schedule to fire exactly at 17:00:00 IST
      const target = new Date(ist);
      target.setHours(17, 0, 0, 0);
      const msUntil5PM = target.getTime() - ist.getTime();
      timeoutId = setTimeout(startPolling, msUntil5PM);
    }

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, []);

  const activityCategories = ["finance_accounts", "taxation", "secretarial", "hr_compliance", "legal_contracts", "agreement_summary", "admin"];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-md">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900">Finance Management</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Encrypted at rest · Auto-overdue daily at 5:00 PM IST · SLA alerts at 4:30 PM
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {userEmail?.[0]?.toUpperCase() || "?"}
                </div>
                <span className="text-xs font-semibold text-gray-700">{role}</span>
              </div>
              {!canCreate && (
                <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl font-semibold border border-amber-200 flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> View mode
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab.key
                      ? "border-green-600 text-green-700 bg-green-50/50"
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === "dashboard" && <DashboardTab userEmail={userEmail} canEditAll={canEditAll} />}
        {activeTab === "recruitment" && <RecruitmentTab canCreate={canCreate} />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "management" && <ManagementTab canCreate={canCreate} />}
        {activityCategories.includes(activeTab) && (
          <ActivityTab
            key={activeTab}
            category={activeTab}
            canCreate={canCreate}
            canEditAll={canEditAll}
            userEmail={userEmail}
            users={users}
          />
        )}
      </div>
    </div>
  );
}
