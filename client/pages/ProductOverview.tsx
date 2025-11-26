import React, { useEffect, useState } from "react";
import apiClient from "@/lib/api";
import { useParams, Link } from "react-router-dom";

const formatRemaining = (eta?: string | null, createdAt?: string) => {
  if (!eta) return "No ETA";
  try {
    const d = new Date(eta);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff <= 0) return "Overdue";
    const days = Math.floor(diff / (24 * 3600 * 1000));
    const hours = Math.floor((diff % (24 * 3600 * 1000)) / 3600000);
    return `${days} Days ${hours} Hours Remaining`;
  } catch (e) {
    return "Invalid ETA";
  }
};

const ProductOverview: React.FC = () => {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        // Load from workflow projects API and normalize to product shape
        const res = await apiClient.request<any>(`/workflow/projects/${id}`);
        if (!res) return;
        const normalized: any = {
          id: res.id,
          name: res.name,
          description: res.description,
          progress: res.progress_percentage ?? res.progress ?? 0,
          steps: (res.steps || []).map((s: any) => ({
            id: s.id,
            name: s.step_name || s.name,
            description: s.step_description || s.description,
            probability: s.probability || s.probability_percent || 0,
            eta: s.eta || s.due_date,
            status: s.status,
            estimated_hours: s.estimated_hours,
          })),
          project_manager_id: res.project_manager_id,
          target_completion_date: res.target_completion_date,
          estimated_hours: res.estimated_hours,
        };
        setProduct(normalized);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [id]);

  if (!product) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <div>
          <Link to="/products" className="btn mr-2">
            Back
          </Link>
          <button className="btn btn-primary">Edit</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Overview</h3>
          <p className="text-sm text-gray-700 mb-4">{product.description}</p>

          <h4 className="font-semibold mb-2">Steps</h4>
          <div className="space-y-2">
            {product.steps && product.steps.length > 0 ? (
              product.steps.map((s: any) => (
                <div
                  key={s.id}
                  className="p-3 border rounded flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-sm text-gray-500">{s.description}</div>
                    <div className="text-sm text-gray-500">
                      Probability: {s.probability}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div>{s.status}</div>
                    <div className="text-sm text-gray-500">
                      {formatRemaining(s.eta, product.created_at)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No steps</div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Details</h3>
          <div className="text-sm text-gray-600">
            Manager: {product.project_manager_id || "-"}
          </div>
          <div className="text-sm text-gray-600">
            Target: {product.target_completion_date || "-"}
          </div>
          <div className="text-sm text-gray-600">
            Estimated Hours: {product.estimated_hours || "-"}
          </div>
          <div className="mt-4">
            <div className="text-sm text-gray-500">Progress</div>
            <div className="w-full bg-gray-200 rounded h-4 mt-1">
              <div
                style={{ width: `${product.progress}%` }}
                className="h-4 bg-green-500 rounded"
              />
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {product.progress}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductOverview;
