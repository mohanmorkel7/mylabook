import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash2, Clock, MapPin, Globe, Building2, Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { FollowUpForm } from "@/components/FollowUpForm";
import { FollowUpDetail } from "@/components/FollowUpDetail";

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  Contacted: "bg-purple-100 text-purple-800",
  Qualified: "bg-yellow-100 text-yellow-800",
  "Proposal Sent": "bg-orange-100 text-orange-800",
  Won: "bg-green-100 text-green-800",
  Lost: "bg-red-100 text-red-800",
};

async function fetchLead(id: string) {
  const res = await fetch(`/api/lead-management/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

async function deleteLead(id: string) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to delete lead");
  return res.json();
}

async function fetchFollowUps(id: string) {
  const res = await fetch(`/api/lead-followups/lead/${id}`);
  if (!res.ok) throw new Error("Failed to fetch follow-ups");
  return res.json();
}

export default function LeadOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);

  const { data: leadData, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead(id!),
    enabled: !!id,
  });

  const { data: followUpsData } = useQuery({
    queryKey: ["lead-followups", id],
    queryFn: () => fetchFollowUps(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(id!),
    onSuccess: () => {
      toast({ title: "Lead deleted successfully" });
      navigate("/lead-management");
    },
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  const lead = leadData?.lead;
  const followUps = followUpsData?.follow_ups || [];

  if (!lead) return <div className="p-6">Lead not found</div>;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => navigate("/lead-management")}
          className="gap-2 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{lead.company_name}</h1>
            <p className="text-gray-600 mt-1">{lead.industry}</p>
          </div>
          <div className="flex gap-2">
            <Badge className={STATUS_COLORS[lead.status]}>{lead.status}</Badge>
            <Button
              variant="outline"
              onClick={() => navigate(`/lead-management/${id}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Delete this lead?")) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Company Size</label>
                  <p className="mt-1">{lead.company_size}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Revenue Band</label>
                  <p className="mt-1">{lead.annual_revenue_band || "—"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Country</label>
                  <p className="mt-1">{lead.country}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Years in Business</label>
                  <p className="mt-1">{lead.years_in_business || "—"}</p>
                </div>
              </div>

              {lead.company_website && (
                <div className="pt-4 border-t">
                  <label className="text-sm font-medium text-gray-500">Website</label>
                  <p className="mt-1">
                    <a
                      href={lead.company_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Globe className="h-4 w-4" />
                      {lead.company_website}
                    </a>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Follow-ups */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Follow-ups ({followUps.length})</CardTitle>
              <Button
                size="sm"
                onClick={() => setShowFollowUpForm(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Follow-up
              </Button>
            </CardHeader>
            <CardContent>
              {followUps.length === 0 ? (
                <p className="text-gray-500">No follow-ups scheduled</p>
              ) : (
                <div className="space-y-2">
                  {followUps.map((fu: any) => (
                    <FollowUpDetail
                      key={fu.id}
                      followUp={fu}
                      leadId={lead.id}
                      onUpdate={() => qc.invalidateQueries({ queryKey: ["lead-followups", id] })}
                      onDelete={() => qc.invalidateQueries({ queryKey: ["lead-followups", id] })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Created</label>
                <p className="text-sm">{new Date(lead.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Last Updated</label>
                <p className="text-sm">{new Date(lead.updated_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Follow-up Form Dialog */}
      {lead && (
        <FollowUpForm
          leadId={lead.id}
          leadName={lead.company_name}
          open={showFollowUpForm}
          onOpenChange={setShowFollowUpForm}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["lead-followups", id] })}
        />
      )}
    </div>
  );
}
