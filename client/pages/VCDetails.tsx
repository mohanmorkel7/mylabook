import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { useUpdateVCStep, useDeleteVCStep } from "@/hooks/useApi";
import { DraggableVCStepsList } from "@/components/DraggableVCStepsList";
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
  DollarSign,
  User,
  Target,
  Plus,
  Settings,
  CheckCircle,
  Clock,
  Users,
  Globe,
  Award,
  Zap,
  PiggyBank,
  TrendingUp,
  Briefcase,
  Send,
  MessageSquare,
} from "lucide-react";
import { formatToISTDateTime } from "@/lib/dateUtils";
import {
  getSectorLabel,
  getInvestorFeedbackLabel,
  formatPhoneDisplay,
  formatPhoneHref,
} from "@/lib/constants";
import { toast } from "@/components/ui/use-toast";

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
  email: Mail,
  "social-media": Users,
  phone: Phone,
  website: Globe,
  referral: Award,
  "cold-call": Phone,
  event: Building,
  other: Zap,
};

const sourceColors = {
  email: "bg-blue-100 text-blue-700",
  "social-media": "bg-purple-100 text-purple-700",
  phone: "bg-green-100 text-green-700",
  website: "bg-orange-100 text-orange-700",
  referral: "bg-pink-100 text-pink-700",
  "cold-call": "bg-cyan-100 text-cyan-700",
  event: "bg-indigo-100 text-indigo-700",
  other: "bg-gray-100 text-gray-700",
};

const investorCategoryColors = {
  angel: "bg-sky-100 text-sky-800 border-sky-200",
  vc: "bg-indigo-100 text-indigo-800 border-indigo-200",
  private_equity: "bg-purple-100 text-purple-800 border-purple-200",
  family_office: "bg-orange-100 text-orange-800 border-orange-200",
  merchant_banker: "bg-cyan-100 text-cyan-800 border-cyan-200",
};

const roundStageColors = {
  pre_seed: "bg-gray-100 text-gray-800",
  seed: "bg-green-100 text-green-800",
  series_a: "bg-blue-100 text-blue-800",
  series_b: "bg-purple-100 text-purple-800",
  series_c: "bg-pink-100 text-pink-800",
  bridge: "bg-yellow-100 text-yellow-800",
  mezzanine: "bg-red-100 text-red-800",
};

