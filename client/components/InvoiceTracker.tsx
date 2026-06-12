import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  AlertTriangle, BadgeCheck, CheckCircle2, Clock, CreditCard,
  FileText, IndianRupee, RefreshCw, Send, TrendingUp,
  ChevronDown, ChevronUp, Eye, Wallet, DollarSign,
  ChevronLeft, ChevronRight, FileDown, X, XCircle, ThumbsUp, ThumbsDown, Ban,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ── Types ─────────────────────────────────────────────────────────────────
interface Payment {
  id: number;
  invoiceId: string;
  paymentDate: string;
  amountPaid: number;
  isTds: boolean;
  tdsPercentage: number;
  tdsAmount: number;
  isPartial: boolean;
  notes: string;
  createdBy: string;
  createdAt: string;
}

interface TrackerInvoice {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  month: string;
  amount: number;
  status: string;
  generatedDate: string;
  financialYear: string;
  serial: number;
  billingModel: string;
  invoiceType: string;
  sentDate: string | null;
  approvedDate: string | null;
  approvedBy: string | null;
  createdAt: string;
  payments: Payment[];
  totalPaid: number;
  totalTds: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const daysSince = (d: string | null | undefined) => {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
};

const isOverdue = (inv: TrackerInvoice) =>
  (inv.status === "Send" || inv.status === "Sent") && daysSince(inv.sentDate) > 15;

const STATUS_COLOR: Record<string, string> = {
  "Waiting for approval": "bg-amber-100 text-amber-800 border-amber-200",
  "Generated":            "bg-blue-100 text-blue-800 border-blue-200",
  "Send":                 "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Sent":                 "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Received":             "bg-green-100 text-green-800 border-green-200",
  "Overdue":              "bg-red-100 text-red-800 border-red-200",
  "Rejected":             "bg-gray-100 text-gray-600 border-gray-200",
  "Closed":               "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_OPTIONS = [
  "Waiting for approval",
  "Generated",
  "Send",
  "Received",
  "Rejected",
  "Overdue",
  "Closed",
];

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

// ── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card className={`border-l-4 ${color} shadow-sm hover:shadow-md transition-shadow`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-white/60">
          <Icon className={`h-5 w-5 ${color.replace("border-l-", "text-")}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs max-w-[220px]">
      {label && <p className="font-semibold mb-1.5 text-gray-700 border-b pb-1">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-gray-500 truncate">{entry.name}:</span>
          <span className="font-semibold ml-auto">{formatter ? formatter(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Invoice Preview Modal (for finance users and admins) ──────────────────
function InvoicePreviewModal({
  invoice, canDownload, onClose,
}: { invoice: TrackerInvoice; canDownload: boolean; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = pdf.internal.pageSize.getWidth();
      const ratio = canvas.height / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, pw, pw * ratio);
      pdf.save(`${invoice.invoiceNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" /> {invoice.invoiceNumber}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {canDownload && (
                <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white h-8"
                  onClick={handleDownloadPDF} disabled={downloading}>
                  <FileDown className="h-3.5 w-3.5" />
                  {downloading ? "Generating…" : "Download PDF"}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div ref={printRef} className="p-6 space-y-4 bg-white">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Tax Invoice</h2>
                <p className="text-sm text-gray-500">{invoice.invoiceNumber}</p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Generated: {fmtDate(invoice.generatedDate)}</p>
                <p>FY: {invoice.financialYear || "—"}</p>
              </div>
            </div>

            {/* Bill to */}
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
                <p className="font-semibold text-gray-900">{invoice.clientName}</p>
                <p className="text-gray-500">Client ID: {invoice.clientId}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Invoice Details</p>
                <p className="text-gray-700">Month: <span className="font-medium">{invoice.month}</span></p>
                <p className="text-gray-700">Billing: <span className="font-medium capitalize">{invoice.billingModel}</span></p>
                <p className="text-gray-700">Type: <span className="font-medium capitalize">{invoice.invoiceType}</span></p>
              </div>
            </div>

            {/* Amount table */}
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Description</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-2 text-gray-700">Professional Services — {invoice.month}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtINR(invoice.amount)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-gray-50 border-t-2">
                <tr>
                  <td className="px-4 py-2 font-bold">Total</td>
                  <td className="px-4 py-2 text-right font-bold text-indigo-700">{fmtINR(invoice.amount)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Status & payment */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[invoice.status] || ""}`}>
                  {invoice.status}
                </span>
                {invoice.sentDate && <p className="text-gray-500 text-xs">Sent: {fmtDate(invoice.sentDate)}</p>}
                {invoice.approvedBy && <p className="text-gray-500 text-xs">Approved by: {invoice.approvedBy}</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payment</p>
                <p className="font-semibold text-green-600">{fmtINR(invoice.totalPaid)} received</p>
                {invoice.totalTds > 0 && <p className="text-amber-600 text-xs">TDS: {fmtINR(invoice.totalTds)}</p>}
                <p className="text-red-500 text-xs">Balance: {fmtINR(Math.max(0, invoice.amount - invoice.totalPaid))}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────
function PaymentModal({
  invoice, onClose, onSaved,
}: { invoice: TrackerInvoice; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amountPaid, setAmountPaid] = useState(String(Math.max(0, invoice.amount - invoice.totalPaid)));
  const [isTds, setIsTds] = useState(false);
  const [tdsPercentage, setTdsPercentage] = useState("10");
  const [isPartial, setIsPartial] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const tdsAmount = isTds ? Math.round((Number(amountPaid) * Number(tdsPercentage)) / 100) : 0;
  const netReceivable = Number(amountPaid) - tdsAmount;
  const balanceDue = invoice.amount - invoice.totalPaid - Number(amountPaid);

  const handleSave = async () => {
    if (!amountPaid || Number(amountPaid) <= 0) {
      toast({ title: "Error", description: "Enter a valid paid amount", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/invoice-management/invoices/add-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.invoiceId,
          payment_date: paymentDate,
          amount_paid: Number(amountPaid),
          is_tds: isTds,
          tds_percentage: Number(tdsPercentage),
          tds_amount: tdsAmount,
          is_partial: isPartial,
          notes,
          created_by: user?.email || "admin",
        }),
      });
      if (!res.ok) throw new Error("Failed to save payment");
      toast({ title: "Payment recorded", description: `${fmtINR(Number(amountPaid))} recorded for ${invoice.invoiceNumber}` });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-indigo-600" /> Record Payment — {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span className="font-medium">{invoice.clientName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice Amount</span><span className="font-semibold">{fmtINR(invoice.amount)}</span></div>
          {invoice.totalPaid > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">{fmtINR(invoice.totalPaid)}</span></div>}
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Balance Due</span>
            <span className="text-red-600">{fmtINR(Math.max(0, invoice.amount - invoice.totalPaid))}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount Paid (₹) *</Label>
              <Input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} min={1} />
            </div>
            <div className="space-y-1">
              <Label>Payment Date *</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox id="tds" checked={isTds} onCheckedChange={v => setIsTds(Boolean(v))} />
              <Label htmlFor="tds" className="cursor-pointer">TDS Deducted</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="partial" checked={isPartial} onCheckedChange={v => setIsPartial(Boolean(v))} />
              <Label htmlFor="partial" className="cursor-pointer">Partial Payment</Label>
            </div>
          </div>

          {isTds && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <Label>TDS Rate (%)</Label>
                  <Input type="number" value={tdsPercentage} onChange={e => setTdsPercentage(e.target.value)} min={0} max={100} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label>TDS Amount (₹)</Label>
                  <Input readOnly value={tdsAmount.toLocaleString("en-IN")} className="bg-amber-100 font-semibold" />
                </div>
              </div>
              <div className="text-xs text-amber-800 flex justify-between font-medium">
                <span>Net receivable after TDS:</span><span>{fmtINR(netReceivable)}</span>
              </div>
              <p className="text-xs text-amber-600">⚠ TDS must match Income Tax 26AS for audit compliance</p>
            </div>
          )}

          {isPartial && Number(amountPaid) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span>Remaining after this payment:</span>
                <span className="font-semibold text-blue-700">{fmtINR(Math.max(0, balanceDue))}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Notes</Label>
            <Input placeholder="e.g. Cheque no., NEFT ref…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Payments History Popup ────────────────────────────────────────────────
function PaymentsHistoryModal({ invoice, onClose }: { invoice: TrackerInvoice; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Payments — {invoice.invoiceNumber}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice Amount</span><span className="font-semibold">{fmtINR(invoice.amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="text-green-600 font-semibold">{fmtINR(invoice.totalPaid)}</span></div>
          {invoice.totalTds > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Total TDS</span><span className="text-amber-600 font-semibold">{fmtINR(invoice.totalTds)}</span></div>}
        </div>
        <ScrollArea className="max-h-60">
          {invoice.payments.length === 0
            ? <p className="text-sm text-center text-muted-foreground py-6">No payments recorded</p>
            : invoice.payments.map((p, i) => (
              <div key={p.id} className="border rounded-lg p-3 text-sm mb-2 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>Payment #{i + 1} {p.isPartial ? "(Partial)" : "(Full)"}</span>
                  <span className="text-green-600">{fmtINR(p.amountPaid)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{fmtDate(p.paymentDate)}</div>
                {p.isTds && <div className="text-xs text-amber-600">TDS {p.tdsPercentage}% = {fmtINR(p.tdsAmount)}</div>}
                {p.notes && <div className="text-xs text-gray-500">{p.notes}</div>}
              </div>
            ))
          }
        </ScrollArea>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ── Status Dropdown ───────────────────────────────────────────────────────
function StatusDropdown({ invoice, canChangeStatus, onStatusChange }: {
  invoice: TrackerInvoice;
  canChangeStatus: boolean;
  onStatusChange: (inv: TrackerInvoice, status: string) => void;
}) {
  const computedStatus = isOverdue(invoice) ? "Overdue" : invoice.status;
  return (
    <select
      disabled={!canChangeStatus}
      value={invoice.status}
      onChange={e => onStatusChange(invoice, e.target.value)}
      className={`text-xs rounded-full px-2 py-0.5 border font-medium appearance-none cursor-pointer disabled:cursor-default disabled:opacity-80
        ${STATUS_COLOR[computedStatus] || "bg-gray-100 text-gray-600 border-gray-200"}
        ${canChangeStatus ? "hover:opacity-80 focus:outline-none" : ""}`}
    >
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function InvoiceTracker() {
  const { user } = useAuth();
  const { toast } = useToast();

  const isAdmin = user?.role === "admin";
  const isFinanceDeptAdmin =
    (user as any)?.department_admin === true &&
    String((user as any)?.admin_for_department || "").toLowerCase() === "finance";
  const canManage = isAdmin || isFinanceDeptAdmin;
  const isFinanceOnlyUser = !isAdmin && !isFinanceDeptAdmin;

  const [invoices, setInvoices] = useState<TrackerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<TrackerInvoice | null>(null);
  const [historyModal, setHistoryModal] = useState<TrackerInvoice | null>(null);
  const [previewModal, setPreviewModal] = useState<TrackerInvoice | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<"date" | "amount" | "client">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoice-management/tracker");
      if (!res.ok) throw new Error("Failed to fetch");
      setInvoices(await res.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed metrics ────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total       = invoices.length;
    const waiting     = invoices.filter(i => i.status === "Waiting for approval").length;
    const approved    = invoices.filter(i => i.status === "Generated").length;
    const sent        = invoices.filter(i => i.status === "Send" || i.status === "Sent").length;
    const overdue     = invoices.filter(isOverdue).length;
    const received    = invoices.filter(i => i.status === "Received").length;
    const rejected    = invoices.filter(i => i.status === "Rejected").length;
    // Exclude rejected invoices from all revenue metrics
    const activeInvoices = invoices.filter(i => i.status !== "Rejected");
    const totalAmt    = activeInvoices.reduce((s, i) => s + i.amount, 0);
    const receivedAmt = activeInvoices.reduce((s, i) => s + i.totalPaid, 0);
    const tdsAmt      = activeInvoices.reduce((s, i) => s + i.totalTds, 0);
    const pendingAmt  = totalAmt - receivedAmt;
    return { total, waiting, approved, sent, overdue, received, rejected, totalAmt, receivedAmt, tdsAmt, pendingAmt };
  }, [invoices]);

  // ── Chart data ──────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; count: number; amount: number; received: number }> = {};
    invoices.forEach(inv => {
      if (inv.status === "Rejected") return; // exclude rejected from chart
      const key = inv.month || inv.generatedDate?.substring(0, 7) || "Unknown";
      if (!map[key]) map[key] = { month: key, count: 0, amount: 0, received: 0 };
      map[key].count++;
      map[key].amount += inv.amount;
      map[key].received += inv.totalPaid;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [invoices]);

  const statusDistData = useMemo(() => {
    const counts: Record<string, number> = {};
    invoices.forEach(inv => {
      const s = isOverdue(inv) ? "Overdue" : inv.status;
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [invoices]);

  const tdsData = useMemo(() => {
    const map: Record<string, { month: string; tds: number; netPaid: number }> = {};
    invoices.forEach(inv => {
      const key = inv.month || inv.generatedDate?.substring(0, 7) || "Unknown";
      if (!map[key]) map[key] = { month: key, tds: 0, netPaid: 0 };
      map[key].tds += inv.totalTds;
      map[key].netPaid += (inv.totalPaid - inv.totalTds);
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [invoices]);

  // ── Filtered + sorted rows ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = invoices.map(inv => ({
      ...inv,
      _computedStatus: isOverdue(inv) ? "Overdue" : inv.status,
    }));
    if (statusFilter !== "All") rows = rows.filter(r => r._computedStatus === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.invoiceNumber?.toLowerCase().includes(q) ||
        r.clientName?.toLowerCase().includes(q) ||
        r.month?.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "date")   cmp = (a.generatedDate || "").localeCompare(b.generatedDate || "");
      if (sortCol === "amount") cmp = a.amount - b.amount;
      if (sortCol === "client") cmp = (a.clientName || "").localeCompare(b.clientName || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [invoices, statusFilter, searchQuery, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filter/search changes
  useEffect(() => { setPage(1); }, [statusFilter, searchQuery, sortCol, sortDir]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleStatusChange = async (inv: TrackerInvoice, newStatus: string) => {
    // When changing to "Received", show payment modal
    if (newStatus === "Received") {
      setPaymentModal(inv);
      return;
    }
    const body: any = { invoiceId: inv.invoiceId, status: newStatus, approved_by: user?.email || "admin" };
    if (newStatus === "Generated") body.approved_date = new Date().toISOString().split("T")[0];
    if (newStatus === "Send")      body.sent_date      = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/api/invoice-management/invoices/update-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Status updated", description: `${inv.invoiceNumber} → ${newStatus}` });
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const sortToggle = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) =>
    sortCol === col
      ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
      : null;

  const STATUS_FILTERS = ["All", "Waiting for approval", "Generated", "Send", "Overdue", "Received", "Rejected"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="ml-3 text-muted-foreground">Loading tracker data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Invoice Tracker</h2>
          <p className="text-sm text-muted-foreground">{invoices.length} invoices across all clients</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 self-start">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={FileText}      label="Total Invoices"    value={metrics.total}    sub={fmtINR(metrics.totalAmt)}    color="border-l-slate-500" />
        <StatCard icon={Clock}         label="Waiting Approval"  value={metrics.waiting}                                    color="border-l-amber-500" />
        <StatCard icon={BadgeCheck}    label="Approved"          value={metrics.approved}                                   color="border-l-blue-500" />
        <StatCard icon={Ban}           label="Rejected"          value={metrics.rejected} sub="Excluded from revenue"       color="border-l-red-600" />
        <StatCard icon={Send}          label="Sent to Client"    value={metrics.sent}                                       color="border-l-indigo-500" />
        <StatCard icon={AlertTriangle} label="Overdue >15 days"  value={metrics.overdue}                                    color="border-l-red-500" />
        <StatCard icon={CheckCircle2}  label="Received"          value={metrics.received} sub={fmtINR(metrics.receivedAmt)} color="border-l-green-500" />
        <StatCard icon={IndianRupee}   label="Pending Amount"    value={fmtINR(metrics.pendingAmt)}                        color="border-l-orange-500" />
        <StatCard icon={Wallet}        label="TDS Collected"     value={fmtINR(metrics.tdsAmt)}                            color="border-l-purple-500" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> Monthly Invoice vs Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradAmt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={50} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => fmtINR(v)} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="amount" name="Invoiced" stroke="#6366f1" fill="url(#gradAmt)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="received" name="Received" stroke="#10b981" fill="url(#gradRec)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" /> Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={statusDistData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={72} innerRadius={36}>
                  {statusDistData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-500" /> Monthly TDS vs Net Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={tdsData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={50} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => fmtINR(v)} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="netPaid" name="Net Received" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="tds" name="TDS Deducted" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">
              Invoice List
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({filtered.length} records, page {page} of {totalPages})
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search invoice / client…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-44 text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                      statusFilter === s
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 w-8">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Invoice No.</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("client")}>
                    <span className="flex items-center gap-1">Client <SortIcon col="client" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Month</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("amount")}>
                    <span className="flex items-center justify-end gap-1">Amount <SortIcon col="amount" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Approval</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("date")}>
                    <span className="flex items-center gap-1">Generated <SortIcon col="date" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Sent</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Due Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Paid</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">TDS</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-10 text-center text-muted-foreground">No invoices found</td></tr>
                )}
                {paginated.map((inv, idx) => {
                  const overdue = isOverdue(inv);
                  const dueDate = inv.sentDate
                    ? new Date(new Date(inv.sentDate).getTime() + 15 * 86400000).toISOString().split("T")[0]
                    : null;
                  const absIdx = (page - 1) * PAGE_SIZE + idx + 1;

                  return (
                    <tr key={inv.invoiceId} className={`border-b transition-colors hover:bg-muted/20 ${overdue ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-2.5 text-gray-400">{absIdx}</td>
                      <td className="px-3 py-2.5 font-medium text-indigo-600">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2.5 max-w-[130px] truncate" title={inv.clientName}>{inv.clientName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{inv.month}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{fmtINR(inv.amount)}</td>
                      <td className="px-3 py-2.5">
                        <StatusDropdown
                          invoice={inv}
                          canChangeStatus={canManage}
                          onStatusChange={handleStatusChange}
                        />
                        {overdue && (
                          <span className="block text-[10px] text-red-500 mt-0.5">
                            {daysSince(inv.sentDate)}d overdue
                          </span>
                        )}
                      </td>

                      {/* Approval column */}
                      <td className="px-3 py-2.5 text-center">
                        {(() => {
                          if (inv.status === "Waiting for approval") {
                            return canManage ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  title="Approve"
                                  onClick={() => handleStatusChange(inv, "Generated")}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100 text-[10px] font-semibold transition-colors"
                                >
                                  <ThumbsUp className="h-3 w-3" /> Approve
                                </button>
                                <button
                                  title="Reject"
                                  onClick={() => handleStatusChange(inv, "Rejected")}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 text-[10px] font-semibold transition-colors"
                                >
                                  <ThumbsDown className="h-3 w-3" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-amber-600 font-medium">Pending</span>
                            );
                          }
                          if (inv.status === "Rejected") {
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 border border-red-200 text-red-700 text-[10px] font-semibold">
                                <XCircle className="h-3 w-3" /> Rejected
                              </span>
                            );
                          }
                          // All other statuses = approved
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-700 text-[10px] font-semibold">
                              <BadgeCheck className="h-3 w-3" /> Approved
                            </span>
                          );
                        })()}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{fmtDate(inv.generatedDate)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{fmtDate(inv.sentDate)}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                        {dueDate ? fmtDate(dueDate) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {inv.totalPaid > 0
                          ? <span className="text-green-600 font-medium">{fmtINR(inv.totalPaid)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {inv.totalTds > 0
                          ? <span className="text-amber-600">{fmtINR(inv.totalTds)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          {/* PDF icon — always visible; finance users get eye, admin gets download */}
                          {isFinanceOnlyUser ? (
                            <button
                              title="View Invoice"
                              onClick={() => setPreviewModal(inv)}
                              className="p-1 rounded text-indigo-500 hover:bg-indigo-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              title="Preview / Download Invoice PDF"
                              onClick={() => setPreviewModal(inv)}
                              className="p-1 rounded text-indigo-500 hover:bg-indigo-50"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* View payments history */}
                          {inv.payments.length > 0 && (
                            <button
                              title="Payment history"
                              onClick={() => setHistoryModal(inv)}
                              className="p-1 rounded text-gray-500 hover:bg-gray-100"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Receive payment — when sent */}
                          {canManage && (inv.status === "Send" || inv.status === "Sent" || overdue) && inv.status !== "Received" && (
                            <button
                              title="Record Payment"
                              onClick={() => setPaymentModal(inv)}
                              className="p-1 rounded text-green-600 hover:bg-green-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 1} onClick={() => setPage(1)}>
                <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i, totalPages));
                return pg;
              }).filter((pg, i, arr) => arr.indexOf(pg) === i && pg >= 1 && pg <= totalPages).map(pg => (
                <Button
                  key={pg} variant={pg === page ? "default" : "outline"} size="sm"
                  className="h-7 w-7 p-0 text-xs"
                  onClick={() => setPage(pg)}
                >
                  {pg}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {paymentModal && (
        <PaymentModal invoice={paymentModal} onClose={() => setPaymentModal(null)} onSaved={fetchData} />
      )}
      {historyModal && (
        <PaymentsHistoryModal invoice={historyModal} onClose={() => setHistoryModal(null)} />
      )}
      {previewModal && (
        <InvoicePreviewModal
          invoice={previewModal}
          canDownload={canManage}
          onClose={() => setPreviewModal(null)}
        />
      )}
    </div>
  );
}
