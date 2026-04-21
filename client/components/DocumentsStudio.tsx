import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  Building2,
  CircleDollarSign,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Image,
  LayoutTemplate,
  Link2,
  MoveHorizontal,
  Plus,
  ReceiptText,
  Save,
  Search,
  Send,
  Settings2,
  Shield,
  Signature,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Upload,
  Wand2,
} from "lucide-react";

const DOCUMENT_STORAGE_KEY = "materials_documents_templates_v1";
const BRANDING_STORAGE_KEY = "materials_documents_branding_v1";
const HISTORY_STORAGE_KEY = "materials_documents_history_v1";

type DocCategory = "commercial" | "nda" | "invoice";
type NdaMode = "one-sided" | "mutual" | null;
type BlockType = "text" | "header" | "footer" | "table" | "signature" | "image" | "field" | "clause";
type FieldType = "text" | "date" | "number" | "currency" | "textarea";

interface DocumentField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sampleValue: string;
}

interface InvoiceRow {
  id: string;
  item: string;
  quantity: number;
  price: number;
  tax: number;
}

interface DocumentBlock {
  id: string;
  type: BlockType;
  content: string;
  fieldKey?: string;
  alignment: "left" | "center" | "right";
  fontSize: number;
}

interface DocumentTemplate {
  id: string;
  name: string;
  category: DocCategory;
  mode: NdaMode;
  description: string;
  lastEdited: string;
  lastGeneratedAt?: string;
  usageCount: number;
  version: number;
  fields: DocumentField[];
  blocks: DocumentBlock[];
  invoiceRows: InvoiceRow[];
  clauses: string[];
  attachments: string[];
}

interface BrandingProfile {
  companyName: string;
  logoUrl: string;
  address: string;
  email: string;
  phone: string;
}

interface GenerationHistoryItem {
  id: string;
  templateId: string;
  templateName: string;
  generatedAt: string;
  outputType: string;
  status: "success" | "error";
  note: string;
}

const defaultBranding: BrandingProfile = {
  companyName: "Mylapay",
  logoUrl: "",
  address: "Coimbatore, Tamil Nadu, India",
  email: "contact@mylapay.com",
  phone: "+91 98765 43210",
};

const defaultTemplates: DocumentTemplate[] = [
  {
    id: "commercial-proposal",
    name: "Commercial Proposal",
    category: "commercial",
    mode: null,
    description: "Commercial proposal for client engagement and scope approval.",
    lastEdited: new Date().toISOString(),
    usageCount: 12,
    version: 1,
    fields: [
      { id: "company_name", key: "company_name", label: "Company Name", type: "text", required: true, sampleValue: "Mylapay" },
      { id: "client_name", key: "client_name", label: "Client Name", type: "text", required: true, sampleValue: "Mohan Raj" },
      { id: "date", key: "date", label: "Date", type: "date", required: true, sampleValue: "2026-04-21" },
      { id: "address", key: "address", label: "Address", type: "textarea", required: false, sampleValue: "Coimbatore, Tamil Nadu" },
    ],
    blocks: [
      { id: "b1", type: "header", content: "Commercial Proposal", alignment: "center", fontSize: 28 },
      { id: "b2", type: "text", content: "Prepared for {{client_name}} by {{company_name}} on {{date}}.", alignment: "left", fontSize: 16 },
      { id: "b3", type: "clause", content: "Scope of work, timelines, and assumptions are outlined in the sections below.", alignment: "left", fontSize: 15 },
      { id: "b4", type: "signature", content: "Authorized Signatory", alignment: "left", fontSize: 14 },
      { id: "b5", type: "footer", content: "Commercial proposal drafted for internal review.", alignment: "center", fontSize: 12 },
    ],
    invoiceRows: [],
    clauses: ["Scope of work", "Commercial terms", "Timeline and delivery", "Acceptance criteria"],
    attachments: [],
  },
  {
    id: "one-sided-nda",
    name: "One-Sided NDA",
    category: "nda",
    mode: "one-sided",
    description: "Protect information shared by one party with standard confidentiality clauses.",
    lastEdited: new Date().toISOString(),
    usageCount: 18,
    version: 1,
    fields: [
      { id: "company_name", key: "company_name", label: "Company Name", type: "text", required: true, sampleValue: "Mylapay" },
      { id: "client_name", key: "client_name", label: "Client Name", type: "text", required: true, sampleValue: "Acme Corp" },
      { id: "date", key: "date", label: "Effective Date", type: "date", required: true, sampleValue: "2026-04-21" },
      { id: "authorized_signatory", key: "authorized_signatory", label: "Authorized Signatory", type: "text", required: true, sampleValue: "Mohan Raj" },
    ],
    blocks: [
      { id: "n1", type: "header", content: "One-Sided NDA", alignment: "center", fontSize: 28 },
      { id: "n2", type: "clause", content: "{{company_name}} agrees to keep all confidential information shared by {{client_name}} private.", alignment: "left", fontSize: 15 },
      { id: "n3", type: "clause", content: "The receiving party must not disclose or reuse confidential materials except as permitted.", alignment: "left", fontSize: 15 },
      { id: "n4", type: "signature", content: "{{authorized_signatory}}", alignment: "left", fontSize: 14 },
    ],
    invoiceRows: [],
    clauses: ["Definition of confidential information", "Disclosure restrictions", "Term and termination", "Remedies"],
    attachments: [],
  },
  {
    id: "mutual-nda",
    name: "Mutual NDA",
    category: "nda",
    mode: "mutual",
    description: "Shared mutual confidentiality agreement between both parties.",
    lastEdited: new Date().toISOString(),
    usageCount: 9,
    version: 1,
    fields: [
      { id: "company_name", key: "company_name", label: "Company Name", type: "text", required: true, sampleValue: "Mylapay" },
      { id: "client_name", key: "client_name", label: "Client Name", type: "text", required: true, sampleValue: "Partner Ltd" },
      { id: "date", key: "date", label: "Effective Date", type: "date", required: true, sampleValue: "2026-04-21" },
      { id: "authorized_signatory", key: "authorized_signatory", label: "Authorized Signatory", type: "text", required: true, sampleValue: "Mohan Raj" },
    ],
    blocks: [
      { id: "m1", type: "header", content: "Mutual NDA", alignment: "center", fontSize: 28 },
      { id: "m2", type: "clause", content: "Both {{company_name}} and {{client_name}} agree to protect each other's confidential information.", alignment: "left", fontSize: 15 },
      { id: "m3", type: "clause", content: "The obligations are reciprocal and remain effective for the agreed term.", alignment: "left", fontSize: 15 },
      { id: "m4", type: "signature", content: "{{authorized_signatory}}", alignment: "left", fontSize: 14 },
    ],
    invoiceRows: [],
    clauses: ["Reciprocal confidentiality", "Permitted disclosures", "Return or destruction", "Jurisdiction"],
    attachments: [],
  },
  {
    id: "invoice-template",
    name: "Invoice Template",
    category: "invoice",
    mode: null,
    description: "GST-ready invoice with auto-calculated subtotal, tax, and total.",
    lastEdited: new Date().toISOString(),
    usageCount: 21,
    version: 1,
    fields: [
      { id: "company_name", key: "company_name", label: "Company Name", type: "text", required: true, sampleValue: "Mylapay" },
      { id: "client_name", key: "client_name", label: "Client Name", type: "text", required: true, sampleValue: "Acme Corp" },
      { id: "date", key: "date", label: "Invoice Date", type: "date", required: true, sampleValue: "2026-04-21" },
      { id: "authorized_signatory", key: "authorized_signatory", label: "Authorized Signatory", type: "text", required: true, sampleValue: "Mohan Raj" },
    ],
    blocks: [
      { id: "i1", type: "header", content: "Invoice", alignment: "center", fontSize: 28 },
      { id: "i2", type: "table", content: "Itemized services and quantities", alignment: "left", fontSize: 14 },
      { id: "i3", type: "signature", content: "{{authorized_signatory}}", alignment: "left", fontSize: 14 },
    ],
    invoiceRows: [
      { id: "r1", item: "Setup fee", quantity: 1, price: 15000, tax: 18 },
      { id: "r2", item: "Monthly support", quantity: 2, price: 7500, tax: 18 },
    ],
    clauses: [],
    attachments: [],
  },
];

