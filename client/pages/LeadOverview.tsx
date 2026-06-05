import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Edit, Trash2, Clock, MapPin, Globe, Building2, Plus, Video, Calendar, Eye, EyeOff, Mail, Phone, Users, Download, GripVertical, Lock, Upload } from "lucide-react";
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

type CommercialMaterialSource = "material" | "document";

interface CommercialDocumentTemplateField {
  key: string;
  label?: string;
  sampleValue?: string;
}

interface CommercialDocumentTemplateBlock {
  type: string;
  content: string;
}

interface CommercialMaterial {
  id: string | number;
  title: string;
  description?: string;
  file_type: string;
  file_url?: string;
  filename?: string;
  source_type?: CommercialMaterialSource;
  document_category?: "commercial" | "nda" | "invoice";
  nda_mode?: "one-sided" | "mutual" | null;
  template_fields?: CommercialDocumentTemplateField[];
  template_blocks?: CommercialDocumentTemplateBlock[];
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
  scope_finalization?: ScopeFinalizationState | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  signed_at?: string | null;
}

type ScopeWorkflowStatus = "in_progress" | "completed" | "overdue";
type ScopeAssignmentTeam =
  | "Development Team"
  | "Infra Team"
  | "Finance Team"
  | "Database Team"
  | "Testing Team"
  | "Product Team";

interface ScopeFeatureItem {
  id: string;
  name: string;
  domain: string;
  team: ScopeAssignmentTeam;
  status: ScopeWorkflowStatus;
  notes?: string;
}

interface CommercialPricingRow {
  id: string;
  item: string;
  inr: string;
  usd: string;
}

interface CommercialPricingPlan {
  id: string;
  label: string;
  items: string[];
}

interface CommercialProductBase {
  id: string;
  label: string;
  plans: CommercialPricingPlan[];
}

interface CommercialPricingWorkbenchState {
  product_base_id: string;
  plan_id: string;
  rows: CommercialPricingRow[];
}

interface ScopeFinalizationState {
  selected_product_ids: string[];
  additional_features: string;
  feature_items: ScopeFeatureItem[];
  commercial_pricing_workbench: CommercialPricingWorkbenchState;
  architecture_file_name: string;
  architecture_file_path: string;
  architecture_file_size: number | null;
  architecture_file_type: string;
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
  scope_finalization: ScopeFinalizationState;
}

