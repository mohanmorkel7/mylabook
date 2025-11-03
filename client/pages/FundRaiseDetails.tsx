import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  getSourceLabel,
  formatPhoneDisplay,
  formatPhoneHref,
} from "@/lib/constants";
import { apiClient } from "@/lib/api";
import { useUpdateFundRaiseStep } from "@/hooks/useApi";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  Building,
  Calendar,
  Target,
  Plus,
  User,
  Globe,
  Award,
  Zap,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusColors = {
  "in-progress": "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  completed: "bg-purple-100 text-purple-700",
};

const priorityColors = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
};

const sourceIcons = {
  linkedin_outbound: User,
  linkedin_inbound: User,
  email_outbound: Mail,
  email_inbound: Mail,
  call_outbound: Phone,
  call_inbound: Phone,
  reference: Award,
  general_list: Globe,
  email: Mail,
  "social-media": User,
  phone: Phone,
  website: Globe,
  referral: Award,
  other: Zap,
};

const roundStageColors = {
  pre_seed: "bg-gray-100 text-gray-800",
  seed: "bg-green-100 text-green-800",
  series_a: "bg-blue-100 text-blue-800",
  series_b: "bg-purple-100 text-purple-800",
  series_c: "bg-pink-100 text-pink-800",
  bridge: "bg-yellow-100 text-yellow-800",
  bridge_1: "bg-yellow-100 text-yellow-800",
  bridge_2: "bg-yellow-100 text-yellow-800",
  mezzanine: "bg-red-100 text-red-800",
};

