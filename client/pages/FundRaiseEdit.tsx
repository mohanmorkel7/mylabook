import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Save,
  Calendar,
  DollarSign,
  Building,
  ChevronsUpDown,
  Plus,
  Trash2,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "Dropped", label: "Dropped" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
];

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

const STATUS_TO_SERVER: Record<string, string> = {
  WIP: "in-progress",
  Closed: "completed",
  Dropped: "lost",
};

const SERVER_TO_STATUS: Record<string, string> = {
  "in-progress": "WIP",
  completed: "Closed",
  lost: "Dropped",
};

const INVESTOR_STATUS_OPTIONS = [
  { value: "Pass", label: "Pass" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
  { value: "Yet to Connect", label: "Yet to Connect" },
  { value: "Future Potential", label: "Future Potential" },
];

const FUND_MN_OPTIONS = Array.from({ length: 200 }, (_, i) =>
  (0.05 + i * 0.05).toFixed(2),
).filter((v) => parseFloat(v) <= 10);
const VALUATION_MN_OPTIONS = [
  "0.50",
  ...Array.from({ length: 100 }, (_, i) => (i + 1).toFixed(2)),
];

export default function FundRaiseEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fundMnOpen, setFundMnOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [queueItems, setQueueItems] = useState<
    Array<{ vc_investor: string; fund_mn: string; investor_status: string }>
  >([{ vc_investor: "", fund_mn: "", investor_status: "" }]);

  const [form, setForm] = useState({
    vc_investor: "",
    status: "WIP",
    investor_status: "",
    reason: "",
    round_stage: "",
    start_date: "",
    end_date: "",
    total_raise_mn: "",
    valuation_mn: "",
    fund_mn: "",
    template_id: 1,
  });

  const { data: vcList = [] } = useQuery({
    queryKey: ["vc-list-all"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc");
        return Array.isArray(result) ? result : [];
      } catch (e) {
        return [];
      }
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const investorOptions = useMemo(() => {
    const names = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    (vcList || []).forEach((vc: any) => {
      const name = vc.investor_name?.trim();
      if (name && !names.has(name)) {
        names.add(name);
        opts.push({ value: name, label: name });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [vcList]);

  const { data: current, isLoading } = useQuery({
    queryKey: ["fundraise-edit", id],
    queryFn: async () => apiClient.request(`/fund-raises/${id}`),
    enabled: !!id,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const { data: allFundRaises = [] } = useQuery({
    queryKey: ["fund-raises-all-for-edit"],
    queryFn: async () => apiClient.request(`/fund-raises`),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  useEffect(() => {
    if (!current) return;
    setForm({
      vc_investor: current.investor_name || "",
      status: SERVER_TO_STATUS[current.status] || "WIP",
      investor_status: current.investor_status || "",
      reason: current.reason || "",
      round_stage: current.round_stage || "",
      start_date: current.start_date
        ? new Date(current.start_date).toISOString().split("T")[0]
        : "",
      end_date: current.targeted_end_date
        ? new Date(current.targeted_end_date).toISOString().split("T")[0]
        : "",
      total_raise_mn: current.total_raise_mn || current.round_size || "",
      valuation_mn: current.valuation_mn || current.valuation || "",
      fund_mn: current.fund_mn || "",
      template_id: current.template_id || 1,
    });

    // Prefer stored investors array if present; fallback to current top-level fields
    if (
      Array.isArray((current as any).investors) &&
      (current as any).investors.length > 0
    ) {
      const items = (current as any).investors.map((it: any) => ({
        vc_investor: it.investor_name || "",
        fund_mn: it.fund_mn || "",
        investor_status: it.investor_status || "",
      }));
      setQueueItems(items);
    } else {
      setQueueItems([
        {
          vc_investor: current.investor_name || "",
          fund_mn: current.fund_mn || "",
          investor_status: current.investor_status || "",
        },
      ]);
    }
  }, [current, allFundRaises]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiClient.request(`/fund-raises/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fund-raises"] });
      await queryClient.invalidateQueries({ queryKey: ["fundraise", id] });
      await queryClient.invalidateQueries({ queryKey: ["fundraise-edit", id] });
      await queryClient.invalidateQueries({
        queryKey: ["fund-raise-steps", id],
      });
      await queryClient.refetchQueries({ queryKey: ["fundraise", id] });
      await queryClient.refetchQueries({ queryKey: ["fundraise-edit", id] });
      await queryClient.refetchQueries({ queryKey: ["fund-raise-steps", id] });
      toast({
        title: "Fund Raise updated",
        description: "Changes saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update Fund Raise.",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: string, value: any) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const validateForm = () => {
    const n: Record<string, string> = {};
    if (!form.status) n.status = "Status is required";
    if (!form.round_stage) n.round_stage = "Investment Stage is required";

    const badRows: number[] = [];
    queueItems.forEach((it, idx) => {
      if (!it.vc_investor || !it.fund_mn || !it.investor_status)
        badRows.push(idx + 1);
    });
    if (queueItems.length === 0 || badRows.length > 0) {
      n.queue = badRows.length
        ? `Please complete all fields for investor row(s): ${badRows.join(", ")}`
        : "Add at least one investor in the queue";
    }

    setErrors(n);
    return Object.keys(n).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const base: any = {
      ui_status: form.status,
      round_stage: form.round_stage,
      total_raise_mn: form.total_raise_mn,
      valuation_mn: form.valuation_mn,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      reason: form.reason,
      template_id: form.template_id || 1,
      updated_by: parseInt(user?.id || "1"),
    };
    try {
      // Separate existing vs new investors based on original fund raise data
      const originalSet = new Set<string>(
        (
          (Array.isArray((current as any)?.investors) &&
          (current as any).investors.length
            ? (current as any).investors
            : [{ investor_name: current?.investor_name }]) as any[]
        )
          .map((it: any) =>
            String(it?.investor_name || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      );

      const normalizedQueue = queueItems.filter(
        (it) => it.vc_investor && it.fund_mn && it.investor_status,
      );

      const existingRows = normalizedQueue.filter((it) =>
        originalSet.has(it.vc_investor.trim().toLowerCase()),
      );
      const newRows = normalizedQueue.filter(
        (it) => !originalSet.has(it.vc_investor.trim().toLowerCase()),
      );

      const mapRow = (it: {
        vc_investor: string;
        fund_mn: string;
        investor_status: string;
      }) => {
        const matched = (vcList || []).find(
          (vc: any) =>
            (vc.investor_name || "").trim() === it.vc_investor.trim(),
        );
        const linkedVcId: number | null = matched?.id ?? null;
        return {
          vc_id: linkedVcId,
          investor_name: it.vc_investor,
          fund_mn: it.fund_mn,
          investor_status: it.investor_status || null,
        };
      };

      const existingInvestors = existingRows.length
        ? existingRows.map(mapRow)
        : [];

      const first = existingInvestors[0] || {
        vc_id: current?.vc_id ?? null,
        investor_name: current?.investor_name ?? null,
        fund_mn: current?.fund_mn ?? null,
        investor_status: current?.investor_status ?? null,
      };

      // Update current fund raise with only existing investors
      await updateMutation.mutateAsync({
        ...base,
        vc_id: first.vc_id ?? null,
        investor_name: first.investor_name ?? null,
        fund_mn: first.fund_mn ?? null,
        investor_status: first.investor_status ?? null,
        investors: existingInvestors.length ? existingInvestors : [first],
      });

      // Create separate fund raise entries for newly added investors (avoid duplicates)
      if (newRows.length) {
        const items = newRows.map((r) => mapRow(r));
        const baseForNew = {
          ui_status: form.status,
          round_stage: form.round_stage,
          total_raise_mn: form.total_raise_mn,
          valuation_mn: form.valuation_mn,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          reason: form.reason,
          template_id: form.template_id || 1,
          created_by: parseInt(user?.id || "1"),
        } as any;
        try {
          await apiClient.request("/fund-raises", {
            method: "POST",
            body: JSON.stringify({ base: baseForNew, items }),
          });
        } catch (e) {
          console.error("Failed to batch-create new fund raises", e);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["fund-raises"] });
      await queryClient.invalidateQueries({ queryKey: ["fundraise", id] });
      navigate(`/fundraise/${id}`);
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Failed to save changes.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading Fund Raise...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/fundraise/${id}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Overview
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Edit Fund Raise
            </h1>
            <p className="text-gray-600">Update fund raise details</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="fundraise">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="fundraise">Fund Raise</TabsTrigger>
          <TabsTrigger value="queue">Investor Status Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="fundraise" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fund Raise Details</CardTitle>
              <CardDescription>Edit the information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hidden"></div>

                <div>
                  <Label>Status *</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => handleChange("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.status && (
                    <p className="text-sm text-red-600 mt-1">{errors.status}</p>
                  )}
                </div>

                <div>
                  <Label>Investment Stage *</Label>
                  <Select
                    value={form.round_stage}
                    onValueChange={(v) => handleChange("round_stage", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUND_STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.round_stage && (
                    <p className="text-sm text-red-600 mt-1">
                      {errors.round_stage}
                    </p>
                  )}
                </div>

                <div>
                  <Label>Start Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      className="pl-10"
                      value={form.start_date}
                      onChange={(e) =>
                        handleChange("start_date", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>End Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      className="pl-10"
                      value={form.end_date}
                      onChange={(e) => handleChange("end_date", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Total Fund Raise $ Mn</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {form.total_raise_mn || "Select amount"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      avoidCollisions={true}
                      collisionPadding={8}
                      className="p-0 w-[240px] max-h-[min(50vh,320px)] overflow-auto"
                    >
                      <Command>
                        <CommandInput placeholder="Search amount..." />
                        <CommandList>
                          <CommandEmpty>No amounts found.</CommandEmpty>
                          <CommandGroup>
                            {FUND_MN_OPTIONS.map((v) => (
                              <CommandItem
                                key={v}
                                value={v}
                                onSelect={(val) =>
                                  handleChange("total_raise_mn", val)
                                }
                              >
                                {v}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Valuation $ Mn</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {form.valuation_mn || "Select valuation"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      avoidCollisions={true}
                      collisionPadding={8}
                      className="p-0 w-[240px] max-h-[min(50vh,320px)] overflow-auto"
                    >
                      <Command>
                        <CommandInput placeholder="Search valuation..." />
                        <CommandList>
                          <CommandEmpty>No valuations found.</CommandEmpty>
                          <CommandGroup>
                            {VALUATION_MN_OPTIONS.map((v) => (
                              <CommandItem
                                key={v}
                                value={v}
                                onSelect={(val) =>
                                  handleChange("valuation_mn", val)
                                }
                              >
                                {v}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Textarea
                  placeholder="Add details/reason"
                  value={form.reason}
                  onChange={(e) => handleChange("reason", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle>Investor Status Queue</CardTitle>
              <CardDescription>
                Add or edit investors for this round
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {queueItems.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border p-3 rounded"
                >
                  <div className="md:col-span-5">
                    <Label>VC *</Label>
                    <Select
                      value={item.vc_investor}
                      onValueChange={(v) =>
                        setQueueItems((arr) =>
                          arr.map((it, i) =>
                            i === idx ? { ...it, vc_investor: v } : it,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select VC" />
                      </SelectTrigger>
                      <SelectContent>
                        {investorOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <Building className="w-4 h-4" /> {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label>Fund $ Mn *</Label>
                    <Select
                      value={item.fund_mn}
                      onValueChange={(v) =>
                        setQueueItems((arr) =>
                          arr.map((it, i) =>
                            i === idx ? { ...it, fund_mn: v } : it,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select amount" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64 overflow-auto">
                        {FUND_MN_OPTIONS.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label>Investor Status *</Label>
                    <Select
                      value={item.investor_status}
                      onValueChange={(v) =>
                        setQueueItems((arr) =>
                          arr.map((it, i) =>
                            i === idx ? { ...it, investor_status: v } : it,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTOR_STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-1 flex justify-end md:justify-center">
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() =>
                        setQueueItems((arr) => arr.filter((_, i) => i !== idx))
                      }
                      disabled={queueItems.length === 1}
                      title={
                        queueItems.length === 1
                          ? "At least one row required"
                          : "Delete row"
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={() =>
                    setQueueItems((arr) => [
                      ...arr,
                      { vc_investor: "", fund_mn: "", investor_status: "" },
                    ])
                  }
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Investor
                </Button>
                {errors.queue && (
                  <p className="text-sm text-red-600">{errors.queue}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
