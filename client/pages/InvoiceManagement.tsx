import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import * as Docx from "docx";
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
  Settings,
  CheckCircle,
  Clock,
  XCircle,
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
const INVOICE_THEME = {
  primaryRgb: [44, 175, 230] as [number, number, number],
  secondaryRgb: [31, 41, 92] as [number, number, number],
  primaryHex: "2cafe6",
  secondaryHex: "1f295c",
};
const BILLING_COMPANY_NAME = "Mindeed Technologies and Services Pvt Ltd";
const INVOICE_AMOUNT_IN_WORDS = "(Rupees One lakh forty-seven thousand five hundred Only)";
const INVOICE_DECLARATION_LINES = [
  "We hereby declare that",
  "1. We have obtained approval for a lower TDS deduction, and going forward, TDS should be deducted at the rate of 1.60 % only.",
  "2. We are registered under the Micro, Small, and Medium Enterprises Development Act, 2006 (MSME).",
  "MSME No of Mindeed: UDYAM-TN-02-0113863",
  "GST No of Mindeed: 33AAMCM6618H1ZB",
  "PAN No of Mindeed: AAMCM6618H",
  "Payment Terms: 15 days from the date of Invoice.",
];
const MYLAPAY_FOOTER_LINES = [
  "MYLAPAY Incorporated as Mindeed Technologies and Services Private Limited.",
  "# 17/3, Pembroke House, Second Floor, Shafee Mohammed Road, Nungambakkam, Chennai 600 006.",
  "CIN: U72900TN2019PTC129197 | Website: www.mylapay.com | Reach us at:contactus@mylapay.com",
];

const MYLAPAY_BRANDING = {
  companyName: BILLING_COMPANY_NAME,
  address: "Coimbatore, Tamil Nadu, India",
  email: "contact@mylapay.com",
  phone: "+91 98765 43210",
  gstin: "GSTIN: —",
  lutNumber: "LUT: —",
  footerLine: MYLAPAY_FOOTER_LINES.join("\n"),
  authorizedLabel: "Authorized Signatory",
};

const INVOICE_SERIAL_CONFIG_KEY = "invoice-serial-config";
const INVOICE_SERIAL_STATE_KEY = "invoice-serial-state";
const COMPANY_CONFIG_KEY = "company-config";
const TAX_CONFIG_KEY = "tax-config";
const CURRENCY_CONFIG_KEY = "currency-config";
const CONFIG_CHANGE_REQUESTS_KEY = "config-change-requests";
const CONFIG_AUDIT_LOG_KEY = "config-audit-log";

type InvoiceNumberFormat = "PREFIX/FY/SEQ" | "PREFIX-FY-SEQ" | "FY/SEQ";
type ClientType = "Domestic" | "International";
type CurrencyType = "INR" | "USD" | "AED" | "SAR" | "KWD" | "OMR" | "QAR" | "BHD";
type ConfigChangeType = "invoice-serial" | "company" | "tax" | "currency";
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
}

interface TaxConfig {
  sgstPercentage: number;
  cgstPercentage: number;
  igstPercentage: number;
  tdsPercentage: number;
  defaultTaxType: "SGST+CGST" | "IGST";
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
  format: "PREFIX/FY/SEQ",
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
};

