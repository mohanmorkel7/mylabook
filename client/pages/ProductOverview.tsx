import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { apiClient } from "@/lib/api";
import { VCDraggableStepsList } from "@/components/VCDraggableStepsList";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Edit, ArrowLeft } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  open: "Open",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  delayed: "Delayed",
  archived: "Archived",
  created: "Created",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

function formatStatusLabel(s?: string) {
  if (!s) return "";
  return (
    STATUS_LABELS[s] ||
    s.replace(/_/g, " ").replace(/(^|\s)\S/g, (t) => t.toUpperCase())
  );
}

export default function ProductOverview() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect legacy paths to canonical product_dashboard detail route
  useEffect(() => {
    if (!id) return;
    try {
      if (location.pathname.startsWith("/products/")) {
        navigate(`/product_dashboard/${id}`, { replace: true });
      } else if (location.pathname.startsWith("/product_master/")) {
        navigate(`/product_dashboard/${id}`, { replace: true });
      }
    } catch (e) {
      // ignore
    }
  }, [id, location.pathname, navigate]);

  const toggleStepExpansion = (stepId: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  // Load product (product_master preferred, fallback to workflow_projects)
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const pmRes = await apiClient.request<any>(`/product-master/${id}`);
        if (pmRes && pmRes.id) {
          const normalized: any = {
            id: pmRes.id,
            product_id: pmRes.product_id,
            name: pmRes.name,
            description: pmRes.description,
            current_version: pmRes.current_version,
            repository_url: pmRes.repository_url,
            product_url: pmRes.product_url,
            is_active: pmRes.is_active,
            status: pmRes.status,
            created_at: pmRes.created_at,
            updated_at: pmRes.updated_at,
            created_by: pmRes.created_by,
            updated_by: pmRes.updated_by,
            template_id: pmRes.template_id,
            meta: pmRes,
          };
          setProduct(normalized);

          if (normalized.template_id) {
            try {
              const tpl = await apiClient.getTemplate(
                Number(normalized.template_id),
              );
              if (tpl && tpl.steps) {
                setSteps(
                  tpl.steps.map((s: any, i: number) => ({
                    id: s.id || i + 1,
                    name: s.name,
                    description: s.description || null,
                    step_name: s.name,
                    step_description: s.description || null,
                    probability_percent:
                      parseFloat(s.probability_percent ?? 0) || 0,
                    eta: s.default_eta_days
                      ? new Date(
                          Date.now() + s.default_eta_days * 24 * 3600 * 1000,
                        ).toISOString()
                      : null,
                    status: "pending",
                    estimated_hours: s.default_eta_days
                      ? s.default_eta_days * 8
                      : undefined,
                    project_id: Number(id),
                    isTemplate: true,
                  })),
                );
              }
            } catch (tplErr) {
              console.debug("Failed to load template steps", tplErr);
            }
          } else {
            setSteps([]);
          }

          return;
        }
      } catch (err) {
        // ignore and fallback
      }

      try {
        const res = await apiClient.request<any>(`/workflow/projects/${id}`);
        if (!res) return;
        const normalized: any = {
          id: res.id,
          name: res.name,
          description: res.description,
          progress: res.progress_percentage ?? res.progress ?? 0,
          project_manager_id: res.project_manager_id,
          target_completion_date: res.target_completion_date,
          estimated_hours: res.estimated_hours,
          status: res.status,
          template_id: res.template_id,
          meta: res,
        };
        const normalizedSteps = (res.steps || []).map((s: any) => ({
          id: s.id,
          name: s.step_name || s.name,
          description: s.step_description || s.description || null,
          step_name: s.step_name || s.name,
          step_description: s.step_description || s.description || null,
          probability_percent:
            parseFloat(s.probability ?? s.probability_percent ?? 0) || 0,
          eta: s.eta || s.due_date,
          status: s.status,
          estimated_hours: s.estimated_hours,
          project_id: s.project_id || res.id,
          isTemplate: !!s.is_template || !!s.isTemplate || false,
        }));
        setProduct(normalized);
        setSteps(normalizedSteps);

        if ((!res.steps || res.steps.length === 0) && normalized.template_id) {
          try {
            const tpl = await apiClient.getTemplate(
              Number(normalized.template_id),
            );
            if (tpl && tpl.steps) {
              setSteps(
                tpl.steps.map((s: any, i: number) => ({
                  id: s.id || i + 1,
                  name: s.name,
                  description: s.description || null,
                  step_name: s.name,
                  step_description: s.description || null,
                  probability_percent:
                    parseFloat(s.probability_percent ?? 0) || 0,
                  eta: s.default_eta_days
                    ? new Date(
                        Date.now() + s.default_eta_days * 24 * 3600 * 1000,
                      ).toISOString()
                    : null,
                  status: "pending",
                  estimated_hours: s.default_eta_days
                    ? s.default_eta_days * 8
                    : undefined,
                  project_id: Number(id),
                  isTemplate: true,
                })),
              );
            }
          } catch (tplErr) {
            console.debug(
              "Failed to load template steps for workflow project",
              tplErr,
            );
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [id]);

  const completionPercentage = (() => {
    if (steps && steps.length > 0) {
      let totalCompletedProbability = 0;
      let totalStepProbability = 0;

      steps.forEach((s: any) => {
        const prob = parseFloat(s.probability_percent) || 0;
        totalStepProbability += prob;
        if (s.status === "completed") totalCompletedProbability += prob;
      });

      if (totalStepProbability > 0) {
        const pct = (totalCompletedProbability / totalStepProbability) * 100;
        return Math.min(100, Math.round(pct));
      }

      if (
        product &&
        typeof product.progress === "number" &&
        product.progress > 0
      ) {
        return Math.min(100, Math.round(product.progress));
      }

      const completedCount = steps.filter(
        (s: any) => s.status === "completed",
      ).length;
      const inProgressCount = steps.filter(
        (s: any) => s.status === "in_progress",
      ).length;
      const totalSteps = steps.length;
      return totalSteps > 0
        ? Math.round(
            ((completedCount + inProgressCount * 0.5) / totalSteps) * 100,
          )
        : 0;
    }
    return product?.progress || 0;
  })();

  const refetchSteps = async () => {
    setStepsLoading(true);
    try {
      const res = await apiClient.request<any>(
        `/workflow/projects/${id}/steps`,
      );
      setSteps(
        (res || []).map((s: any) => ({
          id: s.id,
          name: s.step_name || s.name,
          description: s.step_description || s.description || null,
          step_name: s.step_name || s.name,
          step_description: s.step_description || s.description || null,
          probability_percent:
            parseFloat(s.probability ?? s.probability_percent ?? 0) || 0,
          eta: s.eta || s.due_date,
          status: s.status,
          estimated_hours: s.estimated_hours,
          project_id: s.project_id || Number(id),
          isTemplate: !!s.is_template || !!s.isTemplate || false,
        })),
      );
    } catch (e) {
      console.error("Failed to refetch steps:", e);
    } finally {
      setStepsLoading(false);
    }
  };

  useEffect(() => {
    if (product) refetchSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const handleDeleteStep = async (stepId: number) => {
    if (!window.confirm("Delete this step?")) return;
    try {
      await apiClient.request(`/workflow/steps/${stepId}`, {
        method: "DELETE",
      });
      await refetchSteps();
    } catch (e) {
      console.error(e);
      alert("Failed to delete step");
    }
  };

  const updateStepStatus = async (stepId: number, payload: any) => {
    try {
      await apiClient.request(`/workflow/steps/${stepId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ ...payload, updated_by: 1 }),
      });
      await refetchSteps();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReorderSteps = async (reordered: any[]) => {
    try {
      const stepOrders = reordered.map((s: any, idx: number) => ({
        id: s.id,
        order: idx + 1,
      }));
      await apiClient.request(`/workflow/projects/${id}/steps/reorder`, {
        method: "POST",
        body: JSON.stringify({ stepOrders }),
      });
      await refetchSteps();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteProject = async () => {
    if (!window.confirm("Delete this product?")) return;
    try {
      if (product && product.product_id) {
        await apiClient.request(`/product-master/${product.id}`, {
          method: "DELETE",
        });
        navigate("/product_master");
      } else {
        await apiClient.request(`/workflow/projects/${id}`, {
          method: "DELETE",
        });
        navigate("/product_master");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete product");
    }
  };

  if (!product) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/product_dashboard">Products</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/product_dashboard/${id}`}>
              {product.name || `#${id}`}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Overview</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/product_master")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {product.name}
              </h1>
              <Badge className="text-xs">
                {product.product_id || product.id}
              </Badge>
              <Badge className="text-xs">
                {formatStatusLabel(product.status)}
              </Badge>
            </div>
            <p className="text-gray-600 mt-1">Product Overview & Pipeline</p>
          </div>
        </div>

        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => {
              if (product && product.product_id)
                navigate(`/product_master/${id}/edit`);
              else navigate(`/products/${id}/edit`);
            }}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Product
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this Project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All related steps and comments
                  will be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteProject}>
                  Confirm Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Product Overview</CardTitle>
              <CardDescription>
                Basic information and pipeline steps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {product.status}
                  </div>
                </div>
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    Target Completion
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {product.target_completion_date || "TBD"}
                  </div>
                </div>
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Estimated Hours</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {product.estimated_hours || "TBD"}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 max-w-sm">
                    <div className="w-full bg-gray-200 rounded-full h-3 relative">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          completionPercentage === 100
                            ? "bg-green-500"
                            : completionPercentage >= 75
                              ? "bg-blue-500"
                              : completionPercentage >= 50
                                ? "bg-yellow-500"
                                : completionPercentage >= 25
                                  ? "bg-orange-500"
                                  : "bg-red-500"
                        }`}
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-600">
                      {completionPercentage}% Complete
                    </div>
                    <div className="text-xs text-gray-500">
                      {steps.filter((s) => s.status === "completed").length} of{" "}
                      {steps.length} steps
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
              <CardDescription>
                Metadata and links from product_master table
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-gray-600">Product ID</div>
                <div className="font-semibold text-gray-900">
                  {product.product_id || product.id}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-600">Description</div>
                <div className="text-gray-900">
                  {product.description || "—"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-600">Repository</div>
                  <div className="text-gray-900">
                    {product.repository_url ? (
                      <a
                        className="text-blue-600 underline"
                        href={product.repository_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Repository
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600">Product Link</div>
                  <div className="text-gray-900">
                    {product.product_url ? (
                      <a
                        className="text-blue-600 underline"
                        href={product.product_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Product
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600">Current Version</div>
                  <div className="text-gray-900">
                    {product.current_version || "-"}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600">Active</div>
                  <div className="text-gray-900">
                    {product.is_active ? "Yes" : "No"}
                  </div>
                </div>
              </div>

              <div className="flex flex-col text-xs text-gray-500">
                <div>
                  Created:{" "}
                  {product.created_at
                    ? new Date(product.created_at).toLocaleString()
                    : "-"}{" "}
                  by {product.created_by || "-"}
                </div>
                <div>
                  Updated:{" "}
                  {product.updated_at
                    ? new Date(product.updated_at).toLocaleString()
                    : "-"}{" "}
                  by {product.updated_by || "-"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{`${product.name || "Product"} Pipeline`}</CardTitle>
                  <CardDescription>Manage steps and team chat</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {stepsLoading ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
                  <p>Loading pipeline steps...</p>
                </div>
              ) : steps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Target className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No pipeline steps yet
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Create steps to track your product's progress.
                  </p>
                </div>
              ) : (
                <VCDraggableStepsList
                  vcId={Number(id)}
                  steps={steps}
                  expandedSteps={expandedSteps}
                  onToggleExpansion={toggleStepExpansion}
                  onDeleteStep={handleDeleteStep}
                  onReorderSteps={handleReorderSteps}
                  updateStepStatus={updateStepStatus}
                  stepApiBase="workflow"
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Product Metadata</CardTitle>
              <CardDescription>Primary metadata and links</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2">
                {product.name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Name</span>
                    <span className="text-gray-900">{product.name}</span>
                  </div>
                )}

                {product.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Description</span>
                    <span className="text-gray-900">{product.description}</span>
                  </div>
                )}

                {product.project_manager_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Owner</span>
                    <span className="text-gray-900">
                      {product.project_manager_id}
                    </span>
                  </div>
                )}

                {product.target_completion_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Target</span>
                    <span className="text-gray-900">
                      {product.target_completion_date}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
