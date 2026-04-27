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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface CommercialMaterial {
  id: number;
  title: string;
  description?: string;
  file_type: string;
  file_url: string;
}

interface CommercialField {
  id: string;
  key: string;
  label: string;
  value: string;
}

interface CommercialRecord {
  id: number;
  lead_id: number;
  nda_mode: "one-sided" | "mutual" | null;
  signed_status: "signed" | "not_signed";
  document_name_template: string;
  generated_document_name: string;
  selected_materials: CommercialMaterial[];
  document_fields: CommercialField[];
  signed_copy_name?: string;
  signed_copy_path?: string;
  signed_copy_size?: number | null;
  signed_copy_type?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  signed_at?: string | null;
}

interface CommercialFormState {
  nda_mode: "one-sided" | "mutual";
  signed_status: "signed" | "not_signed";
  document_name_template: string;
  selected_materials: CommercialMaterial[];
  document_fields: CommercialField[];
  signed_copy_name: string;
  signed_copy_path: string;
  signed_copy_size: number | null;
  signed_copy_type: string;
}

const DEFAULT_COMMERCIAL_TEMPLATE = "Commercial_{{company_name}}_{{date}}";

function makeCommercialField(key = "", label = "", value = ""): CommercialField {
  return {
    id: `field_${Math.random().toString(36).slice(2, 10)}`,
    key,
    label,
    value,
  };
}

function buildCommercialForm(lead: any, record?: CommercialRecord): CommercialFormState {
  if (record) {
    return {
      nda_mode: record.nda_mode || "one-sided",
      signed_status: record.signed_status || "not_signed",
      document_name_template: record.document_name_template || DEFAULT_COMMERCIAL_TEMPLATE,
      selected_materials: Array.isArray(record.selected_materials) ? record.selected_materials : [],
      document_fields:
        Array.isArray(record.document_fields) && record.document_fields.length > 0
          ? record.document_fields
          : [
              makeCommercialField("company_name", "Company Name", lead?.company_name || ""),
              makeCommercialField("client_name", "Client Name", lead?.client_name || ""),
              makeCommercialField("date", "Date", new Date().toISOString().slice(0, 10)),
            ],
      signed_copy_name: record.signed_copy_name || "",
      signed_copy_path: record.signed_copy_path || "",
      signed_copy_size: record.signed_copy_size ?? null,
      signed_copy_type: record.signed_copy_type || "",
    };
  }

  return {
    nda_mode: "one-sided",
    signed_status: "not_signed",
    document_name_template: DEFAULT_COMMERCIAL_TEMPLATE,
    selected_materials: [],
    document_fields: [
      makeCommercialField("company_name", "Company Name", lead?.company_name || ""),
      makeCommercialField("client_name", "Client Name", lead?.client_name || ""),
      makeCommercialField("date", "Date", new Date().toISOString().slice(0, 10)),
    ],
    signed_copy_name: "",
    signed_copy_path: "",
    signed_copy_size: null,
    signed_copy_type: "",
  };
}

function renderCommercialDocumentName(template: string, fields: CommercialField[]) {
  const values = fields.reduce<Record<string, string>>((acc, field) => {
    const normalizedKey = field.key.trim();
    if (normalizedKey) {
      acc[normalizedKey] = field.value || "";
    }
    return acc;
  }, {});

  const resolved = (template || DEFAULT_COMMERCIAL_TEMPLATE).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const normalizedKey = String(key).trim();
    return values[normalizedKey] || normalizedKey;
  });

  return resolved
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim();
}

async function fetchMaterials() {
  const res = await fetch(`/api/materials?is_published=true`);
  if (!res.ok) throw new Error("Failed to fetch materials");
  return res.json();
}

async function fetchCommercialRecords(leadId: string) {
  const res = await fetch(`/api/lead-management/${leadId}/commercials`);
  if (!res.ok) throw new Error("Failed to fetch commercial records");
  return res.json();
}

async function createCommercialRecord(leadId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/lead-management/${leadId}/commercials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create commercial record");
  return res.json();
}

