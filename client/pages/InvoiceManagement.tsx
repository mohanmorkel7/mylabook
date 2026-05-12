import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit3,
  FileDown,
  FileText,
  Layers3,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  Warehouse,
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
  Paid: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-500/10 text-rose-700 border-rose-200",
  Overdue: "bg-red-500/10 text-red-700 border-red-200",
  Closed: "bg-slate-500/10 text-slate-700 border-slate-200",
};

const MYLAPAY_LOGO_URL = "/mylapaylogo.png";

const MYLAPAY_BRANDING = {
  companyName: "Mylapay",
  address: "Coimbatore, Tamil Nadu, India",
  email: "contact@mylapay.com",
  phone: "+91 98765 43210",
  gstin: "GSTIN: —",
  lutNumber: "LUT: —",
  footerLine: "Thank you for your business. Please refer to this invoice for payment and reconciliation.",
  authorizedLabel: "Authorized Signatory",
};

const INVOICE_SERIAL_CONFIG_KEY = "invoice-serial-config";
const INVOICE_SERIAL_STATE_KEY = "invoice-serial-state";

type InvoiceNumberFormat = "PREFIX/FY/SEQ" | "PREFIX-FY-SEQ" | "FY/SEQ";

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

const DEFAULT_INVOICE_SERIAL_CONFIG: InvoiceSerialConfig = {
  prefix: "MYL",
  separator: "/",
  serialDigits: 4,
  format: "PREFIX/FY/SEQ",
  financialYearStartMonth: 4,
};

function getIstNow() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
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
    case "PREFIX-FY-SEQ":
      return `${config.prefix}-${financialYear}-${serialPart}`;
    case "PREFIX/FY/SEQ":
    default:
      return `${config.prefix}${config.separator}${financialYear}${config.separator}${serialPart}`;
  }
}

function getCurrentInvoiceNumberPreview(config: InvoiceSerialConfig) {
  const financialYear = getFinancialYearLabel(
    getIstNow(),
    config.financialYearStartMonth,
  );
  return buildInvoiceNumber(config, financialYear, 1);
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
      { invoiceId: "INV-2026-041", month: "Apr 2026", amount: 208000, status: "Paid", generatedDate: "2026-04-30" },
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
      { invoiceId: "INV-2026-101", month: "Apr 2026", amount: 1218000, status: "Paid", generatedDate: "2026-04-30" },
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
      { invoiceId: "INV-2026-301", month: "Apr 2026", amount: 870000, status: "Paid", generatedDate: "2026-04-28" },
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
      { invoiceId: "INV-2026-401", month: "Apr 2026", amount: 515000, status: "Paid", generatedDate: "2026-04-20" },
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
  invoiceHistory?: InvoiceRecord[];
};

type InvoiceStatus =
  | "Waiting for approval"
  | "Generated"
  | "Send"
  | "Paid"
  | "Rejected"
  | "Overdue"
  | "Closed";

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
}

