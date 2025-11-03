import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { VCDraggableStepsList } from "@/components/VCDraggableStepsList";
import { ArrowLeft, Edit } from "lucide-react";

export default function BusinessOfferingsDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const boId = Number(id);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const focusFollowUpId = ((location.state as any)?.focusFollowUpId ??
    (searchParams.get("focusFollowUpId")
      ? Number(searchParams.get("focusFollowUpId"))
      : undefined)) as number | undefined;
  const focusStepId = ((location.state as any)?.focusStepId ??
    (searchParams.get("focusStepId")
      ? Number(searchParams.get("focusStepId"))
      : undefined)) as number | undefined;

  const {
    data: offering,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["business-offering", boId],
    queryFn: () => apiClient.getBusinessOffering(boId),
    enabled: !!boId,
  });

  const clientId = (offering as any)?.client_id as number | undefined;
  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => apiClient.getClient(clientId as number),
    enabled: !!clientId,
  });

  const { data: steps = [], refetch: refetchSteps } = useQuery({
    queryKey: ["business-offering-steps", boId],
    queryFn: () => apiClient.getBusinessOfferingSteps(boId),
    enabled: !!boId,
  });

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (focusStepId) {
      setExpandedSteps(new Set([focusStepId]));
    }
  }, [focusStepId]);
  useEffect(() => {
    if (!focusStepId && focusFollowUpId && (steps as any[]).length > 0) {
      setExpandedSteps(new Set([(steps as any[])[0].id]));
    }
  }, [focusStepId, focusFollowUpId, steps]);
  const onToggleExpansion = (stepId: number) => {
    setExpandedSteps((prev) => {
      const n = new Set(prev);
      if (n.has(stepId)) n.delete(stepId);
      else n.add(stepId);
      return n;
    });
  };

  const onDeleteStep = async (stepId: number) => {
    await apiClient.deleteBusinessOfferingStep(stepId);
    await refetchSteps();
  };

  const onReorderSteps = async (newItems: any[]) => {
    const orders = newItems.map((s, i) => ({ id: s.id, order: i }));
    await apiClient.reorderBusinessOfferingSteps(boId, orders);
    await refetchSteps();
  };

  const updateStepStatus = async (stepId: number, payload: any) => {
    await apiClient.updateBusinessOfferingStep(stepId, payload);
    await refetchSteps();
  };

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error || !offering)
    return <div className="p-6 text-red-600">Failed to load</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/business-offerings")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
            <p className="text-gray-600">Overview & Steps</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(`/business-offerings/${boId}/edit`)}
        >
          <Edit className="w-4 h-4 mr-2" /> Edit
        </Button>
      </div>

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/business-offerings">Sales</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>#{boId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Sales Overview</CardTitle>
            <CardDescription>Key information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Solution</div>
                <div className="font-medium">{offering.solution || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Product</div>
                <div className="font-medium">{offering.product || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Client Status</div>
                <div className="font-medium">
                  {offering.client_status || "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Location</div>
                <div className="font-medium">
                  {client?.city && client?.country
                    ? `${client.city}, ${client.country}`
                    : client?.city || client?.country || "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">
                  Current Daily Volume
                </div>
                <div className="font-medium">
                  {offering.current_daily_volume_bucket || "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">
                  Projected Daily Volume
                </div>
                <div className="font-medium">
                  {offering.projected_daily_volume_bucket || "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Avg Fee</div>
                <div className="font-medium">
                  {offering.avg_fee_value && offering.avg_fee_currency
                    ? `${offering.avg_fee_value} ${offering.avg_fee_currency}`
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">
                  Potential MRR (Lacs)
                </div>
                <div className="font-medium">
                  {offering.potential_mrr_lacs ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">
                  Current ARR (USD Mn)
                </div>
                <div className="font-medium">
                  {offering.current_potential_arr_usd_mn ?? "-"}
                </div>
              </div>
            </div>

            {offering.offering_description && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500 mb-2">Description</div>
                <div className="text-sm text-gray-700">
                  {offering.offering_description}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
              <CardDescription>Primary client details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Client</span>
                <span className="font-medium">
                  {client?.client_name || "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-medium">
                  {offering.client_status || "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales Summary</CardTitle>
              <CardDescription>Progress and key dates</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const completed = (steps as any[]).filter(
                  (s: any) => s.status === "completed",
                ).length;
                const total = (steps as any[]).length;
                let totalCompletedProbability = 0;
                let totalStepProbability = 0;
                (steps as any[]).forEach((s: any) => {
                  const prob = parseFloat(s.probability_percent) || 0;
                  totalStepProbability += prob;
                  if (s.status === "completed")
                    totalCompletedProbability += prob;
                });
                const percent = totalStepProbability
                  ? Math.min(100, Math.round(totalCompletedProbability))
                  : total
                    ? Math.round(
                        ((completed +
                          (steps as any[]).filter(
                            (s: any) => s.status === "in_progress",
                          ).length *
                            0.5) /
                          total) *
                          100,
                      )
                    : 0;
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`${percent >= 100 ? "bg-green-500" : percent >= 50 ? "bg-blue-500" : "bg-orange-500"} h-3 rounded`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-sm font-bold text-blue-600 min-w-[48px] text-right">
                        {percent}%
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {completed} of {total} steps
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                      <div>
                        <div className="text-gray-500">Started</div>
                        <div className="font-medium">
                          {(offering as any).created_at
                            ? new Date(
                                (offering as any).created_at,
                              ).toLocaleDateString("en-IN")
                            : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Target Close</div>
                        <div className="font-medium">-</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {client?.client_name || "Client"} steps pipeline
            </CardTitle>
            <CardDescription>Track progress</CardDescription>
          </CardHeader>
          <CardContent>
            <VCDraggableStepsList
              vcId={boId}
              steps={steps as any[]}
              expandedSteps={expandedSteps}
              onToggleExpansion={onToggleExpansion}
              onDeleteStep={onDeleteStep}
              onReorderSteps={onReorderSteps}
              updateStepStatus={updateStepStatus}
              stepApiBase={"business-offerings"}
              focusStepId={focusStepId}
              focusFollowUpId={focusFollowUpId}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Steps Status</CardTitle>
            <CardDescription>Stepwise breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const all = (steps as any[]) || [];
              const total = all.length;
              const completed = all.filter(
                (s: any) => s.status === "completed",
              ).length;
              const inProg = all.filter(
                (s: any) => s.status === "in_progress",
              ).length;
              const pending = Math.max(0, total - completed - inProg);
              const sorted = [...all].sort(
                (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
              );
              const current = sorted.find((s: any) => s.status !== "completed");
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 border rounded-md">
                      <div className="text-xs text-gray-500">In Progress</div>
                      <div className="text-xl font-semibold text-blue-700">
                        {inProg}
                      </div>
                    </div>
                    <div className="p-3 border rounded-md">
                      <div className="text-xs text-gray-500">Pending</div>
                      <div className="text-xl font-semibold text-orange-600">
                        {pending}
                      </div>
                    </div>
                    <div className="p-3 border rounded-md">
                      <div className="text-xs text-gray-500">Completed</div>
                      <div className="text-xl font-semibold text-green-600">
                        {completed}
                      </div>
                    </div>
                    <div className="p-3 border rounded-md">
                      <div className="text-xs text-gray-500">Total Steps</div>
                      <div className="text-xl font-semibold">{total}</div>
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-500">Current Stage</div>
                    <div className="font-medium">
                      {current?.name || "Completed"}
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
