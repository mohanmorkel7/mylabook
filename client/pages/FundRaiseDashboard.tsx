import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useMyVCPartialSaves } from "@/hooks/useApi";
import { useSafeResizeObserver } from "@/hooks/useSafeResizeObserver";
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
  Plus,
  TrendingUp,
  Target,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  BarChart3,
  DollarSign,
  Calendar,
  Settings,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const statusColors: Record<string, string> = {
  "in-progress": "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  completed: "bg-purple-100 text-purple-700",
};

const UI_STATUS_TO_INTERNAL: Record<string, string> = {
  WIP: "in-progress",
  Closed: "completed",
  Dropped: "lost",
};

export default function FundRaiseDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeTab] = useState<"vcs" | "drafts">("vcs");
  const [chartHeight, setChartHeight] = useState(500);
  const [colWidth, setColWidth] = useState(120);
  const [selectedStage, setSelectedStage] = useState<string>("bridge");
  const ROUND_STAGES = [
    { value: "pre_seed", label: "Pre seed" },
    { value: "seed", label: "Seed" },
    { value: "bridge_1", label: "Bridge 1" },
    { value: "bridge_2", label: "Bridge 2" },
    { value: "bridge", label: "Bridge" },
    { value: "pre_series_a", label: "Pre Series A" },
    { value: "series_a", label: "Series A" },
    { value: "series_b", label: "Series B" },
    { value: "series_c", label: "Series C" },
  ];

  const [configOpen, setConfigOpen] = useState(false);
  const [configStage, setConfigStage] = useState<string>("bridge");
  const [configTargetMn, setConfigTargetMn] = useState<string>("");

  const { data: stageTargets = [], refetch: refetchStageTargets } = useQuery({
    queryKey: ["fr-stage-targets"],
    queryFn: async () => {
      try {
        const r = await apiClient.request("/fund-raises/stage-targets");
        return Array.isArray(r) ? r : [];
      } catch {
        return [];
      }
    },
    retry: 0,
    staleTime: 60000,
  });

  useEffect(() => {
    setConfigStage(selectedStage || "bridge");
    const found = (stageTargets || []).find(
      (t: any) => t.stage === (selectedStage || "bridge"),
    );
    setConfigTargetMn(found?.target_mn || "");
  }, [selectedStage, stageTargets]);

  const saveStageTarget = useMutation({
    mutationFn: (payload: { stage: string; target_mn: string }) =>
      apiClient.request("/fund-raises/stage-targets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fr-stage-targets"] });
      refetchStageTargets();
    },
  });

  const SHOW_PROGRESS_DASHBOARD = false;

  const userId = user?.id ? parseInt(user.id) : undefined;

  const { data: vcPartialSaves = [], refetch: refetchVCPartialSaves } =
    useMyVCPartialSaves(userId);

  const deleteVC = useMutation({
    mutationFn: (vcId: number) =>
      apiClient.request(`/vc/${vcId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
    },
  });

  const {
    data: vcList = [],
    refetch: refetchVCs,
    error: vcError,
    isLoading: vcLoading,
  } = useQuery({
    queryKey: ["vcs", statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "all")
        params.append("investor_category", categoryFilter);
      const queryString = params.toString();
      const url = queryString ? `/vc?${queryString}` : "/vc";
      try {
        const result = await apiClient.request(url);
        return result || [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const {
    data: vcStats = { total: 0, in_progress: 0, won: 0, lost: 0 },
    error: statsError,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: ["vc-stats"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc/stats");
        return result || { total: 0, in_progress: 0, won: 0, lost: 0 };
      } catch {
        return { total: 0, in_progress: 0, won: 0, lost: 0 };
      }
    },
    retry: false,
    staleTime: 60000,
  });

  // Fetch Fund Raises list from dedicated table
  const {
    data: fundRaises = [],
    isLoading: fundRaisesLoading,
    error: fundRaisesError,
  } = useQuery({
    queryKey: ["fund-raises"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/fund-raises");
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30000,
  });

  useEffect(() => {
    const stages = Array.from(
      new Set((fundRaises || []).map((f: any) => f.round_stage || "unknown")),
    );
    if (!stages.length) return;
    if (!stages.includes(selectedStage)) {
      if (stages.includes("bridge")) setSelectedStage("bridge");
      else setSelectedStage(stages[0]);
    }
  }, [fundRaises]);

  const filteredFundRaises = (fundRaises || [])
    .filter((fr: any) => {
      // Status filter using UI values mapped to internal
      if (statusFilter !== "all") {
        const internalStatus =
          fr.status ||
          UI_STATUS_TO_INTERNAL[fr.ui_status || ""] ||
          "in-progress";
        const targetInternal =
          UI_STATUS_TO_INTERNAL[statusFilter] || statusFilter.toLowerCase();
        if (internalStatus !== targetInternal) return false;
      }
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return (
        (fr.investor_name || "").toLowerCase().includes(s) ||
        (fr.reason || "").toLowerCase().includes(s) ||
        (fr.round_stage || "").toLowerCase().includes(s)
      );
    })
    .sort((a: any, b: any) => {
      const aValue = a[sortBy] || "";
      const bValue = b[sortBy] || "";
      return sortOrder === "asc"
        ? aValue > bValue
          ? 1
          : -1
        : aValue < bValue
          ? 1
          : -1;
    });

  const { data: vcProgressData = [], isLoading: progressLoading } = useQuery({
    queryKey: ["fund-raises-progress"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/fund-raises/progress");
        return result || [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const chartContainerRef = useSafeResizeObserver<HTMLDivElement>(
    (entries) => {
      if (entries[0]) {
        const width = entries[0].contentRect.width;
        const responsiveHeight = Math.max(
          500,
          Math.min(600, Math.round(width * 0.5)),
        );
        setChartHeight(responsiveHeight);
        const total = (vcProgressData || []).length || 1;
        const targetCols = Math.min(total, 8);
        const newColWidth = Math.max(
          90,
          Math.min(160, Math.floor((width - 200) / targetCols)),
        );
        setColWidth(newColWidth);
      }
    },
    { debounce: 150 },
  );

  const {
    data: vcFollowUps = [],
    isLoading: followUpsLoading,
    refetch: refetchFollowUps,
  } = useQuery({
    queryKey: ["vc-follow-ups"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc/follow-ups");
        return result || [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30000,
    refetchOnMount: true,
  });

  const { data: vcTemplates = [] } = useQuery({
    queryKey: ["vc-templates-dashboard"],
    queryFn: async () => {
      try {
        const categories = await apiClient.request(
          "/templates-production/categories",
        );
        if (!categories || !Array.isArray(categories)) return [];
        const vcCategory = categories.find((cat: any) => cat.name === "VC");
        if (vcCategory)
          return await apiClient.request(
            `/templates-production/category/${vcCategory.id}`,
          );
        return [];
      } catch {
        return [];
      }
    },
    retry: 1,
  });

  const filteredVCs = (vcList || [])
    .filter((vc: any) => {
      if (
        vc.is_partial === true ||
        vc.investor_name === "PARTIAL_SAVE_IN_PROGRESS"
      )
        return false;
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
      return sortOrder === "asc"
        ? aValue > bValue
          ? 1
          : -1
        : aValue < bValue
          ? 1
          : -1;
    });

  if (vcError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-6 text-center">
                Failed to load data
              </CardContent>
            </Card>
            <Button onClick={() => refetchVCs()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Fund Raise Dashboard
          </h1>
          <p className="text-gray-600 mt-1">Manage fund raises</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfigOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Config
          </Button>
          <Button onClick={() => navigate("/fundraise/create")}>
            <Plus className="w-4 h-4 mr-2" />
            Create Fund Raise
          </Button>
        </div>

        <AlertDialog open={configOpen} onOpenChange={setConfigOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Configure Target by Investment Stage
              </AlertDialogTitle>
              <AlertDialogDescription>
                Select an investment stage and set the Target value in Mn.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div>
                <div className="text-sm mb-1">Investment Stage</div>
                <Select
                  value={configStage}
                  onValueChange={(v) => {
                    setConfigStage(v);
                    const found = (stageTargets || []).find(
                      (t: any) => t.stage === v,
                    );
                    setConfigTargetMn(found?.target_mn || "");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select investment stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUND_STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-sm mb-1">Target value in Mn</div>
                <Input
                  placeholder="e.g. 5.00"
                  value={configTargetMn}
                  onChange={(e) => setConfigTargetMn(e.target.value)}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfigOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await saveStageTarget.mutateAsync({
                    stage: configStage,
                    target_mn: configTargetMn || "0",
                  });
                  setConfigOpen(false);
                }}
              >
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
            >
              <CardContent className="p-6">
                <div className="h-16 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : statsError ? (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-6 text-center">
            Failed to load statistics
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">
                  Total Fund Raises
                </p>
                <p className="text-2xl font-bold text-blue-900">
                  {vcStats?.total || 0}
                </p>
              </div>
              <div className="bg-blue-200 p-3 rounded-full">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-6 flex items-center justify-between">
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
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Successful</p>
                <p className="text-2xl font-bold text-green-900">
                  {vcStats?.won || 0}
                </p>
              </div>
              <div className="bg-green-200 p-3 rounded-full">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6 flex items-center justify-between">
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
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "vcs" && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search fund raises..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="WIP">WIP</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                  <SelectItem value="Dropped">Dropped</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={`${sortBy}-${sortOrder}`}
                onValueChange={(value) => {
                  const [field, order] = value.split("-");
                  setSortBy(field);
                  setSortOrder(order as any);
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

      {SHOW_PROGRESS_DASHBOARD &&
        (() => {
          if (progressLoading) {
            return (
              <Card className="max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" /> Fund Raise Progress
                    Dashboard
                  </CardTitle>
                  <CardDescription>Loading progress data...</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
                </CardContent>
              </Card>
            );
          }
          if ((vcProgressData || []).length === 0) return null;
          return (
            <Card className="max-w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> Fund Raise Progress
                  Dashboard
                </CardTitle>
                <CardDescription>
                  Track each fund raise's current stage and step progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const allCompletedSteps = (vcProgressData || []).flatMap(
                    (vc: any) => vc.completed_steps || [],
                  );
                  const maxProbability =
                    allCompletedSteps.length > 0
                      ? Math.max(
                          ...allCompletedSteps.map((s: any) => s.probability),
                        )
                      : 100;

                  const stepOrderMap = new Map<string, number>();
                  const allStepsSet = new Set<string>();

                  (vcProgressData || []).forEach((vc: any) => {
                    if (vc.all_steps && Array.isArray(vc.all_steps)) {
                      vc.all_steps.forEach((step: any, index: number) => {
                        if (step.name) {
                          allStepsSet.add(step.name);
                          if (!stepOrderMap.has(step.name)) {
                            stepOrderMap.set(step.name, index);
                          }
                        }
                      });
                    }
                  });

                  let allSteps: string[];
                  if (allStepsSet.size === 0) {
                    allSteps = [
                      "Initial Pitch",
                      "Product Demo",
                      "Due Diligence",
                      "Term Sheet",
                      "Legal Review",
                      "Final Approval",
                    ];
                  } else {
                    allSteps = Array.from(allStepsSet).sort((a, b) => {
                      const orderA = stepOrderMap.get(a) ?? 999;
                      const orderB = stepOrderMap.get(b) ?? 999;
                      return orderA - orderB;
                    });
                  }

                  const stepColors = [
                    "#fca5a5",
                    "#fdba74",
                    "#fde047",
                    "#86efac",
                    "#67e8f9",
                    "#93c5fd",
                    "#c4b5fd",
                    "#f9a8d4",
                  ];

                  const getStepColor = (stepIndex: number) => {
                    return stepColors[stepIndex % stepColors.length];
                  };

                  return (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div
                          ref={chartContainerRef}
                          className="bg-gray-50 p-4 rounded-lg pb-4"
                        >
                          <div className="text-sm font-medium text-gray-700 mb-4">
                            All Fund Raises Progress Overview (
                            {(vcProgressData || []).length} rounds)
                          </div>
                          <div
                            className="w-full overflow-x-auto overflow-y-hidden"
                            style={{ height: "500px" }}
                          >
                            <div className="w-full">
                              <div
                                className="flex"
                                style={{ height: `${chartHeight}px` }}
                              >
                                <div
                                  className="w-48 pr-4 flex flex-col"
                                  style={{ height: `${chartHeight}px` }}
                                >
                                  {allSteps
                                    .slice()
                                    .reverse()
                                    .map((stepName: string) => {
                                      const stepHeight =
                                        chartHeight / allSteps.length;
                                      return (
                                        <div
                                          key={stepName}
                                          className="flex items-center justify-end text-right border-b border-gray-200"
                                          style={{ height: `${stepHeight}px` }}
                                        >
                                          <span className="text-sm font-medium text-gray-700">
                                            {stepName}
                                          </span>
                                        </div>
                                      );
                                    })}
                                </div>

                                <div
                                  className="relative flex-1 pb-28 overflow-y-hidden"
                                  style={{
                                    height: `${chartHeight}px`,
                                    minWidth: `${Math.max((vcProgressData || []).length * colWidth, 800)}px`,
                                  }}
                                >
                                  <div className="absolute left-0 right-0 top-0 bottom-28">
                                    {allSteps.map(
                                      (stepName: string, index: number) => {
                                        const stepHeight =
                                          chartHeight / allSteps.length;
                                        const yPosition =
                                          (allSteps.length - 1 - index) *
                                          stepHeight;
                                        return (
                                          <div
                                            key={stepName}
                                            className="absolute w-full border-b border-gray-200"
                                            style={{
                                              top: `${yPosition}px`,
                                              height: `${stepHeight}px`,
                                            }}
                                          />
                                        );
                                      },
                                    )}
                                  </div>

                                  <div
                                    className="absolute left-0 right-0 top-0 bottom-28 grid"
                                    style={{
                                      paddingTop: "0px",
                                      gridTemplateColumns: `repeat(${(vcProgressData || []).length}, ${colWidth}px)`,
                                    }}
                                  >
                                    {(vcProgressData || []).map(
                                      (vcProgress: any) => {
                                        return (
                                          <div
                                            key={vcProgress.vc_id}
                                            className="relative w-full"
                                          >
                                            {(
                                              vcProgress.completed_steps || []
                                            ).map((step: any) => {
                                              const stepIndex =
                                                allSteps.indexOf(step.name);
                                              if (stepIndex === -1) return null;
                                              const stepHeight =
                                                chartHeight / allSteps.length;
                                              const yPosition =
                                                (allSteps.length -
                                                  1 -
                                                  stepIndex) *
                                                stepHeight;
                                              return (
                                                <div
                                                  key={step.name}
                                                  className="absolute left-1/2 transform -translate-x-1/2 w-8 rounded transition-all duration-300 cursor-pointer group flex items-center justify-center"
                                                  style={{
                                                    top: `${yPosition}px`,
                                                    height: `${stepHeight}px`,
                                                    backgroundColor:
                                                      getStepColor(stepIndex),
                                                    opacity: 0.8,
                                                  }}
                                                  title={`${vcProgress.round_title}: ${step.name} - ${step.probability}% (Completed)`}
                                                >
                                                  <span className="text-xs font-bold text-gray-800">
                                                    {step.probability}%
                                                  </span>
                                                </div>
                                              );
                                            })}

                                            {vcProgress.current_step &&
                                              (() => {
                                                const stepIndex =
                                                  allSteps.indexOf(
                                                    vcProgress.current_step
                                                      .name,
                                                  );
                                                if (stepIndex === -1)
                                                  return null;
                                                const stepHeight =
                                                  chartHeight / allSteps.length;
                                                const yPosition =
                                                  (allSteps.length -
                                                    1 -
                                                    stepIndex) *
                                                  stepHeight;
                                                return (
                                                  <div
                                                    className="absolute left-1/2 transform -translate-x-1/2 w-8 rounded border-2 border-blue-600 transition-all duration-300 cursor-pointer group flex items-center justify-center"
                                                    style={{
                                                      top: `${yPosition}px`,
                                                      height: `${stepHeight}px`,
                                                      backgroundColor:
                                                        getStepColor(stepIndex),
                                                      opacity: 1,
                                                    }}
                                                    title={`${vcProgress.round_title}: ${vcProgress.current_step.name} - ${vcProgress.current_step.probability}% (Current)`}
                                                  >
                                                    <span className="text-xs font-bold text-gray-800">
                                                      {
                                                        vcProgress.current_step
                                                          .probability
                                                      }
                                                      %
                                                    </span>
                                                  </div>
                                                );
                                              })()}
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>

                                  <div
                                    className="absolute left-0 right-0 bottom-0 grid pointer-events-none"
                                    style={{
                                      gridTemplateColumns: `repeat(${(vcProgressData || []).length}, ${colWidth}px)`,
                                    }}
                                  >
                                    {(vcProgressData || []).map(
                                      (vcProgress: any) => (
                                        <div
                                          key={vcProgress.vc_id}
                                          className="text-center w-full px-1 overflow-hidden"
                                        >
                                          <div
                                            className="text-xs font-medium text-gray-700 mb-1 truncate"
                                            title={vcProgress.round_title}
                                          >
                                            {vcProgress.round_title}
                                          </div>
                                          <div className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full mb-1 inline-block">
                                            {
                                              vcProgress.total_completed_probability
                                            }
                                            %
                                          </div>
                                          <div
                                            className="text-sm font-semibold text-gray-800 truncate"
                                            title={vcProgress.investor_name}
                                          >
                                            {vcProgress.investor_name}
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg overflow-hidden">
                          <div className="text-sm font-medium text-gray-700 mb-4">
                            Step-wise Distribution - VC Count by Step
                          </div>
                          <div>
                            <div>
                              {(() => {
                                const stepDistribution = allSteps.map(
                                  (stepName: string) => {
                                    const currentVCsCount = (
                                      vcProgressData || []
                                    ).filter(
                                      (vc: any) =>
                                        vc.current_step?.name === stepName,
                                    ).length;
                                    const totalVCsAtStep = currentVCsCount;
                                    return {
                                      stepName,
                                      currentVCsCount,
                                      completedVCsCount: 0,
                                      totalVCsAtStep,
                                      stepIndex: allSteps.indexOf(stepName),
                                    };
                                  },
                                );

                                const maxVCsAtStep = Math.max(
                                  ...stepDistribution.map(
                                    (s) => s.totalVCsAtStep,
                                  ),
                                  1,
                                );

                                return (
                                  <div
                                    className="flex"
                                    style={{ height: `${chartHeight}px` }}
                                  >
                                    <div
                                      className="w-48 pr-4 flex flex-col"
                                      style={{ height: `${chartHeight}px` }}
                                    >
                                      {allSteps
                                        .slice()
                                        .reverse()
                                        .map((stepName: string) => {
                                          const stepHeight =
                                            chartHeight / allSteps.length;
                                          return (
                                            <div
                                              key={stepName}
                                              className="flex items-center justify-end text-right border-b border-gray-200"
                                              style={{
                                                height: `${stepHeight}px`,
                                              }}
                                            >
                                              <span className="text-sm font-medium text-gray-700">
                                                {stepName}
                                              </span>
                                            </div>
                                          );
                                        })}
                                    </div>

                                    <div
                                      className="relative flex-1"
                                      style={{ height: `${chartHeight}px` }}
                                    >
                                      <div className="absolute inset-0">
                                        {allSteps.map(
                                          (stepName: string, index: number) => {
                                            const stepHeight =
                                              chartHeight / allSteps.length;
                                            const yPosition =
                                              (allSteps.length - 1 - index) *
                                              stepHeight;
                                            return (
                                              <div
                                                key={stepName}
                                                className="absolute w-full border-b border-gray-200"
                                                style={{
                                                  top: `${yPosition}px`,
                                                  height: `${stepHeight}px`,
                                                }}
                                              />
                                            );
                                          },
                                        )}
                                      </div>

                                      <div className="absolute inset-0">
                                        {stepDistribution.map((stepData) => {
                                          const stepIndex = allSteps.indexOf(
                                            stepData.stepName,
                                          );
                                          const stepHeight =
                                            chartHeight / allSteps.length;
                                          const yPosition =
                                            (allSteps.length - 1 - stepIndex) *
                                            stepHeight;
                                          const barWidth =
                                            (stepData.totalVCsAtStep /
                                              maxVCsAtStep) *
                                            85;
                                          return (
                                            <div key={stepData.stepName}>
                                              <div
                                                className="absolute rounded transition-all duration-300 cursor-pointer group"
                                                style={{
                                                  top: `${yPosition + stepHeight * 0.2}px`,
                                                  left: "10px",
                                                  height: `${stepHeight * 0.6}px`,
                                                  width: `${Math.max(barWidth, 5)}%`,
                                                  backgroundColor:
                                                    getStepColor(stepIndex),
                                                  opacity: 0.8,
                                                }}
                                                title={`${stepData.stepName}: ${stepData.totalVCsAtStep} Fund Raises in progress`}
                                              >
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                  <span className="text-xs font-bold text-gray-800">
                                                    {stepData.totalVCsAtStep}
                                                  </span>
                                                </div>
                                                <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-pre-wrap z-20 pointer-events-none max-w-xs">
                                                  {(() => {
                                                    const names = (
                                                      vcProgressData || []
                                                    )
                                                      .filter(
                                                        (vc: any) =>
                                                          vc.current_step
                                                            ?.name ===
                                                          stepData.stepName,
                                                      )
                                                      .map(
                                                        (vc: any) =>
                                                          vc.investor_name ||
                                                          vc.round_title,
                                                      )
                                                      .slice(0, 20);
                                                    return `${stepData.stepName}: ${stepData.totalVCsAtStep} Fund Raises\n- ${names.join("\n- ")}`;
                                                  })()}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="bg-green-50 p-3 rounded-lg">
                            <div className="text-sm font-medium text-green-800">
                              Total Completed Steps
                            </div>
                            <div className="text-2xl font-bold text-green-900">
                              {(vcProgressData || []).reduce(
                                (sum: number, vc: any) =>
                                  sum + (vc.completed_count || 0),
                                0,
                              )}
                            </div>
                          </div>

                          <div className="bg-blue-50 p-3 rounded-lg">
                            <div className="text-sm font-medium text-blue-800">
                              Active Fund Raises
                            </div>
                            <div className="text-2xl font-bold text-blue-900">
                              {
                                (vcProgressData || []).filter(
                                  (vc: any) => vc.current_step,
                                ).length
                              }
                            </div>
                          </div>

                          <div className="bg-orange-50 p-3 rounded-lg">
                            <div className="text-sm font-medium text-orange-800">
                              Avg Progress
                            </div>
                            <div className="text-2xl font-bold text-orange-900">
                              {(() => {
                                const avgProgress =
                                  (vcProgressData || []).length > 0
                                    ? Math.round(
                                        (vcProgressData || []).reduce(
                                          (sum: number, vc: any) =>
                                            sum +
                                            (vc.total_completed_probability ||
                                              0),
                                          0,
                                        ) / (vcProgressData || []).length,
                                      )
                                    : 0;
                                return avgProgress;
                              })()}
                              %
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })()}

      {/* Fund Projects Details section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between w-full gap-4">
            <div>
              <CardTitle>Fund Projects Details</CardTitle>
              <CardDescription>Summary by Investment Stage</CardDescription>
            </div>

            <div className="w-56">
              {/* Investment Stage selector */}
              {(() => {
                const rawStages = Array.from(
                  new Set(
                    (fundRaises || []).map(
                      (f: any) => f.round_stage || "unknown",
                    ),
                  ),
                );

                const formatStageLabel = (s: string) => {
                  if (!s) return "Unknown";
                  return s
                    .replaceAll("_", " ")
                    .split(" ")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ")
                    .replace(/\s+(\d+)$/, " $1");
                };

                const stages = rawStages;

                return (
                  <Select
                    value={selectedStage}
                    onValueChange={setSelectedStage}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Investment Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s: string) => (
                        <SelectItem key={s} value={s}>
                          {formatStageLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {(() => {
            const stageKey = selectedStage || "bridge";
            const filtered = (fundRaises || []).filter(
              (fr: any) => (fr.round_stage || "unknown") === stageKey,
            );

            const computeTotalForRound = (fr: any, excludePass = false) => {
              let totalFundMn = 0;
              const investorList =
                Array.isArray(fr.investors) && fr.investors.length
                  ? fr.investors
                  : fr.investor_name
                    ? [
                        {
                          investor_name: fr.investor_name,
                          fund_mn: fr.fund_mn,
                          investor_status: fr.investor_status,
                          vc_id: fr.vc_id,
                        },
                      ]
                    : [];

              if (investorList.length) {
                investorList.forEach((iv: any) => {
                  if (
                    excludePass &&
                    (iv.investor_status || "").toLowerCase() === "pass"
                  )
                    return;
                  const v = parseFloat(iv?.fund_mn ?? "");
                  if (!isNaN(v)) totalFundMn += v;
                });
              } else {
                // No investor breakdown - only include fallback when not excluding pass
                if (!excludePass) {
                  const fallback = parseFloat(
                    fr.total_raise_mn || fr.fund_mn || 0,
                  );
                  totalFundMn = isNaN(fallback) ? 0 : fallback;
                } else {
                  totalFundMn = 0;
                }
              }

              return totalFundMn;
            };

            // Total should exclude 'pass' investor amounts
            const targeted = filtered.reduce((sum: number, fr: any) => {
              return sum + computeTotalForRound(fr, true);
            }, 0);

            const valuationValues = filtered
              .map((fr: any) => parseFloat(fr.valuation_mn || ""))
              .filter((v: number) => !isNaN(v));
            const valuation = valuationValues.length
              ? valuationValues.reduce((a: number, b: number) => a + b, 0) /
                valuationValues.length
              : 0;

            // VCs list (flatten investors)
            const vcEntries: { name: string; fund: number; vc_id?: string }[] =
              [];
            filtered.forEach((fr: any) => {
              const investors =
                Array.isArray(fr.investors) && fr.investors.length
                  ? fr.investors
                  : [];
              investors.forEach((iv: any) => {
                const fund = parseFloat(iv?.fund_mn ?? "0");
                if (!isNaN(fund))
                  vcEntries.push({
                    name: iv.investor_name || iv.vc_name || "Unknown",
                    fund,
                    vc_id: iv.vc_id,
                  });
              });
            });

            const totalVcFunds = vcEntries.reduce((s, e) => s + e.fund, 0);

            // Completed 100% and Committed 90% using vcProgressData mapping to fundRaises by fr_id
            const completed100: { name: string; fund: number; id?: number }[] =
              [];
            const committed90: { name: string; fund: number; id?: number }[] =
              [];

            const filteredIds = new Set((filtered || []).map((f: any) => f.id));

            (vcProgressData || []).forEach((p: any) => {
              if (!filteredIds.has(p.fr_id)) return;
              const prog = Number(p.total_completed_probability || 0);
              const fr = (filtered || []).find((f: any) => f.id === p.fr_id);
              if (!fr) return;
              // Exclude 'pass' amounts from completed/committed totals
              const fundVal = computeTotalForRound(fr, true);
              // Skip fund raises that have no non-pass contribution
              if (fundVal > 0) {
                if (prog >= 100)
                  completed100.push({
                    name:
                      fr.round_title || fr.investor_name || `Round ${fr.id}`,
                    fund: fundVal,
                    id: fr.id,
                  });
                else if (prog >= 90)
                  committed90.push({
                    name:
                      fr.round_title || fr.investor_name || `Round ${fr.id}`,
                    fund: fundVal,
                    id: fr.id,
                  });
              }
            });

            const totalCompleted100 = completed100.reduce(
              (s, e) => s + e.fund,
              0,
            );
            const totalCommitted90 = committed90.reduce(
              (s, e) => s + e.fund,
              0,
            );

            // Buckets: <=20, >20-<=40, >40-<=70 based on total_completed_probability
            const buckets: Record<
              string,
              {
                title: string;
                items: { name: string; fund: number; id?: number }[];
              }
            > = {
              "0-20": { title: "20%", items: [] },
              "21-40": { title: "40%", items: [] },
              "41-70": { title: "70%", items: [] },
            };

            (vcProgressData || []).forEach((p: any) => {
              if (!filteredIds.has(p.fr_id)) return;
              const prog = Number(p.total_completed_probability || 0);
              const fr = (filtered || []).find((f: any) => f.id === p.fr_id);
              if (!fr) return;
              // Exclude 'pass' amounts from bucket totals
              const val = computeTotalForRound(fr, true);
              // Skip adding entries that have no non-pass contribution
              if (val > 0) {
                if (prog <= 20)
                  buckets["0-20"].items.push({
                    name:
                      fr.round_title || fr.investor_name || `Round ${fr.id}`,
                    fund: val,
                    id: fr.id,
                  });
                else if (prog <= 40)
                  buckets["21-40"].items.push({
                    name:
                      fr.round_title || fr.investor_name || `Round ${fr.id}`,
                    fund: val,
                    id: fr.id,
                  });
                else if (prog <= 70)
                  buckets["41-70"].items.push({
                    name:
                      fr.round_title || fr.investor_name || `Round ${fr.id}`,
                    fund: val,
                    id: fr.id,
                  });
              }
            });

            // Pass status investors (only in selected stage)
            const passList: { name: string; fund: number; id?: number }[] = [];
            (filtered || []).forEach((fr: any) => {
              const investors = Array.isArray(fr.investors) ? fr.investors : [];
              investors.forEach((iv: any) => {
                if ((iv.investor_status || "").toLowerCase() === "pass") {
                  const fund = parseFloat(iv?.fund_mn ?? "0");
                  if (!isNaN(fund))
                    passList.push({
                      name: iv.investor_name || iv.vc_name || "Unknown",
                      fund,
                      id: fr.id,
                    });
                }
              });
            });

            const totalPass = passList.reduce((s, e) => s + e.fund, 0);

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-indigo-700 font-medium">
                          Targeted
                        </div>
                        <div className="text-2xl font-bold text-indigo-900">
                          $
                          {(() => {
                            const t = (stageTargets || []).find(
                              (it: any) =>
                                it.stage === (selectedStage || "bridge"),
                            )?.target_mn;
                            const num = parseFloat(t || "0");
                            return isNaN(num) ? "0.000" : num.toFixed(3);
                          })()}{" "}
                          Mn
                        </div>
                      </div>
                      <div className="w-40">
                        <div className="text-sm text-gray-500">
                          {(() => {
                            const s = selectedStage || "";
                            return s
                              ? s
                                  .replaceAll("_", " ")
                                  .split(" ")
                                  .map(
                                    (w) =>
                                      w.charAt(0).toUpperCase() + w.slice(1),
                                  )
                                  .join(" ")
                              : "Unknown";
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg">
                    <div className="text-sm text-green-700 font-medium">
                      Valuation
                    </div>
                    <div className="text-2xl font-bold text-green-900">
                      ${valuation.toFixed(3)} Mn
                    </div>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-700 font-medium">
                      Total
                    </div>
                    <div className="text-2xl font-bold text-blue-900">
                      ${targeted.toFixed(3)} Mn
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">VCs</div>
                      <div className="text-sm font-medium text-blue-700">
                        Total: ${totalVcFunds.toFixed(3)} Mn
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                      {vcEntries.map((v, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-2 rounded"
                          onClick={() =>
                            v.vc_id ? navigate(`/vc/${v.vc_id}`) : null
                          }
                        >
                          <div className="text-sm">{v.name}</div>
                          <div className="text-sm font-medium">
                            ${v.fund.toFixed(3)} Mn
                          </div>
                        </div>
                      ))}
                      {vcEntries.length === 0 && (
                        <div className="text-sm text-gray-500">
                          No VCs found
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Completed 100%</div>
                      <div className="text-sm font-medium text-green-700">
                        Total: ${totalCompleted100.toFixed(3)} Mn
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                      {completed100.map((c) => (
                        <div
                          key={c.name}
                          className="flex justify-between items-center p-2 rounded hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            c.id ? navigate(`/fundraise/${c.id}`) : null
                          }
                        >
                          <div className="text-sm text-blue-700 underline decoration-dotted">
                            {c.name}
                          </div>
                          <div className="text-sm font-medium">
                            ${c.fund.toFixed(3)} Mn
                          </div>
                        </div>
                      ))}
                      {completed100.length === 0 && (
                        <div className="text-sm text-gray-500">
                          No completed items
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Committed - 90%</div>
                      <div className="text-sm font-medium text-purple-700">
                        Total: ${totalCommitted90.toFixed(3)} Mn
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                      {committed90.map((c) => (
                        <div
                          key={c.name}
                          className="flex justify-between items-center p-2 rounded hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            c.id ? navigate(`/fundraise/${c.id}`) : null
                          }
                        >
                          <div className="text-sm text-blue-700 underline decoration-dotted">
                            {c.name}
                          </div>
                          <div className="text-sm font-medium">
                            ${c.fund.toFixed(3)} Mn
                          </div>
                        </div>
                      ))}
                      {committed90.length === 0 && (
                        <div className="text-sm text-gray-500">
                          No committed items
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-white md:col-span-2">
                    <div className="text-sm font-medium mb-3">
                      Progress Buckets WIP
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      {["0-20", "21-40", "41-70"].map((k) => (
                        <div key={k} className="p-3 border rounded bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium">
                              {buckets[k]?.title}
                            </div>
                            <div className="text-sm font-medium text-gray-700 whitespace-nowrap">
                              Total: $
                              {(buckets[k]?.items || [])
                                .reduce(
                                  (s: number, it: any) => s + (it.fund || 0),
                                  0,
                                )
                                .toFixed(3)}{" "}
                              Mn
                            </div>
                          </div>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {(buckets[k]?.items || []).map((it) => (
                              <div
                                key={it.name}
                                className="flex justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                                onClick={() =>
                                  it.id ? navigate(`/fundraise/${it.id}`) : null
                                }
                              >
                                <div className="text-sm text-blue-700 underline decoration-dotted">
                                  {it.name}
                                </div>
                                <div className="text-sm font-medium">
                                  ${it.fund.toFixed(3)} Mn
                                </div>
                              </div>
                            ))}
                            {(buckets[k]?.items || []).length === 0 && (
                              <div className="text-sm text-gray-500">
                                No items
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Pass</div>
                      <div className="text-sm font-medium text-green-700">
                        Total: ${totalPass.toFixed(3)} Mn
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                      {passList.map((p) => (
                        <div
                          key={p.name + (p.id || 0)}
                          className="flex justify-between items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                          onClick={() =>
                            p.id ? navigate(`/fundraise/${p.id}`) : null
                          }
                        >
                          <div className="text-sm text-blue-700 underline decoration-dotted">
                            {p.name}
                          </div>
                          <div className="text-sm font-medium">
                            ${p.fund.toFixed(3)} Mn
                          </div>
                        </div>
                      ))}
                      {passList.length === 0 && (
                        <div className="text-sm text-gray-500">
                          No pass items
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Fund Raises Projects</CardTitle>
            <CardDescription>Grouped by Investment Stage</CardDescription>
          </CardHeader>
          <CardContent>
            {fundRaisesError ? (
              <div className="p-3 text-red-600">Failed to load fund raises</div>
            ) : fundRaisesLoading ? (
              <div className="p-3 text-gray-500">Loading...</div>
            ) : (
              (() => {
                const STAGE_LABELS: Record<string, string> = {
                  pre_seed: "Pre Seed",
                  seed: "Seed",
                  bridge_1: "Bridge 1",
                  bridge_2: "Bridge 2",
                  bridge: "Bridge",
                  pre_series_a: "Pre Series A",
                  series_a: "Series A",
                  series_b: "Series B",
                  series_c: "Series C",
                  unknown: "Unknown",
                };
                const ORDER = [
                  "pre_seed",
                  "seed",
                  "bridge_1",
                  "bridge_2",
                  "bridge",
                  "pre_series_a",
                  "series_a",
                  "series_b",
                  "series_c",
                  "unknown",
                ];

                const groups: Record<string, any[]> = {};
                (filteredFundRaises || []).forEach((fr: any) => {
                  const key = fr.round_stage || "unknown";
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(fr);
                });
                const keys = ORDER.filter((k) => groups[k]?.length).concat(
                  Object.keys(groups).filter((k) => !ORDER.includes(k)),
                );
                if (keys.length === 0)
                  return <div className="p-3 text-gray-500">No entries</div>;

                return (
                  <Accordion type="single" collapsible className="w-full">
                    {keys.map((k) => {
                      const list = groups[k] || [];
                      const statusCount: Record<string, number> = {};
                      let totalFund = 0;
                      list.forEach((fr: any) => {
                        const s = (fr.investor_status || "").trim() || "N/A";
                        statusCount[s] = (statusCount[s] || 0) + 1;
                        const tr = parseFloat(fr.total_raise_mn);
                        if (!isNaN(tr)) {
                          totalFund += tr;
                        } else if (
                          Array.isArray(fr.investors) &&
                          fr.investors.length
                        ) {
                          fr.investors.forEach((iv: any) => {
                            const f = parseFloat(iv?.fund_mn ?? "");
                            if (!isNaN(f)) totalFund += f;
                          });
                        } else {
                          const f = parseFloat(fr.fund_mn);
                          if (!isNaN(f)) totalFund += f;
                        }
                      });
                      return (
                        <AccordionItem key={k} value={k}>
                          <AccordionTrigger>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-blue-500" />
                                <span className="font-medium">
                                  {STAGE_LABELS[k] || k}
                                </span>
                              </div>
                              <Badge variant="secondary">{list.length}</Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {Object.entries(statusCount).map(([s, c]) => (
                                <Badge
                                  key={s}
                                  variant="outline"
                                  className="bg-gray-50"
                                >
                                  {s}: {c}
                                </Badge>
                              ))}
                            </div>

                            <div className="space-y-2">
                              {list.map((fr: any) => {
                                const internalStatus =
                                  fr.status ||
                                  UI_STATUS_TO_INTERNAL[fr.ui_status || ""] ||
                                  "in-progress";
                                const pd = (vcProgressData || []).find(
                                  (p: any) => p.fr_id === fr.id,
                                );
                                const completedProb =
                                  pd?.total_completed_probability || 0;
                                const progressPercent = Math.max(
                                  0,
                                  Math.min(100, completedProb),
                                );
                                // Per-card aggregates
                                const investorList =
                                  Array.isArray(fr.investors) &&
                                  fr.investors.length
                                    ? fr.investors
                                    : [
                                        {
                                          investor_name: fr.investor_name,
                                          fund_mn: fr.fund_mn,
                                          investor_status: fr.investor_status,
                                        },
                                      ];
                                let closedCount = investorList.filter(
                                  (iv: any) =>
                                    (iv.investor_status || "").toLowerCase() ===
                                    "closed",
                                ).length;
                                if (
                                  closedCount === 0 &&
                                  (fr.investor_status || "").toLowerCase() ===
                                    "closed"
                                ) {
                                  closedCount = 1;
                                }
                                let totalFundMn = investorList.reduce(
                                  (sum: number, iv: any) => {
                                    const v = parseFloat(iv?.fund_mn ?? "");
                                    return sum + (isNaN(v) ? 0 : v);
                                  },
                                  0,
                                );
                                if (totalFundMn === 0) {
                                  const fallback = parseFloat(fr.fund_mn);
                                  totalFundMn = isNaN(fallback) ? 0 : fallback;
                                }

                                return (
                                  <div
                                    key={fr.id}
                                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-sm no-underline"
                                    onClick={() =>
                                      navigate(`/fundraise/${fr.id}`)
                                    }
                                  >
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-8 w-8 bg-blue-100 text-blue-700">
                                        <AvatarFallback>
                                          {(
                                            (fr.investor_name || "FR").match(
                                              /\b\w/g,
                                            ) || []
                                          )
                                            .slice(0, 2)
                                            .join("")
                                            .toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <div className="font-medium text-gray-900 flex items-center gap-2">
                                          <span>
                                            {fr.investor_name || "Fund Raise"}
                                          </span>
                                          <Badge
                                            variant="secondary"
                                            className="capitalize"
                                          >
                                            {(fr.round_stage || "unknown")
                                              .toString()
                                              .replace("_", " ")}
                                          </Badge>
                                          {!fr.investor_status && (
                                            <Badge
                                              className={
                                                statusColors[internalStatus] ||
                                                ""
                                              }
                                            >
                                              {(fr.ui_status || internalStatus)
                                                .toString()
                                                .replace("-", " ")}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="mt-1 space-y-1">
                                          {(Array.isArray(fr.investors) &&
                                          fr.investors.length
                                            ? fr.investors
                                            : [
                                                {
                                                  investor_name:
                                                    fr.investor_name,
                                                  fund_mn: fr.fund_mn,
                                                  investor_status:
                                                    fr.investor_status,
                                                },
                                              ]
                                          ).map((iv: any, idx: number) => (
                                            <div
                                              key={idx}
                                              className="flex flex-wrap items-center gap-2 text-[12px]"
                                            >
                                              <span className="font-medium text-gray-800">
                                                {iv.investor_name}
                                              </span>
                                              {iv.investor_status && (
                                                <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                  {iv.investor_status}
                                                </Badge>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        <div className="text-[11px] text-gray-600 mt-1 flex flex-wrap gap-3">
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] bg-gray-50 text-gray-700 border-gray-200"
                                          >
                                            Closed: {closedCount}
                                          </Badge>
                                          <Badge
                                            className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                                            variant="outline"
                                          >
                                            Total Fund Raise : $
                                            {Number.isFinite(totalFundMn)
                                              ? totalFundMn.toFixed(3)
                                              : "0.000"}
                                          </Badge>
                                          <Badge
                                            className="text-[10px] bg-green-50 text-green-700 border-green-200"
                                            variant="outline"
                                          >
                                            Valuation $ Mn: $
                                            {Number.isFinite(
                                              parseFloat(fr.valuation_mn),
                                            )
                                              ? parseFloat(
                                                  fr.valuation_mn,
                                                ).toFixed(3)
                                              : "0.000"}
                                          </Badge>
                                          <Badge
                                            className="text-[10px] bg-purple-50 text-purple-700 border-purple-200"
                                            variant="outline"
                                          >
                                            Fund $ Mn: $
                                            {Number.isFinite(
                                              parseFloat(fr.fund_mn),
                                            )
                                              ? parseFloat(fr.fund_mn).toFixed(
                                                  3,
                                                )
                                              : "0.000"}
                                          </Badge>
                                          {fr.start_date && (
                                            <span className="inline-flex items-center gap-1">
                                              <Calendar className="w-3 h-3 text-gray-400" />
                                              <span className="text-gray-500">
                                                Start:
                                              </span>
                                              {new Date(
                                                fr.start_date,
                                              ).toLocaleDateString("en-IN", {
                                                timeZone: "Asia/Kolkata",
                                              })}
                                            </span>
                                          )}
                                          {fr.end_date && (
                                            <span className="inline-flex items-center gap-1">
                                              <Calendar className="w-3 h-3 text-gray-400" />
                                              <span className="text-gray-500">
                                                End:
                                              </span>
                                              {new Date(
                                                fr.end_date,
                                              ).toLocaleDateString("en-IN", {
                                                timeZone: "Asia/Kolkata",
                                              })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {!fr.investor_status && (
                                        <Badge
                                          className={
                                            statusColors[internalStatus] || ""
                                          }
                                        >
                                          {(fr.ui_status || internalStatus)
                                            .toString()
                                            .replace("-", " ")}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="hidden md:flex items-center gap-2">
                                      <div className="w-32 bg-gray-200 rounded h-2">
                                        <div
                                          className={`${progressPercent >= 100 ? "bg-green-500" : progressPercent >= 50 ? "bg-blue-500" : "bg-orange-500"} h-2 rounded`}
                                          style={{
                                            width: `${progressPercent}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="text-xs text-gray-700 font-medium w-8 text-right">
                                        {progressPercent}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                );
              })()
            )}
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Status Cards (cloned from VC) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(() => {
          const now = new Date();
          const currentDueFollowUps = (vcFollowUps || []).filter(
            (followUp: any) => {
              if (followUp.status === "completed") return false;

              // If no due date, treat as due in 3 days from creation (default behavior)
              const dueDate = followUp.due_date
                ? new Date(followUp.due_date)
                : new Date(
                    new Date(followUp.created_at).getTime() +
                      3 * 24 * 60 * 60 * 1000,
                  );

              if (isNaN(dueDate.getTime())) return false;
              const timeDiff = dueDate.getTime() - now.getTime();
              const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
              return diffDays >= 0 && diffDays <= 7;
            },
          );

          const overdueFollowUps = (vcFollowUps || []).filter(
            (followUp: any) => {
              if (followUp.status === "completed") return false;

              // If no due date, treat as due in 3 days from creation (default behavior)
              const dueDate = followUp.due_date
                ? new Date(followUp.due_date)
                : new Date(
                    new Date(followUp.created_at).getTime() +
                      3 * 24 * 60 * 60 * 1000,
                  );

              if (isNaN(dueDate.getTime())) return false;
              return dueDate < now;
            },
          );

          return (
            <>
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-blue-900 flex items-center">
                        <Clock className="w-5 h-5 mr-2" />
                        Follow-ups Due
                      </CardTitle>
                      <CardDescription className="text-blue-700">
                        Follow-ups due within the next 7 days (
                        {currentDueFollowUps.length} items)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-blue-200 text-blue-800"
                    >
                      {currentDueFollowUps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {followUpsLoading ? (
                    <div className="p-6 text-center text-gray-500">
                      Loading follow-ups...
                    </div>
                  ) : currentDueFollowUps.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-blue-500" />
                      </div>
                      <p className="text-gray-600 font-medium">
                        All caught up!
                      </p>
                      <p className="text-gray-500 text-sm">
                        No follow-ups due in the next 7 days
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-400px)] min-h-[200px] overflow-y-auto">
                      {currentDueFollowUps.map(
                        (followUp: any, index: number) => {
                          const dueDate = followUp.due_date
                            ? new Date(followUp.due_date)
                            : new Date(
                                new Date(followUp.created_at).getTime() +
                                  3 * 24 * 60 * 60 * 1000,
                              );
                          const diffDays = Math.ceil(
                            (dueDate.getTime() - now.getTime()) /
                              (1000 * 60 * 60 * 24),
                          );
                          const isToday = diffDays === 0;
                          const isTomorrow = diffDays === 1;
                          return (
                            <div
                              key={followUp.id}
                              className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${index === currentDueFollowUps.length - 1 ? "border-b-0" : ""}`}
                              onClick={() =>
                                navigate(`/follow-ups?id=${followUp.id}`)
                              }
                              title={
                                followUp.description ||
                                followUp.title ||
                                "No description available"
                              }
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                                      {followUp.title}
                                    </h4>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${isToday ? "border-orange-300 text-orange-700 bg-orange-50" : isTomorrow ? "border-yellow-300 text-yellow-700 bg-yellow-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}
                                    >
                                      {isToday
                                        ? "Today"
                                        : isTomorrow
                                          ? "Tomorrow"
                                          : `${diffDays} days`}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                                    <span>
                                      Round: {followUp.round_title || "Unknown"}
                                    </span>
                                    <span>
                                      Step: {followUp.step_name || "N/A"}
                                    </span>
                                    <span>
                                      Assigned to:{" "}
                                      {followUp.assigned_user_name ||
                                        "Unassigned"}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right text-xs text-gray-500">
                                  Due:{" "}
                                  {followUp.due_date
                                    ? (() => {
                                        const utcDate = new Date(
                                          followUp.due_date,
                                        );
                                        const year = utcDate.getFullYear();
                                        const month = String(
                                          utcDate.getMonth() + 1,
                                        ).padStart(2, "0");
                                        const day = String(
                                          utcDate.getDate(),
                                        ).padStart(2, "0");
                                        return `${year}-${month}-${day}`;
                                      })()
                                    : "No date"}
                                </div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-red-900 flex items-center">
                        <XCircle className="w-5 h-5 mr-2" />
                        Overdue Follow-ups
                      </CardTitle>
                      <CardDescription className="text-red-700">
                        Follow-ups that are past their due date (
                        {overdueFollowUps.length} items)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="destructive"
                      className="bg-red-200 text-red-800"
                    >
                      {overdueFollowUps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {followUpsLoading ? (
                    <div className="p-6 text-center text-gray-500">
                      Loading follow-ups...
                    </div>
                  ) : overdueFollowUps.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      </div>
                      <p className="text-gray-600 font-medium">Great job!</p>
                      <p className="text-gray-500 text-sm">
                        No overdue follow-ups
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-400px)] min-h-[200px] overflow-y-auto">
                      {overdueFollowUps.map((followUp: any) => (
                        <div
                          key={followUp.id}
                          className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() =>
                            navigate(`/follow-ups?id=${followUp.id}`)
                          }
                          title={
                            followUp.description ||
                            followUp.title ||
                            "No description available"
                          }
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                                  {followUp.title}
                                </h4>
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>
                                  Round: {followUp.round_title || "Unknown"}
                                </span>
                                <span>Step: {followUp.step_name || "N/A"}</span>
                                <span>
                                  Assigned to:{" "}
                                  {followUp.assigned_user_name || "Unassigned"}
                                </span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              Due:{" "}
                              {followUp.due_date
                                ? (() => {
                                    const utcDate = new Date(followUp.due_date);
                                    const year = utcDate.getFullYear();
                                    const month = String(
                                      utcDate.getMonth() + 1,
                                    ).padStart(2, "0");
                                    const day = String(
                                      utcDate.getDate(),
                                    ).padStart(2, "0");
                                    return `${year}-${month}-${day}`;
                                  })()
                                : "No date"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>
    </div>
  );
}
