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
  Download, TableProperties,
} from "lucide-react";
import * as XLSX from "xlsx";
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
  clientCode: string;
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
  customInvoiceRows: any[];
  invoiceTableConfig: any[];
  mmcInvoiceTitle: string;
  createdAt: string;
  payments: Payment[];
  totalPaid: number;
  totalTds: number;
}

// Prop type for the main component
interface InvoiceTrackerProps {
  /** When provided, "Download PDF" delegates to this instead of html2canvas */
  onDownloadPdf?: (invoice: TrackerInvoice) => Promise<void>;
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

// ── Number-to-words helper (Indian numbering) ─────────────────────────────
function numberToWords(num: number): string {
  if (num === 0) return "Zero Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const c2 = (n: number): string => n === 0 ? "" : n < 10 ? ones[n] : n < 20 ? teens[n - 10] : tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  const c3 = (n: number): string => { if (!n) return ""; let r = ""; const h = Math.floor(n / 100); if (h) r += ones[h] + " Hundred"; const rem = n % 100; if (rem) r += (r ? " " : "") + c2(rem); return r.trim(); };
  if (num < 0) return "Minus " + numberToWords(Math.abs(num));
  const crores = Math.floor(num / 10000000), lakhs = Math.floor((num % 10000000) / 100000), thousands = Math.floor((num % 100000) / 1000), rem = num % 1000;
  const parts: string[] = [];
  if (crores)   parts.push(c3(crores) + " Crore");
  if (lakhs)    parts.push(c3(lakhs) + " Lakh");
  if (thousands) parts.push(c3(thousands) + " Thousand");
  if (rem)      parts.push(c3(rem));
  return parts.join(" ") + " Only";
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── Invoice Preview Modal — renders exact invoice format + jsPDF download ─
function InvoicePreviewModal({
  invoice, canDownload, onClose, onDownloadPdf,
}: {
  invoice: TrackerInvoice;
  canDownload: boolean;
  onClose: () => void;
  onDownloadPdf?: (inv: TrackerInvoice) => Promise<void>;
}) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [clientData, setClientData] = useState<any>(null);

  // Load company/tax config from localStorage (same keys as InvoiceManagement)
  const companyConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("company-config") || "{}"); } catch { return {}; }
  }, []);
  const taxConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("tax-config") || "{}"); } catch { return {}; }
  }, []);

  // Fetch full client data for GSTIN, address etc.
  useEffect(() => {
    if (!invoice.clientId) return;
    fetch(`/api/invoice-management/clients/${invoice.clientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setClientData(d); })
      .catch(() => {});
  }, [invoice.clientId]);

  // Derived tax values
  const clientGstin = clientData?.gstin || "";
  const companyGstin = companyConfig.gstNumber || "33AAMCM6618H1ZB";
  const isIntraState = clientGstin.startsWith(companyGstin.substring(0, 2));
  const hsnCode = taxConfig.invoiceHsnCode || "998314";
  const gstRate = Number(taxConfig.invoiceRatePercentage || 18);
  const taxableAmt = invoice.amount;
  const taxAmt = Math.round(taxableAmt * gstRate / 100);
  const cgst = isIntraState ? Math.round(taxableAmt * (gstRate / 2) / 100) : 0;
  const sgst = isIntraState ? Math.round(taxableAmt * (gstRate / 2) / 100) : 0;
  const igst = !isIntraState ? taxAmt : 0;
  const total = taxableAmt + taxAmt;

  const billingAddress = clientData?.billingAddress || "";
  const placeOfSupply = clientGstin.startsWith("29") ? "Karnataka"
    : clientGstin.startsWith("33") ? "Tamil Nadu"
    : clientGstin.startsWith("06") ? "Haryana"
    : clientGstin.startsWith("27") ? "Maharashtra"
    : clientGstin.startsWith("07") ? "Delhi"
    : clientData?.state || "India";

  const invoiceDateFormatted = (() => {
    if (!invoice.generatedDate) return "";
    const d = new Date(invoice.generatedDate);
    return `${String(d.getDate()).padStart(2, "0")}-${d.toLocaleString("en-IN", { month: "short" })}-${d.getFullYear()}`;
  })();

  // Build line items from invoiceTableConfig (matches actual invoice row structure)
  // Fields: narration, amount, hsn, rate, cgst, sgst, igst
  const lineItems: { desc: string; amount: number; hsnCode: string; rate: string; cgst: number; sgst: number; igst: number }[] = useMemo(() => {
    // Prefer invoiceTableConfig (OverviewInvoiceRow) — has narration, hsn, cgst, sgst, igst directly
    const tableRows = Array.isArray(invoice.invoiceTableConfig) ? invoice.invoiceTableConfig : [];
    const exportable = tableRows.filter((r: any) => r && r.exportEnabled !== false && Number(r.amount || 0) !== 0);
    if (exportable.length > 0) {
      return exportable.map((r: any) => ({
        desc: r.narration || r.description || r.name || "Service",
        amount: Number(r.amount || 0),
        hsnCode: r.hsn || hsnCode,
        rate: r.rate || `${gstRate}%`,
        cgst: Number(r.cgst || 0),
        sgst: Number(r.sgst || 0),
        igst: Number(r.igst || 0),
      }));
    }
    // Fallback: customInvoiceRows
    const customRows = Array.isArray(invoice.customInvoiceRows) ? invoice.customInvoiceRows : [];
    if (customRows.length > 0) {
      return customRows.map((r: any) => ({
        desc: r.narration || r.description || r.name || r.label || "Service",
        amount: Number(r.amount || r.value || 0),
        hsnCode: r.hsn || r.hsnCode || hsnCode,
        rate: r.rate || `${gstRate}%`,
        cgst: Number(r.cgst || 0),
        sgst: Number(r.sgst || 0),
        igst: Number(r.igst || 0),
      }));
    }
    // Final fallback: single row from invoice total
    return [{ desc: invoice.mmcInvoiceTitle || "Professional Services", amount: taxableAmt, hsnCode, rate: `${gstRate}%`, cgst, sgst, igst }];
  }, [invoice, taxableAmt, hsnCode, gstRate, cgst, sgst, igst]);

  // Download: delegate to the parent's existing PDF function if provided,
  // otherwise fall back to html2canvas capture of the preview div.
  const handleDownloadPDF = async () => {
    if (onDownloadPdf) {
      setDownloading(true);
      try { await onDownloadPdf(invoice); }
      catch (e: any) { toast({ title: "Error", description: e?.message || "PDF failed", variant: "destructive" }); }
      finally { setDownloading(false); }
      return;
    }
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      let yPos = 0;
      let remaining = imgH;
      while (remaining > 0) {
        if (yPos > 0) pdf.addPage();
        const sliceH = Math.min(remaining, ph);
        pdf.addImage(imgData, "JPEG", 0, -yPos, pw, imgH);
        yPos += ph;
        remaining -= sliceH;
      }
      pdf.save(`${invoice.invoiceNumber}.pdf`);
      toast({ title: "PDF downloaded", description: `${invoice.invoiceNumber} downloaded.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate PDF", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const primary = "#2caff6";
  const dark = "#17375E";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
        {/* Action bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <span className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600" /> {invoice.invoiceNumber}
          </span>
          <div className="flex gap-2">
            {canDownload && (
              <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white h-8"
                onClick={handleDownloadPDF} disabled={downloading}>
                <FileDown className="h-3.5 w-3.5" />
                {downloading ? "Generating PDF…" : "Download PDF"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClose} className="h-8">Close</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* A4-style invoice render */}
          <div ref={printRef} style={{ fontFamily: "Helvetica, Arial, sans-serif", background: "#fff", padding: "28px 32px", minWidth: 600, fontSize: 11 }}>
            {/* Top colored band */}
            <div style={{ height: 4, background: dark, marginBottom: 1 }} />
            <div style={{ height: 2, background: primary, marginBottom: 16 }} />

            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <img src="/mylapaylogo.png" alt="Mylapay" style={{ height: 32, marginBottom: 6 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div style={{ color: dark, fontWeight: "bold", fontSize: 10.5 }}>{companyConfig.companyName || "Mindeed Technologies and Services Private Limited"}</div>
                <div style={{ color: "#6b7280", fontSize: 8.5, maxWidth: 280 }}>{companyConfig.address || "#17/3, Pembroke House, Second Floor, Shafee Mohammed Road"}, {companyConfig.city || "Chennai"}, {companyConfig.state || "Tamil Nadu"}, {companyConfig.pincode || "600006"}</div>
                <div style={{ color: "#6b7280", fontSize: 8.5 }}>CIN: {companyConfig.cinNumber || "U72900TN2019PTC129197"}</div>
                <div style={{ color: "#6b7280", fontSize: 8.5 }}>GSTIN: {companyConfig.gstNumber || "33AAMCM6618H1ZB"} | PAN: {companyConfig.panNumber || "AAMCM6618H"}</div>
                <div style={{ color: "#6b7280", fontSize: 8.5 }}>{companyConfig.email || "finance@mindeed.in"} | {companyConfig.phone || "+91 96776 79895"}</div>
                <div style={{ color: "#6b7280", fontSize: 8.5 }}>{companyConfig.website || "www.mylapay.com"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: dark, fontWeight: "bold", fontSize: 22 }}>INVOICE</div>
                <div style={{ color: primary, fontWeight: "bold", fontSize: 8, letterSpacing: 1 }}>TAX INVOICE</div>
                <div style={{ marginTop: 10, fontSize: 8.5, color: "#6b7280" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Invoice No</span><strong style={{ color: dark }}>{invoice.invoiceNumber}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Invoice Date</span><strong style={{ color: dark }}>{invoiceDateFormatted}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Service Period</span><strong style={{ color: dark }}>{invoice.month}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Currency</span><strong style={{ color: dark }}>{clientData?.currency || "INR"}</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Place of Supply</span><strong style={{ color: dark }}>{placeOfSupply}</strong></div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: primary, marginBottom: 12 }} />

            {/* Billed To + Details */}
            <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#9ca3af", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>BILLED TO</div>
                <div style={{ color: dark, fontWeight: "bold", fontSize: 11 }}>M/s. {invoice.clientName}</div>
                <div style={{ color: "#6b7280", fontSize: 8.5, whiteSpace: "pre-wrap", maxWidth: 220 }}>{billingAddress}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#9ca3af", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>DETAILS</div>
                <div style={{ color: "#6b7280", fontSize: 8.5 }}>—</div>
                {clientGstin && <div style={{ color: "#6b7280", fontSize: 8.5 }}>GSTIN: {clientGstin}</div>}
              </div>
            </div>

            {/* Statement of Charges */}
            <div style={{ fontWeight: "bold", fontSize: 11, color: dark, marginBottom: 8 }}>Statement of Charges</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <thead>
                <tr style={{ background: dark, color: "#fff" }}>
                  {["#", "PARTICULARS", "AMOUNT", "HSN", "RATE", "CGST", "SGST", "IGST", "AMOUNT"].map((h, i) => (
                    <th key={i} style={{ padding: "7px 8px", textAlign: i < 2 ? "left" : "right", fontWeight: "bold", fontSize: 8.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => {
                  // Use stored tax values if available, otherwise compute from gstRate
                  const itemTaxable = item.amount;
                  const itemCgst = item.cgst > 0 ? item.cgst : (isIntraState ? Math.round(itemTaxable * (gstRate / 2) / 100) : 0);
                  const itemSgst = item.sgst > 0 ? item.sgst : (isIntraState ? Math.round(itemTaxable * (gstRate / 2) / 100) : 0);
                  const itemIgst = item.igst > 0 ? item.igst : (!isIntraState ? Math.round(itemTaxable * gstRate / 100) : 0);
                  const itemTotal = itemTaxable + itemCgst + itemSgst + itemIgst;
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                      <td style={{ padding: "8px", textAlign: "center", color: "#6b7280" }}>0{i + 1}</td>
                      <td style={{ padding: "8px", color: dark }}>{item.desc}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold", color: dark }}>{fmtCurrency(itemTaxable)}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#6b7280" }}>{item.hsnCode}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#6b7280" }}>{item.rate || `${gstRate}%`}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#6b7280" }}>{itemCgst ? fmtCurrency(itemCgst) : "-"}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#6b7280" }}>{itemSgst ? fmtCurrency(itemSgst) : "-"}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#6b7280" }}>{itemIgst ? fmtCurrency(itemIgst) : "-"}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold", color: dark }}>{fmtCurrency(itemTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <table style={{ fontSize: 9, minWidth: 220 }}>
                <tbody>
                  {[
                    ["Sub Total", fmtCurrency(taxableAmt)],
                    ["CGST", cgst ? fmtCurrency(cgst) : "-"],
                    ["SGST", sgst ? fmtCurrency(sgst) : "-"],
                    ["IGST", igst ? fmtCurrency(igst) : "-"],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ padding: "3px 12px", color: "#6b7280", textAlign: "right" }}>{label}</td>
                      <td style={{ padding: "3px 12px", textAlign: "right", color: dark }}>{val}</td>
                    </tr>
                  ))}
                  <tr style={{ background: dark, color: "#fff" }}>
                    <td style={{ padding: "7px 12px", fontWeight: "bold", textAlign: "right" }}>Total Amount</td>
                    <td style={{ padding: "7px 12px", fontWeight: "bold", textAlign: "right" }}>{fmtCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Amount in words */}
            <div style={{ marginTop: 12, color: dark, fontSize: 8.5, fontStyle: "italic" }}>
              Amount in words: Rupees {numberToWords(Math.round(total))}
            </div>

            {/* Declaration */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: "bold", fontSize: 9.5, color: dark, borderBottom: `2px solid ${primary}`, paddingBottom: 3, marginBottom: 6, display: "inline-block" }}>Declaration</div>
              <div style={{ color: "#6b7280", fontSize: 8, lineHeight: 1.6 }}>
                {companyConfig.declarationText
                  ? companyConfig.declarationText.replace(/<[^>]+>/g, "")
                  : `We hereby declare that, We are registered under the Micro, Small, and Medium Enterprises Development Act, 2006 (MSME).\nMSME No of Mindeed: UDYAM-TN-02-0113863 | GST No of Mindeed: 33AAMCM6618H1ZB | PAN No of Mindeed: AAMCM6618H`}
              </div>
            </div>

            {/* Bank details */}
            <div style={{ marginTop: 10, color: "#6b7280", fontSize: 8, lineHeight: 1.6 }}>
              <strong style={{ color: dark }}>BANK DETAILS:</strong><br />
              Bank Name: <em>RBL Bank</em> | Account Name: <em>MINDEED TECHNOLOGIES AND SERVICES PRIVATE LIMITED</em> | Account Number: <em>409002339628</em> | IFSC Code: <em>RATN0000180</em> | Branch Name: <em>First Floor, Rashmi Towers No. 1, Valluvar Kottam High Road, Nungambakkam, Chennai - 600034</em>
            </div>

            {/* Signatory */}
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <div style={{ fontWeight: "bold", color: dark, fontSize: 9, marginBottom: 4 }}>For {companyConfig.companyName || "Mindeed Technologies and Services Private Limited"}</div>
              {companyConfig.signatureImage && (
                <img src={companyConfig.signatureImage} alt="Signature" style={{ height: 56, marginBottom: 4, marginLeft: "auto" }} />
              )}
              <div style={{ color: "#6b7280", fontSize: 8.5 }}>Authorized Signatory</div>
            </div>

            {/* Bottom page footer */}
            <div style={{ marginTop: 20, paddingTop: 6, borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#9ca3af", fontSize: 8 }}>Page 1</div>
          </div>
        </div>
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

  // Read tax config to compute GST-inclusive total
  const taxConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("tax-config") || "{}"); } catch { return {}; }
  }, []);
  const gstRate = Number(taxConfig.invoiceRatePercentage || 18);
  const taxableBase = invoice.amount;                               // stored as pre-GST amount
  const gstAmount  = Math.round(taxableBase * gstRate / 100);
  const totalWithGst = taxableBase + gstAmount;                     // what client actually pays
  const alreadyPaid  = invoice.totalPaid;
  const balanceRemaining = Math.max(0, totalWithGst - alreadyPaid);

  const [amountPaid, setAmountPaid] = useState(String(balanceRemaining));
  const [isTds, setIsTds] = useState(false);
  const [tdsPercentage, setTdsPercentage] = useState("10");
  const [isPartial, setIsPartial] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const tdsAmount = isTds ? Math.round((Number(amountPaid) * Number(tdsPercentage)) / 100) : 0;
  const netReceivable = Number(amountPaid) - tdsAmount;
  const balanceDue = totalWithGst - alreadyPaid - Number(amountPaid);

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
          <div className="flex justify-between"><span className="text-muted-foreground">Taxable Amount</span><span className="font-medium">{fmtINR(taxableBase)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">GST ({gstRate}%)</span><span className="font-medium">{fmtINR(gstAmount)}</span></div>
          <div className="flex justify-between font-semibold text-indigo-700 border-t pt-1"><span>Total (incl. GST)</span><span>{fmtINR(totalWithGst)}</span></div>
          {alreadyPaid > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">{fmtINR(alreadyPaid)}</span></div>}
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Balance Due</span>
            <span className="text-red-600">{fmtINR(balanceRemaining)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount Paid (₹) *</Label>
              <Input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} min={1} />
              <p className="text-[11px] text-muted-foreground">{fmtINR(taxableBase)} + GST {fmtINR(gstAmount)} = <strong>{fmtINR(totalWithGst)}</strong></p>
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
function PaymentsHistoryModal({
  invoice, onClose, onCleared, isAdmin,
}: {
  invoice: TrackerInvoice;
  onClose: () => void;
  onCleared: () => void;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [clearing, setClearing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleClearAll = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setClearing(true);
    try {
      const res = await fetch("/api/invoice-management/invoices/clear-payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.invoiceId }),
      });
      if (!res.ok) throw new Error("Failed to clear payments");
      const data = await res.json();
      toast({
        title: "Payments cleared",
        description: `${data.deleted} payment record(s) deleted for ${invoice.invoiceNumber}. Paid amount reset to ₹0.`,
      });
      onCleared();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setClearing(false);
      setConfirmed(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Payments — {invoice.invoiceNumber}</DialogTitle></DialogHeader>
        <div className="space-y-1.5 text-sm bg-muted/30 rounded-lg p-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Invoice Amount</span><span className="font-semibold">{fmtINR(invoice.amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="text-green-600 font-semibold">{fmtINR(invoice.totalPaid)}</span></div>
          {invoice.totalTds > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Total TDS</span><span className="text-amber-600 font-semibold">{fmtINR(invoice.totalTds)}</span></div>}
          <div className="flex justify-between font-semibold border-t pt-1.5"><span>Balance</span><span className={invoice.totalPaid >= invoice.amount ? "text-green-600" : "text-red-600"}>{fmtINR(Math.max(0, invoice.amount - invoice.totalPaid))}</span></div>
        </div>
        <ScrollArea className="max-h-52">
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

        {/* Admin-only: Reset payments */}
        {isAdmin && invoice.payments.length > 0 && (
          <div className={`rounded-lg p-3 border text-sm ${confirmed ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"}`}>
            {confirmed
              ? <p className="text-red-700 text-xs font-medium mb-2">⚠ This will permanently delete all {invoice.payments.length} payment record(s) and reset Paid to ₹0. Click "Confirm Reset" to proceed.</p>
              : <p className="text-gray-600 text-xs mb-2">Admin: Reset all payments for this invoice (use if payment data is incorrect).</p>
            }
            <div className="flex gap-2">
              {confirmed && <Button size="sm" variant="outline" onClick={() => setConfirmed(false)} className="h-7 text-xs">Cancel</Button>}
              <Button
                size="sm"
                variant={confirmed ? "destructive" : "outline"}
                className={`h-7 text-xs ${!confirmed ? "border-red-300 text-red-600 hover:bg-red-50" : ""}`}
                onClick={handleClearAll}
                disabled={clearing}
              >
                {clearing ? "Clearing…" : confirmed ? "Confirm Reset" : "Reset All Payments"}
              </Button>
            </div>
          </div>
        )}

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
      className={`text-[10px] rounded-full px-1.5 py-0.5 border font-medium appearance-none cursor-pointer disabled:cursor-default disabled:opacity-80 w-full truncate
        ${STATUS_COLOR[computedStatus] || "bg-gray-100 text-gray-600 border-gray-200"}
        ${canChangeStatus ? "hover:opacity-80 focus:outline-none" : ""}`}
    >
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function InvoiceTracker({ onDownloadPdf }: InvoiceTrackerProps = {}) {
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSelectedMonth, setExportSelectedMonth] = useState("ALL");
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

  // ── Available months from invoice data ───────────────────────────────────
  const availableMonths = useMemo(() => {
    const seen = new Set<string>();
    invoices.forEach(inv => { if (inv.month) seen.add(inv.month); });
    return ["ALL", ...Array.from(seen).sort((a, b) => b.localeCompare(a))];
  }, [invoices]);

  // ── Filter invoices by selected month ────────────────────────────────────
  const filterByMonth = (list: TrackerInvoice[], month: string) =>
    month === "ALL" ? list : list.filter(inv => inv.month === month);

  // ── Excel export helpers ─────────────────────────────────────────────────
  const exportToExcel = (sheets: { name: string; rows: any[] }[], filename: string) => {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ name, rows }) => {
      if (rows.length === 0) {
        rows = [{ "(No data)": "" }];
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      // Auto column width
      const colKeys = Object.keys(rows[0] || {});
      const maxLen: number[] = colKeys.map(k => String(k).length + 2);
      rows.forEach(row => Object.values(row).forEach((val, i) => {
        maxLen[i] = Math.max(maxLen[i] || 10, String(val ?? "").length + 2);
      }));
      ws["!cols"] = maxLen.map(w => ({ wch: Math.min(w, 45) }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename);
    toast({ title: "Excel downloaded", description: `${filename} ready.` });
  };

  // Shared invoice detail row builder (consistent columns across all exports)
  const buildInvoiceRow = (inv: TrackerInvoice) => ({
    "Month": inv.month || "—",
    "Invoice No.": inv.invoiceNumber || "—",
    "Client": inv.clientName || "—",
    "Invoice Amount (₹)": inv.amount,
    "Status": isOverdue(inv) ? "Overdue" : inv.status,
    "Generated Date": fmtDate(inv.generatedDate),
    "Sent Date": fmtDate(inv.sentDate),
    "Due Date": inv.sentDate ? fmtDate(new Date(new Date(inv.sentDate).getTime() + 15 * 86400000).toISOString().split("T")[0]) : "—",
    "Amount Paid (₹)": inv.totalPaid,
    "TDS (₹)": inv.totalTds,
    "Pending (₹)": Math.max(0, inv.amount - inv.totalPaid),
    "Approved By": inv.approvedBy || "—",
    "Financial Year": inv.financialYear || "—",
    "Billing Model": inv.billingModel || "—",
  });

  const exportPendingClientWise = (month: string) => {
    const src = filterByMonth(
      invoices.filter(i => i.status !== "Received" && i.status !== "Rejected"),
      month
    );
    // Detailed rows — one row per invoice
    const detailRows = src.map(buildInvoiceRow);

    // Client summary
    const clientMap: Record<string, { client: string; count: number; totalAmt: number; paid: number; pending: number; oldest: string }> = {};
    src.forEach(inv => {
      const k = inv.clientName;
      if (!clientMap[k]) clientMap[k] = { client: k, count: 0, totalAmt: 0, paid: 0, pending: 0, oldest: inv.generatedDate || "" };
      clientMap[k].count++;
      clientMap[k].totalAmt += inv.amount;
      clientMap[k].paid += inv.totalPaid;
      clientMap[k].pending += (inv.amount - inv.totalPaid);
      if ((inv.generatedDate || "") < clientMap[k].oldest) clientMap[k].oldest = inv.generatedDate || "";
    });
    const summaryRows = Object.values(clientMap).sort((a, b) => b.pending - a.pending).map(r => ({
      "Client": r.client,
      "Pending Invoices": r.count,
      "Total Invoice Amount (₹)": r.totalAmt,
      "Amount Paid (₹)": r.paid,
      "Pending Amount (₹)": r.pending,
      "Oldest Invoice Date": fmtDate(r.oldest),
    }));

    const label = month === "ALL" ? "all" : month.replace(" ", "-");
    exportToExcel([
      { name: "Pending Summary", rows: summaryRows },
      { name: "Invoice Details", rows: detailRows },
    ], `pending-client-wise-${label}.xlsx`);
  };

  const exportMonthWise = (month: string) => {
    const src = filterByMonth(invoices, month);
    const rows = src.map(buildInvoiceRow);
    const label = month === "ALL" ? "all" : month.replace(" ", "-");
    exportToExcel([{ name: "Month-wise Invoices", rows }], `month-wise-${label}.xlsx`);
  };

  const exportReceivedInvoices = (month: string) => {
    const src = filterByMonth(
      invoices.filter(i => i.status === "Received"),
      month
    );
    const rows = src.map(inv => ({
      ...buildInvoiceRow(inv),
      "Net Received (₹)": inv.totalPaid - inv.totalTds,
      "Payment Count": inv.payments.length,
      "Payment Dates": inv.payments.map(p => fmtDate(p.paymentDate)).join(", "),
    }));
    const label = month === "ALL" ? "all" : month.replace(" ", "-");
    exportToExcel([{ name: "Received Invoices", rows }], `received-invoices-${label}.xlsx`);
  };

  const exportAllInvoices = () => {
    const rows = invoices.map(buildInvoiceRow);
    exportToExcel([{ name: "All Invoices", rows }], `all-invoices-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleStatusChange = async (inv: TrackerInvoice, newStatus: string) => {
    // When changing TO "Received", show payment modal
    if (newStatus === "Received") {
      setPaymentModal(inv);
      return;
    }

    // When reverting FROM "Received" to any other status, clear payment records
    // so the original invoice amount is used next time status goes to "Received"
    if (inv.status === "Received" && inv.totalPaid > 0) {
      try {
        await fetch("/api/invoice-management/invoices/clear-payments", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: inv.invoiceId }),
        });
      } catch {
        // Non-fatal — proceed with status update even if clear fails
      }
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
        <div className="flex items-center gap-2 self-start">
          <Button variant="outline" size="sm" onClick={() => setShowExportModal(true)} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
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
          <div className="overflow-hidden">
            <table className="w-full text-[11px] table-fixed">
              <colgroup>
                <col style={{width:"28px"}} />
                <col style={{width:"88px"}} />
                <col style={{width:"110px"}} />
                <col style={{width:"68px"}} />
                <col style={{width:"58px"}} />
                <col style={{width:"82px"}} />
                <col style={{width:"108px"}} />
                <col style={{width:"90px"}} />
                <col style={{width:"72px"}} />
                <col style={{width:"62px"}} />
                <col style={{width:"62px"}} />
                <col style={{width:"72px"}} />
                <col style={{width:"58px"}} />
                <col style={{width:"72px"}} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">#</th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">Invoice No.</th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("client")}>
                    <span className="flex items-center gap-0.5">Client <SortIcon col="client" /></span>
                  </th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">Code</th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">Month</th>
                  <th className="px-1.5 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("amount")}>
                    <span className="flex items-center justify-end gap-0.5">Amount <SortIcon col="amount" /></span>
                  </th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-1.5 py-2 text-center font-semibold text-gray-600">Approval</th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:text-indigo-600" onClick={() => sortToggle("date")}>
                    <span className="flex items-center gap-0.5">Gen. Date <SortIcon col="date" /></span>
                  </th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">Sent</th>
                  <th className="px-1.5 py-2 text-left font-semibold text-gray-600">Due</th>
                  <th className="px-1.5 py-2 text-right font-semibold text-gray-600">Paid</th>
                  <th className="px-1.5 py-2 text-right font-semibold text-gray-600">TDS</th>
                  <th className="px-1.5 py-2 text-center font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr><td colSpan={14} className="px-3 py-10 text-center text-muted-foreground">No invoices found</td></tr>
                )}
                {paginated.map((inv, idx) => {
                  const overdue = isOverdue(inv);
                  const dueDate = inv.sentDate
                    ? new Date(new Date(inv.sentDate).getTime() + 15 * 86400000).toISOString().split("T")[0]
                    : null;
                  const absIdx = (page - 1) * PAGE_SIZE + idx + 1;

                  return (
                    <tr key={inv.invoiceId} className={`border-b transition-colors hover:bg-muted/20 ${overdue ? "bg-red-50/40" : ""}`}>
                      <td className="px-1.5 py-2 text-gray-400">{absIdx}</td>
                      <td className="px-1.5 py-2 font-medium text-indigo-600 truncate" title={inv.invoiceNumber}>{inv.invoiceNumber}</td>
                      <td className="px-1.5 py-2 truncate text-gray-700" title={inv.clientName}>{inv.clientName}</td>
                      <td className="px-1.5 py-2 truncate text-gray-500 font-mono">{inv.clientCode || "—"}</td>
                      <td className="px-1.5 py-2 truncate text-gray-600">{inv.month}</td>
                      <td className="px-1.5 py-2 text-right font-semibold truncate">{fmtINR(inv.amount)}</td>
                      <td className="px-1.5 py-2">
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
                      <td className="px-1.5 py-2 text-center">
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

                      <td className="px-1.5 py-2 text-gray-500 truncate">{fmtDate(inv.generatedDate)}</td>
                      <td className="px-1.5 py-2 text-gray-500 truncate">{fmtDate(inv.sentDate)}</td>
                      <td className={`px-1.5 py-2 truncate ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                        {dueDate ? fmtDate(dueDate) : "—"}
                      </td>
                      <td className="px-1.5 py-2 text-right">
                        {inv.totalPaid > 0
                          ? <button onClick={() => setHistoryModal(inv)} className="text-green-600 font-medium hover:underline text-[11px]" title="View payment history">{fmtINR(inv.totalPaid)}</button>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-1.5 py-2 text-right">
                        {inv.totalTds > 0
                          ? <span className="text-amber-600 text-[11px]">{fmtINR(inv.totalTds)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-1.5 py-2">
                        <div className="flex items-center justify-center gap-0.5">
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

      {/* Export Modal */}
      {showExportModal && (
        <Dialog open onOpenChange={setShowExportModal}>
          <DialogContent className="max-w-2xl w-full" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <DialogHeader className="flex-shrink-0 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4 text-indigo-600" /> Export Invoice Data
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">Select a report type and month, then click Download. All exports include full invoice details.</p>
            </DialogHeader>

            {/* Month selector — shared across all options except "All Invoices" */}
            <div className="flex-shrink-0 flex items-center gap-3 bg-muted/40 rounded-lg px-3 py-2 border">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">Filter by Month:</label>
              <select
                value={exportSelectedMonth}
                onChange={e => setExportSelectedMonth(e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m === "ALL" ? "All Months" : m}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {exportSelectedMonth === "ALL"
                  ? `${invoices.length} invoices`
                  : `${invoices.filter(i => i.month === exportSelectedMonth).length} invoices`}
              </span>
            </div>

            {/* Common columns tag */}
            <div className="flex-shrink-0">
              <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">All exports include these columns:</p>
              <div className="flex flex-wrap gap-1">
                {["Month","Invoice No.","Client","Invoice Amount","Status","Generated Date","Sent Date","Due Date","Amount Paid","TDS","Pending","Approved By","Financial Year"].map(c => (
                  <span key={c} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{c}</span>
                ))}
              </div>
            </div>

            {/* 2-column grid of export options */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                {/* Option 1: Pending Client-wise */}
                <button
                  onClick={() => { exportPendingClientWise(exportSelectedMonth); setShowExportModal(false); }}
                  className="flex flex-col gap-2 p-3 border-2 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-orange-100 rounded-lg group-hover:bg-orange-200 flex-shrink-0">
                      <IndianRupee className="h-4 w-4 text-orange-600" />
                    </div>
                    <p className="font-semibold text-sm text-gray-800 leading-tight">Pending — Client-wise</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Pending balance per client with summary + individual invoice rows.</p>
                  <div className="flex items-center gap-1 mt-auto">
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">2 Sheets</span>
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">Summary + Details</span>
                  </div>
                </button>

                {/* Option 2: Month-wise */}
                <button
                  onClick={() => { exportMonthWise(exportSelectedMonth); setShowExportModal(false); }}
                  className="flex flex-col gap-2 p-3 border-2 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 flex-shrink-0">
                      <TableProperties className="h-4 w-4 text-indigo-600" />
                    </div>
                    <p className="font-semibold text-sm text-gray-800 leading-tight">Month-wise Report</p>
                  </div>
                  <p className="text-xs text-muted-foreground">All invoices for the selected month with every detail column.</p>
                  <div className="flex items-center gap-1 mt-auto">
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-medium">1 Sheet</span>
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px]">Full Details</span>
                  </div>
                </button>

                {/* Option 3: Received */}
                <button
                  onClick={() => { exportReceivedInvoices(exportSelectedMonth); setShowExportModal(false); }}
                  className="flex flex-col gap-2 p-3 border-2 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-green-100 rounded-lg group-hover:bg-green-200 flex-shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </div>
                    <p className="font-semibold text-sm text-gray-800 leading-tight">Received Invoices</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Paid invoices with TDS, net received, and payment dates.</p>
                  <div className="flex items-center gap-1 mt-auto">
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">1 Sheet</span>
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">+ Payment Dates</span>
                  </div>
                </button>

                {/* Option 4: All Invoices (no month filter) */}
                <button
                  onClick={() => { exportAllInvoices(); setShowExportModal(false); }}
                  className="flex flex-col gap-2 p-3 border-2 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-100 rounded-lg group-hover:bg-slate-200 flex-shrink-0">
                      <FileText className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="font-semibold text-sm text-gray-800 leading-tight">All Invoices</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Every invoice ever generated — ignores month filter.</p>
                  <div className="flex items-center gap-1 mt-auto">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">1 Sheet</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{invoices.length} rows</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex-shrink-0 flex justify-end pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowExportModal(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modals */}
      {paymentModal && (
        <PaymentModal invoice={paymentModal} onClose={() => setPaymentModal(null)} onSaved={fetchData} />
      )}
      {historyModal && (
        <PaymentsHistoryModal
          invoice={historyModal}
          onClose={() => setHistoryModal(null)}
          onCleared={fetchData}
          isAdmin={isAdmin}
        />
      )}
      {previewModal && (
        <InvoicePreviewModal
          invoice={previewModal}
          canDownload={canManage}
          onClose={() => setPreviewModal(null)}
          onDownloadPdf={onDownloadPdf}
        />
      )}
    </div>
  );
}
