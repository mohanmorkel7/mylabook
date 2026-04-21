import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Edit, Trash2, Clock, MapPin, Globe, Building2, Plus, Video, Calendar, Eye, EyeOff, Mail, Phone, Users } from "lucide-react";
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

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"] as const;

function maskPhoneNumber(prefix: string, phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "—";
  const last4 = digits.slice(-4);
  return `${prefix || ""} ${digits.length > 4 ? "•••• " : ""}${last4}`.trim();
}

function formatPhoneNumber(prefix: string, phone: string) {
  const trimmedPhone = String(phone || "").trim();
  if (!trimmedPhone) return "—";
  return `${prefix || ""} ${trimmedPhone}`.trim();
}

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

async function fetchDemosForLead(leadId: string) {
  const res = await fetch(`/api/demos?lead_id=${leadId}`);
  if (!res.ok) throw new Error("Failed to fetch demos");
  return res.json();
}

export default function LeadOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [visiblePhoneContacts, setVisiblePhoneContacts] = useState<Record<number, boolean>>({});

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

  const { data: demosData } = useQuery({
    queryKey: ["demos-by-lead", id],
    queryFn: () => fetchDemosForLead(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Lead deleted successfully" });
      navigate("/lead-management");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/lead-management/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update lead status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-management"] });
      qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Lead status updated" });
    },
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  const lead = leadData?.lead;
  const followUps = followUpsData?.follow_ups || [];
  const demos = demosData?.demos || [];
  const contacts = Array.isArray(lead?.contacts) ? lead.contacts : [];
  const primaryContact = contacts[0] || null;
  const additionalContacts = contacts.slice(1);
  const canViewContactPhones = user?.role === "product";

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
              onClick={() => navigate(`/demo-workshop/new?lead_id=${id}&return_to=${encodeURIComponent(`/lead-management/${id}/overview`)}`)}
              className="gap-2"
            >
              <Video className="h-4 w-4" />
              Schedule Demo
            </Button>
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
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="company-information" className="border rounded-lg bg-white">
              <AccordionTrigger className="px-6 py-4 hover:no-underline text-left">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-col items-start">
                      <span className="text-lg font-semibold">Company Information</span>
                      <span className="text-sm text-gray-500">Summary details</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Legal Name</p>
                        <p className="font-medium text-gray-900">{lead.company_legal_name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Industry</p>
                        <p className="font-medium text-gray-900">{lead.industry || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Company Size</p>
                        <p className="font-medium text-gray-900">{lead.company_size || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Country</p>
                        <p className="font-medium text-gray-900">{lead.country || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">State</p>
                        <p className="font-medium text-gray-900">{lead.state || lead.state_region || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">City</p>
                        <p className="font-medium text-gray-900">{lead.city || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Revenue Band</p>
                        <p className="font-medium text-gray-900">{lead.annual_revenue_band || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                        <p className="font-medium text-gray-900">{lead.status || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <Card className="border-0 shadow-none">
                  <CardContent className="p-0 space-y-6">
                    {/* Basic Company Info */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Legal Name</label>
                        <p className="mt-1">{lead.company_legal_name || "—"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Industry</label>
                          <p className="mt-1">{lead.industry}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Sub Industry</label>
                          <p className="mt-1">{lead.sub_industry || "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Company Metrics */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Company Metrics</h3>
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
                          <label className="text-sm font-medium text-gray-500">Years in Business</label>
                          <p className="mt-1">{lead.years_in_business || "—"}</p>
                        </div>
                        {lead.timezone && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Timezone</label>
                            <p className="mt-1">{lead.timezone}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Client Classification */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Client Classification</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {lead.client_type && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Client Type</label>
                            <p className="mt-1">{lead.client_type}</p>
                          </div>
                        )}
                        {lead.pa_license && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">PA License</label>
                            <p className="mt-1">{lead.pa_license}</p>
                          </div>
                        )}
                        {lead.fully_approved && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Fully Approved</label>
                            <p className="mt-1 capitalize">{lead.fully_approved}</p>
                          </div>
                        )}
                        {lead.geography && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Geography</label>
                            <p className="mt-1">{lead.geography}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Payment & Transaction */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Offerings & Volume</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {lead.payment_offerings && Array.isArray(lead.payment_offerings) && lead.payment_offerings.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Payment Offerings</label>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {lead.payment_offerings.map((offering: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {offering}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {lead.txn_volume && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Txn Volume / Day (M)</label>
                            <p className="mt-1">{lead.txn_volume}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Location */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Location</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-500">Country</label>
                            <p className="mt-1">{lead.country}</p>
                          </div>
                          {lead.state && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">State</label>
                              <p className="mt-1">{lead.state}</p>
                            </div>
                          )}
                          {lead.city && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">City</label>
                              <p className="mt-1">{lead.city}</p>
                            </div>
                          )}
                        </div>
                        {lead.street_address && (
                          <div className="pt-2">
                            <label className="text-sm font-medium text-gray-500">Street Address</label>
                            <p className="mt-1 text-sm">{lead.street_address}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Web & Contact */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Web & Contact</h3>
                      <div className="space-y-3">
                        {lead.website && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Website</label>
                            <p className="mt-1">
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Globe className="h-4 w-4" />
                                {lead.website}
                              </a>
                            </p>
                          </div>
                        )}
                        {lead.linkedin_profile_link && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">LinkedIn Profile</label>
                            <p className="mt-1">
                              <a
                                href={lead.linkedin_profile_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-sm"
                              >
                                View on LinkedIn
                              </a>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Source Information */}
                    {lead.source && (
                      <div className="border-t pt-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Lead Source</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium text-gray-500">Source</label>
                            <p className="mt-1">{lead.source}</p>
                          </div>
                          {lead.source_notes && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Source Notes</label>
                              <p className="mt-1 text-sm">{lead.source_notes}</p>
                            </div>
                          )}
                          {lead.email_subject && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Email Subject</label>
                              <p className="mt-1 text-sm">{lead.email_subject}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Product Tags */}
                    {lead.product_tags && (
                      <div className="border-t pt-4">
                        <label className="text-sm font-medium text-gray-500">Product Tags</label>
                        <p className="mt-1 text-sm">{lead.product_tags}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

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
                      onUpdate={() => {
                        qc.invalidateQueries({ queryKey: ["lead-followups", id] });
                        qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
                        qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
                      }}
                      onDelete={() => {
                        qc.invalidateQueries({ queryKey: ["lead-followups", id] });
                        qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
                        qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
                      }}
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
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500">Lead Status</label>
                <div className="mt-2">
                  <Select
                    value={lead.status}
                    onValueChange={(value) => updateStatusMutation.mutate(value)}
                    disabled={updateStatusMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Contact Information</p>
                    <p className="text-sm text-slate-600">Primary member information and client contacts</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {contacts.length}
                  </Badge>
                </div>

                {primaryContact ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white bg-white p-3 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Primary member information</p>
                          <p className="text-sm font-semibold text-slate-900">Contact #1</p>
                        </div>
                        <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">Primary</Badge>
                      </div>

                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Contact Name</p>
                          <p className="mt-1 font-medium text-slate-900">{primaryContact.contact_name || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Designation</p>
                          <p className="mt-1 font-medium text-slate-900">{primaryContact.designation || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                          <p className="mt-1 flex items-center gap-2 font-medium text-slate-900">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {primaryContact.email || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Phone</p>
                          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                {primaryContact.phone_prefix || "+91"}
                              </p>
                              <p className="mt-1 flex items-center gap-2 font-semibold text-slate-900">
                                <Phone className="h-3.5 w-3.5 text-slate-400" />
                                {canViewContactPhones && visiblePhoneContacts[0]
                                  ? formatPhoneNumber(primaryContact.phone_prefix || "+91", primaryContact.phone)
                                  : maskPhoneNumber(primaryContact.phone_prefix || "+91", primaryContact.phone)}
                              </p>
                            </div>
                            {canViewContactPhones && primaryContact.phone && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0"
                                onClick={() =>
                                  setVisiblePhoneContacts((prev) => ({
                                    ...prev,
                                    0: !prev[0],
                                  }))
                                }
                                title={visiblePhoneContacts[0] ? "Hide phone number" : "Show phone number"}
                              >
                                {visiblePhoneContacts[0] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        {primaryContact.linkedin_profile_link && (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">LinkedIn Profile Link</p>
                            <a
                              href={primaryContact.linkedin_profile_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 block break-all text-sm font-medium text-blue-600 hover:underline"
                            >
                              {primaryContact.linkedin_profile_link}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {additionalContacts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Additional contacts ({additionalContacts.length})</p>
                        {additionalContacts.map((contact: any, contactIndex: number) => {
                          const actualIndex = contactIndex + 1;
                          const isVisible = Boolean(visiblePhoneContacts[actualIndex]);
                          return (
                            <div key={`${contact.contact_name || actualIndex}-${actualIndex}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">Contact #{actualIndex + 1}</p>
                                  <p className="text-xs text-slate-500">Secondary contact</p>
                                </div>
                                <Badge variant="outline">Additional</Badge>
                              </div>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-500">Contact Name</p>
                                  <p className="mt-1 font-medium text-slate-900">{contact.contact_name || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-500">Designation</p>
                                  <p className="mt-1 font-medium text-slate-900">{contact.designation || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                                  <p className="mt-1 font-medium text-slate-900">{contact.email || "—"}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Phone</p>
                                      <p className="mt-1 flex items-center gap-2 font-semibold text-slate-900">
                                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                                        {canViewContactPhones && isVisible
                                          ? formatPhoneNumber(contact.phone_prefix || "+91", contact.phone)
                                          : maskPhoneNumber(contact.phone_prefix || "+91", contact.phone)}
                                      </p>
                                    </div>
                                    {canViewContactPhones && contact.phone && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() =>
                                          setVisiblePhoneContacts((prev) => ({
                                            ...prev,
                                            [actualIndex]: !prev[actualIndex],
                                          }))
                                        }
                                        title={isVisible ? "Hide phone number" : "Show phone number"}
                                      >
                                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {contact.linkedin_profile_link && (
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">LinkedIn Profile Link</p>
                                    <a
                                      href={contact.linkedin_profile_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-1 block break-all text-sm font-medium text-blue-600 hover:underline"
                                    >
                                      {contact.linkedin_profile_link}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No contact information available.</p>
                )}
              </div>

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

          {/* Demos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Demos ({demos.length})</CardTitle>
              <Button
                size="sm"
                onClick={() => navigate(`/demo-workshop/new?lead_id=${id}&return_to=${encodeURIComponent(`/lead-management/${id}/overview`)}`)}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {demos.length === 0 ? (
                <p className="text-sm text-gray-500">No demos scheduled</p>
              ) : (
                <div className="space-y-2">
                  {demos.map((demo: any) => (
                    <div
                      key={demo.id}
                      className="border rounded p-2 hover:bg-gray-50 cursor-pointer transition text-sm"
                      onClick={() => navigate(`/demo-workshop/${demo.id}`)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-xs">{demo.title}</h4>
                        <Badge variant="outline" className="text-xs">{demo.status}</Badge>
                      </div>
                      {demo.demo_date && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Calendar className="h-3 w-3" />
                          {new Date(demo.demo_date).toLocaleDateString([], {
                            month: "short",
                            day: "numeric"
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