async function updateCommercialRecord(
  leadId: string,
  recordId: number,
  payload: Record<string, unknown>,
) {
  const res = await fetch(`/api/lead-management/${leadId}/commercials/${recordId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update commercial record");
  return res.json();
}

async function deleteCommercialRecord(leadId: string, recordId: number) {
  const res = await fetch(`/api/lead-management/${leadId}/commercials/${recordId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete commercial record");
  return res.json();
}

async function uploadCommercialSignedCopy(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/files/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Failed to upload signed copy");
  }

  return res.json();
}

export default function LeadOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [visiblePhoneContacts, setVisiblePhoneContacts] = useState<Record<number, boolean>>({});
  const [showCommercialForm, setShowCommercialForm] = useState(false);
  const [editingCommercial, setEditingCommercial] = useState<CommercialRecord | null>(null);
  const [selectedCommercialMaterialId, setSelectedCommercialMaterialId] = useState("");
  const [signedCopyFile, setSignedCopyFile] = useState<File | null>(null);
  const [commercialForm, setCommercialForm] = useState<CommercialFormState>(() => buildCommercialForm(null));

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

  const { data: materialsData = { materials: [] } } = useQuery({
    queryKey: ["materials", "commercial-workflow"],
    queryFn: fetchMaterials,
  });

  const { data: commercialRecordsData = { records: [] } } = useQuery({
    queryKey: ["lead-commercial-records", id],
    queryFn: () => fetchCommercialRecords(id!),
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

  const commercialSaveMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Lead not found");

      let signedCopyPayload = {
        signed_copy_name: commercialForm.signed_copy_name,
        signed_copy_path: commercialForm.signed_copy_path,
        signed_copy_size: commercialForm.signed_copy_size,
        signed_copy_type: commercialForm.signed_copy_type,
      };

      if (signedCopyFile) {
        const uploadResponse = await uploadCommercialSignedCopy(signedCopyFile);
        const uploadedFile = uploadResponse?.files?.[0];
        if (!uploadedFile) {
          throw new Error("Signed copy upload did not return a file");
        }

        signedCopyPayload = {
          signed_copy_name: uploadedFile.originalName,
          signed_copy_path: uploadedFile.path,
          signed_copy_size: uploadedFile.size,
          signed_copy_type: uploadedFile.mimetype,
        };
      }

      const payload = {
        ...commercialForm,
        ...signedCopyPayload,
        generated_document_name: renderCommercialDocumentName(
          commercialForm.document_name_template,
          commercialForm.document_fields,
        ),
        created_by: user?.name || user?.email || "Unknown User",
      };

      if (editingCommercial) {
        return updateCommercialRecord(id, editingCommercial.id, payload);
      }

      return createCommercialRecord(id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-commercial-records", id] });
      setShowCommercialForm(false);
      setEditingCommercial(null);
      setSelectedCommercialMaterialId("");
      setSignedCopyFile(null);
      setCommercialForm(buildCommercialForm(lead));
      toast({
        title: editingCommercial ? "Commercial workflow updated" : "Commercial workflow created",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to save commercial workflow",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const commercialDeleteMutation = useMutation({
    mutationFn: (recordId: number) => {
      if (!id) throw new Error("Lead not found");
      return deleteCommercialRecord(id, recordId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-commercial-records", id] });
      toast({ title: "Commercial workflow deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to delete commercial workflow",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  const lead = leadData?.lead;
  const followUps = followUpsData?.follow_ups || [];
  const demos = demosData?.demos || [];
  const commercialRecords: CommercialRecord[] = commercialRecordsData?.records || [];
  const masterMaterials: CommercialMaterial[] = materialsData?.materials || [];
  const contacts = Array.isArray(lead?.contacts) ? lead.contacts : [];
  const primaryContact = contacts[0] || null;
  const additionalContacts = contacts.slice(1);
  const canViewContactPhones = user?.role === "product";
  const completedDemos = demos.filter(
    (demo: any) => String(demo.status || "").toLowerCase() === "completed",
  );
  const canManageCommercialWorkflow = completedDemos.length > 0;
  const generatedCommercialDocumentName = renderCommercialDocumentName(
    commercialForm.document_name_template,
    commercialForm.document_fields,
  );

  const openCommercialForm = (record?: CommercialRecord) => {
    setEditingCommercial(record || null);
    setCommercialForm(buildCommercialForm(lead, record));
    setSignedCopyFile(null);
    setSelectedCommercialMaterialId("");
    setShowCommercialForm(true);
  };

  const closeCommercialForm = () => {
    setShowCommercialForm(false);
    setEditingCommercial(null);
    setSignedCopyFile(null);
    setSelectedCommercialMaterialId("");
    setCommercialForm(buildCommercialForm(lead));
  };

  const addSelectedCommercialMaterial = () => {
    if (!selectedCommercialMaterialId) return;
    const material = masterMaterials.find(
      (item) => String(item.id) === selectedCommercialMaterialId,
    );
    if (!material) return;

    setCommercialForm((prev) => {
      if (prev.selected_materials.some((item) => item.id === material.id)) {
        return prev;
      }
      return {
        ...prev,
        selected_materials: [...prev.selected_materials, material],
      };
    });
    setSelectedCommercialMaterialId("");
  };

  const removeCommercialMaterial = (materialId: number) => {
    setCommercialForm((prev) => ({
      ...prev,
      selected_materials: prev.selected_materials.filter(
        (item) => item.id !== materialId,
      ),
    }));
  };

  const updateCommercialField = (
    fieldId: string,
    fieldName: keyof CommercialField,
    value: string,
  ) => {
    setCommercialForm((prev) => ({
      ...prev,
      document_fields: prev.document_fields.map((field) =>
        field.id === fieldId ? { ...field, [fieldName]: value } : field,
      ),
    }));
  };

  const addCommercialFieldRow = () => {
    setCommercialForm((prev) => ({
      ...prev,
      document_fields: [...prev.document_fields, makeCommercialField()],
    }));
  };

  const removeCommercialFieldRow = (fieldId: string) => {
    setCommercialForm((prev) => ({
      ...prev,
      document_fields: prev.document_fields.filter((field) => field.id !== fieldId),
    }));
  };

  const handleSaveCommercialWorkflow = () => {
    if (!canManageCommercialWorkflow) {
      toast({
        title: "Complete demo first",
        description: "Share Commercial + NDA becomes available after a demo is completed.",
        variant: "destructive",
      });
      return;
    }

    if (commercialForm.selected_materials.length === 0) {
      toast({
        title: "Select at least one material",
        description: "Choose the commercial materials from master and add them to the list.",
        variant: "destructive",
      });
      return;
    }

    const invalidField = commercialForm.document_fields.find(
      (field) => !field.key.trim() || !field.label.trim(),
    );
    if (invalidField) {
      toast({
        title: "Complete all document fields",
        description: "Each document field needs a label and token key.",
        variant: "destructive",
      });
      return;
    }

    if (
      commercialForm.signed_status === "signed" &&
      !signedCopyFile &&
      !commercialForm.signed_copy_path
    ) {
      toast({
        title: "Upload signed copy",
        description: "A signed workflow must include the signed copy in the application.",
        variant: "destructive",
      });
      return;
    }

    commercialSaveMutation.mutate();
  };

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

      <div className="mt-8">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle>Share Commercial + NDA</CardTitle>
              <p className="text-sm text-gray-600">
                Select master commercial materials, configure document fields, generate a dynamic name, and track signed status with a stored signed copy.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <Badge className={canManageCommercialWorkflow ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                {canManageCommercialWorkflow
                  ? `${completedDemos.length} completed demo${completedDemos.length > 1 ? "s" : ""}`
                  : "Waiting for completed demo"}
              </Badge>
              <Button onClick={() => openCommercialForm()} disabled={!canManageCommercialWorkflow} className="gap-2">
                <Plus className="h-4 w-4" />
                Share Commercial
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!canManageCommercialWorkflow && (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Complete the demo stage first. This screen becomes the next step only after at least one demo is marked completed.
              </div>
            )}

            {showCommercialForm && (
              <div className="rounded-2xl border bg-slate-50 p-5 space-y-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {editingCommercial ? "Edit shared commercial" : "New shared commercial"}
                    </h3>
                    <p className="text-sm text-slate-600">
                      Configure the commercial package, NDA type, dynamic fields, and signing status.
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={closeCommercialForm}>
                    Cancel
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>NDA type</Label>
                    <Select
                      value={commercialForm.nda_mode}
                      onValueChange={(value: "one-sided" | "mutual") =>
                        setCommercialForm((prev) => ({ ...prev, nda_mode: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-sided">One-Sided NDA</SelectItem>
                        <SelectItem value="mutual">Mutual NDA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Signed status</Label>
                    <Select
                      value={commercialForm.signed_status}
                      onValueChange={(value: "signed" | "not_signed") =>
                        setCommercialForm((prev) => ({ ...prev, signed_status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_signed">Not signed</SelectItem>
                        <SelectItem value="signed">Signed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>Select commercial from master</Label>
                    <Select
                      value={selectedCommercialMaterialId}
                      onValueChange={setSelectedCommercialMaterialId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose master material" />
                      </SelectTrigger>
                      <SelectContent>
                        {masterMaterials.map((material) => (
                          <SelectItem key={material.id} value={String(material.id)}>
                            {material.title} ({material.file_type.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="outline" onClick={addSelectedCommercialMaterial}>
                    Add to list
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Selected materials</Label>
                    <span className="text-xs text-slate-500">
                      {commercialForm.selected_materials.length} selected
                    </span>
                  </div>
                  {commercialForm.selected_materials.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-white px-4 py-3 text-sm text-slate-500">
                      No materials added yet.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3">
                      {commercialForm.selected_materials.map((material) => (
                        <div key={material.id} className="flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1.5 text-sm">
                          <span className="font-medium text-slate-800">{material.title}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {material.file_type}
                          </Badge>
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() => removeCommercialMaterial(material.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Dynamic document name</Label>
                  <Input
                    value={commercialForm.document_name_template}
                    onChange={(e) =>
                      setCommercialForm((prev) => ({
                        ...prev,
                        document_name_template: e.target.value,
                      }))
                    }
                    placeholder="Commercial_{{company_name}}_{{date}}"
                  />
                  <p className="text-xs text-slate-500">
                    Use tokens like {{company_name}}, {{client_name}}, {{date}}.
                  </p>
                  <div className="rounded-xl border bg-white px-4 py-3 text-sm">
                    <span className="text-slate-500">Generated name: </span>
                    <span className="font-medium text-slate-900">{generatedCommercialDocumentName || "—"}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Document fields</Label>
                      <p className="text-xs text-slate-500 mt-1">
                        Add fields that will be filled into the commercial or NDA document.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addCommercialFieldRow}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add field
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {commercialForm.document_fields.map((field) => (
                      <div key={field.id} className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-start">
                        <div className="space-y-2">
                          <Label>Field label</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => updateCommercialField(field.id, "label", e.target.value)}
                            placeholder="Client name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Token key</Label>
                          <Input
                            value={field.key}
                            onChange={(e) => updateCommercialField(field.id, "key", e.target.value)}
                            placeholder="client_name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Value</Label>
                          <Textarea
                            value={field.value}
                            onChange={(e) => updateCommercialField(field.id, "value", e.target.value)}
                            placeholder="Enter value"
                            className="min-h-[88px]"
                          />
                        </div>
                        <div className="flex justify-end md:pt-7">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCommercialFieldRow(field.id)}
                            disabled={commercialForm.document_fields.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Signed copy</Label>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => setSignedCopyFile(e.target.files?.[0] || null)}
                  />
                  {commercialForm.signed_copy_path && !signedCopyFile && (
                    <div className="text-sm text-slate-600">
                      Existing signed copy: <a className="text-blue-600 hover:underline" href={commercialForm.signed_copy_path} target="_blank" rel="noreferrer">{commercialForm.signed_copy_name || "View file"}</a>
                    </div>
                  )}
                  {signedCopyFile && (
                    <div className="text-sm text-slate-600">Ready to upload: {signedCopyFile.name}</div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveCommercialWorkflow} disabled={commercialSaveMutation.isPending}>
                    {commercialSaveMutation.isPending ? "Saving..." : editingCommercial ? "Update workflow" : "Save workflow"}
                  </Button>
                </div>
              </div>
            )}

            {commercialRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-slate-500">
                No commercial shares created yet.
              </div>
            ) : (
              <div className="grid gap-4">
                {commercialRecords.map((record) => (
                  <div key={record.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {record.generated_document_name || record.document_name_template || "Commercial package"}
                          </h3>
                          <Badge variant="outline">{record.nda_mode === "mutual" ? "Mutual NDA" : "One-Sided NDA"}</Badge>
                          <Badge className={record.signed_status === "signed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>
                            {record.signed_status === "signed" ? "Signed" : "Not signed"}
                          </Badge>
                        </div>
                        <div className="text-sm text-slate-600">
                          Created by {record.created_by || "Unknown"} on {new Date(record.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-600">
                          Dynamic template: <span className="font-medium text-slate-900">{record.document_name_template || "—"}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openCommercialForm(record)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm("Delete this shared commercial workflow?")) {
                              commercialDeleteMutation.mutate(record.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Materials from master</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.selected_materials?.length ? (
                            record.selected_materials.map((material) => (
                              <Badge key={`${record.id}-${material.id}`} variant="secondary" className="whitespace-normal text-left">
                                {material.title}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No materials selected</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border bg-slate-50 p-4 lg:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Document fields</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {record.document_fields?.length ? (
                            record.document_fields.map((field) => (
                              <div key={field.id} className="rounded-xl border bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">{field.label || field.key}</p>
                                <p className="mt-1 text-sm font-medium text-slate-900 break-words">{field.value || "—"}</p>
                                <p className="mt-2 text-[11px] text-slate-400">Token: {field.key || "—"}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No document fields configured</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                      <div>
                        Signed at: {record.signed_at ? new Date(record.signed_at).toLocaleString() : "Not signed yet"}
                      </div>
                      <div>
                        Signed copy: {record.signed_copy_path ? (
                          <a href={record.signed_copy_path} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                            {record.signed_copy_name || "View file"}
                          </a>
                        ) : (
                          "Not uploaded"
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