const componentLibrary: { type: BlockType; label: string; icon: JSX.Element; description: string }[] = [
  { type: "header", label: "Header", icon: <Type className="h-4 w-4" />, description: "Title or section heading" },
  { type: "text", label: "Text Block", icon: <FileText className="h-4 w-4" />, description: "Free-form rich text" },
  { type: "clause", label: "Clause", icon: <Shield className="h-4 w-4" />, description: "Legal clause section" },
  { type: "table", label: "Table", icon: <Table2 className="h-4 w-4" />, description: "Invoice line items" },
  { type: "signature", label: "Signature", icon: <Signature className="h-4 w-4" />, description: "Signature block" },
  { type: "image", label: "Image", icon: <Image className="h-4 w-4" />, description: "Logo or uploaded image" },
  { type: "field", label: "Dynamic Field", icon: <Link2 className="h-4 w-4" />, description: "Bind to form data" },
  { type: "footer", label: "Footer", icon: <LayoutTemplate className="h-4 w-4" />, description: "Footer notes or legal text" },
];

function uid(prefix = "doc") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function replacePlaceholders(content: string, values: Record<string, string>) {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => values[key.trim()] ?? `{{${key.trim()}}}`);
}

function makeDefaultFields(category: DocCategory): DocumentField[] {
  const base = [
    { key: "company_name", label: "Company Name", type: "text" as const, required: true, sampleValue: "Mylapay" },
    { key: "client_name", label: "Client Name", type: "text" as const, required: true, sampleValue: "Acme Corp" },
    { key: "date", label: "Date", type: "date" as const, required: true, sampleValue: new Date().toISOString().slice(0, 10) },
    { key: "address", label: "Address", type: "textarea" as const, required: false, sampleValue: "Coimbatore, Tamil Nadu" },
  ];

  if (category === "invoice") {
    base.push({ key: "total_amount", label: "Total Amount", type: "currency", required: false, sampleValue: "24750" });
  }

  if (category === "nda") {
    base.push({ key: "authorized_signatory", label: "Authorized Signatory", type: "text", required: true, sampleValue: "Mohan Raj" });
  }

  return base.map((field) => ({ ...field, id: uid("field") }));
}

