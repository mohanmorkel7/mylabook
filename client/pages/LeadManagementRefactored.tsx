import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  MapPin,
  Building2,
  Eye,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

// Types
interface Lead {
  id: number;
  company_name: string;
  industry: string;
  company_size: string;
  country: string;
  city?: string;
  status: "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  Contacted: "bg-purple-100 text-purple-800",
  Qualified: "bg-yellow-100 text-yellow-800",
  "Proposal Sent": "bg-orange-100 text-orange-800",
  Won: "bg-green-100 text-green-800",
  Lost: "bg-red-100 text-red-800",
};

const INDUSTRIES = ["Banking", "Fintech", "Payments", "Insurance", "Retail", "Telecom", "Government", "Other"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];

// API
async function fetchLeads(params: Record<string, any>) {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) queryParams.append(key, String(value));
  });
  const res = await fetch(`/api/lead-management?${queryParams}`);
  if (!res.ok) throw new Error("Failed to fetch leads");
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

async function updateLeadStatus(id: number, status: string) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update lead");
  return res.json();
}

// Main Component
export default function LeadManagementRefactored() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  // State
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [sortBy, setSortBy] = useState("created_at");

  // Determine user role for filtering
  const userRole = (user as any)?.role ?? "";
  const isDeptAdmin = (user as any)?.department_admin === true;
  const isFinanceDeptAdmin = isDeptAdmin && (user as any)?.admin_for_department?.toLowerCase() === "finance";
  const showAllLeads = userRole === "admin" || userRole === "product" && userRole !== "product";
  // Note: Adjust logic based on your actual requirements

  // Fetch leads
  const { data, isLoading } = useQuery({
    queryKey: ["leads", filterStatus, search, filterIndustry, filterCountry, sortBy],
    queryFn: () =>
      fetchLeads({
        status: filterStatus,
        search,
        industry: filterIndustry,
        country: filterCountry,
        sortBy,
        sortOrder: "DESC",
        limit: 100,
      }),
    staleTime: 5 * 60_000,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead deleted successfully" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateLeadStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Status updated" });
    },
  });

  const leads = data?.leads || [];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leads</h1>
            <p className="text-gray-600 mt-1">Manage and track your sales leads</p>
          </div>
          <Button onClick={() => navigate("/lead-management/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            {STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {st}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
          </SelectContent>
        </Select>
      </div>

      {/* Leads List - Horizontal Cards */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading leads...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No leads found</div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead: Lead) => (
            <Card
              key={lead.id}
              className="p-4 hover:shadow-md transition cursor-pointer flex items-center justify-between"
              onClick={() => navigate(`/lead-management/${lead.id}/overview`)}
            >
              <div className="flex-1 flex items-center gap-4">
                {/* Lead Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg truncate">{lead.company_name}</h3>
                    <Badge className={STATUS_COLORS[lead.status]}>{lead.status}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {lead.industry}
                    </span>
                    {lead.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {lead.city}, {lead.country}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Status Dropdown */}
                <Select
                  value={lead.status}
                  onValueChange={(newStatus) => {
                    statusMutation.mutate({ id: lead.id, status: newStatus });
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectTrigger className="w-40">
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

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/lead-management/${lead.id}/overview`);
                  }}
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/lead-management/${lead.id}/edit`);
                  }}
                  title="Edit"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this lead?")) {
                      deleteMutation.mutate(lead.id);
                    }
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