const INVOICES: InvoiceRecord[] = [
  { invoiceId: "INV-2026-041", month: "Apr 2026", client: "Payswiff", amount: 208000, status: "Paid", generatedDate: "2026-04-30" },
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

const MONTHLY_TREND = [
  { month: "Jan", fixed: 145, variable: 52, total: 197 },
  { month: "Feb", fixed: 150, variable: 59, total: 209 },
  { month: "Mar", fixed: 171, variable: 70, total: 241 },
  { month: "Apr", fixed: 176, variable: 74, total: 250 },
  { month: "May", fixed: 183, variable: 83, total: 266 },
  { month: "Jun", fixed: 196, variable: 92, total: 288 },
];

const TRANSACTION_VOLUME = [
  { month: "Jan", value: 18 },
  { month: "Feb", value: 21 },
  { month: "Mar", value: 25 },
  { month: "Apr", value: 29 },
  { month: "May", value: 31 },
  { month: "Jun", value: 36 },
];

const SERVICE_CATEGORY = [
  { category: "Recon", value: 34 },
  { category: "Profitability", value: 22 },
  { category: "Clearing", value: 12 },
  { category: "Currency Conversion", value: 15 },
  { category: "AWS Infra", value: 10 },
  { category: "APB", value: 7 },
  { category: "FIRC", value: 8 },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function currencyLabel(value: number) {
  return `₹${formatCurrency(value)}`;
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

async function downloadInvoiceDocxTemplate({
  client,
  invoiceNumber,
  generatedDate,
  amount,
  status,
  month,
  financialYear,
  serial,
}: {
  client: ClientRecord;
  invoiceNumber: string;
  generatedDate: string;
  amount: number;
  status: string;
  month: string;
  financialYear: string;
  serial: number;
}) {
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
          .header { display:flex; justify-content:space-between; align-items:flex-start; border:1px solid #dbeafe; border-top:8px solid #2563eb; border-radius:16px; padding:18px 20px; background:#f8fbff; }
          .brand { width: 160px; }
          .title { font-size: 28px; font-weight: 700; color:#1d4ed8; margin:0; text-align:right; }
          .meta { text-align:right; font-size: 13px; color:#475569; line-height:1.6; margin-top:6px; }
          .panel { margin-top:16px; border:1px solid #e2e8f0; border-radius:16px; padding:16px 18px; background:#fff; }
          .panel.blue { background:#eff6ff; border-color:#bfdbfe; }
          .row { display:flex; gap:16px; }
          .col { flex:1; }
          .section-title { font-size: 16px; font-weight: 700; color:#1d4ed8; margin:0 0 10px 0; }
          .label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color:#64748b; margin-top:10px; }
          .value { font-size: 14px; margin-top:4px; white-space: pre-wrap; }
          table { width:100%; border-collapse: collapse; margin-top: 12px; }
          thead th { background:#1d4ed8; color:white; text-align:left; padding:10px 12px; font-size:13px; }
          tbody td { border-bottom:1px solid #e2e8f0; padding:10px 12px; font-size:13px; }
          .summary { display:flex; justify-content:space-between; gap:12px; margin-top:14px; padding:12px 14px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:14px; font-weight:600; }
          .sign { margin-top:18px; display:flex; gap:18px; }
          .box { flex:1; min-height:90px; border:1px solid #bfdbfe; border-radius:14px; padding:12px; }
          .foot { margin-top:18px; border-top:1px solid #e2e8f0; padding-top:10px; color:#64748b; font-size:12px; line-height:1.6; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand"><img src="${MYLAPAY_LOGO_URL}" style="max-width:130px; max-height:44px; object-fit:contain" /></div>
          <div>
            <h1 class="title">Tax Invoice</h1>
            <div class="meta">Invoice Number: ${invoiceNumber}<br/>Financial Year: ${financialYear} · Serial #${serial}<br/>Month: ${month}</div>
          </div>
        </div>
        <div class="panel blue">
          <div class="section-title">Invoice Summary</div>
          <div style="display:flex; justify-content:space-between; gap:12px; font-size:14px;">
            <div>Status: ${status}</div><div>Generated Date: ${generatedDate}</div><div>Amount: INR ${formatCurrency(amount)}</div>
          </div>
        </div>
        <div class="panel row">
          <div class="col">
            <div class="section-title">Bill From</div>
            <div class="label">Company</div><div class="value">${MYLAPAY_BRANDING.companyName}</div>
            <div class="label">Address</div><div class="value">${MYLAPAY_BRANDING.address}</div>
            <div class="label">Email</div><div class="value">${MYLAPAY_BRANDING.email}</div>
            <div class="label">Phone</div><div class="value">${MYLAPAY_BRANDING.phone}</div>
            <div class="label">GSTIN</div><div class="value">${MYLAPAY_BRANDING.gstin}</div>
            <div class="label">LUT</div><div class="value">${MYLAPAY_BRANDING.lutNumber}</div>
          </div>
          <div class="col">
            <div class="section-title">Bill To</div>
            <div class="label">Client</div><div class="value">${getClientDisplayBillingName(client)}</div>
            <div class="label">Client Code</div><div class="value">${client.code}</div>
            <div class="label">GSTIN</div><div class="value">${getClientGstin(client)}</div>
            <div class="label">LUT</div><div class="value">${getClientLut(client)}</div>
            <div class="label">Billing Email</div><div class="value">${client.billingEmail || "—"}</div>
            <div class="label">Billing Address</div><div class="value">${getClientBillToAddress(client)}</div>
          </div>
        </div>
        <div class="panel blue">
          <div class="section-title">Bill Details</div>
          <div class="row">
            <div class="col"><div class="label">Invoice Month</div><div class="value">${month}</div></div>
            <div class="col"><div class="label">Transaction Volume</div><div class="value">${client.monthlyTransactionVolume.toLocaleString()}</div></div>
          </div>
          <div class="row">
            <div class="col"><div class="label">Invoice Status</div><div class="value">${status}</div></div>
            <div class="col"><div class="label">Last Invoice Generated</div><div class="value">${client.lastInvoiceGenerated}</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Statement of Charges</div>
          <table>
            <thead><tr><th>Particulars</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>
              ${getInvoiceHistoryLineItemSummary(client, amount)
                .map((item) => `<tr><td>${item.description}</td><td style="text-align:right">INR ${formatCurrency(item.amount)}</td></tr>`)
                .join("")}
            </tbody>
          </table>
          <div class="summary"><span>Subtotal: INR ${formatCurrency(getInvoiceHistoryLineItemSummary(client, amount).reduce((sum, item) => sum + item.amount, 0))}</span><span>GST / Tax: ${client.lutNumber ? "LUT exempt" : `INR ${formatCurrency(getInvoiceHistoryLineItemSummary(client, amount).reduce((sum, item) => sum + item.amount, 0) * 0.18)}`}</span><span>Final Payable: INR ${formatCurrency(getInvoiceHistoryLineItemSummary(client, amount).reduce((sum, item) => sum + item.amount, 0) + (client.lutNumber ? 0 : getInvoiceHistoryLineItemSummary(client, amount).reduce((sum, item) => sum + item.amount, 0) * 0.18))}</span></div>
        </div>
        <div class="sign">
          <div class="box"><div class="section-title">Company Seal</div><div class="value">Space reserved for seal</div></div>
          <div class="box"><div class="section-title">Authority Signature Name</div><div class="value">${getClientSignatureName(client)}</div><div class="value" style="margin-top:18px;border-top:1px solid #bfdbfe;padding-top:8px">Authorized signatory · For ${MYLAPAY_BRANDING.companyName}</div></div>
        </div>
        <div class="foot">${MYLAPAY_BRANDING.footerLine}<br/>${MYLAPAY_BRANDING.companyName} · ${MYLAPAY_BRANDING.address} · ${MYLAPAY_BRANDING.email} · ${MYLAPAY_BRANDING.phone}</div>
      </body>
    </html>
  `;
  downloadBlob(
    `${invoiceNumber}.docx`,
    new Blob([html], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
  );
}

function getInvoiceDisplayNumber(invoice: any) {
  return invoice.invoiceNumber || invoice.invoice_id || invoice.invoiceId || "—";
}

function isInvoiceEditable(status: InvoiceStatus) {
  return status === "Generated";
}

function isInvoiceAwaitingApproval(status: InvoiceStatus) {
  return status === "Waiting for approval";
}

function updateInvoiceCollection(
  invoices: InvoiceRecord[],
  targetInvoiceNumber: string,
  updater: (invoice: InvoiceRecord) => InvoiceRecord,
) {
  return invoices.map((invoice) => (getInvoiceDisplayNumber(invoice) === targetInvoiceNumber ? updater(invoice) : invoice));
}

function deleteInvoiceFromCollection(invoices: InvoiceRecord[], targetInvoiceNumber: string) {
  return invoices.filter((invoice) => getInvoiceDisplayNumber(invoice) !== targetInvoiceNumber);
}

function getInvoiceHistoryLineItemSummary(client: ClientRecord, invoiceAmount: number) {
  const fixedBilling = client.fixedBilling;
  const awsCharge = client.aws?.enabled ? client.aws.vendorCost * (client.aws.marginPercentage / 100) : 0;
  const remainingAfterFixed = Math.max(invoiceAmount - fixedBilling - awsCharge, 0);
  return [
    { description: "Fixed Commercial Charges", amount: fixedBilling },
    { description: "Variable Slab Charges", amount: Math.max(remainingAfterFixed - client.integrationFee - client.additionalPlatformFee, 0) },
    { description: "AWS Infra Pass-through", amount: awsCharge },
    { description: "Additional Platform Fee", amount: client.additionalPlatformFee },
    { description: "Integration Fee", amount: client.integrationFee },
  ];
}

function getClientDisplayBillingName(client: ClientRecord) {
  return client.name;
}

function getClientBillToAddress(client: ClientRecord) {
  return client.billingAddress || "—";
}

function getClientGstin(client: ClientRecord) {
  return client.gstin || "—";
}

function getClientLut(client: ClientRecord) {
  return client.lutNumber || "—";
}

function getClientSignatureName(client: ClientRecord) {
  return client.signatoryName || "Authorized Signatory";
}

async function downloadInvoicePdfTemplate({
  client,
  invoiceNumber,
  generatedDate,
  amount,
  status,
  month,
  financialYear,
  serial,
}: {
  client: ClientRecord;
  invoiceNumber: string;
  generatedDate: string;
  amount: number;
  status: string;
  month: string;
  financialYear: string;
  serial: number;
}) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const gutter = 6;
  const logoData = await fetchImageDataUrl(MYLAPAY_LOGO_URL);
  const money = (value: number) => `INR ${formatCurrency(value)}`;
  const wrap = (value: string, width: number) => doc.splitTextToSize(String(value || "—"), width) as string[];

  const drawPanel = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: [number, number, number],
    stroke: [number, number, number],
  ) => {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
    doc.roundedRect(x, y, width, height, 4, 4, "FD");
  };

  const measureFieldBlock = (fields: Array<{ label: string; value: string }>, width: number) => {
    return fields.reduce((height, field) => {
      const valueLines = wrap(field.value, width);
      return height + 3.5 + valueLines.length * 4.2 + 2.5;
    }, 10);
  };

  const renderFieldBlock = (
    x: number,
    y: number,
    width: number,
    title: string,
    fields: Array<{ label: string; value: string }>,
    options?: { titleColor?: [number, number, number]; bodyColor?: [number, number, number] },
  ) => {
    const titleColor = options?.titleColor || [29, 78, 216];
    const bodyColor = options?.bodyColor || [15, 23, 42];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.8);
    doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    doc.text(title, x + 4, y + 6);

    let cursorY = y + 13;
    fields.forEach((field) => {
      const lines = wrap(field.value, width - 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(96, 112, 133);
      doc.text(field.label, x + 4, cursorY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.4);
      doc.setTextColor(bodyColor[0], bodyColor[1], bodyColor[2]);
      doc.text(lines, x + 4, cursorY + 4);
      cursorY += 3.8 + lines.length * 4.2 + 1.8;
    });
  };

  const drawTwoColumnDetail = (
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    align: "left" | "right" = "left",
  ) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(96, 112, 133);
    doc.text(label, align === "right" ? x + width : x, y, { align });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(wrap(value, width)[0], align === "right" ? x + width : x, y + 5, { align });
  };

  doc.setFillColor(248, 251, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(margin, margin, contentWidth, 32, 5, 5, "FD");
  doc.setFillColor(37, 99, 235);
  doc.rect(margin, margin, contentWidth, 2, "F");
  if (logoData) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 4, margin + 7, 38, 16, 3, 3, "F");
      doc.addImage(logoData, "PNG", margin + 6, margin + 9, 30, 10);
    } catch {}
  }
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17.5);
  doc.text("Tax Invoice", pageWidth - margin - 4, margin + 11, { align: "right" });
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.text(`Invoice Number: ${invoiceNumber}`, pageWidth - margin - 4, margin + 18, { align: "right" });
  doc.text(`Financial Year: ${financialYear} · Serial #${serial}`, pageWidth - margin - 4, margin + 22, { align: "right" });
  doc.text(`Month: ${month}`, pageWidth - margin - 4, margin + 26, { align: "right" });

  let y = margin + 38;
  drawPanel(margin, y, contentWidth, 20, [239, 246, 255], [191, 219, 254]);
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.8);
  doc.text("Invoice Summary", margin + 4, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.setTextColor(51, 65, 85);
  doc.text(`Status: ${status}`, margin + 4, y + 13);
  doc.text(`Generated Date: ${generatedDate}`, pageWidth / 2, y + 13, { align: "center" });
  doc.text(`Amount: ${money(amount)}`, pageWidth - margin - 4, y + 13, { align: "right" });

  y += 26;
  const leftBillFrom = [
    { label: "Company", value: MYLAPAY_BRANDING.companyName },
    { label: "Address", value: MYLAPAY_BRANDING.address },
    { label: "Email", value: MYLAPAY_BRANDING.email },
    { label: "Phone", value: MYLAPAY_BRANDING.phone },
    { label: "GSTIN", value: MYLAPAY_BRANDING.gstin },
    { label: "LUT", value: MYLAPAY_BRANDING.lutNumber },
  ];
  const rightBillTo = [
    { label: "Client", value: getClientDisplayBillingName(client) },
    { label: "Client Code", value: client.code },
    { label: "GSTIN", value: getClientGstin(client) },
    { label: "LUT", value: getClientLut(client) },
    { label: "Billing Email", value: client.billingEmail || "—" },
    { label: "Billing Address", value: getClientBillToAddress(client) },
  ];
  const cardHeight = Math.max(
    measureFieldBlock(leftBillFrom, (contentWidth - gutter) / 2),
    measureFieldBlock(rightBillTo, (contentWidth - gutter) / 2),
  );
  drawPanel(margin, y, (contentWidth - gutter) / 2, cardHeight, [255, 255, 255], [226, 232, 240]);
  drawPanel(margin + (contentWidth - gutter) / 2 + gutter, y, (contentWidth - gutter) / 2, cardHeight, [255, 255, 255], [226, 232, 240]);
  renderFieldBlock(margin, y, (contentWidth - gutter) / 2, "Bill From", leftBillFrom);
  renderFieldBlock(margin + (contentWidth - gutter) / 2 + gutter, y, (contentWidth - gutter) / 2, "Bill To", rightBillTo);

  y += cardHeight + 8;
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.8);
  doc.text("Bill Details", margin, y);
  y += 4;
  drawPanel(margin, y, contentWidth, 28, [248, 250, 252], [226, 232, 240]);
  const halfWidth = (contentWidth - 10) / 2;
  drawTwoColumnDetail(margin + 4, y + 6, halfWidth, "Invoice Month", month);
  drawTwoColumnDetail(margin + 4 + halfWidth + 6, y + 6, halfWidth, "Transaction Volume", client.monthlyTransactionVolume.toLocaleString(), "right");
  drawTwoColumnDetail(margin + 4, y + 18, halfWidth, "Invoice Status", status);
  drawTwoColumnDetail(margin + 4 + halfWidth + 6, y + 18, halfWidth, "Last Invoice Generated", client.lastInvoiceGenerated, "right");

  y += 36;
  const lineItems = getInvoiceHistoryLineItemSummary(client, amount);
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.8);
  doc.text("Statement of Charges", margin, y);
  y += 4;
  const tableX = margin;
  const tableWidth = contentWidth;
  const tableHeaderHeight = 9;
  const rowHeights = lineItems.map((item) => Math.max(8.5, wrap(item.description, tableWidth - 45).length * 4.2 + 3.5));
  const tableBodyHeight = tableHeaderHeight + rowHeights.reduce((sum, height) => sum + height, 0);
  drawPanel(tableX, y, tableWidth, tableBodyHeight, [255, 255, 255], [226, 232, 240]);
  doc.setFillColor(37, 99, 235);
  doc.rect(tableX, y, tableWidth, tableHeaderHeight, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Particulars", tableX + 3, y + 6);
  doc.text("Amount", tableX + tableWidth - 3, y + 6, { align: "right" });

  let rowY = y + tableHeaderHeight + 5.5;
  lineItems.forEach((item, index) => {
    const descLines = wrap(item.description, tableWidth - 45);
    const rowHeight = rowHeights[index];
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(tableX + 1, rowY - 4, tableWidth - 2, rowHeight, "F");
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.1);
    doc.text(descLines, tableX + 3, rowY - 0.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.1);
    doc.text(money(item.amount), tableX + tableWidth - 3, rowY - 0.5, { align: "right" });
    rowY += rowHeight;
  });

  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const gst = client.lutNumber ? 0 : subtotal * 0.18;
  const totalPayable = subtotal + gst;

  y = rowY + 2;
  drawPanel(margin, y, contentWidth, 24, [239, 246, 255], [191, 219, 254]);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.8);
  doc.text(`Subtotal: ${money(subtotal)}`, margin + 4, y + 8);
  doc.text(`GST / Tax: ${gst > 0 ? money(gst) : "LUT exempt"}`, margin + 4, y + 14);
  doc.setFont("helvetica", "bold");
  doc.text(`Final Payable: ${money(totalPayable)}`, pageWidth - margin - 4, y + 11, { align: "right" });

  y += 30;
  const sealWidth = (contentWidth - gutter) * 0.38;
  const signWidth = contentWidth - sealWidth - gutter;
  drawPanel(margin, y, sealWidth, 34, [255, 255, 255], [191, 219, 254]);
  drawPanel(margin + sealWidth + gutter, y, signWidth, 34, [255, 255, 255], [191, 219, 254]);

  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.2);
  doc.text("Company Seal", margin + sealWidth / 2, y + 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(100, 116, 139);
  doc.text("Space reserved for seal", margin + sealWidth / 2, y + 14, { align: "center" });
  doc.setDrawColor(191, 219, 254);
  doc.line(margin + 5, y + 22, margin + sealWidth - 5, y + 22);

  const signX = margin + sealWidth + gutter;
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.2);
  doc.text("Authority Signature Name", signX + 4, y + 8);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.2);
  doc.text(getClientSignatureName(client), signX + 4, y + 14);
  doc.setDrawColor(191, 219, 254);
  doc.line(signX + 4, y + 21, signX + signWidth - 4, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(100, 116, 139);
  doc.text("Authorized signatory", signX + 4, y + 27);
  doc.text(`For ${MYLAPAY_BRANDING.companyName}`, signX + signWidth - 4, y + 27, { align: "right" });

  const footerY = pageHeight - 15;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.1);
  doc.text(wrap(MYLAPAY_BRANDING.footerLine, contentWidth), margin, footerY);
  doc.text(
    wrap(
      `${MYLAPAY_BRANDING.companyName} · ${MYLAPAY_BRANDING.address} · ${MYLAPAY_BRANDING.email} · ${MYLAPAY_BRANDING.phone}`,
      contentWidth,
    ),
    margin,
    footerY + 4,
  );

  doc.save(`${invoiceNumber}.pdf`);
}

function getInvoiceNumberForClient(
  client: ClientRecord,
  config: InvoiceSerialConfig,
  state: InvoiceSerialState,
) {
  const financialYear = getFinancialYearLabel(getIstNow(), config.financialYearStartMonth);
  const serial = state.financialYear === financialYear ? state.serial + 1 : 1;
  return {
    invoiceNumber: buildInvoiceNumber(config, financialYear, serial),
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

function estimateInvoiceFromSlabs(
  txnCount: number,
  fixedBilling: number,
  slabs: ClientRecord["transactionSlabs"],
  aws: ClientRecord["aws"],
  minimumGuarantee: number,
  integrationFee: number,
  platformFee: number,
) {
  const variable = slabs.reduce((sum, slab) => {
    const slabStart = slab.from;
    const slabEnd = slab.to ?? Number.POSITIVE_INFINITY;
    const covered = Math.max(0, Math.min(txnCount, slabEnd) - slabStart);
    const unitMultiplier = slab.unit === "paisa" ? 0.01 : 1;
    return sum + covered * slab.rate * unitMultiplier;
  }, 0);
  const awsMarkup = aws.enabled ? aws.vendorCost * (aws.marginPercentage / 100) : 0;
  const raw = fixedBilling + variable + awsMarkup + integrationFee + platformFee;
  return Math.max(raw, minimumGuarantee);
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
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
          <div className="mt-4 text-white/90">
            <Sparkline values={sparkline} />
          </div>
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
  return (
    <Badge variant="outline" className={cn("rounded-full border", INVOICE_STATUS_META[status])}>
      {status}
    </Badge>
  );
}

function InvoiceRowActions({
  invoice,
  onEdit,
  onApprove,
  onReject,
  onSend,
  onPaid,
  onClose,
  onStatusChange,
  onDownloadPdf,
  onDownloadDocx,
  onDelete,
}: {
  invoice: InvoiceRecord;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSend: () => void;
  onPaid: () => void;
  onClose: () => void;
  onStatusChange: (status: InvoiceStatus) => void;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  onDelete: () => void;
}) {
  const waiting = isInvoiceAwaitingApproval(invoice.status);
  const generated = invoice.status === "Generated";
  const sent = invoice.status === "Send";
  const paid = invoice.status === "Paid";
  const canEdit = generated;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[210px] rounded-2xl border bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Status</p>
          <select
            value={invoice.status}
            onChange={(e) => onStatusChange(e.target.value as InvoiceStatus)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-background px-3 text-sm outline-none ring-0 transition focus:border-primary"
          >
            {[
              "Waiting for approval",
              "Generated",
              "Send",
              "Paid",
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
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onEdit} title="Edit invoice">
            <Edit3 className="h-4 w-4" />
          </Button>
        )}
        {waiting && (
          <>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-emerald-200 text-emerald-700" onClick={onApprove} title="Approve invoice">
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-rose-200 text-rose-600" onClick={onReject} title="Reject invoice">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        {generated && (
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onSend} title="Send invoice">
            <FileText className="h-4 w-4" />
          </Button>
        )}
        {(generated || sent) && (
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onPaid} title="Mark as paid">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {paid && (
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onClose} title="Close invoice">
            <ShieldCheck className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onDownloadPdf} title="Export PDF">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-xl gap-2" onClick={onDownloadDocx} title="Export DOCX">
          <FileDown className="h-4 w-4" /> DOCX
        </Button>
        <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-rose-200 text-rose-600" onClick={onDelete} title="Delete invoice">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
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
  const colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b"];
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={72} outerRadius={110} paddingAngle={4}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: any) => currencyLabel(Number(value) * 1000)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RevenueTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={MONTHLY_TREND}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
        <XAxis dataKey="month" stroke="currentColor" />
        <YAxis stroke="currentColor" />
        <Tooltip formatter={(value: any) => `${value} L`} />
        <Legend />
        <Line type="monotone" dataKey="fixed" stroke="#6366f1" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="variable" stroke="#10b981" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TransactionVolumeChart() {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={TRANSACTION_VOLUME}>
        <defs>
          <linearGradient id="txnVolume" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
        <XAxis dataKey="month" stroke="currentColor" />
        <YAxis stroke="currentColor" />
        <Tooltip formatter={(value: any) => `${value}M`} />
        <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#txnVolume)" strokeWidth={3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ServiceCategoryChart() {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={SERVICE_CATEGORY}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
        <XAxis dataKey="category" stroke="currentColor" />
        <YAxis stroke="currentColor" />
        <Tooltip />
        <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#3b82f6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PriorityHeatmap({ clients }: { clients: ClientRecord[] }) {
  const columns = ["Revenue", "Tx Volume", "Services", "AWS"];
  return (
    <div className="overflow-auto rounded-2xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Client</th>
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 text-left font-medium">{col}</th>
            ))}
            <th className="px-4 py-3 text-left font-medium">Priority</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const scoreCells = [
              client.monthlyInvoiceEstimate / 250000,
              client.monthlyTransactionVolume / 4000000,
              client.services.length,
              client.aws.enabled ? 4 : 1,
            ];
            const priority = getPriorityForScoring(client);
            return (
              <tr key={client.id} className="border-t">
                <td className="px-4 py-3 font-medium">{client.name}</td>
                {scoreCells.map((score, idx) => (
                  <td key={idx} className="px-4 py-3">
                    <div
                      className="h-9 rounded-lg border"
                      style={{
                        background:
                          score >= 4
                            ? "rgba(239,68,68,0.18)"
                            : score >= 3
                              ? "rgba(249,115,22,0.18)"
                              : score >= 2
                                ? "rgba(59,130,246,0.18)"
                                : "rgba(16,185,129,0.18)",
                      }}
                    />
                  </td>
                ))}
                <td className="px-4 py-3"><PriorityBadge priority={priority} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClientConfigCard({
  client,
  onEdit,
  onDelete,
  onOverview,
}: {
  client: ClientRecord;
  onEdit: () => void;
  onDelete: () => void;
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
            <div className="flex items-center gap-2 opacity-100 transition-opacity md:opacity-70 md:group-hover:opacity-100">
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
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
              <p className="mt-1 font-semibold">{currencyLabel(client.fixedBilling)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-muted-foreground">Invoice estimate</p>
              <p className="mt-1 font-semibold">{currencyLabel(client.monthlyInvoiceEstimate)}</p>
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
              <span className="font-medium">{currencyLabel(client.variableRevenueGenerated)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${Math.min(100, 20 + client.services.length * 12)}%` }} />
            </div>
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
  onStatusChange,
  onDownloadPdf,
  onDownloadDocx,
}: {
  client: ClientRecord;
  onBack: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onExportDocx: () => void;
  onGenerateInvoice: () => void;
  onStatusChange: (invoiceNumber: string, status: InvoiceStatus) => void;
  onDownloadPdf: (invoice: InvoiceRecord) => void;
  onDownloadDocx: (invoice: InvoiceRecord) => void;
}) {
  const [txnInput, setTxnInput] = useState(client.monthlyTransactionVolume);
  const [invoiceDraft, setInvoiceDraft] = useState(
    estimateInvoiceFromSlabs(
      client.monthlyTransactionVolume,
      client.fixedBilling,
      client.transactionSlabs,
      client.aws,
      client.minimumGuarantee,
      client.integrationFee,
      client.additionalPlatformFee,
    ),
  );

  useEffect(() => {
    const next = estimateInvoiceFromSlabs(
      txnInput,
      client.fixedBilling,
      client.transactionSlabs,
      client.aws,
      client.minimumGuarantee,
      client.integrationFee,
      client.additionalPlatformFee,
    );
    setInvoiceDraft(next);
  }, [txnInput, client]);

  const fixedCharges = client.fixedBilling + client.minimumGuarantee;
  const awsMargin = client.aws.enabled ? client.aws.vendorCost * (client.aws.marginPercentage / 100) : 0;
  const variableCharges = invoiceDraft - client.fixedBilling - awsMargin - client.additionalPlatformFee - client.integrationFee;
  const tax = invoiceDraft * 0.18;
  const finalPayable = invoiceDraft + tax;
  const priority = getPriorityForScoring(client);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
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
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={onExportPdf}>
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" className="gap-2" onClick={onExportCsv}>
            <FileDown className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={onExportDocx}>
            <FileText className="h-4 w-4" /> Export DOCX
          </Button>
          <Button
            className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500"
            onClick={onGenerateInvoice}
          >
            <ReceiptText className="h-4 w-4" /> Generate Invoice
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: "Total billing value", value: currencyLabel(invoiceDraft), icon: Wallet },
          { label: "Monthly transaction volume", value: client.monthlyTransactionVolume.toLocaleString(), icon: Layers3 },
          { label: "Fixed charges", value: currencyLabel(fixedCharges), icon: BadgeCheck },
          { label: "Final payable", value: currencyLabel(finalPayable), icon: CheckCircle2 },
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
          <CardHeader>
            <CardTitle>Commercial Summary Panel</CardTitle>
            <CardDescription>Fixed charges, variable slabs, AWS pass-through and tax preview</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fixed charges breakdown</span>
                <span className="font-medium">{currencyLabel(fixedCharges)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Variable charges calculation</span>
                <span className="font-medium">{currencyLabel(Math.max(variableCharges, 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">AWS margin calculations</span>
                <span className="font-medium">{currencyLabel(awsMargin)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated monthly invoice</span>
                <span className="font-semibold text-primary">{currencyLabel(invoiceDraft)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tax preview</span>
                <span className="font-medium">{currencyLabel(tax)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Final payable amount</span>
                <span>{currencyLabel(finalPayable)}</span>
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
                max={Math.max(client.monthlyTransactionVolume * 2, 1000000)}
                step={100000}
                value={txnInput}
                onChange={(e) => setTxnInput(Number(e.target.value))}
                className="w-full accent-primary"
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
                    onChange={(e) => setTxnInput(Number(e.target.value) || 0)}
                    className="h-11"
                  />
                </div>
                <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Type a value or move the slider to recalculate instantly.
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-4 text-white shadow-lg">
                <div className="text-sm uppercase tracking-[0.18em] text-white/80">Real-time invoice recalculation</div>
                <div className="mt-2 text-3xl font-semibold">{currencyLabel(invoiceDraft)}</div>
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

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Invoice History Table</CardTitle>
            <CardDescription>Invoice numbers, status workflow, generated dates and download/send actions</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Generated Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.invoiceHistory.map((invoice) => (
                    <TableRow key={invoice.invoiceId}>
                      <TableCell className="font-medium">{getInvoiceDisplayNumber(invoice)}</TableCell>
                      <TableCell>{invoice.month}</TableCell>
                      <TableCell>{currencyLabel(invoice.amount)}</TableCell>
                      <TableCell><InvoiceStatusBadge status={invoice.status} /></TableCell>
                      <TableCell>{invoice.generatedDate}</TableCell>
                      <TableCell>
                        <InvoiceRowActions
                          invoice={invoice}
                          onEdit={() => openInvoiceEditModal(invoice)}
                          onApprove={() => approveInvoice(invoice)}
                          onReject={() => rejectInvoice(invoice)}
                          onSend={() => sendInvoice(invoice)}
                          onPaid={() => markInvoicePaid(invoice)}
                          onClose={() => closeInvoice(invoice)}
                          onStatusChange={(status) => onStatusChange(getInvoiceDisplayNumber(invoice), status)}
                          onDownloadPdf={() => onDownloadPdf(invoice)}
                          onDownloadDocx={() => onDownloadDocx(invoice)}
                          onDelete={() => deleteInvoiceByNumber(getInvoiceDisplayNumber(invoice))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commercial Notes & Status Workflow</CardTitle>
            <CardDescription>Waiting for approval → Generated → Send → Paid → Rejected → Overdue → Closed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {["Waiting for approval", "Generated", "Send", "Paid", "Rejected", "Overdue", "Closed"].map((step) => (
                <InvoiceStatusBadge key={step} status={step as InvoiceStatus} />
              ))}
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              {client.notes}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>AWS infra recovery</span>
                <span className="font-medium">{currencyLabel(client.awsInfraRecovery)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Recon services revenue</span>
                <span className="font-medium">{currencyLabel(client.reconRevenue)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Profitability services revenue</span>
                <span className="font-medium">{currencyLabel(client.profitabilityRevenue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoiceConfigEditor({
  mode,
  client,
  onCancel,
  onSave,
}: {
  mode: "create" | "edit";
  client?: ClientRecord;
  onCancel: () => void;
  onSave: (payload: any) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(client?.name || "");
  const [code, setCode] = useState(client?.code || "");
  const [status, setStatus] = useState(client?.status || "draft");
  const [priority, setPriority] = useState<keyof typeof PRIORITY_META>(getPriorityFromClient(client || CLIENTS[0]));
  const [fixedBilling, setFixedBilling] = useState(client?.fixedBilling || 0);
  const [billingCycle, setBillingCycle] = useState(client?.billingCycle || "Monthly");
  const [minimumGuarantee, setMinimumGuarantee] = useState(client?.minimumGuarantee || 0);
  const [additionalPlatformFee, setAdditionalPlatformFee] = useState(client?.additionalPlatformFee || 0);
  const [integrationFee, setIntegrationFee] = useState(client?.integrationFee || 0);
  const [awsEnabled, setAwsEnabled] = useState(Boolean(client?.aws.enabled));
  const [awsVendorCost, setAwsVendorCost] = useState(client?.aws.vendorCost || 0);
  const [awsMarginPercentage, setAwsMarginPercentage] = useState(client?.aws.marginPercentage || 25);
  const [selectedServices, setSelectedServices] = useState<string[]>(client?.services ? [...client.services] : []);
  const [slabs, setSlabs] = useState(client?.transactionSlabs ? [...client.transactionSlabs] : [
    { from: 0, to: 5000000, rate: 0.04, unit: "paisa" as const },
  ]);
  const [gstin, setGstin] = useState(client?.gstin || "");
  const [lutNumber, setLutNumber] = useState(client?.lutNumber || "");
  const [billingAddress, setBillingAddress] = useState(client?.billingAddress || "");
  const [billingEmail, setBillingEmail] = useState(client?.billingEmail || "");
  const [signatoryName, setSignatoryName] = useState(client?.signatoryName || "");
  const [notes, setNotes] = useState(client?.notes || "");
  const [txnPreview, setTxnPreview] = useState(client?.monthlyTransactionVolume || 1000000);

  const preview = useMemo(() => {
    const fakeClient = {
      fixedBilling,
      transactionSlabs: slabs,
      aws: { enabled: awsEnabled, vendorCost: awsVendorCost, marginPercentage: awsMarginPercentage },
      minimumGuarantee,
      integrationFee,
      additionalPlatformFee,
    } as any;
    return estimateInvoiceFromSlabs(
      txnPreview,
      fakeClient.fixedBilling,
      fakeClient.transactionSlabs,
      fakeClient.aws,
      fakeClient.minimumGuarantee,
      fakeClient.integrationFee,
      fakeClient.additionalPlatformFee,
    );
  }, [fixedBilling, slabs, awsEnabled, awsVendorCost, awsMarginPercentage, minimumGuarantee, integrationFee, additionalPlatformFee, txnPreview]);

  const updateSlab = (index: number, key: keyof ClientRecord["transactionSlabs"][number], value: any) => {
    setSlabs((prev) => prev.map((slab, i) => (i === index ? { ...slab, [key]: value } : slab)));
  };

  const addSlab = () => {
    const lastTo = slabs.length ? (slabs[slabs.length - 1].to ?? slabs[slabs.length - 1].from + 5000000) : 0;
    setSlabs((prev) => [...prev, { from: lastTo, to: lastTo + 5000000, rate: 0.04, unit: "paisa" }]);
  };

  const removeSlab = (index: number) => setSlabs((prev) => prev.filter((_, i) => i !== index));

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((item) => item !== service) : [...prev, service],
    );
  };

  const submit = () => {
    onSave({
      id: client?.id,
      name,
      code,
      status,
      priority,
      fixedBilling,
      billingCycle,
      minimumGuarantee,
      additionalPlatformFee,
      integrationFee,
      aws: { enabled: awsEnabled, vendorCost: awsVendorCost, marginPercentage: awsMarginPercentage },
      services: selectedServices,
      transactionSlabs: slabs,
      notes,
      gstin,
      lutNumber,
      billingAddress,
      billingEmail,
      signatoryName,
      monthlyInvoiceEstimate: preview,
      monthlyTransactionVolume: txnPreview,
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
                      <Label>GSTIN</Label>
                      <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="GST identification number" />
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
                      <Label>Service Type</Label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {SERVICE_OPTIONS.map((service) => (
                          <label key={service} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                            <Checkbox checked={selectedServices.includes(service)} onCheckedChange={() => toggleService(service)} />
                            {service}
                          </label>
                        ))}
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
                      <Label>Configuration Notes</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commercial notes, tax handling, pass-through logic..." />
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
                        <div className="mt-1 text-3xl font-semibold">{currencyLabel(preview)}</div>
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
                {selectedServices.length > 0 ? selectedServices.map((service) => <ServiceChip key={service} label={service} />) : <span className="text-sm text-muted-foreground">No services selected</span>}
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

  const [clients, setClients] = useState<ClientRecord[]>([...CLIENTS]);
  const [invoices, setInvoices] = useState(INVOICES);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceModalMode, setInvoiceModalMode] = useState<"create" | "edit">("create");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceAmountDraft, setInvoiceAmountDraft] = useState(0);
  const [invoiceMonthDraft, setInvoiceMonthDraft] = useState("");
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

  const selectedClient = useMemo(() => clients.find((item) => item.id === clientId) || clients[0], [clients, clientId]);
  const editingClient = useMemo(() => clients.find((item) => item.id === (editingClientId || clientId)) || undefined, [clients, editingClientId, clientId]);
  const invoiceNumberPreview = useMemo(
    () => getCurrentInvoiceNumberPreview(invoiceSerialConfig),
    [invoiceSerialConfig],
  );

  const openInvoiceCreateModal = (client: ClientRecord) => {
    setInvoiceModalMode("create");
    setSelectedInvoice(null);
    setInvoiceAmountDraft(Math.round(estimateInvoiceFromSlabs(
      client.monthlyTransactionVolume,
      client.fixedBilling,
      client.transactionSlabs,
      client.aws,
      client.minimumGuarantee,
      client.integrationFee,
      client.additionalPlatformFee,
    )));
    setInvoiceMonthDraft(new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }));
    setInvoiceModalOpen(true);
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
    setInvoiceMonthDraft(invoice.month);
    setInvoiceModalOpen(true);
  };

  useEffect(() => {
    if (isCreateRoute) {
      setEditingClientId(null);
      setInvoiceModalOpen(false);
    }
  }, [isCreateRoute]);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch =
        search.trim().length === 0 ||
        client.name.toLowerCase().includes(search.toLowerCase()) ||
        client.code.toLowerCase().includes(search.toLowerCase());
      const matchesService =
        serviceFilter === "all" || client.services.some((service) => service === serviceFilter);
      return matchesSearch && matchesService;
    });
  }, [clients, search, serviceFilter]);

  const metrics = useMemo(() => {
    const totalRevenue = clients.reduce((sum, client) => sum + client.monthlyInvoiceEstimate, 0);
    const pendingInvoices = invoices.filter((invoice) => invoice.status === "Waiting for approval" || invoice.status === "Generated" || invoice.status === "Send" || invoice.status === "Overdue").length;
    const transactionVolume = clients.reduce((sum, client) => sum + client.monthlyTransactionVolume, 0);
    const variableRevenue = clients.reduce((sum, client) => sum + client.variableRevenueGenerated, 0);
    const awsRecovery = clients.reduce((sum, client) => sum + client.awsInfraRecovery, 0);
    const reconRevenue = clients.reduce((sum, client) => sum + client.reconRevenue, 0);
    const profitabilityRevenue = clients.reduce((sum, client) => sum + client.profitabilityRevenue, 0);
    const highPriorityClients = clients.filter((client) => getPriorityForScoring(client) === "Critical" || getPriorityForScoring(client) === "High").length;
    return {
      totalRevenue,
      monthlyInvoiceValue: totalRevenue,
      activeClients: clients.filter((client) => client.status === "active").length,
      pendingInvoices,
      transactionVolume,
      variableRevenue,
      highPriorityClients,
      awsRecovery,
      reconRevenue,
      profitabilityRevenue,
      revenueSpark: [72, 80, 86, 83, 91, 98],
      invoiceSpark: [44, 50, 56, 61, 65, 69],
    };
  }, [clients, invoices]);

  const pieData = useMemo(
    () =>
      clients.map((client) => ({
        name: client.name,
        value: Math.round(client.monthlyInvoiceEstimate / 1000),
      })),
    [clients],
  );

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

  const exportClientPdf = async (client = selectedClient) => {
    if (!client) return;
    const serialInfo = getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState);
    await downloadInvoicePdfTemplate({
      client,
      invoiceNumber: serialInfo.invoiceNumber,
      generatedDate: new Date().toISOString().split("T")[0],
      amount: client.monthlyInvoiceEstimate,
      status: "Waiting for approval",
      month: new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }),
      financialYear: serialInfo.financialYear,
      serial: serialInfo.serial,
    });
    toast({ title: "PDF exported", description: `${client.name} overview PDF downloaded.` });
  };

  const exportClientDocx = async (client = selectedClient) => {
    if (!client) return;
    const serialInfo = getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState);
    await downloadInvoiceDocxTemplate({
      client,
      invoiceNumber: serialInfo.invoiceNumber,
      generatedDate: new Date().toISOString().split("T")[0],
      amount: client.monthlyInvoiceEstimate,
      status: "Waiting for approval",
      month: new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }),
      financialYear: serialInfo.financialYear,
      serial: serialInfo.serial,
    });
    toast({ title: "DOCX exported", description: `${client.name} overview DOCX downloaded.` });
  };

  const handleSync = () => {
    setClients([...CLIENTS]);
    setInvoices(INVOICES);
    toast({ title: "Synced", description: "Invoice management data refreshed from the sample dataset." });
  };

  const generateInvoiceForClient = async (client = selectedClient) => {
    if (!client) return;
    const generatedDate = new Date().toISOString().split("T")[0];
    const generatedAmount = Math.round(
      estimateInvoiceFromSlabs(
        client.monthlyTransactionVolume,
        client.fixedBilling,
        client.transactionSlabs,
        client.aws,
        client.minimumGuarantee,
        client.integrationFee,
        client.additionalPlatformFee,
      ),
    );
    const serialInfo = getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState);
    const nextInvoice: InvoiceRecord = {
      invoiceId: serialInfo.invoiceNumber,
      invoiceNumber: serialInfo.invoiceNumber,
      serial: serialInfo.serial,
      financialYear: serialInfo.financialYear,
      month: new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }),
      client: client.name,
      amount: generatedAmount,
      status: "Waiting for approval",
      generatedDate,
    };
    setInvoices((prev) => [nextInvoice, ...prev]);
    setClients((prev) =>
      prev.map((item) =>
        item.id === client.id
          ? {
              ...item,
              lastInvoiceGenerated: generatedDate,
              invoiceHistory: [nextInvoice, ...(item.invoiceHistory || [])],
            }
          : item,
      ),
    );
    setInvoiceSerialState({
      financialYear: serialInfo.financialYear,
      serial: serialInfo.serial,
      lastIssuedAt: new Date().toISOString(),
    });
    setInvoiceModalOpen(false);
    toast({
      title: "Invoice sent for approval",
      description: `${client.name} invoice ${serialInfo.invoiceNumber} is waiting for FinOps approval.`,
    });
  };

  const updateInvoiceByNumber = (invoiceNumber: string, updater: (invoice: InvoiceRecord) => InvoiceRecord) => {
    setInvoices((prev) => updateInvoiceCollection(prev, invoiceNumber, updater));
    setClients((prev) =>
      prev.map((client) => ({
        ...client,
        invoiceHistory: updateInvoiceCollection((client.invoiceHistory || []) as InvoiceRecord[], invoiceNumber, updater),
      })),
    );
  };

  const deleteInvoiceByNumber = (invoiceNumber: string) => {
    setInvoices((prev) => deleteInvoiceFromCollection(prev, invoiceNumber));
    setClients((prev) =>
      prev.map((client) => ({
        ...client,
        invoiceHistory: deleteInvoiceFromCollection((client.invoiceHistory || []) as InvoiceRecord[], invoiceNumber),
      })),
    );
    toast({ title: "Invoice deleted", description: `${invoiceNumber} removed from history.` });
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
    updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status: "Paid" }));
    toast({ title: "Invoice paid", description: `${invoiceNumber} marked as Paid.` });
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
      status: "Generated",
    }));
    setInvoiceModalOpen(false);
    toast({ title: "Invoice updated", description: `${invoiceNumber} has been updated.` });
  };

  const downloadInvoicePdf = async (invoice: any) => {
    const client = clients.find((item) => item.name === invoice.client);
    if (!client) return;
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    await downloadInvoicePdfTemplate({
      client,
      invoiceNumber,
      generatedDate: invoice.generatedDate,
      amount: Number(invoice.amount || client.monthlyInvoiceEstimate),
      status: invoice.status,
      month: invoice.month,
      financialYear: invoice.financialYear || getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth),
      serial: Number(invoice.serial || invoiceSerialState.serial || 1),
    });
    toast({ title: "PDF downloaded", description: `${invoiceNumber} PDF downloaded.` });
  };

  const downloadInvoiceDocx = async (invoice: any) => {
    const client = clients.find((item) => item.name === invoice.client);
    if (!client) return;
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    await downloadInvoiceDocxTemplate({
      client,
      invoiceNumber,
      generatedDate: invoice.generatedDate,
      amount: Number(invoice.amount || client.monthlyInvoiceEstimate),
      status: invoice.status,
      month: invoice.month,
      financialYear: invoice.financialYear || getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth),
      serial: Number(invoice.serial || invoiceSerialState.serial || 1),
    });
    toast({ title: "DOCX downloaded", description: `${invoiceNumber} DOCX downloaded.` });
  };

  const sendInvoice = (invoice: any) => {
    const invoiceNumber = getInvoiceDisplayNumber(invoice);
    updateInvoiceByNumber(invoiceNumber, (item) => ({
      ...item,
      status: item.status === "Paid" ? item.status : "Send",
    }));
    toast({ title: "Invoice sent", description: `${invoiceNumber} marked as Send.` });
  };

  const saveConfig = (payload: any) => {
    const baseId = payload.id || payload.code?.toLowerCase() || `client-${Date.now()}`;
    const nextClient: ClientRecord = {
      id: baseId,
      code: payload.code,
      name: payload.name,
      status: payload.status,
      priority: payload.priority,
      services: payload.services,
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
      logo: String(payload.name || "C").charAt(0).toUpperCase(),
      logoClass: "from-indigo-500 to-purple-600",
      color: "indigo",
      transactionSlabs: payload.transactionSlabs,
      aws: payload.aws,
      notes: payload.notes,
      invoiceHistory: payload.id ? (clients.find((client) => client.id === payload.id)?.invoiceHistory || []) : [],
      gstin: payload.gstin,
      lutNumber: payload.lutNumber,
      billingAddress: payload.billingAddress,
      billingEmail: payload.billingEmail,
      signatoryName: payload.signatoryName,
    };

    setClients((prev) => {
      const exists = prev.some((client) => client.id === baseId);
      return exists ? prev.map((client) => (client.id === baseId ? nextClient : client)) : [nextClient, ...prev];
    });

    toast({
      title: `Configuration ${payload.id ? "updated" : "created"}`,
      description: `${payload.name} commercial configuration saved successfully.`,
    });

    navigate(`/invoice-management/client/${baseId}`);
  };

  const handleDeleteClient = (id: string) => {
    setClients((prev) => prev.filter((client) => client.id !== id));
    toast({ title: "Config deleted", description: "The client commercial configuration was removed." });
    if (clientId === id) {
      navigate("/invoice-management");
    }
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
          mode={isCreateRoute ? "create" : "edit"}
          client={editingClient}
          onCancel={() => navigate("/invoice-management")}
          onSave={saveConfig}
        />
      </div>
    );
  }

  if (isOverviewRoute && selectedClient) {
    return (
      <ClientOverviewScreen
        client={selectedClient}
        onBack={() => navigate("/invoice-management")}
        onExportPdf={() => exportClientPdf(selectedClient)}
        onExportCsv={() => exportClientsCsv([selectedClient])}
        onExportDocx={() => exportClientDocx(selectedClient)}
        onGenerateInvoice={() => openInvoiceCreateModal(selectedClient)}
        onStatusChange={(invoiceNumber, status) => updateInvoiceByNumber(invoiceNumber, (item) => ({ ...item, status }))}
        onDownloadPdf={downloadInvoicePdf}
        onDownloadDocx={downloadInvoiceDocx}
      />
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={handleSync}>
              <RefreshCcw className="h-4 w-4" /> Sync
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportClientsCsv()}>
              <Download className="h-4 w-4" /> Export CSV
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

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Invoice Number Serial Config</CardTitle>
            <CardDescription>
              Auto-resets every financial year and controls invoice number format
            </CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full">
            Current FY: {getFinancialYearLabel(getIstNow(), invoiceSerialConfig.financialYearStartMonth)}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Prefix</Label>
              <Input
                value={invoiceSerialConfig.prefix}
                onChange={(e) =>
                  setInvoiceSerialConfig((prev) => ({ ...prev, prefix: e.target.value }))
                }
                placeholder="MYL"
              />
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
                  Current Serial: {invoiceSerialState.serial}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  Last Issued FY: {invoiceSerialState.financialYear || "—"}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() =>
                    setInvoiceSerialState({
                      financialYear: getFinancialYearLabel(
                        getIstNow(),
                        invoiceSerialConfig.financialYearStartMonth,
                      ),
                      serial: 0,
                      lastIssuedAt: new Date().toISOString(),
                    })
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
                    Serial resets on FY rollover. Example format updates with your config and next invoice uses the current fiscal year series.
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full border-white/20 bg-white/10 text-white">
                  {invoiceSerialConfig.format}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        <MetricCard title="Total Revenue" value={currencyLabel(metrics.totalRevenue)} change="+18.2% MoM" icon={Wallet} accent="bg-gradient-to-br from-indigo-500 to-purple-600" sparkline={metrics.revenueSpark} />
        <MetricCard title="Monthly Invoice Value" value={currencyLabel(metrics.monthlyInvoiceValue)} change="+12.8% MoM" icon={ReceiptText} accent="bg-gradient-to-br from-sky-500 to-indigo-600" sparkline={metrics.invoiceSpark} />
        <MetricCard title="Active Clients" value={String(metrics.activeClients)} change="+2 onboarded" icon={Building2} accent="bg-gradient-to-br from-emerald-500 to-cyan-600" sparkline={[8, 8, 9, 9, 10, 10]} />
        <MetricCard title="Pending Invoices" value={String(metrics.pendingInvoices)} change="-3 overdue risk" icon={AlertTriangle} accent="bg-gradient-to-br from-orange-500 to-rose-600" sparkline={[5, 5, 4, 4, 3, 2]} />
        <MetricCard title="Transaction Volume" value={metrics.transactionVolume.toLocaleString()} change="+21% volume" icon={BarChart3} accent="bg-gradient-to-br from-fuchsia-500 to-violet-600" sparkline={[18, 21, 25, 29, 31, 36]} />
        <MetricCard title="Variable Revenue" value={currencyLabel(metrics.variableRevenue)} change="+16.4%" icon={TrendingUp} accent="bg-gradient-to-br from-emerald-500 to-teal-600" sparkline={[40, 45, 48, 54, 58, 63]} />
        <MetricCard title="High Priority Clients" value={String(metrics.highPriorityClients)} change="+1 critical" icon={ShieldCheck} accent="bg-gradient-to-br from-red-500 to-orange-600" sparkline={[2, 2, 3, 3, 4, 4]} />
        <MetricCard title="AWS Infra Recovery" value={currencyLabel(metrics.awsRecovery)} change="+9.3%" icon={Warehouse} accent="bg-gradient-to-br from-slate-600 to-sky-700" sparkline={[12, 14, 15, 18, 19, 21]} />
        <MetricCard title="Recon Revenue" value={currencyLabel(metrics.reconRevenue)} change="+7.6%" icon={Activity} accent="bg-gradient-to-br from-cyan-500 to-blue-600" sparkline={[30, 31, 33, 35, 36, 34]} />
        <MetricCard title="Profitability Revenue" value={currencyLabel(metrics.profitabilityRevenue)} change="+5.1%" icon={Sparkles} accent="bg-gradient-to-br from-violet-500 to-fuchsia-600" sparkline={[18, 19, 20, 21, 22, 23]} />
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
        <CardHeader>
          <SectionTitle
            title="Dashboard Analytics"
            subtitle="Revenue trends, client contribution, transaction volume and service mix"
          />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-base">Revenue Trend Graph</CardTitle>
                <CardDescription>Fixed vs variable revenue growth over time</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueTrendChart />
              </CardContent>
            </Card>
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-base">Client Revenue Pie Chart</CardTitle>
                <CardDescription>Revenue contribution by client</CardDescription>
              </CardHeader>
              <CardContent>
                <ClientRevenuePie data={pieData} />
              </CardContent>
            </Card>
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-base">Transaction Volume Area Graph</CardTitle>
                <CardDescription>Daily / monthly transaction processing trend</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionVolumeChart />
              </CardContent>
            </Card>
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-base">Service Category Bar Chart</CardTitle>
                <CardDescription>Recon, Profitability, Clearing, Currency Conversion, AWS, APB and FIRC</CardDescription>
              </CardHeader>
              <CardContent>
                <ServiceCategoryChart />
              </CardContent>
            </Card>
          </div>
          <div className="mt-6">
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-base">Priority Heatmap</CardTitle>
                <CardDescription>Priority based on invoice amount, transaction count and business criticality</CardDescription>
              </CardHeader>
              <CardContent>
                <PriorityHeatmap clients={clients} />
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Client Configurations</CardTitle>
            <CardDescription>Scrollable responsive cards with billing, slab, AWS and status details</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                  key={client.id}
                  client={client}
                  onEdit={() => navigate(`/invoice-management/client/${client.id}/edit`)}
                  onDelete={() => handleDeleteClient(client.id)}
                  onOverview={() => navigate(`/invoice-management/client/${client.id}`)}
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
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Try another search or service filter. This empty state is designed for premium enterprise dashboards.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader>
          <SectionTitle
            title="Invoice History Table"
            subtitle="Statuses, generated dates and delivery actions"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.invoiceId}>
                    <TableCell className="font-medium">{getInvoiceDisplayNumber(invoice)}</TableCell>
                    <TableCell>{invoice.month}</TableCell>
                    <TableCell>{invoice.client}</TableCell>
                    <TableCell>{currencyLabel(invoice.amount)}</TableCell>
                    <TableCell><InvoiceStatusBadge status={invoice.status} /></TableCell>
                    <TableCell>{invoice.generatedDate}</TableCell>
                    <TableCell>
                      <InvoiceRowActions
                        invoice={invoice}
                        onEdit={() => openInvoiceEditModal(invoice)}
                        onApprove={() => approveInvoice(invoice)}
                        onReject={() => rejectInvoice(invoice)}
                        onSend={() => sendInvoice(invoice)}
                        onPaid={() => markInvoicePaid(invoice)}
                        onClose={() => closeInvoice(invoice)}
                        onStatusChange={(status) => updateInvoiceByNumber(getInvoiceDisplayNumber(invoice), (item) => ({ ...item, status }))}
                        onDownloadPdf={() => downloadInvoicePdf(invoice)}
                        onDownloadDocx={() => downloadInvoiceDocx(invoice)}
                        onDelete={() => deleteInvoiceByNumber(getInvoiceDisplayNumber(invoice))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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

      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
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
                <Label>Amount</Label>
                <Input
                  type={invoiceModalMode === "edit" ? "number" : "text"}
                  value={invoiceModalMode === "edit" ? invoiceAmountDraft : currencyLabel(invoiceAmountDraft || selectedClient?.monthlyInvoiceEstimate || 0)}
                  onChange={(e) => setInvoiceAmountDraft(Number(e.target.value) || 0)}
                  readOnly={invoiceModalMode !== "edit"}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Month</Label>
                <Input
                  value={invoiceMonthDraft || new Date().toLocaleString("en-IN", { month: "short", year: "numeric" })}
                  onChange={(e) => setInvoiceMonthDraft(e.target.value)}
                  readOnly={invoiceModalMode !== "edit"}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Input value={invoiceModalMode === "edit" ? "Generated" : "Waiting for approval"} readOnly />
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              {invoiceModalMode === "edit"
                ? "Only invoices approved by the FinOps admin can be edited and updated."
                : "Invoice requests start in Waiting for approval. FinOps admin must approve before the invoice becomes Generated."}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInvoiceModalOpen(false)}>Close</Button>
              <Button
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                onClick={() => {
                  if (invoiceModalMode === "edit") {
                    saveInvoiceUpdate();
                  } else {
                    generateInvoiceForClient(selectedClient);
                  }
                  setInvoiceModalOpen(false);
                }}
              >
                {invoiceModalMode === "edit" ? "Update Invoice" : "Submit for approval"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
