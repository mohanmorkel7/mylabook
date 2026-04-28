import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Clock,
  TrendingUp,
  Globe,
  Building2,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Eye,
  BarChart3,
  Calendar,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "@/components/ui/use-toast";

// ── Types ──────────────────────────────────────────────────────────────
interface Lead {
  id: number;
  company_name: string;
  company_legal_name?: string;
  company_website?: string;
  company_logo_url?: string;
  industry: string;
  sub_industry?: string;
  company_size: string;
  annual_revenue_band?: string;
  years_in_business?: number;
  country: string;
  state_region?: string;
  city?: string;
  address?: string;
  timezone?: string;
  preferred_language?: string;
  status: "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";
  created_at: string;
  updated_at: string;
}

interface FollowUp {
  id: number;
  lead_id: number;
  notes: string;
  follow_up_date: string;
  status: "Pending" | "Completed";
  created_at: string;
  updated_at: string;
}

interface DashboardStats {
  total_leads: number;
  by_status: { status: string; count: number }[];
  by_industry: { industry: string; count: number }[];
  by_country: { country: string; count: number }[];
  recent_leads: Lead[];
}

const INDUSTRIES = ["Banking", "Fintech", "Payments", "Insurance", "Retail", "Telecom", "Government", "Other"];
const COMPANY_SIZES = ["1-50", "51-200", "201-1000", "1001-5000", "5000+"];
const REVENUE_BANDS = ["<1M", "1-10M", "10-50M", "50-250M", "250M-1B", "1B+"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];
const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  Contacted: "bg-purple-100 text-purple-800",
  Qualified: "bg-yellow-100 text-yellow-800",
  "Proposal Sent": "bg-orange-100 text-orange-800",
  Won: "bg-green-100 text-green-800",
  Lost: "bg-red-100 text-red-800",
};

// ── API Functions ──────────────────────────────────────────────────────
async function fetchLeads(params: Record<string, any>) {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) queryParams.append(key, String(value));
  });
  const res = await fetch(`/api/lead-management?${queryParams}`);
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