const DEFAULT_TAX_CONFIG: TaxConfig = {
  sgstPercentage: 9,
  cgstPercentage: 9,
  igstPercentage: 18,
  tdsPercentage: 1.6,
  defaultTaxType: "SGST+CGST",
};

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
  clientType?: ClientType;
  currency?: CurrencyType;
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
  const logoResponse = await fetch(MYLAPAY_LOGO_URL);
  const logoBlob = logoResponse.ok ? await logoResponse.blob() : null;
  const logoData = logoBlob ? await blobToUint8Array(logoBlob) : null;
  const lineItems = getInvoiceHistoryLineItemSummary(client, amount);
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gst = client.lutNumber ? 0 : subtotal * 0.18;
  const totalPayable = subtotal + gst;

  const title = (text: string) =>
    new Docx.Paragraph({
      children: [new Docx.TextRun({ text, bold: true, color: INVOICE_THEME.secondaryHex, size: 20 })],
      spacing: { after: 40 },
    });

  const labelValue = (label: string, value: string) =>
    new Docx.Paragraph({
      children: [
        new Docx.TextRun({ text: `${label}: `, bold: true, color: INVOICE_THEME.primaryHex, size: 15 }),
        new Docx.TextRun({ text: value || "—", color: INVOICE_THEME.secondaryHex, size: 15 }),
      ],
      spacing: { after: 18 },
    });

  const tableCell = (text: string, align: "left" | "right" = "left") =>
    new Docx.TableCell({
      children: [
        new Docx.Paragraph({
          alignment: align === "right" ? Docx.AlignmentType.RIGHT : Docx.AlignmentType.LEFT,
          children: [new Docx.TextRun({ text, size: 18, color: INVOICE_THEME.secondaryHex })],
        }),
      ],
      width: { size: 50, type: Docx.WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
    });

  const billFromRows = [
    ["Company", MYLAPAY_BRANDING.companyName],
    ["Address", MYLAPAY_BRANDING.address],
    ["Email", MYLAPAY_BRANDING.email],
    ["Phone", MYLAPAY_BRANDING.phone],
    ["GSTIN", MYLAPAY_BRANDING.gstin],
    ["LUT", MYLAPAY_BRANDING.lutNumber],
  ];
  const billToRows = [
    ["Client", getClientDisplayBillingName(client)],
    ["Client Code", client.code],
    ["GSTIN", getClientGstin(client)],
    ["LUT", getClientLut(client)],
    ["Billing Email", client.billingEmail || "—"],
    ["Billing Address", getClientBillToAddress(client)],
  ];

  const document = new Docx.Document({
    sections: [
      {
        properties: {},
        children: [
          ...(logoData
            ? [
                new Docx.Paragraph({
                  alignment: Docx.AlignmentType.LEFT,
                  children: [
                    new Docx.ImageRun({
                      data: logoData,
                      transformation: { width: 92, height: 34 },
                    }),
                  ],
                }),
              ]
            : []),
          new Docx.Paragraph({
            alignment: Docx.AlignmentType.RIGHT,
            children: [new Docx.TextRun({ text: "Tax Invoice", bold: true, color: INVOICE_THEME.secondaryHex, size: 24 })],
            spacing: { after: 24 },
          }),
          new Docx.Paragraph({
            alignment: Docx.AlignmentType.RIGHT,
            children: [
              new Docx.TextRun({ text: `Invoice Number: ${invoiceNumber}`, size: 14 }),
              new Docx.TextRun({ text: "\n", size: 14 }),
              new Docx.TextRun({ text: `Financial Year: ${financialYear} · Serial #${serial}`, size: 14 }),
              new Docx.TextRun({ text: "\n", size: 14 }),
              new Docx.TextRun({ text: `Month: ${month}`, size: 14 }),
            ],
            spacing: { after: 40 },
          }),
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
                  tableCell("Status: " + status),
                  tableCell("Generated Date: " + generatedDate, "right"),
                  tableCell("Amount: INR " + formatCurrency(amount), "right"),
                ],
              }),
            ],
          }),
          new Docx.Paragraph({ spacing: { after: 28 } }),
          new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Bill From / Bill To", bold: true, color: INVOICE_THEME.secondaryHex, size: 18 })], spacing: { after: 16 } }),
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
                  new Docx.TableCell({
                    children: [title("Bill From"), ...billFromRows.flatMap(([label, value]) => [labelValue(label, value)])],
                    width: { size: 50, type: Docx.WidthType.PERCENTAGE },
                  }),
                  new Docx.TableCell({
                    children: [title("Bill To"), ...billToRows.flatMap(([label, value]) => [labelValue(label, value)])],
                    width: { size: 50, type: Docx.WidthType.PERCENTAGE },
                  }),
                ],
              }),
            ],
          }),
          new Docx.Paragraph({ spacing: { after: 20 } }),
          new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Bill Details", bold: true, color: INVOICE_THEME.secondaryHex, size: 18 })], spacing: { after: 12 } }),
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
                children: [tableCell("Invoice Month"), tableCell(month, "right"), tableCell("Transaction Volume"), tableCell(client.monthlyTransactionVolume.toLocaleString(), "right")],
              }),
              new Docx.TableRow({
                children: [tableCell("Invoice Status"), tableCell(status, "right"), tableCell("Last Invoice Generated"), tableCell(client.lastInvoiceGenerated, "right")],
              }),
            ],
          }),
          new Docx.Paragraph({ spacing: { after: 20 } }),
          new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Statement of Charges", bold: true, color: INVOICE_THEME.secondaryHex, size: 18 })], spacing: { after: 12 } }),
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
                  tableCell("Particulars"),
                  tableCell("Amount", "right"),
                ],
              }),
              ...lineItems.map(
                (item) =>
                  new Docx.TableRow({
                    children: [tableCell(item.description), tableCell(`INR ${formatCurrency(item.amount)}`, "right")],
                  }),
              ),
            ],
          }),
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({ text: `Subtotal: INR ${formatCurrency(subtotal)}   `, bold: true, size: 14 }),
              new Docx.TextRun({ text: gst > 0 ? `GST / Tax: INR ${formatCurrency(gst)}   ` : "GST / Tax: LUT exempt   ", bold: true, size: 14 }),
              new Docx.TextRun({ text: `Final Payable: INR ${formatCurrency(totalPayable)}`, bold: true, size: 14 }),
            ],
            spacing: { before: 50, after: 10 },
          }),
          new Docx.Paragraph({
            children: [new Docx.TextRun({ text: INVOICE_AMOUNT_IN_WORDS, italics: true, color: INVOICE_THEME.secondaryHex, size: 13 })],
            spacing: { after: 12 },
          }),
          new Docx.Paragraph({
            pageBreakBefore: lineItems.length > 6,
            children: [new Docx.TextRun({ text: "Declaration", bold: true, color: INVOICE_THEME.secondaryHex, size: 17 })],
            spacing: { after: 8 },
          }),
          ...INVOICE_DECLARATION_LINES.map((line, index) =>
            new Docx.Paragraph({
              children: [
                new Docx.TextRun({
                  text: line,
                  bold: index < 2,
                  size: 12,
                  color: INVOICE_THEME.secondaryHex,
                }),
              ],
              spacing: { after: index === INVOICE_DECLARATION_LINES.length - 1 ? 10 : 4 },
            }),
          ),
          new Docx.Paragraph({
            children: [new Docx.TextRun({ text: `For ${MYLAPAY_BRANDING.companyName}`, bold: true, color: INVOICE_THEME.secondaryHex, size: 18 })],
            spacing: { after: 12 },
          }),
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
                  new Docx.TableCell({
                    children: [
                      new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Company Seal", bold: true, color: INVOICE_THEME.secondaryHex, size: 14 })] }),
                      new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Space reserved for seal", size: 12, color: INVOICE_THEME.primaryHex })] }),
                    ],
                    width: { size: 50, type: Docx.WidthType.PERCENTAGE },
                  }),
                  new Docx.TableCell({
                    children: [
                      new Docx.Paragraph({ children: [new Docx.TextRun({ text: "Authority Signature Name", bold: true, color: INVOICE_THEME.secondaryHex, size: 14 })] }),
                      new Docx.Paragraph({ children: [new Docx.TextRun({ text: getClientSignatureName(client), bold: true, size: 14 })] }),
                      new Docx.Paragraph({ children: [new Docx.TextRun({ text: `Authorized signatory · For ${MYLAPAY_BRANDING.companyName}`, color: INVOICE_THEME.primaryHex, size: 12 })] }),
                    ],
                    width: { size: 50, type: Docx.WidthType.PERCENTAGE },
                  }),
                ],
              }),
            ],
          }),
          new Docx.Paragraph({ spacing: { before: 18 } }),
          ...MYLAPAY_FOOTER_LINES.map(
            (line, index) =>
              new Docx.Paragraph({
                children: [new Docx.TextRun({ text: line, color: INVOICE_THEME.secondaryHex, size: 11 })],
                spacing: { after: index === MYLAPAY_FOOTER_LINES.length - 1 ? 16 : 2 },
              }),
          ),
        ],
      },
    ],
  });

  const blob = await Docx.Packer.toBlob(document);
  downloadBlob(`${invoiceNumber}.docx`, blob);
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

  const setText = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
  const setFill = (color: [number, number, number]) => doc.setFillColor(color[0], color[1], color[2]);
  const setStroke = (color: [number, number, number]) => doc.setDrawColor(color[0], color[1], color[2]);

  const drawFooter = () => {
    const fy = pageHeight - FOOTER_HEIGHT;
    setStroke(SOFT);
    doc.setLineWidth(0.3);
    doc.line(margin, fy, pageWidth - margin, fy);
    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    MYLAPAY_FOOTER_LINES.forEach((line, idx) => {
      doc.text(line, margin, fy + 4.5 + idx * 3.4);
    });
    setText(PRIMARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, fy + 4.5, { align: "right" });
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
  const headerHeight = 28;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", margin, cursorY, 40, 14);
    } catch {}
  }
  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text("Mindeed Technologies and Services Pvt Ltd", margin, cursorY + 19);
  doc.text("Coimbatore, Tamil Nadu, India", margin, cursorY + 22.5);
  doc.text("contact@mylapay.com  ·  +91 98765 43210", margin, cursorY + 26);

  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("INVOICE", pageWidth - margin, cursorY + 6, { align: "right" });
  setText(PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.text("TAX INVOICE", pageWidth - margin, cursorY + 11.5, { align: "right" });

  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.text("Invoice No.", pageWidth - margin - 38, cursorY + 18.5);
  doc.text("Issue Date", pageWidth - margin - 38, cursorY + 22.5);
  doc.text("Period", pageWidth - margin - 38, cursorY + 26.5);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(invoiceNumber, pageWidth - margin, cursorY + 18.5, { align: "right" });
  doc.text(generatedDate, pageWidth - margin, cursorY + 22.5, { align: "right" });
  doc.text(`${month} · FY ${financialYear}`, pageWidth - margin, cursorY + 26.5, { align: "right" });

  cursorY += headerHeight + 4;

  // Divider line
  setStroke(PRIMARY);
  doc.setLineWidth(0.6);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  // === BILL FROM / BILL TO ===
  const colWidth = (contentWidth - 8) / 2;
  const billFrom = [
    [MYLAPAY_BRANDING.companyName, true],
    [MYLAPAY_BRANDING.address, false],
    [MYLAPAY_BRANDING.email, false],
    [MYLAPAY_BRANDING.phone, false],
    [`GSTIN: ${(MYLAPAY_BRANDING.gstin || "—").replace(/^GSTIN:\s*/i, "")}`, false],
    [`LUT: ${(MYLAPAY_BRANDING.lutNumber || "—").replace(/^LUT:\s*/i, "")}`, false],
  ] as Array<[string, boolean]>;
  const billTo = [
    [getClientDisplayBillingName(client), true],
    [getClientBillToAddress(client), false],
    [client.billingEmail || "—", false],
    [`Client Code: ${client.code || "—"}`, false],
    [`GSTIN: ${getClientGstin(client) || "—"}`, false],
    [`LUT: ${getClientLut(client) || "—"}`, false],
  ] as Array<[string, boolean]>;

  const renderParty = (x: number, label: string, rows: Array<[string, boolean]>) => {
    setText(PRIMARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text(label.toUpperCase(), x, cursorY);
    let py = cursorY + 5;
    rows.forEach(([text, bold]) => {
      const lines = wrap(text, colWidth);
      setText(bold ? SECONDARY : MUTED);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 11 : 8.4);
      doc.text(lines, x, py);
      py += lines.length * (bold ? 4.6 : 3.8) + (bold ? 1.2 : 0.6);
    });
    return py;
  };

  const leftEnd = renderParty(margin, "Billed From", billFrom);
  const rightEnd = renderParty(margin + colWidth + 8, "Billed To", billTo);
  cursorY = Math.max(leftEnd, rightEnd) + 6;

  // === STATEMENT OF CHARGES ===
  const lineItems = getInvoiceHistoryLineItemSummary(client, amount);
  ensureSpace(18);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.4);
  doc.text("Statement of Charges", margin, cursorY);
  cursorY += 3;

  const headerH = 7.5;
  setFill(SECONDARY);
  doc.rect(margin, cursorY, contentWidth, headerH, "F");
  setText([255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.text("#", margin + 3, cursorY + 5.4);
  doc.text("PARTICULARS", margin + 12, cursorY + 5.4);
  doc.text("AMOUNT", pageWidth - margin - 3, cursorY + 5.4, { align: "right" });
  cursorY += headerH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  lineItems.forEach((item, idx) => {
    const lines = wrap(item.description, contentWidth - 50);
    const rowH = Math.max(9, lines.length * 4.2 + 4);
    ensureSpace(rowH + 2);
    if (idx % 2 === 0) {
      setFill([248, 251, 254]);
      doc.rect(margin, cursorY, contentWidth, rowH, "F");
    }
    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.text(String(idx + 1).padStart(2, "0"), margin + 3, cursorY + 5.8);
    setText(SECONDARY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.text(lines, margin + 12, cursorY + 5.8);
    doc.setFont("helvetica", "bold");
    doc.text(money(item.amount), pageWidth - margin - 3, cursorY + 5.8, { align: "right" });
    cursorY += rowH;
  });
  setStroke(SOFT);
  doc.setLineWidth(0.3);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 4;

  // === TOTALS ===
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const gst = client.lutNumber ? 0 : subtotal * 0.18;
  const totalPayable = subtotal + gst;

  ensureSpace(28);
  const totalsX = pageWidth - margin - 78;
  const totalsW = 78;
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
  lineRow("Subtotal", money(subtotal));
  lineRow("GST / Tax (18%)", gst > 0 ? money(gst) : "LUT Exempt");
  lineRow("Total Payable", money(totalPayable), { bold: true, bg: true });
  cursorY += 4;

  // === AMOUNT IN WORDS ===
  ensureSpace(8);
  setText(MUTED);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.2);
  doc.text(`Amount in words: Rupees ${numberToWords(Math.round(totalPayable))}`, margin, cursorY + 2.5);
  cursorY += 8;

  // === DECLARATION ===
  ensureSpace(10);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  doc.text("Declaration", margin, cursorY);
  setStroke(PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY + 1.6, margin + 28, cursorY + 1.6);
  cursorY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  INVOICE_DECLARATION_LINES.forEach((line) => {
    const lines = wrap(line, contentWidth);
    ensureSpace(lines.length * 3.8 + 2);
    setText(SECONDARY);
    doc.text(lines, margin, cursorY);
    cursorY += lines.length * 3.8 + 1.5;
  });
  cursorY += 4;

  // === SIGNATURE ===
  ensureSpace(28);
  const sigW = 70;
  const sigX = pageWidth - margin - sigW;
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.text(`For ${MYLAPAY_BRANDING.companyName}`, sigX + sigW, cursorY, { align: "right" });
  cursorY += 18;
  setStroke(SECONDARY);
  doc.setLineWidth(0.4);
  doc.line(sigX, cursorY, sigX + sigW, cursorY);
  setText(SECONDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.text(getClientSignatureName(client), sigX + sigW, cursorY + 4, { align: "right" });
  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.text("Authorized Signatory", sigX + sigW, cursorY + 8, { align: "right" });

  drawFooter();
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
          <CardHeader>
            <CardTitle>Commercial Summary Panel</CardTitle>
            <CardDescription>Fixed charges, variable slabs, AWS pass-through and tax preview</CardDescription>
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
                      <TableCell>{currencyLabel(invoice.amount, client.currency || "INR")}</TableCell>
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
                <span className="font-medium">{currencyLabel(client.awsInfraRecovery, client.currency || "INR")}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Recon services revenue</span>
                <span className="font-medium">{currencyLabel(client.reconRevenue, client.currency || "INR")}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Profitability services revenue</span>
                <span className="font-medium">{currencyLabel(client.profitabilityRevenue, client.currency || "INR")}</span>
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
  const [clientType, setClientType] = useState<ClientType>(client?.clientType || "Domestic");
  const [clientCurrency, setClientCurrency] = useState<CurrencyType>(client?.currency || "INR");

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
      clientType,
      clientCurrency,
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

  const [clients, setClients] = useState<ClientRecord[]>([]);
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
      return raw ? { ...DEFAULT_TAX_CONFIG, ...JSON.parse(raw) } : DEFAULT_TAX_CONFIG;
    } catch {
      return DEFAULT_TAX_CONFIG;
    }
  });

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

  const currentUser = "admin@mylapay.com";
  const currentUserRole = "admin";

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
          const dbClients: ClientRecord[] = data.map((client: any) => ({
            id: client.clientId,
            code: client.clientCode,
            name: client.clientName,
            status: client.status,
            priority: client.priority,
            services: client.services || [],
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
            transactionSlabs: [],
            aws: { enabled: false, vendorCost: 0, marginPercentage: 0 },
            notes: client.notes,
            invoiceHistory: [],
            gstin: client.gstin,
            lutNumber: client.lutNumber,
            billingAddress: client.billingAddress,
            billingEmail: client.billingEmail,
            signatoryName: client.signatoryName,
            clientType: client.clientType || "Domestic",
            currency: client.currency || "INR",
          }));
          console.log("[InvoiceManagement] Mapped clients:", dbClients);
          setClients(dbClients);
        } else {
          console.warn("[InvoiceManagement] API did not return an array");
        }
      })
      .catch(err => {
        console.error("[InvoiceManagement] Failed to load clients from database:", err);
        toast({
          title: "Warning",
          description: "Could not load clients from database. Please refresh the page.",
        });
      });
  }, [toast]);

  const selectedClient = useMemo(() => {
    const found = clients.find((item) => item.id === clientId);
    console.log("[Invoice] selectedClient useMemo - clientId:", clientId, "found:", found, "all clients:", clients);
    return found || clients[0];
  }, [clients, clientId]);
  const editingClient = useMemo(() => clients.find((item) => item.id === (editingClientId || clientId)) || undefined, [clients, editingClientId, clientId]);
  const invoiceNumberPreview = useMemo(
    () => getCurrentInvoiceNumberPreview(invoiceSerialConfig),
    [invoiceSerialConfig],
  );

  const openInvoiceCreateModal = (client: ClientRecord) => {
    console.log("[Invoice] openInvoiceCreateModal - Opening for client:", client?.name, client);

    if (!client) {
      console.error("[Invoice] openInvoiceCreateModal - No client provided");
      toast({ title: "Error", description: "Client not found", variant: "destructive" });
      return;
    }

    try {
      setInvoiceModalMode("create");
      setSelectedInvoice(null);

      const estimated = Math.round(estimateInvoiceFromSlabs(
        client.monthlyTransactionVolume || 0,
        client.fixedBilling || 0,
        client.transactionSlabs || [],
        client.aws || { enabled: false, vendorCost: 0, marginPercentage: 0 },
        client.minimumGuarantee || 0,
        client.integrationFee || 0,
        client.additionalPlatformFee || 0,
      ));

      console.log("[Invoice] openInvoiceCreateModal - Estimated amount:", estimated);
      setInvoiceAmountDraft(estimated);
      setInvoiceMonthDraft(new Date().toLocaleString("en-IN", { month: "short", year: "numeric" }));
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
    setInvoiceMonthDraft(invoice.month);
    setInvoiceModalOpen(true);
  };

  useEffect(() => {
    if (isCreateRoute) {
      setEditingClientId(null);
      setInvoiceModalOpen(false);
    }
  }, [isCreateRoute]);

  // Fetch client data from database when editing or viewing a specific client
  useEffect(() => {
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
            const updatedClient: ClientRecord = {
              id: data.id || data.clientId,
              code: data.code || data.clientCode,
              name: data.name || data.clientName,
              status: data.status,
              priority: data.priority,
              services: data.services || [],
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
              transactionSlabs: data.transactionSlabs || [],
              aws: data.aws || { enabled: false, vendorCost: 0, marginPercentage: 0 },
              notes: data.notes,
              invoiceHistory: data.invoiceHistory || [],
              gstin: data.gstin,
              lutNumber: data.lutNumber,
              billingAddress: data.billingAddress,
              billingEmail: data.billingEmail,
              signatoryName: data.signatoryName,
              clientType: data.clientType || "Domestic",
              currency: data.currency || "INR",
            };
            console.log("[Invoice] Updated client object:", updatedClient);
            return exists ? prev.map(c => (c.id === data.id || c.id === data.clientId) ? updatedClient : c) : [updatedClient, ...prev];
          });
        })
        .catch(err => {
          console.error("[Invoice] Failed to fetch client from database:", err);
          toast({
            title: "Warning",
            description: "Could not load client data from database",
            variant: "destructive",
          });
        });
    }
  }, [isEditRoute, isOverviewRoute, clientId, toast]);

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
    console.log("[Invoice] generateInvoiceForClient - Starting for client:", client?.name);

    if (!client) {
      console.error("[Invoice] generateInvoiceForClient - No client provided");
      toast({ title: "Error", description: "Client not found", variant: "destructive" });
      return;
    }

    try {
      const generatedDate = new Date().toISOString().split("T")[0];
      console.log("[Invoice] generateInvoiceForClient - Generated date:", generatedDate);

      const generatedAmount = Math.round(
        estimateInvoiceFromSlabs(
          client.monthlyTransactionVolume || 0,
          client.fixedBilling || 0,
          client.transactionSlabs || [],
          client.aws || { enabled: false, vendorCost: 0, marginPercentage: 0 },
          client.minimumGuarantee || 0,
          client.integrationFee || 0,
          client.additionalPlatformFee || 0,
        ),
      );

      console.log("[Invoice] generateInvoiceForClient - Generated amount:", generatedAmount);

      const serialInfo = getInvoiceNumberForClient(client, invoiceSerialConfig, invoiceSerialState);
      console.log("[Invoice] generateInvoiceForClient - Serial info:", serialInfo);

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

      console.log("[Invoice] generateInvoiceForClient - Next invoice object:", nextInvoice);

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

      console.log("[Invoice] generateInvoiceForClient - Invoice generated successfully");
      toast({
        title: "Invoice sent for approval",
        description: `${client.name} invoice ${serialInfo.invoiceNumber} is waiting for FinOps approval.`,
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
      setTaxConfig((prev) => ({ ...prev, ...request.changes }));
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

  const saveConfig = async (payload: any) => {
    try {
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
        clientType: payload.clientType || "Domestic",
        currency: payload.clientCurrency || "INR",
      };

      // Save to database via API (encrypted at rest)
      await fetch("/api/invoice-management/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: baseId,
          clientCode: payload.code,
          clientName: payload.name,
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
          gstin: payload.gstin,
          lutNumber: payload.lutNumber,
          billingAddress: payload.billingAddress,
          billingEmail: payload.billingEmail,
          signatoryName: payload.signatoryName,
          clientType: payload.clientType || "Domestic",
          currency: payload.clientCurrency || "INR",
          notes: payload.notes,
        }),
      });

      setClients((prev) => {
        const exists = prev.some((client) => client.id === baseId);
        return exists ? prev.map((client) => (client.id === baseId ? nextClient : client)) : [nextClient, ...prev];
      });

      toast({
        title: `Configuration ${payload.id ? "updated" : "created"}`,
        description: `${payload.name} commercial configuration saved successfully to database (encrypted).`,
      });

      navigate(`/invoice-management/client/${baseId}`);
    } catch (error) {
      console.error("Error saving client config:", error);
      toast({
        title: "Error",
        description: "Failed to save client configuration to database",
        variant: "destructive",
      });
    }
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
      <>
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

        {/* Invoice Creation/Editing Modal */}
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
          </div>
          <div className="flex flex-wrap gap-2">
            {(currentUserRole === "admin" || currentUserRole === "finance-admin") && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSettingsViewOpen(true)}
                title="Configuration settings (Admin only)"
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
            <Button
              className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500"
              onClick={() => navigate("/invoice-management/new")}
            >
              <Plus className="h-4 w-4" /> Create Config
            </Button>
          </div>
        </div>
      </div>

      {/* Configuration sections shown when settings view is open */}
      {settingsViewOpen && (
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

      <Card className="border-muted/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mylapay Configuration</CardTitle>
              <CardDescription>
                Company details, tax settings, and currency management (click settings icon for change requests)
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">
              3 sections
            </Badge>
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
      {!settingsViewOpen && (
        <>
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
        </>
      )}

    </div>
  );
}
