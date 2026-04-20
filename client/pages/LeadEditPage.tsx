import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getCountries, getStates, getCities } from "@/data/locations";

const INDUSTRIES = ["Banking", "Fintech", "Payments", "Insurance", "Retail", "Telecom", "Government", "Other"];
const SIZES = ["1-50", "51-200", "201-1000", "1001-5000", "5000+"];
const REVENUES = ["<1M", "1-10M", "10-50M", "50-250M", "250M-1B", "1B+"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];

async function fetchLead(id: string) {
  const res = await fetch(`/api/lead-management/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

async function createLead(data: Record<string, any>) {
  const res = await fetch(`/api/lead-management`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create lead");
  return res.json();
}

async function updateLead(id: string, data: Record<string, any>) {
  const res = await fetch(`/api/lead-management/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update lead");
  return res.json();
}

export default function LeadEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCreating = !id || id === "new";

  const { data: leadData, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead(id!),
    enabled: !!id && !isCreating,
  });

  const [formData, setFormData] = useState<Record<string, any>>({
    status: "New",
  });

  // Popover state for country/state/city
  const [countryOpen, setCountryOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const countries = useMemo(() => getCountries(), []);
  const states = useMemo(() => getStates(formData.country || ""), [formData.country]);
  const cities = useMemo(() => getCities(formData.country || "", formData.state || ""), [formData.country, formData.state]);

  React.useEffect(() => {
    if (leadData?.lead) {
      setFormData(leadData.lead);
    }
  }, [leadData]);

  const createMutation = useMutation({
    mutationFn: () => createLead(formData),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead created successfully" });
      navigate(`/lead-management/${data.lead.id}/overview`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create lead",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateLead(id as string, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead updated successfully" });
      navigate(`/lead-management/${id}/overview`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update lead",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  const lead = isCreating ? null : leadData?.lead;
  if (!isCreating && !lead) return <div className="p-6">Lead not found</div>;

  const handleSubmit = () => {
    if (!formData.company_name || !formData.industry || !formData.company_size || !formData.country) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (isCreating) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <Button
        variant="outline"
        onClick={() => navigate("/lead-management")}
        className="gap-2 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <Card className="max-w-2xl">
        <div className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">{isCreating ? "Create New Lead" : "Edit Lead"}</h1>

          {/* Company Name & Legal Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={formData.company_name || ""}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Company Legal Name</Label>
              <Input
                value={formData.company_legal_name || ""}
                onChange={(e) => setFormData({ ...formData, company_legal_name: e.target.value })}
              />
            </div>
          </div>

          {/* Industry & Sub-industry */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Industry *</Label>
              <Select value={formData.industry || ""} onValueChange={(val) => setFormData({ ...formData, industry: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-industry</Label>
              <Input
                value={formData.sub_industry || ""}
                onChange={(e) => setFormData({ ...formData, sub_industry: e.target.value })}
              />
            </div>
          </div>

          {/* Size & Revenue */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Size *</Label>
              <Select value={formData.company_size || ""} onValueChange={(val) => setFormData({ ...formData, company_size: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Annual Revenue Band</Label>
              <Select value={formData.annual_revenue_band || ""} onValueChange={(val) => setFormData({ ...formData, annual_revenue_band: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {REVENUES.map((rev) => (
                    <SelectItem key={rev} value={rev}>
                      {rev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location - Cascading Searchable Dropdowns */}
          <div className="space-y-4">
            {/* Country */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Country *</Label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryOpen}
                    className="w-full justify-between"
                  >
                    {formData.country || "Select Country..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup>
                      {countries.map((country) => (
                        <CommandItem
                          key={country}
                          value={country}
                          onSelect={(currentValue) => {
                            setFormData({
                              ...formData,
                              country: currentValue,
                              state: "",
                              city: "",
                            });
                            setCountryOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formData.country === country ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {country}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* State/Province */}
            {formData.country && (
              <div>
                <Label className="text-sm font-medium mb-2 block">State/Province (add)</Label>
                <Popover open={stateOpen} onOpenChange={setStateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={stateOpen}
                      className="w-full justify-between"
                      disabled={!formData.country}
                    >
                      {formData.state || "Select State..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search states..." />
                      <CommandEmpty>No state found.</CommandEmpty>
                      <CommandGroup>
                        {states.map((state) => (
                          <CommandItem
                            key={state}
                            value={state}
                            onSelect={(currentValue) => {
                              setFormData({
                                ...formData,
                                state: currentValue,
                                city: "",
                              });
                              setStateOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.state === state ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {state}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* City */}
            {formData.state && (
              <div>
                <Label className="text-sm font-medium mb-2 block">City</Label>
                <Popover open={cityOpen} onOpenChange={setCityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={cityOpen}
                      className="w-full justify-between"
                      disabled={!formData.state}
                    >
                      {formData.city || "Select City..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search cities..." />
                      <CommandEmpty>No city found.</CommandEmpty>
                      <CommandGroup>
                        {cities.map((city) => (
                          <CommandItem
                            key={city}
                            value={city}
                            onSelect={(currentValue) => {
                              setFormData({
                                ...formData,
                                city: currentValue,
                              });
                              setCityOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.city === city ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {city}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Website & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Website</Label>
              <Input
                type="url"
                value={formData.company_website || ""}
                onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status || "New"} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => navigate("/lead-management")}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isCreating ? createMutation.isPending : updateMutation.isPending}
            >
              {isCreating ? "Create Lead" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