async function fetchLead(id: number) {
  const res = await fetch(`/api/lead-management/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

async function fetchDashboardStats() {
  const res = await fetch("/api/lead-management/dashboard/stats");
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

async function fetchFollowUps(leadId: number) {
  const res = await fetch(`/api/lead-followups/lead/${leadId}`);
  if (!res.ok) throw new Error("Failed to fetch follow-ups");
  return res.json();
}

async function createLead(lead: Partial<Lead>) {
  const res = await fetch("/api/lead-management", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
  if (!res.ok) throw new Error("Failed to create lead");
  return res.json();
}

async function updateLead(id: number, updates: Partial<Lead>) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update lead");
  return res.json();
}

async function deleteLead(id: number) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to delete lead");
  return res.json();
}

async function createFollowUp(followUp: Partial<FollowUp>) {
  const res = await fetch("/api/lead-followups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(followUp),
  });
  if (!res.ok) throw new Error("Failed to create follow-up");
  return res.json();
}

async function updateFollowUp(id: number, updates: Partial<FollowUp>) {
  const res = await fetch(`/api/lead-followups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update follow-up");
  return res.json();
}

async function deleteFollowUp(id: number) {
  const res = await fetch(`/api/lead-followups/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to delete follow-up");
  return res.json();
}

// ── Dashboard Component ────────────────────────────────────────────────
function Dashboard({ onViewLeads }: { onViewLeads: (status?: string) => void }) {
  const { data: stats } = useQuery({
    queryKey: ["lead-dashboard-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 5 * 60_000,
  });

  if (!stats) return <div>Loading dashboard...</div>;

  const statusData = stats.by_status.map((item: any) => ({
    name: item.status,
    value: item.count,
    color: STATUS_COLORS[item.status],
  }));

  const industryData = stats.by_industry.slice(0, 8);
  const countryData = stats.by_country.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-lg transition" onClick={() => onViewLeads()}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_leads}</div>
            <p className="text-xs text-gray-500">All leads</p>
          </CardContent>
        </Card>

        {statusData.slice(0, 3).map((item: any) => (
          <Card key={item.name} className="cursor-pointer hover:shadow-lg transition" onClick={() => onViewLeads(item.name)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.name}</CardTitle>
              <Badge className={item.color}>{item.value}</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-500">{Math.round((item.value / stats.total_leads) * 100)}% of total</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Leads by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={["#3b82f6", "#a855f7", "#eab308", "#f97316", "#22c55e", "#ef4444"][index % 6]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Industry Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Top Industries</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={industryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="industry" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
          <CardDescription>Last 5 added leads</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recent_leads.map((lead: Lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition">
                <div className="flex-1">
                  <p className="font-medium">{lead.company_name}</p>
                  <p className="text-sm text-gray-500">{lead.industry}</p>
                </div>
                <Badge className={STATUS_COLORS[lead.status]}>{lead.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Lead List Component ────────────────────────────────────────────────
function LeadList({ filterStatus, onSelectLead }: { filterStatus?: string; onSelectLead: (lead: Lead) => void }) {
  const [search, setSearch] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("DESC");

  const { data, isLoading } = useQuery({
    queryKey: ["leads", filterStatus, search, filterIndustry, filterCountry, sortBy, sortOrder],
    queryFn: () =>
      fetchLeads({
        status: filterStatus,
        search,
        industry: filterIndustry,
        country: filterCountry,
        sortBy,
        sortOrder,
        limit: 100,
      }),
    staleTime: 5 * 60_000,
  });

  const leads = data?.leads || [];

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by company name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterIndustry} onValueChange={setFilterIndustry}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Industries</SelectItem>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {ind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCountry} onValueChange={setFilterCountry}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Countries</SelectItem>
            <SelectItem value="IN">India</SelectItem>
            <SelectItem value="US">United States</SelectItem>
            <SelectItem value="GB">United Kingdom</SelectItem>
            <SelectItem value="SG">Singapore</SelectItem>
            <SelectItem value="AU">Australia</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger>
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Added</SelectItem>
            <SelectItem value="updated_at">Last Updated</SelectItem>
            <SelectItem value="company_name">Company Name</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leads Grid */}
      {isLoading ? (
        <div className="text-center py-8">Loading leads...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No leads found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map((lead: Lead) => (
            <Card key={lead.id} className="cursor-pointer hover:shadow-lg transition overflow-hidden" onClick={() => onSelectLead(lead)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base line-clamp-2">{lead.company_name}</CardTitle>
                    <CardDescription className="mt-1">{lead.industry}</CardDescription>
                  </div>
                  <Badge className={STATUS_COLORS[lead.status]}>{lead.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3 space-y-2 text-sm">
                {lead.city && <p className="flex items-center gap-2"><MapPin className="h-3 w-3" />{lead.city}</p>}
                {lead.company_size && <p><span className="font-medium">Size:</span> {lead.company_size}</p>}
                {lead.annual_revenue_band && <p><span className="font-medium">Revenue:</span> {lead.annual_revenue_band}</p>}
                <p className="text-xs text-gray-400 mt-2">Added {new Date(lead.created_at).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Follow-up Form Dialog ─────────────────────────────────────────────
function FollowUpFormDialog({
  leadId,
  open,
  onOpenChange,
  onSuccess,
}: {
  leadId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [formData, setFormData] = React.useState({
    notes: "",
    follow_up_date: new Date().toISOString().split("T")[0],
  });

  const createMutation = useMutation({
    mutationFn: (data) =>
      createFollowUp({
        lead_id: leadId,
        ...data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", leadId] });
      toast({ title: "Follow-up created successfully" });
      onOpenChange(false);
      onSuccess();
      setFormData({ notes: "", follow_up_date: new Date().toISOString().split("T")[0] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      lead_id: leadId,
      notes: formData.notes,
      follow_up_date: new Date(`${formData.follow_up_date}T10:00:00`).toISOString(),
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Follow-up</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="follow_up_date">Follow-up Date</Label>
            <Input
              id="follow_up_date"
              type="date"
              value={formData.follow_up_date}
              onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add notes for this follow-up..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Schedule Follow-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Lead Detail Panel ──────────────────────────────────────────────────
function LeadDetail({
  lead,
  onClose,
  onEdit,
  onDelete,
}: {
  lead: Lead;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showFollowUpForm, setShowFollowUpForm] = React.useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["lead", lead.id],
    queryFn: () => fetchLead(lead.id),
  });

  const { data: followUpsData } = useQuery({
    queryKey: ["lead-followups", lead.id],
    queryFn: () => fetchFollowUps(lead.id),
  });

  const updateFollowUpMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateFollowUp(id, { status: status as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", lead.id] });
    },
  });

  const deleteFollowUpMutation = useMutation({
    mutationFn: (id: number) => deleteFollowUp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", lead.id] });
    },
  });

  const leadDetails = data?.lead || lead;
  const followUps = followUpsData?.follow_ups || [];
  const statusHistory = data?.status_history || [];

  return (
    <>
      <Dialog open={!!lead} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle>{leadDetails.company_name}</DialogTitle>
                <DialogDescription>{leadDetails.industry}</DialogDescription>
              </div>
              <Badge className={STATUS_COLORS[leadDetails.status]}>{leadDetails.status}</Badge>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Company Size</label>
                <p className="mt-1">{leadDetails.company_size}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Revenue Band</label>
                <p className="mt-1">{leadDetails.annual_revenue_band || "—"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Country</label>
                <p className="mt-1">{leadDetails.country}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Years in Business</label>
                <p className="mt-1">{leadDetails.years_in_business || "—"} years</p>
              </div>
            </div>

            {/* Contact & Location Info */}
            {(leadDetails.city || leadDetails.state_region || leadDetails.company_website) && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Location & Contact</h4>
                <div className="space-y-2 text-sm">
                  {leadDetails.city && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{leadDetails.city}, {leadDetails.state_region}</p>}
                  {leadDetails.company_website && <p className="flex items-center gap-2"><Globe className="h-4 w-4" /><a href={leadDetails.company_website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{leadDetails.company_website}</a></p>}
                </div>
              </div>
            )}

            {/* Follow-ups */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Follow-ups ({followUps.length})</h4>
                <Button size="sm" variant="outline" onClick={() => setShowFollowUpForm(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {followUps.length === 0 ? (
                <p className="text-sm text-gray-500">No follow-ups scheduled</p>
              ) : (
                <div className="space-y-2">
                  {followUps.map((fu: FollowUp) => (
                    <div key={fu.id} className="p-3 border rounded-lg text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{new Date(fu.follow_up_date).toLocaleDateString()}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={fu.status}
                            onChange={(e) => updateFollowUpMutation.mutate({ id: fu.id, status: e.target.value })}
                            className="text-xs px-2 py-1 border rounded"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Completed">Completed</option>
                          </select>
                          <button
                            onClick={() => {
                              if (confirm("Delete this follow-up?")) {
                                deleteFollowUpMutation.mutate(fu.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-700 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-600 mt-1">{fu.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status History */}
            {statusHistory.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Status History</h4>
                <div className="space-y-2 text-sm">
                  {statusHistory.slice(0, 5).map((h: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-3 w-3" />
                      <span>{h.from_status} → {h.to_status}</span>
                      <span className="text-xs text-gray-400">{new Date(h.changed_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FollowUpFormDialog
        leadId={lead.id}
        open={showFollowUpForm}
        onOpenChange={setShowFollowUpForm}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["lead-followups", lead.id] });
        }}
      />
    </>
  );
}

// ── Lead Form Dialog ───────────────────────────────────────────────────
function LeadFormDialog({
  lead,
  open,
  onOpenChange,
  onSuccess,
}: {
  lead?: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState<Partial<Lead>>(lead || {});

  const createMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => createLead(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Lead created successfully" });
      onOpenChange(false);
      onSuccess();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => updateLead(lead!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead!.id] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Lead updated successfully" });
      onOpenChange(false);
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lead) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "Create New Lead"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Company Name and Legal Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={formData.company_name || ""}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="company_legal_name">Company Legal Name</Label>
              <Input
                id="company_legal_name"
                value={formData.company_legal_name || ""}
                onChange={(e) => setFormData({ ...formData, company_legal_name: e.target.value })}
              />
            </div>
          </div>

          {/* Row 2: Industry and Sub-industry */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="industry">Industry *</Label>
              <Select value={formData.industry || ""} onValueChange={(val) => setFormData({ ...formData, industry: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sub_industry">Sub-industry</Label>
              <Input
                id="sub_industry"
                value={formData.sub_industry || ""}
                onChange={(e) => setFormData({ ...formData, sub_industry: e.target.value })}
              />
            </div>
          </div>

          {/* Row 3: Company Size and Revenue Band */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_size">Company Size *</Label>
              <Select value={formData.company_size || ""} onValueChange={(val) => setFormData({ ...formData, company_size: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="annual_revenue_band">Annual Revenue Band</Label>
              <Select value={formData.annual_revenue_band || ""} onValueChange={(val) => setFormData({ ...formData, annual_revenue_band: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select revenue band" />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_BANDS.map((band) => (
                    <SelectItem key={band} value={band}>
                      {band}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 4: Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                value={formData.country || ""}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                required
                placeholder="e.g., IN, US, GB"
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city || ""}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
          </div>

          {/* Row 5: Website and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_website">Company Website</Label>
              <Input
                id="company_website"
                type="url"
                value={formData.company_website || ""}
                onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status || "New"} onValueChange={(val) => setFormData({ ...formData, status: val as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {lead ? "Update Lead" : "Create Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Lead Management Component ─────────────────────────────────────
export default function LeadManagementPage() {
  const [currentView, setCurrentView] = useState<"dashboard" | "list">("dashboard");
  const [filterStatus, setFilterStatus] = useState<string>();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Lead deleted successfully" });
      setSelectedLead(null);
    },
  });

  const handleViewLeads = (status?: string) => {
    setFilterStatus(status);
    setCurrentView("list");
  };

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
  };

  const handleEditLead = () => {
    setEditingLead(selectedLead);
    setShowFormDialog(true);
    setSelectedLead(null);
  };

  const handleDeleteLead = () => {
    if (selectedLead && confirm("Are you sure you want to delete this lead?")) {
      deleteMutation.mutate(selectedLead.id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Lead Generation Management</h1>
        <p className="text-gray-600 mt-1">Manage and track your sales leads</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setCurrentView("dashboard")}
          className={`pb-3 px-4 font-medium transition ${
            currentView === "dashboard"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <BarChart3 className="inline h-4 w-4 mr-2" />
          Dashboard
        </button>
        <button
          onClick={() => setCurrentView("list")}
          className={`pb-3 px-4 font-medium transition ${
            currentView === "list"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Globe className="inline h-4 w-4 mr-2" />
          All Leads
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <Button onClick={() => { setEditingLead(null); setShowFormDialog(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          New Lead
        </Button>
      </div>

      {/* Content */}
      {currentView === "dashboard" ? (
        <Dashboard onViewLeads={handleViewLeads} />
      ) : (
        <LeadList filterStatus={filterStatus} onSelectLead={handleSelectLead} />
      )}

      {/* Dialogs */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onEdit={handleEditLead}
          onDelete={handleDeleteLead}
        />
      )}

      <LeadFormDialog
        lead={editingLead || undefined}
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        onSuccess={() => {
          setEditingLead(null);
          if (currentView === "list") {
            setCurrentView("dashboard");
          }
        }}
      />
    </div>
  );
}
