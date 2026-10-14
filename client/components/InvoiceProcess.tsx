import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Search, Settings2 } from "lucide-react";

export interface ProcessClient {
  clientId: string;
  name: string;
  code?: string;
  billingEmail?: string;
}

export interface ProcessInvoice {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  amount: number;
  status: string;
  generatedDate: string;
  sentDate: string | null;
  totalPaid: number;
  totalTds: number;
  [key: string]: any;
}

interface ProcessCycle {
  internalTriggeredAt: string | null;
  internalTriggeredBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  externalTriggeredAt: string | null;
  externalTriggeredBy: string | null;
}

interface InvoiceProcessProps {
  clients: ProcessClient[];
  onPreviewInvoice: (invoice: ProcessInvoice) => void;
  onGetInvoicePdf: (invoice: ProcessInvoice) => Promise<{ fileName: string; base64: string }>;
}

const STATUS_FILTERS = ["Not Generated", "Generated", "Internal Triggered", "Approved", "External Triggered", "Received", "Rejected"];
const CARD_STATUSES = ["Generated", "Internal Triggered", "Approved", "External Triggered", "Received", "Rejected"];

const STATUS_COLOR: Record<string, string> = {
  "Not Generated": "bg-gray-100 text-gray-600 border-gray-200",
  "Generated": "bg-slate-100 text-slate-700 border-slate-200",
  "Internal Triggered": "bg-amber-100 text-amber-800 border-amber-200",
  "Approved": "bg-blue-100 text-blue-800 border-blue-200",
  "External Triggered": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Received": "bg-green-100 text-green-800 border-green-200",
  "Rejected": "bg-red-100 text-red-800 border-red-200",
};