function createBlankTemplate(category: DocCategory = "commercial"): DocumentTemplate {
  const mode: NdaMode = category === "nda" ? "one-sided" : null;
  const baseFields = makeDefaultFields(category);
  const blocks: DocumentBlock[] = [
    { id: uid("block"), type: "header", content: category === "invoice" ? "Invoice" : category === "nda" ? "NDA Agreement" : "Commercial Document", alignment: "center", fontSize: 28 },
    { id: uid("block"), type: "text", content: "Enter your content here. Use placeholders like {{company_name}}.", alignment: "left", fontSize: 16 },
    ...(category === "invoice"
      ? [{ id: uid("block"), type: "table" as const, content: "Invoice items", alignment: "left" as const, fontSize: 14 }]
      : []),
    { id: uid("block"), type: "signature", content: "Authorized Signatory", alignment: "left", fontSize: 14 },
  ];

  return {
    id: uid("template"),
    name: category === "invoice" ? "Invoice Template" : category === "nda" ? "NDA Template" : "Commercial Document",
    category,
    mode,
    description: "",
    lastEdited: new Date().toISOString(),
    usageCount: 0,
    version: 1,
    fields: baseFields,
    blocks,
    invoiceRows: category === "invoice"
      ? [
          { id: uid("row"), item: "Service fee", quantity: 1, price: 12000, tax: 18 },
          { id: uid("row"), item: "Support", quantity: 1, price: 3000, tax: 18 },
        ]
      : [],
    clauses: category === "nda"
      ? ["Confidential information definition", "Non-disclosure obligations", "Term and termination", "Remedies"]
      : [],
    attachments: [],
  };
}

function calculateInvoiceTotals(rows: InvoiceRow[]) {
  const subtotal = rows.reduce((sum, row) => sum + row.quantity * row.price, 0);
  const gst = rows.reduce((sum, row) => sum + row.quantity * row.price * (row.tax / 100), 0);
  return { subtotal, gst, total: subtotal + gst };
}