export default function VCDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get primary contact from contacts array
  const getPrimaryContact = (vcData: any) => {
    if (!vcData?.contacts) {
      console.log("No contacts data available:", vcData?.contacts);
      return null;
    }

    try {
      const contacts =
        typeof vcData.contacts === "string"
          ? JSON.parse(vcData.contacts)
          : vcData.contacts;

      console.log("Parsed contacts:", contacts);
      return Array.isArray(contacts) && contacts.length > 0
        ? contacts[0]
        : null;
    } catch (error) {
      console.error(
        "Error parsing contacts:",
        error,
        "Raw contacts:",
        vcData.contacts,
      );
      return null;
    }
  };

  // Currency formatting function
  const formatCurrency = (
    amount: string | number,
    currency: string = "INR",
  ) => {
    if (!amount) return "N/A";

    // Convert to string if it's a number
    const amountStr = typeof amount === "number" ? amount.toString() : amount;

    // If amount already includes a currency symbol, return as is
    if (
      amountStr.includes("$") ||
      amountStr.includes("₹") ||
      amountStr.includes("د.إ")
    ) {
      return amountStr;
    }

    const symbol = currency === "USD" ? "$" : currency === "AED" ? "د.إ" : "₹";
    return `${symbol}${amountStr}`;
  };

  // Format large numbers with currency
  const formatLargeAmount = (
    amount: number | string,
    currency: string = "INR",
  ) => {
    console.log("🐛 DEBUG - formatLargeAmount called with:", {
      amount,
      currency,
      type: typeof amount,
    });

    // Handle null, undefined, empty string
    if (!amount && amount !== 0) {
      console.log("🐛 DEBUG - returning N/A for falsy value");
      return "N/A";
    }

    const amountNum = typeof amount === "string" ? parseFloat(amount) : amount;
    console.log("🐛 DEBUG - parsed amount:", amountNum);

    if (isNaN(amountNum) || amountNum <= 0) {
      console.log("🐛 DEBUG - returning N/A for zero/invalid value");
      return "N/A";
    }

    const symbol = currency === "USD" ? "$" : currency === "AED" ? "د.إ" : "₹";
    const formatted = (amountNum / 1000000).toFixed(1);
    const result = `${symbol}${formatted}M`;
    console.log("🐛 DEBUG - formatted result:", result);
    return result;
  };
  const vcId = parseInt(id || "0");

  const [newStepDialog, setNewStepDialog] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState(new Set<number>());
  const [newStep, setNewStep] = useState({
    name: "",
    description: "",
    due_date: "",
    priority: "medium" as const,
    estimated_days: 1,
  });

  // Fetch VC details
  const {
    data: vcData,
    isLoading: vcLoading,
    error: vcError,
  } = useQuery({
    queryKey: ["vc", id],
    queryFn: async () => {
      const response = await apiClient.request(`/vc/${id}`);
      return response;
    },
    enabled: !!id,
  });

  // Fetch VC steps
  const {
    data: vcSteps = [],
    isLoading: stepsLoading,
    refetch: refetchSteps,
    error: stepsError,
  } = useQuery({
    queryKey: ["vc-steps", id],
    queryFn: async () => {
      const response = await apiClient.request(`/vc/${id}/steps`, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      return response;
    },
    enabled: !!id,
    staleTime: 0, // Don't cache
    cacheTime: 0, // Don't cache
  });

  // Create step mutation
  const createStepMutation = useMutation({
    mutationFn: async (stepData: any) => {
      const response = await apiClient.request(`/vc/${id}/steps`, {
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

  const updateVCStepMutation = useUpdateVCStep();
  const deleteVCStepMutation = useDeleteVCStep();

  // Calculate completion percentage based on actual step probability percentages
  const calculateCompletionPercentage = () => {
    if (vcSteps && vcSteps.length > 0) {
      // Sum probability_percent of completed steps
      const completedProbability = vcSteps
        .filter((step: any) => step.status === "completed")
        .reduce((sum: number, step: any) => {
          const probability = parseFloat(step.probability_percent) || 0;
          return sum + probability;
        }, 0);

      // Add half probability for in-progress steps
      const inProgressProbability = vcSteps
        .filter((step: any) => step.status === "in_progress")
        .reduce((sum: number, step: any) => {
          const probability = parseFloat(step.probability_percent) || 0;
          return sum + probability * 0.5;
        }, 0);

      const total = completedProbability + inProgressProbability;
      return isNaN(total) ? 0 : Math.round(total);
    }

    return vcData?.probability || 0;
  };

  const completionPercentage = calculateCompletionPercentage();

  const handleBack = () => {
    navigate("/vc");
  };

  const handleEdit = () => {
    navigate(`/vc/${id}/edit`);
  };

  const handleAddStep = async () => {
    if (!newStep.name.trim()) {
      toast({
        title: "Missing name",
        description: "Step name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!newStep.description.trim()) {
      toast({
        title: "Missing description",
        description: "Step description is required.",
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
    } catch (error) {
      console.error("Failed to create step:", error);
      toast({
        title: "Create failed",
        description: "Failed to create step. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleExpansion = (stepId: number) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!window.confirm("Are you sure you want to delete this step?")) {
      return;
    }

    try {
      await deleteVCStepMutation.mutateAsync(stepId);
      refetchSteps();
      toast({
        title: "Step deleted",
        description: "The step was deleted successfully.",
      });
    } catch (error) {
      console.error("Failed to delete step:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete step. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReorderSteps = async (reorderedSteps: any[]) => {
    try {
      const stepOrders = reorderedSteps.map((step, index) => ({
        id: step.id,
        order_index: index + 1,
      }));

      await apiClient.request(`/vc/${id}/steps/reorder`, {
        method: "PUT",
        body: JSON.stringify({ stepOrders }),
      });

      refetchSteps();
    } catch (error) {
      console.error("Failed to reorder steps:", error);
    }
  };

  const getRoundStageDisplay = (stage: string) => {
    return (
      stage
        ?.split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ") || "N/A"
    );
  };

  if (vcLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading VC details...</div>
      </div>
    );
  }

  if (vcError || !vcData) {
    return (
      <div className="p-6">
        <div className="text-center text-red-600">Error loading VC details</div>
      </div>
    );
  }

  const SourceIcon =
    sourceIcons[vcData.lead_source as keyof typeof sourceIcons] || Zap;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to VC Overview
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
            <p className="text-gray-600 mt-1">VC Details</p>
          </div>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={handleEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Edit VC
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column - VC Information */}
        <div className="lg:col-span-3 space-y-6">
          {/* VC Overview */}
          <Card>
            <CardHeader>
              <CardTitle>VC Overview</CardTitle>
              <CardDescription>Essential VC information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: "VC ID", value: vcData.vc_id },
                  {
                    label: "Venture Capital Name",
                    value: vcData.investor_name,
                  },
                  {
                    label: "VC Type",
                    value: vcData.investor_category
                      ?.replace("_", " ")
                      .toUpperCase(),
                  },
                  {
                    label: "Sector Focus",
                    value: vcData.industry && getSectorLabel(vcData.industry),
                  },
                  {
                    label: "Contact Person",
                    value: getPrimaryContact(vcData)?.contact_name,
                  },
                  { label: "Email", value: getPrimaryContact(vcData)?.email },
                  { label: "Phone", value: getPrimaryContact(vcData)?.phone },
                  { label: "Country", value: vcData.country },
                  { label: "Website", value: vcData.website },
                  {
                    label: "Investor Last Feedback",
                    value: getInvestorFeedbackLabel(
                      vcData.investor_last_feedback as any,
                    ),
                  },
                ]
                  .filter(
                    (item) =>
                      item.value !== null &&
                      item.value !== undefined &&
                      item.value !== "",
                  )
                  .map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="text-sm text-gray-600">{item.label}</div>
                      <div className="text-gray-900 break-words">
                        {item.label === "Website" ? (
                          <a
                            href={
                              String(item.value).startsWith("http")
                                ? String(item.value)
                                : `https://${item.value}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {String(item.value)}
                          </a>
                        ) : item.label === "Email" ? (
                          <a
                            href={`mailto:${item.value}`}
                            className="text-blue-600 hover:underline"
                          >
                            {String(item.value)}
                          </a>
                        ) : item.label === "Phone" ? (
                          <a
                            href={`tel:${formatPhoneHref(getPrimaryContact(vcData)?.phone, vcData.country)}`}
                            className="text-blue-600 hover:underline"
                          >
                            {formatPhoneDisplay(
                              getPrimaryContact(vcData)?.phone,
                              vcData.country,
                            )}
                          </a>
                        ) : (
                          String(item.value)
                        )}
                      </div>
                    </div>
                  ))}
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
        </div>

        {/* Right Column - Quick Actions & Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {getPrimaryContact(vcData)?.email ? (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `mailto:${getPrimaryContact(vcData)?.email}?subject=Follow-up: ${vcData.round_title || vcData.investor_name}&body=Hi ${getPrimaryContact(vcData)?.contact_name},%0D%0A%0D%0AI wanted to follow up on our discussion regarding ${vcData.round_title || "your investment opportunity"}...`,
                      "_blank",
                    )
                  }
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email
                </Button>
              ) : (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email (No email available)
                </Button>
              )}

              {getPrimaryContact(vcData)?.phone ? (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `tel:${formatPhoneHref(getPrimaryContact(vcData)?.phone, vcData.country)}`,
                      "_self",
                    )
                  }
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call {getPrimaryContact(vcData)?.contact_name}
                </Button>
              ) : (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Make Call (No phone available)
                </Button>
              )}

              {vcData.website && (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => window.open(vcData.website, "_blank")}
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Visit Website
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