function currentIstPeriod() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function fmtINR(value: number) {
  return `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function dueDateOf(sentDate: string | null) {
  if (!sentDate) return null;
  return new Date(new Date(sentDate).getTime() + 15 * 86400000).toISOString().split("T")[0];
}

function deriveStatus(invoice: ProcessInvoice | null, cycle: ProcessCycle | null) {
  if (!invoice) return "Not Generated";
  if (invoice.status === "Rejected") return "Rejected";
  if (invoice.status === "Received") return "Received";
  if (cycle?.externalTriggeredAt) return "External Triggered";
  if (cycle?.approvedAt) return "Approved";
  if (cycle?.internalTriggeredAt) return "Internal Triggered";
  return "Generated";
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export default function InvoiceProcess({ clients, onPreviewInvoice, onGetInvoicePdf }: InvoiceProcessProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role;
  const isFinance = role === "finance";
  const canInternalTrigger = role === "sales" || role === "admin";
  const canExternalTrigger = role === "sales" || role === "admin";
  const canConfigure = role === "admin" || role === "finance";

  const [period, setPeriod] = useState(currentIstPeriod);
  const [invoices, setInvoices] = useState<ProcessInvoice[]>([]);
  const [cycles, setCycles] = useState<Record<string, ProcessCycle>>({});
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const [nameQuery, setNameQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await fetch("/api/invoice-management/tracker");
      if (!res.ok) throw new Error("Failed to load invoices");
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
    } finally {
      setLoadingInvoices(false);
    }
  }, [toast]);

  const loadCycles = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoice-management/process/cycles?period=${encodeURIComponent(period)}`);
      if (!res.ok) throw new Error("Failed to load process status");
      setCycles(await res.json());
    } catch (error: any) {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
    }
  }, [period, toast]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const rows = useMemo(() => {
    return clients.map((client) => {
      const matches = invoices.filter(
        (inv) => inv.clientId === client.clientId && String(inv.generatedDate || "").slice(0, 7) === period,
      );
      const invoice = matches.find((inv) => inv.status !== "Rejected") || matches[0] || null;
      const cycle = cycles[client.clientId] || null;
      return { client, invoice, cycle, status: deriveStatus(invoice, cycle) };
    });
  }, [clients, invoices, cycles, period]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    rows.forEach((row) => {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    });
    return byStatus;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const name = nameQuery.trim().toLowerCase();
    const code = codeQuery.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (name && !String(row.client.name || "").toLowerCase().includes(name)) return false;
      if (code && !String(row.client.code || "").toLowerCase().includes(code)) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "name-desc") return String(b.client.name).localeCompare(String(a.client.name));
      if (sortBy === "amount") return Number(b.invoice?.amount || 0) - Number(a.invoice?.amount || 0);
      if (sortBy === "generated") return String(b.invoice?.generatedDate || "").localeCompare(String(a.invoice?.generatedDate || ""));
      if (sortBy === "status") return STATUS_FILTERS.indexOf(a.status) - STATUS_FILTERS.indexOf(b.status);
      return String(a.client.name).localeCompare(String(b.client.name));
    });
  }, [rows, nameQuery, codeQuery, statusFilter, sortBy]);

  const runInternalTrigger = async (row: (typeof rows)[number]) => {
    if (!row.invoice) return;
    setBusyKey(`internal-${row.client.clientId}`);
    try {
      const pdf = await onGetInvoicePdf(row.invoice);
      const data = await postJson("/api/invoice-management/process/trigger-internal", {
        clientId: row.client.clientId,
        period,
        clientName: row.client.name,
        invoiceNumber: row.invoice.invoiceNumber,
        amount: row.invoice.amount,
        fileName: pdf.fileName,
        pdfBase64: pdf.base64,
        triggeredBy: user?.email || "",
      });
      toast({ title: "Internal trigger sent", description: `OTP and invoice emailed to ${data.recipientCount} recipient(s).` });
      await loadCycles();
    } catch (error: any) {
      toast({ title: "Internal trigger failed", description: error?.message, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const runExternalTrigger = async (row: (typeof rows)[number]) => {
    if (!row.invoice) return;
    setBusyKey(`external-${row.client.clientId}`);
    try {
      const pdf = await onGetInvoicePdf(row.invoice);
      const data = await postJson("/api/invoice-management/process/trigger-external", {
        clientId: row.client.clientId,
        period,
        clientName: row.client.name,
        invoiceNumber: row.invoice.invoiceNumber,
        month: period,
        fileName: pdf.fileName,
        pdfBase64: pdf.base64,
        billingEmail: row.client.billingEmail || "",
        triggeredBy: user?.email || "",
      });
      toast({ title: "Invoice sent to client", description: `Sent to ${data.recipientCount} client email ID(s).` });
      await loadCycles();
    } catch (error: any) {
      toast({ title: "External trigger failed", description: error?.message, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const submitApproval = async () => {
    if (!approveTarget) return;
    const otp = otpInput.trim();
    if (!/^\d{6}$/.test(otp)) {
      toast({ title: "Invalid OTP", description: "Enter the 6-digit OTP from the email.", variant: "destructive" });
      return;
    }
    setBusyKey(`approve-${approveTarget}`);
    try {
      await postJson("/api/invoice-management/process/approve", {
        clientId: approveTarget,
        period,
        otp,
        approvedBy: user?.email || "",
      });
      toast({ title: "Invoice approved" });
      setApproveTarget(null);
      setOtpInput("");
      await loadCycles();
    } catch (error: any) {
      toast({ title: "Approval failed", description: error?.message, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    try {
      const res = await fetch("/api/invoice-management/process/settings");
      const data = res.ok ? await res.json() : { internalRecipients: [] };
      setRecipientsText((data.internalRecipients || []).join(", "));
    } catch {
      setRecipientsText("");
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const data = await postJson("/api/invoice-management/process/settings", {
        internalRecipients: recipientsText,
        updatedBy: user?.email || "",
      });
      setRecipientsText((data.internalRecipients || []).join(", "));
      toast({ title: "Settings saved", description: "Internal trigger recipients updated." });
      setSettingsOpen(false);
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const renderAmount = (row: (typeof rows)[number]) => {
    if (!row.invoice) return <span className="text-gray-400">—</span>;
    const id = row.client.clientId;
    const isRevealed = isFinance && revealed[id];
    return (
      <div className="flex items-center gap-1">
        <span className="font-medium">{isRevealed ? fmtINR(row.invoice.amount) : "*****"}</span>
        {isFinance && (
          <button
            type="button"
            title={isRevealed ? "Hide amount" : "Show amount"}
            onClick={() => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }))}
            className="p-0.5 rounded text-indigo-500 hover:bg-indigo-50"
          >
            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        )}
      </div>
    );
  };

  const renderInternal = (row: (typeof rows)[number]) => {
    const { cycle, invoice, client } = row;
    if (cycle?.approvedAt) {
      return <span className="text-[10px] text-gray-500">{fmtDate(cycle.internalTriggeredAt)}</span>;
    }
    const busy = busyKey === `internal-${client.clientId}`;
    const enabled = Boolean(invoice) && canInternalTrigger;
    return (
      <div className="flex flex-col items-start gap-0.5">
        <Button
          size="sm"
          variant={cycle?.internalTriggeredAt ? "outline" : "default"}
          className="h-6 px-2 text-[10px] whitespace-nowrap"
          disabled={!enabled || busy}
          onClick={() => runInternalTrigger(row)}
          title={!invoice ? "Invoice not generated yet" : !canInternalTrigger ? "Only sales team can trigger" : undefined}
        >
          {busy ? "Sending..." : cycle?.internalTriggeredAt ? "Resend" : "Internal Trigger"}
        </Button>
        {cycle?.internalTriggeredAt && <span className="text-[10px] text-gray-500">{fmtDate(cycle.internalTriggeredAt)}</span>}
      </div>
    );
  };

  const renderApproval = (row: (typeof rows)[number]) => {
    const { cycle, client } = row;
    if (cycle?.approvedAt) {
      return <Badge className="rounded-full text-[10px] bg-blue-100 text-blue-800 border-blue-200">Approved</Badge>;
    }
    if (!cycle?.internalTriggeredAt) return <span className="text-[10px] text-gray-400">Pending</span>;
    if (!isFinance) return <span className="text-[10px] text-amber-600">Awaiting finance</span>;
    return (
      <Button
        size="sm"
        className="h-6 px-2 text-[10px] whitespace-nowrap"
        onClick={() => {
          setOtpInput("");
          setApproveTarget(client.clientId);
        }}
      >
        Approve
      </Button>
    );
  };

  const renderExternal = (row: (typeof rows)[number]) => {
    const { cycle, client, invoice } = row;
    if (cycle?.externalTriggeredAt) {
      return <Badge className="rounded-full text-[10px] bg-indigo-100 text-indigo-800 border-indigo-200">Sent</Badge>;
    }
    if (!cycle?.approvedAt) return <span className="text-[10px] text-gray-400">—</span>;
    const busy = busyKey === `external-${client.clientId}`;
    return (
      <Button
        size="sm"
        variant="default"
        className="h-6 px-2 text-[10px] whitespace-nowrap"
        disabled={!invoice || !canExternalTrigger || busy}
        onClick={() => runExternalTrigger(row)}
        title={!canExternalTrigger ? "Only sales or admin can trigger" : undefined}
      >
        {busy ? "Sending..." : "External Trigger"}
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Invoice Process</h2>
          <p className="text-sm text-muted-foreground">Internal approval and client delivery for each month&apos;s invoices</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="process-period">Month</Label>
            <Input
              id="process-period"
              type="month"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              className="w-44"
            />
          </div>
          {canConfigure && (
            <Button variant="outline" className="gap-2" onClick={openSettings}>
              <Settings2 className="h-4 w-4" /> Trigger Settings
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-muted/60 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overall clients</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
        </Card>
        <Card className="border-muted/60 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overall generated invoice</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-indigo-600">{rows.filter((r) => r.invoice).length}</div></CardContent>
        </Card>
        <Card className="border-muted/60 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Need to generate invoice</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{rows.filter((r) => !r.invoice).length}</div></CardContent>
        </Card>
      </div>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status — {period}</CardTitle>
          <CardDescription>Client count per process status</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {CARD_STATUSES.map((status) => (
            <div key={status} className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{status}</div>
              <div className="text-xl font-bold">{counts[status] || 0}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Client Configurations</CardTitle>
            <CardDescription>{visibleRows.length} of {rows.length} clients</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-44">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Client name" className="pl-9" />
            </div>
            <Input value={codeQuery} onChange={(e) => setCodeQuery(e.target.value)} placeholder="Client code" className="w-36" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">All statuses</option>
              {STATUS_FILTERS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              <option value="name">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="amount">Amount high–low</option>
              <option value="generated">Newest generated</option>
              <option value="status">Status</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full table-fixed text-[11px]">
              <colgroup>
                <col style={{ width: "5%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "5%" }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/50 text-left text-gray-600">
                  <th className="px-1.5 py-2 font-semibold">Id</th>
                  <th className="px-1.5 py-2 font-semibold">Client</th>
                  <th className="px-1.5 py-2 font-semibold">Code</th>
                  <th className="px-1.5 py-2 font-semibold">Prepared</th>
                  <th className="px-1.5 py-2 font-semibold">Internal</th>
                  <th className="px-1.5 py-2 font-semibold">Approval</th>
                  <th className="px-1.5 py-2 font-semibold">External</th>
                  <th className="px-1.5 py-2 font-semibold">Gen date</th>
                  <th className="px-1.5 py-2 font-semibold">Sent</th>
                  <th className="px-1.5 py-2 font-semibold">Due</th>
                  <th className="px-1.5 py-2 font-semibold text-right">Paid</th>
                  <th className="px-1.5 py-2 font-semibold text-right">TDS</th>
                  <th className="px-1.5 py-2 font-semibold">Status</th>
                  <th className="px-1.5 py-2 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.client.clientId} className="border-b align-middle transition-colors hover:bg-muted/20">
                    <td className="px-1.5 py-2 break-all font-mono text-gray-500">{row.client.clientId}</td>
                    <td className="px-1.5 py-2 break-words font-medium">{row.client.name}</td>
                    <td className="px-1.5 py-2 break-all font-mono text-gray-500">{row.client.code || "—"}</td>
                    <td className="px-1.5 py-2">{renderAmount(row)}</td>
                    <td className="px-1.5 py-2">{renderInternal(row)}</td>
                    <td className="px-1.5 py-2">{renderApproval(row)}</td>
                    <td className="px-1.5 py-2">{renderExternal(row)}</td>
                    <td className="px-1.5 py-2 truncate text-gray-500">{fmtDate(row.invoice?.generatedDate)}</td>
                    <td className="px-1.5 py-2 truncate text-gray-500">{fmtDate(row.invoice?.sentDate)}</td>
                    <td className="px-1.5 py-2 truncate text-gray-500">{fmtDate(dueDateOf(row.invoice?.sentDate || null))}</td>
                    <td className="px-1.5 py-2 text-right">{row.invoice ? fmtINR(row.invoice.totalPaid) : "—"}</td>
                    <td className="px-1.5 py-2 text-right">{row.invoice ? fmtINR(row.invoice.totalTds) : "—"}</td>
                    <td className="px-1.5 py-2">
                      <span className={`inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[row.status] || STATUS_COLOR["Generated"]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      {row.invoice ? (
                        <button
                          type="button"
                          title="Preview Invoice PDF"
                          onClick={() => onPreviewInvoice(row.invoice as ProcessInvoice)}
                          className="p-1 rounded text-indigo-500 hover:bg-indigo-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-sm text-muted-foreground">No clients match the filters</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(approveTarget)} onOpenChange={(open) => { if (!open) { setApproveTarget(null); setOtpInput(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Approve invoice</DialogTitle>
            <DialogDescription>Enter the 6-digit OTP from the internal trigger email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-otp">OTP</Label>
            <Input
              id="approve-otp"
              inputMode="numeric"
              maxLength={6}
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="text-center text-lg tracking-[0.5em]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={submitApproval} disabled={otpInput.length !== 6 || busyKey === `approve-${approveTarget}`}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Internal trigger recipients</DialogTitle>
            <DialogDescription>These people receive the invoice PDF and OTP when Internal Trigger is clicked. Separate emails with commas.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            rows={4}
            placeholder="finance.lead@company.com, approver@company.com"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={saveSettings} disabled={savingSettings}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
