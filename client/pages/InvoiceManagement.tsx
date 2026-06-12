import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as Docx from "docx";
import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";
import InvoiceTracker from "@/components/InvoiceTracker";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bold,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Code,
  Copy,
  Download,
  Edit3,
  Eraser,
  Eye,
  FileDown,
  FileText,
  Highlighter,
  Image,
  Italic,
  Layers3,
  Link,
  List,
  ListOrdered,
  LayoutGrid,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Quote,
  ReceiptText,
  RefreshCcw,
  Redo2,
  Scissors,
  Search,
  ShieldCheck,
  Smile,
  Sparkles,
  Square,
  Strikethrough,
  Table2,
  Trash2,
  TrendingUp,
  Underline,
  Undo2,
  Video,
  Wallet,
  Warehouse,
  Settings,
  Clock,
  GripVertical,
  X,
  XCircle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
} from "lucide-react";

const SERVICE_OPTIONS = [
  "Recon end to end",
  "Profitability",
  "Clearing Services",
  "FIRC Services",
  "Currency Conversion",
  "APB",
  "AWS Infra",
  "Database Maintenance",
  "Manpower Support",
  "Chargeback Services",
  "Other",
];

const SERVICE_COLOR: Record<string, string> = {
  "Recon end to end": "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  Profitability: "bg-purple-500/10 text-purple-700 border-purple-200",
  "Clearing Services": "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  "FIRC Services": "bg-blue-500/10 text-blue-700 border-blue-200",
  "Currency Conversion": "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  APB: "bg-orange-500/10 text-orange-700 border-orange-200",
  "AWS Infra": "bg-slate-500/10 text-slate-700 border-slate-200",
  "Database Maintenance": "bg-zinc-500/10 text-zinc-700 border-zinc-200",
  "Manpower Support": "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-200",
  "Chargeback Services": "bg-rose-500/10 text-rose-700 border-rose-200",
  Other: "bg-slate-500/10 text-slate-700 border-slate-200",
};

const PRIORITY_META = {
  Critical: {
    className: "bg-red-500/10 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
  High: {
    className: "bg-orange-500/10 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
  Medium: {
    className: "bg-blue-500/10 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  Low: {
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
} as const;

const STATUS_META: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  draft: "bg-slate-500/10 text-slate-700 border-slate-200",
  paused: "bg-amber-500/10 text-amber-700 border-amber-200",
  overdue: "bg-red-500/10 text-red-700 border-red-200",
};

const INVOICE_STATUS_META: Record<string, string> = {
  "Waiting for approval": "bg-amber-500/10 text-amber-700 border-amber-200",
  Generated: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  Send: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  Received: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-500/10 text-rose-700 border-rose-200",
  Overdue: "bg-red-500/10 text-red-700 border-red-200",
  Closed: "bg-slate-500/10 text-slate-700 border-slate-200",
};

const MYLAPAY_LOGO_URL = "/mylapaylogo.png";
const INVOICE_THEME = {
  primaryRgb: [44, 175, 230] as [number, number, number],
  secondaryRgb: [31, 41, 92] as [number, number, number],
  primaryHex: "2cafe6",
  secondaryHex: "1f295c",
};
const INVOICE_AMOUNT_IN_WORDS = "(Rupees One lakh forty-seven thousand five hundred Only)";
const DEFAULT_INVOICE_DECLARATION_TEXT = `We hereby declare that
1. We have obtained approval for a lower TDS deduction, and going forward, TDS should be deducted at the rate of 1.60 % only.
2. We are registered under the Micro, Small, and Medium Enterprises Development Act, 2006 (MSME).
MSME No of Mindeed: UDYAM-TN-02-0113863
GST No of Mindeed: 33AAMCM6618H1ZB
PAN No of Mindeed: AAMCM6618H
Payment Terms: 15 days from the date of Invoice.`;

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDeclarationHtml(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return DEFAULT_INVOICE_DECLARATION_TEXT.split(/\r?\n/)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");
  }
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function parseDeclarationStyle(value?: string) {
  const html = normalizeDeclarationHtml(value);
  const fallback = {
    fontFamily: "Arial",
    fontSize: "14",
    lineHeight: "1.6",
    textAlign: "left" as "left" | "center" | "right",
    textColor: "#111827",
    highlightColor: "#ffffff",
    html,
  };

  if (typeof document === "undefined") return fallback;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const root = wrapper.firstElementChild as HTMLElement | null;

  if (!root || root.tagName !== "DIV" || !root.getAttribute("style")) return fallback;

  const rootStyle = root.style;
  return {
    fontFamily: (rootStyle.fontFamily || fallback.fontFamily).replace(/["']/g, ""),
    fontSize: String(Math.round(Number.parseFloat(rootStyle.fontSize) || Number.parseFloat(fallback.fontSize))),
    lineHeight: rootStyle.lineHeight || fallback.lineHeight,
    textAlign: (rootStyle.textAlign as "left" | "center" | "right") || fallback.textAlign,
    textColor: rootStyle.color || fallback.textColor,
    highlightColor: rootStyle.backgroundColor || fallback.highlightColor,
    html: root.innerHTML,
  };
}

function getInvoiceDeclarationLines(companyConfig: CompanyConfig) {
  const html = normalizeDeclarationHtml(companyConfig.declarationText);
  if (typeof document === "undefined") {
    return html
      .replace(/<[^>]+>/g, "\n")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const topLevelNodes = Array.from(wrapper.children);

  if (topLevelNodes.length === 1) {
    const root = topLevelNodes[0] as HTMLElement;
    const nestedBlocks = Array.from(root.children);
    if (nestedBlocks.length > 0) {
      return nestedBlocks.map((node) => node.textContent?.trim() || "").filter(Boolean);
    }
    const rootText = root.textContent?.trim();
    return rootText ? [rootText] : [];
  }

  if (topLevelNodes.length > 1) {
    return topLevelNodes.map((node) => node.textContent?.trim() || "").filter(Boolean);
  }

  return wrapper.textContent
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean) || [];
}
const formatInvoicePdfDate = (dateStr: string) => {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-").map((part) => Number(part));
  if (!year || !month || !day) return dateStr;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(day).padStart(2, "0")}-${monthNames[month - 1]}-${year}`;
};

const formatInvoiceServicePeriod = (month: string, generatedDate: string) => {
  const trimmedMonth = normalizeInlineText(month).split("·")[0].trim();
  if (trimmedMonth) return trimmedMonth;
  if (!generatedDate) return "—";
  const date = new Date(`${generatedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return generatedDate;
  return date.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
};

const INDIAN_STATE_NAMES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
].sort((a, b) => b.length - a.length);

const extractStateFromAddress = (address?: string) => {
  const source = normalizeInlineText(address).replace(/\b\d{6}\b/g, " ");
  if (!source) return "";
  const normalized = source.replace(/[\-|–|—|,]/g, " ").replace(/\s+/g, " ").trim();
  const stateMatch = INDIAN_STATE_NAMES.find((state) => new RegExp(`\\b${state.replace(/ /g, "\\s+")}\\b`, "i").test(normalized));
  if (stateMatch) return stateMatch;
  const parts = String(source)
    .split(/[\n,]/)
    .map((part) => normalizeInlineText(part))
    .filter(Boolean)
    .filter((part) => !/^(india|inr)$/i.test(part))
    .filter((part) => !/^\d{5,6}$/.test(part));
  if (parts.length === 0) return "";
  const candidate = parts[parts.length - 1].split(/\s*[-–—]\s*/)[0].trim();
  return candidate;
};

const getClientPlaceOfSupply = (client: ClientRecord) =>
  normalizeInlineText(client.billingState || extractStateFromAddress(client.billingAddress)) || "—";

function readClientOverviewCache() {
  try {
    const raw = localStorage.getItem(CLIENT_OVERVIEW_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeClientOverviewCache(clientId: string, cache: { invoiceTableConfig?: any[]; customInvoiceRows?: any[]; serviceOptions?: any[] }) {
  try {
    const current = readClientOverviewCache();
    current[String(clientId)] = {
      invoiceTableConfig: Array.isArray(cache.invoiceTableConfig) ? cache.invoiceTableConfig : [],
      customInvoiceRows: Array.isArray(cache.customInvoiceRows) ? cache.customInvoiceRows : [],
      serviceOptions: Array.isArray(cache.serviceOptions) ? cache.serviceOptions : [],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(CLIENT_OVERVIEW_CACHE_KEY, JSON.stringify(current));
  } catch {}
}

function mergeClientOverviewCache<T extends { clientId?: string; id?: string; invoiceTableConfig?: any[]; customInvoiceRows?: any[]; serviceOptions?: any[] }>(client: T): T {
  const cache = readClientOverviewCache()[String(client.clientId || client.id || "")];
  if (!cache) return client;
  return {
    ...client,
    invoiceTableConfig: Array.isArray(cache.invoiceTableConfig) ? cache.invoiceTableConfig : client.invoiceTableConfig || [],
    customInvoiceRows: Array.isArray(cache.customInvoiceRows) ? cache.customInvoiceRows : client.customInvoiceRows || [],
    serviceOptions: Array.isArray(cache.serviceOptions) ? cache.serviceOptions : client.serviceOptions || [],
  };
}

const INVOICE_SERIAL_CONFIG_KEY = "invoice-serial-config";
const INVOICE_SERIAL_STATE_KEY = "invoice-serial-state";
const INVOICE_PREFIX_SERIAL_CONFIGS_KEY = "invoice-prefix-serial-configs";
const CLIENT_OVERVIEW_CACHE_KEY = "invoice-client-overview-cache";
const COMPANY_CONFIG_KEY = "company-config";
const TAX_CONFIG_KEY = "tax-config";
const CURRENCY_CONFIG_KEY = "currency-config";
const CONFIG_CHANGE_REQUESTS_KEY = "config-change-requests";
const CONFIG_AUDIT_LOG_KEY = "config-audit-log";

type InvoiceNumberFormat = "PREFIX/FY/SEQ" | "PREFIX-FY-SEQ" | "FY/SEQ" | "PREFIX/SEQ/FY";
type ClientType = "Domestic" | "International";
type BillingModel = "transaction" | "mmc";
type CurrencyType = "INR" | "USD" | "AED" | "SAR" | "KWD" | "OMR" | "QAR" | "BHD";
type ConfigChangeType = "invoice-serial" | "company" | "tax" | "currency";

type NarrationMode = "title" | "subtitle" | "multiline";

interface CustomInvoiceRow {
  name: string;
  narration?: string;
  amount: number;
  hsn?: string;
  rate?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  align?: "left" | "center" | "right";
  taxType?: RowTaxType;
  narrationMode?: NarrationMode;
  exportEnabled?: boolean;
}

type RowAlign = "left" | "center" | "right";
type RowTaxType = "Domestic" | "International";

interface OverviewInvoiceRow {
  id: string;
  kind: "derived" | "custom";
  narration: string;
  amount: number;
  hsn: string;
  rate: string;
  cgst: number;
  sgst: number;
  igst: number;
  align: RowAlign;
  taxType?: RowTaxType;
  editable: boolean;
  narrationMode?: NarrationMode;
  exportEnabled: boolean;
  useConfigHsn?: boolean;
  narrationDetails?: string[];
}

interface InvoiceExportLineItem {
  description: string;
  amount: number;
  hsn: string;
  rate: string;
  cgst: number;
  sgst: number;
  igst: number;
  align: RowAlign;
  taxType?: RowTaxType;
  exportEnabled: boolean;
  totalAmount: number;
  useConfigHsn?: boolean;
}
type ApprovalStatus = "pending" | "approved" | "rejected";

interface ConfigApproval {
  approvedBy: string;
  approvedAt: string;
  status: ApprovalStatus;
}

interface ConfigChangeRequest {
  id: string;
  type: ConfigChangeType;
  requestedBy: string;
  requestedAt: string;
  changes: Record<string, any>;
  approvals: ConfigApproval[];
  status: "pending" | "approved" | "rejected" | "applied";
  appliedAt?: string;
}

interface AuditLogEntry {
  id: string;
  type: ConfigChangeType;
  changedBy: string;
  changedAt: string;
  changes: Record<string, any>;
  requestId?: string;
}

interface InvoiceSerialConfig {
  prefix: string;
  separator: string;
  serialDigits: number;
  format: InvoiceNumberFormat;
  financialYearStartMonth: number;
}

interface InvoiceSerialState {
  financialYear: string;
  serial: number;
  lastIssuedAt: string;
}

interface PrefixSerialConfig {
  currentSerial: string;
  period: string;
  applyPeriodToAllPrefixes: boolean;
}

interface CompanyConfig {
  companyName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  lutNumber: string;
  cinNumber: string;
  email: string;
  phone: string;
  website: string;
  signatureImage: string;
  declarationText: string;
}

interface TaxConfig {
  sgstPercentage: number;
  cgstPercentage: number;
  igstPercentage: number;
  tdsPercentage: number;
  defaultTaxType: "SGST+CGST" | "IGST";
  invoiceHsnCode: string;
  invoiceRatePercentage: number;
}

interface CurrencyConfig {
  domesticCurrency: CurrencyType;
  supportedCurrencies: {
    code: CurrencyType;
    symbol: string;
    country: string;
  }[];
}

const DEFAULT_INVOICE_SERIAL_CONFIG: InvoiceSerialConfig = {
  prefix: "MYL",
  separator: "/",
  serialDigits: 4,
  format: "PREFIX/SEQ/FY",
  financialYearStartMonth: 4,
};

const DEFAULT_COMPANY_CONFIG: CompanyConfig = {
  companyName: "Mindeed Technologies and Services Pvt Ltd",
  address: "#17/3, Pembroke House, Second Floor, Shafee Mohammed Road",
  city: "Chennai",
  state: "Tamil Nadu",
  pincode: "600006",
  gstNumber: "33AAMCM6618H1ZB",
  panNumber: "AAMCM6618H",
  lutNumber: "LUT-33-TN",
  cinNumber: "U72900TN2019PTC129197",
  email: "contact@mylapay.com",
  phone: "+91 44 XXXX XXXX",
  website: "www.mylapay.com",
  signatureImage: "",
  declarationText: DEFAULT_INVOICE_DECLARATION_TEXT,
};

const DEFAULT_TAX_CONFIG: TaxConfig = {
  sgstPercentage: 9,
  cgstPercentage: 9,
  igstPercentage: 18,
  tdsPercentage: 1.6,
  defaultTaxType: "SGST+CGST",
  invoiceHsnCode: "998314",
  invoiceRatePercentage: 18,
};

function withDefaultTaxHsn(config?: Partial<TaxConfig> | null): TaxConfig {
  return {
    ...DEFAULT_TAX_CONFIG,
    ...(config || {}),
    invoiceHsnCode: normalizeInlineText(config?.invoiceHsnCode || DEFAULT_TAX_CONFIG.invoiceHsnCode),
  };
}

const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  domesticCurrency: "INR",
  supportedCurrencies: [
    { code: "INR", symbol: "₹", country: "India" },
    { code: "USD", symbol: "$", country: "USA" },
    { code: "AED", symbol: "د.إ", country: "UAE" },
    { code: "SAR", symbol: "﷼", country: "Saudi Arabia" },
    { code: "KWD", symbol: "د.ك", country: "Kuwait" },
    { code: "OMR", symbol: "ر.ع.", country: "Oman" },
    { code: "QAR", symbol: "﷼", country: "Qatar" },
    { code: "BHD", symbol: "د.ب", country: "Bahrain" },
  ],
};

function getIstNow() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

function parseInvoiceDateValue(value?: string) {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.getTime();

  const isoLike = new Date(raw.includes("T") ? raw : `${raw}T00:00:00Z`);
  if (!Number.isNaN(isoLike.getTime())) return isoLike.getTime();

  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const parsed = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  return 0;
}

function formatInvoiceGeneratedDateTime(value?: string) {
  if (!value) return "—";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return raw;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPart["type"]) => parts.find((part) => part.type === type)?.value || "";
  const day = getPart("day");
  const month = getPart("month");
  const year = getPart("year");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const dayPeriod = getPart("dayPeriod").toUpperCase();
  return `${day}-${month}-${year} ${hour}:${minute} ${dayPeriod}`.trim();
}

function getFinancialYearLabel(date = getIstNow(), startMonth = 4) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const fyStartYear = month >= startMonth ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  return `${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;
}

function formatInvoiceSerial(serial: number, digits: number) {
  return String(serial).padStart(Math.max(1, digits), "0");
}

function buildInvoiceNumber(
  config: InvoiceSerialConfig,
  financialYear: string,
  serial: number,
) {
  const serialPart = formatInvoiceSerial(serial, config.serialDigits);
  switch (config.format) {
    case "FY/SEQ":
      return `${financialYear}${config.separator}${serialPart}`;
    case "PREFIX/SEQ/FY":
      return `${config.prefix}${config.separator}${serialPart}${config.separator}${financialYear}`;
    case "PREFIX-FY-SEQ":
      return `${config.prefix}-${financialYear}-${serialPart}`;
    case "PREFIX/FY/SEQ":
    default:
      return `${config.prefix}${config.separator}${financialYear}${config.separator}${serialPart}`;
  }
}

function inferInvoiceNumberFormat(invoiceNumber?: string): InvoiceNumberFormat | null {
  const value = normalizeInlineText(invoiceNumber);
  if (!value) return null;
  if (/^[^/-]+[/-]\d{2}-\d{2}[/-]\d+$/.test(value)) return "PREFIX/FY/SEQ";
  if (/^[^/-]+[/-]\d+[/-]\d{2}-\d{2}$/.test(value)) return "PREFIX/SEQ/FY";
  if (/^[^/-]+-\d{2}-\d{2}-\d+$/.test(value)) return "PREFIX-FY-SEQ";
  if (/^\d{2}-\d{2}[/-]\d+$/.test(value)) return "FY/SEQ";
  return null;
}

function getPreferredInvoiceNumberFormat(invoiceNumber?: string, fallback: InvoiceNumberFormat = DEFAULT_INVOICE_SERIAL_CONFIG.format): InvoiceNumberFormat {
  return inferInvoiceNumberFormat(invoiceNumber) || fallback;
}

function getCurrentInvoiceNumberPreview(config: InvoiceSerialConfig, financialYearOverride?: string) {
  const financialYear = financialYearOverride || getFinancialYearLabel(
    getIstNow(),
    config.financialYearStartMonth,
  );
  return buildInvoiceNumber(config, financialYear, 1);
}

function getInvoicePrefixFromNumber(invoiceNumber?: string) {
  const normalized = normalizeInlineText(invoiceNumber);
  if (!normalized) return "";
  return normalizeInlineText(normalized.split(/[/-]/)[0]);
}

function getSharedInvoiceSerialCurrent(clients: ClientRecord[], prefix: string, financialYear: string) {
  const targetPrefix = normalizeInlineText(prefix).toUpperCase();
  if (!targetPrefix) return 0;

  return clients.reduce((max, client) => {
    const clientPrefix = normalizeInlineText(client.invoicePrefix).toUpperCase();
    if (clientPrefix !== targetPrefix) return max;

    const ownCurrent = Number(client.invoiceCurrentSerial || 0);
    const historyMax = (client.invoiceHistory || []).reduce((historyMaxValue, invoice) => {
      const invoicePrefix = getInvoicePrefixFromNumber(getInvoiceDisplayNumber(invoice)).toUpperCase();
      if (invoicePrefix && invoicePrefix !== targetPrefix) return historyMaxValue;
      if (invoice.financialYear && invoice.financialYear !== financialYear) return historyMaxValue;
      return Math.max(historyMaxValue, Number(invoice.serial || 0));
    }, 0);

    return Math.max(max, ownCurrent, historyMax);
  }, 0);
}

const CLIENTS = [
  {
    id: "payswiff",
    code: "PWS",
    name: "Payswiff",
    status: "active",
    priority: "High",
    services: ["Recon end to end", "Database Maintenance", "Manpower Support"],
    fixedBilling: 150000,
    monthlyInvoiceEstimate: 212500,
    monthlyTransactionVolume: 1250000,
    variableRevenueGenerated: 62500,
    awsInfraRecovery: 18000,
    reconRevenue: 126000,
    profitabilityRevenue: 24000,
    minimumGuarantee: 150000,
    additionalPlatformFee: 12000,
    integrationFee: 18000,
    billingCycle: "Monthly",
    lastInvoiceGenerated: "2026-05-01",
    logo: "P",
    logoClass: "from-indigo-500 to-violet-500",
    color: "indigo",
    transactionSlabs: [
      { from: 0, to: 1000000, rate: 0.12, unit: "paisa" },
      { from: 1000000, to: undefined, rate: 0.08, unit: "paisa" },
    ],
    aws: { enabled: false, vendorCost: 0, marginPercentage: 0 },
    notes: "Recon end-to-end with fixed commercial and stepped variable rate beyond 1M transactions.",
    invoiceHistory: [
      { invoiceId: "INV-2026-041", month: "Apr 2026", amount: 208000, status: "Received", generatedDate: "2026-04-30" },
      { invoiceId: "INV-2026-042", month: "May 2026", amount: 212500, status: "Send", generatedDate: "2026-05-01" },
      { invoiceId: "INV-2026-043", month: "Jun 2026", amount: 214800, status: "Waiting for approval", generatedDate: "2026-06-01" },
    ],
  },
  {
    id: "razorpay",
    code: "RZP",
    name: "Razorpay",
    status: "active",
    priority: "Critical",
    services: ["Recon end to end", "Profitability", "Database Maintenance", "Manpower Support", "FIRC Services", "Clearing Services", "APB", "AWS Infra"],
    fixedBilling: 800000,
    monthlyInvoiceEstimate: 1245000,
    monthlyTransactionVolume: 12000000,
    variableRevenueGenerated: 365000,
    awsInfraRecovery: 74000,
    reconRevenue: 520000,
    profitabilityRevenue: 285000,
    minimumGuarantee: 800000,
    additionalPlatformFee: 50000,
    integrationFee: 75000,
    billingCycle: "Monthly",
    lastInvoiceGenerated: "2026-05-03",
    logo: "R",
    logoClass: "from-sky-500 to-indigo-600",
    color: "sky",
    transactionSlabs: [
      { from: 0, to: 12000000, rate: 0.06, unit: "paisa" },
      { from: 12000000, to: undefined, rate: 0.04, unit: "paisa" },
    ],
    aws: { enabled: true, vendorCost: 59000, marginPercentage: 25 },
    notes: "Large enterprise account with recon, profitability, and infra recovery layers.",
    invoiceHistory: [
      { invoiceId: "INV-2026-101", month: "Apr 2026", amount: 1218000, status: "Received", generatedDate: "2026-04-30" },
      { invoiceId: "INV-2026-102", month: "May 2026", amount: 1245000, status: "Generated", generatedDate: "2026-05-01" },
      { invoiceId: "INV-2026-103", month: "Jun 2026", amount: 1292000, status: "Approved", generatedDate: "2026-06-01" },
    ],
  },
  {
    id: "rzpx",
    code: "RZPX",
    name: "RZPX Razorpay UPI",
    status: "active",
    priority: "Critical",
    services: ["Recon end to end", "AWS Infra", "Chargeback Services"],
    fixedBilling: 500000,
    monthlyInvoiceEstimate: 975000,
    monthlyTransactionVolume: 36000000,
    variableRevenueGenerated: 445000,
    awsInfraRecovery: 21000,
    reconRevenue: 340000,
    profitabilityRevenue: 0,
    minimumGuarantee: 500000,
    additionalPlatformFee: 250000,
    integrationFee: 150000,
    billingCycle: "Monthly",
    lastInvoiceGenerated: "2026-05-04",
    logo: "U",
    logoClass: "from-fuchsia-500 to-rose-500",
    color: "rose",
    transactionSlabs: [
      { from: 0, to: 5000000, rate: 0.04, unit: "paisa" },
      { from: 5000000, to: 25000000, rate: 0.03, unit: "paisa" },
      { from: 25000000, to: 50000000, rate: 0.02, unit: "paisa" },
      { from: 50000000, to: 100000000, rate: 0.01, unit: "paisa" },
      { from: 100000000, to: undefined, rate: 0.005, unit: "paisa" },
    ],
    aws: { enabled: true, vendorCost: 84000, marginPercentage: 25 },
    notes: "Tiered UPI commercial with minimum guarantee and new bank addition pass-through.",
    invoiceHistory: [
      { invoiceId: "INV-2026-201", month: "Apr 2026", amount: 945000, status: "Sent", generatedDate: "2026-04-30" },
      { invoiceId: "INV-2026-202", month: "May 2026", amount: 975000, status: "Waiting for approval", generatedDate: "2026-05-01" },
      { invoiceId: "INV-2026-203", month: "Jun 2026", amount: 1003000, status: "Overdue", generatedDate: "2026-06-01" },
    ],
  },
  {
    id: "juspay",
    code: "JUS",
    name: "Juspay",
    status: "draft",
    priority: "Medium",
    services: ["Recon end to end", "FIRC Services", "Integration Fee"],
    fixedBilling: 750000,
    monthlyInvoiceEstimate: 890000,
    monthlyTransactionVolume: 4800000,
    variableRevenueGenerated: 94000,
    awsInfraRecovery: 12000,
    reconRevenue: 345000,
    profitabilityRevenue: 98000,
    minimumGuarantee: 750000,
    additionalPlatformFee: 32000,
    integrationFee: 56000,
    billingCycle: "Monthly",
    lastInvoiceGenerated: "2026-04-28",
    logo: "J",
    logoClass: "from-emerald-500 to-cyan-500",
    color: "emerald",
    transactionSlabs: [
      { from: 0, to: 2500000, rate: 0.08, unit: "paisa" },
      { from: 2500000, to: undefined, rate: 0.05, unit: "paisa" },
    ],
    aws: { enabled: false, vendorCost: 0, marginPercentage: 0 },
    notes: "Mixed recon and integration stack with platform fees for India / international flows.",
    invoiceHistory: [
      { invoiceId: "INV-2026-301", month: "Apr 2026", amount: 870000, status: "Received", generatedDate: "2026-04-28" },
      { invoiceId: "INV-2026-302", month: "May 2026", amount: 890000, status: "Generated", generatedDate: "2026-05-01" },
      { invoiceId: "INV-2026-303", month: "Jun 2026", amount: 915000, status: "Waiting for approval", generatedDate: "2026-06-01" },
    ],
  },
  {
    id: "payu",
    code: "PAYU",
    name: "PayU",
    status: "paused",
    priority: "Low",
    services: ["Currency Conversion", "Profitability", "APB"],
    fixedBilling: 420000,
    monthlyInvoiceEstimate: 528000,
    monthlyTransactionVolume: 1800000,
    variableRevenueGenerated: 63000,
    awsInfraRecovery: 8000,
    reconRevenue: 130000,
    profitabilityRevenue: 145000,
    minimumGuarantee: 420000,
    additionalPlatformFee: 14000,
    integrationFee: 22000,
    billingCycle: "Monthly",
    lastInvoiceGenerated: "2026-04-20",
    logo: "Y",
    logoClass: "from-amber-500 to-orange-500",
    color: "amber",
    transactionSlabs: [
      { from: 0, to: 1000000, rate: 0.11, unit: "paisa" },
      { from: 1000000, to: undefined, rate: 0.07, unit: "paisa" },
    ],
    aws: { enabled: true, vendorCost: 24000, marginPercentage: 25 },
    notes: "FX / currency conversion led commercial with profitability and APB pass-through components.",
    invoiceHistory: [
      { invoiceId: "INV-2026-401", month: "Apr 2026", amount: 515000, status: "Received", generatedDate: "2026-04-20" },
      { invoiceId: "INV-2026-402", month: "May 2026", amount: 528000, status: "Generated", generatedDate: "2026-05-01" },
      { invoiceId: "INV-2026-403", month: "Jun 2026", amount: 536000, status: "Send", generatedDate: "2026-06-01" },
    ],
  },
] as const;

type ClientRecord = (typeof CLIENTS)[number] & {
  gstin?: string;
  lutNumber?: string;
  billingAddress?: string;
  billingState?: string;
  billingEmail?: string;
  signatoryName?: string;
  signatoryImage?: string;
  serviceTypeOther?: string;
  serviceOptions?: string[];
  invoiceHistory?: InvoiceRecord[];
  invoicePrefix?: string;
  invoiceCurrentSerial?: number;
  clientType?: ClientType;
  currency?: CurrencyType;
  billingModel?: BillingModel;
  billingYear?: 1 | 2 | 3;
  setupFee?: number;
  setupFeePaid?: number;
  mmcYear1?: number;
  mmcYear2?: number;
  mmcYear3?: number;
  mmcInvoiceTitle?: string;
  transactionFeeRate?: number;
  vapMipConnectivityFee?: number;
  changeManagementFeeRate?: number;
  changeManagementManDays?: number;
  networkCertificationNote?: string;
  infraCostNote?: string;
  customInvoiceRows?: CustomInvoiceRow[];
  invoiceTableConfig?: OverviewInvoiceRow[];
};

type InvoiceStatus =
  | "Waiting for approval"
  | "Generated"
  | "Send"
  | "Received"
  | "Rejected"
  | "Overdue"
  | "Closed";

type InvoiceType = "commercial" | "setup_fee";

interface InvoiceRecord {
  invoiceId: string;
  invoiceNumber?: string;
  month: string;
  client: string;
  amount: number;
  status: InvoiceStatus;
  generatedDate: string;
  serial?: number;
  financialYear?: string;
  customInvoiceRows?: CustomInvoiceRow[];
  invoiceTableConfig?: OverviewInvoiceRow[];
  billingModel?: BillingModel;
  invoiceType?: InvoiceType;
  mmcInvoiceTitle?: string;
  createdAt?: string;
}

const INVOICES: InvoiceRecord[] = [
  { invoiceId: "INV-2026-041", month: "Apr 2026", client: "Payswiff", amount: 208000, status: "Received", generatedDate: "2026-04-30" },
  { invoiceId: "INV-2026-102", month: "May 2026", client: "Razorpay", amount: 1245000, status: "Generated", generatedDate: "2026-05-01" },
  { invoiceId: "INV-2026-202", month: "May 2026", client: "RZPX Razorpay UPI", amount: 975000, status: "Waiting for approval", generatedDate: "2026-05-01" },
  { invoiceId: "INV-2026-303", month: "Jun 2026", client: "Juspay", amount: 915000, status: "Send", generatedDate: "2026-06-01" },
  { invoiceId: "INV-2026-403", month: "Jun 2026", client: "PayU", amount: 536000, status: "Closed", generatedDate: "2026-06-01" },
  { invoiceId: "INV-2026-500", month: "May 2026", client: "Razorpay", amount: 1310000, status: "Overdue", generatedDate: "2026-05-09" },
];

const NOTIFICATIONS = [
  { title: "Overdue invoice detected", description: "Razorpay invoice crossed due date and requires follow-up.", tone: "red", icon: AlertTriangle },
  { title: "AWS billing spike", description: "RZPX infra costs increased by 14% vs last month.", tone: "amber", icon: Warehouse },
  { title: "Slab threshold crossed", description: "PayU moved into the higher variable pricing slab.", tone: "blue", icon: Layers3 },
  { title: "Invoice approval queue", description: "Waiting-for-approval invoices must be approved by FinOps admin before edit or send actions.", tone: "emerald", icon: FileText },
] as const;


function getCurrencySymbol(currencyCode: CurrencyType = "INR"): string {
  const currencyMap: Record<CurrencyType, string> = {
    "INR": "₹",
    "USD": "$",
    "AED": "د.إ",
    "SAR": "﷼",
    "KWD": "د.ك",
    "OMR": "ر.ع.",
    "QAR": "﷼",
    "BHD": "د.ب",
  };
  return currencyMap[currencyCode] || "₹";
}

function getLocaleForCurrency(currencyCode: CurrencyType = "INR"): string {
  const localeMap: Record<CurrencyType, string> = {
    "INR": "en-IN",
    "USD": "en-US",
    "AED": "en-AE",
    "SAR": "en-SA",
    "KWD": "en-KW",
    "OMR": "en-OM",
    "QAR": "en-QA",
    "BHD": "en-BH",
  };
  return localeMap[currencyCode] || "en-IN";
}

function formatCurrency(value: number, currencyCode: CurrencyType = "INR") {
  return new Intl.NumberFormat(getLocaleForCurrency(currencyCode), {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatInvoiceAmount(value: number, currencyCode: CurrencyType = "INR") {
  return new Intl.NumberFormat(getLocaleForCurrency(currencyCode), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function currencyLabel(value: number, currencyCode: CurrencyType = "INR") {
  return `${getCurrencySymbol(currencyCode)}${formatCurrency(value, currencyCode)}`;
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero Only";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    return tens[Math.floor(n / 10)] + (n % 10 > 0 ? " " + ones[n % 10] : "");
  };

  const convertThreeDigits = (n: number): string => {
    if (n === 0) return "";
    let result = "";
    const hundred = Math.floor(n / 100);
    if (hundred > 0) result += ones[hundred] + " Hundred";
    const remainder = n % 100;
    if (remainder > 0) {
      if (result) result += " ";
      result += convertTwoDigits(remainder);
    }
    return result.trim();
  };

  if (num < 0) return "Minus " + numberToWords(Math.abs(num));

  // Indian numbering: Crore (10M), Lakh (100K), Thousand (1K), Hundred, Ones
  const crores = Math.floor(num / 10000000);
  const lakhs = Math.floor((num % 10000000) / 100000);
  const thousands = Math.floor((num % 100000) / 1000);
  const remainder = num % 1000;

  const parts: string[] = [];

  if (crores > 0) {
    parts.push(convertThreeDigits(crores) + " Crore");
  }
  if (lakhs > 0) {
    parts.push(convertThreeDigits(lakhs) + " Lakh");
  }
  if (thousands > 0) {
    parts.push(convertThreeDigits(thousands) + " Thousand");
  }
  if (remainder > 0) {
    parts.push(convertThreeDigits(remainder));
  }

  return (parts.join(" ").trim() + " Only").replace(/\s+/g, " ");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, content: string, type = "text/plain") {
  downloadBlob(filename, new Blob([content], { type }));
}

async function blobToUint8Array(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

function escapeCsv(value: any): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
}

async function readFileDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fetchImageDataUrl(url: string) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    return null;
  }
}

async function resolveSignatureImageDataUrl(value?: string) {
  const normalized = normalizeInlineText(value);
  if (!normalized) return "";
  if (normalized.startsWith("data:image/")) return normalized;
  const imageUrl = normalized.startsWith("http") || normalized.startsWith("/")
    ? normalized
    : `/uploads/${encodeURIComponent(normalized)}`;
  return (await fetchImageDataUrl(imageUrl)) || "";
}

async function downloadInvoiceDocxTemplate({
  client,
  companyConfig,
  invoiceNumber,
  generatedDate,
  amount,
  status,
  month,
  financialYear,
  serial,
  invoiceType = "commercial",
  taxConfig,
}: {
  client: ClientRecord;
  companyConfig: CompanyConfig;
  invoiceNumber: string;
  generatedDate: string;
  amount: number;
  status: string;
  month: string;
  financialYear: string;
  serial: number;
  invoiceType?: InvoiceType;
  taxConfig: TaxConfig;
}) {
  const logoResponse = await fetch(MYLAPAY_LOGO_URL);
  const logoBlob = logoResponse.ok ? await logoResponse.blob() : null;
  const logoData = logoBlob ? await blobToUint8Array(logoBlob) : null;
  const statementRows = getInvoiceHistoryLineItemSummary(client, amount, invoiceType, taxConfig);
  const lineItems = statementRows.filter((item) => item.exportEnabled !== false);
  const printableLineItems = lineItems.length > 0 ? lineItems : statementRows;
  const subtotal = printableLineItems.reduce((sum, item) => sum + item.amount, 0);
  const invoiceCurrency = client.currency || "INR";
  // Calculate GST (18%) - LUT exemption only applies to specific cases
  // For now, always calculate GST for proper invoicing
  const gst = subtotal * 0.18;
  const totalPayable = subtotal + gst;

  const title = (text: string, align: "left" | "right" = "left", size = 10.8) =>
    new Docx.Paragraph({
      alignment: align === "right" ? Docx.AlignmentType.RIGHT : Docx.AlignmentType.LEFT,
      children: [new Docx.TextRun({ text, bold: true, color: INVOICE_THEME.secondaryHex, size })],
      spacing: { after: 3 },
    });

  const labelValue = (label: string, value: string) =>
    new Docx.Paragraph({
      children: [
        new Docx.TextRun({ text: `${label}: `, bold: true, color: INVOICE_THEME.primaryHex, size: 8.4 }),
        new Docx.TextRun({ text: value || "—", color: INVOICE_THEME.secondaryHex, size: 8.4 }),
      ],
      spacing: { after: 1 },
    });

  const tableCell = (text: string, width: number, align: "left" | "right" = "left", bold = false, size = 8.4) =>
    new Docx.TableCell({
      children: String(text || "—")
        .split("\n")
        .map(
          (line) =>
            new Docx.Paragraph({
              alignment: align === "right" ? Docx.AlignmentType.RIGHT : Docx.AlignmentType.LEFT,
              children: [new Docx.TextRun({ text: line || "—", size, bold, color: INVOICE_THEME.secondaryHex })],
              spacing: { after: 0 },
            }),
        ),
      width: { size: width, type: Docx.WidthType.PERCENTAGE },
      margins: { top: 35, bottom: 35, left: 60, right: 60 },
    });

  const billFromRows = [
    ["Company", companyConfig.companyName],
    ["Address", getCompanyDisplayAddress(companyConfig)],
    ["Email", companyConfig.email],
    ["Phone", companyConfig.phone],
    ["GSTIN", companyConfig.gstNumber],
    ["LUT", companyConfig.lutNumber],
    ["CIN", companyConfig.cinNumber],
    ["Website", companyConfig.website],
  ];
  const billToRows = [
    ["Client", getClientDisplayBillingName(client)],
    ["Client Code", client.code],
    ["GSTIN", getClientGstin(client)],
    ...(normalizeInlineText(client.lutNumber) ? [["LUT", client.lutNumber as string]] : []),
    ["Billing Email", client.billingEmail || "—"],
    ["Billing Address", getClientBillToAddress(client)],
  ];

  const document = new Docx.Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          new Docx.Table({
            width: { size: 100, type: Docx.WidthType.PERCENTAGE },
            rows: [
              new Docx.TableRow({
                children: [
                  new Docx.TableCell({
                    width: { size: 58, type: Docx.WidthType.PERCENTAGE },
                    margins: { top: 0, bottom: 0, left: 0, right: 8 },
                    children: [
                      ...(logoData
                        ? [
                            new Docx.Paragraph({
                              alignment: Docx.AlignmentType.LEFT,
                              children: [
                                new Docx.ImageRun({
                                  data: logoData,
                                  transformation: { width: 80, height: 30 },
                                }),
                              ],
                              spacing: { after: 1 },
                            }),
                          ]
                        : []),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: companyConfig.companyName || "Mindeed Technologies and Services Pvt Ltd", bold: true, color: INVOICE_THEME.secondaryHex, size: 9.2 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: getCompanyHeaderAddressLine(companyConfig) || getCompanyDisplayAddress(companyConfig), color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: `CIN: ${companyConfig.cinNumber || "—"}`, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: `GSTIN: ${companyConfig.gstNumber || "—"}`, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: `PAN: ${companyConfig.panNumber || "—"}`, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: getCompanyHeaderContactLine(companyConfig) || `${companyConfig.email || "contact@mylapay.com"} | ${companyConfig.phone || "+91 44 XXXX XXXX"}`, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: `Website: ${getCompanyHeaderWebsiteLine(companyConfig) || companyConfig.website || "—"}`, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        children: [new Docx.TextRun({ text: `LUT: ${companyConfig.lutNumber || "—"}`, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                    ],
                  }),
                  new Docx.TableCell({
                    width: { size: 42, type: Docx.WidthType.PERCENTAGE },
                    margins: { top: 0, bottom: 0, left: 8, right: 0 },
                    children: [
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: "INVOICE", bold: true, color: INVOICE_THEME.secondaryHex, size: 20 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: "TAX INVOICE", bold: true, color: INVOICE_THEME.primaryHex, size: 9 })],
                        spacing: { after: 3 },
                      }),
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: `Invoice No.: ${invoiceNumber}`, bold: true, color: INVOICE_THEME.secondaryHex, size: 7.4 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: `Invoice Date: ${formatInvoicePdfDate(generatedDate)}`, color: INVOICE_THEME.secondaryHex, size: 7 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: `Service Period: ${formatInvoiceServicePeriod(month, generatedDate)}`, color: INVOICE_THEME.secondaryHex, size: 7 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: `Currency: ${client.currency || "INR"}`, color: INVOICE_THEME.secondaryHex, size: 7 })],
                        spacing: { after: 0 },
                      }),
                      new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: [new Docx.TextRun({ text: `Place of Supply: ${getClientPlaceOfSupply(client)}`, color: INVOICE_THEME.secondaryHex, size: 7 })],
                        spacing: { after: 0 },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Docx.Paragraph({ spacing: { after: 6 } }),
          new Docx.Table({
            width: { size: 100, type: Docx.WidthType.PERCENTAGE },
            rows: [
              new Docx.TableRow({
                children: [
                  new Docx.TableCell({
                    children: [title("Bill From", "left", 9), ...billFromRows.flatMap(([label, value]) => [labelValue(label, value)])],
                    width: { size: 50, type: Docx.WidthType.PERCENTAGE },
                    margins: { top: 0, bottom: 0, left: 0, right: 8 },
                  }),
                  new Docx.TableCell({
                    children: [title("Bill To", "left", 9), ...billToRows.flatMap(([label, value]) => [labelValue(label, value)])],
                    width: { size: 50, type: Docx.WidthType.PERCENTAGE },
                    margins: { top: 0, bottom: 0, left: 8, right: 0 },
                  }),
                ],
              }),
            ],
          }),
          new Docx.Paragraph({ spacing: { after: 4 } }),
          new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Statement of Charges", bold: true, color: INVOICE_THEME.secondaryHex, size: 10.8 })], spacing: { after: 3 } }),
          new Docx.Table({
            width: { size: 100, type: Docx.WidthType.PERCENTAGE },
            borders: {
              top: { style: Docx.BorderStyle.SINGLE, size: 1, color: INVOICE_THEME.primaryHex },
              bottom: { style: Docx.BorderStyle.SINGLE, size: 1, color: INVOICE_THEME.primaryHex },
              left: { style: Docx.BorderStyle.SINGLE, size: 1, color: INVOICE_THEME.primaryHex },
              right: { style: Docx.BorderStyle.SINGLE, size: 1, color: INVOICE_THEME.primaryHex },
              insideHorizontal: { style: Docx.BorderStyle.SINGLE, size: 1, color: INVOICE_THEME.primaryHex },
              insideVertical: { style: Docx.BorderStyle.SINGLE, size: 1, color: INVOICE_THEME.primaryHex },
            },
            rows: [
              new Docx.TableRow({
                children: [
                  tableCell("#", 10, "left", true, 8.2),
                  tableCell("Particulars", 65, "left", true, 8.2),
                  tableCell("Amount", 25, "right", true, 8.2),
                ],
              }),
              ...lineItems.map(
                (item, index) =>
                  new Docx.TableRow({
                    children: [
                      tableCell(String(index + 1).padStart(2, "0"), 10, "left", false, 8),
                      tableCell(item.description, 65, item.align || "left", false, 8),
                      tableCell(`INR ${formatInvoiceAmount(item.amount, client.currency || "INR")}`, 25, "right", true, 8),
                    ],
                  }),
              ),
            ],
          }),
          new Docx.Paragraph({
            alignment: Docx.AlignmentType.RIGHT,
            children: [
              new Docx.TextRun({ text: `Subtotal: INR ${formatInvoiceAmount(subtotal, client.currency || "INR")}   `, bold: true, size: 10 }),
              new Docx.TextRun({ text: gst > 0 ? `GST / Tax (18%): INR ${formatInvoiceAmount(gst, client.currency || "INR")}   ` : "GST / Tax (18%): LUT exempt   ", bold: true, size: 10 }),
              new Docx.TextRun({ text: `Total Payable: INR ${formatInvoiceAmount(totalPayable, client.currency || "INR")}`, bold: true, size: 10 }),
            ],
            spacing: { before: 6, after: 4 },
          }),
          new Docx.Paragraph({
            children: [new Docx.TextRun({ text: `Amount in words: Rupees ${numberToWords(Math.round(totalPayable))}`, italics: true, color: INVOICE_THEME.secondaryHex, size: 10 })],
            spacing: { after: 4 },
          }),
          new Docx.Paragraph({
            children: [new Docx.TextRun({ text: "Declaration", bold: true, color: INVOICE_THEME.secondaryHex, size: 12 })],
            spacing: { after: 2 },
          }),
          ...getInvoiceDeclarationLines(companyConfig).map((line, index, lines) =>
            new Docx.Paragraph({
              children: [
                new Docx.TextRun({
                  text: line,
                  bold: index < 2,
                  size: 9,
                  color: INVOICE_THEME.secondaryHex,
                }),
              ],
              spacing: { after: index === lines.length - 1 ? 2 : 1 },
            }),
          ),
          new Docx.Paragraph({
            alignment: Docx.AlignmentType.RIGHT,
            children: [new Docx.TextRun({ text: `For ${companyConfig.companyName || "Mindeed Technologies and Services Pvt Ltd"}`, bold: true, color: INVOICE_THEME.secondaryHex, size: 8.2 })],
            spacing: { after: 2 },
          }),
          ...(await resolveSignatureImageDataUrl(getClientSignatureImage(client) || companyConfig.signatureImage)
            ? [
                new Docx.Paragraph({
                  alignment: Docx.AlignmentType.RIGHT,
                  children: [
                    new Docx.ImageRun({
                      data: await resolveSignatureImageDataUrl(getClientSignatureImage(client) || companyConfig.signatureImage),
                      transformation: { width: 84, height: 72 },
                    }),
                  ],
                  spacing: { after: 1 },
                }),
              ]
            : []),
          new Docx.Paragraph({
            alignment: Docx.AlignmentType.RIGHT,
            children: [new Docx.TextRun({ text: getClientSignatureName(client) || "Authorized Signatory", bold: true, color: INVOICE_THEME.secondaryHex, size: 8.6 })],
            spacing: { after: 0 },
          }),
          new Docx.Paragraph({
            alignment: Docx.AlignmentType.RIGHT,
            children: [new Docx.TextRun({ text: "Authorized Signatory", color: INVOICE_THEME.secondaryHex, size: 8.2 })],
            spacing: { after: 0 },
          }),
          new Docx.Paragraph({ spacing: { before: 4 } }),
        ],
      },
    ],
  });

  const blob = await Docx.Packer.toBlob(document);
  downloadBlob(`${invoiceNumber}.docx`, blob);
}

function getInvoiceDisplayNumber(invoice: any) {
  return invoice?.invoiceNumber || invoice?.invoice_id || invoice?.invoiceId || "—";
}

function normalizeInvoiceStatus(status?: string): InvoiceStatus {
  const normalized = normalizeInlineText(status).toLowerCase();
  if (normalized === "received") return "Received" as InvoiceStatus;
  if (normalized === "waiting for approval" || normalized === "waiting") return "Waiting for approval";
  if (normalized === "generated" || normalized === "approved") return "Generated";
  if (normalized === "send" || normalized === "sent") return "Send";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "overdue") return "Overdue";
  if (normalized === "closed") return "Closed";
  return "Waiting for approval";
}

function isInvoiceEditable(status: InvoiceStatus) {
  return status === "Generated";
}

function isInvoiceAwaitingApproval(status: InvoiceStatus) {
  return status === "Waiting for approval";
}

function isApprovedInvoiceStatus(status?: string) {
  const normalized = normalizeInvoiceStatus(status);
  return (
    normalized === "Generated" ||
    normalized === "Send" ||
    normalized === "Received" ||
    normalized === "Closed" ||
    normalized === "Overdue"
  );
}

function updateInvoiceCollection(
  invoices: InvoiceRecord[],
  targetInvoiceNumber: string,
  updater: (invoice: InvoiceRecord) => InvoiceRecord,
) {
  return invoices.map((invoice) => (getInvoiceDisplayNumber(invoice) === targetInvoiceNumber ? updater(invoice) : invoice));
}

function upsertInvoiceCollection(invoices: InvoiceRecord[], nextInvoice: InvoiceRecord) {
  const targetInvoiceNumber = getInvoiceDisplayNumber(nextInvoice);
  const hasMatch = invoices.some((invoice) => getInvoiceDisplayNumber(invoice) === targetInvoiceNumber);
  if (hasMatch) {
    return invoices.map((invoice) => (getInvoiceDisplayNumber(invoice) === targetInvoiceNumber ? nextInvoice : invoice));
  }
  return [nextInvoice, ...invoices];
}

function deleteInvoiceFromCollection(invoices: InvoiceRecord[], targetInvoiceNumber: string) {
  return invoices.filter((invoice) => getInvoiceDisplayNumber(invoice) !== targetInvoiceNumber);
}

function getInvoiceHistoryLineItemSummary(client: ClientRecord, invoiceAmount: number, invoiceType: InvoiceType = "commercial", taxConfig?: TaxConfig) {
  const breakdown = calculateInvoiceCommercials(client, client.monthlyTransactionVolume || 0);
  const customRows = breakdown.customRows;
  const setupFeeDue = breakdown.setupFeeDue > 0 ? breakdown.setupFeeDue : Number(client.setupFee || 0);

  const configHsn = normalizeInlineText(taxConfig?.invoiceHsnCode);
  const configRate = `${Number(taxConfig?.invoiceRatePercentage || 18)}%`;
  const defaultTaxType: RowTaxType = getTaxTypeFromGstin(client.gstin) || (client.clientType === "International" ? "International" : "Domestic");
  const defaultUseConfigHsn = Boolean(configHsn);
  const makeRow = (item: Partial<InvoiceExportLineItem> & Pick<InvoiceExportLineItem, "description" | "amount">): InvoiceExportLineItem => {
    const taxType = item.taxType || defaultTaxType;
    const taxes = calculateRowTaxes(Number(item.amount || 0), item.rate || configRate, taxType);
    const applyConfigHsn = typeof item.useConfigHsn === "boolean" ? item.useConfigHsn : defaultUseConfigHsn;
    return {
      hsn: applyConfigHsn ? configHsn : (item.hsn || ""),
      rate: item.rate || configRate,
      cgst: taxes.cgst,
      sgst: taxes.sgst,
      igst: taxes.igst,
      align: item.align || "left",
      taxType,
      exportEnabled: item.exportEnabled ?? Number(item.amount || 0) !== 0,
      totalAmount: taxes.totalAmount,
      description: item.description,
      amount: Number(item.amount || 0),
      useConfigHsn: applyConfigHsn,
    };
  };

  if (invoiceType === "setup_fee") {
    return [makeRow({ description: "One time Setup Fee", amount: invoiceAmount || setupFeeDue, taxType: defaultTaxType })];
  }

  const savedRows = Array.isArray(client.invoiceTableConfig) ? client.invoiceTableConfig : [];
  if (savedRows.length > 0) {
    return savedRows
      .filter((row) => row && row.exportEnabled !== false && Number(row.amount || 0) !== 0)
      .map((row) =>
        makeRow({
          description: row.narration || "—",
          amount: Number(row.amount || 0),
          hsn: String(row.hsn || ""),
          rate: String(row.rate || configRate),
          cgst: Number(row.cgst || 0),
          sgst: Number(row.sgst || 0),
          igst: Number(row.igst || 0),
          align: row.align || "left",
          taxType: row.taxType || defaultTaxType,
          useConfigHsn: row.useConfigHsn,
          exportEnabled: row.exportEnabled,
        }),
      );
  }

  const setupRows = breakdown.setupFeeDue > 0 ? [makeRow({ description: "Onetime Setup Fee (pending)", amount: breakdown.setupFeeDue, useConfigHsn: false })] : [];

  if (getBillingModel(client) === "mmc") {
    const mmcFloor = getActiveMmcAmount(client);
    const transactionBreakdown = getMmcTransactionChargeBreakdown(client, Number(client.monthlyTransactionVolume || 0));
    return [
      ...setupRows,
      makeRow({ description: getMmcMinimumGuaranteeLabel(client), amount: mmcFloor, useConfigHsn: false }),
      makeRow({ description: transactionBreakdown.detailLines.join("\n"), amount: transactionBreakdown.amount, useConfigHsn: false }),
    ];
  }

  const fixedBilling = Number(client.fixedBilling || 0);
  const awsCharge = breakdown.awsMarkup;
  const remainingAfterFixed = Math.max(invoiceAmount - fixedBilling - awsCharge, 0);
  return [
    ...setupRows,
    makeRow({ description: "Fixed Commercial Charges", amount: fixedBilling, useConfigHsn: false }),
    makeRow({ description: "Variable Slab Charges", amount: Math.max(remainingAfterFixed - Number(client.integrationFee || 0) - Number(client.additionalPlatformFee || 0), 0), useConfigHsn: false }),
    makeRow({ description: "AWS Infra Pass-through", amount: awsCharge, useConfigHsn: false }),
    makeRow({ description: "Additional Platform Fee", amount: Number(client.additionalPlatformFee || 0), useConfigHsn: false }),
    makeRow({ description: "Integration Fee", amount: Number(client.integrationFee || 0), useConfigHsn: false }),
    ...customRows.map((row) =>
      makeRow({
        description: formatCustomInvoiceRowParagraph(row),
        amount: Number(row.amount || 0),
        hsn: String(row.hsn || ""),
        rate: String(row.rate || configRate),
        cgst: Number(row.cgst || 0),
        sgst: Number(row.sgst || 0),
        igst: Number(row.igst || 0),
        align: row.align || "left",
        taxType: row.taxType,
        useConfigHsn: row.useConfigHsn,
        exportEnabled: row.exportEnabled ?? Number(row.amount || 0) !== 0,
      }),
    ),
  ];
}

function getClientDisplayBillingName(client: ClientRecord) {
  const name = normalizeInlineText(client.name);
  if (!name) return "—";
  return name.toLowerCase().startsWith("m/s.") ? name : `M/s. ${name}`;
}

function normalizeInlineText(value: string | undefined | null) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getClientBillToAddress(client: ClientRecord) {
  return normalizeInlineText(client.billingAddress) || "—";
}

function getCompanyHeaderAddressLine(companyConfig: CompanyConfig) {
  return normalizeInlineText([companyConfig.address, companyConfig.city, companyConfig.state, companyConfig.pincode].filter(Boolean).join(", "));
}

function getCompanyHeaderContactLine(companyConfig: CompanyConfig) {
  return [companyConfig.email, companyConfig.phone].filter(Boolean).join(" | ");
}

function getCompanyHeaderWebsiteLine(companyConfig: CompanyConfig) {
  return normalizeInlineText(companyConfig.website);
}

function getClientGstin(client: ClientRecord) {
  return client.gstin || "—";
}

function getTaxTypeFromGstin(gstin?: string): RowTaxType | null {
  const normalized = normalizeInlineText(gstin).replace(/[^0-9A-Za-z]/g, "");
  if (normalized.length < 2) return null;
  return normalized.startsWith("33") ? "Domestic" : "International";
}

function getClientTaxType(client: ClientRecord, fallback: RowTaxType): RowTaxType {
  return getTaxTypeFromGstin(client.gstin) || fallback;
}

function getClientLut(client: ClientRecord) {
  return client.lutNumber || "—";
}

function getClientSignatureName(client: ClientRecord) {
  return client.signatoryName || "Authorized Signatory";
}

function getClientSignatureImage(client: ClientRecord) {
  return normalizeInlineText(client.signatoryImage);
}

function getCompanyDisplayAddress(companyConfig: CompanyConfig) {
  return [companyConfig.address, `${companyConfig.city}, ${companyConfig.state}, India`, companyConfig.pincode]
    .filter(Boolean)
    .join("\n");
}

async function downloadInvoicePdfTemplate({
  client,
  companyConfig,
  invoiceNumber,
  generatedDate,
  amount,
  status,
  month,
  financialYear,
  serial,
  invoiceType = "commercial",
  taxConfig,
  outputMode = "download",
}: {
  client: ClientRecord;
  companyConfig: CompanyConfig;
  invoiceNumber: string;
  generatedDate: string;
  amount: number;
  status: string;
  month: string;
  financialYear: string;
  serial: number;
  invoiceType?: InvoiceType;
  taxConfig: TaxConfig;
  outputMode?: "download" | "preview";
}): Promise<jsPDF | string> {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const PRIMARY = INVOICE_THEME.primaryRgb;
  const SECONDARY = INVOICE_THEME.secondaryRgb;
  const TEXT = SECONDARY;
  const MUTED: [number, number, number] = [110, 124, 158];
  const SOFT: [number, number, number] = [225, 232, 246];
  const FOOTER_HEIGHT = 18;
  const logoData = await fetchImageDataUrl(MYLAPAY_LOGO_URL);
  const money = (value: number) => `INR ${formatCurrency(value)}`;
  const wrap = (value: string, width: number) =>
    doc.splitTextToSize(String(value || "—"), width) as string[];
  const wrapParagraph = (value: string, width: number) =>
    String(value || "—")
      .split("\n")
      .flatMap((part) => doc.splitTextToSize(part || "—", width) as string[]);

  const setText = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
  const setFill = (color: [number, number, number]) => doc.setFillColor(color[0], color[1], color[2]);
  const setStroke = (color: [number, number, number]) => doc.setDrawColor(color[0], color[1], color[2]);

  const drawFooter = () => {
    const fy = pageHeight - 6;
    setText(PRIMARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, fy, { align: "right" });
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - FOOTER_HEIGHT - 6) {
      drawFooter();
      doc.addPage();
      cursorY = margin;
      drawHeaderBand();
    }
  };

  const drawHeaderBand = () => {
    setFill(SECONDARY);
    doc.rect(0, 0, pageWidth, 4, "F");
    setFill(PRIMARY);
    doc.rect(0, 4, pageWidth, 1, "F");
    cursorY = margin + 2;
  };

  let cursorY = margin;
  drawHeaderBand();

  // === HEADER ===
  const headerHeight = 40;
  const headerLeftWidth = contentWidth * 0.62;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", margin, cursorY + 0.4, 29, 9.8);
    } catch {}
  }

  const headerLeftLines = [
    companyConfig.companyName || "Mindeed Technologies and Services Pvt Ltd",
    getCompanyHeaderAddressLine(companyConfig) || getCompanyDisplayAddress(companyConfig),
    `CIN: ${companyConfig.cinNumber || "—"}`,
    `GSTIN: ${companyConfig.gstNumber || "—"} | PAN: ${companyConfig.panNumber || "—"}`,
    getCompanyHeaderContactLine(companyConfig) || companyConfig.email || companyConfig.phone || "—",
    getCompanyHeaderWebsiteLine(companyConfig) || companyConfig.website || "—",
  ];

  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.0);
  let headerLeftY = cursorY + 15.6;
  headerLeftLines.forEach((line, idx) => {
    doc.setFont("helvetica", idx === 0 ? "bold" : "normal");
    doc.setFontSize(idx === 0 ? 8.2 : 6.0);
    const lines = wrap(String(line), headerLeftWidth);
    doc.text(lines, margin, headerLeftY);
    headerLeftY += lines.length * (idx === 0 ? 3.7 : 3.0) + 0.2;
  });

  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18.0);
  doc.text("INVOICE", pageWidth - margin, cursorY + 6.0, { align: "right" });
  setText(PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.1);
  doc.text("TAX INVOICE", pageWidth - margin, cursorY + 9.7, { align: "right" });

  const invoiceCurrency = client.currency || "INR";
  const servicePeriod = formatInvoiceServicePeriod(month, generatedDate);
  const placeOfSupply = getClientPlaceOfSupply(client);

  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.text("Invoice No", pageWidth - margin - 42, cursorY + 17.2);
  doc.text("Invoice Date", pageWidth - margin - 42, cursorY + 20.6);
  doc.text("Service Period", pageWidth - margin - 42, cursorY + 24.0);
  doc.text("Currency", pageWidth - margin - 42, cursorY + 27.4);
  doc.text("Place of Supply", pageWidth - margin - 42, cursorY + 30.8);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.7);
  doc.text(invoiceNumber, pageWidth - margin, cursorY + 17.2, { align: "right" });
  doc.text(formatInvoicePdfDate(generatedDate), pageWidth - margin, cursorY + 20.6, { align: "right" });
  doc.text(servicePeriod, pageWidth - margin, cursorY + 24.0, { align: "right" });
  doc.text(invoiceCurrency, pageWidth - margin, cursorY + 27.4, { align: "right" });
  doc.text(placeOfSupply, pageWidth - margin, cursorY + 30.8, { align: "right" });

  cursorY += headerHeight + 2;

  // Divider line
  setStroke(PRIMARY);
  doc.setLineWidth(0.6);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  // === BILL TO ONLY ===
  const halfWidth = (contentWidth - 8) / 2;
  const leftX = margin;
  const rightX = margin + halfWidth + 8;
  const leftRows = [
    getClientDisplayBillingName(client),
    getClientBillToAddress(client),
  ];
  const rightRows = [
    client.billingEmail || "—",
    `GSTIN: ${getClientGstin(client) || "—"}`,
    ...(normalizeInlineText(client.lutNumber) ? [`LUT: ${getClientLut(client)}`] : []),
  ];

  const renderBillSection = (x: number, title: string, rows: string[], width: number, boldFirstRow = true) => {
    setText(SECONDARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.text(title, x, cursorY);

    let py = cursorY + 4.6;
    rows.forEach((row, index) => {
      const isLeadRow = index === 0 && boldFirstRow;
      const lines = wrap(row, width);
      setText(isLeadRow ? SECONDARY : MUTED);
      doc.setFont("helvetica", isLeadRow ? "bold" : "normal");
      doc.setFontSize(isLeadRow ? 10.2 : 6.8);
      doc.text(lines, x, py);
      py += lines.length * (isLeadRow ? 4.4 : 3.2) + 0.5;
    });

    return py;
  };

  const leftEnd = renderBillSection(leftX, "BILLED TO", leftRows, halfWidth, true);
  const rightEnd = renderBillSection(rightX, "DETAILS", rightRows, halfWidth, false);
  cursorY = Math.max(leftEnd, rightEnd) + 3;

  // === STATEMENT OF CHARGES ===
  const statementRows = getInvoiceHistoryLineItemSummary(client, amount, invoiceType, taxConfig);
  const lineItems = statementRows.filter((item) => item.exportEnabled !== false);
  const printableLineItems = lineItems.length > 0 ? lineItems : statementRows;
  const subtotal = printableLineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cgstTotal = printableLineItems.reduce((sum, item) => sum + Number(item.cgst || 0), 0);
  const sgstTotal = printableLineItems.reduce((sum, item) => sum + Number(item.sgst || 0), 0);
  const igstTotal = printableLineItems.reduce((sum, item) => sum + Number(item.igst || 0), 0);
  const taxTotal = cgstTotal + sgstTotal + igstTotal;
  const totalPayable = subtotal + taxTotal;

  ensureSpace(18);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.4);
  doc.text("Statement of Charges", margin, cursorY);
  cursorY += 3;

  const columns = {
    no: 8,
    narration: 60,
    amount: 22,
    hsn: 13,
    rate: 11,
    cgst: 15,
    sgst: 15,
    igst: 15,
    total: 23,
  };
  // Ensure table spans exactly contentWidth
  const tableWCheck = columns.no + columns.narration + columns.amount + columns.hsn + columns.rate + columns.cgst + columns.sgst + columns.igst + columns.total;
  if (tableWCheck !== contentWidth) {
    columns.narration += contentWidth - tableWCheck;
  }
  const colPositions = {
    no: margin,
    narration: margin + columns.no,
    amount: margin + columns.no + columns.narration,
    hsn: margin + columns.no + columns.narration + columns.amount,
    rate: margin + columns.no + columns.narration + columns.amount + columns.hsn,
    cgst: margin + columns.no + columns.narration + columns.amount + columns.hsn + columns.rate,
    sgst: margin + columns.no + columns.narration + columns.amount + columns.hsn + columns.rate + columns.cgst,
    igst: margin + columns.no + columns.narration + columns.amount + columns.hsn + columns.rate + columns.cgst + columns.sgst,
    total: margin + columns.no + columns.narration + columns.amount + columns.hsn + columns.rate + columns.cgst + columns.sgst + columns.igst,
  };
  const tableW = columns.no + columns.narration + columns.amount + columns.hsn + columns.rate + columns.cgst + columns.sgst + columns.igst + columns.total;
  const headerH = 9;
  setFill(SECONDARY);
  doc.rect(margin, cursorY, tableW, headerH, "F");
  setText([255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("#", colPositions.no + columns.no / 2, cursorY + 6.4, { align: "center" });
  doc.text("PARTICULARS", colPositions.narration + 3, cursorY + 6.4);
  doc.text("AMOUNT", colPositions.amount + columns.amount - 3, cursorY + 6.4, { align: "right" });
  doc.text("HSN", colPositions.hsn + columns.hsn / 2, cursorY + 6.4, { align: "center" });
  doc.text("RATE", colPositions.rate + columns.rate / 2, cursorY + 6.4, { align: "center" });
  doc.text("CGST", colPositions.cgst + columns.cgst / 2, cursorY + 6.4, { align: "center" });
  doc.text("SGST", colPositions.sgst + columns.sgst / 2, cursorY + 6.4, { align: "center" });
  doc.text("IGST", colPositions.igst + columns.igst / 2, cursorY + 6.4, { align: "center" });
  doc.text("AMOUNT", colPositions.total + columns.total - 3, cursorY + 6.4, { align: "right" });
  cursorY += headerH;

  doc.setLineHeightFactor(1.1);
  printableLineItems.forEach((item, idx) => {
    const narrationLines = wrapParagraph(item.description, columns.narration - 6);
    const rowH = Math.max(14, narrationLines.length * 5.2 + 6);
    ensureSpace(rowH + 1);
    if (idx % 2 === 0) {
      setFill([248, 251, 254]);
      doc.rect(margin, cursorY, tableW, rowH, "F");
    }
    setStroke(SOFT);
    doc.setLineWidth(0.2);
    doc.rect(margin, cursorY, tableW, rowH);

    const verticalLines = [
      colPositions.narration,
      colPositions.amount,
      colPositions.hsn,
      colPositions.rate,
      colPositions.cgst,
      colPositions.sgst,
      colPositions.igst,
      colPositions.total,
    ];
    verticalLines.forEach((x) => doc.line(x, cursorY, x, cursorY + rowH));

    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    const midY = cursorY + rowH / 2 + 2.2;
    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.0);
    doc.text(String(idx + 1).padStart(2, "0"), colPositions.no + columns.no / 2, midY, { align: "center" });

    setText(SECONDARY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.text(narrationLines, colPositions.narration + 4, cursorY + 5.2, { align: "left", baseline: "top" });

    setText(SECONDARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.text(formatInvoiceAmount(item.amount, invoiceCurrency), colPositions.amount + columns.amount - 2.5, midY, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(item.hsn || "-", colPositions.hsn + columns.hsn / 2, midY, { align: "center" });
    doc.text(item.rate || "-", colPositions.rate + columns.rate / 2, midY, { align: "center" });
    doc.text(item.cgst > 0 ? formatInvoiceAmount(item.cgst, invoiceCurrency) : "-", colPositions.cgst + columns.cgst / 2, midY, { align: "center" });
    doc.text(item.sgst > 0 ? formatInvoiceAmount(item.sgst, invoiceCurrency) : "-", colPositions.sgst + columns.sgst / 2, midY, { align: "center" });
    doc.text(item.igst > 0 ? formatInvoiceAmount(item.igst, invoiceCurrency) : "-", colPositions.igst + columns.igst / 2, midY, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.text(formatInvoiceAmount(item.totalAmount, invoiceCurrency), colPositions.total + columns.total - 2.5, midY, { align: "right" });
    cursorY += rowH;
  });
  doc.setLineHeightFactor(1.15);

  setStroke(SOFT);
  doc.setLineWidth(0.3);
  doc.line(margin, cursorY, margin + tableW, cursorY);
  cursorY += 2;

  // === TOTALS ===
  ensureSpace(14);
  const totalsW = 88;
  const totalsX = pageWidth - margin - totalsW;
  const lineRow = (label: string, value: string, opts?: { bold?: boolean; bg?: boolean }) => {
    if (opts?.bg) {
      setFill(SECONDARY);
      doc.rect(totalsX, cursorY, totalsW, 9, "F");
      setText([255, 255, 255]);
    } else {
      setText(SECONDARY);
    }
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.bold ? 10 : 8.6);
    doc.text(label, totalsX + 4, cursorY + 6);
    doc.text(value, totalsX + totalsW - 4, cursorY + 6, { align: "right" });
    cursorY += opts?.bg ? 9 : 7;
  };
  lineRow("Sub Total", formatInvoiceAmount(subtotal, invoiceCurrency));
  lineRow("CGST", cgstTotal > 0 ? formatInvoiceAmount(cgstTotal, invoiceCurrency) : "-");
  lineRow("SGST", sgstTotal > 0 ? formatInvoiceAmount(sgstTotal, invoiceCurrency) : "-");
  lineRow("IGST", igstTotal > 0 ? formatInvoiceAmount(igstTotal, invoiceCurrency) : "-");
  lineRow("Total Amount", formatInvoiceAmount(totalPayable, invoiceCurrency), { bold: true, bg: true });
  cursorY += 8;

  // === AMOUNT IN WORDS ===
  ensureSpace(8);
  setText(MUTED);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.2);
  doc.text(`Amount in words: Rupees ${numberToWords(Math.round(totalPayable))}`, margin, cursorY + 2.5);
  cursorY += 8;

  // === DECLARATION ===
  ensureSpace(14);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  doc.text("Declaration", margin, cursorY);
  setStroke(PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY + 1.6, margin + 28, cursorY + 1.6);
  cursorY += 8;

  const declarationStyles = parseDeclarationStyle(companyConfig.declarationText);
  const declarationHost = document.createElement("div");
  declarationHost.style.position = "fixed";
  declarationHost.style.left = "-10000px";
  declarationHost.style.top = "0";
  declarationHost.style.width = `${Math.round(contentWidth * 3.78)}px`;
  declarationHost.style.background = "#ffffff";
  declarationHost.style.color = "rgb(31, 41, 92)";
  declarationHost.innerHTML = `
    <div style="font-family: ${declarationStyles.fontFamily}; font-size: ${declarationStyles.fontSize}px; line-height: ${declarationStyles.lineHeight}; text-align: ${declarationStyles.textAlign}; color: rgb(31, 41, 92); white-space: normal; padding-bottom: 18px; box-sizing: border-box;">
      <style>
        p { margin: 0 0 4px 0; }
        div { margin: 0; }
        strong, b { font-weight: 700; }
        em, i { font-style: italic; }
      </style>
      ${declarationStyles.html}
    </div>
  `;
  document.body.appendChild(declarationHost);
  try {
    const declarationCanvas = await html2canvas(declarationHost.firstElementChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
    });
    const declarationImgData = declarationCanvas.toDataURL("image/png");
    const declarationImgWidth = contentWidth;
    const declarationImgHeight = (declarationCanvas.height * declarationImgWidth) / declarationCanvas.width;
    ensureSpace(declarationImgHeight + 10);
    doc.addImage(declarationImgData, "PNG", margin, cursorY, declarationImgWidth, declarationImgHeight);
    cursorY += declarationImgHeight + 6;
  } finally {
    declarationHost.remove();
  }

  // === SIGNATURE ===
  ensureSpace(12);
  const sigW = 92;
  const sigX = pageWidth - margin - sigW;
  const signatoryName = (client.signatoryName || "").trim();
  const signatoryImage = await resolveSignatureImageDataUrl(
    getClientSignatureImage(client) || companyConfig.signatureImage,
  );
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(`For ${companyConfig.companyName || "Mindeed Technologies and Services Pvt Ltd"}`, sigX + sigW, cursorY, { align: "right" });
  cursorY += 1;

  if (signatoryImage) {
    const imageW = 42;
    const imageH = 24;
    try {
      doc.addImage(signatoryImage, signatoryImage.startsWith("data:image/png") ? "PNG" : "JPEG", sigX + sigW - imageW - 2, cursorY, imageW, imageH);
    } catch (error) {
      console.error("[Invoice PDF] Failed to render signature image:", error);
    }
    cursorY += imageH - 2;
  } else {
    cursorY += 1;
  }

  if (signatoryName) {
    setText(SECONDARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(signatoryName, sigX + sigW, cursorY - 1, { align: "right" });
  }
  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.text("Authorized Signatory", sigX + sigW, cursorY + 6, { align: "right" });

  drawFooter();
  if (outputMode === "preview") {
    return URL.createObjectURL(doc.output("blob"));
  }
  doc.save(`${invoiceNumber}.pdf`);
  return doc;
}

function getInvoiceNumberForClient(
  client: ClientRecord,
  config: InvoiceSerialConfig,
  state: InvoiceSerialState,
  clients: ClientRecord[],
  prefixSerialConfigs: Record<string, PrefixSerialConfig>,
  preferredPrefix?: string,
) {
  const financialYear = getFinancialYearLabel(getIstNow(), config.financialYearStartMonth);
  const prefix = normalizeInlineText(preferredPrefix || client.invoicePrefix || config.prefix) || config.prefix;
  const preferredFormat = getPreferredInvoiceNumberFormat(getInvoiceDisplayNumber(client.invoiceHistory?.[0]), config.format);
  const effectiveConfig = { ...config, prefix, format: preferredFormat };
  const hasClientSerialConfig = Boolean(prefix || Number(client.invoiceCurrentSerial || 0) > 0);

  if (hasClientSerialConfig) {
    const prefixKey = normalizeInlineText(prefix).toUpperCase();
    const prefixConfig = prefixSerialConfigs[prefixKey];
    const currentSerial = Number(prefixConfig?.currentSerial ?? client.invoiceCurrentSerial ?? 0);
    const serial = currentSerial > 0 ? currentSerial + 1 : 1;
    const period = prefixConfig?.period || financialYear;
    return {
      invoiceNumber: buildInvoiceNumber(effectiveConfig, period, serial),
      financialYear: period,
      serial,
    };
  }

  const serial = state.financialYear === financialYear ? state.serial + 1 : 1;
  return {
    invoiceNumber: buildInvoiceNumber(effectiveConfig, financialYear, serial),
    financialYear,
    serial,
  };
}

function getPriorityFromClient(client: ClientRecord): keyof typeof PRIORITY_META {
  if (client.priority) return client.priority as keyof typeof PRIORITY_META;
  if (client.monthlyInvoiceEstimate >= 1000000) return "Critical";
  if (client.monthlyInvoiceEstimate >= 500000) return "High";
  if (client.monthlyInvoiceEstimate >= 250000) return "Medium";
  return "Low";
}

function getPriorityForScoring(client: ClientRecord) {
  const revenueScore = client.monthlyInvoiceEstimate >= 1000000 ? 4 : client.monthlyInvoiceEstimate >= 500000 ? 3 : client.monthlyInvoiceEstimate >= 250000 ? 2 : 1;
  const volumeScore = client.monthlyTransactionVolume >= 20000000 ? 4 : client.monthlyTransactionVolume >= 10000000 ? 3 : client.monthlyTransactionVolume >= 4000000 ? 2 : 1;
  const serviceScore = client.services.length >= 6 ? 4 : client.services.length >= 4 ? 3 : client.services.length >= 2 ? 2 : 1;
  const awsScore = client.aws.enabled ? 2 : 0;
  const total = revenueScore + volumeScore + serviceScore + awsScore;
  if (total >= 11) return "Critical";
  if (total >= 8) return "High";
  if (total >= 5) return "Medium";
  return "Low";
}

function getBillingModel(client: ClientRecord): BillingModel {
  return client.billingModel === "mmc" ? "mmc" : "transaction";
}

function getCustomInvoiceRows(client: ClientRecord): CustomInvoiceRow[] {
  return Array.isArray(client.customInvoiceRows)
    ? client.customInvoiceRows.filter((row) => row && (String(row.name || "").trim().length > 0 || String(row.narration || "").trim().length > 0))
    : [];
}

function formatCustomInvoiceRowParagraph(row: CustomInvoiceRow) {
  const title = String(row.name || "").trim();
  const subtitle = String(row.narration || "").trim();

  if (row.narrationMode === "title") {
    return [title, subtitle].filter(Boolean).join("\n");
  }

  if (row.narrationMode === "subtitle") {
    return [subtitle || title, title && subtitle ? `Title: ${title}` : ""].filter(Boolean).join("\n");
  }

  return [title, subtitle].filter(Boolean).join("\n");
}

function parseRatePercentage(rate: string) {
  const value = Number(String(rate || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function calculateRowTaxes(amount: number, rate: string, taxType: RowTaxType) {
  const taxable = Number(amount || 0);
  const percent = String(rate || "").trim() ? parseRatePercentage(rate) : 18;
  const tax = taxable * (percent / 100);
  if (taxType === "International") {
    const igst = Math.round(tax * 100) / 100;
    return { cgst: 0, sgst: 0, igst, totalAmount: Math.round((taxable + igst) * 100) / 100 };
  }

  const cgst = Math.round((tax / 2) * 100) / 100;
  const sgst = Math.round((tax / 2) * 100) / 100;
  return { cgst, sgst, igst: 0, totalAmount: Math.round((taxable + cgst + sgst) * 100) / 100 };
}

function getEffectiveOverviewRowUseConfigHsn(row: Partial<OverviewInvoiceRow>, taxConfig: TaxConfig) {
  const configHsn = normalizeInlineText(taxConfig.invoiceHsnCode);
  if (!configHsn) return Boolean(row.useConfigHsn);
  return Boolean(row.useConfigHsn) || normalizeInlineText(row.hsn) === configHsn;
}

function applyOverviewRowTaxes(row: OverviewInvoiceRow, fallbackTaxType: RowTaxType, taxConfig: TaxConfig): OverviewInvoiceRow {
  const taxType = fallbackTaxType;
  const defaultRate = taxType === "International"
    ? `${taxConfig.igstPercentage || 18}%`
    : `${Number(taxConfig.cgstPercentage || 9) + Number(taxConfig.sgstPercentage || 9)}%`;
  const effectiveRate = String(row.rate || "").trim() || defaultRate;
  const taxes = calculateRowTaxes(row.amount, effectiveRate, taxType);
  return { ...row, rate: effectiveRate, taxType, cgst: taxes.cgst, sgst: taxes.sgst, igst: taxes.igst };
}

function buildOverviewInvoiceRows(client: ClientRecord, txnCount: number, transactionBased: boolean, taxConfig: TaxConfig): OverviewInvoiceRow[] {
  const defaultTaxType: RowTaxType = getTaxTypeFromGstin(client.gstin) || (taxConfig.defaultTaxType === "IGST" ? "International" : "Domestic");
  const defaultRate = `${Number(taxConfig.invoiceRatePercentage || 18)}%`;
  const defaultUseConfigHsn = Boolean(taxConfig.invoiceHsnCode);
  const configHsn = normalizeInlineText(taxConfig.invoiceHsnCode);
  const breakdown = calculateInvoiceCommercials(client, txnCount);
  const hasSlabConfig = Array.isArray(client.transactionSlabs) && client.transactionSlabs.length > 0;
  const variableCharge = Math.max(
    breakdown.transactionBase - Number(client.fixedBilling || 0) - breakdown.awsMarkup - Number(client.additionalPlatformFee || 0) - Number(client.integrationFee || 0),
    0,
  );
  const setupFeeDue = breakdown.setupFeeDue;
  const billingModel = getBillingModel(client);
  const savedRows = Array.isArray(client.invoiceTableConfig) ? client.invoiceTableConfig : [];

  if (savedRows.length > 0) {
    return savedRows.map((row) =>
      applyOverviewRowTaxes(
        {
          ...row,
          useConfigHsn: getEffectiveOverviewRowUseConfigHsn(row, taxConfig),
          hsn: getEffectiveOverviewRowUseConfigHsn(row, taxConfig) ? configHsn : String(row.hsn || ""),
        } as OverviewInvoiceRow,
        defaultTaxType,
        taxConfig,
      ),
    );
  }

  if (billingModel === "mmc") {
    const mmcFloor = getMmcFixedChargesTotal(client);
    const transactionBreakdown = getMmcTransactionChargeBreakdown(client, txnCount);
    const awsVendorCost = Number(client.aws?.vendorCost || 0);
    const awsMarginAmount = client.aws?.enabled
      ? Math.round(awsVendorCost * (Number(client.aws?.marginPercentage || 0) / 100))
      : 0;
    const mmcRows: OverviewInvoiceRow[] = [
      ...(client.aws?.enabled
        ? [
            {
              id: "aws-vendor-cost",
              kind: "derived",
              narration: "AWS Vendor Cost",
              amount: awsVendorCost,
              hsn: "",
              rate: defaultRate,
              cgst: 0,
              sgst: 0,
              igst: 0,
              align: "left",
              editable: true,
              narrationMode: "title",
              exportEnabled: awsVendorCost !== 0,
              useConfigHsn: defaultUseConfigHsn,
            },
            {
              id: "aws-pass-through",
              kind: "derived",
              narration: "AWS Margin Amount",
              amount: awsMarginAmount,
              hsn: "",
              rate: defaultRate,
              cgst: 0,
              sgst: 0,
              igst: 0,
              align: "left",
              editable: true,
              narrationMode: "title",
              exportEnabled: awsMarginAmount !== 0,
              useConfigHsn: defaultUseConfigHsn,
            },
          ]
        : []),
      {
        id: "mmc-floor",
        kind: "derived",
        narration: getMmcMinimumGuaranteeLabel(client),
        narrationDetails: getMmcFixedChargeDetailLines(client),
        amount: mmcFloor,
        hsn: "",
        rate: defaultRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        align: "left",
        editable: false,
        narrationMode: "multiline",
        exportEnabled: mmcFloor >= transactionBreakdown.amount,
        useConfigHsn: defaultUseConfigHsn,
      },
    ];
    if (hasSlabConfig) {
      mmcRows.push({
        id: "variable-slab",
        kind: "derived",
        narration: `Transaction Charges\n${transactionBreakdown.detailLines.join("\n")}`,
        amount: transactionBreakdown.amount,
        hsn: "",
        rate: defaultRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        align: "left",
        editable: false,
        narrationMode: "multiline",
        exportEnabled: transactionBreakdown.amount > mmcFloor,
        useConfigHsn: defaultUseConfigHsn,
      });
    }
    return mmcRows.map((row) => applyOverviewRowTaxes(row, defaultTaxType, taxConfig));
  }

  const baseRows: OverviewInvoiceRow[] = [
    {
      id: "fixed-billing",
      kind: "derived",
      narration: "Fixed Commercial Charges",
      amount: Number(client.fixedBilling || 0),
      hsn: "",
      rate: defaultRate,
      cgst: 0,
      sgst: 0,
      igst: 0,
      align: "left",
      editable: true,
      narrationMode: "title",
      exportEnabled: Number(client.fixedBilling || 0) !== 0,
      useConfigHsn: defaultUseConfigHsn,
    },
  ];

  if (transactionBased && hasSlabConfig) {
    baseRows.push({
      id: "variable-slab",
      kind: "derived",
      narration: "Variable Slab Charges",
      amount: variableCharge,
      hsn: "",
      rate: defaultRate,
      cgst: 0,
      sgst: 0,
      igst: 0,
      align: "left",
      editable: false,
      narrationMode: "subtitle",
      exportEnabled: variableCharge !== 0,
      useConfigHsn: defaultUseConfigHsn,
    });
  }

  if (client.aws?.enabled) {
    baseRows.push({
      id: "aws-vendor-cost",
      kind: "derived",
      narration: "AWS Vendor Cost",
      amount: Number(client.aws.vendorCost || 0),
      hsn: "",
      rate: defaultRate,
      cgst: 0,
      sgst: 0,
      igst: 0,
      align: "left",
      editable: true,
      narrationMode: "title",
      exportEnabled: Number(client.aws.vendorCost || 0) !== 0,
      useConfigHsn: defaultUseConfigHsn,
    });
  }

  baseRows.push(
    {
      id: "aws-pass-through",
      kind: "derived",
      narration: "AWS Infra Pass-through",
      amount: breakdown.awsMarkup,
      hsn: "",
      rate: defaultRate,
      cgst: 0,
      sgst: 0,
      igst: 0,
      align: "left",
      editable: false,
      narrationMode: "subtitle",
      exportEnabled: breakdown.awsMarkup !== 0,
      useConfigHsn: defaultUseConfigHsn,
    },
      {
        id: "additional-platform-fee",
        kind: "derived",
        narration: "Additional Platform Fee",
        amount: Number(client.additionalPlatformFee || 0),
        hsn: "",
        rate: defaultRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        align: "left",
        editable: true,
        narrationMode: "title",
        exportEnabled: Number(client.additionalPlatformFee || 0) !== 0,
        useConfigHsn: defaultUseConfigHsn,
      },
      {
        id: "integration-fee",
        kind: "derived",
        narration: "Integration Fee",
        amount: Number(client.integrationFee || 0),
        hsn: "",
        rate: defaultRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        align: "left",
        editable: true,
        narrationMode: "title",
        exportEnabled: Number(client.integrationFee || 0) !== 0,
        useConfigHsn: defaultUseConfigHsn,
      },
  );

  if (setupFeeDue > 0) {
    baseRows.push({
      id: "setup-fee",
      kind: "derived",
      narration: "One time Setup Fee",
      amount: setupFeeDue,
      hsn: "",
      rate: defaultRate,
      cgst: 0,
      sgst: 0,
      igst: 0,
      align: "left",
      editable: true,
      narrationMode: "title",
      exportEnabled: setupFeeDue !== 0,
      useConfigHsn: defaultUseConfigHsn,
    });
  }

  const customRows = getCustomInvoiceRows(client).map((row, index) => ({
    id: `custom-${index}`,
    kind: "custom" as const,
    narration: row.narration || row.name,
    amount: Number(row.amount || 0),
    hsn: String(row.hsn || ""),
    rate: String(row.rate || defaultRate),
    cgst: Number(row.cgst || 0),
    sgst: Number(row.sgst || 0),
    igst: Number(row.igst || 0),
    align: row.align || "left",
    editable: true,
    narrationMode: row.narrationMode || "multiline",
    exportEnabled: row.exportEnabled ?? Number(row.amount || 0) !== 0,
    useConfigHsn: typeof row.useConfigHsn === "boolean" ? row.useConfigHsn : defaultUseConfigHsn,
  }));


  return [...baseRows, ...customRows].map((row) => applyOverviewRowTaxes(row, defaultTaxType, taxConfig));
}

function overviewRowsToCustomRows(rows: OverviewInvoiceRow[]): CustomInvoiceRow[] {
  return rows
    .filter((row) => row.kind === "custom")
    .map((row) => ({
      name: row.narration,
      narration: row.narration,
      amount: row.amount,
      hsn: row.hsn,
      rate: row.rate,
      cgst: row.cgst,
      useConfigHsn: row.useConfigHsn,
      sgst: row.sgst,
      igst: row.igst,
      align: row.align,
      narrationMode: row.narrationMode,
      exportEnabled: row.exportEnabled,
    }))
    .filter((row) => String(row.name || "").trim().length > 0 || String(row.narration || "").trim().length > 0);
}

function SortableOverviewRow({
  row,
  index,
  children,
}: {
  row: OverviewInvoiceRow;
  index: number;
  children: (args: { attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: row.id });
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 bg-background shadow-lg")}
    >
      {children({ attributes, listeners, isDragging })}
    </TableRow>
  );
}

function getActiveMmcAmount(client: ClientRecord): number {
  const year = client.billingYear || 1;
  if (year >= 3) return Number(client.mmcYear3 || client.mmcYear2 || client.mmcYear1 || 0);
  if (year === 2) return Number(client.mmcYear2 || client.mmcYear1 || 0);
  return Number(client.mmcYear1 || 0);
}

function getMmcInvoiceTitle(client: ClientRecord): string {
  const year = client.billingYear || 1;
  return normalizeInlineText(client.mmcInvoiceTitle) || `MMC (Year ${year})`;
}

function getMmcMinimumGuaranteeLabel(client: ClientRecord): string {
  const firstSlab = Array.isArray(client.transactionSlabs) ? client.transactionSlabs[0] : undefined;
  const slabEnd = Number(firstSlab?.to || 0);
  if (slabEnd > 0) {
    return `Minimum Guarantee (${formatTxnCountCompact(slabEnd)} Txn)`;
  }
  return `Minimum Guarantee (Year ${client.billingYear || 1})`;
}

function getMmcFixedChargesTotal(client: ClientRecord) {
  const base = Number(client.fixedBilling || getActiveMmcAmount(client) || 0);
  return base + Number(client.additionalPlatformFee || 0) + Number(client.integrationFee || 0);
}

function getMmcFixedChargeDetailLines(client: ClientRecord) {
  const base = Number(client.fixedBilling || getActiveMmcAmount(client) || 0);
  return [
    base !== 0 ? `Fixed Commitment Amount: ${formatCurrency(base, client.currency || "INR")}` : null,
    Number(client.additionalPlatformFee || 0) !== 0 ? `Additional Platform Fee: ${formatCurrency(Number(client.additionalPlatformFee || 0), client.currency || "INR")}` : null,
    Number(client.integrationFee || 0) !== 0 ? `Integration Fee: ${formatCurrency(Number(client.integrationFee || 0), client.currency || "INR")}` : null,
  ].filter(Boolean) as string[];
}

function formatTxnCountCompact(value: number) {
  const count = Number(value || 0);
  if (!count) return "0";
  const inMillions = count / 1000000;
  return Number.isInteger(inMillions) ? `${inMillions} Mn` : `${inMillions.toFixed(1)} Mn`;
}

function getMmcTransactionChargeBreakdown(client: ClientRecord, txnCount: number) {
  const count = Number(txnCount || 0);
  const slabs = Array.isArray(client.transactionSlabs) ? client.transactionSlabs : [];

  if (slabs.length === 0) {
    const rate = Number(client.transactionFeeRate || 0);
    const amount = Math.round(count * rate);
    return {
      amount,
      detailLines: [
        `Transactions Processed: ${count.toLocaleString("en-IN")}`,
        `Chargeable Amount: ${formatCurrency(amount, client.currency || "INR")}`,
        "",
      ],
      slabLines: [] as string[],
    };
  }

  const slabLines: string[] = [];
  let amount = 0;

  slabs.forEach((slab, index) => {
    const from = Number(slab.from || 0);
    const isLastSlab = index === slabs.length - 1;
    const slabEnd = isLastSlab || slab.to == null || Number(slab.to) <= from ? Number.POSITIVE_INFINITY : Number(slab.to);
    const covered = Math.max(0, Math.min(count, slabEnd) - from);
    const unitMultiplier = slab.unit === "paisa" ? 0.01 : 1;
    const slabAmount = Math.round(covered * Number(slab.rate || 0) * unitMultiplier);
    amount += slabAmount;

    if (slabAmount <= 0) return;

    const startLabel = from === 0 ? "Minimum Guarantee" : `From ${formatTxnCountCompact(from)}`;
    const endLabel = Number.isFinite(slabEnd) ? `${formatTxnCountCompact(slabEnd)} Txn` : `Above ${formatTxnCountCompact(from)} Txn`;
    const rangeLabel = from === 0 ? `${startLabel} (${endLabel})` : `${startLabel} to ${endLabel}`;
    slabLines.push(`${rangeLabel}\n${covered.toLocaleString("en-IN")} × ${Number(slab.rate || 0).toFixed(2)} = ${formatCurrency(slabAmount, client.currency || "INR")}`);
  });

  return {
    amount,
    detailLines: [
      `Transactions Processed: ${count.toLocaleString("en-IN")}`,
      `Chargeable Amount: ${formatCurrency(amount, client.currency || "INR")}`,
      "",
      "Slab-wise Calculation:",
      ...slabLines,
    ],
    slabLines,
  };
}

function formatMmcTransactionDetails(client: ClientRecord, txnCount: number) {
  return getMmcTransactionChargeBreakdown(client, txnCount).detailLines.join("\n");
}

function calculateInvoiceCommercials(client: ClientRecord, txnCount: number) {
  if (getBillingModel(client) === "mmc") {
    const mmcFloor = getMmcFixedChargesTotal(client);
    const transactionBase = getMmcTransactionChargeBreakdown(client, txnCount).amount;
    const coreCommercial = Math.max(transactionBase, mmcFloor);
    return {
      variable: 0,
      awsMarkup: 0,
      transactionBase,
      setupFeeDue: 0,
      customRows: [],
      customRowsTotal: 0,
      mmcFloor,
      coreCommercial,
      subtotal: coreCommercial,
    };
  }

  const slabs = client.transactionSlabs || [];
  const variable = slabs.reduce((sum, slab, index) => {
    const slabStart = slab.from;
    // The last slab is always treated as open-ended (extends to infinity)
    // so transactions beyond the last finite "to" are still charged.
    const isLastSlab = index === slabs.length - 1;
    const slabEnd = isLastSlab || slab.to == null || slab.to <= slab.from
      ? Number.POSITIVE_INFINITY
      : slab.to;
    const covered = Math.max(0, Math.min(txnCount, slabEnd) - slabStart);
    const unitMultiplier = slab.unit === "paisa" ? 0.01 : 1;
    return sum + covered * slab.rate * unitMultiplier;
  }, 0);

  const awsMarkup = client.aws?.enabled
    ? Number(client.aws.vendorCost || 0) * (Number(client.aws.marginPercentage || 0) / 100)
    : 0;
  const transactionBase =
    Number(client.fixedBilling || 0) +
    variable +
    awsMarkup +
    Number(client.integrationFee || 0) +
    Number(client.additionalPlatformFee || 0);

  const setupFeeDue = Math.max(Number(client.setupFee || 0) - Number(client.setupFeePaid || 0), 0);
  const customRows = getCustomInvoiceRows(client);
  const customRowsTotal = customRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const mmcFloor = 0;
  const coreCommercial = transactionBase;
  const subtotal = Math.max(coreCommercial + setupFeeDue + customRowsTotal, Number(client.minimumGuarantee || 0));

  return {
    variable,
    awsMarkup,
    transactionBase,
    setupFeeDue,
    customRows,
    customRowsTotal,
    mmcFloor,
    coreCommercial,
    subtotal,
  };
}

function estimateInvoiceFromSlabs(client: ClientRecord, txnCount: number) {
  return calculateInvoiceCommercials(client, txnCount).subtotal;
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (!values.length) return null;
  const width = 120;
  const height = 38;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-10 w-full", className)}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
        className="text-white/90"
      />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  accent,
  sparkline,
}: {
  title: string;
  value: string;
  change: string;
  icon: any;
  accent: string;
  sparkline: number[];
}) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 220, damping: 22 }}>
      <Card className={cn("relative overflow-hidden border shadow-sm", accent)}>
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_top_right,_white,_transparent_48%)]" />
        <CardContent className="p-5 relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/70">{title}</p>
              <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
              <div className="mt-1 flex items-center gap-1 text-sm text-white/80">
                <ArrowUpRight className="h-4 w-4" />
                {change}
              </div>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
          {sparkline.length > 0 && (
            <div className="mt-4 text-white/90">
              <Sparkline values={sparkline} />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: keyof typeof PRIORITY_META }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full border", meta.className)}>
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {priority}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full border capitalize", STATUS_META[status] || "bg-slate-500/10 text-slate-700 border-slate-200")}>
      {status}
    </Badge>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const normalizedStatus = normalizeInvoiceStatus(status);
  return (
    <Badge variant="outline" className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", INVOICE_STATUS_META[normalizedStatus])}>
      {normalizedStatus}
    </Badge>
  );
}

function InvoiceRowActions({
  invoice,
  canManageApprovalActions,
  onEdit,
  onApprove,
  onReject,
  onSend,
  onPaid,
  onClose,
  onStatusChange,
  onDownloadPdf,
  onDownloadDocx,
  onPreview,
  onDelete,
}: {
  invoice: InvoiceRecord;
  canManageApprovalActions: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSend: () => void;
  onPaid: () => void;
  onClose: () => void;
  onStatusChange: (status: InvoiceStatus) => void;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const waiting = isInvoiceAwaitingApproval(invoice.status);
  const generated = invoice.status === "Generated";
  const sent = invoice.status === "Send";
  const paid = invoice.status === "Received";
  const canEdit = generated;
  const normalizedStatus = normalizeInvoiceStatus(invoice.status);
  const pdfReady = isApprovedInvoiceStatus(normalizedStatus);
  const pdfButtonTitle = pdfReady ? "Export PDF" : "Approve invoice to unlock PDF export";
  const previewButtonTitle = pdfReady ? "Preview PDF" : "Approve invoice to unlock PDF preview";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
        <div className="w-[148px] shrink-0 rounded-2xl border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Status</p>
          <select
            value={invoice.status}
            onChange={(e) => onStatusChange(e.target.value as InvoiceStatus)}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-background px-2 text-[12px] outline-none ring-0 transition focus:border-primary"
          >
            {[
              "Waiting for approval",
              "Generated",
              "Send",
              "Received",
              "Rejected",
              "Overdue",
              "Closed",
            ].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {canEdit && (
          <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg" onClick={onEdit} title="Edit invoice">
            <Edit3 className="h-4 w-4" />
          </Button>
        )}
        {canManageApprovalActions && waiting && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 rounded-lg gap-1 border-emerald-200 bg-emerald-50 px-2 text-[12px] text-emerald-700 hover:bg-emerald-100"
              onClick={onApprove}
              title="Approve invoice"
            >
              <BadgeCheck className="h-4 w-4" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 rounded-lg gap-1 border-rose-200 bg-rose-50 px-2 text-[12px] text-rose-700 hover:bg-rose-100"
              onClick={onReject}
              title="Reject invoice"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
          </>
        )}
        {generated && (
          <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg" onClick={onSend} title="Send invoice">
            <FileText className="h-4 w-4" />
          </Button>
        )}
        {(generated || sent) && (
          <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg" onClick={onPaid} title="Mark as paid">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {paid && (
          <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg" onClick={onClose} title="Close invoice">
            <ShieldCheck className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-lg"
          onClick={() => onPreview(invoice)}
          disabled={!pdfReady}
          title={previewButtonTitle}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-lg"
          onClick={onDownloadPdf}
          disabled={!pdfReady}
          title={pdfButtonTitle}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 shrink-0 rounded-lg gap-1 px-2 text-[12px]" onClick={onDownloadDocx} title="Export DOCX">
          <FileDown className="h-4 w-4" /> DOCX
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg border-rose-200 text-rose-600" onClick={() => void onDelete()} title="Delete invoice">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function InvoiceHistoryTable({
  title,
  subtitle,
  invoices,
  showClient = false,
  currencyCode = "INR",
  emptyMessage = "No invoices yet. Generate your first invoice to get started.",
  canManageApprovalActions,
  onEdit,
  onApprove,
  onReject,
  onSend,
  onPaid,
  onClose,
  onStatusChange,
  onDownloadPdf,
  onDownloadDocx,
  onPreview,
  onDelete,
}: {
  title: string;
  subtitle: string;
  invoices: Array<InvoiceRecord & { client?: string }>;
  showClient?: boolean;
  currencyCode?: CurrencyType;
  emptyMessage?: string;
  canManageApprovalActions: boolean;
  onEdit: (invoice: InvoiceRecord & { client?: string }) => void;
  onApprove: (invoice: InvoiceRecord & { client?: string }) => void;
  onReject: (invoice: InvoiceRecord & { client?: string }) => void;
  onSend: (invoice: InvoiceRecord & { client?: string }) => void;
  onPaid: (invoice: InvoiceRecord & { client?: string }) => void;
  onClose: (invoice: InvoiceRecord & { client?: string }) => void;
  onStatusChange: (invoice: InvoiceRecord & { client?: string }, status: InvoiceStatus) => void;
  onDownloadPdf: (invoice: InvoiceRecord & { client?: string }) => void;
  onDownloadDocx: (invoice: InvoiceRecord & { client?: string }) => void;
  onPreview: (invoice: InvoiceRecord & { client?: string }) => void;
  onDelete: (invoice: InvoiceRecord & { client?: string }) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [sortField, setSortField] = useState<"generatedDate" | "invoiceNumber" | "amount" | "status" | "month" | "client">("generatedDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const normalizedInvoices = useMemo(
    () => invoices.map((invoice) => ({ ...invoice, status: normalizeInvoiceStatus(invoice.status) })),
    [invoices],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortField, sortDirection, pageSize, invoices]);

  const filteredInvoices = useMemo(() => {
    const query = normalizeInlineText(searchTerm).toLowerCase();
    const statusRank: Record<InvoiceStatus, number> = {
      "Waiting for approval": 0,
      Generated: 1,
      Send: 2,
      Received: 3,
      Rejected: 4,
      Overdue: 5,
      Closed: 6,
    };

    const filtered = normalizedInvoices.filter((invoice) => {
      const status = normalizeInvoiceStatus(invoice.status);
      const haystack = [
        getInvoiceDisplayNumber(invoice),
        invoice.month,
        invoice.client || "",
        String(invoice.amount || ""),
        status,
        invoice.generatedDate,
        invoice.createdAt,
        formatInvoiceGeneratedDateTime(invoice.createdAt || invoice.generatedDate),
      ]
        .join(" ")
        .toLowerCase();
      return (query.length === 0 || haystack.includes(query)) && (statusFilter === "all" || status === statusFilter);
    });

    return filtered.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      const aStatus = normalizeInvoiceStatus(a.status);
      const bStatus = normalizeInvoiceStatus(b.status);
      switch (sortField) {
        case "amount":
          return (Number(a.amount || 0) - Number(b.amount || 0)) * direction;
        case "invoiceNumber":
          return getInvoiceDisplayNumber(a).localeCompare(getInvoiceDisplayNumber(b)) * direction;
        case "month":
          return String(a.month || "").localeCompare(String(b.month || "")) * direction;
        case "status":
          return (statusRank[aStatus] - statusRank[bStatus]) * direction;
        case "client":
          return String(a.client || "").localeCompare(String(b.client || "")) * direction;
        case "generatedDate":
        default:
          return (parseInvoiceDateValue(a.createdAt || a.generatedDate) - parseInvoiceDateValue(b.createdAt || b.generatedDate)) * direction;
      }
    });
  }, [normalizedInvoices, searchTerm, statusFilter, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvoices = filteredInvoices.slice((safePage - 1) * pageSize, safePage * pageSize);
  const fromIndex = filteredInvoices.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toIndex = Math.min(safePage * pageSize, filteredInvoices.length);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <Card className="border-muted/60 shadow-sm">
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search invoices" className="pl-9 text-[12px]" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InvoiceStatus | "all") }>
              <SelectTrigger className="text-[12px]"><SelectValue placeholder="Filter status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["Waiting for approval", "Generated", "Send", "Received", "Rejected", "Overdue", "Closed"].map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortField} onValueChange={(value) => setSortField(value as any)}>
              <SelectTrigger className="text-[12px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                {[
                  ["generatedDate", "Generated Date"],
                  ["invoiceNumber", "Invoice No"],
                  ["amount", "Amount"],
                  ["status", "Status"],
                  ["month", "Month"],
                  ...(showClient ? ([["client", "Client"]] as const) : []),
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="justify-between text-[12px]" onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}>
              {sortDirection === "asc" ? "Ascending" : "Descending"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) || 10)}>
              <SelectTrigger className="w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Month</TableHead>
                {showClient && <TableHead>Client</TableHead>}
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Generated Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedInvoices.length > 0 ? (
                paginatedInvoices.map((invoice) => {
                  const normalizedInvoice = { ...invoice, status: normalizeInvoiceStatus(invoice.status) };
                  return (
                    <TableRow key={invoice.invoiceId}>
                      <TableCell className="font-medium text-[12px]">{getInvoiceDisplayNumber(normalizedInvoice)}</TableCell>
                      <TableCell className="text-[12px]">{normalizedInvoice.month}</TableCell>
                      {showClient && <TableCell className="text-[12px]">{normalizedInvoice.client || "—"}</TableCell>}
                      <TableCell className="text-[12px]">{currencyLabel(normalizedInvoice.amount, currencyCode)}</TableCell>
                      <TableCell><InvoiceStatusBadge status={normalizedInvoice.status} /></TableCell>
                      <TableCell className="text-[12px]">{formatInvoiceGeneratedDateTime(normalizedInvoice.createdAt || normalizedInvoice.generatedDate)}</TableCell>
                      <TableCell className="align-top">
                        <InvoiceRowActions
                          invoice={normalizedInvoice}
                          canManageApprovalActions={canManageApprovalActions}
                          onEdit={() => onEdit(normalizedInvoice)}
                          onApprove={() => onApprove(normalizedInvoice)}
                          onReject={() => onReject(normalizedInvoice)}
                          onSend={() => onSend(normalizedInvoice)}
                          onPaid={() => onPaid(normalizedInvoice)}
                          onClose={() => onClose(normalizedInvoice)}
                          onStatusChange={(status) => onStatusChange(normalizedInvoice, status)}
                          onDownloadPdf={() => onDownloadPdf(normalizedInvoice)}
                          onDownloadDocx={() => onDownloadDocx(normalizedInvoice)}
                          onPreview={() => onPreview(normalizedInvoice)}
                          onDelete={() => onDelete(normalizedInvoice)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={showClient ? 7 : 6} className="text-center py-6 text-[12px] text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <div className="flex flex-col gap-3 border-t px-4 py-3 text-[12px] text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>Showing {fromIndex}-{toIndex} of {filteredInvoices.length}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-3 text-[12px]" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
            Previous
          </Button>
          <span className="min-w-[92px] text-center">Page {safePage} of {totalPages}</span>
          <Button variant="outline" size="sm" className="h-8 px-3 text-[12px]" disabled={safePage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ServiceChip({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full border px-3 py-1 text-xs font-medium", SERVICE_COLOR[label] || "bg-slate-500/10 text-slate-700 border-slate-200")}
    >
      {label}
    </Badge>
  );
}

function ClientRevenuePie({ data }: { data: { name: string; value: number }[] }) {
  const colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = data.length > 6
    ? [...data.slice(0, 5), { name: "Others", value: data.slice(5).reduce((sum, item) => sum + item.value, 0) }]
    : data;
  const topEntry = chartData[0];
  const topShare = total > 0 && topEntry ? Math.round((topEntry.value / total) * 100) : 0;
  const RADIAN = Math.PI / 180;
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.04) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
        {`${Math.round(percent * 100)}%`}
      </text>
    );
  };

  return (
    <div className="flex gap-0 divide-x divide-border rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Left: KPI stats */}
      <div className="flex w-[200px] shrink-0 flex-col justify-between gap-6 bg-gradient-to-b from-indigo-600 to-violet-700 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200">Total Revenue</p>
          <p className="mt-2 text-[1.6rem] font-bold leading-tight text-white">{currencyLabel(total * 1000)}</p>
          <p className="mt-1.5 text-xs text-indigo-200">{chartData.length} active clients</p>
        </div>
        <div className="space-y-3">
          {topEntry && (
            <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">Top client</p>
              <p className="mt-1 text-sm font-semibold text-white line-clamp-2">{topEntry.name}</p>
              <p className="text-xs text-indigo-200">{currencyLabel(topEntry.value * 1000)}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white/90" style={{ width: `${topShare}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-indigo-200">{topShare}% of total</p>
            </div>
          )}
          {chartData[1] && (() => {
            const p2 = total > 0 ? Math.round((chartData[1].value / total) * 100) : 0;
            return (
              <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">#2 client</p>
                <p className="mt-1 text-sm font-semibold text-white line-clamp-2">{chartData[1].name}</p>
                <p className="text-xs text-indigo-200">{currencyLabel(chartData[1].value * 1000)}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white/60" style={{ width: `${p2}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-indigo-200">{p2}% of total</p>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Center: Donut chart */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-muted/10 py-4">
        <div className="w-full" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={75}
                outerRadius={130}
                paddingAngle={2}
                stroke="#ffffff"
                strokeWidth={3}
                labelLine={false}
                label={renderCustomLabel}
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [currencyLabel(Number(value) * 1000), name]}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.25)",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.1)",
                  fontSize: 13,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{currencyLabel(total * 1000)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">all clients</p>
          </div>
        </div>
      </div>

      {/* Right: Client ranking */}
      <div className="flex w-[280px] shrink-0 flex-col bg-background">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Client ranking</p>
          <Badge variant="outline" className="rounded-full text-[11px] font-medium">{chartData.length} clients</Badge>
        </div>
        <div className="flex-1 divide-y overflow-y-auto">
          {chartData.map((entry, index) => {
            const percent = total > 0 ? Math.round((entry.value / total) * 100) : 0;
            return (
              <div key={entry.name} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <p className="truncate text-[13px] font-medium text-foreground">{entry.name}</p>
                  </div>
                  <span className="shrink-0 text-[13px] font-bold" style={{ color: colors[index % colors.length] }}>{percent}%</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 overflow-hidden h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${percent}%`, backgroundColor: colors[index % colors.length] }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{currencyLabel(entry.value * 1000)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RevenueTrendChart({ data }: { data: { month: string; received: number; pending: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="receivedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
        <Tooltip formatter={(value: any) => currencyLabel(Number(value))} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(148,163,184,0.2)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
        <Line type="monotone" dataKey="received" name="Received" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="pending" name="Pending" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TransactionVolumeChart({ data }: { data: { month: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="txnVolume" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.7} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value: any) => [`${value} invoices`, 'Count']} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(148,163,184,0.2)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
        <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#txnVolume)" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ServiceCategoryChart({ data, clients }: { data: { category: string; value: number }[]; clients: ClientRecord[] }) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const serviceClientMap = useMemo(() => {
    const map = new Map<string, ClientRecord[]>();
    clients.forEach((client) => {
      client.services.forEach((service) => {
        const list = map.get(service) || [];
        list.push(client);
        map.set(service, list);
      });
    });
    return map;
  }, [clients]);

  const hoveredClients = hoveredService ? (serviceClientMap.get(hoveredService) || []) : [];

  const updateTooltipPosition = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setTooltipPos({
      x: Math.min(x + 18, rect.width - 380),
      y: Math.min(y + 18, rect.height - 260),
    });
  };

  return data.length === 0 ? (
    <p className="py-8 text-center text-sm text-muted-foreground">No service data</p>
  ) : (
    <div ref={wrapperRef} className="relative">
      <div className="space-y-3">
        {data.map((item) => {
          const percent = max > 0 ? Math.round((item.value / max) * 100) : 0;
          return (
            <div
              key={item.category}
              className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/40"
              onMouseEnter={(e) => {
                setHoveredService(item.category);
                updateTooltipPosition(e);
              }}
              onMouseLeave={(e) => {
                const nextTarget = e.relatedTarget as Node | null;
                if (tooltipRef.current && nextTarget && tooltipRef.current.contains(nextTarget)) return;
                setHoveredService((current) => (current === item.category ? null : current));
              }}
            >
              <p className="w-[140px] shrink-0 truncate text-xs font-medium text-foreground">{item.category}</p>
              <div className="flex flex-1 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300 group-hover:bg-blue-600"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <Badge variant="secondary" className="shrink-0 rounded-full px-2 text-xs font-semibold">{item.value}</Badge>
              </div>
              <span className="w-[42px] shrink-0 text-right text-[11px] font-semibold text-muted-foreground">{percent}%</span>
            </div>
          );
        })}
      </div>

      {hoveredService && (
        <div
          ref={tooltipRef}
          className="pointer-events-auto absolute z-10 w-[360px] rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur-sm"
          style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
          onMouseEnter={() => hoveredService && setHoveredService(hoveredService)}
          onMouseLeave={() => setHoveredService(null)}
        >
          <div className="mb-3 flex items-start justify-between gap-3 border-b pb-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{hoveredService}</p>
              <p className="text-xs text-muted-foreground">{hoveredClients.length} clients using this service</p>
            </div>
            <Badge variant="outline" className="rounded-full text-[11px]">Service details</Badge>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
            {hoveredClients.slice(0, 6).map((client) => {
              const priority = getPriorityForScoring(client);
              return (
                <div key={client.id} className="rounded-xl border bg-muted/20 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
                      <p className="text-[11px] text-muted-foreground">{client.code || "No client code"} · {client.billingCycle || "—"}</p>
                    </div>
                    <PriorityBadge priority={priority} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-background px-2 py-1">
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-semibold tabular-nums">{currencyLabel(client.monthlyInvoiceEstimate)}</p>
                    </div>
                    <div className="rounded-lg bg-background px-2 py-1">
                      <p className="text-muted-foreground">Tx Volume</p>
                      <p className="font-semibold tabular-nums">{client.monthlyTransactionVolume.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {hoveredClients.length > 6 && (
              <div className="rounded-xl border border-dashed px-3 py-2 text-center text-[11px] text-muted-foreground">
                +{hoveredClients.length - 6} more clients
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PriorityHeatmap({ clients }: { clients: ClientRecord[] }) {
  const SCORE_LABELS = ["Revenue", "Tx Volume", "Services", "AWS"];
  const SCORE_MAX = [4, 4, 4, 2];
  const TOTAL_MAX = SCORE_MAX.reduce((a, b) => a + b, 0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0, pointerId: -1 });
  const [isDragging, setIsDragging] = useState(false);

  const scored = clients
    .filter((c) => normalizeInlineText(c.status).toLowerCase() !== "inactive")
    .map((client) => {
      const revenueScore = client.monthlyInvoiceEstimate >= 1000000 ? 4 : client.monthlyInvoiceEstimate >= 500000 ? 3 : client.monthlyInvoiceEstimate >= 250000 ? 2 : 1;
      const volumeScore = client.monthlyTransactionVolume >= 20000000 ? 4 : client.monthlyTransactionVolume >= 10000000 ? 3 : client.monthlyTransactionVolume >= 4000000 ? 2 : 1;
      const serviceScore = client.services.length >= 6 ? 4 : client.services.length >= 4 ? 3 : client.services.length >= 2 ? 2 : 1;
      const awsScore = client.aws.enabled ? 2 : 0;
      const scores = [revenueScore, volumeScore, serviceScore, awsScore];
      const total = scores.reduce((a, b) => a + b, 0);
      const priority = getPriorityForScoring(client);
      return { client, scores, total, priority };
    })
    .sort((a, b) => b.total - a.total);

  const getScoreColor = (score: number, max: number) => {
    const ratio = score / max;
    if (ratio >= 0.9) return { text: "#dc2626", bar: "#ef4444" };
    if (ratio >= 0.65) return { text: "#ea580c", bar: "#f97316" };
    if (ratio >= 0.4) return { text: "#2563eb", bar: "#3b82f6" };
    return { text: "#059669", bar: "#10b981" };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !scrollRef.current) return;
    dragStateRef.current = {
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: scrollRef.current.scrollLeft,
      pointerId: event.pointerId,
    };
    setIsDragging(true);
    scrollRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.isDragging || !scrollRef.current) return;
    event.preventDefault();
    const delta = event.clientX - dragStateRef.current.startX;
    scrollRef.current.scrollLeft = dragStateRef.current.startScrollLeft - delta;
  };

  const endDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (scrollRef.current && dragStateRef.current.pointerId !== -1) {
      try {
        scrollRef.current.releasePointerCapture(dragStateRef.current.pointerId);
      } catch {}
    }
    dragStateRef.current.isDragging = false;
    dragStateRef.current.pointerId = -1;
    setIsDragging(false);
  };

  const CARD_ICONS = ["💼", "🏦", "🔄", "⚡", "🌐"];
  const loopedScored = scored.length > 1 ? [...scored, ...scored] : scored;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || scored.length < 2) return;

    let rafId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const el = scrollRef.current;
      if (!el) return;

      const delta = now - lastTime;
      lastTime = now;

      if (!dragStateRef.current.isDragging) {
        el.scrollLeft += delta * 0.04;
        const loopWidth = el.scrollWidth / 2;
        if (loopWidth > 0 && el.scrollLeft >= loopWidth) {
          el.scrollLeft -= loopWidth;
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [scored.length]);

  if (scored.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No client data available</p>;
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "-mx-1 overflow-x-auto overscroll-x-contain pb-3 select-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ WebkitOverflowScrolling: "touch", scrollBehavior: "auto" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          scrollRef.current?.scrollBy({ left: e.deltaY, behavior: "smooth" });
          e.preventDefault();
        }
      }}
    >
      <div className="flex gap-3 px-1" style={{ width: "max-content" }}>
        {loopedScored.map(({ client, scores, total, priority }, idx) => {
          const meta = PRIORITY_META[priority];
          const totalPct = Math.round((total / TOTAL_MAX) * 100);
          const priorityBarColor = priority === "Critical" ? "#ef4444" : priority === "High" ? "#f97316" : priority === "Medium" ? "#3b82f6" : "#10b981";
          const originalIndex = idx % scored.length;

          return (
            <div key={`${client.id}-${idx}`} className="flex w-[300px] shrink-0 flex-col rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-start justify-between gap-2 p-4 pb-3 border-b bg-muted/20">
                <div className="min-w-0 flex items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background border text-base shadow-sm">
                    {CARD_ICONS[idx % CARD_ICONS.length]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">#{originalIndex + 1}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{client.name}</p>
                    {client.code && <p className="mt-0.5 text-[11px] text-muted-foreground">{client.code}</p>}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap", meta.className)}>{priority}</span>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly Rev.</p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">{currencyLabel(client.monthlyInvoiceEstimate)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Billing</p>
                    <p className="mt-0.5 text-xs font-bold text-foreground">{client.billingCycle || "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tx Volume</p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">{client.monthlyTransactionVolume.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Priority</p>
                    <p className="mt-0.5 text-xs font-bold text-foreground">{total} / {TOTAL_MAX}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Services ({client.services.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {client.services.map((s) => (
                      <span key={s} className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">{s}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {scores.map((score, i) => {
                    const color = getScoreColor(score, SCORE_MAX[i]);
                    return (
                      <div key={SCORE_LABELS[i]} className="flex items-center gap-2">
                        <span className="w-[64px] shrink-0 text-[10px] text-muted-foreground">{SCORE_LABELS[i]}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(score / SCORE_MAX[i]) * 100}%`, backgroundColor: color.bar }} />
                        </div>
                        <span className="w-[24px] text-right text-[10px] font-semibold tabular-nums" style={{ color: color.text }}>{score}</span>
                      </div>
                    );
                  })}
                </div>

                {client.aws.enabled && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-1.5">
                    <span className="text-xs">☁️</span>
                    <span className="text-[11px] font-medium text-amber-700">AWS Infra Enabled</span>
                    <span className="ml-auto text-[10px] text-amber-600">{currencyLabel(client.aws.vendorCost)}/mo</span>
                  </div>
                )}
              </div>

              <div className="mt-auto border-t px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Priority score</span>
                  <span className="text-xs font-bold text-foreground">
                    {total} / {TOTAL_MAX} <span className="font-normal text-muted-foreground">({totalPct}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all" style={{ width: `${totalPct}%`, backgroundColor: priorityBarColor }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClientConfigCard({
  client,
  canManageConfigActions,
  onEdit,
  onDelete,
  onActivate,
  onOverview,
}: {
  client: ClientRecord;
  canManageConfigActions: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onOverview: () => void;
}) {
  const priority = getPriorityForScoring(client);
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 220, damping: 24 }}>
      <Card className="group overflow-hidden border shadow-sm transition-all hover:shadow-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md", client.logoClass)}>
                {client.logo}
              </div>
              <div>
                <CardTitle className="text-lg">{client.name}</CardTitle>
                <CardDescription>{client.code} · {client.billingCycle}</CardDescription>
              </div>
            </div>
            {canManageConfigActions && (
              <div className="flex flex-wrap items-center gap-2 opacity-100 transition-opacity md:opacity-70 md:group-hover:opacity-100">
                <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
                  <Edit3 className="h-4 w-4" />
                  Edit
                </Button>
                {normalizeInlineText(client.status).toLowerCase() === "inactive" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={onActivate} className="gap-2">
                      <BadgeCheck className="h-4 w-4" />
                      Active
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDelete} className="gap-2 text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={onDelete} className="gap-2 text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                    Deactivate
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={client.status} />
            <PriorityBadge priority={priority} />
            {client.services.slice(0, 3).map((service) => (
              <ServiceChip key={service} label={service} />
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-muted-foreground">Fixed billing</p>
              <p className="mt-1 font-semibold">{currencyLabel(client.fixedBilling, client.currency || "INR")}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-muted-foreground">Invoice estimate</p>
              <p className="mt-1 font-semibold">{currencyLabel(client.monthlyInvoiceEstimate, client.currency || "INR")}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-muted-foreground">Txn volume</p>
              <p className="mt-1 font-semibold">{client.monthlyTransactionVolume.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-muted-foreground">Last invoice</p>
              <p className="mt-1 font-semibold">{client.lastInvoiceGenerated}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Variable billing</span>
              <span className="font-medium">{currencyLabel(client.variableRevenueGenerated, client.currency || "INR")}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${Math.min(100, 20 + client.services.length * 12)}%` }} />
            </div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
            <p className="font-medium text-foreground">Service description preview</p>
            <p className="mt-1 line-clamp-3">{client.notes || "No description added yet."}</p>
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" className="gap-2" onClick={onOverview}>
              View Overview <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <BadgeCheck className="h-4 w-4" />
              {client.services.length} services enabled
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ClientOverviewScreen({
  client,
  onBack,
  onExportPdf,
  onExportCsv,
  onExportDocx,
  onGenerateInvoice,
  onGenerateSetupFeeInvoice,
  onStatusChange,
  onDownloadPdf,
  onDownloadDocx,
  onPreview,
  onDeleteInvoice,
  onEditInvoice,
  onApproveInvoice,
  onRejectInvoice,
  onSendInvoice,
  onPaidInvoice,
  onCloseInvoice,
  canManageApprovalActions,
  onSaveCustomRows,
  onSaveOverviewConfig,
  taxConfig,
}: {
  client: ClientRecord;
  onBack: () => void;
  onExportPdf: (amountOverride?: number, txnCountOverride?: number, rowsOverride?: OverviewInvoiceRow[]) => void;
  onExportCsv: () => void;
  onExportDocx: () => void;
  onGenerateInvoice: (amountOverride?: number, txnCountOverride?: number, mmcInvoiceTitle?: string) => void;
  onGenerateSetupFeeInvoice: () => void;
  onStatusChange: (invoiceNumber: string, status: InvoiceStatus) => void;
  onDownloadPdf: (invoice: InvoiceRecord) => void;
  onDownloadDocx: (invoice: InvoiceRecord) => void;
  onPreview: (invoice: InvoiceRecord) => void;
  onDeleteInvoice: (invoiceId: string) => void | Promise<void>;
  onEditInvoice: (invoice: InvoiceRecord & { client?: string }) => void;
  onApproveInvoice: (invoice: InvoiceRecord & { client?: string }) => void;
  onRejectInvoice: (invoice: InvoiceRecord & { client?: string }) => void;
  onSendInvoice: (invoice: InvoiceRecord & { client?: string }) => void;
  onPaidInvoice: (invoice: InvoiceRecord & { client?: string }) => void;
  onCloseInvoice: (invoice: InvoiceRecord & { client?: string }) => void;
  canManageApprovalActions: boolean;
  onSaveCustomRows: (rows: CustomInvoiceRow[]) => void;
  onSaveOverviewConfig: (payload: any) => void;
  taxConfig: TaxConfig;
}) {
  const defaultTaxType = getTaxTypeFromGstin(client.gstin) || (taxConfig.defaultTaxType === "IGST" ? "International" : "Domestic");
  const defaultRate = `${Number(taxConfig.invoiceRatePercentage || 18)}%`;
  const defaultUseConfigHsn = Boolean(taxConfig.invoiceHsnCode);
  const configHsn = normalizeInlineText(taxConfig.invoiceHsnCode);
  const normalizeVolume = (value?: number | string) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    if (parsed === 1000000) return 0;
    return parsed;
  };
  const [txnInput, setTxnInput] = useState(() => normalizeVolume(client.monthlyTransactionVolume));
  const [transactionBased, setTransactionBased] = useState(getBillingModel(client) === "transaction");
  const [taxType, setTaxType] = useState<RowTaxType>(defaultTaxType);
  const hasTransactionSlabConfig = Array.isArray(client.transactionSlabs) && client.transactionSlabs.length > 0;
  const sliderMax = Math.max((Number(client.monthlyTransactionVolume || 0) * 2) || 0, 1000000);
  const updateTxnInput = (value: number) => {
    if (!hasTransactionSlabConfig) return;
    setTxnInput(value);
  };
  const resolvedTaxType = getClientTaxType(client, taxType);
  const [awsVendorCostDraft, setAwsVendorCostDraft] = useState(() => Number(client.aws?.vendorCost || 0));
  const [awsMarginDraft, setAwsMarginDraft] = useState(() => Number(client.aws?.marginPercentage || 0));
  const [overviewRows, setOverviewRows] = useState<OverviewInvoiceRow[]>(() =>
    buildOverviewInvoiceRows(client, normalizeVolume(client.monthlyTransactionVolume), getBillingModel(client) === "transaction", taxConfig),
  );
  const overviewSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const overviewRowIds = useMemo(() => overviewRows.map((row) => row.id), [overviewRows]);
  const [customRowsDraft, setCustomRowsDraft] = useState<CustomInvoiceRow[]>(
    client.customInvoiceRows && client.customInvoiceRows.length > 0
      ? [...client.customInvoiceRows]
      : [{ name: "", narration: "", amount: 0, hsn: "", rate: defaultRate, cgst: 0, sgst: 0, igst: 0, taxType: defaultTaxType, useConfigHsn: false }],
  );
  const [editMmcTexts, setEditMmcTexts] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [mmcSectionTitle, setMmcSectionTitle] = useState("MMC (Monthly Minimum Commitment) Configuration");
  const [mmcSectionDescription, setMmcSectionDescription] = useState("Bill whichever is higher: MMC floor or Transaction-based amount.");
  const [mmcSetupFeeLabel, setMmcSetupFeeLabel] = useState("Onetime Setup Fee");
  const [mmcTransactionFeeLabel, setMmcTransactionFeeLabel] = useState("Transaction Fee");
  const [mmcFloorLabel, setMmcFloorLabel] = useState("MMC (Monthly Minimum Commitment)");
  const [mmcFloorNote, setMmcFloorNote] = useState("Note: MMC or Transaction fee whichever is higher");
  const [mmcVapLabel, setMmcVapLabel] = useState("VAP/MIP Connectivity Fee");
  const [mmcChangeLabel, setMmcChangeLabel] = useState("Change Management Fee");
  const [mmcNetworkLabel, setMmcNetworkLabel] = useState("Network / Certification / Tools (one time & recurring)");
  const [mmcInfraLabel, setMmcInfraLabel] = useState("Infra Cost & Compliance Certification (if dedicated setup required)");
  const [mmcCalcTitle, setMmcCalcTitle] = useState("Calculation for current period");
  const [mmcBilledLabel, setMmcBilledLabel] = useState("Billed amount (whichever is higher)");
  const [mmcWinnerLabel, setMmcWinnerLabel] = useState("wins");
  const [mmcNetworkNote, setMmcNetworkNote] = useState(client.networkCertificationNote || "To be borne by client/bank as per actuals");
  const [mmcInfraNote, setMmcInfraNote] = useState(client.infraCostNote || "To be borne by client/bank as per actuals");
  const [mmcInvoiceTitle, setMmcInvoiceTitle] = useState(() => getMmcInvoiceTitle(client));
  useEffect(() => {
    setAwsVendorCostDraft(Number(client.aws?.vendorCost || 0));
    setAwsMarginDraft(Number(client.aws?.marginPercentage || 0));
  }, [client.id, client.aws?.vendorCost, client.aws?.marginPercentage]);
  const overviewRootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    overviewRootRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      overviewRootRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [client.clientId, client.clientId]);

  useEffect(() => {
    const normalizedVolume = normalizeVolume(client.monthlyTransactionVolume);
    setTxnInput(normalizedVolume);
    setTransactionBased(getBillingModel(client) === "transaction");
    setTaxType(defaultTaxType);
    setOverviewRows(buildOverviewInvoiceRows(client, normalizedVolume, getBillingModel(client) === "transaction", taxConfig));
  }, [client.id, defaultTaxType, taxConfig, client.monthlyTransactionVolume, client.customInvoiceRows, client.invoiceTableConfig, client.billingModel, client.fixedBilling, client.additionalPlatformFee, client.integrationFee, client.setupFee, client.setupFeePaid, client.aws, client.transactionSlabs, client.gstin]);

  useEffect(() => {
    setCustomRowsDraft(
      client.customInvoiceRows && client.customInvoiceRows.length > 0
        ? [...client.customInvoiceRows]
        : [{ name: "", narration: "", amount: 0, hsn: "", rate: defaultRate, cgst: 0, sgst: 0, igst: 0, taxType: defaultTaxType, useConfigHsn: false }],
    );
  }, [client.id, client.clientType, client.customInvoiceRows]);

  useEffect(() => {
    setMmcInvoiceTitle(getMmcInvoiceTitle(client));
  }, [client.id, client.billingYear, client.mmcInvoiceTitle]);

  useEffect(() => {
    if (getBillingModel(client) === "mmc") {
      setOverviewRows(buildOverviewInvoiceRows(client, txnInput, false, taxConfig));
      return;
    }

    setOverviewRows((prev) =>
      prev.map((row) => {
        if (row.id !== "variable-slab") return row;
        const breakdown = calculateInvoiceCommercials(client, txnInput);
        const variableCharge = Math.max(
          breakdown.transactionBase - Number(client.fixedBilling || 0) - breakdown.awsMarkup - Number(client.additionalPlatformFee || 0) - Number(client.integrationFee || 0),
          0,
        );
        return applyOverviewRowTaxes({ ...row, amount: transactionBased ? variableCharge : 0 }, resolvedTaxType, taxConfig);
      }),
    );
  }, [txnInput, transactionBased, resolvedTaxType, taxConfig, client]);

  useEffect(() => {
    setOverviewRows((prev) => prev.map((row) => applyOverviewRowTaxes(row, taxType, taxConfig)));
  }, [taxType, taxConfig]);

  useEffect(() => {
    // Ensure modal is closed when component mounts or navigates
    return () => {
      setShowSummaryModal(false);
    };
  }, [client.id]);

  const checkedRows = useMemo(() => overviewRows.filter((row) => row.exportEnabled !== false), [overviewRows]);
  const summaryTotals = useMemo(() => {
    const rowTotals = checkedRows.map((row) => ({
      id: row.id,
      amount: Number(row.amount || 0),
      tax: Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0),
    }));
    const subtotal = rowTotals.reduce((sum, row) => sum + row.amount, 0);
    const tax = rowTotals.reduce((sum, row) => sum + row.tax, 0);
    const fixedCharges = rowTotals
      .filter((row) => ["fixed-billing", "additional-platform-fee", "integration-fee", "setup-fee", "mmc-floor", "aws-vendor-cost"].includes(row.id))
      .reduce((sum, row) => sum + row.amount, 0);
    const variableCharges = rowTotals
      .filter((row) => row.id === "variable-slab")
      .reduce((sum, row) => sum + row.amount, 0);
    const awsMargin = rowTotals
      .filter((row) => row.id === "aws-pass-through")
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      subtotal,
      tax,
      fixedCharges,
      variableCharges,
      awsMargin,
      finalPayable: subtotal + tax,
    };
  }, [checkedRows]);
  const setupFeeDue = Math.max(Number(client.setupFee || 0) - Number(client.setupFeePaid || 0), 0);
  const setupFeeInvoiceExists = (client.invoiceHistory || []).some((invoice) => invoice.invoiceType === "setup_fee");
  const invoiceDraft = summaryTotals.subtotal;
  const fixedCharges = summaryTotals.fixedCharges;
  const awsMargin = summaryTotals.awsMargin;
  const variableCharges = summaryTotals.variableCharges;
  const tax = summaryTotals.tax;
  const finalPayable = summaryTotals.finalPayable;

  const addCustomRow = () => {
    setCustomRowsDraft((prev) => [...prev, { name: "", narration: "", amount: 0, hsn: "", rate: defaultRate, cgst: 0, sgst: 0, igst: 0, taxType, useConfigHsn: false }]);
  };

  const updateCustomRow = (index: number, key: keyof CustomInvoiceRow, value: string | number) => {
    setCustomRowsDraft((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [key]: key === "amount" || key === "cgst" || key === "sgst" || key === "igst"
                ? Number(value) || 0
                : value,
            }
          : row,
      ),
    );
  };

  const removeCustomRow = (index: number) => {
    setCustomRowsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const saveCustomRows = () => {
    onSaveCustomRows(
      customRowsDraft.filter(
        (row) => String(row.name || "").trim().length > 0 || String(row.narration || "").trim().length > 0,
      ),
    );
  };

  const updateOverviewRow = (index: number, key: keyof OverviewInvoiceRow, value: string | number | boolean) => {
    setOverviewRows((prev) => {
      const nextTaxType = key === "taxType" ? (String(value) as RowTaxType) : resolvedTaxType;
      if (key === "taxType") setTaxType(nextTaxType);
      return prev.map((row, i) => {
        const nextRow =
          i === index
            ? {
                ...row,
                [key]: key === "amount" || key === "cgst" || key === "sgst" || key === "igst"
                  ? Number(value) || 0
                  : key === "exportEnabled"
                    ? Boolean(value)
                    : value,
              }
            : row;
        const normalizedRow = key === "hsn"
          ? {
              ...nextRow,
              useConfigHsn: normalizeInlineText(String(value)) === configHsn || Boolean(nextRow.useConfigHsn),
            }
          : nextRow;
        return applyOverviewRowTaxes(normalizedRow as OverviewInvoiceRow, nextTaxType, taxConfig);
      });
    });
  };

  const handleOverviewDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOverviewRows((prev) => {
      const oldIndex = prev.findIndex((row) => row.id === active.id);
      const newIndex = prev.findIndex((row) => row.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((row, index) =>
        applyOverviewRowTaxes({ ...row, exportEnabled: row.exportEnabled !== false }, resolvedTaxType, taxConfig),
      );
    });
  };

  const syncAwsRows = (cost: number, margin: number) => {
    const markup = cost * (margin / 100);
    setOverviewRows((prev) =>
      prev.map((row) => {
        if (row.id === "aws-vendor-cost") {
          return applyOverviewRowTaxes({ ...row, amount: cost, exportEnabled: cost !== 0 }, resolvedTaxType, taxConfig);
        }
        if (row.id === "aws-pass-through") {
          return applyOverviewRowTaxes({ ...row, amount: markup, exportEnabled: markup !== 0 }, resolvedTaxType, taxConfig);
        }
        return row;
      }),
    );
  };

  const handleAwsVendorCostDraftChange = (value: number) => {
    setAwsVendorCostDraft(value);
    syncAwsRows(value, awsMarginDraft);
  };

  const handleAwsMarginDraftChange = (value: number) => {
    setAwsMarginDraft(value);
    syncAwsRows(awsVendorCostDraft, value);
  };

  const addOverviewRow = () => {
    setOverviewRows((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        kind: "custom",
        narration: "",
        amount: 0,
        hsn: "",
        rate: defaultRate,
        useConfigHsn: defaultUseConfigHsn,
        cgst: 0,
        sgst: 0,
        igst: 0,
        align: "left",
        taxType,
        editable: true,
        narrationMode: "multiline",
        exportEnabled: true,
      },
    ]);
  };

  const removeOverviewRow = (index: number) => {
    setOverviewRows((prev) => prev.filter((_, i) => i !== index || prev[i].kind !== "custom"));
  };

  const saveOverviewConfig = () => {
    const normalizedRows = overviewRows.map((row) => applyOverviewRowTaxes(row, resolvedTaxType, taxConfig));
    const customRows = overviewRowsToCustomRows(normalizedRows);
    const fixedBilling = normalizedRows.find((row) => row.id === "fixed-billing")?.amount ?? client.fixedBilling;
    const additionalPlatformFee = normalizedRows.find((row) => row.id === "additional-platform-fee")?.amount ?? client.additionalPlatformFee;
    const integrationFee = normalizedRows.find((row) => row.id === "integration-fee")?.amount ?? client.integrationFee;
    const setupFeeRow = normalizedRows.find((row) => row.id === "setup-fee")?.amount;
    const setupFeePaid = Number(client.setupFeePaid || 0);
    const setupFee = setupFeeRow !== undefined ? Math.max(Number(setupFeeRow || 0) + setupFeePaid, setupFeePaid) : Number(client.setupFee || 0);
    const billingMode = transactionBased ? "transaction" : "mmc";
    const monthlyInvoiceEstimate = billingMode === "mmc"
      ? calculateInvoiceCommercials({ ...client, billingModel: "mmc" } as ClientRecord, txnInput).subtotal
      : normalizedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const awsVendorCostRow = normalizedRows.find((row) => row.id === "aws-vendor-cost");
    const awsVendorCostAmount = Number(awsVendorCostRow?.amount || 0);
    const awsEnabled = Boolean(client.aws?.enabled);
    const awsSettings = {
      ...client.aws,
      enabled: awsEnabled,
      vendorCost: awsEnabled ? awsVendorCostAmount : 0,
      marginPercentage: awsEnabled ? awsMarginDraft : 0,
    };

    const updatedClientSnapshot = {
      ...client,
      aws: awsSettings,
      billingModel: billingMode,
      clientType: resolvedTaxType,
      monthlyTransactionVolume: txnInput,
      fixedBilling,
      additionalPlatformFee,
      integrationFee,
      setupFee,
      customInvoiceRows: customRows,
      monthlyInvoiceEstimate,
      invoiceTableConfig: normalizedRows,
      networkCertificationNote: mmcNetworkNote,
      infraCostNote: mmcInfraNote,
      mmcInvoiceTitle,
    } as ClientRecord;

    onSaveOverviewConfig(updatedClientSnapshot);

    setOverviewRows(
      buildOverviewInvoiceRows(updatedClientSnapshot, txnInput, billingMode === "transaction", taxConfig),
    );
  };

  // Logging for debugging Commercial Summary Panel calculations
  console.log("[Invoice] Commercial Summary calculations:", {
    clientId: client.id,
    clientName: client.name,
    fixedBilling: client.fixedBilling,
    minimumGuarantee: client.minimumGuarantee,
    fixedCharges,
    awsMargin,
    invoiceDraft,
    variableCharges,
    tax,
    finalPayable,
  });
  const priority = getPriorityForScoring(client);


  return (
    <div ref={overviewRootRef} className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
              <StatusBadge status={client.status} />
              <PriorityBadge priority={priority} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Client commercial configuration, calculation engine and invoice overview
            </p>
            <div className="mt-4 rounded-2xl border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">Service description preview</p>
              <p className="mt-2">{client.notes || "No description added yet."}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => onExportPdf(invoiceDraft, txnInput, overviewRows)}>
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={onExportCsv}>
            <FileDown className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={onExportDocx}>
            <FileText className="h-4 w-4" /> Export DOCX
          </Button>
          {setupFeeDue > 0 && !setupFeeInvoiceExists && (
            <Button variant="outline" className="gap-2" onClick={onGenerateSetupFeeInvoice}>
              <ReceiptText className="h-4 w-4" /> Generate Setup Fee Invoice
            </Button>
          )}
          <Button
            className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500"
            onClick={() => onGenerateInvoice(invoiceDraft, txnInput, mmcInvoiceTitle)}
          >
            <ReceiptText className="h-4 w-4" /> Generate Invoice
          </Button>
        </div>
      </div>

      {getBillingModel(client) === "mmc" && (
        <Card className="border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-indigo-50/30 shadow-sm">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-blue-900">{mmcSectionTitle}</CardTitle>
                <CardDescription>{mmcSectionDescription}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 rounded-lg border-blue-200 bg-white/80 text-[12px] text-blue-700 hover:bg-blue-50"
                  onClick={() => setEditMmcTexts((current) => !current)}
                >
                  <Edit3 className="h-4 w-4" />
                  {editMmcTexts ? "Done" : "Edit title"}
                </Button>
                <Badge className="rounded-full bg-blue-600 hover:bg-blue-700">
                  Active Year {client.billingYear || 1}
                </Badge>
              </div>
            </div>
          </CardHeader>
          {editMmcTexts && (
            <CardContent className="pt-0">
              <div className="rounded-2xl border border-blue-200/70 bg-white/80 p-4">
                <div className="space-y-2">
                  <Label>Invoice title</Label>
                  <Input
                    value={mmcInvoiceTitle}
                    onChange={(e) => {
                      const nextTitle = e.target.value;
                      setMmcInvoiceTitle(nextTitle);
                      onSaveOverviewConfig({
                        ...client,
                        mmcInvoiceTitle: nextTitle,
                        clientCurrency: client.currency || "INR",
                        customInvoiceRows: client.customInvoiceRows || [],
                      });
                    }}
                    placeholder="MMC (Year 1)"
                  />
                  <p className="text-xs text-muted-foreground">This title is used in the statement of charges table and the generated PDF.</p>
                </div>
              </div>
            </CardContent>
          )}
          <CardContent className="space-y-3">
            <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Statement of Charges</p>
              <p className="mt-1">The invoice table below shows the single MMC row used in the PDF.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/10 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>Invoice table</CardTitle>
          <CardDescription>Build the invoice row by row. Transaction based mode shows the transaction count input and recalculates the variable rows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-muted/20 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={transactionBased} onCheckedChange={(checked) => setTransactionBased(Boolean(checked))} />
              Transaction Based
            </label>
            <div className="min-w-[180px] space-y-2">
              <Label className="text-sm font-medium">Tax Type</Label>
              <Select value={resolvedTaxType} onValueChange={(value) => setTaxType(value as RowTaxType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Domestic">Domestic</SelectItem>
                  <SelectItem value="International">International</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">GSTIN starting with 33 uses SGST + CGST; all others use IGST.</p>
            </div>
            {transactionBased && (
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <Label htmlFor="txn-based-count">Transaction Count</Label>
                    <span className="text-muted-foreground">{txnInput.toLocaleString()}</span>
                  </div>
                  <Input
                    id="txn-based-count"
                    type="number"
                    min={0}
                    step={100000}
                    value={txnInput}
                    onChange={(e) => updateTxnInput(Number(e.target.value) || 0)}
                    disabled={!hasTransactionSlabConfig}
                    title={!hasTransactionSlabConfig ? "There is no slab configured" : undefined}
                  />
                </div>
                <div className="min-w-[260px] flex-[2]">
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={100000}
                    value={txnInput}
                    onChange={(e) => updateTxnInput(Number(e.target.value))}
                    disabled={!hasTransactionSlabConfig}
                    className="w-full accent-primary"
                    title={!hasTransactionSlabConfig ? "There is no slab configured" : undefined}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">Move the slider or type a number. The variable row updates automatically.</p>
                </div>
              </div>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" onClick={addOverviewRow}>
                <Plus className="mr-2 h-4 w-4" /> Add row
              </Button>
              <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white" onClick={saveOverviewConfig}>
                Save Overview
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border">
              <Table className="min-w-[1220px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <GripVertical className="h-3.5 w-3.5" />
                        Order
                      </span>
                    </TableHead>
                    <TableHead className="w-12 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">No.</TableHead>
                    <TableHead className="w-[300px] px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        Narration
                      </span>
                    </TableHead>
                    <TableHead className="w-24 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center justify-end gap-1">
                        <Wallet className="h-3.5 w-3.5" />
                        Amt
                      </span>
                    </TableHead>
                    <TableHead className="w-20 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">HSN</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Rate</TableHead>
                    <TableHead className="w-24 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">CGST</TableHead>
                    <TableHead className="w-24 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">SGST</TableHead>
                    <TableHead className="w-24 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">IGST</TableHead>
                    <TableHead className="w-24 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center justify-end gap-1">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Total
                      </span>
                    </TableHead>
                    <TableHead className="w-20 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Settings className="h-3.5 w-3.5" />
                        Align
                      </span>
                    </TableHead>
                    <TableHead className="w-16 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Trash2 className="h-3.5 w-3.5" />
                        Act
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <DndContext sensors={overviewSensors} collisionDetection={closestCenter} onDragEnd={handleOverviewDragEnd} modifiers={[restrictToVerticalAxis]}>
                  <SortableContext items={overviewRowIds} strategy={verticalListSortingStrategy}>
                    <TableBody>
                      {overviewRows.map((row, index) => {
                        const rowTaxes = calculateRowTaxes(row.amount, row.rate, resolvedTaxType);
                        const rowTotal = rowTaxes.totalAmount;
                        const alignClass = row.align === "right" ? "text-right" : row.align === "center" ? "text-center" : "text-left";
                        return (
                          <SortableOverviewRow key={row.id} row={row} index={index}>
                            {({ attributes, listeners }) => (
                              <>
                                <TableCell className="px-2 py-2 text-center align-top">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <label className="flex items-center justify-center" title="Include in export">
                                      <Checkbox checked={row.exportEnabled !== false} onCheckedChange={(checked) => updateOverviewRow(index, "exportEnabled", Boolean(checked))} />
                                      <span className="sr-only">Export</span>
                                    </label>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 cursor-grab active:cursor-grabbing"
                                      title="Drag to reorder"
                                      {...attributes}
                                      {...listeners}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      <span className="sr-only">Drag row {index + 1}</span>
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-2 font-medium text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</TableCell>
                                <TableCell className="align-top px-2 py-2">
                                  <div className="space-y-1.5">
                                    <Select value={row.narrationMode || "multiline"} onValueChange={(value) => updateOverviewRow(index, "narrationMode", value as NarrationMode)}>
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Mode" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="title">Title</SelectItem>
                                        <SelectItem value="subtitle">Subtitle</SelectItem>
                                        <SelectItem value="multiline">Multiline</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Textarea
                                      value={row.narration}
                                      onChange={(e) => updateOverviewRow(index, "narration", e.target.value)}
                                      className={`min-h-20 resize-none w-full text-xs leading-5 ${alignClass}`}
                                      placeholder={row.narrationMode === "title" ? "Title text" : row.narrationMode === "subtitle" ? "Subtitle text" : "Multiline narration"}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-2 text-right align-top">
                                  <Input
                                    type="number"
                                    value={row.amount}
                                    onChange={(e) => updateOverviewRow(index, "amount", e.target.value)}
                                    readOnly={row.id === "variable-slab" && transactionBased}
                                    className="h-8 text-right text-xs"
                                  />
                                  {row.id === "variable-slab" && transactionBased && (
                                    <p className="mt-1 text-[11px] text-muted-foreground">Calculated from transaction count</p>
                                  )}
                                </TableCell>
                                <TableCell className="px-2 py-2 align-top">
                                  <div className="space-y-1.5">
                                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <Checkbox checked={getEffectiveOverviewRowUseConfigHsn(row, taxConfig)} onCheckedChange={(checked) => updateOverviewRow(index, "useConfigHsn", Boolean(checked))} />
                                    Use config HSN
                                  </label>
                                  <Input
                                    value={getEffectiveOverviewRowUseConfigHsn(row, taxConfig) ? (taxConfig.invoiceHsnCode || "") : row.hsn}
                                    onChange={(e) => updateOverviewRow(index, "hsn", e.target.value)}
                                    readOnly={getEffectiveOverviewRowUseConfigHsn(row, taxConfig)}
                                    className={`h-8 text-xs ${alignClass}`}
                                    placeholder={taxConfig.invoiceHsnCode || "998314"}
                                  />
                                </div>
                                </TableCell>
                                <TableCell className="px-2 py-2 align-top">
                                  <Input value={row.rate} onChange={(e) => updateOverviewRow(index, "rate", e.target.value)} className={`h-8 text-xs ${alignClass}`} placeholder="18%" />
                                </TableCell>
                                <TableCell className="px-2 py-2 align-top">
                                  <Input type="text" value={Math.round(rowTaxes.cgst).toLocaleString("en-IN")} readOnly className="h-8 min-w-[5.5rem] text-right text-xs tabular-nums bg-muted/20" />
                                </TableCell>
                                <TableCell className="px-2 py-2 align-top">
                                  <Input type="text" value={Math.round(rowTaxes.sgst).toLocaleString("en-IN")} readOnly className="h-8 min-w-[5.5rem] text-right text-xs tabular-nums bg-muted/20" />
                                </TableCell>
                                <TableCell className="px-2 py-2 align-top">
                                  <Input type="text" value={Math.round(rowTaxes.igst).toLocaleString("en-IN")} readOnly className="h-8 min-w-[5.5rem] text-right text-xs tabular-nums bg-muted/20" />
                                </TableCell>
                                <TableCell className="px-2 py-2 text-right align-top whitespace-nowrap text-xs font-semibold">{currencyLabel(rowTotal, client.currency || "INR")}</TableCell>
                                <TableCell className="px-2 py-2 align-top">
                                  <Select value={row.align} onValueChange={(value) => updateOverviewRow(index, "align", value as RowAlign)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="left">Left</SelectItem>
                                      <SelectItem value="center">Center</SelectItem>
                                      <SelectItem value="right">Right</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="px-2 py-2 text-center align-top">
                                  {row.kind === "custom" ? (
                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Remove row" onClick={() => removeOverviewRow(index)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">Locked</span>
                                  )}
                                </TableCell>
                              </>
                            )}
                          </SortableOverviewRow>
                        );
                      })}
                    </TableBody>
                  </SortableContext>
                </DndContext>
              </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: "Total billing value", value: currencyLabel(invoiceDraft, client.currency || "INR"), icon: Wallet },
          { label: "Monthly transaction volume", value: client.monthlyTransactionVolume.toLocaleString(), icon: Layers3 },
          { label: "Fixed charges", value: currencyLabel(fixedCharges, client.currency || "INR"), icon: BadgeCheck },
          { label: "Final payable", value: currencyLabel(finalPayable, client.currency || "INR"), icon: CheckCircle2 },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Commercial Summary Panel</CardTitle>
              <CardDescription>Fixed charges, variable slabs, AWS pass-through and tax preview</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log("[Overview] View Details button clicked, opening modal");
                setShowSummaryModal(true);
              }}
            >
              View Details
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fixed charges breakdown</span>
                <span className="font-medium">{currencyLabel(fixedCharges, client.currency || "INR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Variable charges calculation</span>
                <span className="font-medium">{currencyLabel(Math.max(variableCharges, 0), client.currency || "INR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">AWS margin calculations</span>
                <span className="font-medium">{currencyLabel(awsMargin, client.currency || "INR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated monthly invoice</span>
                <span className="font-semibold text-primary">{currencyLabel(invoiceDraft, client.currency || "INR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tax preview</span>
                <span className="font-medium">{currencyLabel(tax, client.currency || "INR")}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Final payable amount</span>
                <span>{currencyLabel(finalPayable, client.currency || "INR")}</span>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Monthly transaction slider</Label>
                <span className="text-sm text-muted-foreground">{txnInput.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={100000}
                value={txnInput}
                onChange={(e) => updateTxnInput(Number(e.target.value))}
                disabled={!hasTransactionSlabConfig}
                className="w-full accent-primary"
                title={!hasTransactionSlabConfig ? "There is no slab configured" : undefined}
              />
              <div className="grid gap-2 md:grid-cols-[1fr_160px] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="txn-input">Transaction count</Label>
                  <Input
                    id="txn-input"
                    type="number"
                    min={0}
                    step={100000}
                    value={txnInput}
                    onChange={(e) => updateTxnInput(Number(e.target.value) || 0)}
                    disabled={!hasTransactionSlabConfig}
                    className="h-11"
                    title={!hasTransactionSlabConfig ? "There is no slab configured" : undefined}
                  />
                </div>
                <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Type a value or move the slider to recalculate instantly.
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-4 text-white shadow-lg">
                <div className="text-sm uppercase tracking-[0.18em] text-white/80">Real-time invoice recalculation</div>
                <div className="mt-2 text-3xl font-semibold">{currencyLabel(invoiceDraft, client.currency || "INR")}</div>
                <div className="mt-1 text-sm text-white/80">Slab-driven estimate updates as the transaction input changes.</div>
              </div>
              <div className="space-y-3">
                {client.transactionSlabs.map((slab, index) => (
                  <div key={index} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">
                        {slab.from.toLocaleString()} - {slab.to ? slab.to.toLocaleString() : "Above"}
                      </p>
                      <p className="text-muted-foreground">{slab.rate} {slab.unit} per transaction</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications Panel</CardTitle>
            <CardDescription>Alerting on overdue invoices and commercial thresholds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {NOTIFICATIONS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-3 rounded-2xl border p-4">
                  <div className={cn(
                    "rounded-2xl p-3",
                    item.tone === "red" && "bg-red-500/10 text-red-600",
                    item.tone === "amber" && "bg-amber-500/10 text-amber-600",
                    item.tone === "blue" && "bg-blue-500/10 text-blue-600",
                    item.tone === "emerald" && "bg-emerald-500/10 text-emerald-600",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {client.aws?.enabled && (
        <Card className="border-muted/60 shadow-sm">
          <CardHeader>
            <div>
              <CardTitle>AWS Infra breakdown</CardTitle>
              <CardDescription>
                Update the vendor cost and margin percentage that drive the AWS rows in the invoice table.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Vendor Cost</Label>
              <Input
                type="number"
                value={awsVendorCostDraft}
                onChange={(e) => handleAwsVendorCostDraftChange(Number(e.target.value) || 0)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Linked to the AWS Vendor Cost row in the invoice table.</p>
            </div>
            <div className="space-y-1">
              <Label>Margin Percentage</Label>
              <Input
                type="number"
                value={awsMarginDraft}
                onChange={(e) => handleAwsMarginDraftChange(Number(e.target.value) || 0)}
                placeholder="25"
              />
              <p className="text-xs text-muted-foreground">Used to calculate the AWS markup row.</p>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={saveOverviewConfig}>
                Save AWS settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        <InvoiceHistoryTable
          title="Invoice History Table"
          subtitle="Invoice numbers, status workflow, generated dates and download/send actions"
          invoices={client.invoiceHistory || []}
          currencyCode={client.currency || "INR"}
          canManageApprovalActions={canManageApprovalActions}
          onEdit={onEditInvoice}
          onApprove={onApproveInvoice}
          onReject={onRejectInvoice}
          onSend={onSendInvoice}
          onPaid={onPaidInvoice}
          onClose={onCloseInvoice}
          onStatusChange={(invoice, status) => onStatusChange(getInvoiceDisplayNumber(invoice), status)}
          onDownloadPdf={onDownloadPdf}
          onDownloadDocx={onDownloadDocx}
          onPreview={onPreview}
          onDelete={(invoice) => onDeleteInvoice(invoice.invoiceId)}
        />
      </div>

      <Dialog
        open={showSummaryModal}
        onOpenChange={(open) => {
          console.log("[Overview] Summary modal state changed to:", open);
          setShowSummaryModal(open);
        }}
      >
        <DialogOverlay className="z-40 bg-black/40" />
        <DialogContent className="max-w-2xl">
          <DialogHeader className="flex items-center justify-between">
            <DialogTitle>Commercial Summary Breakdown</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setShowSummaryModal(false);
              }}
              className="h-6 w-6"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="grid gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Revenue Components</h3>
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Fixed Billing</p>
                    <p className="text-xs text-muted-foreground">Base charges</p>
                  </div>
                  <p className="text-lg font-semibold">{currencyLabel(client.fixedBilling, client.currency || "INR")}</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Fixed Charges (Calculated)</p>
                    <p className="text-xs text-muted-foreground">From invoice table</p>
                  </div>
                  <p className="text-lg font-semibold">{currencyLabel(fixedCharges, client.currency || "INR")}</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Variable Charges (Calculated)</p>
                    <p className="text-xs text-muted-foreground">Based on transaction count: {txnInput.toLocaleString()}</p>
                  </div>
                  <p className="text-lg font-semibold">{currencyLabel(Math.max(variableCharges, 0), client.currency || "INR")}</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">AWS Margin Calculation</p>
                    <p className="text-xs text-muted-foreground">Markup on vendor cost</p>
                  </div>
                  <p className="text-lg font-semibold">{currencyLabel(awsMargin, client.currency || "INR")}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Tax & Final Amount</h3>
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Subtotal</p>
                    <p className="text-xs text-muted-foreground">Sum of all charges</p>
                  </div>
                  <p className="text-lg font-semibold">{currencyLabel(invoiceDraft, client.currency || "INR")}</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Tax Calculation</p>
                    <p className="text-xs text-muted-foreground">GST/IGST applied</p>
                  </div>
                  <p className="text-lg font-semibold">{currencyLabel(tax, client.currency || "INR")}</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-gradient-to-r from-indigo-500/10 to-purple-500/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium font-bold">Final Payable Amount</p>
                    <p className="text-xs text-muted-foreground">Total invoice value</p>
                  </div>
                  <p className="text-2xl font-bold text-primary">{currencyLabel(finalPayable, client.currency || "INR")}</p>
                </div>
              </div>
            </div>

            {client.transactionSlabs && client.transactionSlabs.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Transaction Slabs Configuration</h3>
                  <div className="space-y-2">
                    {client.transactionSlabs.map((slab, index) => (
                      <div key={index} className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium">
                            {slab.from.toLocaleString()} - {slab.to ? slab.to.toLocaleString() : "Above"}
                          </p>
                          <p className="text-xs text-muted-foreground">{slab.rate} {slab.unit} per transaction</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RichTextDeclarationEditorProps = {
  value: string;
  onChange: (nextHtml: string) => void;
  className?: string;
};

function RichTextDeclarationEditor({ value, onChange, className }: RichTextDeclarationEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState("14");
  const [lineHeight, setLineHeight] = useState("1.6");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("left");
  const [textColor, setTextColor] = useState("#111827");
  const [highlightColor, setHighlightColor] = useState("#ffffff");

  useEffect(() => {
    if (!editorRef.current) return;

    const parsed = parseDeclarationStyle(value);
    setFontFamily(parsed.fontFamily);
    setFontSize(parsed.fontSize);
    setLineHeight(parsed.lineHeight);
    setTextAlign(parsed.textAlign);
    setTextColor(parsed.textColor);
    setHighlightColor(parsed.highlightColor);
    if (editorRef.current.innerHTML !== parsed.html) {
      editorRef.current.innerHTML = parsed.html;
    }
  }, [value]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.style.fontFamily = fontFamily;
    editorRef.current.style.fontSize = `${fontSize}px`;
    editorRef.current.style.lineHeight = lineHeight;
    editorRef.current.style.textAlign = textAlign;
  }, [fontFamily, fontSize, lineHeight, textAlign]);

  const serializeHtml = (
    nextContentHtml?: string,
    overrides?: Partial<{ fontFamily: string; fontSize: string; lineHeight: string; textAlign: "left" | "center" | "right"; textColor: string; highlightColor: string }>,
  ) => {
    const contentHtml = nextContentHtml ?? editorRef.current?.innerHTML ?? "";
    const merged = {
      fontFamily,
      fontSize,
      lineHeight,
      textAlign,
      textColor,
      highlightColor,
      ...overrides,
    };
    return `<div style="font-family: ${merged.fontFamily}; font-size: ${merged.fontSize}px; line-height: ${merged.lineHeight}; text-align: ${merged.textAlign};">${contentHtml}</div>`;
  };

  const syncValue = () => {
    onChange(serializeHtml());
  };

  const applyCommand = (command: string, valueArg?: string) => {
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, valueArg);
    syncValue();
  };

  const setBlockAlign = (align: "left" | "center" | "right") => {
    setTextAlign(align);
    onChange(serializeHtml(undefined, { textAlign: align }));
    applyCommand(align === "left" ? "justifyLeft" : align === "center" ? "justifyCenter" : "justifyRight");
  };

  const setTextStyle = (property: "foreColor" | "hiliteColor", color: string) => {
    if (property === "foreColor") setTextColor(color);
    if (property === "hiliteColor") setHighlightColor(color);
    applyCommand(property, color);
  };

  const setFontSizeCommand = (size: string) => {
    setFontSize(size);
    onChange(serializeHtml(undefined, { fontSize: size }));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-2xl border bg-muted/10 p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("bold")} title="Bold">
            <Bold className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("italic")} title="Italic">
            <Italic className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("underline")} title="Underline">
            <Underline className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("strikeThrough")} title="Strikethrough">
            <Strikethrough className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-8 shrink-0" />
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertUnorderedList")} title="Bullet list">
            <List className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertOrderedList")} title="Numbered list">
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("formatBlock", "blockquote")} title="Quote">
            <Quote className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHorizontalRule")} title="Divider">
            <Minus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setBlockAlign("left")} title="Align left">
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setBlockAlign("center")} title="Align center">
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setBlockAlign("right")} title="Align right">
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("justifyFull")} title="Justify">
            <AlignJustify className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setTextStyle("foreColor", textColor)} title="Text color">
            <Type className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setTextStyle("hiliteColor", highlightColor)} title="Highlight">
            <Highlighter className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("removeFormat")} title="Clear formatting">
            <Eraser className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("cut")} title="Cut">
            <Scissors className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("copy")} title="Copy">
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("paste")} title="Paste">
            <ClipboardPaste className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("unlink")} title="Remove link">
            <X className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("createLink", window.prompt("Enter link URL") || undefined)} title="Link">
            <Link className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHTML", "<table style='width:100%;border-collapse:collapse'><tr><td style='border:1px solid #cbd5e1;padding:6px'>Cell</td><td style='border:1px solid #cbd5e1;padding:6px'>Cell</td></tr></table>")} title="Table">
            <Table2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
            const url = window.prompt("Enter image URL");
            if (url) applyCommand("insertHTML", `<img src=\"${url}\" alt=\"\" style=\"max-width:100%;height:auto;display:block\" />`);
          }} title="Image">
            <Image className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHTML", "<div style='padding:8px 12px;border:1px dashed #cbd5e1;border-radius:10px'>Video</div>")} title="Video">
            <Video className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertParagraph")} title="Paragraph">
            <FileDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHTML", "<div style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px'><div style='border:1px solid #cbd5e1;padding:8px'>A</div><div style='border:1px solid #cbd5e1;padding:8px'>B</div></div>")} title="Layout">
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHTML", "<span></span>")} title="Preview">
            <Eye className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("formatBlock", "pre")} title="Code">
            <Code className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHTML", "&nbsp;")} title="New block">
            <Square className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} title="Fullscreen">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("undo")} title="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("redo")} title="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => applyCommand("insertHTML", "") } title="More">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-background px-1.5 py-1 ml-1">
            <span className="text-xs text-muted-foreground">Font</span>
            <Select value={fontFamily} onValueChange={(next) => {
              setFontFamily(next);
              onChange(serializeHtml(undefined, { fontFamily: next }));
            }}>
              <SelectTrigger className="h-8 w-[100px] shrink-0 border-0 bg-transparent px-0 shadow-none">
                <SelectValue placeholder="Font" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Arial",
                  "Georgia",
                  "Times New Roman",
                  "Verdana",
                  "Tahoma",
                  "Courier New",
                ].map((font) => (
                  <SelectItem key={font} value={font}>{font}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-background px-1.5 py-1">
            <span className="text-xs text-muted-foreground">Size</span>
            <Select value={fontSize} onValueChange={setFontSizeCommand}>
              <SelectTrigger className="h-8 w-[72px] shrink-0 border-0 bg-transparent px-0 shadow-none">
                <SelectValue placeholder="Size" />
              </SelectTrigger>
              <SelectContent>
                {["8", "9", "10", "11", "12", "13", "14", "15", "16", "18", "20", "24"].map((size) => (
                  <SelectItem key={size} value={size}>{size}px</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-background px-1.5 py-1">
            <span className="text-xs text-muted-foreground">Line</span>
            <Select value={lineHeight} onValueChange={(next) => {
              setLineHeight(next);
              onChange(serializeHtml(undefined, { lineHeight: next }));
            }}>
              <SelectTrigger className="h-8 w-[66px] shrink-0 border-0 bg-transparent px-0 shadow-none">
                <SelectValue placeholder="Line" />
              </SelectTrigger>
              <SelectContent>
                {["1.2", "1.4", "1.6", "1.8", "2.0"].map((lh) => (
                  <SelectItem key={lh} value={lh}>{lh}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-background px-1.5 py-1">
            <span className="text-xs text-muted-foreground">Text</span>
            <input type="color" value={textColor} onChange={(e) => setTextStyle("foreColor", e.target.value)} className="h-7 w-7 cursor-pointer rounded border bg-transparent p-0" />
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-background px-1.5 py-1">
            <span className="text-xs text-muted-foreground">Highlight</span>
            <input type="color" value={highlightColor} onChange={(e) => setTextStyle("hiliteColor", e.target.value)} className="h-7 w-7 cursor-pointer rounded border bg-transparent p-0" />
          </div>
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncValue}
        onBlur={syncValue}
        className="min-h-[200px] rounded-2xl border bg-background p-4 text-sm outline-none shadow-inner"
        style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight, textAlign }}
      />
    </div>
  );
}

function InvoiceConfigEditor({
  mode,
  client,
  onCancel,
  onSave,
  canManageConfigActions,
}: {
  mode: "create" | "edit";
  client?: ClientRecord;
  onCancel: () => void;
  onSave: (payload: any) => void;
  canManageConfigActions: boolean;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(client?.name || "");
  const [code, setCode] = useState(client?.code || "");
  const [status, setStatus] = useState(client?.status || "draft");
  const [priority, setPriority] = useState<keyof typeof PRIORITY_META>(getPriorityFromClient(client || CLIENTS[0]));
  const [fixedBilling, setFixedBilling] = useState(client?.fixedBilling || 0);
  const [billingCycle, setBillingCycle] = useState(client?.billingCycle || "Monthly");
  const [billingModel, setBillingModel] = useState<BillingModel>(client?.billingModel || "transaction");
  const [billingYear, setBillingYear] = useState<1 | 2 | 3>(client?.billingYear || 1);
  const [setupFee, setSetupFee] = useState(client?.setupFee || 0);
  const [setupFeePaid, setSetupFeePaid] = useState(client?.setupFeePaid || 0);
  const [mmcYear1, setMmcYear1] = useState(client?.mmcYear1 || 0);
  const [mmcYear2, setMmcYear2] = useState(client?.mmcYear2 || 0);
  const [mmcYear3, setMmcYear3] = useState(client?.mmcYear3 || 0);
  const [transactionFeeRate, setTransactionFeeRate] = useState(client?.transactionFeeRate || 0.50);
  const [vapMipConnectivityFee, setVapMipConnectivityFee] = useState(client?.vapMipConnectivityFee || 250000);
  const [changeManagementFeeRate, setChangeManagementFeeRate] = useState(client?.changeManagementFeeRate || 15000);
  const [changeManagementManDays, setChangeManagementManDays] = useState(client?.changeManagementManDays || 0);
  const [networkCertificationNote, setNetworkCertificationNote] = useState(client?.networkCertificationNote || "To be borne by client/bank as per actuals");
  const [infraCostNote, setInfraCostNote] = useState(client?.infraCostNote || "To be borne by client/bank as per actuals");
  const [minimumGuarantee, setMinimumGuarantee] = useState(client?.minimumGuarantee || 0);
  const [additionalPlatformFee, setAdditionalPlatformFee] = useState(client?.additionalPlatformFee || 0);
  const [integrationFee, setIntegrationFee] = useState(client?.integrationFee || 0);
  const [awsEnabled, setAwsEnabled] = useState(Boolean(client?.aws.enabled));
  const [awsVendorCost, setAwsVendorCost] = useState(client?.aws.vendorCost || 0);
  const [awsMarginPercentage, setAwsMarginPercentage] = useState(client?.aws.marginPercentage || 25);
  useEffect(() => {
    setAwsEnabled(Boolean(client?.aws.enabled));
    setAwsVendorCost(client?.aws.vendorCost || 0);
    setAwsMarginPercentage(client?.aws.marginPercentage || 25);
  }, [client?.id, client?.aws.enabled, client?.aws.vendorCost, client?.aws.marginPercentage]);

  useEffect(() => {
    setSelectedServices(client?.services ? [...client.services] : []);
    setServiceTypeOther(client?.serviceTypeOther || "");
    const initial = [...SERVICE_OPTIONS];
    const sourceOptions = client?.serviceOptions && client.serviceOptions.length > 0 ? client.serviceOptions : client?.services || [];
    sourceOptions.forEach((service) => {
      const value = normalizeInlineText(service);
      if (value && !initial.some((item) => item.toLowerCase() === value.toLowerCase())) initial.push(value);
    });
    setServiceOptions(initial);
  }, [client?.id, client?.services, client?.serviceTypeOther, client?.serviceOptions]);
  const [selectedServices, setSelectedServices] = useState<string[]>(client?.services ? [...client.services] : []);
  const [serviceTypeOther, setServiceTypeOther] = useState(client?.serviceTypeOther || "");
  const [serviceOptions, setServiceOptions] = useState<string[]>(() => {
    const initial = [...SERVICE_OPTIONS];
    const sourceOptions = client?.serviceOptions && client.serviceOptions.length > 0 ? client.serviceOptions : client?.services || [];
    sourceOptions.forEach((service) => {
      const value = normalizeInlineText(service);
      if (value && !initial.some((item) => item.toLowerCase() === value.toLowerCase())) initial.push(value);
    });
    return initial;
  });
  const [serviceOptionDialogOpen, setServiceOptionDialogOpen] = useState(false);
  const [serviceOptionDraft, setServiceOptionDraft] = useState("");
  const [serviceOptionEditingOriginal, setServiceOptionEditingOriginal] = useState<string | null>(null);
  const [slabs, setSlabs] = useState(client?.transactionSlabs ? [...client.transactionSlabs] : [
    { from: 0, to: 5000000, rate: 0.04, unit: "paisa" as const },
  ]);
  const [gstin, setGstin] = useState(client?.gstin || "");
  const [lutNumber, setLutNumber] = useState(client?.lutNumber || "");
  const [billingAddress, setBillingAddress] = useState(client?.billingAddress || "");
  const [billingEmail, setBillingEmail] = useState(client?.billingEmail || "");
  const [invoicePrefix, setInvoicePrefix] = useState(client?.invoicePrefix || "MYL");
  const [invoiceCurrentSerial, setInvoiceCurrentSerial] = useState(
    client?.invoiceCurrentSerial !== undefined && client?.invoiceCurrentSerial !== null
      ? formatInvoiceSerial(Number(client.invoiceCurrentSerial || 0), 4)
      : "",
  );
  const [signatoryName, setSignatoryName] = useState(client?.signatoryName || "");
  const [signatoryImage, setSignatoryImage] = useState(client?.signatoryImage || "");
  const [notes, setNotes] = useState(client?.notes || "");
  const [txnPreview, setTxnPreview] = useState(client?.monthlyTransactionVolume || 1000000);
  const [clientType, setClientType] = useState<ClientType>(client?.clientType || "Domestic");
  const [clientCurrency, setClientCurrency] = useState<CurrencyType>(client?.currency || "INR");
  const [customInvoiceRows, setCustomInvoiceRows] = useState<CustomInvoiceRow[]>(
    client?.customInvoiceRows && client.customInvoiceRows.length > 0
      ? [...client.customInvoiceRows]
      : [],
  );

  const preview = useMemo(() => {
    const fakeClient = {
      fixedBilling,
      transactionSlabs: slabs,
      aws: { enabled: awsEnabled, vendorCost: awsVendorCost, marginPercentage: awsMarginPercentage },
      minimumGuarantee,
      integrationFee,
      additionalPlatformFee,
      billingModel,
      billingYear,
      setupFee,
      setupFeePaid,
      mmcYear1,
      mmcYear2,
      mmcYear3,
      customInvoiceRows,
    } as ClientRecord;
    return estimateInvoiceFromSlabs(fakeClient, txnPreview);
  }, [fixedBilling, slabs, awsEnabled, awsVendorCost, awsMarginPercentage, minimumGuarantee, integrationFee, additionalPlatformFee, txnPreview, billingModel, billingYear, setupFee, setupFeePaid, mmcYear1, mmcYear2, mmcYear3, customInvoiceRows]);

  const updateSlab = (index: number, key: keyof ClientRecord["transactionSlabs"][number], value: any) => {
    setSlabs((prev) => prev.map((slab, i) => (i === index ? { ...slab, [key]: value } : slab)));
  };

  const addSlab = () => {
    const lastTo = slabs.length ? (slabs[slabs.length - 1].to ?? slabs[slabs.length - 1].from + 5000000) : 0;
    setSlabs((prev) => [...prev, { from: lastTo, to: lastTo + 5000000, rate: 0.04, unit: "paisa" }]);
  };

  const removeSlab = (index: number) => setSlabs((prev) => prev.filter((_, i) => i !== index));

  const toggleService = (service: string) => {
    setSelectedServices((prev) => {
      const next = prev.includes(service) ? prev.filter((item) => item !== service) : [...prev, service];
      if (!next.includes("Other")) setServiceTypeOther("");
      return next;
    });
  };

  const openAddServiceOption = () => {
    setServiceOptionEditingOriginal(null);
    setServiceOptionDraft("");
    setServiceOptionDialogOpen(true);
  };

  const openEditServiceOption = (service: string) => {
    setServiceOptionEditingOriginal(service);
    setServiceOptionDraft(service);
    setServiceOptionDialogOpen(true);
  };

  const saveServiceOption = () => {
    const value = normalizeInlineText(serviceOptionDraft);
    if (!value) return;

    setServiceOptions((prev) => {
      const original = serviceOptionEditingOriginal;
      const existing = prev.find((item) => item.toLowerCase() === value.toLowerCase());
      if (original) {
        if (existing && existing !== original) return prev;
        return prev.map((item) => (item === original ? value : item));
      }
      if (existing) return prev;
      return [...prev, value];
    });

    setSelectedServices((prev) => {
      const original = serviceOptionEditingOriginal;
      if (original) return prev.map((item) => (item === original ? value : item));
      return prev.includes(value) ? prev : [...prev, value];
    });

    setServiceOptionDraft("");
    setServiceOptionEditingOriginal(null);
    setServiceOptionDialogOpen(false);
  };

  const removeServiceOption = (service: string) => {
    if (SERVICE_OPTIONS.includes(service)) return;
    setServiceOptions((prev) => prev.filter((item) => item !== service));
    setSelectedServices((prev) => prev.filter((item) => item !== service));
    if (serviceOptionEditingOriginal === service) {
      setServiceOptionEditingOriginal(null);
      setServiceOptionDraft("");
      setServiceOptionDialogOpen(false);
    }
  };

  const addCustomInvoiceRow = () => {
    setCustomInvoiceRows((prev) => [...prev, { name: "", amount: 0, taxType: clientType === "International" ? "International" : "Domestic" }]);
  };

  const updateCustomInvoiceRow = (index: number, key: keyof CustomInvoiceRow, value: string | number) => {
    setCustomInvoiceRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [key]: key === "amount" || key === "cgst" || key === "sgst" || key === "igst"
                ? Number(value) || 0
                : value,
            }
          : row,
      ),
    );
  };

  const removeCustomInvoiceRow = (index: number) => {
    setCustomInvoiceRows((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName || !trimmedCode) {
      return;
    }
    onSave({
      id: client?.id,
      clientId: client?.clientId,
      name: trimmedName,
      code: trimmedCode,
      status,
      priority,
      fixedBilling,
      billingCycle,
      billingModel,
      billingYear,
      setupFee,
      setupFeePaid,
      mmcYear1,
      mmcYear2,
      mmcYear3,
      transactionFeeRate,
      vapMipConnectivityFee,
      changeManagementFeeRate,
      changeManagementManDays,
      networkCertificationNote,
      infraCostNote,
      minimumGuarantee,
      additionalPlatformFee,
      integrationFee,
      aws: { enabled: awsEnabled, vendorCost: awsVendorCost, marginPercentage: awsMarginPercentage },
      services: selectedServices,
      serviceOptions,
      serviceTypeOther: selectedServices.includes("Other") ? serviceTypeOther.trim() : "",
      transactionSlabs: slabs,
      notes,
      invoicePrefix: String(invoicePrefix || "").trim(),
      invoiceCurrentSerial: Number(invoiceCurrentSerial || 0),
      gstin,
      lutNumber,
      billingAddress,
      billingEmail,
      signatoryName,
      signatoryImage,
      monthlyInvoiceEstimate: preview,
      monthlyTransactionVolume: txnPreview,
      clientType,
      clientCurrency,
      customInvoiceRows: customInvoiceRows.filter(
        (row) => String(row.name || "").trim().length > 0 || String(row.narration || "").trim().length > 0,
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">Invoice Management</div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {mode === "create" ? "Create Config" : "Edit Config"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            Save Configuration
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Stepper Form</CardTitle>
            <CardDescription>Basic details, billing, variable commercials and AWS infra</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {[{ id: 1, label: "Basic Details" }, { id: 2, label: "Billing Configuration" }, { id: 3, label: "Variable Commercials" }, { id: 4, label: "AWS Infra" }].map((item) => (
                <Button key={item.id} variant={step === item.id ? "default" : "outline"} onClick={() => setStep(item.id as number)}>
                  {item.id}. {item.label}
                </Button>
              ))}
            </div>

            <Accordion type="multiple" defaultValue={["basic", "billing"]} className="space-y-2">
              <AccordionItem value="basic" className="rounded-2xl border px-4">
                <AccordionTrigger>Basic Details</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Client Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Code</Label>
                      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Client code" />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority Level</Label>
                      <Select value={priority} onValueChange={(value) => setPriority(value as keyof typeof PRIORITY_META)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.keys(PRIORITY_META).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.keys(STATUS_META).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Client Type</Label>
                      <Select value={clientType} onValueChange={(value) => setClientType(value as ClientType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Domestic">Domestic (India)</SelectItem>
                          <SelectItem value="International">International</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={clientCurrency} onValueChange={(value) => setClientCurrency(value as CurrencyType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INR">₹ INR - India</SelectItem>
                          <SelectItem value="USD">$ USD - United States</SelectItem>
                          <SelectItem value="AED">د.إ AED - UAE</SelectItem>
                          <SelectItem value="SAR">﷼ SAR - Saudi Arabia</SelectItem>
                          <SelectItem value="KWD">د.ك KWD - Kuwait</SelectItem>
                          <SelectItem value="OMR">ر.ع. OMR - Oman</SelectItem>
                          <SelectItem value="QAR">﷼ QAR - Qatar</SelectItem>
                          <SelectItem value="BHD">د.ب BHD - Bahrain</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>GSTIN</Label>
                      <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="GST identification number" />
                    </div>
                    <div className="space-y-2">
                      <Label>Invoice Prefix</Label>
                      <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="IE / MY" />
                  </div>
                  <div className="space-y-2">
                    <Label>Current Serial Number (by prefix)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={invoiceCurrentSerial}
                      onChange={(e) => setInvoiceCurrentSerial(e.target.value)}
                      placeholder="0017"
                    />
                  </div>
                    <div className="space-y-2">
                      <Label>LUT Number</Label>
                      <Input value={lutNumber} onChange={(e) => setLutNumber(e.target.value)} placeholder="LUT reference number" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Billing Address</Label>
                      <Textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="Billing address shown on invoice" />
                    </div>
                    <div className="space-y-2">
                      <Label>Billing Email</Label>
                      <Input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="invoice email" />
                    </div>
                    <div className="space-y-2">
                      <Label>Authority Signature Name</Label>
                      <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="Authorized signatory name" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Signature Image</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const dataUrl = await readFileDataUrl(file);
                          setSignatoryImage(dataUrl);
                        }}
                      />
                      {signatoryImage && (
                        <div className="mt-2 rounded-xl border bg-muted/20 p-3">
                          <img src={signatoryImage} alt="Signature preview" className="max-h-24 object-contain" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Service Type</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={openAddServiceOption}
                        >
                          + Add
                        </Button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {serviceOptions.map((service) => {
                          return (
                            <div key={service} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                              <label className="flex min-w-0 flex-1 items-center gap-2">
                                <Checkbox checked={selectedServices.includes(service)} onCheckedChange={() => toggleService(service)} />
                                <span className="truncate">{service}</span>
                              </label>
                              {canManageConfigActions && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                                    onClick={() => openEditServiceOption(service)}
                                    title="Edit service option"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeServiceOption(service)}
                                    title="Delete service option"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {selectedServices.includes("Other") && (
                        <div className="space-y-2">
                          <Label>Other service</Label>
                          <Input value={serviceTypeOther} onChange={(e) => setServiceTypeOther(e.target.value)} placeholder="Enter other service type" />
                        </div>
                      )}
                    </div>

                    <Dialog
                      open={serviceOptionDialogOpen}
                      onOpenChange={(open) => {
                        setServiceOptionDialogOpen(open);
                        if (!open) {
                          setServiceOptionEditingOriginal(null);
                          setServiceOptionDraft("");
                        }
                      }}
                    >
                      <DialogContent
                        className="max-w-md w-[calc(100vw-2rem)] rounded-2xl"
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <DialogHeader>
                          <DialogTitle>{serviceOptionEditingOriginal ? "Edit Service Name" : "Add Service Name"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="service-option-name">Service Name</Label>
                            <Input
                              id="service-option-name"
                              value={serviceOptionDraft}
                              onChange={(e) => setServiceOptionDraft(e.target.value)}
                              placeholder="Enter service name"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setServiceOptionDialogOpen(false);
                                setServiceOptionEditingOriginal(null);
                                setServiceOptionDraft("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button type="button" onClick={saveServiceOption}>
                              {serviceOptionEditingOriginal ? "Save Changes" : "Add Service"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <div className="space-y-3 md:col-span-2 rounded-2xl border bg-muted/20 p-4">
                      <Label>Billing Mode</Label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm", billingModel === "transaction" && "border-primary bg-primary/5")}>
                          <input
                            type="radio"
                            name="billing-model"
                            checked={billingModel === "transaction"}
                            onChange={() => setBillingModel("transaction")}
                            className="mt-1 h-4 w-4"
                          />
                          <div>
                            <div className="font-medium">Transaction based config</div>
                            <div className="text-muted-foreground">Bill based on transaction slabs and recurring fees.</div>
                          </div>
                        </label>
                        <label className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm", billingModel === "mmc" && "border-primary bg-primary/5")}>
                          <input
                            type="radio"
                            name="billing-model"
                            checked={billingModel === "mmc"}
                            onChange={() => setBillingModel("mmc")}
                            className="mt-1 h-4 w-4"
                          />
                          <div>
                            <div className="font-medium">MMC (Monthly Minimum Commitment)</div>
                            <div className="text-muted-foreground">Bill whichever is higher: MMC floor or transaction-based amount.</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="billing" className="rounded-2xl border px-4">
                <AccordionTrigger>Billing Configuration</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fixed Amount</Label>
                      <Input type="number" value={fixedBilling} onChange={(e) => setFixedBilling(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Billing Cycle</Label>
                      <Select value={billingCycle} onValueChange={setBillingCycle}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].map((cycle) => <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Minimum Guarantee</Label>
                      <Input type="number" value={minimumGuarantee} onChange={(e) => setMinimumGuarantee(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Additional Platform Fee</Label>
                      <Input type="number" value={additionalPlatformFee} onChange={(e) => setAdditionalPlatformFee(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Integration Fee</Label>
                      <Input type="number" value={integrationFee} onChange={(e) => setIntegrationFee(Number(e.target.value))} />
                    </div>
                    {billingModel === "mmc" && (
                      <div className="md:col-span-2 rounded-2xl border bg-blue-50/40 p-4 text-sm text-blue-900">
                        <p className="font-semibold">MMC billing is summarized in the statement of charges below.</p>
                        <p className="mt-1 text-xs text-blue-800/80">Only the invoice title is editable here. The invoice table will show a single MMC row.</p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="variable" className="rounded-2xl border px-4">
                <AccordionTrigger>Variable Commercials</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Slab Builder</p>
                        <p className="text-sm text-muted-foreground">Add, remove and adjust slabs in a pricing table layout</p>
                      </div>
                      <Button variant="outline" className="gap-2" onClick={addSlab}><Plus className="h-4 w-4" /> Add slab</Button>
                    </div>
                    <div className="space-y-3">
                      {slabs.map((slab, index) => (
                        <div key={index} className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-5">
                          <div className="space-y-2"><Label>Transaction From</Label><Input type="number" value={slab.from} onChange={(e) => updateSlab(index, "from", Number(e.target.value))} /></div>
                          <div className="space-y-2"><Label>Transaction To</Label><Input type="number" value={slab.to ?? ""} onChange={(e) => updateSlab(index, "to", e.target.value ? Number(e.target.value) : undefined)} placeholder="Infinity" /></div>
                          <div className="space-y-2"><Label>Rate</Label><Input type="number" step="0.001" value={slab.rate} onChange={(e) => updateSlab(index, "rate", Number(e.target.value))} /></div>
                          <div className="space-y-2"><Label>Unit Type</Label><Select value={slab.unit} onValueChange={(value) => updateSlab(index, "unit", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paisa">Paisa</SelectItem><SelectItem value="rupees">Rupees</SelectItem></SelectContent></Select></div>
                          <div className="flex items-end"><Button variant="outline" className="w-full gap-2" onClick={() => removeSlab(index)}><Trash2 className="h-4 w-4" /> Remove</Button></div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label>Service description / preview text</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commercial notes, service description, tax handling, pass-through logic..." />
                    </div>
                    <div className="space-y-4 rounded-2xl border bg-background p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">Additional invoice rows</p>
                          <p className="text-sm text-muted-foreground">Add paragraph-style rows such as UPI reconciliation, minimum guarantee or setup fee lines.</p>
                        </div>
                        <Button variant="outline" type="button" onClick={addCustomInvoiceRow}>
                          <Plus className="mr-2 h-4 w-4" /> Add row
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {customInvoiceRows.length === 0 && (
                          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                            No custom rows added yet.
                          </div>
                        )}
                        {customInvoiceRows.map((row, index) => (
                          <div key={index} className="space-y-3 rounded-2xl border bg-muted/20 p-3 md:p-4">
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_120px_auto] md:items-end">
                              <div className="space-y-2 md:col-span-1">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Narration</Label>
                                <Input
                                  value={row.name}
                                  onChange={(e) => updateCustomInvoiceRow(index, "name", e.target.value)}
                                  placeholder="UPI Reconciliation Services for April 26"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paragraph / notes</Label>
                                <Textarea
                                  value={row.narration || ""}
                                  onChange={(e) => updateCustomInvoiceRow(index, "narration", e.target.value)}
                                  placeholder="Minimum guarantee, payee count, service period, agreement notes..."
                                  className="min-h-20 resize-none text-xs leading-5"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Label>
                                <Input
                                  type="number"
                                  value={row.amount}
                                  onChange={(e) => updateCustomInvoiceRow(index, "amount", e.target.value)}
                                  placeholder="0"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8" type="button" title="Remove row" onClick={() => removeCustomInvoiceRow(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-5">
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">HSN</Label>
                                <Input value={row.hsn || ""} onChange={(e) => updateCustomInvoiceRow(index, "hsn", e.target.value)} placeholder="998314" className="h-8 text-xs" />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rate</Label>
                                <Input value={row.rate || ""} onChange={(e) => updateCustomInvoiceRow(index, "rate", e.target.value)} placeholder="18%" className="h-8 text-xs" />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">CGST</Label>
                                <Input type="number" value={row.cgst ?? 0} onChange={(e) => updateCustomInvoiceRow(index, "cgst", e.target.value)} className="h-8 text-right text-xs" />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">SGST</Label>
                                <Input type="number" value={row.sgst ?? 0} onChange={(e) => updateCustomInvoiceRow(index, "sgst", e.target.value)} className="h-8 text-right text-xs" />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">IGST</Label>
                                <Input type="number" value={row.igst ?? 0} onChange={(e) => updateCustomInvoiceRow(index, "igst", e.target.value)} className="h-8 text-right text-xs" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="aws" className="rounded-2xl border px-4">
                <AccordionTrigger>AWS Infra</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                      <Checkbox checked={awsEnabled} onCheckedChange={(checked) => setAwsEnabled(Boolean(checked))} />
                      AWS Billing Enabled
                    </label>
                    <div className="space-y-2">
                      <Label>Vendor Cost</Label>
                      <Input type="number" value={awsVendorCost} onChange={(e) => setAwsVendorCost(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Margin Percentage</Label>
                      <Input type="number" value={awsMarginPercentage} onChange={(e) => setAwsMarginPercentage(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Live Calculation Preview</Label>
                      <div className="rounded-xl border bg-background p-4">
                        <div className="text-sm text-muted-foreground">Estimated monthly invoice</div>
                        <div className="mt-1 text-3xl font-semibold">{currencyLabel(preview, clientCurrency)}</div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>How the configuration will read in the overview and invoice engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white shadow-xl">
              <div className="text-sm uppercase tracking-[0.18em] text-white/75">Monthly Invoice Estimate</div>
              <div className="mt-2 text-4xl font-semibold">{currencyLabel(preview)}</div>
              <div className="mt-2 text-sm text-white/80">{selectedServices.length} services selected · {billingCycle}</div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Selected priority</span>
                <PriorityBadge priority={priority} />
              </div>
              <Separator className="my-4" />
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm"><span>Client Name</span><span className="font-medium">{name || "—"}</span></div>
                <div className="flex items-center justify-between text-sm"><span>Client Code</span><span className="font-medium">{code || "—"}</span></div>
                <div className="flex items-center justify-between text-sm"><span>Status</span><StatusBadge status={status} /></div>
                <div className="flex items-center justify-between text-sm"><span>AWS Infra</span><span className="font-medium">{awsEnabled ? "Enabled" : "Disabled"}</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Services selected</p>
              <div className="flex flex-wrap gap-2">
                {selectedServices.length > 0 ? selectedServices.map((service) => (
                  <ServiceChip
                    key={service}
                    label={service === "Other" && serviceTypeOther.trim() ? `Other: ${serviceTypeOther.trim()}` : service}
                  />
                )) : <span className="text-sm text-muted-foreground">No services selected</span>}
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl border p-4 text-sm md:grid-cols-2">
              <div>
                <p className="text-muted-foreground">AWS margin</p>
                <p className="font-semibold">{awsEnabled ? `${awsMarginPercentage}%` : "Disabled"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Txn preview</p>
                <p className="font-semibold">{txnPreview.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Transaction preview</Label>
              <Input type="range" min={0} max={50000000} step={100000} value={txnPreview} onChange={(e) => setTxnPreview(Number(e.target.value))} className="accent-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function InvoiceManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { toast } = useToast();
  const clientId = params.id;
  const isCreateRoute = location.pathname.endsWith("/new");
  const isEditRoute = location.pathname.endsWith("/edit");
  const isOverviewRoute = Boolean(clientId) && !isEditRoute;

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsHydrated, setClientsHydrated] = useState(false);
  const [invoices, setInvoices] = useState(INVOICES);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [pendingDeleteClient, setPendingDeleteClient] = useState<{ clientIdToDelete: string; clientName: string } | null>(null);
  const [pendingForceDeleteClient, setPendingForceDeleteClient] = useState<{ clientIdToDelete: string; clientName: string } | null>(null);
  const [pendingActivateClient, setPendingActivateClient] = useState<{ clientIdToActivate: string; clientName: string } | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceModalMode, setInvoiceModalMode] = useState<"create" | "edit">("create");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState<InvoiceRecord | null>(null);
  const [previewPayload, setPreviewPayload] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceAmountDraft, setInvoiceAmountDraft] = useState(0);
  const [pendingInvoiceAmount, setPendingInvoiceAmount] = useState(0);
  const [pendingInvoiceTxnCount, setPendingInvoiceTxnCount] = useState(0);
  const [pendingInvoiceMmcTitle, setPendingInvoiceMmcTitle] = useState("");
  const [invoiceDateDraft, setInvoiceDateDraft] = useState("");
  const [invoiceMonthDraft, setInvoiceMonthDraft] = useState("");
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [invoiceNumberConflictOpen, setInvoiceNumberConflictOpen] = useState(false);
  const [invoiceNumberAvailability, setInvoiceNumberAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const [invoiceSerialConfig, setInvoiceSerialConfig] = useState<InvoiceSerialConfig>(() => {
    try {
      const raw = localStorage.getItem(INVOICE_SERIAL_CONFIG_KEY);
      return raw ? { ...DEFAULT_INVOICE_SERIAL_CONFIG, ...JSON.parse(raw) } : DEFAULT_INVOICE_SERIAL_CONFIG;
    } catch {
      return DEFAULT_INVOICE_SERIAL_CONFIG;
    }
  });
  const [invoiceSerialState, setInvoiceSerialState] = useState<InvoiceSerialState>(() => {
    try {
      const raw = localStorage.getItem(INVOICE_SERIAL_STATE_KEY);
      return raw
        ? { ...JSON.parse(raw), serial: Number(JSON.parse(raw).serial || 0) }
        : { financialYear: getFinancialYearLabel(getIstNow(), DEFAULT_INVOICE_SERIAL_CONFIG.financialYearStartMonth), serial: 0, lastIssuedAt: new Date().toISOString() };
    } catch {
      return { financialYear: getFinancialYearLabel(getIstNow(), DEFAULT_INVOICE_SERIAL_CONFIG.financialYearStartMonth), serial: 0, lastIssuedAt: new Date().toISOString() };
    }
  });
  const [prefixSerialConfigs, setPrefixSerialConfigs] = useState<Record<string, PrefixSerialConfig>>(() => {
    try {
      const raw = localStorage.getItem(INVOICE_PREFIX_SERIAL_CONFIGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [selectedSerialPrefix, setSelectedSerialPrefix] = useState<string>(DEFAULT_INVOICE_SERIAL_CONFIG.prefix);
  const [isSavingInvoiceSerialConfig, setIsSavingInvoiceSerialConfig] = useState(false);
  const [isSavingMylapayConfig, setIsSavingMylapayConfig] = useState(false);

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => {
    try {
      const raw = localStorage.getItem(COMPANY_CONFIG_KEY);
      return raw ? { ...DEFAULT_COMPANY_CONFIG, ...JSON.parse(raw) } : DEFAULT_COMPANY_CONFIG;
    } catch {
      return DEFAULT_COMPANY_CONFIG;
    }
  });

  const [taxConfig, setTaxConfig] = useState<TaxConfig>(() => {
    try {
      const raw = localStorage.getItem(TAX_CONFIG_KEY);
      return raw ? withDefaultTaxHsn(JSON.parse(raw)) : DEFAULT_TAX_CONFIG;
    } catch {
      return DEFAULT_TAX_CONFIG;
    }
  });

  const [mainTab, setMainTab] = useState<"clients" | "tracker">("clients");
  const [showExportInvoicesModal, setShowExportInvoicesModal] = useState(false);
  const [exportMonth, setExportMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [exportYear, setExportYear] = useState(String(new Date().getFullYear()));

  const [currencyConfig, setCurrencyConfig] = useState<CurrencyConfig>(() => {
    try {
      const raw = localStorage.getItem(CURRENCY_CONFIG_KEY);
      return raw ? { ...DEFAULT_CURRENCY_CONFIG, ...JSON.parse(raw) } : DEFAULT_CURRENCY_CONFIG;
    } catch {
      return DEFAULT_CURRENCY_CONFIG;
    }
  });

  const [activeConfigTab, setActiveConfigTab] = useState<"company" | "tax" | "currency">("company");
  const [settingsViewOpen, setSettingsViewOpen] = useState(false);
  const [clientConfigTab, setClientConfigTab] = useState<"active" | "history">("active");

  const [configChangeRequests, setConfigChangeRequests] = useState<ConfigChangeRequest[]>(() => {
    try {
      const raw = localStorage.getItem(CONFIG_CHANGE_REQUESTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(() => {
    try {
      const raw = localStorage.getItem(CONFIG_AUDIT_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const { user } = useAuth();
  const currentUser = user?.email || "admin@mylapay.com";
  const isAdmin = user?.role === "admin";
  const isFinanceDeptAdmin =
    user?.department_admin === true && String(user?.admin_for_department || "").toLowerCase() === "finance";
  const canManageInvoiceApprovalActions = isAdmin || isFinanceDeptAdmin;
  const canManageClientConfigActions = isAdmin;

  useEffect(() => {
    try {
      localStorage.setItem(INVOICE_SERIAL_CONFIG_KEY, JSON.stringify(invoiceSerialConfig));
    } catch {}
  }, [invoiceSerialConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(INVOICE_SERIAL_STATE_KEY, JSON.stringify(invoiceSerialState));
    } catch {}
  }, [invoiceSerialState]);

  useEffect(() => {
    try {
      localStorage.setItem(INVOICE_PREFIX_SERIAL_CONFIGS_KEY, JSON.stringify(prefixSerialConfigs));
    } catch {}
  }, [prefixSerialConfigs]);

  useEffect(() => {
    try {
      localStorage.setItem(COMPANY_CONFIG_KEY, JSON.stringify(companyConfig));
    } catch {}
  }, [companyConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(TAX_CONFIG_KEY, JSON.stringify(taxConfig));
    } catch {}
  }, [taxConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_CONFIG_KEY, JSON.stringify(currencyConfig));
    } catch {}
  }, [currencyConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_CHANGE_REQUESTS_KEY, JSON.stringify(configChangeRequests));
    } catch {}
  }, [configChangeRequests]);

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_AUDIT_LOG_KEY, JSON.stringify(auditLog));
    } catch {}
  }, [auditLog]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/invoice-management/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const invoiceSerialSettings = data["invoice-serial-config"];
        if (invoiceSerialSettings?.invoiceSerialConfig) {
          setInvoiceSerialConfig((prev) => ({ ...prev, ...invoiceSerialSettings.invoiceSerialConfig }));
        }
        if (invoiceSerialSettings?.prefixSerialConfigs) {
          setPrefixSerialConfigs(invoiceSerialSettings.prefixSerialConfigs);
          const savedPrefix = normalizeInlineText(invoiceSerialSettings.invoiceSerialConfig?.prefix || "").toUpperCase();
          if (savedPrefix) setSelectedSerialPrefix(savedPrefix);
        }
        const mylapaySettings = data["mylapay-configuration"];
        if (mylapaySettings?.companyConfig) {
          setCompanyConfig((prev) => ({ ...prev, ...mylapaySettings.companyConfig }));
        }
        if (mylapaySettings?.taxConfig) {
          setTaxConfig((prev) => withDefaultTaxHsn({ ...prev, ...mylapaySettings.taxConfig }));
        }
        if (mylapaySettings?.currencyConfig) {
          setCurrencyConfig((prev) => ({ ...prev, ...mylapaySettings.currencyConfig }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load all clients from database on component mount
  useEffect(() => {
    console.log("[InvoiceManagement] Loading clients from database...");
    fetch("/api/invoice-management/clients")
      .then(res => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        console.log("[InvoiceManagement] Fetched clients from DB:", data);
        if (Array.isArray(data)) {
          const dbClients: ClientRecord[] = data.map((client: any) => mergeClientOverviewCache({
            id: client.clientId,
            clientId: client.clientId,
            code: client.code,
            name: client.name,
            status: client.status,
            priority: client.priority,
            services: client.services || [],
            serviceOptions: client.serviceOptions || client.services || [],
            fixedBilling: client.fixedBilling || 0,
            monthlyInvoiceEstimate: client.monthlyInvoiceEstimate || 0,
            monthlyTransactionVolume: client.monthlyTransactionVolume || 0,
            variableRevenueGenerated: client.variableRevenueGenerated || 0,
            awsInfraRecovery: client.awsInfraRecovery || 0,
            reconRevenue: client.reconRevenue || 0,
            profitabilityRevenue: client.profitabilityRevenue || 0,
            minimumGuarantee: client.minimumGuarantee || 0,
            additionalPlatformFee: client.additionalPlatformFee || 0,
            integrationFee: client.integrationFee || 0,
            billingCycle: client.billingCycle,
            lastInvoiceGenerated: client.lastInvoiceGenerated,
            logo: client.logo,
            logoClass: client.logoClass,
            color: client.color,
            transactionSlabs: client.transactionSlabs || [],
            aws: client.aws || { enabled: false, vendorCost: 0, marginPercentage: 0 },
            notes: client.notes,
            invoiceHistory: Array.isArray(client.invoiceHistory)
              ? client.invoiceHistory.map((invoice: any) => ({ ...invoice, status: normalizeInvoiceStatus(invoice.status) }))
              : [],
            gstin: client.gstin,
            lutNumber: client.lutNumber,
            billingAddress: client.billingAddress,
            billingEmail: client.billingEmail,
            signatoryName: client.signatoryName,
            signatoryImage: client.signatoryImage,
            clientType: client.clientType || "Domestic",
            currency: client.currency || "INR",
            billingModel: client.billingModel || "transaction",
            billingYear: client.billingYear || 1,
            setupFee: client.setupFee || 0,
            setupFeePaid: client.setupFeePaid || 0,
            mmcYear1: client.mmcYear1 || 0,
            mmcYear2: client.mmcYear2 || 0,
            mmcYear3: client.mmcYear3 || 0,
            transactionFeeRate: client.transactionFeeRate || 0,
            vapMipConnectivityFee: client.vapMipConnectivityFee || 0,
            changeManagementFeeRate: client.changeManagementFeeRate || 0,
            changeManagementManDays: client.changeManagementManDays || 0,
            networkCertificationNote: client.networkCertificationNote || "",
            infraCostNote: client.infraCostNote || "",
            customInvoiceRows: client.customInvoiceRows || [],
            invoiceTableConfig: client.invoiceTableConfig || [],
            invoicePrefix: client.invoicePrefix || "",
            invoiceCurrentSerial: Number(client.invoiceCurrentSerial || 0),
            mmcInvoiceTitle: client.mmcInvoiceTitle || "",
          }));
          console.log("[InvoiceManagement] Mapped clients:", dbClients);
          setClients(dbClients);

          // Load invoice history for each client so dashboard + overview use real API data
          Promise.all(
            dbClients.map(async (client) => {
              try {
                const res = await fetch(`/api/invoice-management/invoices/${client.clientId}`);
                if (!res.ok) return client;
                const invoiceHistory = await res.json();
                return {
          ...client,
          invoiceHistory: Array.isArray(invoiceHistory)
            ? invoiceHistory.map((invoice: any) => ({ ...invoice, status: normalizeInvoiceStatus(invoice.status) }))
            : [],
        };
              } catch (err) {
                console.warn("[InvoiceManagement] Failed to load invoices for client:", client.clientId, err);
                return client;
              }
            })
          ).then((clientsWithHistory) => {
            console.log("[InvoiceManagement] Clients with invoice history:", clientsWithHistory);
            setClients(clientsWithHistory);
            setClientsHydrated(true);
          });
        } else {
          console.warn("[InvoiceManagement] API did not return an array");
        }
      })
      .catch(err => {
        console.error("[InvoiceManagement] Failed to load clients from database:", err);
        setClientsHydrated(true);
        toast({
          title: "Warning",
          description: "Could not load clients from database. Please refresh the page.",
        });
      });
  }, [toast]);

  const selectedClient = useMemo(() => {
    const routeId = String(clientId || "").toLowerCase();
    const found = clients.find((item) =>
      String(item.id) === String(clientId) ||
      String(item.clientId || "").toLowerCase() === routeId ||
      String(item.code || "").toLowerCase() === routeId,
    );
    console.log("[Invoice] selectedClient useMemo - clientId:", clientId, "found:", found, "all clients:", clients);
    return found || clients[0];
  }, [clients, clientId]);
  const editingClient = useMemo(() => {
    const routeId = String(editingClientId || clientId || "").toLowerCase();
    const found = clients.find((item) =>
      String(item.id) === String(editingClientId || clientId) ||
      String(item.clientId || "").toLowerCase() === routeId ||
      String(item.code || "").toLowerCase() === routeId,
    );
    if (!found) return undefined;

    const invoicePrefix = normalizeInlineText(found.invoicePrefix);
    if (!invoicePrefix) return found;

    const prefixKey = invoicePrefix.toUpperCase();
    const configuredSerial = prefixSerialConfigs[prefixKey]?.currentSerial;

    return {
      ...found,
      invoiceCurrentSerial: Number(
        typeof configuredSerial === "number"
          ? configuredSerial
          : getSharedInvoiceSerialCurrent(
              clients,
              invoicePrefix,
              getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth),
            ),
      ),
    };
  }, [clients, editingClientId, clientId, invoiceSerialConfig.financialYearStartMonth, prefixSerialConfigs]);

  const invoicePrefixOptions = useMemo(() => {
    const values = new Set<string>();
    const defaultPrefix = normalizeInlineText(invoiceSerialConfig.prefix).toUpperCase();
    if (defaultPrefix) values.add(defaultPrefix);
    Object.keys(prefixSerialConfigs).forEach((prefix) => {
      if (normalizeInlineText(prefix)) values.add(normalizeInlineText(prefix).toUpperCase());
    });
    clients.forEach((client) => {
      const prefix = normalizeInlineText(client.invoicePrefix).toUpperCase();
      if (prefix) values.add(prefix);
    });
    return Array.from(values).sort();
  }, [clients, invoiceSerialConfig.prefix, prefixSerialConfigs]);

  useEffect(() => {
    const normalizedSelected = normalizeInlineText(selectedSerialPrefix).toUpperCase();
    if (invoicePrefixOptions.length === 0) return;
    if (!normalizedSelected || !invoicePrefixOptions.includes(normalizedSelected)) {
      const nextPrefix = invoicePrefixOptions[0];
      setSelectedSerialPrefix(nextPrefix);
      setInvoiceSerialConfig((prev) => ({ ...prev, prefix: nextPrefix }));
    }
  }, [invoicePrefixOptions, selectedSerialPrefix]);

  const selectedPrefixKey = normalizeInlineText(selectedSerialPrefix || invoiceSerialConfig.prefix).toUpperCase();
  const selectedPrefixDefaultPeriod = getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth);
  const selectedPrefixSettings = (() => {
    const config = prefixSerialConfigs[selectedPrefixKey];
    return {
      currentSerial: config?.currentSerial || formatInvoiceSerial(getSharedInvoiceSerialCurrent(clients, selectedPrefixKey, selectedPrefixDefaultPeriod), 4),
      period: config?.period || selectedPrefixDefaultPeriod,
      applyPeriodToAllPrefixes: Boolean(config?.applyPeriodToAllPrefixes),
    };
  })();

  useEffect(() => {
    if (invoicePrefixOptions.length === 0) return;
    setPrefixSerialConfigs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const prefix of invoicePrefixOptions) {
        const normalizedPrefix = normalizeInlineText(prefix).toUpperCase();
        if (!normalizedPrefix) continue;
        const currentSerial = Math.max(
          ...clients
            .filter((client) => normalizeInlineText(client.invoicePrefix).toUpperCase() === normalizedPrefix)
            .map((client) => Number(client.invoiceCurrentSerial || 0)),
          0,
        );
        const existing = next[normalizedPrefix];
        if (!existing) {
          next[normalizedPrefix] = {
            currentSerial,
            period: selectedPrefixDefaultPeriod,
            applyPeriodToAllPrefixes: false,
          };
          changed = true;
          continue;
        }
        if (currentSerial > Number(existing.currentSerial || 0)) {
          next[normalizedPrefix] = { ...existing, currentSerial };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [clients, invoicePrefixOptions, selectedPrefixDefaultPeriod]);

  const updateSelectedPrefixSettings = (updater: (current: PrefixSerialConfig) => PrefixSerialConfig) => {
    const prefixKey = selectedPrefixKey || normalizeInlineText(invoiceSerialConfig.prefix).toUpperCase();
    if (!prefixKey) return;
    setPrefixSerialConfigs((prev) => {
      const current = prev[prefixKey] || {
        currentSerial: prefixSerialConfigs[prefixKey]?.currentSerial || formatInvoiceSerial(
          getSharedInvoiceSerialCurrent(clients, prefixKey, selectedPrefixDefaultPeriod),
          4,
        ),
        period: selectedPrefixDefaultPeriod,
        applyPeriodToAllPrefixes: false,
      };
      const nextCurrent = updater(current);
      const next = { ...prev, [prefixKey]: nextCurrent };
      if (nextCurrent.applyPeriodToAllPrefixes) {
        Object.keys(next).forEach((key) => {
          next[key] = { ...next[key], period: nextCurrent.period };
        });
      }
      return next;
    });
  };

  const invoiceNumberPreview = useMemo(
    () => buildInvoiceNumber(
      { ...invoiceSerialConfig, prefix: selectedPrefixKey || invoiceSerialConfig.prefix },
      selectedPrefixSettings.period || selectedPrefixDefaultPeriod,
      Number(selectedPrefixSettings.currentSerial || 0) + 1,
    ),
    [invoiceSerialConfig, selectedPrefixKey, selectedPrefixSettings.period, selectedPrefixSettings.currentSerial, selectedPrefixDefaultPeriod],
  );

  const modalPrefixKey = normalizeInlineText(selectedClient?.invoicePrefix || invoiceSerialConfig.prefix).toUpperCase();
  const modalPrefixSettings = (() => {
    const config = prefixSerialConfigs[modalPrefixKey];
    const currentSerial = Math.max(
      Number(config?.currentSerial || 0),
      Number(selectedClient?.invoiceCurrentSerial || 0),
      getSharedInvoiceSerialCurrent(clients, modalPrefixKey, selectedPrefixDefaultPeriod),
    );
    return {
      currentSerial,
      period: config?.period || selectedPrefixDefaultPeriod,
    };
  })();
  const modalInvoicePreview = buildInvoiceNumber(
    {
      ...invoiceSerialConfig,
      prefix: modalPrefixKey || invoiceSerialConfig.prefix,
      format: getPreferredInvoiceNumberFormat(
        invoiceModalMode === "edit"
          ? selectedInvoice?.invoiceNumber
          : getInvoiceDisplayNumber((selectedClient?.invoiceHistory || [])[0]),
        invoiceSerialConfig.format,
      ),
    },
    modalPrefixSettings.period || selectedPrefixDefaultPeriod,
    Number(modalPrefixSettings.currentSerial || 0) + 1,
  );
  const invoiceNumberDraftValue = normalizeInlineText(invoiceNumberDraft || modalInvoicePreview);
  const invoiceNumberConflict = useMemo(
    () => (invoiceModalMode === "edit" ? null : findInvoiceByNumber(invoiceNumberDraftValue, selectedInvoice?.invoiceId)),
    [invoiceModalMode, invoiceNumberDraftValue, selectedInvoice?.invoiceId, invoices, clients],
  );
  const invoiceNumberIsUnavailable = invoiceModalMode !== "edit" && (invoiceNumberAvailability?.available === false || Boolean(invoiceNumberConflict));

  const openInvoiceCreateModal = (client: ClientRecord, amountOverride?: number, txnCountOverride?: number, mmcInvoiceTitleOverride?: string) => {
    console.log("[Invoice] openInvoiceCreateModal - Opening for client:", client?.name, client, { amountOverride, txnCountOverride });

    if (!client) {
      console.error("[Invoice] openInvoiceCreateModal - No client provided");
      toast({ title: "Error", description: "Client not found", variant: "destructive" });
      return;
    }

    try {
      setInvoiceModalMode("create");
      setSelectedInvoice(null);

      // Prefer the live amount from the overview screen (uses current txnInput slider/input)
      // Fall back to estimate from stored monthlyTransactionVolume only when no override provided.
      const effectiveTxnCount =
        typeof txnCountOverride === "number" && txnCountOverride > 0
          ? txnCountOverride
          : client.monthlyTransactionVolume || 0;
      const estimated =
        typeof amountOverride === "number" && amountOverride > 0
          ? Math.round(amountOverride)
          : Math.round(estimateInvoiceFromSlabs(client, effectiveTxnCount));

      console.log("[Invoice] openInvoiceCreateModal - Estimated amount:", estimated);
      const defaultInvoiceDate = new Date().toISOString().split("T")[0];
      setInvoiceAmountDraft(estimated);
      setPendingInvoiceAmount(estimated);
      setPendingInvoiceTxnCount(effectiveTxnCount);
      setInvoiceDateDraft(defaultInvoiceDate);
      setInvoiceMonthDraft(new Date(defaultInvoiceDate).toLocaleString("en-IN", { month: "short", year: "numeric" }));
      const initialInvoiceNumber = buildInvoiceNumber(
        {
          ...invoiceSerialConfig,
          prefix: modalPrefixKey || invoiceSerialConfig.prefix,
          format: getPreferredInvoiceNumberFormat(getInvoiceDisplayNumber(client.invoiceHistory?.[0]), invoiceSerialConfig.format),
        },
        selectedPrefixSettings.period || selectedPrefixDefaultPeriod,
        Number(selectedPrefixSettings.currentSerial || 0) + 1,
      );
      setPendingInvoiceMmcTitle(normalizeInlineText(mmcInvoiceTitleOverride || client.mmcInvoiceTitle || ""));
      setInvoiceNumberDraft(initialInvoiceNumber);
      setInvoiceNumberAvailability(null);
      setInvoiceNumberConflictOpen(false);
      setInvoiceModalOpen(true);
      console.log("[Invoice] openInvoiceCreateModal - Modal opened");
    } catch (error) {
      console.error("[Invoice] openInvoiceCreateModal - Error:", error);
      toast({ title: "Error", description: "Failed to open invoice creation modal", variant: "destructive" });
    }
  };

  const openInvoiceEditModal = (invoice: InvoiceRecord) => {
    if (!isInvoiceEditable(invoice.status)) {
      toast({ title: "Invoice locked", description: "Approve the invoice first before editing it." });
      return;
    }
    const matchedClient = clients.find((item) => item.name === invoice.client) || selectedClient;
    setInvoiceModalMode("edit");
    setSelectedInvoice(invoice);
    setInvoiceAmountDraft(Number(invoice.amount || matchedClient?.monthlyInvoiceEstimate || 0));
    setInvoiceDateDraft(invoice.generatedDate || new Date().toISOString().split("T")[0]);
    setInvoiceMonthDraft(invoice.month);
    setInvoiceNumberDraft(getInvoiceDisplayNumber(invoice));
    setInvoiceNumberAvailability(null);
    setInvoiceNumberConflictOpen(false);
    setInvoiceModalOpen(true);
  };

  useEffect(() => {
    if (isCreateRoute) {
      setEditingClientId(null);
      setInvoiceModalOpen(false);
    }
  }, [isCreateRoute]);

  useLayoutEffect(() => {
    if (isOverviewRoute && selectedClient) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [isOverviewRoute, selectedClient?.id, location.pathname]);

  // Fetch client data from database when editing or viewing a specific client
  useEffect(() => {
    console.log("[Invoice] useEffect - Checking conditions:", { isEditRoute, isOverviewRoute, clientId, pathEndsWith: location.pathname });
    if ((isEditRoute || isOverviewRoute) && clientId && clientId !== "new") {
      console.log("[Invoice] Fetching client from database - clientId:", clientId, "isEditRoute:", isEditRoute, "isOverviewRoute:", isOverviewRoute);
      fetch(`/api/invoice-management/clients/${clientId}`)
        .then(res => {
          console.log("[Invoice] Fetch response status:", res.status);
          return res.json();
        })
        .then(data => {
          console.log("[Invoice] Fetched client data:", data);
          // Update the local client record with the decrypted data from database
          setClients(prev => {
            const exists = prev.some(c => c.id === data.clientId || c.id === data.id);
            const updatedClient: ClientRecord = mergeClientOverviewCache({
              id: data.id || data.clientId,
              clientId: data.clientId,
              code: data.code || data.clientCode,
              name: data.name || data.clientName,
              status: data.status,
              priority: data.priority,
              services: data.services || [],
              serviceOptions: data.serviceOptions || data.services || [],
              serviceTypeOther: data.serviceTypeOther || "",
              fixedBilling: data.fixedBilling || 0,
              monthlyInvoiceEstimate: data.monthlyInvoiceEstimate || 0,
              monthlyTransactionVolume: data.monthlyTransactionVolume || 0,
              variableRevenueGenerated: data.variableRevenueGenerated || 0,
              awsInfraRecovery: data.awsInfraRecovery || 0,
              reconRevenue: data.reconRevenue || 0,
              profitabilityRevenue: data.profitabilityRevenue || 0,
              minimumGuarantee: data.minimumGuarantee || 0,
              additionalPlatformFee: data.additionalPlatformFee || 0,
              integrationFee: data.integrationFee || 0,
              billingCycle: data.billingCycle,
              lastInvoiceGenerated: data.lastInvoiceGenerated,
              logo: data.logo,
              logoClass: data.logoClass,
              color: data.color,
              invoicePrefix: data.invoicePrefix,
              invoiceCurrentSerial: Number(data.invoiceCurrentSerial || 0),
              mmcInvoiceTitle: data.mmcInvoiceTitle || "",
              transactionSlabs: data.transactionSlabs || [],
              aws: data.aws || { enabled: false, vendorCost: 0, marginPercentage: 0 },
              notes: data.notes,
              invoiceHistory: Array.isArray(data.invoiceHistory)
                ? data.invoiceHistory.map((invoice: any) => ({ ...invoice, status: normalizeInvoiceStatus(invoice.status) }))
                : [],
              gstin: data.gstin,
              lutNumber: data.lutNumber,
              billingAddress: data.billingAddress,
              billingEmail: data.billingEmail,
              signatoryName: data.signatoryName,
              clientType: data.clientType || "Domestic",
              currency: data.currency || "INR",
              billingModel: data.billingModel || "transaction",
              billingYear: data.billingYear || 1,
              setupFee: data.setupFee || 0,
              setupFeePaid: data.setupFeePaid || 0,
              mmcYear1: data.mmcYear1 || 0,
              mmcYear2: data.mmcYear2 || 0,
              mmcYear3: data.mmcYear3 || 0,
              transactionFeeRate: data.transactionFeeRate || 0,
              vapMipConnectivityFee: data.vapMipConnectivityFee || 0,
              changeManagementFeeRate: data.changeManagementFeeRate || 0,
              changeManagementManDays: data.changeManagementManDays || 0,
              networkCertificationNote: data.networkCertificationNote || "",
              infraCostNote: data.infraCostNote || "",
              customInvoiceRows: data.customInvoiceRows || [],
              invoiceTableConfig: data.invoiceTableConfig || [],
            } as ClientRecord);
            console.log("[Invoice] Updated client object:", updatedClient);
            return exists ? prev.map(c => (c.id === data.id || c.id === data.clientId) ? updatedClient : c) : [updatedClient, ...prev];
          });

          console.log("[Invoice] Fetching invoice history directly for clientId:", clientId);
          return fetch(`/api/invoice-management/invoices/${clientId}`)
            .then(res => {
              console.log("[Invoice] Invoice history fetch status:", res.status);
              if (!res.ok) throw new Error(`Invoice history API error: ${res.status}`);
              return res.json();
            })
            .then((invoiceHistory) => {
              console.log("[Invoice] Invoice history fetched:", invoiceHistory);
              setClients(prev => prev.map((c) =>
                (c.clientId === clientId || c.id === clientId)
                  ? {
                      ...c,
                      invoiceHistory: Array.isArray(invoiceHistory)
                        ? invoiceHistory.map((invoice: any) => ({ ...invoice, status: normalizeInvoiceStatus(invoice.status) }))
                        : [],
                    }
                  : c
              ));
            });
        })
        .catch(err => {
          console.error("[Invoice] Failed to fetch client or invoice history from database:", err);
          toast({
            title: "Warning",
            description: "Could not load client invoice data from database",
            variant: "destructive",
          });
        });
    }
  }, [isEditRoute, isOverviewRoute, clientId, toast]);

  const activeConfigClients = useMemo(() => clients.filter((client) => normalizeInlineText(client.status).toLowerCase() !== "inactive"), [clients]);
  const inactiveConfigClients = useMemo(() => clients.filter((client) => normalizeInlineText(client.status).toLowerCase() === "inactive"), [clients]);
  const visibleConfigClients = clientConfigTab === "history" ? inactiveConfigClients : activeConfigClients;
  const filteredClients = useMemo(() => {
    return visibleConfigClients.filter((client) => {
      const hasIdentity = String(client.name || "").trim().length > 0 || String(client.code || "").trim().length > 0;
      const matchesSearch =
        search.trim().length === 0 ||
        client.name.toLowerCase().includes(search.toLowerCase()) ||
        client.code.toLowerCase().includes(search.toLowerCase());
      const matchesService =
        serviceFilter === "all" || client.services.some((service) => service === serviceFilter);
      return hasIdentity && matchesSearch && matchesService;
    });
  }, [visibleConfigClients, search, serviceFilter]);

  // Build aggregated invoice list from all clients' invoice history
  const allInvoicesFromClients = useMemo(() => {
    const allInvoices: (InvoiceRecord & { client: string; clientId?: string })[] = [];
    clients.forEach((client) => {
      if (client.invoiceHistory && Array.isArray(client.invoiceHistory)) {
        client.invoiceHistory.forEach((inv) => {
          allInvoices.push({
            ...inv,
            status: normalizeInvoiceStatus(inv.status),
            client: client.name,
            clientId: client.clientId || client.id,
          });
        });
      }
    });
    return allInvoices.sort((a, b) => parseInvoiceDateValue(b.createdAt || b.generatedDate) - parseInvoiceDateValue(a.createdAt || a.generatedDate));
  }, [clients]);

  const dashboardAnalytics = useMemo(() => {
    const monthlyMap = new Map<string, { sortKey: number; month: string; approvedWithoutGst: number; pendingWithoutGst: number; approvedCount: number; pendingCount: number }>();

    allInvoicesFromClients.forEach((invoice) => {
      const rawDate = invoice.generatedDate || invoice.month || "";
      const date = new Date(`${String(rawDate).includes("T") ? rawDate : `${rawDate}T00:00:00Z`}`);
      const sortKey = Number.isNaN(date.getTime()) ? 0 : date.getTime();
      const month = Number.isNaN(date.getTime())
        ? normalizeInlineText(invoice.month || rawDate)
        : date.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
      const key = Number.isNaN(date.getTime()) ? month : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const current = monthlyMap.get(key) || { sortKey, month, approvedWithoutGst: 0, pendingWithoutGst: 0, approvedCount: 0, pendingCount: 0 };
      const amount = Number(invoice.amount || 0);
      const status = normalizeInvoiceStatus(invoice.status);
      current.sortKey = Math.max(current.sortKey, sortKey);
      current.month = month;
      if (isApprovedInvoiceStatus(status)) {
        current.approvedWithoutGst += amount;
        current.approvedCount += 1;
      } else {
        current.pendingWithoutGst += amount;
        current.pendingCount += 1;
      }
      monthlyMap.set(key, current);
    });

    const monthlySeries = Array.from(monthlyMap.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-6);

    const serviceCounts = clientsHydrated
      ? SERVICE_OPTIONS.map((service) => ({
          category: service,
          value: clients.reduce((sum, client) => sum + (client.services.includes(service) ? 1 : 0), 0),
        })).filter((item) => item.value > 0)
      : [];

    return {
      revenueTrend: monthlySeries.map((entry) => ({
        month: entry.month,
        received: Math.round(entry.approvedWithoutGst * 1.18),
        pending: entry.pendingWithoutGst,
      })),
      invoiceVolume: monthlySeries.map((entry) => ({
        month: entry.month,
        value: entry.approvedCount,
      })),
      serviceCategory: serviceCounts,
      revenueSpark: monthlySeries.map((entry) => Math.round((entry.approvedWithoutGst + entry.pendingWithoutGst) / 1000)),
      invoiceSpark: monthlySeries.map((entry) => entry.approvedCount),
    };
  }, [allInvoicesFromClients, clients]);

  const hasInvoiceData = clientsHydrated && allInvoicesFromClients.length > 0;
  const metrics = useMemo(() => {
    const approvedInvoices = allInvoicesFromClients.filter((invoice) => isApprovedInvoiceStatus(invoice.status));
    const approvedInvoiceAmountWithoutGst = approvedInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const approvedInvoiceAmountWithGst = approvedInvoices.reduce((sum, invoice) => sum + Math.round(Number(invoice.amount || 0) * 1.18), 0);
    const pendingInvoices = allInvoicesFromClients.filter((invoice) => !isApprovedInvoiceStatus(invoice.status)).length;
    const monthlyBillingClients = clients.filter((client) => normalizeInlineText(client.billingCycle).toLowerCase() === "monthly" && normalizeInlineText(client.status).toLowerCase() !== "inactive");
    const billingMonthDate = getIstNow();
    billingMonthDate.setUTCMonth(billingMonthDate.getUTCMonth() - 1);
    const billingMonthLabel = billingMonthDate.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
    const billingMonthKey = billingMonthLabel.toLowerCase();
    const generatedClientsForBillingMonth = new Set(
      allInvoicesFromClients
        .filter((invoice) => {
          if (normalizeInlineText(invoice.invoiceType).toLowerCase() === "setup_fee") return false;
          const invoiceClientId = String(invoice.clientId || invoice.client || "");
          const isMonthlyClient = monthlyBillingClients.some((client) => String(client.clientId || client.id || client.name || "") === invoiceClientId || String(client.name || "") === String(invoice.client || ""));
          if (!isMonthlyClient) return false;
          const invoiceBillingLabel = normalizeInlineText(invoice.month).toLowerCase() || (
            invoice.generatedDate
              ? new Date(`${String(invoice.generatedDate).includes("T") ? invoice.generatedDate : `${invoice.generatedDate}T00:00:00Z`}`)
                  .toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
                  .toLowerCase()
              : ""
          );
          return invoiceBillingLabel === billingMonthKey;
        })
        .map((invoice) => String(invoice.clientId || invoice.client || "")),
    );
    const generatedThisMonth = generatedClientsForBillingMonth.size;
    const totalNeedToGenerate = monthlyBillingClients.length;
    const pendingNeedToGenerate = Math.max(totalNeedToGenerate - generatedThisMonth, 0);
    const transactionVolume = clients.reduce((sum, client) => sum + client.monthlyTransactionVolume, 0);
    const variableRevenue = clients.reduce((sum, client) => sum + client.variableRevenueGenerated, 0);
    const awsRecovery = clients.reduce((sum, client) => sum + client.awsInfraRecovery, 0);
    const reconRevenue = clients.reduce((sum, client) => sum + client.reconRevenue, 0);
    const profitabilityRevenue = clients.reduce((sum, client) => sum + client.profitabilityRevenue, 0);
    const highPriorityClients = clients.filter((client) => getPriorityForScoring(client) === "Critical" || getPriorityForScoring(client) === "High").length;
    return {
      totalRevenue: approvedInvoiceAmountWithGst,
      monthlyInvoiceValue: approvedInvoiceAmountWithoutGst,
      approvedInvoiceCount: approvedInvoices.length,
      activeClients: monthlyBillingClients.length,
      pendingInvoices,
      totalNeedToGenerate,
      generatedThisMonth,
      pendingNeedToGenerate,
      currentMonthLabel: billingMonthLabel,
      transactionVolume,
      variableRevenue,
      highPriorityClients,
      awsRecovery,
      reconRevenue,
      profitabilityRevenue,
      revenueSpark: dashboardAnalytics.revenueSpark,
      invoiceSpark: dashboardAnalytics.invoiceSpark,
    };
  }, [clients, allInvoicesFromClients, dashboardAnalytics]);

  const pieData = useMemo(() => {
    if (!clientsHydrated) return [];
    const approvedByClient = new Map<string, number>();
    allInvoicesFromClients.forEach((invoice) => {
      if (!isApprovedInvoiceStatus(invoice.status)) return;
      const key = invoice.client || "Unknown";
      approvedByClient.set(key, (approvedByClient.get(key) || 0) + Number(invoice.amount || 0));
    });
    return Array.from(approvedByClient.entries())
      .map(([name, value]) => ({ name, value: Math.round(value / 1000) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [allInvoicesFromClients, clientsHydrated]);

  const exportClientsCsv = (targetClients = filteredClients) => {
    const rows = targetClients.map((client) => ({
      Client: client.name,
      Code: client.code,
      Status: client.status,
      Priority: getPriorityForScoring(client),
      Services: client.services.join(" | "),
      "Fixed Billing": client.fixedBilling,
      "Monthly Invoice Estimate": client.monthlyInvoiceEstimate,
      "Monthly Transaction Volume": client.monthlyTransactionVolume,
      "Last Invoice Generated": client.lastInvoiceGenerated,
    }));
    const csv = toCsv(rows);
    downloadTextFile(
      `invoice-management-clients-${new Date().toISOString().split("T")[0]}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
    toast({ title: "CSV exported", description: `${rows.length} client rows downloaded.` });
  };

  const exportClientPdf = async (
    client = selectedClient,
    amountOverride?: number,
    txnCountOverride?: number,
    rowsOverride?: OverviewInvoiceRow[],
  ) => {
    if (!client) return;
    try {
      const latestInvoice = (client.invoiceHistory || [])[0];
      const serialInfo = latestInvoice
        ? {
            invoiceNumber: getInvoiceDisplayNumber(latestInvoice),
            financialYear: latestInvoice.financialYear || getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth),
            serial: Number(latestInvoice.serial || 0),
          }
        : getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState, clients, prefixSerialConfigs, selectedSerialPrefix || client.invoicePrefix || invoiceSerialConfig.prefix);
      const exportAmount =
        typeof amountOverride === "number" && amountOverride > 0
          ? amountOverride
          : estimateInvoiceFromSlabs(client, (typeof txnCountOverride === "number" && txnCountOverride > 0 ? txnCountOverride : client.monthlyTransactionVolume) || 0);
      const exportRows = Array.isArray(rowsOverride)
        ? rowsOverride.filter((row) => row.exportEnabled !== false)
        : undefined;
      const exportClient = exportRows
        ? {
            ...client,
            invoiceTableConfig: exportRows,
            customInvoiceRows: overviewRowsToCustomRows(exportRows),
          }
        : client;
      await downloadInvoicePdfTemplate({
        client: exportClient,
        companyConfig,
        invoiceNumber: serialInfo.invoiceNumber,
        generatedDate: latestInvoice?.generatedDate || new Date().toISOString().split("T")[0],
        amount: exportAmount,
        status: latestInvoice?.status || "Waiting for approval",
        month: latestInvoice?.month || new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }),
        financialYear: serialInfo.financialYear,
        serial: serialInfo.serial,
        taxConfig,
      });
      toast({ title: "PDF exported", description: `${client.name} overview PDF downloaded.` });
    } catch (error: any) {
      console.error("[Invoice] exportClientPdf error:", error);
      toast({ title: "Error", description: error?.message || "Failed to export PDF", variant: "destructive" });
    }
  };

  const exportClientDocx = async (client = selectedClient) => {
    if (!client) return;
    try {
      const latestInvoice = (client.invoiceHistory || [])[0];
      const serialInfo = latestInvoice
        ? {
            invoiceNumber: getInvoiceDisplayNumber(latestInvoice),
            financialYear: latestInvoice.financialYear || getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth),
            serial: Number(latestInvoice.serial || 0),
          }
        : getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState, clients, prefixSerialConfigs, selectedSerialPrefix || client.invoicePrefix || invoiceSerialConfig.prefix);
      await downloadInvoiceDocxTemplate({
        client,
        companyConfig,
        invoiceNumber: serialInfo.invoiceNumber,
        generatedDate: latestInvoice?.generatedDate || new Date().toISOString().split("T")[0],
        amount: client.monthlyInvoiceEstimate,
        status: latestInvoice?.status || "Waiting for approval",
        month: latestInvoice?.month || new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }),
        financialYear: serialInfo.financialYear,
        serial: serialInfo.serial,
        taxConfig,
      });
      toast({ title: "DOCX exported", description: `${client.name} overview DOCX downloaded.` });
    } catch (error: any) {
      console.error("[Invoice] exportClientDocx error:", error);
      toast({ title: "Error", description: error?.message || "Failed to export DOCX", variant: "destructive" });
    }
  };

  const exportGeneratedInvoicesToExcel = async (month: string, year: string) => {
    try {
      // Build date range for the selected month
      const startDate = new Date(`${year}-${String(month).padStart(2, "0")}-01`);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      const fromDate = startDate.toISOString().split("T")[0];
      const toDate = endDate.toISOString().split("T")[0];

      // GST state code → state name mapping
      const GST_STATE_MAP: Record<string, string> = {
        "01": "JAMMU & KASHMIR", "02": "HIMACHAL PRADESH", "03": "PUNJAB",
        "04": "CHANDIGARH", "05": "UTTARAKHAND", "06": "HARYANA",
        "07": "DELHI", "08": "RAJASTHAN", "09": "UTTAR PRADESH", "10": "BIHAR",
        "11": "SIKKIM", "12": "ARUNACHAL PRADESH", "13": "NAGALAND",
        "14": "MANIPUR", "15": "MIZORAM", "16": "TRIPURA", "17": "MEGHALAYA",
        "18": "ASSAM", "19": "WEST BENGAL", "20": "JHARKHAND", "21": "ODISHA",
        "22": "CHHATTISGARH", "23": "MADHYA PRADESH", "24": "GUJARAT",
        "26": "DADRA & NAGAR HAVELI", "27": "MAHARASHTRA", "28": "ANDHRA PRADESH",
        "29": "KARNATAKA", "30": "GOA", "31": "LAKSHADWEEP", "32": "KERALA",
        "33": "TAMIL NADU", "34": "PUDUCHERRY", "35": "ANDAMAN & NICOBAR ISLANDS",
        "36": "TELANGANA", "37": "ANDHRA PRADESH", "38": "LADAKH",
      };

      const getStateFromGSTIN = (gstin: string) => {
        if (!gstin || gstin.length < 2) return "";
        return GST_STATE_MAP[gstin.substring(0, 2)] || "";
      };

      const fmtDate = (d: string) => {
        if (!d) return "";
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d;
        const dd = String(dt.getDate()).padStart(2, "0");
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        return `${dd}/${mm}/${dt.getFullYear()}`;
      };

      // Parse billing address into components
      const parseAddress = (addr: string) => {
        if (!addr) return { addr1: "", addr2: "", location: "", pin: "", state: "" };
        const lines = addr.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        const pinMatch = addr.match(/\b\d{6}\b/);
        return {
          addr1: lines[0] || "",
          addr2: lines[1] || "",
          location: lines.length >= 4 ? lines[lines.length - 3] : lines[lines.length - 2] || "",
          pin: pinMatch ? pinMatch[0] : "",
          state: lines[lines.length - 1] || "",
        };
      };

      // Extract full address and pin/state from billing address
      const extractAddressComponents = (addr: string) => {
        if (!addr) return { fullAddr: "", pin: "", state: "" };
        // Extract pin (6 digits)
        const pinMatch = addr.match(/\b(\d{6})\b/);
        const pin = pinMatch ? pinMatch[1] : "";
        // Extract state (usually last word after pin)
        const lines = addr.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        const state = lines[lines.length - 1] || "";
        // Full address as-is
        return { fullAddr: addr, pin, state };
      };

      // Seller GSTIN from company config
      const sellerGSTIN = companyConfig.gstNumber || "";
      const sellerStateCode = sellerGSTIN.substring(0, 2);

      // Tax rate from taxConfig
      const hsnCode = taxConfig.invoiceHsnCode || "998314";
      const totalGstRate = taxConfig.invoiceRatePercentage || 18;
      const halfRate = totalGstRate / 2;

      // Fetch invoices for all clients
      const allInvoices: any[] = [];
      for (const client of clients) {
        const res = await fetch(`/api/invoice-management/invoices/${client.clientId}`);
        if (!res.ok) continue;
        const invoices = await res.json();
        if (Array.isArray(invoices)) {
          const filtered = invoices.filter((inv: any) => {
            const invDate = inv.generatedDate || inv.createdAt || "";
            return invDate >= fromDate && invDate <= toDate;
          });
          filtered.forEach((inv: any) => allInvoices.push({ ...inv, _client: client }));
        }
      }

      if (allInvoices.length === 0) {
        toast({
          title: "No invoices found",
          description: `No generated invoices found for ${startDate.toLocaleString("en-IN", { month: "short", year: "numeric" })}`,
        });
        return;
      }

      // Sort by invoice number
      allInvoices.sort((a, b) => (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "", undefined, { numeric: true }));

      // ── Calculate financial year serial numbers (Apr-Mar) ────────────────

      // Financial year starts in April
      const getFinancialYear = (dateStr: string) => {
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = d.getMonth(); // 0=Jan, 3=Apr, 11=Dec
        // If month >= April (3), FY is current year
        // If month < April, FY is previous year
        return month >= 3 ? year : year - 1;
      };

      // Group invoices by financial year
      const invoicesByFY: Record<number, any[]> = {};
      allInvoices.forEach((inv) => {
        const fy = getFinancialYear(inv.generatedDate || "");
        if (!invoicesByFY[fy]) invoicesByFY[fy] = [];
        invoicesByFY[fy].push(inv);
      });

      // Assign serial numbers within each FY
      const serialMap = new Map<string, number>(); // invoiceId → serial number
      Object.keys(invoicesByFY)
        .sort()
        .forEach((fy) => {
          let serial = 1;
          invoicesByFY[parseInt(fy)].forEach((inv) => {
            serialMap.set(inv.invoiceId || inv.invoiceNumber || "", serial++);
          });
        });

      // ── Build Excel rows ──────────────────────────────────────────────────

      // Row 0: Title
      const row0 = Array(86).fill("");
      row0[1] = "E-Invoice System ";
      row0[17] = "*  Indicates Mandatory Fields";

      // Row 1: Group headers
      const row1 = Array(86).fill("");
      row1[4]  = "Document Details";
      row1[7]  = "Buyer Details";
      row1[18] = "Dispatch Details";
      row1[24] = "Shipping Details";
      row1[32] = "Product Details";
      row1[57] = "Batch Details";
      row1[60] = "Value Details";
      row1[70] = "Export Details";
      row1[77] = "E-way-bill Details";

      // Row 2: Column headers (exact from sample)
      const headers = [
        "Supply Type Code *", "Reverse Charge", "e-Comm GSTIN", "Igst On Intra",
        "Document Type *", "Document Number *", "Document Date (DD/MM/YYYY) *",
        "Buyer GSTIN *", "Buyer Legal Name *", "Buyer Trade Name ", "Buyer POS *",
        "Buyer Addr1 *", "Buyer Addr2", "Buyer Location *", "Buyer Pin Code", "Buyer State *",
        "Buyer Phone Number", "Buyer Email Id",
        "Dispatch Name ", "Dispatch Addr1 ", "Dispatch Addr2", "Dispatch Location ", "Dispatch Pin Code ", "Dispatch State ",
        "Shipping GSTIN ", "Shipping Legal Name ", "Shipping Trade Name ", "Shipping Addr1 ", "Shipping Addr2",
        "Shipping Location ", "Shipping Pin Code ", "Shipping State ",
        "Sl.No. *", "Product Description", "Is_Service *", "HSN code *", "Bar code ",
        "Quantity *", "Free Quantity", "Unit *", "Unit Price *", "Gross Amount *",
        "Discount", "Pre Tax Value", "Taxable value *", "GST Rate (%) *",
        "Sgst Amt(Rs)", "Cgst Amt (Rs)", "Igst Amt (Rs)",
        "Cess Rate (%)", "Cess Amt Adval (Rs)", "Cess Non Adval Amt (Rs)",
        "State Cess Rate (%)", "State Cess Adval Amt (Rs)", "State Cess Non-Adval Amt (Rs)",
        "Other Charges  ", "Item Total *",
        "Batch Name", "Batch Expiry Dt", "Warranty Dt",
        "Total Taxable value *", "Sgst Amt", "Cgst Amt", "Igst Amt", "Cess Amt",
        "State Cess Amt", "Discount", "Other charges", "Round off", "Total Invoice value *",
        "Shipping Bill No", "Shipping Bill Dt", "Port", "Refund claim",
        "Foreign Currency ", "Country Code ", "Export Duty Amount",
        "Trans ID", "Trans Name", "Trans Mode ", "Distance ", "Trans Doc No.", "Trans Doc Date",
        "Vehicle No.", "Vehicle Type", "Error List",
      ];

      // Build data rows
      const dataRows: any[][] = [];

      for (const invoice of allInvoices) {
        const clientData = invoice._client || {};
        const buyerGSTIN = clientData.gstin || "";
        const buyerStateCode = buyerGSTIN.substring(0, 2);
        const isInterState = sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode;
        const buyerStateName = getStateFromGSTIN(buyerGSTIN) || "";
        // Use full address as-is from database
        const addrComponents = extractAddressComponents(clientData.billingAddress || "");
        const addrParts = parseAddress(clientData.billingAddress || "");

        // Tax calculation: invoice.amount is the taxable value (pre-tax)
        const taxableAmount = Number(invoice.amount) || 0;
        const taxAmount = Math.round(taxableAmount * totalGstRate / 100);
        const sgstAmt = isInterState ? 0 : Math.round(taxableAmount * halfRate / 100);
        const cgstAmt = isInterState ? 0 : Math.round(taxableAmount * halfRate / 100);
        const igstAmt = isInterState ? taxAmount : 0;
        const totalInvoiceValue = taxableAmount + taxAmount;

        // Line items from customInvoiceRows or single summary row
        const rawLineItems: any[] = Array.isArray(invoice.customInvoiceRows) && invoice.customInvoiceRows.length > 0
          ? invoice.customInvoiceRows
          : [];

        const lineItems = rawLineItems.length > 0
          ? rawLineItems
          : [{ description: invoice.mmcInvoiceTitle || "Professional Services", amount: taxableAmount, quantity: 1, unit: "OTHERS" }];

        lineItems.forEach((item: any, itemIdx: number) => {
          const isFirst = itemIdx === 0;
          const isLast = itemIdx === lineItems.length - 1;

          const itemTaxable = Number(item.amount || item.taxableAmount || item.value || 0)
            || (isFirst && lineItems.length === 1 ? taxableAmount : 0);
          const itemGstRate = Number(item.gstRate || totalGstRate);
          const itemTax = Math.round(itemTaxable * itemGstRate / 100);
          const itemSgst = isInterState ? 0 : Math.round(itemTaxable * (itemGstRate / 2) / 100);
          const itemCgst = isInterState ? 0 : Math.round(itemTaxable * (itemGstRate / 2) / 100);
          const itemIgst = isInterState ? itemTax : 0;
          const itemTotal = itemTaxable + itemTax;

          const row = Array(86).fill("");

          // Document Details
          row[0] = isFirst ? "B2B" : "";
          row[1] = ""; // Reverse Charge
          row[2] = ""; // e-Comm GSTIN
          row[3] = ""; // Igst On Intra
          row[4] = isFirst ? "Tax Invoice" : "";
          row[5] = isFirst ? (invoice.invoiceNumber || "") : "";
          row[6] = isFirst ? fmtDate(invoice.generatedDate || "") : "";

          // Buyer Details
          row[7]  = isFirst ? buyerGSTIN : "";
          const rawName = invoice.clientName || clientData.name || "";
          const buyerLegalName = rawName ? (rawName.startsWith("M/s.") ? rawName : `M/s. ${rawName}`) : "";
          row[8]  = isFirst ? buyerLegalName : "";
          row[9]  = ""; // Trade name
          row[10] = isFirst ? buyerStateName : ""; // POS = buyer state
          // Use full address from database in both Addr1 and Addr2
          row[11] = isFirst ? addrComponents.fullAddr : ""; // Buyer Addr1 - full address
          row[12] = isFirst ? addrComponents.fullAddr : ""; // Buyer Addr2 - same full address
          row[13] = isFirst ? addrParts.location : "";
          row[14] = isFirst ? addrComponents.pin : "";
          row[15] = isFirst ? buyerStateName : "";
          row[16] = ""; // Phone
          row[17] = isFirst ? (clientData.billingEmail || "") : "";

          // Dispatch & Shipping (leave blank)
          for (let i = 18; i <= 31; i++) row[i] = "";

          // Product Details
          // Use FY serial number (from serialMap) instead of item index
          const fySerial = serialMap.get(invoice.invoiceId || invoice.invoiceNumber || "") || (itemIdx + 1);
          row[32] = isFirst ? fySerial : ""; // Sl.No (only on first item)
          row[33] = item.description || item.name || item.label || "";
          row[34] = "Yes"; // Is_Service
          row[35] = item.hsnCode || hsnCode; // HSN code
          row[36] = ""; // Bar code
          row[37] = Number(item.quantity) || 1; // Quantity
          row[38] = ""; // Free Quantity
          row[39] = item.unit || "OTHERS"; // Unit
          row[40] = itemTaxable; // Unit Price
          row[41] = itemTaxable; // Gross Amount (without GST, taxable value only)
          row[42] = ""; // Discount
          row[43] = ""; // Pre Tax Value
          row[44] = itemTaxable; // Taxable value
          row[45] = itemGstRate; // GST Rate
          row[46] = itemSgst || 0; // Sgst Amt (show 0 if empty)
          row[47] = itemCgst || 0; // Cgst Amt (show 0 if empty)
          row[48] = itemIgst || 0; // Igst Amt (show 0 if empty)
          row[49] = ""; // Cess Rate
          row[50] = ""; row[51] = ""; row[52] = ""; row[53] = ""; row[54] = "";
          row[55] = ""; // Other Charges
          row[56] = itemTotal; // Item Total

          // Batch Details
          row[57] = ""; row[58] = ""; row[59] = "";

          // Value Details (totals on last item row only)
          row[60] = isLast ? taxableAmount : "";
          row[61] = isLast ? (sgstAmt || 0) : "";
          row[62] = isLast ? (cgstAmt || 0) : "";
          row[63] = isLast ? (igstAmt || 0) : "";
          row[64] = ""; // Cess Amt
          row[65] = ""; // State Cess Amt
          row[66] = ""; // Discount
          row[67] = ""; // Other charges
          row[68] = ""; // Round off
          row[69] = isLast ? totalInvoiceValue : ""; // Total Invoice value

          // Export Details & E-way-bill Details (leave blank)
          for (let i = 70; i < 86; i++) row[i] = "";

          dataRows.push(row);
        });
      }

      // ── Build styled workbook with xlsx-js-style ─────────────────────────

      // Cell style helpers
      const mkStyle = (bgRgb: string, bold = false, fontRgb = "000000", fontSize = 10, align: "left"|"center"|"right" = "center", wrapText = true) => ({
        fill: { fgColor: { rgb: bgRgb } },
        font: { bold, color: { rgb: fontRgb }, sz: fontSize, name: "Calibri" },
        alignment: { horizontal: align, vertical: "center", wrapText },
        border: {
          top:    { style: "thin", color: { rgb: "D0D0D0" } },
          bottom: { style: "thin", color: { rgb: "D0D0D0" } },
          left:   { style: "thin", color: { rgb: "D0D0D0" } },
          right:  { style: "thin", color: { rgb: "D0D0D0" } },
        },
      });

      // Color palette per section (matching GST e-invoice template)
      const COLORS = {
        title:       { bg: "FFFFFF", font: "1F4E79" }, // white bg, dark-blue text
        noGroup:     { bg: "FFF2CC", font: "7F6000" }, // yellow  (cols 0-3)
        docDetails:  { bg: "DDEBF7", font: "1F4E79" }, // light blue
        buyerDet:    { bg: "E2EFDA", font: "375623" }, // light green
        dispatchDet: { bg: "FCE4D6", font: "843C0C" }, // peach
        shippingDet: { bg: "EDEDED", font: "404040" }, // light gray
        productDet:  { bg: "FFF2CC", font: "7F6000" }, // yellow
        batchDet:    { bg: "E8DEFF", font: "4B0082" }, // lavender
        valueDet:    { bg: "D9E1F2", font: "17375E" }, // periwinkle
        exportDet:   { bg: "F4CCCC", font: "990000" }, // pink-red
        ewayDet:     { bg: "D0E4F5", font: "0B3861" }, // sky blue
        dataRow:     { bg: "FFFFFF", font: "000000" }, // white
      };

      // Map column index → section color
      const getSectionColor = (col: number) => {
        if (col <= 3)  return COLORS.noGroup;
        if (col <= 6)  return COLORS.docDetails;
        if (col <= 17) return COLORS.buyerDet;
        if (col <= 23) return COLORS.dispatchDet;
        if (col <= 31) return COLORS.shippingDet;
        if (col <= 56) return COLORS.productDet;
        if (col <= 59) return COLORS.batchDet;
        if (col <= 69) return COLORS.valueDet;
        if (col <= 76) return COLORS.exportDet;
        return COLORS.ewayDet;
      };

      // Build styled sheet from raw arrays
      const wsData2 = [row0, row1, headers, ...dataRows];
      const ws2 = XLSXStyle.utils.aoa_to_sheet(wsData2);

      // Apply styles row by row
      const numCols = 86;
      const numRows = wsData2.length;

      for (let R = 0; R < numRows; R++) {
        for (let C = 0; C < numCols; C++) {
          const cellRef = XLSXStyle.utils.encode_cell({ r: R, c: C });
          if (!ws2[cellRef]) ws2[cellRef] = { t: "z", v: "" };

          const cell = ws2[cellRef];
          const sec = getSectionColor(C);

          if (R === 0) {
            // Title row
            cell.s = mkStyle(COLORS.title.bg, true, COLORS.title.font, 11, "left");
          } else if (R === 1) {
            // Group header row
            const v = String(cell.v || "");
            if (v) {
              cell.s = mkStyle(sec.bg, true, sec.font, 10, "center");
            } else {
              cell.s = mkStyle(sec.bg, false, sec.font, 10, "center");
            }
          } else if (R === 2) {
            // Column header row — bold, colored per section
            cell.s = mkStyle(sec.bg, true, sec.font, 9, "center");
          } else {
            // Data rows - keep all values including 0
            cell.s = mkStyle(COLORS.dataRow.bg, false, COLORS.dataRow.font, 9, "left", false);
          }
        }
      }

      // Merge cells
      ws2["!merges"] = [
        // Title row: full width
        { s: { r: 0, c: 0 }, e: { r: 0, c: 85 } },
        // Group header merges
        { s: { r: 1, c: 0  }, e: { r: 1, c: 3  } }, // no-group
        { s: { r: 1, c: 4  }, e: { r: 1, c: 6  } }, // Document Details
        { s: { r: 1, c: 7  }, e: { r: 1, c: 17 } }, // Buyer Details
        { s: { r: 1, c: 18 }, e: { r: 1, c: 23 } }, // Dispatch Details
        { s: { r: 1, c: 24 }, e: { r: 1, c: 31 } }, // Shipping Details
        { s: { r: 1, c: 32 }, e: { r: 1, c: 56 } }, // Product Details
        { s: { r: 1, c: 57 }, e: { r: 1, c: 59 } }, // Batch Details
        { s: { r: 1, c: 60 }, e: { r: 1, c: 69 } }, // Value Details
        { s: { r: 1, c: 70 }, e: { r: 1, c: 76 } }, // Export Details
        { s: { r: 1, c: 77 }, e: { r: 1, c: 84 } }, // E-way-bill Details
      ];

      // Row heights (pt)
      ws2["!rows"] = [
        { hpt: 24 }, // Row 0: title
        { hpt: 30 }, // Row 1: group headers
        { hpt: 30 }, // Row 2: column headers
        ...dataRows.map(() => ({ hpt: 18 })),
      ];

      // Column widths
      ws2["!cols"] = headers.map((h) => ({ wch: Math.max(String(h).length + 2, 14) }));

      const wb2 = XLSXStyle.utils.book_new();
      XLSXStyle.utils.book_append_sheet(wb2, ws2, "Sheet1");

      const monthLabel = startDate.toLocaleString("en-IN", { month: "short", year: "numeric" });
      XLSXStyle.writeFile(wb2, `e-invoices-${monthLabel.replace(" ", "-")}.xlsx`);

      toast({
        title: "Invoices exported",
        description: `${allInvoices.length} invoice(s) for ${monthLabel} exported in E-Invoice format.`,
      });
    } catch (error: any) {
      console.error("[Invoice] exportGeneratedInvoicesToExcel error:", error);
      toast({ title: "Error", description: error?.message || "Failed to export invoices", variant: "destructive" });
    }
  };

  const handleSync = () => {
    setClients([...CLIENTS]);
    setInvoices(INVOICES);
    toast({ title: "Synced", description: "Invoice management data refreshed from the sample dataset." });
  };

  const generateInvoiceForClient = async (
    client = selectedClient,
    invoiceType: InvoiceType = "commercial",
    amountOverride?: number,
    txnCountOverride?: number,
    invoiceDateOverride?: string,
    mmcInvoiceTitleOverride?: string,
    invoiceMonthOverride?: string,
    invoiceNumberOverride?: string,
  ) => {
    console.log("[Invoice] generateInvoiceForClient - Starting for client:", client?.name, invoiceType);

    if (!client) {
      console.error("[Invoice] generateInvoiceForClient - No client provided");
      toast({ title: "Error", description: "Client not found", variant: "destructive" });
      return;
    }

    try {
      const generatedDate = invoiceDateOverride || new Date().toISOString().split("T")[0];
      console.log("[Invoice] generateInvoiceForClient - Generated date:", generatedDate);

      if (invoiceType === "setup_fee" && (client.invoiceHistory || []).some((invoice) => invoice.invoiceType === "setup_fee")) {
        toast({ title: "Setup fee invoice already exists", description: "This client already has a one time setup invoice in history.", variant: "destructive" });
        return;
      }

      const setupFeeDue = Math.max(Number(client.setupFee || 0) - Number(client.setupFeePaid || 0), 0);
      const generatedAmount = invoiceType === "setup_fee"
        ? setupFeeDue
        : Math.round(
            typeof amountOverride === "number" && amountOverride > 0
              ? amountOverride
              : estimateInvoiceFromSlabs(
                  client,
                  (typeof txnCountOverride === "number" && txnCountOverride > 0
                    ? txnCountOverride
                    : client.monthlyTransactionVolume) || 0,
                ),
          );

      if (invoiceType === "setup_fee" && generatedAmount <= 0) {
        toast({ title: "No setup fee due", description: "This client has no pending one time setup fee.", variant: "destructive" });
        return;
      }

      console.log("[Invoice] generateInvoiceForClient - Generated amount:", generatedAmount);

      const serialInfo = getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState, clients, prefixSerialConfigs, client.invoicePrefix || selectedSerialPrefix || invoiceSerialConfig.prefix);
      console.log("[Invoice] generateInvoiceForClient - Serial info:", serialInfo);

      const resolvedInvoiceNumber = normalizeInlineText(invoiceNumberOverride || serialInfo.invoiceNumber);
      const nextInvoice: InvoiceRecord = {
        invoiceId: resolvedInvoiceNumber,
        invoiceNumber: resolvedInvoiceNumber,
        serial: serialInfo.serial,
        financialYear: serialInfo.financialYear,
        month: normalizeInlineText(invoiceMonthOverride || new Date(generatedDate).toLocaleString("en-IN", { month: "short", year: "numeric" })),
        client: client.name,
        amount: generatedAmount,
        status: "Waiting for approval",
        generatedDate,
        customInvoiceRows: invoiceType === "setup_fee" ? [] : client.customInvoiceRows || [],
        invoiceTableConfig: invoiceType === "setup_fee" ? [] : client.invoiceTableConfig || [],
        billingModel: client.billingModel || "transaction",
        invoiceType,
        mmcInvoiceTitle: normalizeInlineText(mmcInvoiceTitleOverride || client.mmcInvoiceTitle || ""),
        createdAt: new Date().toISOString(),
      };

      console.log("[Invoice] generateInvoiceForClient - Next invoice object:", nextInvoice);

      // Save invoice to database via API (encrypted at rest)
      try {
        console.log("[Invoice] generateInvoiceForClient - Saving to database...");
        await fetch("/api/invoice-management/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: nextInvoice.invoiceId,
            invoiceNumber: nextInvoice.invoiceNumber,
            clientId: client.clientId || client.id,
            clientName: client.name,
            month: nextInvoice.month,
            amount: nextInvoice.amount,
            status: nextInvoice.status,
            generatedDate: nextInvoice.generatedDate,
            financialYear: nextInvoice.financialYear,
            serial: nextInvoice.serial,
            invoicePrefix: client.invoicePrefix || selectedSerialPrefix || invoiceSerialConfig.prefix,
            customInvoiceRows: nextInvoice.customInvoiceRows || [],
            invoiceTableConfig: nextInvoice.invoiceTableConfig || [],
            billingModel: nextInvoice.billingModel || "transaction",
            invoiceType: nextInvoice.invoiceType || "commercial",
            mmcInvoiceTitle: nextInvoice.mmcInvoiceTitle || "",
            createdAt: nextInvoice.createdAt || new Date().toISOString(),
          }),
        });
        console.log("[Invoice] generateInvoiceForClient - Successfully saved to database");
      } catch (dbError) {
        console.warn("[Invoice] generateInvoiceForClient - Database save failed (will continue):", dbError);
      }

      setInvoices((prev) => upsertInvoiceCollection(prev, nextInvoice));
      const generatedPrefix = normalizeInlineText(selectedSerialPrefix || client.invoicePrefix || invoiceSerialConfig.prefix).toUpperCase();
      setClients((prev) =>
        prev.map((item) => {
          const matchesPrefix = normalizeInlineText(item.invoicePrefix).toUpperCase() === generatedPrefix;
          if (item.id !== client.id && !matchesPrefix) return item;
          return {
            ...item,
            lastInvoiceGenerated: generatedDate,
            invoiceCurrentSerial: serialInfo.serial,
            invoiceHistory: item.id === client.id ? upsertInvoiceCollection((item.invoiceHistory || []) as InvoiceRecord[], nextInvoice) : item.invoiceHistory || [],
          };
        }),
      );
      if (generatedPrefix) {
        setPrefixSerialConfigs((prev) => {
          const existing = prev[generatedPrefix] || {
            currentSerial: formatInvoiceSerial(0, 4),
            period: serialInfo.financialYear,
            applyPeriodToAllPrefixes: false,
          };
          const next = {
            ...prev,
            [generatedPrefix]: {
              ...existing,
              currentSerial: formatInvoiceSerial(serialInfo.serial, 4),
              period: existing.applyPeriodToAllPrefixes ? serialInfo.financialYear : existing.period || serialInfo.financialYear,
            },
          };
          if (existing.applyPeriodToAllPrefixes) {
            Object.keys(next).forEach((key) => {
              next[key] = { ...next[key], period: serialInfo.financialYear };
            });
          }
          return next;
        });
      }
      if (!generatedPrefix) {
        setInvoiceSerialState({
          financialYear: serialInfo.financialYear,
          serial: serialInfo.serial,
          lastIssuedAt: new Date().toISOString(),
        });
      }
      setInvoiceModalOpen(false);

      console.log("[Invoice] generateInvoiceForClient - Invoice generated successfully");
      toast({
        title: invoiceType === "setup_fee" ? "Setup fee invoice sent for approval" : "Invoice sent for approval",
        description: `${client.name} invoice ${nextInvoice.invoiceNumber} is waiting for FinOps approval.`,
      });
    } catch (error) {
      console.error("[Invoice] generateInvoiceForClient - Error:", error);
      toast({
        title: "Error generating invoice",
        description: (error as any)?.message || "Unknown error",
        variant: "destructive",
      });
    }
  };

  const generateSetupFeeInvoiceForClient = async (client = selectedClient) => {
    await generateInvoiceForClient(client, "setup_fee");
  };

  const invoiceConflictActionRef = useRef<(() => void) | null>(null);

  function findInvoiceByNumber(invoiceNumber: string, excludeInvoiceId?: string) {
    const target = normalizeInlineText(invoiceNumber).toUpperCase();
    if (!target) return null;
    const excluded = normalizeInlineText(excludeInvoiceId).toUpperCase();
    const records = [
      ...invoices,
      ...clients.flatMap((client) => client.invoiceHistory || []),
    ];
    const seen = new Set<string>();
    for (const record of records) {
      const recordNumber = normalizeInlineText(getInvoiceDisplayNumber(record)).toUpperCase();
      if (!recordNumber || seen.has(recordNumber)) continue;
      seen.add(recordNumber);
      const recordId = normalizeInlineText(record.invoiceId || record.invoiceNumber).toUpperCase();
      if (excluded && recordId === excluded) continue;
      if (recordNumber === target || recordId === target) return record;
    }
    return null;
  }

  const checkInvoiceNumberAvailability = async (invoiceNumber: string, excludeInvoiceId?: string, notify = true) => {
    const normalized = normalizeInlineText(invoiceNumber);
    if (!normalized) {
      const message = "Enter an invoice number first.";
      const result = { available: false, message };
      setInvoiceNumberAvailability(result);
      if (notify) toast({ title: "Invoice number needed", description: message, variant: "destructive" });
      return result;
    }

    try {
      const params = new URLSearchParams({ invoiceNumber: normalized });
      if (excludeInvoiceId) params.set("excludeInvoiceId", excludeInvoiceId);
      const response = await fetch(`/api/invoice-management/invoices/availability?${params.toString()}`);
      const data = response.ok ? await response.json() : null;
      if (data && typeof data.available === "boolean") {
        const result = { available: Boolean(data.available), message: String(data.message || "") };
        setInvoiceNumberAvailability(result);
        if (notify) {
          toast(
            result.available
              ? { title: "Invoice number available", description: result.message }
              : { title: "Invoice number unavailable", description: result.message, variant: "destructive" },
          );
        }
        return result;
      }
    } catch (error) {
      console.warn("[Invoice] availability check failed, falling back to local lookup:", error);
    }

    const conflict = findInvoiceByNumber(normalized, excludeInvoiceId);
    if (conflict) {
      const result = { available: false, message: `Already exists: ${getInvoiceDisplayNumber(conflict)}` };
      setInvoiceNumberAvailability(result);
      if (notify) toast({ title: "Invoice number unavailable", description: result.message, variant: "destructive" });
      return result;
    }

    const result = { available: true, message: "Invoice number is available." };
    setInvoiceNumberAvailability(result);
    if (notify) toast({ title: "Invoice number available", description: result.message });
    return result;
  };

  const promptInvoiceNumberConflict = (action: () => void, invoiceNumber: string, excludeInvoiceId?: string) => {
    const conflict = findInvoiceByNumber(invoiceNumber, excludeInvoiceId);
    if (conflict) {
      invoiceConflictActionRef.current = action;
      setInvoiceNumberConflictOpen(true);
      return true;
    }
    action();
    return false;
  };

  const handleInvoiceSubmit = async (forceReplace = false) => {
    if (!selectedClient) return;
    const resolvedInvoiceNumber = normalizeInlineText(invoiceModalMode === "edit" ? modalInvoicePreview : invoiceNumberDraftValue);
    if (!resolvedInvoiceNumber) {
      toast({ title: "Invoice number needed", description: "Enter an invoice number first.", variant: "destructive" });
      return;
    }

    if (invoiceModalMode === "edit") {
      saveInvoiceUpdate();
      return;
    }

    if (!forceReplace) {
      const availability = await checkInvoiceNumberAvailability(resolvedInvoiceNumber, undefined, false);
      if (!availability?.available) {
        invoiceConflictActionRef.current = () => void handleInvoiceSubmit(true);
        setInvoiceNumberConflictOpen(true);
        return;
      }
    }

    await generateInvoiceForClient(
      selectedClient,
      "commercial",
      pendingInvoiceAmount,
      pendingInvoiceTxnCount,
      invoiceDateDraft || new Date().toISOString().split("T")[0],
      pendingInvoiceMmcTitle,
      invoiceMonthDraft,
      resolvedInvoiceNumber,
    );
  };

  const updateInvoiceByNumber = (invoiceNumber: string, updater: (invoice: InvoiceRecord) => InvoiceRecord) => {
    const currentInvoice =
      invoices.find((inv) => getInvoiceDisplayNumber(inv) === invoiceNumber) ||
      clients.flatMap((client) => client.invoiceHistory || []).find((inv) => getInvoiceDisplayNumber(inv) === invoiceNumber);

    if (!currentInvoice) return;

    const updatedInvoice = updater(currentInvoice);

    // Update local state first for immediate UI feedback
    setInvoices((prev) => updateInvoiceCollection(prev, invoiceNumber, () => updatedInvoice));

    setClients((prev) =>
      prev.map((client) => ({
        ...client,
        invoiceHistory: updateInvoiceCollection(
          (client.invoiceHistory || []) as InvoiceRecord[],
          invoiceNumber,
          () => updatedInvoice,
        ),
      })),
    );

    const persistedClientId = updatedInvoice.clientId || selectedClient?.clientId || selectedClient?.id;

    // Save to database (best-effort, don't block UI)
    fetch("/api/invoice-management/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: updatedInvoice.invoiceId,
        invoiceNumber: updatedInvoice.invoiceNumber,
        clientId: persistedClientId,
        clientName: updatedInvoice.client,
        month: updatedInvoice.month,
        amount: updatedInvoice.amount,
        status: updatedInvoice.status,
        generatedDate: updatedInvoice.generatedDate,
        financialYear: updatedInvoice.financialYear,
        serial: updatedInvoice.serial,
        customInvoiceRows: updatedInvoice.customInvoiceRows || [],
        invoiceTableConfig: updatedInvoice.invoiceTableConfig || selectedClient?.invoiceTableConfig || [],
        billingModel: updatedInvoice.billingModel || selectedClient?.billingModel || "transaction",
        invoiceType: updatedInvoice.invoiceType || "commercial",
      }),
    }).catch((err) => {
      console.warn("[Invoice] Failed to update invoice in database:", err);
    });
  };

  const deleteInvoiceById = async (invoiceId: string) => {
    const invoiceToDelete = clients
      .flatMap((c) => c.invoiceHistory || [])
      .find((inv) => inv.invoiceId === invoiceId);

    const invoiceNumber = invoiceToDelete ? getInvoiceDisplayNumber(invoiceToDelete) : invoiceId;

    try {
      const response = await fetch(`/api/invoice-management/invoices/${encodeURIComponent(invoiceId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete invoice: ${response.status}`);
      }

      setInvoices((prev) => prev.filter((invoice) => invoice.invoiceId !== invoiceId));
      setClients((prev) =>
        prev.map((client) => ({
          ...client,
          invoiceHistory: (client.invoiceHistory || []).filter((invoice) => invoice.invoiceId !== invoiceId),
        })),
      );
      toast({ title: "Invoice deleted", description: `${invoiceNumber} removed from history.` });
    } catch (error) {
      console.error("[Invoice] Failed to delete invoice:", error);
      toast({
        title: "Delete failed",
        description: `Could not delete ${invoiceNumber}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const approveInvoice = (invoice: InvoiceRecord) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status: "Generated" }));
    toast({ title: "Invoice approved", description: `${invoiceNumber} moved to Generated.` });
  };

  const rejectInvoice = (invoice: InvoiceRecord) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status: "Rejected" }));
    toast({ title: "Invoice rejected", description: `${invoiceNumber} was rejected by FinOps admin.` });
  };

  const markInvoiceSent = (invoice: InvoiceRecord) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status: "Send" }));
    toast({ title: "Invoice sent", description: `${invoiceNumber} marked as Send.` });
  };

  const markInvoicePaid = (invoice: InvoiceRecord) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status: "Received" }));
    toast({ title: "Invoice received", description: `${invoiceNumber} marked as Received.` });
  };

  const closeInvoice = (invoice: InvoiceRecord) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status: "Closed" }));
    toast({ title: "Invoice closed", description: `${invoiceNumber} moved to Closed.` });
  };

  const saveInvoiceUpdate = () => {
    if (!selectedInvoice) return;
    const invoiceNumber = getInvoiceDisplayNumber(selectedInvoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({
      ...item,
      amount: invoiceAmountDraft,
      month: invoiceMonthDraft,
      generatedDate: invoiceDateDraft || item.generatedDate,
      status: "Generated",
    }));
    setInvoiceModalOpen(false);
    toast({ title: "Invoice updated", description: `${invoiceNumber} has been updated.` });
  };

  const resolveInvoiceClientRecord = (invoice: any) => {
    const invoiceClientId = invoice.clientId || invoice.clientID || invoice.client_id;
    const invoiceClientName = invoice.clientName || invoice.client;
    return (
      clients.find((item) => item.clientId === invoiceClientId || item.id === invoiceClientId) ||
      clients.find((item) => item.name === invoiceClientName) ||
      selectedClient
    );
  };

  const buildInvoicePdfPayload = (invoice: any, client: ClientRecord) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    const generatedDate = invoice.generatedDate || new Date().toISOString().split("T")[0];
    const financialYearFallback = getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth);
    const serialCandidate = Number(invoice.serial ?? invoiceSerialState.serial ?? 0) || 1;
    return {
      client: {
        ...client,
        customInvoiceRows: invoice.customInvoiceRows || client.customInvoiceRows || [],
        invoiceTableConfig: invoice.invoiceTableConfig || client.invoiceTableConfig || [],
        billingModel: invoice.billingModel || client.billingModel || "transaction",
        mmcInvoiceTitle: invoice.mmcInvoiceTitle || client.mmcInvoiceTitle || "",
      },
      companyConfig,
      invoiceNumber,
      generatedDate,
      amount: Number(invoice.amount || client.monthlyInvoiceEstimate),
      status: invoice.status,
      month:
        invoice.month ||
        new Date(generatedDate).toLocaleString("en-IN", { month: "short", year: "numeric" }),
      financialYear: invoice.financialYear || financialYearFallback,
      serial: serialCandidate,
      invoiceType: invoice.invoiceType || "commercial",
      taxConfig,
    };
  };

  const downloadInvoicePdf = async (invoice: any) => {
    const client = resolveInvoiceClientRecord(invoice);
    if (!client) {
      toast({ title: "Client missing", description: "Could not locate client configuration for this invoice.", variant: "destructive" });
      return;
    }
    try {
      const payload = buildInvoicePdfPayload(invoice, client);
      await downloadInvoicePdfTemplate(payload);
      toast({ title: "PDF downloaded", description: `${payload.invoiceNumber} PDF downloaded.` });
    } catch (error: any) {
      console.error("[Invoice] downloadInvoicePdf error:", error);
      toast({ title: "Error", description: error?.message || "Failed to download PDF", variant: "destructive" });
    }
  };

  const previewInvoicePdf = async (invoice: any) => {
    if (!isApprovedInvoiceStatus(invoice.status)) {
      toast({ title: "Awaiting approval", description: "Only approved invoices can be previewed.", variant: "warning" });
      return;
    }
    const client = resolveInvoiceClientRecord(invoice);
    if (!client) {
      toast({ title: "Client missing", description: "Could not locate client configuration for this invoice.", variant: "destructive" });
      return;
    }
    try {
      const payload = buildInvoicePdfPayload(invoice, client);
      setPreviewingInvoice(invoice);
      setPreviewPayload(payload);
      setPreviewModalOpen(true);
    } catch (error: any) {
      console.error("[Invoice] previewInvoicePdf error:", error);
      toast({ title: "Error", description: error?.message || "Failed to open preview", variant: "destructive" });
    }
  };

  const downloadInvoiceDocx = async (invoice: any) => {
    const client = resolveInvoiceClientRecord(invoice);
    if (!client) {
      toast({ title: "Client missing", description: "Could not locate client configuration for this invoice.", variant: "destructive" });
      return;
    }
    try {
      const payload = buildInvoicePdfPayload(invoice, client);
      await downloadInvoiceDocxTemplate(payload);
      toast({ title: "DOCX downloaded", description: `${payload.invoiceNumber} DOCX downloaded.` });
    } catch (error: any) {
      console.error("[Invoice] downloadInvoiceDocx error:", error);
      toast({ title: "Error", description: error?.message || "Failed to download DOCX", variant: "destructive" });
    }
  };

  const sendInvoice = (invoice: any) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({
      ...item,
      status: item.status === "Received" ? item.status : "Send",
    }));
    toast({ title: "Invoice sent", description: `${invoiceNumber} marked as Send.` });
  };

  const createConfigChangeRequest = (type: ConfigChangeType, changes: Record<string, any>) => {
    const requestId = `req-${Date.now()}`;
    const newRequest: ConfigChangeRequest = {
      id: requestId,
      type,
      requestedBy: currentUser,
      requestedAt: new Date().toISOString(),
      changes,
      approvals: [],
      status: "pending",
    };
    setConfigChangeRequests((prev) => [newRequest, ...prev]);
    toast({
      title: "Configuration change requested",
      description: `Request submitted for approval. Awaiting approvals from 2 admins.`,
    });
    return requestId;
  };

  const approveConfigChange = (requestId: string) => {
    setConfigChangeRequests((prev) =>
      prev.map((req) => {
        if (req.id !== requestId) return req;
        const newApprovals = [
          ...req.approvals,
          {
            approvedBy: currentUser,
            approvedAt: new Date().toISOString(),
            status: "approved" as ApprovalStatus,
          },
        ];
        const isFullyApproved = newApprovals.length >= 2 && newApprovals.every((a) => a.status === "approved");
        const updatedReq = { ...req, approvals: newApprovals, status: (isFullyApproved ? "approved" : "pending") as any };
        if (isFullyApproved) {
          applyConfigChange(updatedReq);
        }
        return updatedReq;
      }),
    );
    toast({
      title: "Configuration approved",
      description: `Your approval has been recorded. ${configChangeRequests.find((r) => r.id === requestId)?.approvals.length === 1 ? "Awaiting 1 more approval." : "Configuration applied."}`,
    });
  };

  const rejectConfigChange = (requestId: string) => {
    setConfigChangeRequests((prev) =>
      prev.map((req) =>
        req.id === requestId ? { ...req, status: "rejected" as any } : req,
      ),
    );
    toast({
      title: "Configuration rejected",
      description: "The change request has been rejected.",
    });
  };

  const applyConfigChange = (request: ConfigChangeRequest) => {
    const now = new Date().toISOString();
    if (request.type === "invoice-serial") {
      setInvoiceSerialConfig((prev) => ({ ...prev, ...request.changes }));
    } else if (request.type === "company") {
      setCompanyConfig((prev) => ({ ...prev, ...request.changes }));
    } else if (request.type === "tax") {
      setTaxConfig((prev) => withDefaultTaxHsn({ ...prev, ...request.changes }));
    } else if (request.type === "currency") {
      setCurrencyConfig((prev) => ({ ...prev, ...request.changes }));
    }
    setConfigChangeRequests((prev) =>
      prev.map((req) => (req.id === request.id ? { ...req, status: "applied", appliedAt: now } : req)),
    );
    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}`,
      type: request.type,
      changedBy: currentUser,
      changedAt: now,
      changes: request.changes,
      requestId: request.id,
    };
    setAuditLog((prev) => [logEntry, ...prev]);
    toast({
      title: "Configuration applied",
      description: `${request.type} configuration updated successfully.`,
    });
  };

  const saveInvoiceSerialConfiguration = async () => {
    setIsSavingInvoiceSerialConfig(true);
    try {
      const response = await fetch("/api/invoice-management/settings/invoice-serial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceSerialConfig: { ...invoiceSerialConfig, currentSerial: selectedPrefixSettings.currentSerial },
          prefixSerialConfigs,
        }),
      });
      if (!response.ok) throw new Error("Failed to save invoice serial configuration");
      toast({ title: "Configuration saved", description: "Invoice serial settings stored in the database." });
    } catch (error) {
      console.error("[Invoice] saveInvoiceSerialConfiguration error:", error);
      toast({ title: "Error", description: "Failed to save invoice serial settings", variant: "destructive" });
    } finally {
      setIsSavingInvoiceSerialConfig(false);
    }
  };

  const saveMylapayConfiguration = async () => {
    setIsSavingMylapayConfig(true);
    try {
      const response = await fetch("/api/invoice-management/settings/mylapay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyConfig, taxConfig, currencyConfig }),
      });
      const saved = response.ok ? await response.json() : null;
      if (!response.ok) throw new Error("Failed to save Mylapay configuration");
      if (saved?.companyConfig) setCompanyConfig((prev) => ({ ...prev, ...saved.companyConfig }));
      if (saved?.taxConfig) setTaxConfig((prev) => withDefaultTaxHsn({ ...prev, ...saved.taxConfig }));
      if (saved?.currencyConfig) setCurrencyConfig((prev) => ({ ...prev, ...saved.currencyConfig }));
      toast({ title: "Configuration saved", description: "Mylapay settings stored in the database." });
    } catch (error) {
      console.error("[Invoice] saveMylapayConfiguration error:", error);
      toast({ title: "Error", description: "Failed to save Mylapay settings", variant: "destructive" });
    } finally {
      setIsSavingMylapayConfig(false);
    }
  };

  const saveConfig = async (payload: any) => {
    try {
      const trimmedName = String(payload.name || "").trim();
      const trimmedCode = String(payload.code || "").trim();
      if (!trimmedName || !trimmedCode) {
        toast({
          title: "Missing details",
          description: "Client name and client code are required before saving.",
          variant: "destructive",
        });
        return;
      }
      // For editing: use clientId (unique identifier), for new: use code as identifier
      const clientId = payload.clientId || trimmedCode.toLowerCase();
      const baseId = clientId || payload.id || `client-${Date.now()}`;
      const resolvedInvoicePrefix = normalizeInlineText(payload.invoicePrefix || invoiceSerialConfig.prefix).toUpperCase();
      const resolvedMmcInvoiceTitle = normalizeInlineText(payload.mmcInvoiceTitle) || "";
      const existingClientForPrefix = clients.find(
        (client) =>
          normalizeInlineText(client.invoicePrefix).toUpperCase() === resolvedInvoicePrefix ||
          String(client.clientId || client.id || "").toLowerCase() === String(payload.clientId || payload.id || "").toLowerCase(),
      );
      const resolvedInvoiceSerial = Number(
        payload.invoiceCurrentSerial ?? existingClientForPrefix?.invoiceCurrentSerial ?? 0,
      );

      console.log("[Invoice] saveConfig - payload:", { id: payload.id, clientId: payload.clientId, code: payload.code, baseId });

      const nextClient: ClientRecord = {
        id: baseId,
        clientId: clientId,
        code: trimmedCode,
        name: trimmedName,
        status: payload.status,
        priority: payload.priority,
        services: payload.services,
        serviceTypeOther: payload.serviceTypeOther || "",
        fixedBilling: payload.fixedBilling,
        monthlyInvoiceEstimate: payload.monthlyInvoiceEstimate,
        monthlyTransactionVolume: payload.monthlyTransactionVolume,
        variableRevenueGenerated: Math.max(0, payload.monthlyInvoiceEstimate - payload.fixedBilling),
        awsInfraRecovery: payload.aws.enabled ? payload.aws.vendorCost * (payload.aws.marginPercentage / 100) : 0,
        reconRevenue: Math.round(payload.monthlyInvoiceEstimate * 0.32),
        profitabilityRevenue: Math.round(payload.monthlyInvoiceEstimate * 0.18),
        minimumGuarantee: payload.minimumGuarantee,
        additionalPlatformFee: payload.additionalPlatformFee,
        integrationFee: payload.integrationFee,
        billingCycle: payload.billingCycle,
        lastInvoiceGenerated: new Date().toISOString().split("T")[0],
        logo: String(trimmedName || "C").charAt(0).toUpperCase(),
        logoClass: "from-indigo-500 to-purple-600",
        color: "indigo",
        transactionSlabs: payload.transactionSlabs,
        aws: payload.aws,
        notes: payload.notes,
        signatoryImage: payload.signatoryImage,
        invoicePrefix: resolvedInvoicePrefix,
        invoiceCurrentSerial: resolvedInvoiceSerial,
        mmcInvoiceTitle: resolvedMmcInvoiceTitle,
        invoiceHistory: payload.id ? (clients.find((client) => client.id === payload.id)?.invoiceHistory || []) : [],
        gstin: payload.gstin,
        lutNumber: payload.lutNumber,
        billingAddress: payload.billingAddress,
        billingEmail: payload.billingEmail,
        signatoryName: payload.signatoryName,
        clientType: payload.clientType || "Domestic",
        currency: payload.clientCurrency || "INR",
        billingModel: payload.billingModel || "transaction",
        billingYear: payload.billingYear || 1,
        setupFee: payload.setupFee || 0,
        setupFeePaid: payload.setupFeePaid || 0,
        mmcYear1: payload.mmcYear1 || 0,
        mmcYear2: payload.mmcYear2 || 0,
        mmcYear3: payload.mmcYear3 || 0,
        transactionFeeRate: payload.transactionFeeRate || 0,
        vapMipConnectivityFee: payload.vapMipConnectivityFee || 0,
        changeManagementFeeRate: payload.changeManagementFeeRate || 0,
        changeManagementManDays: payload.changeManagementManDays || 0,
        networkCertificationNote: payload.networkCertificationNote || "",
        infraCostNote: payload.infraCostNote || "",
        customInvoiceRows: payload.customInvoiceRows || [],
        serviceOptions: payload.serviceOptions || payload.services || [],
        invoiceTableConfig: payload.invoiceTableConfig || [],
      };

      // Save to database via API (encrypted at rest)
      // Use clientId for UPSERT to prevent duplicates
      await fetch("/api/invoice-management/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId,
          clientCode: trimmedCode,
          clientName: trimmedName,
          status: payload.status,
          priority: payload.priority,
          services: payload.services,
          serviceOptions: payload.serviceOptions || payload.services || [],
          serviceTypeOther: payload.serviceTypeOther || "",
          fixedBilling: payload.fixedBilling,
          monthlyInvoiceEstimate: payload.monthlyInvoiceEstimate,
          monthlyTransactionVolume: payload.monthlyTransactionVolume,
          variableRevenueGenerated: Math.max(0, payload.monthlyInvoiceEstimate - payload.fixedBilling),
          awsInfraRecovery: payload.aws.enabled ? payload.aws.vendorCost * (payload.aws.marginPercentage / 100) : 0,
          reconRevenue: Math.round(payload.monthlyInvoiceEstimate * 0.32),
          profitabilityRevenue: Math.round(payload.monthlyInvoiceEstimate * 0.18),
          minimumGuarantee: payload.minimumGuarantee,
          additionalPlatformFee: payload.additionalPlatformFee,
          integrationFee: payload.integrationFee,
          billingCycle: payload.billingCycle,
          lastInvoiceGenerated: new Date().toISOString().split("T")[0],
          logo: String(trimmedName || "C").charAt(0).toUpperCase(),
          logoClass: "from-indigo-500 to-purple-600",
          color: "indigo",
          gstin: payload.gstin,
          lutNumber: payload.lutNumber,
          billingAddress: payload.billingAddress,
          billingEmail: payload.billingEmail,
          signatoryName: payload.signatoryName,
          signatoryImage: payload.signatoryImage,
          invoicePrefix: resolvedInvoicePrefix,
          invoiceCurrentSerial: resolvedInvoiceSerial,
          mmcInvoiceTitle: resolvedMmcInvoiceTitle,
          clientType: payload.clientType || "Domestic",
          currency: payload.clientCurrency || "INR",
          notes: payload.notes,
          transactionSlabs: payload.transactionSlabs || [],
          aws: payload.aws || { enabled: false, vendorCost: 0, marginPercentage: 0 },
          billingModel: payload.billingModel || "transaction",
          billingYear: payload.billingYear || 1,
          setupFee: payload.setupFee || 0,
          setupFeePaid: payload.setupFeePaid || 0,
          mmcYear1: payload.mmcYear1 || 0,
          mmcYear2: payload.mmcYear2 || 0,
          mmcYear3: payload.mmcYear3 || 0,
          transactionFeeRate: payload.transactionFeeRate || 0,
          vapMipConnectivityFee: payload.vapMipConnectivityFee || 0,
          changeManagementFeeRate: payload.changeManagementFeeRate || 0,
          changeManagementManDays: payload.changeManagementManDays || 0,
          networkCertificationNote: payload.networkCertificationNote || "",
          infraCostNote: payload.infraCostNote || "",
          customInvoiceRows: payload.customInvoiceRows || [],
          invoiceTableConfig: payload.invoiceTableConfig || [],
        }),
      });

      writeClientOverviewCache(baseId, {
        invoiceTableConfig: payload.invoiceTableConfig || [],
        customInvoiceRows: payload.customInvoiceRows || [],
        serviceOptions: payload.serviceOptions || payload.services || [],
      });

      setClients((prev) => {
        const exists = prev.some(
          (client) =>
            client.id === baseId ||
            client.clientId === baseId ||
            client.id === payload.id ||
            client.clientId === payload.clientId,
        );
        return exists
          ? prev.map((client) => {
              const clientPrefix = normalizeInlineText(client.invoicePrefix).toUpperCase();
              if (client.id === baseId || client.clientId === baseId || client.id === payload.id || client.clientId === payload.clientId) {
                return nextClient;
              }
              if (resolvedInvoicePrefix && clientPrefix === resolvedInvoicePrefix) {
                return {
                  ...client,
                  invoicePrefix: resolvedInvoicePrefix,
                  invoiceCurrentSerial: resolvedInvoiceSerial,
                  mmcInvoiceTitle: resolvedMmcInvoiceTitle,
                };
              }
              return client;
            })
          : [nextClient, ...prev];
      });
      setPrefixSerialConfigs((prev) => {
        if (!resolvedInvoicePrefix) return prev;
        const existing = prev[resolvedInvoicePrefix] || {
          currentSerial: formatInvoiceSerial(0, 4),
          period:
            prefixSerialConfigs[resolvedInvoicePrefix]?.period ||
            selectedPrefixSettings.period ||
            getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth),
          applyPeriodToAllPrefixes: false,
        };
        const next = {
          ...prev,
          [resolvedInvoicePrefix]: {
            ...existing,
            currentSerial: formatInvoiceSerial(resolvedInvoiceSerial, 4),
          },
        };
        if (existing.applyPeriodToAllPrefixes) {
          Object.keys(next).forEach((key) => {
            next[key] = { ...next[key], period: existing.period };
          });
        }
        return next;
      });

      toast({
        title: `Configuration ${payload.clientId ? "updated" : "created"}`,
        description: `${trimmedName} commercial configuration saved successfully to database (encrypted).`,
      });

      navigate(`/invoice-management/client/${clientId || baseId}`);
    } catch (error) {
      console.error("Error saving client config:", error);
      toast({
        title: "Error",
        description: "Failed to save client configuration to database",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async (clientIdToDelete: string) => {
    try {
      // Find the client's clientId (the string identifier like "payswiff")
      const clientToDelete = clients.find(c => c.id === clientIdToDelete);
      const idToUse = clientToDelete?.clientId || clientIdToDelete;

      // Mark inactive in local state immediately for better UX
      setClients((prev) =>
        prev.map((client) =>
          client.id === clientIdToDelete || client.clientId === idToUse
            ? { ...client, status: "inactive" }
            : client,
        ),
      );

      // Soft delete in database (best-effort, don't block UI)
      fetch(`/api/invoice-management/clients/${idToUse}`, {
        method: "DELETE",
      }).catch(err => {
        console.warn("[Invoice] Failed to deactivate client in database:", err);
        // If deactivate fails, the data will be reloaded when the page refreshes
      });

      toast({ title: "Client deactivated", description: "The client was moved to History as inactive." });

      if (clientId === idToUse) {
        navigate("/invoice-management");
      }
    } catch (error) {
      console.error("[Invoice] handleDeleteClient error:", error);
      toast({ title: "Error", description: "Failed to deactivate configuration", variant: "destructive" });
    }
  };

  const requestDeleteClient = (client: ClientRecord) => {
    setPendingDeleteClient({ clientIdToDelete: client.id, clientName: client.name });
  };

  const requestForceDeleteClient = (client: ClientRecord) => {
    setPendingForceDeleteClient({ clientIdToDelete: client.id, clientName: client.name });
  };

  const handleForceDeleteClient = async (clientIdToDelete: string) => {
    try {
      const clientToDelete = clients.find((c) => c.id === clientIdToDelete);
      const idToUse = clientToDelete?.clientId || clientIdToDelete;

      setClients((prev) => prev.filter((client) => client.id !== clientIdToDelete && client.clientId !== idToUse));

      fetch(`/api/invoice-management/clients/${idToUse}/force`, {
        method: "DELETE",
      }).catch((err) => {
        console.warn("[Invoice] Failed to force delete client in database:", err);
      });

      toast({ title: "Client deleted", description: "The inactive client was permanently removed from History." });
    } catch (error) {
      console.error("[Invoice] handleForceDeleteClient error:", error);
      toast({ title: "Error", description: "Failed to delete client", variant: "destructive" });
    }
  };

  const handleActivateClient = async (clientIdToActivate: string) => {
    try {
      const clientToActivate = clients.find((c) => c.id === clientIdToActivate);
      const idToUse = clientToActivate?.clientId || clientIdToActivate;

      setClients((prev) =>
        prev.map((client) =>
          client.id === clientIdToActivate || client.clientId === idToUse
            ? { ...client, status: "active" }
            : client,
        ),
      );

      fetch(`/api/invoice-management/clients/${idToUse}/activate`, {
        method: "PATCH",
      }).catch((err) => {
        console.warn("[Invoice] Failed to activate client in database:", err);
      });

      toast({ title: "Client activated", description: "The client was restored to Active." });

      if (clientId === idToUse) {
        navigate("/invoice-management");
      }
    } catch (error) {
      console.error("[Invoice] handleActivateClient error:", error);
      toast({ title: "Error", description: "Failed to activate configuration", variant: "destructive" });
    }
  };

  const requestActivateClient = (client: ClientRecord) => {
    setPendingActivateClient({ clientIdToActivate: client.id, clientName: client.name });
  };

  const confirmDeleteClient = async () => {
    if (!pendingDeleteClient) return;
    const { clientIdToDelete } = pendingDeleteClient;
    setPendingDeleteClient(null);
    await handleDeleteClient(clientIdToDelete);
  };

  const confirmForceDeleteClient = async () => {
    if (!pendingForceDeleteClient) return;
    const { clientIdToDelete } = pendingForceDeleteClient;
    setPendingForceDeleteClient(null);
    await handleForceDeleteClient(clientIdToDelete);
  };

  const confirmActivateClient = async () => {
    if (!pendingActivateClient) return;
    const { clientIdToActivate } = pendingActivateClient;
    setPendingActivateClient(null);
    await handleActivateClient(clientIdToActivate);
  };

  const pageTitle = isCreateRoute ? "Create Config" : isEditRoute ? "Edit Config" : isOverviewRoute ? "Client Overview" : "Invoice Management";

  if (isCreateRoute || isEditRoute) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate("/invoice-management")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm text-muted-foreground">Invoice Management</div>
            <h1 className="text-3xl font-semibold tracking-tight">{pageTitle}</h1>
          </div>
        </div>
        <InvoiceConfigEditor
          key={editingClient ? `${editingClient.clientId || editingClient.id}-${normalizeInlineText(editingClient.invoicePrefix) || "no-prefix"}-${editingClient.invoiceCurrentSerial || 0}` : `${isCreateRoute ? "create" : "edit"}-${clientId || "new"}`}
          mode={isCreateRoute ? "create" : "edit"}
          client={editingClient}
          canManageConfigActions={canManageClientConfigActions}
          onCancel={() => navigate("/invoice-management")}
          onSave={saveConfig}
        />
      </div>
    );
  }

  if (isOverviewRoute && selectedClient) {
    return (
      <>
        <ClientOverviewScreen
          client={selectedClient}
          taxConfig={taxConfig}
          onBack={() => navigate("/invoice-management")}
          onExportPdf={(amountOverride, txnCountOverride, rowsOverride) =>
            exportClientPdf(selectedClient, amountOverride, txnCountOverride, rowsOverride)
          }
          onExportCsv={() => exportClientsCsv([selectedClient])}
          onExportDocx={() => exportClientDocx(selectedClient)}
          onGenerateInvoice={(amountOverride, txnCountOverride, mmcInvoiceTitle) =>
            openInvoiceCreateModal(selectedClient, amountOverride, txnCountOverride, mmcInvoiceTitle)
          }
          onGenerateSetupFeeInvoice={() => generateSetupFeeInvoiceForClient(selectedClient)}
          onStatusChange={(invoiceNumber, status) => updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status }))}
          onDownloadPdf={downloadInvoicePdf}
          onDownloadDocx={downloadInvoiceDocx}
          onPreview={previewInvoicePdf}
          onDeleteInvoice={deleteInvoiceById}
          onEditInvoice={openInvoiceEditModal}
          onApproveInvoice={approveInvoice}
          onRejectInvoice={rejectInvoice}
          onSendInvoice={sendInvoice}
          onPaidInvoice={markInvoicePaid}
          onCloseInvoice={closeInvoice}
          canManageApprovalActions={canManageInvoiceApprovalActions}
          onSaveCustomRows={(rows) =>
            saveConfig({
              ...selectedClient,
              clientId: selectedClient.clientId,
              clientCurrency: selectedClient.currency || "INR",
              customInvoiceRows: rows,
            })
          }
          onSaveOverviewConfig={saveConfig}
        />

        {/* Invoice Creation/Editing Modal */}
        <Dialog
          open={invoiceModalOpen}
          onOpenChange={(open) => {
            setInvoiceModalOpen(open);
            if (!open) {
              setInvoiceNumberConflictOpen(false);
              invoiceConflictActionRef.current = null;
            }
          }}
        >
          <DialogContent className="max-w-5xl w-[96vw] max-h-[calc(100vh-2rem)] overflow-hidden p-6">
            <DialogHeader>
              <DialogTitle>
                {invoiceModalMode === "edit" ? "Edit Invoice" : "Invoice Generation Modal"}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Input value={selectedInvoice?.client || selectedClient?.name || ""} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Invoice Amount</Label>
                  <Input
                    type={invoiceModalMode === "edit" ? "number" : "text"}
                    value={invoiceModalMode === "edit" ? invoiceAmountDraft : currencyLabel(invoiceAmountDraft > 0 ? invoiceAmountDraft : (selectedClient?.monthlyInvoiceEstimate || 0))}
                    onChange={(e) => setInvoiceAmountDraft(Number(e.target.value) || 0)}
                    readOnly={invoiceModalMode !== "edit"}
                    placeholder={`${currencyLabel(selectedClient?.monthlyInvoiceEstimate || 0)}`}
                  />
                  {invoiceModalMode !== "edit" && (
                    <p className="text-xs text-muted-foreground">
                      + {currencyLabel(Math.round((invoiceAmountDraft > 0 ? invoiceAmountDraft : (selectedClient?.monthlyInvoiceEstimate || 0)) * 0.18))} tax (18%) = {currencyLabel(Math.round((invoiceAmountDraft > 0 ? invoiceAmountDraft : (selectedClient?.monthlyInvoiceEstimate || 0)) * 1.18))} final payable
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Invoice Date</Label>
                  <Input
                    type="date"
                    value={invoiceDateDraft || new Date().toISOString().split("T")[0]}
                    onChange={(e) => setInvoiceDateDraft(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    PDF format: {formatInvoicePdfDate(invoiceDateDraft || new Date().toISOString().split("T")[0])}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Invoice Month</Label>
                  <Input
                    value={invoiceMonthDraft || new Date().toLocaleString("en-IN", { month: "short", year: "numeric" })}
                    onChange={(e) => setInvoiceMonthDraft(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input value={invoiceModalMode === "edit" ? "Generated" : "Waiting for approval"} readOnly />
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">Invoice Number Preview:</span>
                  {invoiceModalMode !== "edit" && invoiceNumberIsUnavailable && (
                    <>
                      <Badge variant="destructive" className="rounded-full">
                        Already generated
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { void handleInvoiceSubmit(true); }}
                      >
                        Override
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={invoiceModalMode === "edit" ? modalInvoicePreview : invoiceNumberDraftValue}
                    onChange={(e) => {
                      setInvoiceNumberDraft(e.target.value);
                      setInvoiceNumberAvailability(null);
                    }}
                    readOnly={invoiceModalMode === "edit"}
                    className="font-mono"
                  />
                  {invoiceModalMode !== "edit" && (
                    <Button type="button" variant="outline" onClick={() => { void checkInvoiceNumberAvailability(invoiceNumberDraftValue); }}>
                      Check availability
                    </Button>
                  )}
                </div>
                <p className="text-xs">
                  {invoiceModalMode === "edit"
                    ? "This number is saved with the existing invoice record."
                    : invoiceNumberAvailability
                      ? invoiceNumberAvailability.message
                      : "Edit the invoice number before submitting. If it already exists, we will ask before replacing it."}
                </p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {invoiceModalMode === "edit"
                  ? "Only invoices approved by the FinOps admin can be edited and updated."
                  : invoiceNumberIsUnavailable
                    ? "This invoice number already exists. You can replace the existing invoice or change the number before submitting."
                    : "Invoice requests start in Waiting for approval. FinOps admin must approve before the invoice becomes Generated."}
              </div>
              <div className="space-y-2 rounded-2xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">Declaration</Label>
                  <span className="text-xs text-muted-foreground">Rich text enabled</span>
                </div>
                <RichTextDeclarationEditor
                  value={companyConfig.declarationText}
                  onChange={(nextHtml) => setCompanyConfig((prev) => ({ ...prev, declarationText: nextHtml }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setInvoiceModalOpen(false)}>Close</Button>
                <Button
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                  onClick={() => {
                    void handleInvoiceSubmit(false);
                  }}
                >
                  {invoiceModalMode === "edit" ? "Update Invoice" : "Submit for approval"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-20 -mx-6 border-b bg-background/80 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Finance</span>
              <ChevronRight className="h-4 w-4" />
              <span>Invoice Management</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{pageTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enterprise invoice operations, commercial config management and revenue analytics
            </p>
            {/* Main tab navigation */}
            <div className="mt-3 flex items-center gap-1 rounded-full border bg-muted/30 p-1 w-fit">
              <button
                onClick={() => setMainTab("clients")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${mainTab === "clients" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Clients</span>
              </button>
              <button
                onClick={() => setMainTab("tracker")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${mainTab === "tracker" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Invoice Tracker</span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageClientConfigActions && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSettingsViewOpen(true)}
                title="Configuration settings (Admin and finance admin only)"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={handleSync}>
              <RefreshCcw className="h-4 w-4" /> Sync
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportClientsCsv()}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setShowExportInvoicesModal(true)}>
              <FileDown className="h-4 w-4" /> Export Invoices
            </Button>
            <Button
              className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500"
              onClick={() => navigate("/invoice-management/new")}
            >
              <Plus className="h-4 w-4" /> Create Config
            </Button>
          </div>
        </div>
      </div>

      {/* ── Invoice Tracker tab ─────────────────────────────────────────── */}
      {mainTab === "tracker" && !settingsViewOpen && <InvoiceTracker />}

      {/* Configuration sections shown when settings view is open */}
      {mainTab === "clients" && settingsViewOpen && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setSettingsViewOpen(false)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="text-sm text-muted-foreground">Invoice Management</div>
              <h2 className="text-2xl font-semibold tracking-tight">Configuration & Approvals</h2>
            </div>
          </div>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Invoice Number Serial Config</CardTitle>
            <CardDescription>
              Auto-resets every financial year and controls invoice number format
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full">
              Current FY: {getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth)}
            </Badge>
            <Button
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
              onClick={saveInvoiceSerialConfiguration}
              disabled={isSavingInvoiceSerialConfig}
            >
              {isSavingInvoiceSerialConfig ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Prefix</Label>
              <Select
                value={selectedSerialPrefix || invoiceSerialConfig.prefix}
                onValueChange={(value) => {
                  const normalized = normalizeInlineText(value).toUpperCase();
                  setSelectedSerialPrefix(normalized);
                  setInvoiceSerialConfig((prev) => ({ ...prev, prefix: normalized }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose prefix" />
                </SelectTrigger>
                <SelectContent>
                  {invoicePrefixOptions.map((prefix) => (
                    <SelectItem key={prefix} value={prefix}>
                      {prefix}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Separator</Label>
              <Input
                value={invoiceSerialConfig.separator}
                onChange={(e) =>
                  setInvoiceSerialConfig((prev) => ({ ...prev, separator: e.target.value || "/" }))
                }
                placeholder="/"
              />
            </div>
            <div className="space-y-2">
              <Label>Serial Digits</Label>
              <Input
                type="number"
                min={2}
                max={6}
                value={invoiceSerialConfig.serialDigits}
                onChange={(e) =>
                  setInvoiceSerialConfig((prev) => ({
                    ...prev,
                    serialDigits: Number(e.target.value) || 4,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={invoiceSerialConfig.format}
                onValueChange={(value) =>
                  setInvoiceSerialConfig((prev) => ({
                    ...prev,
                    format: value as InvoiceNumberFormat,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREFIX/FY/SEQ">Prefix / FY / Serial</SelectItem>
                  <SelectItem value="PREFIX/SEQ/FY">Prefix / Serial / FY</SelectItem>
                  <SelectItem value="PREFIX-FY-SEQ">Prefix-FY-Serial</SelectItem>
                  <SelectItem value="FY/SEQ">FY / Serial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Financial Year Start Month</Label>
              <Select
                value={String(invoiceSerialConfig.financialYearStartMonth)}
                onValueChange={(value) =>
                  setInvoiceSerialConfig((prev) => ({
                    ...prev,
                    financialYearStartMonth: Number(value) || 4,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">April</SelectItem>
                  <SelectItem value="1">January</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Current Serial Number</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={selectedPrefixSettings.currentSerial}
                onChange={(e) => {
                  updateSelectedPrefixSettings((current) => ({ ...current, currentSerial: e.target.value }));
                }}
                placeholder="0017"
              />
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Input
                value={selectedPrefixSettings.period}
                onChange={(e) => {
                  const nextPeriod = e.target.value;
                  updateSelectedPrefixSettings((current) => ({ ...current, period: nextPeriod }));
                }}
                placeholder="26-27"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 rounded-2xl border px-4 py-3">
                <Checkbox
                  checked={Boolean(selectedPrefixSettings.applyPeriodToAllPrefixes)}
                  onCheckedChange={(checked) =>
                    updateSelectedPrefixSettings((current) => ({
                      ...current,
                      applyPeriodToAllPrefixes: Boolean(checked),
                    }))
                  }
                />
                <div className="space-y-0.5">
                  <Label className="text-sm">Apply period to all prefixes</Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, the selected period is copied to every prefix configuration.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Next Invoice Number Preview</Label>
              <div className="rounded-2xl border bg-muted/20 px-4 py-3 font-mono text-sm font-medium">
                {invoiceNumberPreview}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Counter Controls</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full">
                  Current Serial: {formatInvoiceSerial(Number(selectedPrefixSettings.currentSerial || 0), invoiceSerialConfig.serialDigits)}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  Prefix: {selectedPrefixKey || invoiceSerialConfig.prefix}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  Period: {selectedPrefixSettings.period || "—"}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() =>
                    updateSelectedPrefixSettings((current) => ({
                      ...current,
                      currentSerial: formatInvoiceSerial(0, 4),
                    }))
                  }
                >
                  Reset Serial Now
                </Button>
              </div>
            </div>
            <div className="md:col-span-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/70">
                    Auto reset rule
                  </div>
                  <div className="mt-1 text-sm text-white/90">
                    Configure the selected prefix serial and period here. You can also copy the same period to every prefix with the checkbox.
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full border-white/20 bg-white/10 text-white">
                  {invoiceNumberPreview}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Mylapay Configuration</CardTitle>
              <CardDescription>
                Company details, tax settings, and currency management (click settings icon for change requests)
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                3 sections
              </Badge>
              <Button
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                onClick={saveMylapayConfiguration}
                disabled={isSavingMylapayConfig}
              >
                {isSavingMylapayConfig ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex gap-2 border-b">
              <Button
                variant={activeConfigTab === "company" ? "default" : "ghost"}
                className="rounded-b-none"
                onClick={() => setActiveConfigTab("company")}
              >
                Company Details
              </Button>
              <Button
                variant={activeConfigTab === "tax" ? "default" : "ghost"}
                className="rounded-b-none"
                onClick={() => setActiveConfigTab("tax")}
              >
                Tax Settings
              </Button>
              <Button
                variant={activeConfigTab === "currency" ? "default" : "ghost"}
                className="rounded-b-none"
                onClick={() => setActiveConfigTab("currency")}
              >
                Currency Management
              </Button>
            </div>

            {activeConfigTab === "company" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Company Name</Label>
                  <Input
                    value={companyConfig.companyName}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Mindeed Technologies and Services Pvt Ltd"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address</Label>
                  <Textarea
                    value={companyConfig.address}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="Street address"
                    className="resize-none"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={companyConfig.city}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="Chennai"
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={companyConfig.state}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, state: e.target.value }))}
                    placeholder="Tamil Nadu"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input
                    value={companyConfig.pincode}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, pincode: e.target.value }))}
                    placeholder="600006"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={companyConfig.email}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="contact@mylapay.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={companyConfig.phone}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="+91 44 XXXX XXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={companyConfig.website}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, website: e.target.value }))}
                    placeholder="www.mylapay.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input
                    value={companyConfig.gstNumber}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, gstNumber: e.target.value }))}
                    placeholder="33AAMCM6618H1ZB"
                  />
                </div>
                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <Input
                    value={companyConfig.panNumber}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, panNumber: e.target.value }))}
                    placeholder="AAMCM6618H"
                  />
                </div>
                <div className="space-y-2">
                  <Label>LUT Number</Label>
                  <Input
                    value={companyConfig.lutNumber}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, lutNumber: e.target.value }))}
                    placeholder="LUT-33-TN"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CIN Number</Label>
                  <Input
                    value={companyConfig.cinNumber}
                    onChange={(e) => setCompanyConfig((prev) => ({ ...prev, cinNumber: e.target.value }))}
                    placeholder="U72900TN2019PTC129197"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Signature Image</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // Upload image to server instead of storing as base64
                      const formData = new FormData();
                      formData.append("file", file);
                      try {
                        const response = await fetch("/api/files/uploads/signature", {
                          method: "POST",
                          body: formData,
                        });
                        if (response.ok) {
                          const { filePath } = await response.json();
                          setCompanyConfig((prev) => ({ ...prev, signatureImage: filePath }));
                        } else {
                          toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
                        }
                      } catch (error) {
                        console.error("Upload error:", error);
                        toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
                      }
                    }}
                  />
                  {companyConfig.signatureImage && (
                    <div className="mt-2 rounded-xl border bg-muted/20 p-3">
                      <img src={companyConfig.signatureImage.startsWith("data:") ? companyConfig.signatureImage : `/uploads/${companyConfig.signatureImage}`} alt="Company signature preview" className="max-h-24 object-contain" />
                    </div>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Declaration Text</Label>
                  <RichTextDeclarationEditor
                    value={companyConfig.declarationText}
                    onChange={(nextHtml) => setCompanyConfig((prev) => ({ ...prev, declarationText: nextHtml }))}
                  />
                </div>
              </div>
            )}

            {activeConfigTab === "tax" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 p-4 md:col-span-2">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Current Tax Type</div>
                  <Badge className="rounded-full">{taxConfig.defaultTaxType}</Badge>
                </div>
                <div className="space-y-2">
                  <Label>SGST Percentage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxConfig.sgstPercentage}
                    onChange={(e) => setTaxConfig((prev) => ({ ...prev, sgstPercentage: Number(e.target.value) || 0 }))}
                    placeholder="9"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CGST Percentage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxConfig.cgstPercentage}
                    onChange={(e) => setTaxConfig((prev) => ({ ...prev, cgstPercentage: Number(e.target.value) || 0 }))}
                    placeholder="9"
                  />
                </div>
                <div className="space-y-2">
                  <Label>IGST Percentage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxConfig.igstPercentage}
                    onChange={(e) => setTaxConfig((prev) => ({ ...prev, igstPercentage: Number(e.target.value) || 0 }))}
                    placeholder="18"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Invoice Rate (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxConfig.invoiceRatePercentage}
                    onChange={(e) => setTaxConfig((prev) => ({ ...prev, invoiceRatePercentage: Number(e.target.value) || 0 }))}
                    placeholder="18"
                  />
                </div>
                <div className="space-y-2">
                  <Label>HSN Number</Label>
                  <Input
                    value={taxConfig.invoiceHsnCode}
                    onChange={(e) => setTaxConfig((prev) => ({ ...prev, invoiceHsnCode: e.target.value }))}
                    placeholder="998314"
                  />
                </div>
                <div className="space-y-2">
                  <Label>TDS Percentage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={taxConfig.tdsPercentage}
                    onChange={(e) => setTaxConfig((prev) => ({ ...prev, tdsPercentage: Number(e.target.value) || 0 }))}
                    placeholder="1.60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default Tax Type</Label>
                  <Select
                    value={taxConfig.defaultTaxType}
                    onValueChange={(value) => setTaxConfig((prev) => ({ ...prev, defaultTaxType: value as "SGST+CGST" | "IGST" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SGST+CGST">SGST + CGST (Domestic)</SelectItem>
                      <SelectItem value="IGST">IGST (International)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {activeConfigTab === "currency" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Domestic Currency</Label>
                  <Select
                    value={currencyConfig.domesticCurrency}
                    onValueChange={(value) => setCurrencyConfig((prev) => ({ ...prev, domesticCurrency: value as CurrencyType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyConfig.supportedCurrencies.map((curr) => (
                        <SelectItem key={curr.code} value={curr.code}>
                          {curr.symbol} {curr.code} - {curr.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Supported Currencies</Label>
                  <div className="grid gap-2 rounded-2xl border bg-muted/20 p-4 max-h-48 overflow-y-auto">
                    {currencyConfig.supportedCurrencies.map((curr) => (
                      <div
                        key={curr.code}
                        className="flex items-center justify-between rounded-lg border bg-background p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{curr.symbol}</span>
                          <span className="font-medium">{curr.code}</span>
                          <span className="text-muted-foreground">{curr.country}</span>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {curr.code === currencyConfig.domesticCurrency ? "Domestic" : "International"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
        </div>
      )}

      {/* Main Dashboard - hidden when settings view is open */}
      {mainTab === "clients" && !settingsViewOpen && (
        <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        <MetricCard title="Total Revenue" value={hasInvoiceData ? currencyLabel(metrics.totalRevenue) : "—"} change={hasInvoiceData ? `${metrics.approvedInvoiceCount} approved invoices` : "No approved invoices"} icon={Wallet} accent="bg-gradient-to-br from-indigo-500 to-purple-600" sparkline={hasInvoiceData ? metrics.revenueSpark : []} />
        <MetricCard title="Monthly Invoice Value" value={hasInvoiceData ? currencyLabel(metrics.monthlyInvoiceValue) : "—"} change={hasInvoiceData ? `${metrics.approvedInvoiceCount} approved invoices` : "No approved invoices"} icon={ReceiptText} accent="bg-gradient-to-br from-sky-500 to-indigo-600" sparkline={hasInvoiceData ? metrics.invoiceSpark : []} />
        <MetricCard
          title="Total Need to Generate"
          value={hasInvoiceData ? String(metrics.totalNeedToGenerate) : "—"}
          change={hasInvoiceData ? `Generated: ${metrics.generatedThisMonth} • Pending: ${metrics.pendingNeedToGenerate} • ${metrics.currentMonthLabel}` : "No invoice data"}
          icon={FileText}
          accent="bg-gradient-to-br from-violet-500 to-fuchsia-600"
          sparkline={hasInvoiceData ? [metrics.totalNeedToGenerate, metrics.generatedThisMonth, metrics.pendingNeedToGenerate] : []}
        />
        <MetricCard title="Active Clients" value={hasInvoiceData ? String(metrics.activeClients) : "—"} change={hasInvoiceData ? "+2 onboarded" : "No invoice data"} icon={Building2} accent="bg-gradient-to-br from-emerald-500 to-cyan-600" sparkline={hasInvoiceData ? [8, 8, 9, 9, 10, 10] : []} />
        <MetricCard title="Pending Invoices" value={hasInvoiceData ? String(metrics.pendingInvoices) : "—"} change={hasInvoiceData ? "-3 overdue risk" : "No invoice data"} icon={AlertTriangle} accent="bg-gradient-to-br from-orange-500 to-rose-600" sparkline={hasInvoiceData ? [5, 5, 4, 4, 3, 2] : []} />
        <MetricCard title="Transaction Volume" value={hasInvoiceData ? metrics.transactionVolume.toLocaleString() : "—"} change={hasInvoiceData ? "+21% volume" : "No invoice data"} icon={BarChart3} accent="bg-gradient-to-br from-fuchsia-500 to-violet-600" sparkline={hasInvoiceData ? [18, 21, 25, 29, 31, 36] : []} />
        <MetricCard title="Variable Revenue" value={hasInvoiceData ? currencyLabel(metrics.variableRevenue) : "—"} change={hasInvoiceData ? "+16.4%" : "No invoice data"} icon={TrendingUp} accent="bg-gradient-to-br from-emerald-500 to-teal-600" sparkline={hasInvoiceData ? [40, 45, 48, 54, 58, 63] : []} />
        <MetricCard title="High Priority Clients" value={hasInvoiceData ? String(metrics.highPriorityClients) : "—"} change={hasInvoiceData ? "+1 critical" : "No invoice data"} icon={ShieldCheck} accent="bg-gradient-to-br from-red-500 to-orange-600" sparkline={hasInvoiceData ? [2, 2, 3, 3, 4, 4] : []} />
        <MetricCard title="AWS Infra Recovery" value={hasInvoiceData ? currencyLabel(metrics.awsRecovery) : "—"} change={hasInvoiceData ? "+9.3%" : "No invoice data"} icon={Warehouse} accent="bg-gradient-to-br from-slate-600 to-sky-700" sparkline={hasInvoiceData ? [12, 14, 15, 18, 19, 21] : []} />
        <MetricCard title="Recon Revenue" value={hasInvoiceData ? currencyLabel(metrics.reconRevenue) : "—"} change={hasInvoiceData ? "+7.6%" : "No invoice data"} icon={Activity} accent="bg-gradient-to-br from-cyan-500 to-blue-600" sparkline={hasInvoiceData ? [30, 31, 33, 35, 36, 34] : []} />
        <MetricCard title="Profitability Revenue" value={hasInvoiceData ? currencyLabel(metrics.profitabilityRevenue) : "—"} change={hasInvoiceData ? "+5.1%" : "No invoice data"} icon={Sparkles} accent="bg-gradient-to-br from-violet-500 to-fuchsia-600" sparkline={hasInvoiceData ? [18, 19, 20, 21, 22, 23] : []} />
      </div>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Search, filter and control</CardTitle>
            <CardDescription>Search by client, filter by service and quickly jump into create or edit flows</CardDescription>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client name or code" className="pl-9" />
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue placeholder="Filter by service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {SERVICE_OPTIONS.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={() => setInvoiceModalOpen(true)}>
              <FileText className="h-4 w-4" /> Invoice Modal
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold">Dashboard Analytics</CardTitle>
              <CardDescription className="mt-0.5">Revenue trends, client contribution, transaction volume and service mix</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-right">
              <div>
                <p className="text-xs text-muted-foreground">Total Clients</p>
                <p className="text-lg font-bold text-foreground">{clients.length}</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-lg font-bold text-emerald-600">{clients.filter(c => normalizeInlineText(c.status).toLowerCase() !== "inactive").length}</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <p className="text-xs text-muted-foreground">Invoices</p>
                <p className="text-lg font-bold text-indigo-600">{allInvoicesFromClients.length}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Row 1: Revenue Trend + Invoice Volume side by side */}
          <div className="grid border-b xl:grid-cols-[1.6fr_1fr] divide-x divide-border">
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Revenue Trend</p>
                  <p className="text-xs text-muted-foreground">Monthly received vs pending invoice value</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-full bg-indigo-500" />Received</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-full bg-emerald-500" />Pending</span>
                </div>
              </div>
              <RevenueTrendChart data={dashboardAnalytics.revenueTrend} />
            </div>
            <div className="p-5">
              <div className="mb-3">
                <p className="text-sm font-semibold text-foreground">Invoice Activity</p>
                <p className="text-xs text-muted-foreground">Monthly approved invoice count</p>
              </div>
              <TransactionVolumeChart data={dashboardAnalytics.invoiceVolume} />
            </div>
          </div>

          {/* Row 2: Client Revenue Pie (full width) */}
          <div className="border-b p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Client Revenue Breakdown</p>
                <p className="text-xs text-muted-foreground">Revenue contribution and share breakdown by client</p>
              </div>
            </div>
            <ClientRevenuePie data={pieData} />
          </div>

          {/* Row 3: Service Distribution */}
          <div className="border-b p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Service Distribution</p>
                <p className="text-xs text-muted-foreground">Active service mix across all clients</p>
              </div>
              <Badge variant="outline" className="rounded-full text-[11px]">{dashboardAnalytics.serviceCategory.length} services</Badge>
            </div>
            <ServiceCategoryChart data={dashboardAnalytics.serviceCategory} clients={clients} />
          </div>

          {/* Row 4: Priority Heatmap (full width, top 5) */}
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Client Priority Heatmap</p>
                <p className="text-xs text-muted-foreground">All active clients ranked by revenue, transaction volume, services and AWS — scroll to view all</p>
              </div>
              <Badge variant="outline" className="rounded-full text-[11px]">{clients.filter(c => normalizeInlineText(c.status).toLowerCase() !== "inactive").length} clients · scroll →</Badge>
            </div>
            <PriorityHeatmap clients={clients} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Client Configurations</CardTitle>
            <CardDescription>Active client configs and admin-only inactive history</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-full border bg-muted/30 p-1">
              <Button
                type="button"
                size="sm"
                variant={clientConfigTab === "active" ? "default" : "ghost"}
                className="rounded-full"
                onClick={() => setClientConfigTab("active")}
              >
                Active
                <Badge variant="secondary" className="ml-2 rounded-full">{activeConfigClients.length}</Badge>
              </Button>
              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  variant={clientConfigTab === "history" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => setClientConfigTab("history")}
                >
                  History
                  <Badge variant="secondary" className="ml-2 rounded-full">{inactiveConfigClients.length}</Badge>
                </Button>
              )}
            </div>
            <Badge variant="outline" className="rounded-full">{filteredClients.length} visible</Badge>
            <Button className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500" onClick={() => navigate("/invoice-management/new")}>
              <Plus className="h-4 w-4" /> Create Config
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="grid min-w-[980px] gap-4 pb-2 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredClients.map((client) => (
                <ClientConfigCard
                  key={client.clientId || client.id}
                  client={client}
                  canManageConfigActions={canManageClientConfigActions}
                  onEdit={() => navigate(`/invoice-management/client/${client.clientId || client.code || client.id}/edit`)}
                  onDelete={clientConfigTab === "history" ? () => requestForceDeleteClient(client) : () => requestDeleteClient(client)}
                  onActivate={() => requestActivateClient(client)}
                  onOverview={() => navigate(`/invoice-management/client/${client.clientId || client.code || client.id}`)}
                />
              ))}
            </div>
          </ScrollArea>
          {filteredClients.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-medium">No matching clients</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {clientConfigTab === "history"
                  ? "No inactive clients yet. Soft-deleted clients will appear here for admins."
                  : "Try another search or service filter. This empty state is designed for premium enterprise dashboards."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(pendingDeleteClient)} onOpenChange={(open) => !open && setPendingDeleteClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Are you Sure?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This will deactivate <span className="font-medium text-foreground">{pendingDeleteClient?.clientName || "this client"}</span> and move it to the admin History tab.
            </p>
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDeleteClient(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirmDeleteClient()}>
                Deactivate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingForceDeleteClient)} onOpenChange={(open) => !open && setPendingForceDeleteClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Are your Sure?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This will permanently delete <span className="font-medium text-foreground">{pendingForceDeleteClient?.clientName || "this client"}</span> from History.
            </p>
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingForceDeleteClient(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirmForceDeleteClient()}>
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingActivateClient)} onOpenChange={(open) => !open && setPendingActivateClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Are you Sure?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This will activate <span className="font-medium text-foreground">{pendingActivateClient?.clientName || "this client"}</span> and move it back to Active configurations.
            </p>
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingActivateClient(null)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmActivateClient()}>
                Activate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceHistoryTable
        title="Invoice History Table"
        subtitle="Statuses, generated dates and delivery actions"
        invoices={allInvoicesFromClients}
        showClient
        canManageApprovalActions={canManageInvoiceApprovalActions}
        onEdit={(invoice) => openInvoiceEditModal(invoice)}
        onApprove={(invoice) => approveInvoice(invoice)}
        onReject={(invoice) => rejectInvoice(invoice)}
        onSend={(invoice) => sendInvoice(invoice)}
        onPaid={(invoice) => markInvoicePaid(invoice)}
        onClose={(invoice) => closeInvoice(invoice)}
        onStatusChange={(invoice, status) => updateInvoiceByNumber(getInvoiceDisplayNumber(invoice), (item) => ({ ...item, status }))}
        onDownloadPdf={(invoice) => downloadInvoicePdf(invoice)}
        onDownloadDocx={(invoice) => downloadInvoiceDocx(invoice)}
        onPreview={(invoice) => previewInvoicePdf(invoice)}
        onDelete={(invoice) => deleteInvoiceByNumber(getInvoiceDisplayNumber(invoice))}
      />

      <Dialog
        open={previewModalOpen}
        onOpenChange={(open) => {
          setPreviewModalOpen(open);
          if (!open) {
            setPreviewingInvoice(null);
            setPreviewPayload(null);
          }
        }}
      >
        <DialogOverlay className="z-[90] bg-black/60 backdrop-blur-sm" />
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">
                {previewingInvoice ? getInvoiceDisplayNumber(previewingInvoice) : "Invoice Preview"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">Invoice data preview</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreviewModalOpen(false)}
              className="h-6 w-6"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </DialogHeader>

          {previewPayload && (
            <div className="space-y-6 bg-white p-6 rounded-lg">
              {/* Invoice Header */}
              <div className="border-b pb-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{previewPayload.client?.name}</h2>
                    <p className="text-sm text-gray-600">{previewPayload.client?.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-700">Invoice Number</p>
                    <p className="text-lg font-bold text-gray-900">{previewPayload.invoiceNumber}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Invoice Date</p>
                    <p className="font-medium text-gray-900">{formatInvoicePdfDate(previewPayload.generatedDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Service Period</p>
                    <p className="font-medium text-gray-900">{previewPayload.month}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Financial Year</p>
                    <p className="font-medium text-gray-900">{previewPayload.financialYear}</p>
                  </div>
                </div>
              </div>

              {/* Invoice Amount */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-lg border border-indigo-100">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Invoice Amount</p>
                    <p className="text-3xl font-bold text-gray-900">{currencyLabel(previewPayload.amount, previewPayload.client?.currency || "INR")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 mb-2">Status</p>
                    <p className="text-lg font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">{previewPayload.status}</p>
                  </div>
                </div>
              </div>

              {/* Invoice Details */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-4">Invoice Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Invoice Type</span>
                    <span className="font-medium text-gray-900">{previewPayload.invoiceType}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Client Code</span>
                    <span className="font-medium text-gray-900">{previewPayload.client?.code}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">GST Number</span>
                    <span className="font-medium text-gray-900">{previewPayload.client?.gstin || "—"}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Currency</span>
                    <span className="font-medium text-gray-900">{previewPayload.client?.currency || "INR"}</span>
                  </div>
                </div>
              </div>

              {/* Company Details */}
              {previewPayload.companyConfig && (
                <div className="border-t pt-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Company Details</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><strong>{previewPayload.companyConfig.companyName}</strong></p>
                    <p>{previewPayload.companyConfig.address}</p>
                    <p>Email: {previewPayload.companyConfig.email}</p>
                    <p>Phone: {previewPayload.companyConfig.phone}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader>
          <SectionTitle title="Notifications and activity timeline" subtitle="Overdue invoices, AWS spikes and slab threshold alerts" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {NOTIFICATIONS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-3xl border bg-background p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={cn("rounded-2xl p-3", item.tone === "red" && "bg-red-500/10 text-red-600", item.tone === "amber" && "bg-amber-500/10 text-amber-600", item.tone === "blue" && "bg-blue-500/10 text-blue-600", item.tone === "emerald" && "bg-emerald-500/10 text-emerald-600")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={invoiceModalOpen}
        onOpenChange={(open) => {
          setInvoiceModalOpen(open);
          if (!open) {
            setInvoiceNumberConflictOpen(false);
            invoiceConflictActionRef.current = null;
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {invoiceModalMode === "edit" ? "Edit Invoice" : "Invoice Generation Modal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Client</Label>
                <Input value={selectedInvoice?.client || selectedClient?.name || ""} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Invoice Amount</Label>
                <Input
                  type={invoiceModalMode === "edit" ? "number" : "text"}
                  value={invoiceModalMode === "edit" ? invoiceAmountDraft : currencyLabel(invoiceAmountDraft > 0 ? invoiceAmountDraft : (selectedClient?.monthlyInvoiceEstimate || 0))}
                  onChange={(e) => setInvoiceAmountDraft(Number(e.target.value) || 0)}
                  readOnly={invoiceModalMode !== "edit"}
                  placeholder={`${currencyLabel(selectedClient?.monthlyInvoiceEstimate || 0)}`}
                />
                {invoiceModalMode !== "edit" && (
                  <p className="text-xs text-muted-foreground">
                    + {currencyLabel(Math.round((invoiceAmountDraft > 0 ? invoiceAmountDraft : (selectedClient?.monthlyInvoiceEstimate || 0)) * 0.18))} tax (18%) = {currencyLabel(Math.round((invoiceAmountDraft > 0 ? invoiceAmountDraft : (selectedClient?.monthlyInvoiceEstimate || 0)) * 1.18))} final payable
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDateDraft || new Date().toISOString().split("T")[0]}
                  onChange={(e) => setInvoiceDateDraft(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  PDF format: {formatInvoicePdfDate(invoiceDateDraft || new Date().toISOString().split("T")[0])}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Invoice Month</Label>
                <Input
                  value={invoiceMonthDraft || new Date().toLocaleString("en-IN", { month: "short", year: "numeric" })}
                  onChange={(e) => setInvoiceMonthDraft(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Input value={invoiceModalMode === "edit" ? "Generated" : "Waiting for approval"} readOnly />
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Invoice Number Preview:</span>
                {invoiceModalMode !== "edit" && invoiceNumberIsUnavailable && (
                  <>
                    <Badge variant="destructive" className="rounded-full">
                      Already generated
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { void handleInvoiceSubmit(true); }}
                    >
                      Override
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={invoiceModalMode === "edit" ? modalInvoicePreview : invoiceNumberDraftValue}
                  onChange={(e) => {
                    setInvoiceNumberDraft(e.target.value);
                    setInvoiceNumberAvailability(null);
                  }}
                  readOnly={invoiceModalMode === "edit"}
                  className="font-mono"
                />
                {invoiceModalMode !== "edit" && (
                  <Button type="button" variant="outline" onClick={() => checkInvoiceNumberAvailability(invoiceNumberDraftValue)}>
                    Check availability
                  </Button>
                )}
              </div>
              <p className="text-xs">
                {invoiceModalMode === "edit"
                  ? "This number is saved with the existing invoice record."
                  : invoiceNumberAvailability
                    ? invoiceNumberAvailability.message
                    : "Edit the invoice number before submitting. If it already exists, we will ask before replacing it."}
              </p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              {invoiceModalMode === "edit"
                ? "Only invoices approved by the FinOps admin can be edited and updated."
                : invoiceNumberIsUnavailable
                  ? "This invoice number already exists. You can replace the existing invoice or change the number before submitting."
                  : "Invoice requests start in Waiting for approval. FinOps admin must approve before the invoice becomes Generated."}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInvoiceModalOpen(false)}>Close</Button>
              <Button
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                onClick={() => {
                  void handleInvoiceSubmit(false);
                }}
              >
                {invoiceModalMode === "edit" ? "Update Invoice" : "Submit for approval"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={invoiceNumberConflictOpen}
        onOpenChange={(open) => {
          setInvoiceNumberConflictOpen(open);
          if (!open) invoiceConflictActionRef.current = null;
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invoice number already exists</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              This invoice number is already generated. Choose whether to replace the existing invoice or change the number and try again.
            </p>
            <div className="rounded-2xl border bg-muted/20 p-3 font-mono text-foreground">
              {invoiceNumberDraftValue}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInvoiceNumberConflictOpen(false)}>
                Change number
              </Button>
              <Button
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                onClick={() => {
                  const action = invoiceConflictActionRef.current;
                  invoiceConflictActionRef.current = null;
                  setInvoiceNumberConflictOpen(false);
                  action?.();
                }}
              >
                Override
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Generated Invoices Modal */}
      <Dialog open={showExportInvoicesModal} onOpenChange={setShowExportInvoicesModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export Generated Invoices</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="export-month">Month</Label>
              <select
                id="export-month"
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="01">January</option>
                <option value="02">February</option>
                <option value="03">March</option>
                <option value="04">April</option>
                <option value="05">May</option>
                <option value="06">June</option>
                <option value="07">July</option>
                <option value="08">August</option>
                <option value="09">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-year">Year</Label>
              <Input
                id="export-year"
                type="number"
                value={exportYear}
                onChange={(e) => setExportYear(e.target.value)}
                min="2020"
                max={new Date().getFullYear()}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowExportInvoicesModal(false)}>
                Cancel
              </Button>
              <Button
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                onClick={() => {
                  exportGeneratedInvoicesToExcel(exportMonth, exportYear);
                  setShowExportInvoicesModal(false);
                }}
              >
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

        </>
      )}

    </div>
  );
}
