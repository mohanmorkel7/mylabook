import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Briefcase, Users } from "lucide-react";

function parseNotesMeta(notes?: string | null): any {
  if (!notes) return {};
  try {
    const obj = JSON.parse(notes);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function isDomesticByGeography(client?: any): boolean {
  if (!client) return true;
  const meta = parseNotesMeta(client.notes);
  const geography: string | undefined = meta.geography || meta.client_geography;
  if (!geography) return true;
  return String(geography).toLowerCase() === "domestic";
}

export default function SalesClientList() {
  const navigate = useNavigate();
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiClient.getClients(),
    staleTime: 30000,
  });
  const { data: offerings = [] } = useQuery({
    queryKey: ["business-offerings"],
    queryFn: () => apiClient.getBusinessOfferings(),
    staleTime: 10000,
  });

  const grouped = useMemo(() => {
    const byClient: Record<number, { client: any; offerings: any[] }> = {};
    (clients as any[]).forEach((c: any) => {
      byClient[c.id] = { client: c, offerings: [] };
    });
    (offerings as any[]).forEach((o: any) => {
      const cid = o.client_id;
      if (cid != null) {
        if (!byClient[cid])
          byClient[cid] = { client: null, offerings: [] } as any;
        byClient[cid].offerings.push(o);
      }
    });
    const rows = Object.values(byClient).sort(
      (a, b) => (b.offerings?.length || 0) - (a.offerings?.length || 0),
    );
    return rows;
  }, [clients, offerings]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-blue-600" /> Client List
          </h1>
          <p className="text-gray-600 mt-1">
            Clients with their Business Offerings
          </p>
        </div>
        <Button onClick={() => navigate("/clients/create")}>
          Create Client
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>
            Expand a client to view products and details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grouped.length === 0 ? (
            <div className="text-sm text-gray-500">No clients</div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {grouped.map(({ client, offerings }) => (
                <AccordionItem
                  key={client?.id || Math.random()}
                  value={String(client?.id || Math.random())}
                >
                  <AccordionTrigger>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {client?.client_name || "Unknown Client"}
                      </span>
                      <Badge variant="secondary">
                        <Users className="w-3.5 h-3.5 mr-1" />
                        {offerings?.length || 0} products
                      </Badge>
                      <Badge
                        className={
                          isDomesticByGeography(client)
                            ? "bg-green-100 text-green-800"
                            : "bg-purple-100 text-purple-800"
                        }
                      >
                        {isDomesticByGeography(client)
                          ? "Domestic"
                          : "International"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 gap-4">
                      <Card className="bg-white">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            {client?.client_name}
                          </CardTitle>
                          <CardDescription>
                            {client?.city || client?.country || "Location N/A"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left border-b">
                                  <th className="py-2 pr-4">Product</th>
                                  <th className="py-2 pr-4">Solution</th>
                                  <th className="py-2 pr-4">MRR (₹ Lacs)</th>
                                  <th className="py-2 pr-4">
                                    Current ARR (USD Mn)
                                  </th>
                                  <th className="py-2 pr-4">
                                    Potential ARR (USD Mn)
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {(offerings || []).map((o: any) => (
                                  <tr key={o.id} className="hover:bg-gray-50">
                                    <td className="py-2 pr-4">
                                      <button
                                        className="text-blue-600 hover:underline"
                                        onClick={() =>
                                          navigate(
                                            `/business-offerings/${o.id}`,
                                          )
                                        }
                                      >
                                        {o.product || o.solution || "Offering"}
                                      </button>
                                    </td>
                                    <td className="py-2 pr-4">
                                      {o.solution || "-"}
                                    </td>
                                    <td className="py-2 pr-4">
                                      {Number(
                                        o.potential_mrr_lacs || 0,
                                      ).toFixed(2)}
                                    </td>
                                    <td className="py-2 pr-4">
                                      {Number(
                                        o.current_potential_arr_usd_mn || 0,
                                      ).toFixed(3)}
                                    </td>
                                    <td className="py-2 pr-4">
                                      {Number(
                                        o.projected_potential_arr_usd_mn || 0,
                                      ).toFixed(3)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/clients/${client?.id}`)}
                            >
                              View Client
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
