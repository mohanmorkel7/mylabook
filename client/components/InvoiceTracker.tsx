import { useState, useEffect, useMemo, useCallback } from "react";
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
  FileText, IndianRupee, RefreshCw, Send, TrendingUp, ChevronDown,
  ChevronUp, Eye, Ban, DollarSign, Wallet,
} from "lucide-react";

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
  "Rejected":             "bg-gray-100 text-gray-700 border-gray-200",
  "Closed":               "bg-gray-100 text-gray-700 border-gray-200",
};

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

// ── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card className={`border-l-4 ${color} shadow-sm hover:shadow-md transition-shadow`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-xl ${color.replace("border-l-", "bg-").replace("-500", "-50")}`}>
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
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs">
      {label && <p className="font-semibold mb-1 text-gray-700">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-medium">{formatter ? formatter(entry.value, entry.name) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────
function PaymentModal({ invoice, onClose, onSaved }: { invoice: TrackerInvoice; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amountPaid, setAmountPaid] = useState(String(invoice.amount - invoice.totalPaid));
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
      const res = await fetch(`/api/invoice-management/invoices/${invoice.invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
            <CreditCard className="h-4 w-4 text-indigo-600" /> Record Payment
          </DialogTitle>
        </DialogHeader>

        {/* Invoice summary */}
        <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{invoice.invoiceNumber}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span className="font-medium">{invoice.clientName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice Amount</span><span className="font-semibold">{fmtINR(invoice.amount)}</span></div>
          {invoice.totalPaid > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">{fmtINR(invoice.totalPaid)}</span></div>}
          <div className="flex justify-between font-semibold border-t pt-1"><span>Balance Due</span><span className="text-red-600">{fmtINR(Math.max(0, invoice.amount - invoice.totalPaid))}</span></div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount Paid (₹)</Label>
              <Input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0" min={0} />
            </div>
            <div className="space-y-1">
              <Label>Payment Date</Label>
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
                  <Input readOnly value={tdsAmount} className="bg-amber-100 font-semibold" />
                </div>
              </div>
              <div className="text-xs text-amber-700 font-medium flex justify-between">
                <span>Net receivable after TDS:</span>
                <span>{fmtINR(netReceivable)}</span>
              </div>
              <p className="text-xs text-amber-600">⚠ TDS amount should match Income Tax 26AS for audit compliance</p>
            </div>
          )}

          {isPartial && Number(amountPaid) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div className="flex justify-between"><span>Remaining balance after this payment:</span><span className="font-semibold text-blue-700">{fmtINR(Math.max(0, balanceDue))}</span></div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Notes</Label>
            <Input placeholder="e.g. Cheque no., NEFT ref..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Payments History Modal ────────────────────────────────────────────────
function PaymentsHistoryModal({ invoice, onClose }: { invoice: TrackerInvoice; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment History — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoice Amount</span>
            <span className="font-semibold">{fmtINR(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="font-semibold text-green-600">{fmtINR(invoice.totalPaid)}</span>
          </div>
          {invoice.totalTds > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">TDS Deducted</span>
              <span className="font-semibold text-amber-600">{fmtINR(invoice.totalTds)}</span>
            </div>
          )}
        </div>
        <ScrollArea className="max-h-64">
          {invoice.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No payments recorded</p>
          ) : (
            <div className="space-y-2">
              {invoice.payments.map((p, i) => (
                <div key={p.id} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between font-medium">
                    <span>Payment #{i + 1}</span>
                    <span className="text-green-600">{fmtINR(p.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{fmtDate(p.paymentDate)}</span>
                    <span>{p.isPartial ? "Partial" : "Full"}</span>
                  </div>
                  {p.isTds && <div className="text-xs text-amber-600">TDS: {p.tdsPercentage}% = {fmtINR(p.tdsAmount)}</div>}
                  {p.notes && <div className="text-xs text-gray-500">{p.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function InvoiceTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<TrackerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<TrackerInvoice | null>(null);
  const [historyModal, setHistoryModal] = useState<TrackerInvoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<"date" | "amount" | "client">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const isAdmin = user?.role === "admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoice-management/tracker");
      if (!res.ok) throw new Error("Failed to fetch tracker data");
      const data = await res.json();
      setInvoices(data);
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
    const totalAmt    = invoices.reduce((s, i) => s + i.amount, 0);
    const receivedAmt = invoices.reduce((s, i) => s + i.totalPaid, 0);
    const tdsAmt      = invoices.reduce((s, i) => s + i.totalTds, 0);
    const pendingAmt  = totalAmt - receivedAmt;
    return { total, waiting, approved, sent, overdue, received, totalAmt, receivedAmt, tdsAmt, pendingAmt };
  }, [invoices]);

  // ── Chart data ──────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; count: number; amount: number; received: number }> = {};
    invoices.forEach(inv => {
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

  // ── Filtered + sorted table rows ────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = invoices.map(inv => ({ ...inv, _computedStatus: isOverdue(inv) ? "Overdue" : inv.status }));
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

  // ── Actions ─────────────────────────────────────────────────────────────
  const updateStatus = async (inv: TrackerInvoice, newStatus: string) => {
    const body: any = {
      status: newStatus,
      approved_by: user?.email || "admin",
    };
    if (newStatus === "Generated") body.approved_date = new Date().toISOString().split("T")[0];
    if (newStatus === "Send")      body.sent_date = new Date().toISOString().split("T")[0];

    try {
      const res = await fetch(`/api/invoice-management/invoices/${inv.invoiceId}/status`, {
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
    sortCol === col ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null;

  const STATUS_FILTERS = ["All", "Waiting for approval", "Generated", "Send", "Overdue", "Received", "Rejected"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="ml-3 text-muted-foreground">Loading tracker data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard icon={FileText}    label="Total Invoices"       value={metrics.total}    sub={fmtINR(metrics.totalAmt)}    color="border-l-slate-500" />
        <StatCard icon={Clock}       label="Waiting Approval"     value={metrics.waiting}                                    color="border-l-amber-500" />
        <StatCard icon={BadgeCheck}  label="Approved"             value={metrics.approved}                                   color="border-l-blue-500" />
        <StatCard icon={Send}        label="Sent to Client"       value={metrics.sent}                                       color="border-l-indigo-500" />
        <StatCard icon={AlertTriangle} label="Overdue (>15 days)" value={metrics.overdue}                                    color="border-l-red-500" />
        <StatCard icon={CheckCircle2} label="Received"            value={metrics.received} sub={fmtINR(metrics.receivedAmt)} color="border-l-green-500" />
        <StatCard icon={IndianRupee} label="Pending Amount"       value={fmtINR(metrics.pendingAmt)}                        color="border-l-orange-500" />
        <StatCard icon={Wallet}      label="TDS Collected"        value={fmtINR(metrics.tdsAmt)}                            color="border-l-purple-500" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Invoice Volume */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> Monthly Invoice Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
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
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => fmtINR(v)} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="amount" name="Invoiced" stroke="#6366f1" fill="url(#gradAmt)" strokeWidth={2} />
                <Area type="monotone" dataKey="received" name="Received" stroke="#10b981" fill="url(#gradRec)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" /> Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusDistData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                  {statusDistData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ fontSize: 10 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* TDS Chart */}
        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-500" /> Monthly TDS vs Net Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tdsData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => fmtINR(v)} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="netPaid" name="Net Received" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="tds" name="TDS Deducted" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table section */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">Invoice List</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <Input
                placeholder="Search invoice / client..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-48 text-xs"
              />
              {/* Status filter pills */}
              <div className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                      statusFilter === s
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                    }`}
                  >
                    {s} {s !== "All" && `(${filtered.filter(r => r._computedStatus === s).length || invoices.filter(i => (isOverdue(i) ? "Overdue" : i.status) === s).length})`}
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
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Invoice</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("client")}>
                    <span className="flex items-center gap-1">Client <SortIcon col="client" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Month</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("amount")}>
                    <span className="flex items-center justify-end gap-1">Amount <SortIcon col="amount" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("date")}>
                    <span className="flex items-center gap-1">Generated <SortIcon col="date" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Sent</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Due</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Paid</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">TDS</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">No invoices found</td></tr>
                )}
                {filtered.map((inv, idx) => {
                  const overdue = isOverdue(inv);
                  const computedStatus = overdue ? "Overdue" : inv.status;
                  const dueDate = inv.sentDate ? new Date(new Date(inv.sentDate).getTime() + 15 * 86400000).toISOString().split("T")[0] : null;
                  const isExpanded = expandedRow === inv.invoiceId;

                  return (
                    <>
                      <tr
                        key={inv.invoiceId}
                        className={`border-b transition-colors hover:bg-muted/30 ${overdue ? "bg-red-50/50" : ""}`}
                      >
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <button
                            className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                            onClick={() => setExpandedRow(isExpanded ? null : inv.invoiceId)}
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="px-3 py-2 max-w-[140px] truncate" title={inv.clientName}>{inv.clientName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{inv.month}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtINR(inv.amount)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[computedStatus] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {computedStatus}
                            {overdue && ` (${daysSince(inv.sentDate)}d)`}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(inv.generatedDate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(inv.sentDate)}</td>
                        <td className={`px-3 py-2 whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                          {dueDate ? fmtDate(dueDate) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {inv.totalPaid > 0 ? (
                            <span className="text-green-600 font-medium">{fmtINR(inv.totalPaid)}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {inv.totalTds > 0 ? (
                            <span className="text-amber-600">{fmtINR(inv.totalTds)}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {/* Approve button */}
                            {isAdmin && inv.status === "Waiting for approval" && (
                              <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                                onClick={() => updateStatus(inv, "Generated")}>Approve</Button>
                            )}
                            {/* Send button */}
                            {isAdmin && inv.status === "Generated" && (
                              <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                                onClick={() => updateStatus(inv, "Send")}>Send</Button>
                            )}
                            {/* Payment button */}
                            {(inv.status === "Send" || inv.status === "Sent" || overdue) && inv.status !== "Received" && (
                              <Button size="sm" className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => setPaymentModal(inv)}>Receive</Button>
                            )}
                            {/* View payments */}
                            {inv.payments.length > 0 && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                                onClick={() => setHistoryModal(inv)}>
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded row for payment details */}
                      {isExpanded && (
                        <tr key={`exp-${inv.invoiceId}`} className="bg-muted/20 border-b">
                          <td colSpan={12} className="px-4 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div><span className="text-muted-foreground">Financial Year</span><br /><span className="font-medium">{inv.financialYear || "—"}</span></div>
                              <div><span className="text-muted-foreground">Billing Model</span><br /><span className="font-medium capitalize">{inv.billingModel || "—"}</span></div>
                              <div><span className="text-muted-foreground">Invoice Type</span><br /><span className="font-medium capitalize">{inv.invoiceType || "—"}</span></div>
                              <div><span className="text-muted-foreground">Approved By</span><br /><span className="font-medium">{inv.approvedBy || "—"}</span></div>
                              <div><span className="text-muted-foreground">Approved Date</span><br /><span className="font-medium">{fmtDate(inv.approvedDate)}</span></div>
                              <div><span className="text-muted-foreground">Payment Count</span><br /><span className="font-medium">{inv.payments.length}</span></div>
                              <div><span className="text-muted-foreground">Balance Due</span><br /><span className={`font-medium ${inv.amount - inv.totalPaid > 0 ? "text-red-600" : "text-green-600"}`}>{fmtINR(Math.max(0, inv.amount - inv.totalPaid))}</span></div>
                              <div><span className="text-muted-foreground">TDS (Audit)</span><br /><span className="font-medium text-amber-600">{fmtINR(inv.totalTds)}</span></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
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
    </div>
  );
}
