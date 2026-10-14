import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { FileText, TrendingUp, AlertCircle, DollarSign } from "lucide-react";

interface CreditNote {
  id: string;
  invoiceId?: string;
  clientName: string;
  clientId?: string;
  creditNoteNumber: string;
  amount: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  generatedDate: string;
  appliedDate?: string;
}

interface CreditNotesTrackerProps {
  tableOnly?: boolean;
}

export default function CreditNotesTracker({ tableOnly = false }: CreditNotesTrackerProps) {
  const { toast } = useToast();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch credit notes data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoice-management/credit-notes");
      if (!res.ok) throw new Error("Failed to fetch credit notes");
      const data = await res.json();
      setCreditNotes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.warn("[CreditNotes] Fetch error:", e?.message);
      setCreditNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = creditNotes.length;
    const totalAmount = creditNotes.reduce((sum, cn) => sum + (cn.amount || 0), 0);
    const approved = creditNotes.filter((cn) => cn.status === "Approved").length;
    const approvedAmount = creditNotes
      .filter((cn) => cn.status === "Approved")
      .reduce((sum, cn) => sum + (cn.amount || 0), 0);
    const pending = creditNotes.filter((cn) => cn.status === "Pending").length;
    const rejected = creditNotes.filter((cn) => cn.status === "Rejected").length;

    return {
      total,
      totalAmount,
      approved,
      approvedAmount,
      pending,
      rejected,
    };
  }, [creditNotes]);

  const formatINR = (value: number) => {
    if (value >= 1000000) return `₹${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(2)}K`;
    return `₹${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Credit Notes</h2>
        <p className="mt-1 text-muted-foreground">
          Track and manage credit notes issued to clients
        </p>
      </div>

      {/* Card Counts - show always */}
      {!tableOnly && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Total Credit Notes */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Credit Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatINR(metrics.totalAmount)}
              </p>
            </CardContent>
          </Card>

          {/* Approved Credit Notes */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics.approved}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatINR(metrics.approvedAmount)}
              </p>
            </CardContent>
          </Card>

          {/* Pending Credit Notes */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{metrics.pending}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </CardContent>
          </Card>

          {/* Rejected Credit Notes */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{metrics.rejected}</div>
              <p className="text-xs text-muted-foreground mt-1">Not approved</p>
            </CardContent>
          </Card>

          {/* Approval Rate */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approval Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.total > 0 ? Math.round((metrics.approved / metrics.total) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.approved} of {metrics.total}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Credit Notes List Table */}
      <Card className="border-muted/60 shadow-sm">
        <CardHeader>
          <CardTitle>Credit Notes List</CardTitle>
          <CardDescription>
            {creditNotes.length} credit notes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading credit notes...
            </div>
          ) : creditNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No credit notes yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Credit notes will appear here once they are created
              </p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <table className="w-full text-sm">
                <colgroup>
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "150px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "150px" }} />
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground">
                      Credit Note #
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground">
                      Client
                    </th>
                    <th className="px-2 py-2 text-right font-semibold text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground">
                      Reason
                    </th>
                    <th className="px-2 py-2 text-center font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground">
                      Generated
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground">
                      Applied Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {creditNotes.map((cn) => (
                    <tr key={cn.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-2 py-3 font-mono font-medium text-blue-600">
                        {cn.creditNoteNumber}
                      </td>
                      <td className="px-2 py-3 truncate text-gray-700">
                        {cn.clientName || "—"}
                      </td>
                      <td className="px-2 py-3 text-right font-medium">
                        {formatINR(cn.amount)}
                      </td>
                      <td className="px-2 py-3 truncate text-gray-600 text-xs">
                        {cn.reason || "—"}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <Badge
                          className="rounded-full text-[10px] px-2 py-0.5 font-medium"
                          variant={
                            cn.status === "Approved"
                              ? "default"
                              : cn.status === "Pending"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {cn.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-3 text-xs text-muted-foreground">
                        {cn.generatedDate || "—"}
                      </td>
                      <td className="px-2 py-3 text-xs text-muted-foreground">
                        {cn.appliedDate || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
