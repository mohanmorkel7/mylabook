import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
// Note: BarChart above is the recharts chart component. BarChart3 from lucide is used as icon.
import {
  Plus, Pencil, Trash2, X, CheckCircle2, Clock, AlertTriangle,
  AlertCircle, ShieldCheck, Briefcase, TrendingUp, Users, FileText, BarChart3,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────
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

// ─── Constants ──────────────────────────────────────────────────────────────
const TABS = [
  { key: "dashboard",         label: "Dashboard" },
  { key: "finance_accounts",  label: "Finance & Accounts" },
  { key: "taxation",          label: "Taxation" },
  { key: "secretarial",       label: "Secretarial" },
  { key: "hr_compliance",     label: "HR Compliance" },
  { key: "legal_contracts",   label: "Legal Contracts" },
  { key: "agreement_summary", label: "Agreement Summary" },
  { key: "recruitment",       label: "Recruitment Tracker" },
];

const STATUSES = [
  { value: "in_progress", label: "In Progress",  color: "#3B82F6", icon: Clock },
  { value: "verified",    label: "Verified",     color: "#8B5CF6", icon: ShieldCheck },
  { value: "completed",   label: "Completed",    color: "#10B981", icon: CheckCircle2 },
  { value: "delayed",     label: "Delayed",      color: "#F59E0B", icon: AlertTriangle },
  { value: "overdue",     label: "Overdue",      color: "#EF4444", icon: AlertCircle },
];

const DURATIONS = [
  { value: "D", label: "Daily (D)" },
  { value: "W", label: "Weekly (W)" },
  { value: "M", label: "Monthly (M)" },
  { value: "Q", label: "Quarterly (Q)" },
  { value: "H", label: "Half-yearly (H)" },
  { value: "Y", label: "Yearly (Y)" },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));
const STATUS_COLORS = Object.fromEntries(STATUSES.map((s) => [s.value, s.color]));

const CAT_LABEL: Record<string, string> = {
  finance_accounts:  "Finance & Accounts",
  taxation:          "Taxation",
  secretarial:       "Secretarial",
  hr_compliance:     "HR Compliance",
  legal_contracts:   "Legal Contracts",
  agreement_summary: "Agreement Summary",
};

// ─── API helpers ─────────────────────────────────────────────────────────────
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

// ─── Activity Modal ──────────────────────────────────────────────────────────
interface ActivityModalProps {
  open: boolean;
  onClose: () => void;
  category: string;
  activity?: Activity | null;
  onSuccess: () => void;
}