export function DocumentsStudio() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [templates, setTemplates] = useState<DocumentTemplate[]>(() => {
    const saved = safeJsonParse<DocumentTemplate[]>(localStorage.getItem(DOCUMENT_STORAGE_KEY), []);
    return saved.length > 0 ? saved : defaultTemplates;
  });
  const [branding, setBranding] = useState<BrandingProfile>(() =>
    safeJsonParse<BrandingProfile>(localStorage.getItem(BRANDING_STORAGE_KEY), defaultBranding),
  );
  const [history, setHistory] = useState<GenerationHistoryItem[]>(() =>
    safeJsonParse<GenerationHistoryItem[]>(localStorage.getItem(HISTORY_STORAGE_KEY), []),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<"all" | DocCategory>("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || defaultTemplates[0].id);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draftTemplate, setDraftTemplate] = useState<DocumentTemplate | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draggedType, setDraggedType] = useState<BlockType | null>(null);
  const [generationValues, setGenerationValues] = useState<Record<string, string>>({});
  const [generatedPreview, setGeneratedPreview] = useState<string>("");
  const [generateMode, setGenerateMode] = useState<"pdf" | "word" | "email">("pdf");
  const [generationMessage, setGenerationMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding));
  }, [branding]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || templates[0] || null,
    [templates, selectedTemplateId],
  );

  const analytics = useMemo(() => {
    const mostUsed = [...templates].sort((a, b) => b.usageCount - a.usageCount)[0] || null;
    const lastGenerated = [...history].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] || null;
    return {
      mostUsed,
      lastGenerated,
      totalTemplates: templates.length,
      totalGenerations: history.length,
      errorCount: history.filter((item) => item.status === "error").length,
    };
  }, [templates, history]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesCategory = filterCategory === "all" || template.category === filterCategory;
      const matchesSearch =
        !searchTerm ||
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [filterCategory, searchTerm, templates]);

  const openCreateTemplate = (category: DocCategory = "commercial") => {
    if (!isAdmin) {
      toast({ title: "Access denied", description: "Only admins can create templates.", variant: "destructive" });
      return;
    }
    const blank = createBlankTemplate(category);
    setDraftTemplate(blank);
    setEditingTemplateId(null);
    setSelectedBlockId(blank.blocks[0]?.id || null);
    setBuilderOpen(true);
  };

  const openEditTemplate = (template: DocumentTemplate) => {
    if (!isAdmin) {
      toast({ title: "Access denied", description: "Only admins can edit templates.", variant: "destructive" });
      return;
    }
    setDraftTemplate(structuredClone(template));
    setEditingTemplateId(template.id);
    setSelectedBlockId(template.blocks[0]?.id || null);
    setBuilderOpen(true);
  };

  const saveTemplate = () => {
    if (!draftTemplate) return;
    const nextTemplate = {
      ...draftTemplate,
      lastEdited: new Date().toISOString(),
      version: (draftTemplate.version || 0) + 1,
    };

    setTemplates((current) => {
      const exists = current.some((item) => item.id === nextTemplate.id);
      if (exists) {
        return current.map((item) => (item.id === nextTemplate.id ? nextTemplate : item));
      }
      return [nextTemplate, ...current];
    });
    setSelectedTemplateId(nextTemplate.id);
    setBuilderOpen(false);
    setDraftTemplate(null);
    setSelectedBlockId(null);
    toast({ title: "Template saved" });
  };

  const addBlockToTemplate = (type: BlockType) => {
    if (!draftTemplate) return;
    const newBlock: DocumentBlock = {
      id: uid("block"),
      type,
      content:
        type === "header"
          ? "Section heading"
          : type === "signature"
            ? "Authorized Signatory"
            : type === "table"
              ? "Invoice items"
              : type === "image"
                ? branding.logoUrl || "https://"
                : type === "field"
                  ? "company_name"
                  : type === "clause"
                    ? "Clause text"
                    : type === "footer"
                      ? "Footer text"
                      : "Editable text",
      alignment: "left",
      fontSize: type === "header" ? 28 : 16,
    };
    setDraftTemplate((current) => current ? { ...current, blocks: [...current.blocks, newBlock] } : current);
    setSelectedBlockId(newBlock.id);
  };

  const updateDraftBlock = (blockId: string, changes: Partial<DocumentBlock>) => {
    setDraftTemplate((current) =>
      current
        ? { ...current, blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, ...changes } : block)) }
        : current,
    );
  };

  const removeDraftBlock = (blockId: string) => {
    setDraftTemplate((current) =>
      current
        ? { ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }
        : current,
    );
    setSelectedBlockId(null);
  };

  const moveDraftBlock = (blockId: string, direction: "up" | "down") => {
    setDraftTemplate((current) => {
      if (!current) return current;
      const index = current.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return current;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.blocks.length) return current;
      const updated = [...current.blocks];
      const [item] = updated.splice(index, 1);
      updated.splice(target, 0, item);
      return { ...current, blocks: updated };
    });
  };

  const updateDraftField = (fieldId: string, changes: Partial<DocumentField>) => {
    setDraftTemplate((current) =>
      current
        ? { ...current, fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...changes } : field)) }
        : current,
    );
  };

  const addDraftField = () => {
    setDraftTemplate((current) =>
      current
        ? {
            ...current,
            fields: [
              ...current.fields,
              { id: uid("field"), key: `field_${current.fields.length + 1}`, label: "New Field", type: "text", required: false, sampleValue: "Sample value" },
            ],
          }
        : current,
    );
  };

  const removeDraftField = (fieldId: string) => {
    setDraftTemplate((current) =>
      current
        ? { ...current, fields: current.fields.filter((field) => field.id !== fieldId) }
        : current,
    );
  };

  const addInvoiceRow = () => {
    setDraftTemplate((current) =>
      current
        ? {
            ...current,
            invoiceRows: [...current.invoiceRows, { id: uid("row"), item: "New item", quantity: 1, price: 0, tax: 18 }],
          }
        : current,
    );
  };

  const updateInvoiceRow = (rowId: string, changes: Partial<InvoiceRow>) => {
    setDraftTemplate((current) =>
      current
        ? { ...current, invoiceRows: current.invoiceRows.map((row) => (row.id === rowId ? { ...row, ...changes } : row)) }
        : current,
    );
  };

  const removeInvoiceRow = (rowId: string) => {
    setDraftTemplate((current) =>
      current
        ? { ...current, invoiceRows: current.invoiceRows.filter((row) => row.id !== rowId) }
        : current,
    );
  };

  const handleGenerate = (template: DocumentTemplate) => {
    const values = Object.fromEntries(template.fields.map((field) => [field.key, generationValues[field.key] ?? field.sampleValue ?? ""]));
    const renderedBlocks = template.blocks
      .map((block) => {
        if (block.type === "table" && template.category === "invoice") {
          const totals = calculateInvoiceTotals(template.invoiceRows);
          return `Invoice items: Subtotal ${totals.subtotal.toFixed(2)}, GST ${totals.gst.toFixed(2)}, Total ${totals.total.toFixed(2)}`;
        }
        return replacePlaceholders(block.content, values);
      })
      .join("\n\n");

    const output = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${template.name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #0f172a; }
            .sheet { max-width: 794px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; min-height: 1123px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
            .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
            .brand h1 { margin: 0; font-size: 26px; }
            .muted { color: #64748b; font-size: 12px; }
            h2 { margin: 0 0 18px; }
            p { line-height: 1.7; white-space: pre-wrap; }
            table { width: 100%; border-collapse: collapse; margin: 18px 0; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background: #f8fafc; }
            .signature { margin-top: 48px; padding-top: 18px; border-top: 1px solid #cbd5e1; }
            .footer { margin-top: 28px; font-size: 12px; color: #64748b; text-align: center; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="brand">
              <div>
                <h1>${branding.companyName || "Company"}</h1>
                <div class="muted">${branding.address || ""}</div>
                <div class="muted">${branding.email || ""} ${branding.phone ? `| ${branding.phone}` : ""}</div>
              </div>
              <div class="muted">${template.category.toUpperCase()}</div>
            </div>
            ${renderedBlocks.replace(/\n/g, "<br />")}
          </div>
        </body>
      </html>
    `;

    setGeneratedPreview(output);
    setPreviewOpen(true);
    setGeneratorOpen(false);
    setSelectedTemplateId(template.id);
    setTemplates((current) =>
      current.map((item) =>
        item.id === template.id
          ? { ...item, usageCount: item.usageCount + 1, lastGeneratedAt: new Date().toISOString(), lastEdited: item.lastEdited }
          : item,
      ),
    );
    setHistory((current) => [
      {
        id: uid("history"),
        templateId: template.id,
        templateName: template.name,
        generatedAt: new Date().toISOString(),
        outputType: generateMode,
        status: "success",
        note: `Generated ${generateMode.toUpperCase()} document`,
      },
      ...current,
    ]);
    setGenerationMessage(`${template.name} generated successfully.`);
  };

  const exportDocument = (type: "pdf" | "word" | "email") => {
    if (!generatedPreview) return;
    const previewWindow = window.open("", "_blank", "width=1024,height=1200");
    if (!previewWindow) {
      toast({ title: "Popup blocked", description: "Please allow popups to export the document.", variant: "destructive" });
      return;
    }
    previewWindow.document.write(generatedPreview);
    previewWindow.document.close();
    if (type === "word") {
      const blob = new Blob([generatedPreview], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedTemplate?.name || "document"}.doc`;
      link.click();
      URL.revokeObjectURL(url);
    }
    if (type === "email") {
      toast({ title: "Email draft ready", description: "Connect your email integration to send the document directly." });
    }
  };

  const importTemplateFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DocumentTemplate | DocumentTemplate[];
      const imported = Array.isArray(parsed) ? parsed : [parsed];
      setTemplates((current) => [...imported, ...current]);
      toast({ title: "Template imported" });
    } catch {
      toast({ title: "Invalid template file", description: "Please import a valid JSON template export.", variant: "destructive" });
    }
  };

  const currentTemplate = draftTemplate;
  const selectedBlock = currentTemplate?.blocks.find((block) => block.id === selectedBlockId) || null;
  const selectedTemplateFields = selectedTemplate?.fields || [];
  const selectedTemplateRows = selectedTemplate?.invoiceRows || [];
  const totals = selectedTemplate?.category === "invoice" ? calculateInvoiceTotals(selectedTemplateRows) : null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-300">Document automation</p>
            <h2 className="mt-2 text-3xl font-bold">Documents</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Build templates, generate documents, and keep commercial, NDA, and invoice workflows in one place.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">Templates</p>
              <p className="mt-1 text-2xl font-bold">{analytics.totalTemplates}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">Generations</p>
              <p className="mt-1 text-2xl font-bold">{analytics.totalGenerations}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">Most used</p>
              <p className="mt-1 text-sm font-semibold">{analytics.mostUsed?.name || "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">Errors</p>
              <p className="mt-1 text-2xl font-bold">{analytics.errorCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card className="border-slate-200/70 shadow-lg shadow-slate-200/40">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Template Dashboard</CardTitle>
                <CardDescription>Commercial documents, NDA templates, and invoices.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" onClick={() => openCreateTemplate("commercial")} disabled={!isAdmin}>
                  <Plus className="h-4 w-4" /> Create New Template
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Import Template
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importTemplateFromFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input placeholder="Search templates..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Select value={filterCategory} onValueChange={(value) => setFilterCategory(value as any)}>
                <SelectTrigger>
                  <Filter className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue placeholder="Filter category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="nda">NDA Templates</SelectItem>
                  <SelectItem value="invoice">Invoice Templates</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
              {filteredTemplates.map((template) => {
                const categoryLabel = template.category === "commercial" ? "Commercial" : template.category === "nda" ? "NDA" : "Invoice";
                const modeLabel = template.category === "nda" ? (template.mode === "mutual" ? "Mutual NDA" : "One-Sided NDA") : template.category;
                const isSelected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`group rounded-2xl border p-4 text-left transition hover:shadow-lg ${isSelected ? "border-sky-500 bg-sky-50/60 shadow-md" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{template.name}</h3>
                          <Badge variant="secondary">{categoryLabel}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{modeLabel}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">v{template.version}</Badge>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">{template.description || "No description yet."}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>Last edited: {new Date(template.lastEdited).toLocaleDateString()}</div>
                      <div>Used: {template.usageCount}x</div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" className="gap-1" onClick={(e) => { e.stopPropagation(); setGenerationValues(Object.fromEntries(template.fields.map((field) => [field.key, field.sampleValue]))); setSelectedTemplateId(template.id); setGenerateMode("pdf"); setGeneratorOpen(true); }}>
                        <Eye className="h-4 w-4" /> Use Template
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={(e) => { e.stopPropagation(); openEditTemplate(template); }} disabled={!isAdmin}>
                        <Edit3 className="h-4 w-4" /> Edit Template
                      </Button>
                    </div>
                  </button>
                );
              })}
              {filteredTemplates.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center text-sm text-slate-500">
                  No templates match your search.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200/70 shadow-lg shadow-slate-200/40">
            <CardHeader>
              <CardTitle className="text-base">Branding Engine</CardTitle>
              <CardDescription>Apply company details across all document previews.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Company Name</Label>
                <Input value={branding.companyName} onChange={(e) => setBranding((current) => ({ ...current, companyName: e.target.value }))} />
              </div>
              <div>
                <Label>Logo URL</Label>
                <Input value={branding.logoUrl} onChange={(e) => setBranding((current) => ({ ...current, logoUrl: e.target.value }))} placeholder="https://" />
              </div>
              <div>
                <Label>Address</Label>
                <Textarea value={branding.address} onChange={(e) => setBranding((current) => ({ ...current, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input value={branding.email} onChange={(e) => setBranding((current) => ({ ...current, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={branding.phone} onChange={(e) => setBranding((current) => ({ ...current, phone: e.target.value }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 shadow-lg shadow-slate-200/40">
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analytics.lastGenerated ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{analytics.lastGenerated.templateName}</p>
                      <p className="text-xs text-slate-500">Last generated</p>
                    </div>
                    <Badge variant="outline">{analytics.lastGenerated.outputType.toUpperCase()}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{new Date(analytics.lastGenerated.generatedAt).toLocaleString()}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No documents generated yet.</p>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">Error tracking</p>
                <p className="text-xs text-slate-500">Generation errors are tracked locally for debugging.</p>
                <p className="mt-2 text-2xl font-bold text-rose-600">{analytics.errorCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-slate-200/70 shadow-lg shadow-slate-200/40">
          <CardHeader>
            <CardTitle className="text-base">Template Analytics</CardTitle>
            <CardDescription>Usage, last generated status, and quick insights.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <p className="text-xs uppercase tracking-wide text-slate-400">Most used template</p>
              <p className="mt-1 font-semibold text-slate-900">{analytics.mostUsed?.name || "—"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <p className="text-xs uppercase tracking-wide text-slate-400">Last generated</p>
              <p className="mt-1 font-semibold text-slate-900">{analytics.lastGenerated?.templateName || "—"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <p className="text-xs uppercase tracking-wide text-slate-400">Total outputs</p>
              <p className="mt-1 font-semibold text-slate-900">{analytics.totalGenerations}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 shadow-lg shadow-slate-200/40">
          <CardHeader>
            <CardTitle className="text-base">Smart Enhancements</CardTitle>
            <CardDescription>AI assistance, branding, and automation hooks.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <p className="mt-2 font-semibold text-slate-900">AI suggestions</p>
              <p className="text-sm text-slate-500">Improve wording, suggest NDA clauses, and auto-fill invoice content.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <Settings2 className="h-5 w-5 text-sky-500" />
              <p className="mt-2 font-semibold text-slate-900">Role-based access</p>
              <p className="text-sm text-slate-500">Admins can create templates; other users can only generate documents.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <ReceiptText className="h-5 w-5 text-amber-500" />
              <p className="mt-2 font-semibold text-slate-900">Invoice automation</p>
              <p className="text-sm text-slate-500">Auto-calculate subtotal, GST, and final total from line items.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <Building2 className="h-5 w-5 text-emerald-500" />
              <p className="mt-2 font-semibold text-slate-900">Branding engine</p>
              <p className="text-sm text-slate-500">Persist logo and company details once and reuse them everywhere.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="!left-1/2 !top-1/2 !h-[96vh] !w-[98vw] !max-w-[98vw] overflow-hidden p-0 sm:rounded-2xl">
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle>{editingTemplateId ? "Edit Template" : "Create New Template"}</DialogTitle>
              <DialogDescription>
                Drag components onto the canvas, bind dynamic fields, and fine-tune layout properties.
              </DialogDescription>
            </DialogHeader>
            {currentTemplate && (
              <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-hidden px-6 py-4 xl:grid-cols-[260px_1fr_320px]">
                <div className="space-y-4 overflow-y-auto pr-1">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Component Library</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {componentLibrary.map((component) => (
                        <button
                          key={component.type}
                          type="button"
                          draggable
                          onDragStart={() => setDraggedType(component.type)}
                          onDragEnd={() => setDraggedType(null)}
                          onClick={() => addBlockToTemplate(component.type)}
                          className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-300 hover:bg-sky-50/60"
                        >
                          <div className="rounded-lg bg-slate-100 p-2 text-slate-700">{component.icon}</div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{component.label}</p>
                            <p className="text-xs text-slate-500">{component.description}</p>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Template Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Name</Label>
                        <Input value={currentTemplate.name} onChange={(e) => setDraftTemplate({ ...currentTemplate, name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Select value={currentTemplate.category} onValueChange={(value) => setDraftTemplate({ ...currentTemplate, category: value as DocCategory, mode: value === "nda" ? currentTemplate.mode || "one-sided" : null })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="commercial">Commercial</SelectItem>
                            <SelectItem value="nda">NDA</SelectItem>
                            <SelectItem value="invoice">Invoice</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {currentTemplate.category === "nda" && (
                        <div>
                          <Label>NDA Type</Label>
                          <Select value={currentTemplate.mode || "one-sided"} onValueChange={(value) => setDraftTemplate({ ...currentTemplate, mode: value as NdaMode })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="one-sided">One-Sided</SelectItem>
                              <SelectItem value="mutual">Mutual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label>Description</Label>
                        <Textarea value={currentTemplate.description} onChange={(e) => setDraftTemplate({ ...currentTemplate, description: e.target.value })} />
                      </div>
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        Drag a block to the center canvas or click to insert.
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="flex min-h-0 flex-col border-slate-200">
                  <CardHeader className="border-b pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm">A4 Canvas Preview</CardTitle>
                        <CardDescription>Live document layout with page-like spacing.</CardDescription>
                      </div>
                      <Badge variant="outline">{currentTemplate.category.toUpperCase()}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent
                    className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedType) addBlockToTemplate(draggedType);
                    }}
                  >
                    <div className="mx-auto min-h-[1050px] max-w-[794px] rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
                      <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Brand</p>
                          <h3 className="mt-2 text-2xl font-bold text-slate-900">{branding.companyName}</h3>
                          <p className="mt-1 text-sm text-slate-500">{branding.address}</p>
                        </div>
                        {branding.logoUrl ? (
                          <img src={branding.logoUrl} alt="logo" className="h-14 w-14 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                            <Image className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        {currentTemplate.blocks.map((block) => {
                          const isSelected = block.id === selectedBlockId;
                          if (block.type === "table" && currentTemplate.category === "invoice") {
                            const invoiceTotals = calculateInvoiceTotals(currentTemplate.invoiceRows);
                            return (
                              <div
                                key={block.id}
                                className={`rounded-2xl border p-4 transition ${isSelected ? "border-sky-500 bg-sky-50/40" : "border-slate-200 bg-slate-50"}`}
                                onClick={() => setSelectedBlockId(block.id)}
                              >
                                <div className="mb-3 flex items-center justify-between">
                                  <p className="text-sm font-semibold text-slate-900">Invoice Table</p>
                                  <div className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); moveDraftBlock(block.id, "up"); }}><MoveHorizontal className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); removeDraftBlock(block.id); }}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </div>
                                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                      <tr>
                                        <th className="px-3 py-2">Item</th>
                                        <th className="px-3 py-2">Qty</th>
                                        <th className="px-3 py-2">Price</th>
                                        <th className="px-3 py-2">Tax %</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {currentTemplate.invoiceRows.map((row) => (
                                        <tr key={row.id} className="border-t">
                                          <td className="px-3 py-2"><Input value={row.item} onChange={(e) => updateInvoiceRow(row.id, { item: e.target.value })} /></td>
                                          <td className="px-3 py-2"><Input type="number" value={row.quantity} onChange={(e) => updateInvoiceRow(row.id, { quantity: Number(e.target.value || 0) })} /></td>
                                          <td className="px-3 py-2"><Input type="number" value={row.price} onChange={(e) => updateInvoiceRow(row.id, { price: Number(e.target.value || 0) })} /></td>
                                          <td className="px-3 py-2"><Input type="number" value={row.tax} onChange={(e) => updateInvoiceRow(row.id, { tax: Number(e.target.value || 0) })} /></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                                  <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <p className="text-xs text-slate-500">Subtotal</p>
                                    <p className="font-semibold text-slate-900">₹{invoiceTotals.subtotal.toFixed(2)}</p>
                                  </div>
                                  <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <p className="text-xs text-slate-500">GST</p>
                                    <p className="font-semibold text-slate-900">₹{invoiceTotals.gst.toFixed(2)}</p>
                                  </div>
                                  <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <p className="text-xs text-slate-500">Total</p>
                                    <p className="font-semibold text-slate-900">₹{invoiceTotals.total.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={block.id}
                              className={`rounded-2xl border p-4 transition ${isSelected ? "border-sky-500 bg-sky-50/40" : "border-slate-200 bg-white"}`}
                              onClick={() => setSelectedBlockId(block.id)}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  <Badge variant="outline" className="capitalize">{block.type}</Badge>
                                  <span>{block.alignment}</span>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); moveDraftBlock(block.id, "up"); }}><MoveHorizontal className="h-4 w-4" /></Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); moveDraftBlock(block.id, "down"); }}><MoveHorizontal className="h-4 w-4 rotate-90" /></Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); removeDraftBlock(block.id); }}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </div>
                              {block.type === "field" ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-700">
                                  <span>{"{{"}{block.content || "dynamic_field"}{"}}"}</span>
                                </div>
                              ) : block.type === "image" ? (
                                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <Image className="h-5 w-5 text-slate-400" />
                                  <span className="text-sm text-slate-700">{block.content || "Image URL"}</span>
                                </div>
                              ) : (
                                <div className="space-y-2" style={{ textAlign: block.alignment }}>
                                  <p className={`font-semibold text-slate-900 ${block.type === "header" ? "text-2xl" : block.type === "footer" ? "text-xs uppercase tracking-[0.2em] text-slate-500" : "text-base"}`} style={{ fontSize: block.fontSize }}>
                                    {replacePlaceholders(block.content, Object.fromEntries(currentTemplate.fields.map((field) => [field.key, field.sampleValue]))) || "Editable text"}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {currentTemplate.blocks.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
                            Drop a component here to build your document.
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4 overflow-y-auto pl-1">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Properties</CardTitle>
                      <CardDescription>Adjust the selected block.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedBlock ? (
                        <>
                          <div>
                            <Label>Block Type</Label>
                            <Input value={selectedBlock.type} disabled />
                          </div>
                          <div>
                            <Label>Content</Label>
                            <Textarea value={selectedBlock.content} onChange={(e) => updateDraftBlock(selectedBlock.id, { content: e.target.value })} />
                          </div>
                          <div>
                            <Label>Binding Key</Label>
                            <Select value={selectedBlock.fieldKey || ""} onValueChange={(value) => updateDraftBlock(selectedBlock.id, { fieldKey: value })}>
                              <SelectTrigger><SelectValue placeholder="No binding" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">No binding</SelectItem>
                                {currentTemplate.fields.map((field) => (
                                  <SelectItem key={field.id} value={field.key}>{field.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>Alignment</Label>
                              <Select value={selectedBlock.alignment} onValueChange={(value) => updateDraftBlock(selectedBlock.id, { alignment: value as any })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Font Size</Label>
                              <Input type="number" value={selectedBlock.fontSize} onChange={(e) => updateDraftBlock(selectedBlock.id, { fontSize: Number(e.target.value || 12) })} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">Select a block to edit its properties.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Dynamic Fields</CardTitle>
                        <Button size="sm" variant="outline" className="gap-1" onClick={addDraftField}><Plus className="h-3.5 w-3.5" /> Add Field</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {currentTemplate.fields.map((field) => (
                        <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline">{"{{"}{field.key}{"}}"}</Badge>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDraftField(field.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Input value={field.label} onChange={(e) => updateDraftField(field.id, { label: e.target.value })} placeholder="Label" />
                            <Input value={field.key} onChange={(e) => updateDraftField(field.id, { key: e.target.value })} placeholder="Key" />
                            <Select value={field.type} onValueChange={(value) => updateDraftField(field.id, { type: value as FieldType })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="date">Date</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="currency">Currency</SelectItem>
                                <SelectItem value="textarea">Textarea</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input value={field.sampleValue} onChange={(e) => updateDraftField(field.id, { sampleValue: e.target.value })} placeholder="Sample value" />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {currentTemplate.category === "invoice" && (
                    <Card className="border-slate-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Invoice Rows</CardTitle>
                          <Button size="sm" variant="outline" className="gap-1" onClick={addInvoiceRow}><Plus className="h-3.5 w-3.5" /> Add Row</Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {currentTemplate.invoiceRows.map((row) => (
                          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="grid grid-cols-2 gap-2">
                              <Input value={row.item} onChange={(e) => updateInvoiceRow(row.id, { item: e.target.value })} placeholder="Item" />
                              <Input type="number" value={row.quantity} onChange={(e) => updateInvoiceRow(row.id, { quantity: Number(e.target.value || 0) })} placeholder="Qty" />
                              <Input type="number" value={row.price} onChange={(e) => updateInvoiceRow(row.id, { price: Number(e.target.value || 0) })} placeholder="Price" />
                              <Input type="number" value={row.tax} onChange={(e) => updateInvoiceRow(row.id, { tax: Number(e.target.value || 0) })} placeholder="Tax %" />
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button size="sm" variant="ghost" onClick={() => removeInvoiceRow(row.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="border-t px-6 py-4">
              <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancel</Button>
              <Button onClick={saveTemplate} className="gap-2"><Save className="h-4 w-4" /> Save Template</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Generate Document</DialogTitle>
            <DialogDescription>Fill the form once and preview the generated document instantly.</DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedTemplate.name}</p>
                      <p className="text-xs text-slate-500">{selectedTemplate.description}</p>
                    </div>
                    <Badge variant="outline">{selectedTemplate.category.toUpperCase()}</Badge>
                  </div>
                </div>
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                  {selectedTemplateFields.map((field) => (
                    <div key={field.id}>
                      <Label>{field.label}</Label>
                      {field.type === "textarea" ? (
                        <Textarea value={generationValues[field.key] || ""} onChange={(e) => setGenerationValues((current) => ({ ...current, [field.key]: e.target.value }))} />
                      ) : (
                        <Input type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"} value={generationValues[field.key] || ""} onChange={(e) => setGenerationValues((current) => ({ ...current, [field.key]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="gap-2" onClick={() => { setGenerateMode("pdf"); handleGenerate(selectedTemplate); }}><FileText className="h-4 w-4" /> Generate Document</Button>
                  <Button variant="outline" className="gap-2" onClick={() => setGenerateMode("word")}><Download className="h-4 w-4" /> Export Word</Button>
                  <Button variant="outline" className="gap-2" onClick={() => setGenerateMode("email")}><Send className="h-4 w-4" /> Email Directly</Button>
                </div>
                {generationMessage && <p className="text-sm text-emerald-600">{generationMessage}</p>}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-inner">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Preview</p>
                  <Badge variant="secondary">A4</Badge>
                </div>
                <div className="h-[55vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mx-auto min-h-[1000px] max-w-[794px] rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
                    <div className="mb-6 border-b pb-4">
                      <h2 className="text-2xl font-bold text-slate-900">{branding.companyName}</h2>
                      <p className="text-sm text-slate-500">{branding.address}</p>
                    </div>
                    {selectedTemplate.blocks.map((block) => (
                      <div key={block.id} className="mb-4">
                        <p className={`whitespace-pre-wrap text-slate-900 ${block.type === "header" ? "text-2xl font-bold" : block.type === "footer" ? "text-xs uppercase tracking-[0.25em] text-slate-500" : "text-sm"}`} style={{ textAlign: block.alignment as any, fontSize: block.fontSize }}>
                          {replacePlaceholders(block.content, generationValues)}
                        </p>
                      </div>
                    ))}
                    {selectedTemplate.category === "invoice" && totals && (
                      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Item</th>
                              <th className="px-3 py-2">Qty</th>
                              <th className="px-3 py-2">Price</th>
                              <th className="px-3 py-2">Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTemplateRows.map((row) => (
                              <tr key={row.id} className="border-t">
                                <td className="px-3 py-2">{row.item}</td>
                                <td className="px-3 py-2">{row.quantity}</td>
                                <td className="px-3 py-2">₹{row.price.toFixed(2)}</td>
                                <td className="px-3 py-2">{row.tax}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="grid grid-cols-3 gap-3 border-t bg-slate-50 p-3 text-sm">
                          <div>Subtotal: ₹{totals.subtotal.toFixed(2)}</div>
                          <div>GST: ₹{totals.gst.toFixed(2)}</div>
                          <div className="font-semibold">Total: ₹{totals.total.toFixed(2)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Generated Document Preview</DialogTitle>
            <DialogDescription>Preview the document before exporting or sharing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportDocument("pdf")} className="gap-2"><Download className="h-4 w-4" /> PDF</Button>
              <Button variant="outline" onClick={() => exportDocument("word")} className="gap-2"><FileText className="h-4 w-4" /> Word</Button>
              <Button variant="outline" onClick={() => exportDocument("email")} className="gap-2"><Send className="h-4 w-4" /> Email</Button>
            </div>
            <div className="h-[65vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <iframe title="Generated document preview" srcDoc={generatedPreview} className="h-[1200px] w-full rounded-2xl border border-slate-200 bg-white" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DocumentsStudio;