const DEFAULT_COMMERCIAL_TEMPLATE = "Commercial_{{company_name}}_{{date}}";
const COMMERCIAL_PRODUCT_BASES: CommercialProductBase[] = [
  {
    id: "product-catalog",
    label: "Product Catalog",
    plans: [
      { id: "plan-1", label: "Plan-1", items: ["Intelle-360", "Intelle-settle"] },
      { id: "plan-2", label: "Plan-2", items: ["3DS", "Switch", "Clearing", "Solve"] },
      { id: "plan-3", label: "Plan-3", items: ["3DS", "Tokenization", "ACS"] },
      { id: "plan-4", label: "Plan-4", items: ["UPI Switch + Recon", "UPI Recon"] },
    ],
  },
];
const DOCUMENT_STORAGE_KEY = "materials_documents_templates_v1";
const SCOPE_TEAMS: ScopeAssignmentTeam[] = [
  "Development Team",
  "Infra Team",
  "Finance Team",
  "Database Team",
  "Testing Team",
  "Product Team",
];
const SCOPE_FEATURE_LIBRARY: Array<{ name: string; domain: string; team: ScopeAssignmentTeam }> = [
  { name: "Client", domain: "Application", team: "Development Team" },
  { name: "Server", domain: "Infrastructure", team: "Infra Team" },
  { name: "Database", domain: "Data", team: "Database Team" },
  { name: "API", domain: "Integration", team: "Development Team" },
  { name: "Token", domain: "Security", team: "Development Team" },
  { name: "AWS", domain: "Infrastructure", team: "Infra Team" },
  { name: "S3 / SFTP", domain: "Infrastructure", team: "Infra Team" },
  { name: "MSSQL", domain: "Data", team: "Database Team" },
  { name: "PostgreSQL", domain: "Data", team: "Database Team" },
  { name: "Reports", domain: "Analytics", team: "Product Team" },
  { name: "FinOps", domain: "Finance", team: "Finance Team" },
  { name: "BAQ", domain: "Quality", team: "Testing Team" },
  { name: "Testing", domain: "Quality", team: "Testing Team" },
  { name: "Staging", domain: "Environment", team: "Infra Team" },
  { name: "Production", domain: "Environment", team: "Infra Team" },
  { name: "Preprod", domain: "Environment", team: "Infra Team" },
  { name: "Development", domain: "Environment", team: "Development Team" },
  { name: "Switch 2.0", domain: "Payments", team: "Development Team" },
  { name: "UPI", domain: "Payments", team: "Development Team" },
  { name: "Invoice", domain: "Finance", team: "Finance Team" },
  { name: "NDA", domain: "Finance", team: "Finance Team" },
];
const FALLBACK_DOCUMENT_TEMPLATES = [
  {
    id: "commercial-proposal",
    name: "Commercial Proposal",
    description: "Commercial proposal for client engagement and scope approval.",
    category: "commercial",
    mode: null,
    fields: [
      { key: "company_name", sampleValue: "Mylapay" },
      { key: "client_name", sampleValue: "Client" },
      { key: "date", sampleValue: new Date().toISOString().slice(0, 10) },
    ],
    blocks: [
      { type: "header", content: "Commercial Proposal" },
      { type: "text", content: "Prepared for {{client_name}} by {{company_name}} on {{date}}." },
      { type: "clause", content: "Scope of work, commercial terms, and timelines are included." },
      { type: "text", content: "{{commercials_table}}" },
    ],
  },
  {
    id: "one-sided-nda",
    name: "One-Sided NDA",
    description: "Protect information shared by one party with standard confidentiality clauses.",
    category: "nda",
    mode: "one-sided",
    fields: [
      { key: "company_name", sampleValue: "Mylapay" },
      { key: "client_name", sampleValue: "Client" },
      { key: "date", sampleValue: new Date().toISOString().slice(0, 10) },
    ],
    blocks: [
      { type: "header", content: "One-Sided NDA" },
      { type: "clause", content: "{{company_name}} agrees to keep confidential information shared by {{client_name}} private." },
      { type: "text", content: "{{commercials_table}}" },
      { type: "signature", content: "Authorized Signatory" },
    ],
  },
  {
    id: "mutual-nda",
    name: "Mutual NDA",
    description: "Shared mutual confidentiality agreement between both parties.",
    category: "nda",
    mode: "mutual",
    fields: [
      { key: "company_name", sampleValue: "Mylapay" },
      { key: "client_name", sampleValue: "Client" },
      { key: "date", sampleValue: new Date().toISOString().slice(0, 10) },
    ],
    blocks: [
      { type: "header", content: "Mutual NDA" },
      { type: "clause", content: "Both {{company_name}} and {{client_name}} agree to protect each other's confidential information." },
      { type: "text", content: "{{commercials_table}}" },
      { type: "signature", content: "Authorized Signatory" },
    ],
  },
] as const;

function makeCommercialField(key = "", label = "", value = ""): CommercialField {
  return {
    id: `field_${Math.random().toString(36).slice(2, 10)}`,
    key,
    label,
    value,
  };
}

function makeScopeFeatureItem(
  name = "",
  domain = "Custom",
  team: ScopeAssignmentTeam = "Product Team",
  status: ScopeWorkflowStatus = "in_progress",
  notes = "",
): ScopeFeatureItem {
  return {
    id: `scope_${Math.random().toString(36).slice(2, 10)}`,
    name,
    domain,
    team,
    status,
    notes,
  };
}

function buildDefaultScopeFinalization(): ScopeFinalizationState {
  return {
    selected_product_ids: [],
    additional_features: "",
    feature_items: [],
    commercial_pricing_workbench: buildCommercialPricingWorkbench(null, null),
    architecture_file_name: "",
    architecture_file_path: "",
    architecture_file_size: null,
    architecture_file_type: "",
  };
}

function makeCommercialPricingRow(item: string, inr = "", usd = ""): CommercialPricingRow {
  return {
    id: `pricing_${Math.random().toString(36).slice(2, 10)}`,
    item,
    inr,
    usd,
  };
}

function getCommercialProductBase(baseId?: string | null) {
  return COMMERCIAL_PRODUCT_BASES.find((base) => base.id === baseId) || COMMERCIAL_PRODUCT_BASES[0];
}

function getCommercialPlan(baseId?: string | null, planId?: string | null) {
  const base = getCommercialProductBase(baseId);
  return base?.plans.find((plan) => plan.id === planId) || base?.plans[0];
}

