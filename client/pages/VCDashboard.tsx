import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useMyVCPartialSaves } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Search,
  Filter,
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  CheckCircle,
  Clock,
  XCircle,
  Award,
  Mail,
  Phone,
  Globe,
  Users,
  Building,
  Zap,
  Trash2,
  MoreVertical,
  FileText,
  Play,
  DollarSign,
  Briefcase,
  Eye,
  Edit,
  Calendar,
  AlertCircle,
  PieChart,
  BarChart3,
  Activity,
} from "lucide-react";
import { formatToIST } from "@/lib/dateUtils";
import { getSectorLabel, VC_TYPES } from "@/lib/constants";
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
  urgent: "bg-red-100 text-red-700",
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
  angel: "bg-blue-100 text-blue-700",
  vc: "bg-green-100 text-green-700",
  private_equity: "bg-purple-100 text-purple-700",
  family_office: "bg-orange-100 text-orange-700",
  merchant_banker: "bg-indigo-100 text-indigo-700",
  accelerator: "bg-yellow-100 text-yellow-700",
  individual: "bg-gray-100 text-gray-700",
};

function formatRoundStage(stage?: string | null): string {
  if (!stage) return "Unknown";
  return stage
    .toString()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusDot({ status }: { status?: string | null }) {
  const color =
    status === "completed" || status === "won"
      ? "bg-green-500"
      : status === "in-progress"
        ? "bg-blue-500"
        : status === "lost"
          ? "bg-red-500"
          : "bg-gray-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function VCLinkedFundRaises({ vcId }: { vcId: number }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["fund-raises-by-vc", vcId],
    queryFn: async () => {
      try {
        const rows = await apiClient.request<any[]>(
          `/fund-raises/by-vc/${vcId}`,
        );
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        return [];
      }
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-xs text-gray-500">
          Loading tagged fund raises...
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-500" /> Tagged Fund Raises
        </div>
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {data.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {data.slice(0, 4).map((fr: any) => (
          <div
            key={fr.id}
            className="flex items-center justify-between px-2.5 py-2 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition"
            title={`${formatRoundStage(fr.round_stage)} — ${fr.investor_name || "Investor"}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/fundraise/${fr.id}`);
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <StatusDot status={fr.status} />
              <span className="text-sm font-medium text-gray-800">
                {formatRoundStage(fr.round_stage)}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-sm text-gray-600 truncate max-w-[180px]">
                {fr.investor_name || "Investor"}
              </span>
            </div>
            {fr.status && (
              <Badge
                className={`capitalize ${statusColors[fr.status as keyof typeof statusColors] || "bg-gray-100 text-gray-700"}`}
              >
                {fr.status.replace("_", " ")}
              </Badge>
            )}
          </div>
        ))}
        {data.length > 4 && (
          <div className="text-xs text-gray-500">+{data.length - 4} more</div>
        )}
      </div>
    </div>
  );
}

export default function VCDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<"vcs" | "drafts">("vcs");

  // Get user ID for partial saves
  const userId = user?.id ? parseInt(user.id) : undefined;

  // Fetch VC partial saves
  const {
    data: vcPartialSaves = [],
    isLoading: partialSavesLoading,
    refetch: refetchVCPartialSaves,
  } = useMyVCPartialSaves(userId);

  // Delete mutation for partial saves
  const deleteVC = useMutation({
    mutationFn: (vcId: number) =>
      apiClient.request(`/vc/${vcId}`, { method: "DELETE" }),
    onSuccess: () => {
      // Invalidate all VC queries with any filters
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
      console.log(
        "VC partial save deleted successfully and queries invalidated",
      );
    },
  });

  // Fetch VC data from database
  const {
    data: vcList = [],
    isLoading: vcLoading,
    error: vcError,
    refetch: refetchVCs,
  } = useQuery({
    queryKey: ["vcs", categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "all")
        params.append("investor_category", categoryFilter);

      const queryString = params.toString();
      const url = queryString ? `/vc?${queryString}` : "/vc";

      try {
        const result = await apiClient.request(url);
        return result || [];
      } catch (error) {
        console.error("Failed to fetch VCs:", error);
        // Always return empty array when any error occurs
        return [];
      }
    },
    retry: false, // Don't retry on errors, return fallback data instead
    staleTime: 30000, // 30 seconds
  });

  // Fetch VC statistics from database
  const {
    data: vcStats = { total: 0, in_progress: 0, won: 0, lost: 0 },
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["vc-stats"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc/stats");
        // Ensure we return a valid object even if the API returns null/undefined
        return result || { total: 0, in_progress: 0, won: 0, lost: 0 };
      } catch (error) {
        console.error("Failed to fetch VC stats:", error);
        // Always return default stats when any error occurs
        return { total: 0, in_progress: 0, won: 0, lost: 0 };
      }
    },
    retry: false, // Don't retry on errors, return fallback data instead
    staleTime: 60000, // 1 minute
  });

  // Fetch VC templates for quick insights
  const { data: vcTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["vc-templates-dashboard"],
    queryFn: async () => {
      try {
        const categories = await apiClient.request(
          "/templates-production/categories",
        );
        // Add null safety check for categories
        if (!categories || !Array.isArray(categories)) {
          console.warn("No categories data received");
          return [];
        }
        const vcCategory = categories.find((cat: any) => cat.name === "VC");

        if (vcCategory) {
          return await apiClient.request(
            `/templates-production/category/${vcCategory.id}`,
          );
        }
        return [];
      } catch (error) {
        console.error("Error fetching VC templates:", error);
        return [];
      }
    },
    retry: 1,
  });

  // Filter and sort VCs (status and category filtering is done server-side)
  const filteredVCs = (vcList || [])
    .filter((vc: any) => {
      // Exclude partial saves from main VC list
      if (
        vc.is_partial === true ||
        vc.investor_name === "PARTIAL_SAVE_IN_PROGRESS"
      ) {
        return false;
      }

      // Only apply search filtering on client-side since status/category are server-side
      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();
      return (
        vc.round_title?.toLowerCase().includes(searchLower) ||
        vc.vc_id?.toLowerCase().includes(searchLower) ||
        vc.investor_name?.toLowerCase().includes(searchLower) ||
        vc.contact_person?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a: any, b: any) => {
      const aValue = a[sortBy] || "";
      const bValue = b[sortBy] || "";

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const handleDeleteVC = async (vcId: number) => {
    try {
      await apiClient.request(`/vc/${vcId}`, { method: "DELETE" });
      // Invalidate all VC queries with any filters
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
      queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
      console.log("VC deleted successfully and queries invalidated");
      toast({
        title: "VC deleted",
        description: "The VC has been deleted successfully.",
      });
    } catch (error) {
      console.error("Failed to delete VC:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete VC. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResumeVCPartialSave = (partialData: any) => {
    console.log("Navigating to CreateVC with resumeData:", {
      id: partialData.id,
      _resumeFromId: partialData.id,
      roundTitle: partialData.round_title,
      country: partialData.country, // Include country in the debug log
    });
    // Navigate to create VC page with partial data (include URL param as backup)
    navigate(`/vc/create?draftId=${partialData.id}`, {
      state: { resumeData: { ...partialData, _resumeFromId: partialData.id } },
    });
  };

  const handleDeleteVCPartialSave = async (
    partialSaveId: number,
    partialSaveName: string,
  ) => {
    try {
      await deleteVC.mutateAsync(partialSaveId);
      console.log(`Draft ${partialSaveName} deleted successfully`);
      toast({
        title: "Draft deleted",
        description: `${partialSaveName} has been deleted.`,
      });
      // Refresh partial saves
      refetchVCPartialSaves();
    } catch (error) {
      console.error("Failed to delete draft:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete draft. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getVCPartialSaveInfo = (partialSave: any) => {
    try {
      const notes = JSON.parse(partialSave.notes || "{}");
      return {
        lastSaved: notes.lastSaved || partialSave.created_at,
        completedTabs: notes.completedTabs || [],
      };
    } catch (error) {
      return {
        lastSaved: partialSave.created_at,
        completedTabs: [],
      };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "in-progress":
        return <Clock className="w-4 h-4" />;
      case "won":
        return <CheckCircle className="w-4 h-4" />;
      case "lost":
        return <XCircle className="w-4 h-4" />;
      case "completed":
        return <Target className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getSourceIcon = (source: string) => {
    const IconComponent =
      sourceIcons[source as keyof typeof sourceIcons] || Zap;
    return <IconComponent className="w-4 h-4" />;
  };

  const formatCurrency = (amount: string, currency: string = "INR") => {
    if (!amount) return "N/A";

    // If amount already includes a currency symbol, return as is
    if (
      amount.includes("$") ||
      amount.includes("₹") ||
      amount.includes("د.إ")
    ) {
      return amount;
    }

    const symbol = currency === "USD" ? "$" : currency === "AED" ? "د.إ" : "₹";
    return `${symbol}${amount}`;
  };

  if (vcError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Failed to Load VC Data
            </h3>
            <p className="text-gray-600 mb-4">
              There was an error loading the VC dashboard.
            </p>
            <Button onClick={() => refetchVCs()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">VC Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Manage venture capital funding rounds
          </p>
        </div>
        <Button onClick={() => navigate("/vc/create")}>
          <Plus className="w-4 h-4 mr-2" />
          Create VC
        </Button>
      </div>

      {/* Statistics Cards - Enhanced with Gradients */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-4 bg-gray-300 rounded animate-pulse mb-2"></div>
                    <div className="h-8 bg-gray-300 rounded animate-pulse"></div>
                  </div>
                  <div className="bg-gray-200 p-3 rounded-full">
                    <div className="w-6 h-6 bg-gray-300 rounded animate-pulse"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : statsError ? (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">Failed to load statistics</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 text-sm font-medium">Total VCs</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {vcStats?.total || 0}
                  </p>
                </div>
                <div className="bg-blue-200 p-3 rounded-full">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-600 text-sm font-medium">
                    In Progress
                  </p>
                  <p className="text-2xl font-bold text-orange-900">
                    {vcStats?.in_progress || 0}
                  </p>
                </div>
                <div className="bg-orange-200 p-3 rounded-full">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 text-sm font-medium">
                    Successful Rounds
                  </p>
                  <p className="text-2xl font-bold text-green-900">
                    {vcStats?.won || 0}
                  </p>
                </div>
                <div className="bg-green-200 p-3 rounded-full">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-600 text-sm font-medium">
                    VC Templates
                  </p>
                  <p className="text-2xl font-bold text-purple-900">
                    {(vcTemplates || []).length}
                  </p>
                </div>
                <div className="bg-purple-200 p-3 rounded-full">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters - Only show for VCs tab */}
      {activeTab === "vcs" && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search VCs, investors, or round titles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Filter by VC Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All VC Types</SelectItem>
                  {VC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={`${sortBy}-${sortOrder}`}
                onValueChange={(value) => {
                  const [field, order] = value.split("-");
                  setSortBy(field);
                  setSortOrder(order as "asc" | "desc");
                }}
              >
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Newest First</SelectItem>
                  <SelectItem value="created_at-asc">Oldest First</SelectItem>
                  <SelectItem value="round_title-asc">Round A-Z</SelectItem>
                  <SelectItem value="round_title-desc">Round Z-A</SelectItem>
                  <SelectItem value="investor_name-asc">
                    Investor A-Z
                  </SelectItem>
                  <SelectItem value="investor_name-desc">
                    Investor Z-A
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Navigation */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant={activeTab === "vcs" ? "default" : "outline"}
              onClick={() => setActiveTab("vcs")}
              className="flex items-center gap-2"
            >
              <Target className="w-4 h-4" />
              VCs ({(filteredVCs || []).length})
            </Button>
            <Button
              variant={activeTab === "drafts" ? "default" : "outline"}
              onClick={() => setActiveTab("drafts")}
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Saved Drafts ({(vcPartialSaves || []).length})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Content based on active tab */}
      {activeTab === "vcs" ? (
        <Card>
          <CardContent className="p-6">
            {vcLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Loading VCs...</p>
              </div>
            ) : (filteredVCs || []).length > 0 ? (
              <div className="space-y-4">
                {(filteredVCs || []).map((vc: any) => (
                  <div
                    key={vc.id}
                    className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => navigate(`/vc/${vc.id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10 bg-blue-100 text-blue-700">
                            <AvatarFallback>
                              {((vc.investor_name || "VC").match(/\b\w/g) || [])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {vc.investor_name || "Unknown VC"}
                              </h3>
                            </div>

                            <div className="mt-1 text-sm text-gray-700 flex flex-wrap gap-4">
                              <span>
                                Venture Capital Name:{" "}
                                <span className="font-medium">
                                  {vc.investor_name || "N/A"}
                                </span>
                              </span>
                              <span>
                                VC Type:{" "}
                                <span className="font-medium capitalize">
                                  {(vc.investor_category || "N/A").replace(
                                    "_",
                                    " ",
                                  )}
                                </span>
                              </span>
                              <span>
                                Sector Focus:{" "}
                                <span className="font-medium">
                                  {getSectorLabel(vc.industry) || "N/A"}
                                </span>
                              </span>
                              <span>
                                Source:{" "}
                                <span className="font-medium capitalize">
                                  {vc.lead_source?.replace("-", " ") || "N/A"}
                                </span>
                              </span>
                              {vc.website && (
                                <a
                                  href={vc.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-medium"
                                >
                                  Website
                                </a>
                              )}
                            </div>

                            {/* Tagged Fund Raises for this VC */}
                            <VCLinkedFundRaises vcId={vc.id} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/vc/${vc.id}`);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/vc/${vc.id}/edit`);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete VC Opportunity
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "
                                {vc.round_title}
                                "? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteVC(vc.id);
                                }}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No VCs Found
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm || categoryFilter !== "all"
                    ? "Try adjusting your filters or search terms."
                    : "Get started by creating your first VC round."}
                </p>
                <Button onClick={() => navigate("/vc/create")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create VC
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : /* Saved Drafts Tab */
      partialSavesLoading ? (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Loading saved drafts...</p>
          </CardContent>
        </Card>
      ) : (vcPartialSaves || []).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Saved Drafts
            </h3>
            <p className="text-gray-600 mb-4">
              Draft VCs will appear here when you save your progress using the
              "Save Draft" button while creating a VC.
            </p>
            <Button onClick={() => navigate("/vc/create")}>
              <Plus className="w-4 h-4 mr-2" />
              Create VC
            </Button>
          </CardContent>
        </Card>
      ) : (
        (vcPartialSaves || []).map((partialSave: any) => {
          const info = getVCPartialSaveInfo(partialSave);
          const lastSaved = new Date(info.lastSaved);
          const formatDateForInput = (dateString: string) => {
            if (!dateString) return "";
            const date = new Date(dateString);
            return date.toISOString().split("T")[0];
          };

          return (
            <Card
              key={partialSave.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {partialSave.investor_name ===
                        "PARTIAL_SAVE_IN_PROGRESS"
                          ? "Unsaved VC Draft"
                          : partialSave.round_title || "Untitled VC Draft"}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                        <span>
                          Last saved:{" "}
                          {lastSaved.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {partialSave.investor_name &&
                        partialSave.investor_name !==
                          "PARTIAL_SAVE_IN_PROGRESS" && (
                          <>
                            <span className="text-gray-600">Investor: </span>
                            <span className="text-blue-600">
                              {partialSave.investor_name}
                            </span>
                          </>
                        )}

                      {partialSave.lead_source && (
                        <>
                          <span className="text-gray-600">Source: </span>
                          <span className="capitalize">
                            {partialSave.lead_source.replace("-", " ")}
                          </span>
                        </>
                      )}
                    </div>

                    {partialSave.round_description && (
                      <div className="mb-3">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {partialSave.round_description}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        try {
                          const resumeData = {
                            ...partialSave,
                            id: partialSave.id,
                            _resumeFromId: partialSave.id,
                            _lastSaved: info.lastSaved,
                          };

                          handleResumeVCPartialSave(resumeData);
                        } catch (error) {
                          console.error(
                            "Error resuming VC partial save:",
                            error,
                          );
                          toast({
                            title: "Resume failed",
                            description:
                              "Error resuming draft. Please try again or create a new VC.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Continue
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Draft</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this saved draft?
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              handleDeleteVCPartialSave(
                                partialSave.id,
                                partialSave.investor_name ===
                                  "PARTIAL_SAVE_IN_PROGRESS"
                                  ? "Unsaved VC Draft"
                                  : partialSave.round_title ||
                                      "Untitled VC Draft",
                              )
                            }
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="text-sm text-gray-500">
                  Created: {formatToIST(partialSave.created_at)}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
