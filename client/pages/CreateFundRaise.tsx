import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  ArrowLeft,
  Plus,
  Calendar,
  DollarSign,
  Building,
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

const STATUS_MAP: Record<string, string> = {
  WIP: "in-progress",
  Closed: "completed",
  Dropped: "lost",
};

const INVESTOR_STATUS_OPTIONS = [
  { value: "Pass", label: "Pass" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
  { value: "Yet to Connect", label: "Yet to Connect" },
  { value: "Future Potential", label: "Future Potential" },
];

function generateStepOptions(
  start: number,
  end: number,
  step: number,
): string[] {
  const result: string[] = [];
  const scale = 100; // to avoid floating-point errors
  const startScaled = Math.round(start * scale);
  const endScaled = Math.round(end * scale);
  const stepScaled = Math.round(step * scale);
  for (let v = startScaled; v <= endScaled; v += stepScaled) {
    result.push((v / scale).toFixed(2));
  }
  return result;
}

const FUND_MN_OPTIONS = generateStepOptions(0.05, 10, 0.05);
const VALUATION_MN_OPTIONS = ["0.50", ...generateStepOptions(1, 100, 1)];

export default function CreateFundRaise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fundMnOpen, setFundMnOpen] = useState(false);
  const [fundMnOpenMain, setFundMnOpenMain] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("fundraise");
  const [queueItems, setQueueItems] = useState<
    Array<{ vc_investor: string; fund_mn: string; investor_status: string }>
  >([{ vc_investor: "", fund_mn: "", investor_status: "" }]);

  const [form, setForm] = useState({
    vc_investor: "",
    status: "WIP",
    reason: "",
    round_stage: "",
    start_date: "",
    end_date: "",
    total_raise_mn: "",
    valuation_mn: "",
    template_id: 1,
    investor_status: "",
    fund_mn: "",
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

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
    const keys = Object.keys(n);
    if (keys.length) {
      const goQueue = !!n.queue;
      setActiveTab(goQueue ? "queue" : "fundraise");
    }
    return keys.length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const base = {
        ui_status: form.status,
        round_stage: form.round_stage,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        total_raise_mn: form.total_raise_mn || null,
        valuation_mn: form.valuation_mn || null,
        reason: form.reason || null,
        template_id: form.template_id,
        created_by: parseInt(user?.id || "1"),
        updated_by: parseInt(user?.id || "1"),
      };

      const investors = queueItems.map((it) => {
        const matched = (vcList || []).find(
          (vc: any) =>
            (vc.investor_name || "").trim() === it.vc_investor.trim(),
        );
        const linkedVcId: number | null = matched?.id ?? null;
        return {
          vc_id: linkedVcId,
          investor_name: it.vc_investor,
          investor_status: it.investor_status,
          fund_mn: it.fund_mn || null,
        };
      });

      const first = investors[0] || {};
      await apiClient.request("/fund-raises", {
        method: "POST",
        body: JSON.stringify({
          ...base,
          vc_id: first.vc_id ?? null,
          investor_name: first.investor_name ?? null,
          investor_status: first.investor_status ?? null,
          fund_mn: first.fund_mn ?? null,
          investors,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["fund-raises"] });
      toast({
        title: "Fund Raise created",
        description: "New fund raise created successfully.",
      });
      navigate("/fundraise");
    } catch (e) {
      toast({
        title: "Create failed",
        description: "Failed to create fund raise. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/fundraise")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fund Raise
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Create Fund Raise
            </h1>
            <p className="text-gray-600">Set up a new fund raise entry</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={submitting}>
          Submit
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="fundraise">Fund Raise</TabsTrigger>
          <TabsTrigger value="queue">Investor Status Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="fundraise" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fund Raise Details</CardTitle>
              <CardDescription>
                Fill in the required information
              </CardDescription>
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
                  <Popover
                    open={fundMnOpenMain}
                    onOpenChange={setFundMnOpenMain}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {form.total_raise_mn || "Select amount"}
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
                                onSelect={(val) => {
                                  handleChange("total_raise_mn", val);
                                  setFundMnOpenMain(false);
                                }}
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
                  <Popover open={valuationOpen} onOpenChange={setValuationOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        {form.valuation_mn || "Select valuation"}
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
                                onSelect={(val) => {
                                  handleChange("valuation_mn", val);
                                  setValuationOpen(false);
                                }}
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
                Add one or more investors, fund amount and status
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

      {Object.keys(errors).length > 0 && (
        <Alert className="mt-6">
          <AlertDescription>
            Please fix the following errors:
            <ul className="list-disc list-inside mt-2">
              {Object.values(errors).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