function normalizeLeadCommercialPricing(lead: any) {
  return Array.isArray(lead?.commercial_pricing)
    ? lead.commercial_pricing
        .map((item: any) => ({
          solution: String(item?.solution || "").trim(),
          value: item?.value === null || item?.value === undefined ? "" : String(item.value),
          currency: String(item?.currency || "").trim().toUpperCase(),
        }))
        .filter((item: any) => Boolean(item.solution))
    : [];
}

function buildCommercialPricingWorkbench(
  lead: any,
  existingWorkbench: CommercialPricingWorkbenchState | null,
  baseId?: string,
  planId?: string,
): CommercialPricingWorkbenchState {
  const selectedBaseId = baseId || existingWorkbench?.product_base_id || COMMERCIAL_PRODUCT_BASES[0]?.id || "";
  const selectedBase = getCommercialProductBase(selectedBaseId);
  const selectedPlanId = planId || existingWorkbench?.plan_id || selectedBase?.plans[0]?.id || "";
  const selectedPlan = getCommercialPlan(selectedBase?.id, selectedPlanId);
  const existingRows = Array.isArray(existingWorkbench?.rows) ? existingWorkbench.rows : [];
  const leadCommercialPricing = normalizeLeadCommercialPricing(lead);

  const rows = (selectedPlan?.items || []).map((item) => {
    const normalizedItem = String(item || "").trim().toLowerCase();
    const existingRow = existingRows.find((row) => String(row.item || "").trim().toLowerCase() === normalizedItem);
    const leadPrice = leadCommercialPricing.find((price) => price.solution.toLowerCase() === normalizedItem);

    return {
      id: existingRow?.id || makeCommercialPricingRow(item).id,
      item,
      inr: existingRow?.inr ?? (leadPrice?.currency === "INR" ? leadPrice.value : ""),
      usd: existingRow?.usd ?? (leadPrice?.currency === "USD" ? leadPrice.value : ""),
    };
  });

  return {
    product_base_id: selectedBase?.id || COMMERCIAL_PRODUCT_BASES[0]?.id || "",
    plan_id: selectedPlan?.id || "",
    rows,
  };
}