function ActivityModal({ open, onClose, category, activity, onSuccess }: ActivityModalProps) {
  const [form, setForm] = useState({
    activity_name: "",
    description: "",
    duration: "M",
    status: "in_progress",
    reason_non_completion: "",
    due_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (activity) {
      setForm({
        activity_name: activity.activity_name || "",
        description: activity.description || "",
        duration: activity.duration || "M",
        status: activity.status || "in_progress",
        reason_non_completion: activity.reason_non_completion || "",
        due_date: activity.due_date ? activity.due_date.slice(0, 10) : "",
      });
    } else {
      setForm({ activity_name: "", description: "", duration: "M", status: "in_progress", reason_non_completion: "", due_date: "" });
    }
    setError("");
  }, [activity, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.activity_name.trim()) { setError("Activity name is required"); return; }
    setSaving(true); setError("");
    try {
      if (activity) {
        await apiFetch(`/activities/${activity.id}`, { method: "PUT", body: JSON.stringify({ ...form, category }) });
      } else {
        await apiFetch("/activities", { method: "POST", body: JSON.stringify({ ...form, category }) });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const needsReason = ["delayed", "overdue"].includes(form.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {activity ? "Edit Activity" : "Create Activity"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Category (display only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              {CAT_LABEL[category] || category}
            </div>
          </div>

          {/* Activity ID (auto-gen) */}
          {activity && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity ID</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-500">
                {activity.activity_id}
              </div>
            </div>
          )}

          {/* Activity name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Name *</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.activity_name}
              onChange={(e) => setForm((f) => ({ ...f, activity_name: e.target.value }))}
              placeholder="Enter activity name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Enter description"
            />
          </div>

          {/* Duration + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration *</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.duration}
                onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </div>

          {/* Reason for non-completion (conditional) */}
          {needsReason && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Non-Completion
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                value={form.reason_non_completion}
                onChange={(e) => setForm((f) => ({ ...f, reason_non_completion: e.target.value }))}
                placeholder="Why was this not completed?"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving…" : activity ? "Update Activity" : "Create Activity"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Tab ────────────────────────────────────────────────────────────
function ActivityTab({ category }: { category: string }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-activities", category],
    queryFn: () => apiFetch(`/activities?category=${category}`),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/activities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-activities", category] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      setDeleteId(null);
    },
  });

  const activities: Activity[] = data?.activities ?? [];

  // Status counts
  const counts = Object.fromEntries(STATUSES.map((s) => [s.value, 0]));
  activities.forEach((a) => { if (a.status in counts) counts[a.status]++; });

  const filtered = filterStatus ? activities.filter((a) => a.status === filterStatus) : activities;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-activities", category] });
    qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
  };

  return (
    <div className="space-y-5">
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {STATUSES.map((s) => {
          const Icon = s.icon;
          const isActive = filterStatus === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setFilterStatus(isActive ? "" : s.value)}
              className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                isActive ? "border-current shadow-md" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
              style={isActive ? { borderColor: s.color, backgroundColor: s.color + "10" } : {}}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: s.color }} />
                <span className="text-xs font-medium text-gray-500">{s.label}</span>
              </div>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{counts[s.value]}</p>
            </button>
          );
        })}
      </div>

      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            {CAT_LABEL[category]} Activities
          </h3>
          <p className="text-sm text-gray-500">
            {filtered.length} {filterStatus ? `${STATUS_MAP[filterStatus]?.label} ` : ""}activities
            {filterStatus && (
              <button
                onClick={() => setFilterStatus("")}
                className="ml-2 text-blue-600 underline text-xs"
              >
                Clear filter
              </button>
            )}
          </p>
        </div>
        <Button
          onClick={() => { setEditActivity(null); setModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add Activity
        </Button>
      </div>

      {/* Activity list */}
      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <FileText className="w-8 h-8 opacity-30" />
          <p>No activities yet. Click "Add Activity" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((act) => {
            const st = STATUS_MAP[act.status];
            const Icon = st?.icon ?? FileText;
            return (
              <div
                key={act.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: (st?.color ?? "#9CA3AF") + "20" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: st?.color ?? "#9CA3AF" }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{act.activity_name}</span>
                          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {act.activity_id}
                          </span>
                          <Badge
                            className="text-[10px] px-1.5"
                            style={{ backgroundColor: (st?.color ?? "#9CA3AF") + "20", color: st?.color ?? "#9CA3AF", border: "none" }}
                          >
                            {st?.label ?? act.status}
                          </Badge>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                            {act.duration}
                          </span>
                        </div>
                        {act.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{act.description}</p>
                        )}
                        {act.reason_non_completion && (
                          <p className="text-xs text-orange-600 mt-1 italic">
                            Reason: {act.reason_non_completion}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => { setEditActivity(act); setModalOpen(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(act.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Due date */}
                    {act.due_date && (
                      <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Due: {new Date(act.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 mb-2">Delete Activity?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => deleteMut.mutate(deleteId!)}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ActivityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        category={category}
        activity={editActivity}
        onSuccess={refresh}
      />
    </div>
  );
}

// ─── Recruitment Tab ─────────────────────────────────────────────────────────
interface RecruitmentModalProps {
  open: boolean;
  onClose: () => void;
  position?: RecruitmentPosition | null;
  onSuccess: () => void;
}

function RecruitmentModal({ open, onClose, position, onSuccess }: RecruitmentModalProps) {
  const blank = { position_name: "", date_open: "", date_close: "", cvs_applied: 0, cvs_shortlist: 0, cvs_interviewed: 0, cvs_on_hold: 0, selected: 0 };
  const [form, setForm] = useState<typeof blank>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (position) {
      setForm({
        position_name: position.position_name,
        date_open: position.date_open ? position.date_open.slice(0, 10) : "",
        date_close: position.date_close ? position.date_close.slice(0, 10) : "",
        cvs_applied: position.cvs_applied,
        cvs_shortlist: position.cvs_shortlist,
        cvs_interviewed: position.cvs_interviewed,
        cvs_on_hold: position.cvs_on_hold,
        selected: position.selected,
      });
    } else {
      setForm(blank);
    }
    setError("");
  }, [position, open]);

  if (!open) return null;

  const num = (field: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: parseInt(e.target.value) || 0 }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.position_name.trim()) { setError("Position name is required"); return; }
    setSaving(true); setError("");
    try {
      if (position) {
        await apiFetch(`/recruitment/${position.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await apiFetch("/recruitment", { method: "POST", body: JSON.stringify(form) });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {position ? "Edit Position" : "Add Position"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Position Name *</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.position_name}
              onChange={(e) => setForm((f) => ({ ...f, position_name: e.target.value }))}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Opened</label>
              <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.date_open} onChange={(e) => setForm((f) => ({ ...f, date_open: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Closed</label>
              <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.date_close} onChange={(e) => setForm((f) => ({ ...f, date_close: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              ["cvs_applied", "CVs Applied"],
              ["cvs_shortlist", "CVs Shortlisted"],
              ["cvs_interviewed", "CVs Interviewed"],
              ["cvs_on_hold", "CVs On Hold"],
              ["selected", "Selected"],
            ] as [keyof typeof blank, string][]).map(([field, label]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="number" min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form[field] as number}
                  onChange={num(field)}
                />
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving…" : position ? "Update" : "Add Position"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecruitmentTab() {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-recruitment"] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      setDeleteId(null);
    },
  });

  const positions: RecruitmentPosition[] = data?.positions ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-recruitment"] });
    qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
  };

  // Summary cards
  const totals = positions.reduce(
    (acc, p) => ({
      applied: acc.applied + p.cvs_applied,
      shortlisted: acc.shortlisted + p.cvs_shortlist,
      interviewed: acc.interviewed + p.cvs_interviewed,
      on_hold: acc.on_hold + p.cvs_on_hold,
      selected: acc.selected + p.selected,
    }),
    { applied: 0, shortlisted: 0, interviewed: 0, on_hold: 0, selected: 0 },
  );

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Open Positions", value: positions.length, color: "#3B82F6" },
          { label: "CVs Applied", value: totals.applied, color: "#8B5CF6" },
          { label: "Shortlisted", value: totals.shortlisted, color: "#F59E0B" },
          { label: "Interviewed", value: totals.interviewed, color: "#06B6D4" },
          { label: "On Hold", value: totals.on_hold, color: "#F97316" },
          { label: "Selected", value: totals.selected, color: "#10B981" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Open Positions ({positions.length})</h3>
        <Button onClick={() => { setEditPos(null); setModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
          <Plus className="w-4 h-4" /> Add Position
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      ) : positions.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <Users className="w-8 h-8 opacity-30" />
          <p>No positions yet. Click "Add Position" to add one.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Position", "Date Open", "Date Close", "Applied", "Shortlisted", "Interviewed", "On Hold", "Selected", ""].map(
                    (h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.position_name}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(p.date_open)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(p.date_close)}</td>
                    <td className="px-4 py-3 text-center font-medium text-purple-600">{p.cvs_applied}</td>
                    <td className="px-4 py-3 text-center font-medium text-amber-600">{p.cvs_shortlist}</td>
                    <td className="px-4 py-3 text-center font-medium text-cyan-600">{p.cvs_interviewed}</td>
                    <td className="px-4 py-3 text-center font-medium text-orange-600">{p.cvs_on_hold}</td>
                    <td className="px-4 py-3 text-center font-bold text-green-600">{p.selected}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setEditPos(p); setModalOpen(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteId(p.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 mb-2">Delete Position?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => deleteMut.mutate(deleteId!)} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <RecruitmentModal open={modalOpen} onClose={() => setModalOpen(false)} position={editPos} onSuccess={refresh} />
    </div>
  );
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
const CHART_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: () => apiFetch("/dashboard"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading dashboard…</div>;
  }

  const statusTotals: { status: string; count: number }[] = data?.status_totals ?? [];
  const categoryCounts: { category: string; count: number }[] = data?.category_counts ?? [];
  const recruitment = data?.recruitment ?? {};
  const recentActivities = data?.recent_activities ?? [];

  const totalActivities = statusTotals.reduce((s, r) => s + Number(r.count), 0);

  // Aggregate per-category status breakdown
  const activityStats: { category: string; status: string; count: number }[] = data?.activity_stats ?? [];

  // Build stacked bar data per category
  const barData = Object.entries(CAT_LABEL).map(([key, label]) => {
    const row: any = { category: label.split(" ")[0] };
    STATUSES.forEach((s) => {
      const found = activityStats.find((a) => a.category === key && a.status === s.value);
      row[s.value] = found ? Number(found.count) : 0;
    });
    return row;
  });

  // Pie data
  const pieData = statusTotals.map((r) => ({
    name: STATUS_MAP[r.status]?.label ?? r.status,
    value: Number(r.count),
    color: STATUS_COLORS[r.status] ?? "#9CA3AF",
  }));

  // Recruitment funnel
  const funnelData = [
    { name: "Applied",      value: Number(recruitment.total_applied ?? 0) },
    { name: "Shortlisted",  value: Number(recruitment.total_shortlisted ?? 0) },
    { name: "Interviewed",  value: Number(recruitment.total_interviewed ?? 0) },
    { name: "On Hold",      value: Number(recruitment.total_on_hold ?? 0) },
    { name: "Selected",     value: Number(recruitment.total_selected ?? 0) },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STATUSES.map((s) => {
          const Icon = s.icon;
          const found = statusTotals.find((r) => r.status === s.value);
          const count = Number(found?.count ?? 0);
          return (
            <Card key={s.value}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: s.color + "20" }}>
                    <Icon className="w-4 h-4" style={{ color: s.color }} />
                  </div>
                  <span className="text-xs font-medium text-gray-500">{s.label}</span>
                </div>
                <p className="text-3xl font-bold" style={{ color: s.color }}>{count}</p>
                <p className="text-xs text-gray-400 mt-1">{totalActivities > 0 ? Math.round((count / totalActivities) * 100) : 0}% of total</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stacked bar by category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" /> Activities by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend iconSize={10} />
                {STATUSES.map((s) => (
                  <Bar key={s.value} dataKey={s.value} name={s.label} stackId="a" fill={s.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" /> Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recruitment funnel + recent activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recruitment funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" /> Recruitment Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Open Positions</span>
                <span className="font-bold text-blue-600 text-base">{recruitment.total_positions ?? 0}</span>
              </div>
              {funnelData.map((f, i) => {
                const max = funnelData[0].value || 1;
                const pct = Math.round((f.value / max) * 100);
                return (
                  <div key={f.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600">{f.name}</span>
                      <span className="font-semibold text-gray-800">{f.value}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent activities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-orange-600" /> Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activities yet</p>
            ) : (
              <div className="space-y-2">
                {recentActivities.map((a: any) => {
                  const st = STATUS_MAP[a.status];
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: st?.color ?? "#9CA3AF" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{a.activity_name}</p>
                        <p className="text-xs text-gray-400">{CAT_LABEL[a.category] ?? a.category}</p>
                      </div>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: (st?.color ?? "#9CA3AF") + "20", color: st?.color ?? "#9CA3AF" }}
                      >
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

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function FinanceManagement() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Finance Management</h1>
            <p className="text-sm text-gray-500">All data is stored encrypted — secure at rest</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "recruitment" && <RecruitmentTab />}
        {["finance_accounts", "taxation", "secretarial", "hr_compliance", "legal_contracts", "agreement_summary"].includes(activeTab) && (
          <ActivityTab key={activeTab} category={activeTab} />
        )}
      </div>
    </div>
  );
}
