import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import BusinessOfferings from "@/pages/BusinessOfferings";

export default function BusinessOfferingsEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["business-offering", id],
    queryFn: async () =>
      id ? apiClient.getBusinessOffering(Number(id)) : null,
    enabled: !!id,
    retry: 1,
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  let initial = data;
  if ((!initial || error) && id) {
    const list: any[] =
      (queryClient.getQueryData(["business-offerings"]) as any[]) || [];
    const fromCache = list.find((o) => String(o.id) === String(id));
    if (fromCache) initial = fromCache;
  }

  if (!initial) {
    return (
      <div className="p-6 space-y-2">
        <div className="text-red-600">Failed to load Business Offering.</div>
        <button
          className="px-3 py-2 border rounded"
          onClick={() => navigate("/business-offerings")}
        >
          Back to Business Offerings
        </button>
      </div>
    );
  }

  return <BusinessOfferings initial={initial} offeringId={Number(id)} />;
}