export default function FundRaiseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const updateStepMutation = useUpdateFundRaiseStep();

  const frId = parseInt(id || "0");

  const deleteMutation = useMutation({
    mutationFn: async () =>
      apiClient.request(`/fund-raises/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-raises"] });
      queryClient.invalidateQueries({ queryKey: ["fundraise", id] });
      toast({
        title: "Fund Raise deleted",
        description: "The fund raise has been deleted.",
      });
      navigate("/fundraise");
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete fund raise.",
        variant: "destructive",
      });
    },
  });

  const [newStepDialog, setNewStepDialog] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState(new Set<number>());
  const focusStepId = location?.state?.openStepId || null;
  const focusFollowUpId = location?.state?.focusFollowUpId || null;
  const [newStep, setNewStep] = useState({
    name: "",
    description: "",
    due_date: "",
    priority: "medium" as const,
    estimated_days: 1,
  });

  const {
    data: vcData,
    isLoading: vcLoading,
    error: vcError,
  } = useQuery({
    queryKey: ["fundraise", id],
    queryFn: async () => apiClient.request(`/fund-raises/${id}`),
    enabled: !!id,
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const {
    data: vcSteps = [],
    isLoading: stepsLoading,
    refetch: refetchSteps,
  } = useQuery({
    queryKey: ["fund-raise-steps", id],
    queryFn: async () =>
      apiClient.request(`/fund-raises/${id}/steps`, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      }),
    enabled: !!id,
    staleTime: 0,
    cacheTime: 0,
  });

  const templateIdForVC = (vcData as any)?.template_id || null;

  const createStepMutation = useMutation({
    mutationFn: async (stepData: any) => {
      const response = await apiClient.request(`/fund-raises/${id}/steps`, {
        method: "POST",
        body: JSON.stringify(stepData),
      });
      return response;
    },
    onSuccess: () => {
      refetchSteps();
      setNewStepDialog(false);
      setNewStep({
        name: "",
        description: "",
        due_date: "",
        priority: "medium",
        estimated_days: 1,
      });
    },
  });

  // Seed VC steps from template 1 when no steps exist
  const seededRef = useRef(false);
  useEffect(() => {
    const seedFromTemplate = async () => {
      if (seededRef.current || !id) return;
      if (Array.isArray(vcSteps) && vcSteps.length > 0) return;
      try {
        if (!templateIdForVC) return; // no template assigned on fund raise
        const template = await apiClient.request(
          `/templates-production/${templateIdForVC}`,
        );
        const steps = template?.steps || [];
        if (!Array.isArray(steps) || steps.length === 0) return;
        for (const [index, tStep] of steps.entries()) {
          try {
            await apiClient.request(`/fund-raises/${id}/steps`, {
              method: "POST",
              body: JSON.stringify({
                name: tStep.name,
                description: tStep.description || tStep.name,
                due_date: "",
                priority: "medium",
                status: "pending",
                estimated_days:
                  tStep.default_eta_days || tStep.estimated_days || 1,
                probability_percent: tStep.probability_percent || 0,
                order_index: tStep.step_order || index + 1,
                created_by: parseInt(user?.id || "1"),
              }),
            });
          } catch (e) {
            // continue
          }
        }
        seededRef.current = true;
        setTimeout(() => refetchSteps(), 300);
      } catch (e) {
        // ignore
      }
    };
    if (!stepsLoading) seedFromTemplate();
  }, [id, stepsLoading, vcSteps, user?.id, refetchSteps, templateIdForVC]);

  const handleAddStep = async () => {
    if (!newStep.name.trim() || !newStep.description.trim()) {
      toast({
        title: "Missing fields",
        description: "Step name and description are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stepData = {
        name: newStep.name.trim(),
        description: newStep.description.trim(),
        due_date: newStep.due_date.trim() || undefined,
        priority: newStep.priority,
        status: "pending",
        estimated_days: newStep.estimated_days,
        created_by: parseInt(user?.id || "1"),
      };
      await createStepMutation.mutateAsync(stepData);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!stepsLoading && vcSteps?.length && focusStepId) {
      setExpandedSteps((prev) => {
        const s = new Set(prev);
        s.add(focusStepId as number);
        return s;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsLoading, vcSteps, focusStepId]);

  const handleToggleExpansion = (stepId: number) => {
    setExpandedSteps((prev) => {
      const s = new Set(prev);
      if (s.has(stepId)) s.delete(stepId);
      else s.add(stepId);
      return s;
    });
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!window.confirm("Are you sure you want to delete this step?")) return;
    try {
      await apiClient.request(`/fund-raises/steps/${stepId}`, {
        method: "DELETE",
      });
      refetchSteps();
      toast({
        title: "Step deleted",
        description: "The step was deleted successfully.",
      });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: "Failed to delete step.",
        variant: "destructive",
      });
    }
  };

  const updateFundRaiseStepStatus = (stepId: number, payload: any) => {
    updateStepMutation.mutate(
      { stepId, stepData: payload },
      {
        onSuccess: () => {
          refetchSteps();
        },
        onError: (error) => {
          console.error("Failed to update step status:", error);
        },
      },
    );
  };

  const handleReorderSteps = async (reorderedSteps: any[]) => {
    try {
      const stepOrders = reorderedSteps.map((step, index) => ({
        id: step.id,
        order: index + 1,
      }));
      await apiClient.request(`/fund-raises/${id}/steps/reorder`, {
        method: "PUT",
        body: JSON.stringify({ stepOrders }),
      });
      refetchSteps();
    } catch (e) {
      // ignore
    }
  };

  const getPrimaryContact = (data: any) => {
    try {
      const contacts =
        typeof data?.contacts === "string"
          ? JSON.parse(data.contacts)
          : data?.contacts;
      return Array.isArray(contacts) && contacts.length > 0
        ? contacts[0]
        : null;
    } catch {
      return null;
    }
  };

  const formatCurrency = (
    amount: string | number,
    currency: string = "USD",
  ) => {
    if (!amount) return "N/A";
    const amountStr = typeof amount === "number" ? amount.toString() : amount;

    // Strip any existing currency symbols to get the numeric value (preserve decimal points)
    const numericValue = amountStr
      .replace(/[$₹د]/g, "")
      .replace(/[إ]/g, "")
      .trim();

    if (!numericValue) return "N/A";

    // Always format as USD with Mn suffix
    return `$${numericValue}Mn`;
  };

  const getRoundStageDisplay = (stage: string) => {
    return (
      stage
        ?.split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") || "N/A"
    );
  };

  if (vcLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading Fund Raise details...</div>
      </div>
    );
  }

  if (vcError || !vcData) {
    return (
      <div className="p-6">
        <div className="text-center text-red-600">Error loading Fund Raise</div>
      </div>
    );
  }

  const SourceIcon =
    sourceIcons[vcData.lead_source as keyof typeof sourceIcons] || Zap;

  const completionPercentage = (() => {
    if (vcSteps && vcSteps.length > 0) {
      let totalCompletedProbability = 0;
      let totalStepProbability = 0;

      vcSteps.forEach((s: any) => {
        const prob = parseFloat(s.probability_percent) || 0;
        totalStepProbability += prob;
        if (s.status === "completed") totalCompletedProbability += prob;
      });

      if (totalStepProbability > 0) {
        return Math.min(100, Math.round(totalCompletedProbability));
      }

      const completedCount = vcSteps.filter(
        (s: any) => s.status === "completed",
      ).length;
      const inProgressCount = vcSteps.filter(
        (s: any) => s.status === "in_progress",
      ).length;
      const totalSteps = vcSteps.length;
      return totalSteps > 0
        ? Math.round(
            ((completedCount + inProgressCount * 0.5) / totalSteps) * 100,
          )
        : 0;
    }
    return vcData?.probability || 0;
  })();

  return (
    <div className="p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/fundraise">Fund Raises</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/fundraise/${id}`}>
              {vcData.round_title || vcData.investor_name || `#${id}`}
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
            onClick={() => navigate("/fundraise")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fund Raise
          </Button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {vcData.round_title || vcData.investor_name}
              </h1>
              <Badge className="text-xs">{vcData.vc_id}</Badge>
              <Badge
                className={
                  statusColors[vcData.status as keyof typeof statusColors]
                }
              >
                {vcData.status.replace("-", " ")}
              </Badge>
            </div>
            <p className="text-gray-600 mt-1">Fund Raise Details & Pipeline</p>
            <div className="hidden">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-gray-700">
                  Progress:
                </span>
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
                    {completionPercentage > 0 && (
                      <div
                        className="absolute top-0 h-3 w-1 bg-white opacity-75 rounded-full"
                        style={{ left: `${completionPercentage}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-blue-600">
                    {completionPercentage}% Complete
                  </div>
                  <div className="text-xs text-gray-500">
                    {vcSteps
                      ? vcSteps.filter((s: any) => s.status === "completed")
                          .length
                      : 0}{" "}
                    of {vcSteps?.length || 0} steps
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => navigate(`/fundraise/${id}/edit`)}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Fund Raise
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this Fund Raise?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All related steps and comments
                  will be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>
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
              <CardTitle>Fund Raise Overview</CardTitle>
              <CardDescription>
                Basic information and funding details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Round Stage</div>
                  <div className="mt-1">
                    <Badge
                      className={
                        roundStageColors[
                          vcData.round_stage as keyof typeof roundStageColors
                        ]
                      }
                    >
                      {getRoundStageDisplay(vcData.round_stage)}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Round Size</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {formatCurrency(
                      vcData.round_size,
                      vcData.billing_currency,
                    ) || "TBD"}
                  </div>
                </div>
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Valuation</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {formatCurrency(
                      vcData.valuation,
                      vcData.billing_currency,
                    ) || "TBD"}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500">
                        Lead Source:
                      </span>
                      <Badge variant="secondary" className="capitalize">
                        {getSourceLabel(vcData.lead_source)}
                      </Badge>
                      {vcData.lead_source_value && (
                        <span className="text-gray-900">
                          {vcData.lead_source === "email" ||
                          vcData.lead_source?.startsWith("email_") ? (
                            <a
                              href={`mailto:${vcData.lead_source_value}`}
                              className="text-blue-600 hover:underline"
                            >
                              {vcData.lead_source_value}
                            </a>
                          ) : vcData.lead_source === "phone" ||
                            vcData.lead_source === "cold-call" ||
                            vcData.lead_source?.startsWith("call_") ? (
                            <a
                              href={`tel:${vcData.lead_source_value}`}
                              className="text-blue-600 hover:underline"
                            >
                              {vcData.lead_source_value}
                            </a>
                          ) : vcData.lead_source === "website" ? (
                            <a
                              href={
                                vcData.lead_source_value.startsWith("http")
                                  ? vcData.lead_source_value
                                  : `https://${vcData.lead_source_value}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {vcData.lead_source_value}
                            </a>
                          ) : (
                            vcData.lead_source_value
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-slate-500">Status:</span>
                      <Badge
                        className={
                          statusColors[
                            vcData.status as keyof typeof statusColors
                          ]
                        }
                      >
                        {vcData.status?.charAt(0).toUpperCase() +
                          vcData.status?.slice(1).replace("-", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Fund $ Mn:</span>
                      <span className="text-gray-900">
                        {formatCurrency(
                          vcData.fund_mn,
                          vcData.billing_currency,
                        ) || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-slate-500">Investor:</span>
                      <span className="text-gray-900">
                        {vcData.investor_name}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="space-y-3">
                    {vcData.round_description && (
                      <div className="mt-1">
                        <span className="font-medium text-gray-600">
                          Description:{" "}
                        </span>
                        <span className="text-gray-900">
                          {vcData.round_description}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {vcData.notes && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <Target className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-600">Notes:</span>
                    </div>
                    <div className="pl-6 text-gray-900 whitespace-pre-wrap">
                      {vcData.notes}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{`${vcData.investor_name || "Investor"} Funding Pipeline`}</CardTitle>
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
              ) : vcSteps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Target className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No funding steps yet
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Create steps to track your funding process.
                  </p>
                </div>
              ) : (
                <VCDraggableStepsList
                  vcId={frId}
                  steps={vcSteps}
                  expandedSteps={expandedSteps}
                  onToggleExpansion={handleToggleExpansion}
                  onDeleteStep={handleDeleteStep}
                  onReorderSteps={handleReorderSteps}
                  updateStepStatus={updateFundRaiseStepStatus}
                  stepApiBase="fund-raises"
                  focusStepId={focusStepId || undefined}
                  focusFollowUpId={focusFollowUpId || undefined}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Investor Information</CardTitle>
              <CardDescription>
                Primary contact and investor details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2">
                {vcData.investor_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Investor</span>
                    <span className="text-gray-900">
                      {vcData.investor_name}
                    </span>
                  </div>
                )}
                {getPrimaryContact(vcData)?.contact_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Contact</span>
                    <span className="text-gray-900">
                      {getPrimaryContact(vcData)?.contact_name}
                    </span>
                  </div>
                )}
                {getPrimaryContact(vcData)?.email && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email</span>
                    <a
                      href={`mailto:${getPrimaryContact(vcData)?.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {getPrimaryContact(vcData)?.email}
                    </a>
                  </div>
                )}
                {getPrimaryContact(vcData)?.phone && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phone</span>
                    <a
                      href={`tel:${formatPhoneHref(getPrimaryContact(vcData)?.phone, vcData.country)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {formatPhoneDisplay(
                        getPrimaryContact(vcData)?.phone,
                        vcData.country,
                      )}
                    </a>
                  </div>
                )}
              </div>
              {Array.isArray(vcData.investors) &&
                vcData.investors.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-2">
                        Investor Status Queue
                      </div>
                      <div className="space-y-2">
                        {vcData.investors.map((inv: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between"
                          >
                            <div className="text-gray-900 truncate pr-2">
                              {inv.investor_name || inv.vc_id}
                            </div>
                            {inv.investor_status && (
                              <Badge variant="secondary" className="text-xs">
                                {String(inv.investor_status)}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fund Raise Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-sm text-gray-500">
                  {completionPercentage}% complete
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                {vcData.start_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Started:</span>
                    <span className="text-gray-900">
                      {new Date(vcData.start_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {vcData.targeted_end_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Target Close:</span>
                    <span className="text-gray-900">
                      {new Date(vcData.targeted_end_date).toLocaleDateString()}
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