function buildCommercialPricingTableHtml(workbench: CommercialPricingWorkbenchState) {
  const base = getCommercialProductBase(workbench.product_base_id);
  const plan = getCommercialPlan(workbench.product_base_id, workbench.plan_id);
  const rows = Array.isArray(workbench.rows) ? workbench.rows : [];
  const renderedRows = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td style="border-top:1px solid #e2e8f0;padding:10px;">${row.item || "—"}</td>
              <td style="border-top:1px solid #e2e8f0;padding:10px;">${row.inr || "—"}</td>
              <td style="border-top:1px solid #e2e8f0;padding:10px;">${row.usd || "—"}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="border-top:1px solid #e2e8f0;padding:10px;">No plan selected.</td></tr>`;

  return `
    <div style="margin-top:20px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.14em;">${base?.label || "Product catalog"}</div>
      <h3 style="margin:8px 0 12px;">${plan?.label || "Selected plan"}</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
        <thead>
          <tr>
            <th style="text-align:left;border-bottom:1px solid #e2e8f0;padding:10px;">Product</th>
            <th style="text-align:left;border-bottom:1px solid #e2e8f0;padding:10px;">INR</th>
            <th style="text-align:left;border-bottom:1px solid #e2e8f0;padding:10px;">USD</th>
          </tr>
        </thead>
        <tbody>
          ${renderedRows}
        </tbody>
      </table>
    </div>
  `;
}

function getScopeFeatureDefinition(featureName: string) {
  const normalizedFeatureName = String(featureName || "").trim().toLowerCase();
  return SCOPE_FEATURE_LIBRARY.find(
    (feature) => feature.name.toLowerCase() === normalizedFeatureName,
  );
}

function getScopeFeatureStatusClasses(status: ScopeWorkflowStatus) {
  if (status === "completed") {
    return {
      badge: "bg-emerald-100 text-emerald-800",
      line: "bg-emerald-500",
      border: "border-emerald-200",
      dot: "bg-emerald-500",
    };
  }

  if (status === "overdue") {
    return {
      badge: "bg-red-100 text-red-800",
      line: "bg-red-500",
      border: "border-red-200",
      dot: "bg-red-500",
    };
  }

  return {
    badge: "bg-blue-100 text-blue-800",
    line: "bg-blue-500",
    border: "border-blue-200",
    dot: "bg-blue-500",
  };
}

function syncScopeFeatureItems(
  selectedFeatureNames: string[] = [],
  existingItems: ScopeFeatureItem[] = [],
) {
  const uniqueSelectedNames = Array.from(
    new Set(selectedFeatureNames.map((name) => String(name || "").trim()).filter(Boolean)),
  );

  return uniqueSelectedNames.map((featureName) => {
    const existingItem = existingItems.find(
      (item) => item.name.trim().toLowerCase() === featureName.toLowerCase(),
    );
    const featureDefinition = getScopeFeatureDefinition(featureName);

    if (existingItem) {
      return {
        ...existingItem,
        domain: existingItem.domain || featureDefinition?.domain || "Custom",
        team: existingItem.team || featureDefinition?.team || "Product Team",
      };
    }

    return makeScopeFeatureItem(
      featureName,
      featureDefinition?.domain || "Custom",
      featureDefinition?.team || "Product Team",
    );
  });
}

function parseAdditionalScopeFeatures(input: string) {
  return Array.from(
    new Set(
      String(input || "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function buildScopeAssignmentSummary(featureItems: ScopeFeatureItem[]) {
  return SCOPE_TEAMS.map((team) => ({
    team,
    items: featureItems.filter((item) => item.team === team),
  })).filter((group) => group.items.length > 0);
}

function getProductLabel(product: any) {
  return product?.product_id ? `${product.name} (${product.product_id})` : product?.name || "Untitled product";
}

function SortableScopeFeatureCard({
  feature,
  index,
  isLast,
  onUpdate,
  onRemove,
}: {
  feature: ScopeFeatureItem;
  index: number;
  isLast: boolean;
  onUpdate: (featureId: string, field: keyof ScopeFeatureItem, value: string) => void;
  onRemove: (featureId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: feature.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const statusClasses = getScopeFeatureStatusClasses(feature.status);

  return (
    <div ref={setNodeRef} style={style} className="relative pl-10">
      <div className={`absolute left-3 top-8 h-3 w-3 rounded-full border-2 border-white ${statusClasses.dot}`} />
      {!isLast && <div className={`absolute left-[17px] top-11 h-[calc(100%-1.25rem)] w-0.5 ${statusClasses.line}`} />}
      <div className={`rounded-2xl border bg-white p-4 shadow-sm ${statusClasses.border} ${isDragging ? "shadow-lg" : ""}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="mt-1 rounded-md border bg-slate-50 p-2 text-slate-500 hover:bg-slate-100 cursor-grab active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{index + 1}. {feature.name}</span>
                <Badge className={statusClasses.badge}>{feature.status.replace("_", " ")}</Badge>
                <Badge variant="outline">{feature.domain}</Badge>
              </div>
              <p className="text-xs text-slate-500">Team assignment: {feature.team}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(feature.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Feature</Label>
            <Input value={feature.name} onChange={(e) => onUpdate(feature.id, "name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Team</Label>
            <Select value={feature.team} onValueChange={(value: ScopeAssignmentTeam) => onUpdate(feature.id, "team", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_TEAMS.map((team) => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={feature.status} onValueChange={(value: ScopeWorkflowStatus) => onUpdate(feature.id, "status", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={feature.notes || ""}
            onChange={(e) => onUpdate(feature.id, "notes", e.target.value)}
            placeholder="Add implementation notes, dependencies, or environment details"
            className="min-h-[72px]"
          />
        </div>
      </div>
    </div>
  );
}

function getCommercialDefaultFields(lead: any): Array<{ key: string; label: string; value: string }> {
  return [
    {
      key: "company_name",
      label: "Company Name",
      value: lead?.company_name || "",
    },
    {
      key: "client_name",
      label: "Client Name",
      value: lead?.client_name || "",
    },
    {
      key: "date",
      label: "Date",
      value: new Date().toISOString().slice(0, 10),
    },
  ];
}

function formatCommercialFieldLabel(key: string) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function syncCommercialDocumentFields(
  lead: any,
  selectedMaterials: CommercialMaterial[] = [],
  existingFields: CommercialField[] = [],
) {
  const definitionMap = new Map<string, { key: string; label: string; value: string }>();

  getCommercialDefaultFields(lead).forEach((field) => {
    definitionMap.set(field.key, field);
  });

  selectedMaterials.forEach((material) => {
    (material.template_fields || []).forEach((field) => {
      const normalizedKey = String(field.key || "").trim();
      if (!normalizedKey) return;

      definitionMap.set(normalizedKey, {
        key: normalizedKey,
        label: field.label || formatCommercialFieldLabel(normalizedKey),
        value: field.sampleValue || "",
      });
    });
  });

  const existingByKey = new Map<string, CommercialField>();
  existingFields.forEach((field) => {
    const normalizedKey = String(field.key || "").trim();
    if (!normalizedKey || existingByKey.has(normalizedKey)) return;
    existingByKey.set(normalizedKey, field);
  });

  const syncedFields = Array.from(definitionMap.values()).map((definition) => {
    const existingField = existingByKey.get(definition.key);
    return {
      id: existingField?.id || makeCommercialField().id,
      key: definition.key,
      label: existingField?.label || definition.label,
      value: existingField?.value ?? definition.value,
    };
  });

  const customFields = existingFields.filter((field) => {
    const normalizedKey = String(field.key || "").trim();
    return !normalizedKey || !definitionMap.has(normalizedKey);
  });

  return [...syncedFields, ...customFields];
}

function hydrateCommercialMaterials(
  selectedMaterials: CommercialMaterial[] = [],
  masterMaterials: CommercialMaterial[] = [],
) {
  return selectedMaterials.map((material) => {
    const latestMaterial = masterMaterials.find(
      (item) => String(item.id) === String(material.id),
    );

    if (!latestMaterial) {
      return material;
    }

    return {
      ...material,
      ...latestMaterial,
      id: material.id,
    };
  });
}

function buildCommercialForm(
  lead: any,
  masterMaterials: CommercialMaterial[] = [],
  record?: CommercialRecord,
): CommercialFormState {
  const selectedMaterials = hydrateCommercialMaterials(
    record && Array.isArray(record.selected_materials) ? record.selected_materials : [],
    masterMaterials,
  );
  const existingFields = record && Array.isArray(record.document_fields) ? record.document_fields : [];

  return {
    nda_mode: record?.nda_mode || "one-sided",
    signed_status: record?.signed_status || "not_signed",
    document_name_template: record?.document_name_template || DEFAULT_COMMERCIAL_TEMPLATE,
    selected_materials: selectedMaterials,
    document_fields: syncCommercialDocumentFields(lead, selectedMaterials, existingFields),
    signed_copy_name: record?.signed_copy_name || "",
    signed_copy_path: record?.signed_copy_path || "",
    signed_copy_size: record?.signed_copy_size ?? null,
    signed_copy_type: record?.signed_copy_type || "",
    scope_finalization: {
      ...buildDefaultScopeFinalization(),
      ...(record?.scope_finalization || {}),
      selected_product_ids: Array.isArray(record?.scope_finalization?.selected_product_ids)
        ? record?.scope_finalization?.selected_product_ids
        : [],
      feature_items: Array.isArray(record?.scope_finalization?.feature_items)
        ? record?.scope_finalization?.feature_items
        : [],
      commercial_pricing_workbench: buildCommercialPricingWorkbench(
        lead,
        record?.scope_finalization?.commercial_pricing_workbench || null,
      ),
    },
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

function replaceTemplateTokens(content: string, values: Record<string, string>) {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const normalizedKey = String(key).trim();
    return values[normalizedKey] ?? `{{${normalizedKey}}}`;
  });
}

function mapDocumentTemplatesToMaterials(templates: any[]): CommercialMaterial[] {
  return templates.map((template: any) => ({
    id: `doc:${template.id}`,
    title: template.name || "Untitled document",
    description: template.description || "",
    file_type: "document",
    source_type: "document" as const,
    document_category: template.category || "commercial",
    nda_mode: template.mode || null,
    template_fields: Array.isArray(template.fields) ? template.fields : [],
    template_blocks: Array.isArray(template.blocks) ? template.blocks : [],
    filename: `${String(template.name || "document").replace(/\s+/g, "_")}.doc`,
  }));
}

function getStoredDocumentTemplates(): CommercialMaterial[] {
  if (typeof window === "undefined") {
    return mapDocumentTemplatesToMaterials([...FALLBACK_DOCUMENT_TEMPLATES]);
  }

  try {
    const rawValue = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);
    if (!rawValue) {
      return mapDocumentTemplatesToMaterials([...FALLBACK_DOCUMENT_TEMPLATES]);
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return mapDocumentTemplatesToMaterials([...FALLBACK_DOCUMENT_TEMPLATES]);
    }

    return mapDocumentTemplatesToMaterials(parsed);
  } catch {
    return mapDocumentTemplatesToMaterials([...FALLBACK_DOCUMENT_TEMPLATES]);
  }
}

function buildDocumentValues(
  material: CommercialMaterial,
  recordFields: CommercialField[] = [],
  extraValues: Record<string, string> = {},
) {
  const templateValues = (material.template_fields || []).reduce<Record<string, string>>(
    (acc, field) => {
      if (field.key) {
        acc[field.key] = field.sampleValue || "";
      }
      return acc;
    },
    {},
  );

  const recordValues = recordFields.reduce<Record<string, string>>((acc, field) => {
    if (field.key) {
      acc[field.key] = field.value || "";
    }
    return acc;
  }, {});

  return { ...templateValues, ...recordValues, ...extraValues };
}

function buildDocumentHtml(
  material: CommercialMaterial,
  recordFields: CommercialField[] = [],
  extraValues: Record<string, string> = {},
) {
  const values = buildDocumentValues(material, recordFields, extraValues);
  const renderedContent = (material.template_blocks || [])
    .map((block) => {
      const rendered = replaceTemplateTokens(block.content || "", values);
      if (rendered.includes("<table") || String(block.content || "").trim() === "{{commercials_table}}") return rendered;
      if (block.type === "header") return `<h1>${rendered}</h1>`;
      if (block.type === "clause") return `<p><strong>Clause:</strong> ${rendered}</p>`;
      if (block.type === "signature") return `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #cbd5e1;"><strong>Signature:</strong> ${rendered}</div>`;
      if (block.type === "footer") return `<div style="margin-top:24px;font-size:12px;color:#64748b;">${rendered}</div>`;
      return `<p>${rendered}</p>`;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${material.title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
          .sheet { max-width: 900px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; }
          h1 { margin: 0 0 20px; }
          p { line-height: 1.7; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <div>
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.18em;">${material.document_category || "document"}</div>
              <h2 style="margin:8px 0 0;">${material.title}</h2>
            </div>
            ${material.nda_mode ? `<div style="font-size:12px;color:#64748b;">${material.nda_mode === "mutual" ? "Mutual NDA" : "One-Sided NDA"}</div>` : ""}
          </div>
          ${renderedContent || "<p>No preview available.</p>"}
        </div>
      </body>
    </html>
  `;
}

function viewCommercialMaterial(
  material: CommercialMaterial,
  recordFields: CommercialField[] = [],
  extraValues: Record<string, string> = {},
) {
  if (material.source_type === "document") {
    const previewWindow = window.open("", "_blank", "width=1024,height=900");
    if (!previewWindow) return;
    previewWindow.document.write(buildDocumentHtml(material, recordFields, extraValues));
    previewWindow.document.close();
    return;
  }

  if (material.file_url) {
    window.open(material.file_url, "_blank", "noopener,noreferrer");
  }
}

function downloadCommercialMaterial(
  material: CommercialMaterial,
  recordFields: CommercialField[] = [],
  extraValues: Record<string, string> = {},
) {
  if (material.source_type === "document") {
    const blob = new Blob([buildDocumentHtml(material, recordFields, extraValues)], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = material.filename || `${material.title.replace(/\s+/g, "_")}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (material.file_url) {
    const link = document.createElement("a");
    link.href = material.file_url;
    link.download = material.filename || material.title;
    link.click();
  }
}

async function fetchMaterials() {
  const res = await fetch(`/api/materials?is_published=true`);
  if (!res.ok) throw new Error("Failed to fetch materials");
  return res.json();
}

async function fetchProductMasters() {
  const res = await fetch(`/api/product-master?is_active=true`);
  if (!res.ok) throw new Error("Failed to fetch product catalog");
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
  const [architectureDiagramFile, setArchitectureDiagramFile] = useState<File | null>(null);
  const [editingCommercialPricingCell, setEditingCommercialPricingCell] = useState<{ rowId: string; field: "inr" | "usd" } | null>(null);
  const [commercialForm, setCommercialForm] = useState<CommercialFormState>(() => buildCommercialForm(null, []));

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

  const { data: productMasters = [] } = useQuery({
    queryKey: ["product-master", "scope-finalization"],
    queryFn: fetchProductMasters,
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
      let architecturePayload = {
        architecture_file_name: commercialForm.scope_finalization.architecture_file_name,
        architecture_file_path: commercialForm.scope_finalization.architecture_file_path,
        architecture_file_size: commercialForm.scope_finalization.architecture_file_size,
        architecture_file_type: commercialForm.scope_finalization.architecture_file_type,
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

      if (architectureDiagramFile) {
        const uploadResponse = await uploadCommercialSignedCopy(architectureDiagramFile);
        const uploadedFile = uploadResponse?.files?.[0];
        if (!uploadedFile) {
          throw new Error("Architecture diagram upload did not return a file");
        }

        architecturePayload = {
          architecture_file_name: uploadedFile.originalName,
          architecture_file_path: uploadedFile.path,
          architecture_file_size: uploadedFile.size,
          architecture_file_type: uploadedFile.mimetype,
        };
      }

      const payload = {
        ...commercialForm,
        ...signedCopyPayload,
        scope_finalization: {
          ...commercialForm.scope_finalization,
          ...architecturePayload,
        },
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
      setArchitectureDiagramFile(null);
      setEditingCommercialPricingCell(null);
      setCommercialForm(buildCommercialForm(lead, masterMaterials));
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

  const scopeWorkflowSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return <div className="p-6">Loading...</div>;

  const lead = leadData?.lead;
  const followUps = followUpsData?.follow_ups || [];
  const demos = demosData?.demos || [];
  const commercialRecords: CommercialRecord[] = commercialRecordsData?.records || [];
  const uploadedMaterials: CommercialMaterial[] = (materialsData?.materials || []).map((material: any) => ({
    ...material,
    source_type: "material" as const,
  }));
  const masterMaterials: CommercialMaterial[] = [
    ...uploadedMaterials,
    ...getStoredDocumentTemplates(),
  ];
  const productCatalogOptions = productMasters.map((product: any) => ({
    label: getProductLabel(product),
    value: String(product.id),
  }));
  const productNameMap = new Map<string, string>(
    productMasters.map((product: any) => [String(product.id), getProductLabel(product)]),
  );
  const commercialPricingWorkbench = commercialForm.scope_finalization.commercial_pricing_workbench;
  const commercialPricingBase = getCommercialProductBase(commercialPricingWorkbench.product_base_id);
  const commercialPricingPlan = getCommercialPlan(
    commercialPricingWorkbench.product_base_id,
    commercialPricingWorkbench.plan_id,
  );
  const commercialPricingTableHtml = buildCommercialPricingTableHtml(commercialPricingWorkbench);
  const commercialPricingBaseOptions = COMMERCIAL_PRODUCT_BASES.map((base) => ({
    label: base.label,
    value: base.id,
  }));
  const commercialPricingPlanOptions = (commercialPricingBase?.plans || []).map((plan) => ({
    label: plan.label,
    value: plan.id,
  }));
  const hydratedCommercialRecords: CommercialRecord[] = commercialRecords.map((record) => {
    const selectedMaterials = hydrateCommercialMaterials(record.selected_materials, masterMaterials);

    return {
      ...record,
      selected_materials: selectedMaterials,
      document_fields: syncCommercialDocumentFields(lead, selectedMaterials, record.document_fields),
      scope_finalization: {
        ...buildDefaultScopeFinalization(),
        ...(record.scope_finalization || {}),
        selected_product_ids: Array.isArray(record.scope_finalization?.selected_product_ids)
          ? record.scope_finalization?.selected_product_ids
          : [],
        feature_items: Array.isArray(record.scope_finalization?.feature_items)
          ? record.scope_finalization?.feature_items
          : [],
      },
    };
  });
  const contacts = Array.isArray(lead?.contacts) ? lead.contacts : [];
  const primaryContact = contacts[0] || null;
  const additionalContacts = contacts.slice(1);
  const canViewContactPhones = user?.role === "product";
  const completedDemos = demos.filter(
    (demo: any) => String(demo.status || "").toLowerCase() === "completed",
  );
  const canManageCommercialWorkflow = completedDemos.length > 0;
  const canManageScopeFinalization =
    commercialForm.signed_status === "signed" &&
    Boolean(signedCopyFile || commercialForm.signed_copy_path);
  const generatedCommercialDocumentName = renderCommercialDocumentName(
    commercialForm.document_name_template,
    commercialForm.document_fields,
  );
  const scopeFeatureLibraryOptions = SCOPE_FEATURE_LIBRARY.map((feature) => ({
    label: `${feature.name} · ${feature.domain} · ${feature.team}`,
    value: feature.name,
  }));
  const selectedLibraryScopeFeatures = commercialForm.scope_finalization.feature_items
    .map((item) => item.name)
    .filter((name) => Boolean(getScopeFeatureDefinition(name)));
  const scopeAssignmentSummary = buildScopeAssignmentSummary(commercialForm.scope_finalization.feature_items);

  const openCommercialForm = (record?: CommercialRecord) => {
    setEditingCommercial(record || null);
    setCommercialForm(buildCommercialForm(lead, masterMaterials, record));
    setSignedCopyFile(null);
    setArchitectureDiagramFile(null);
    setSelectedCommercialMaterialId("");
    setEditingCommercialPricingCell(null);
    setShowCommercialForm(true);
  };

  const closeCommercialForm = () => {
    setShowCommercialForm(false);
    setEditingCommercial(null);
    setSignedCopyFile(null);
    setArchitectureDiagramFile(null);
    setSelectedCommercialMaterialId("");
    setEditingCommercialPricingCell(null);
    setCommercialForm(buildCommercialForm(lead, masterMaterials));
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

      const nextSelectedMaterials = [...prev.selected_materials, material];
      return {
        ...prev,
        selected_materials: nextSelectedMaterials,
        document_fields: syncCommercialDocumentFields(lead, nextSelectedMaterials, prev.document_fields),
      };
    });
    setSelectedCommercialMaterialId("");
  };

  const removeCommercialMaterial = (materialId: string | number) => {
    setCommercialForm((prev) => {
      const nextSelectedMaterials = prev.selected_materials.filter(
        (item) => item.id !== materialId,
      );

      return {
        ...prev,
        selected_materials: nextSelectedMaterials,
        document_fields: syncCommercialDocumentFields(lead, nextSelectedMaterials, prev.document_fields),
      };
    });
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

  const updateScopeFinalization = (updater: (scope: ScopeFinalizationState) => ScopeFinalizationState) => {
    setCommercialForm((prev) => ({
      ...prev,
      scope_finalization: updater(prev.scope_finalization),
    }));
  };

  const updateCommercialPricingWorkbench = (baseId: string, planId?: string) => {
    updateScopeFinalization((scope) => ({
      ...scope,
      commercial_pricing_workbench: buildCommercialPricingWorkbench(
        lead,
        scope.commercial_pricing_workbench,
        baseId,
        planId,
      ),
    }));
    setEditingCommercialPricingCell(null);
  };

  const updateCommercialPricingCell = (rowId: string, field: "inr" | "usd", value: string) => {
    updateScopeFinalization((scope) => ({
      ...scope,
      commercial_pricing_workbench: {
        ...scope.commercial_pricing_workbench,
        rows: scope.commercial_pricing_workbench.rows.map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row,
        ),
      },
    }));
  };

  const syncScopeLibraryFeatures = (selectedFeatureNames: string[]) => {
    updateScopeFinalization((scope) => {
      const customFeatureNames = parseAdditionalScopeFeatures(scope.additional_features);
      return {
        ...scope,
        feature_items: syncScopeFeatureItems(
          [...selectedFeatureNames, ...customFeatureNames],
          scope.feature_items,
        ),
      };
    });
  };

  const addAdditionalScopeFeatures = () => {
    updateScopeFinalization((scope) => ({
      ...scope,
      feature_items: syncScopeFeatureItems(
        [
          ...scope.feature_items
            .filter((item) => Boolean(getScopeFeatureDefinition(item.name)))
            .map((item) => item.name),
          ...parseAdditionalScopeFeatures(scope.additional_features),
        ],
        scope.feature_items,
      ),
    }));
  };

  const updateScopeFeatureItem = (
    featureId: string,
    field: keyof ScopeFeatureItem,
    value: string,
  ) => {
    updateScopeFinalization((scope) => ({
      ...scope,
      feature_items: scope.feature_items.map((item) =>
        item.id === featureId ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const removeScopeFeatureItem = (featureId: string) => {
    updateScopeFinalization((scope) => ({
      ...scope,
      feature_items: scope.feature_items.filter((item) => item.id !== featureId),
    }));
  };

  const handleScopeWorkflowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    updateScopeFinalization((scope) => {
      const oldIndex = scope.feature_items.findIndex((item) => item.id === active.id);
      const newIndex = scope.feature_items.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return scope;

      return {
        ...scope,
        feature_items: arrayMove(scope.feature_items, oldIndex, newIndex),
      };
    });
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

    if (commercialForm.signed_status === "signed") {
      if (commercialForm.scope_finalization.selected_product_ids.length === 0) {
        toast({
          title: "Lock the product and solution",
          description: "Select at least one product from the product catalog before saving scope finalization.",
          variant: "destructive",
        });
        return;
      }

      if (commercialForm.scope_finalization.feature_items.length === 0) {
        toast({
          title: "Add workflow features",
          description: "Choose the scope features to generate the architecture and workflow plan.",
          variant: "destructive",
        });
        return;
      }
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
              variant="outline"
              onClick={() => {
                const record = hydratedCommercialRecords[0];
                if (record) {
                  openCommercialForm(record);
                }
              }}
              disabled={hydratedCommercialRecords.length === 0}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Commercial
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
