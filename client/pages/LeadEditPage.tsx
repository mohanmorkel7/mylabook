import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getCountries, getStates, getCities } from "@/data/locations";
import { ClientContactInformationSection } from "@/components/ClientContactInformationSection";

const INDUSTRIES = ["Banking", "Fintech", "Payments", "Insurance", "Retail", "Telecom", "Government", "Other"];
const SIZES = ["1-50", "51-200", "201-1000", "1001-5000", "5000+"];
const REVENUES = ["<1M", "1-10M", "10-50M", "50-250M", "250M-1B", "1B+"];
const STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];

const SOURCES = [
  "LinkedIn - Outbound",
  "LinkedIn - Inbound",
  "Email - Outbound",
  "Email - Inbound",
  "Call - Outbound",
  "Call - Inbound",
  "Existing Client",
  "Business Team",
  "Reference",
  "General List",
];

const CLIENT_TYPES = [
  "PA-PG",
  "POS Provider",
  "PG-Bank",
  "BIN-Bank",
  "Strategic Partnership",
  "Other Acquirers",
];

const PA_LICENSES = [
  "License A",
  "License B",
  "License C",
  "License D",
  "Other",
];

const PAYMENT_OFFERINGS = [
  "Online Payments",
  "Offline Payment",
  "UPI Payments",
];

const GEOGRAPHY = ["Domestic", "International"];

const TXN_VOLUMES = [
  "< 0.05",
  "0.05 <> 0.10",
  "0.10 <> 0.25",
  "0.25 <> 0.50",
  "0.50 <> 0.75",
  "0.75 <> 1.00",
  "1.00 <> 1.50",
  "1.50 <> 2.00",
  "2.00 <> 3.00",
  "> 3.00",
];

interface Contact {
  contact_name: string;
  designation: string;
  phone_prefix?: string;
  phone: string;
  email: string;
  linkedin_profile_link?: string;
}

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
    contacts: [
      {
        contact_name: "",
        designation: "",
        phone_prefix: "+91",
        phone: "",
        email: "",
        linkedin_profile_link: "",
      },
    ],
  });

  // Tab navigation state
  const [currentTab, setCurrentTab] = useState("basic");
  const tabs = ["basic", "address", "contacts"];
  const currentTabIndex = tabs.indexOf(currentTab);

  // Popover state for country/state/city
  const [countryOpen, setCountryOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const countries = useMemo(() => getCountries(), []);
  const states = useMemo(() => getStates(formData.country || ""), [formData.country]);
  const cities = useMemo(() => getCities(formData.country || "", formData.state || ""), [formData.country, formData.state]);

  React.useEffect(() => {
    if (leadData) {
      // API returns lead object directly, not wrapped in { lead }
      const lead = leadData.lead || leadData;

      // Ensure payment_offerings is an array of strings
      let paymentOfferings: string[] = [];
      if (Array.isArray(lead.payment_offerings)) {
        paymentOfferings = lead.payment_offerings;
      } else if (typeof lead.payment_offerings === 'string') {
        try {
          const parsed = JSON.parse(lead.payment_offerings);
          paymentOfferings = Array.isArray(parsed) ? parsed : [lead.payment_offerings];
        } catch {
          paymentOfferings = [lead.payment_offerings];
        }
      }

      // Ensure contacts is properly formatted array
      const contacts = Array.isArray(lead.contacts) && lead.contacts.length > 0
        ? lead.contacts.map((c: any) => ({
            contact_name: c.contact_name || "",
            designation: c.designation || "",
            phone_prefix: c.phone_prefix || "+91",
            phone: c.phone || "",
            email: c.email || "",
            linkedin_profile_link: c.linkedin_profile_link || "",
          }))
        : [
            {
              contact_name: "",
              designation: "",
              phone_prefix: "+91",
              phone: "",
              email: "",
              linkedin_profile_link: "",
            },
          ];

      setFormData({
        ...lead,
        payment_offerings: paymentOfferings,
        contacts: contacts,
      });
    }
  }, [leadData]);

  const createMutation = useMutation({
    mutationFn: () => createLead(formData),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead created successfully" });
      // API returns lead object directly, not wrapped in { lead }
      const leadId = data.id || data.lead?.id;
      navigate(`/lead-management/${leadId}/overview`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create lead",
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

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (isCreating) {
        const draftData = { ...formData, is_draft: true };
        return createLead(draftData);
      } else {
        return updateLead(id as string, { ...formData, is_draft: true });
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Draft saved successfully" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save draft",
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

  const renderSourceSpecificFields = () => {
    const source = formData.source || "";

    if (source.includes("LinkedIn")) {
      return (
        <>
          <div>
            <Label>LinkedIn Profile URL</Label>
            <Input
              value={formData.linkedin_url || ""}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              placeholder="https://linkedin.com/in/..."
              type="url"
            />
          </div>
          <div>
            <Label>Connection Message / Notes</Label>
            <Textarea
              value={formData.source_notes || ""}
              onChange={(e) => setFormData({ ...formData, source_notes: e.target.value })}
              placeholder="Message sent or additional notes about the connection"
              rows={2}
            />
          </div>
        </>
      );
    }

    if (source.includes("Email")) {
      return (
        <>
          <div>
            <Label>Email Address / Subject</Label>
            <Input
              value={formData.email_subject || ""}
              onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
              placeholder="Subject line or sender email"
            />
          </div>
          <div>
            <Label>Email Content / Notes</Label>
            <Textarea
              value={formData.source_notes || ""}
              onChange={(e) => setFormData({ ...formData, source_notes: e.target.value })}
              placeholder="Email body or key points from the email"
              rows={2}
            />
          </div>
        </>
      );
    }

    if (source.includes("Call")) {
      return (
        <>
          <div>
            <Label>Call Duration (minutes)</Label>
            <Input
              value={formData.call_duration || ""}
              onChange={(e) => setFormData({ ...formData, call_duration: e.target.value })}
              placeholder="e.g., 15"
              type="number"
            />
          </div>
          <div>
            <Label>Call Notes</Label>
            <Textarea
              value={formData.source_notes || ""}
              onChange={(e) => setFormData({ ...formData, source_notes: e.target.value })}
              placeholder="Key points discussed in the call"
              rows={2}
            />
          </div>
        </>
      );
    }

    if (source === "Existing Client") {
      return (
        <>
          <div>
            <Label>Previous Account ID / Client Reference</Label>
            <Input
              value={formData.previous_account_id || ""}
              onChange={(e) => setFormData({ ...formData, previous_account_id: e.target.value })}
              placeholder="e.g., ACC-12345"
            />
          </div>
          <div>
            <Label>Account History Notes</Label>
            <Textarea
              value={formData.source_notes || ""}
              onChange={(e) => setFormData({ ...formData, source_notes: e.target.value })}
              placeholder="Previous dealings, account status, etc."
              rows={2}
            />
          </div>
        </>
      );
    }

    if (source === "Business Team") {
      return (
        <>
          <div>
            <Label>Referred By (Team Member Name)</Label>
            <Input
              value={formData.referred_by || ""}
              onChange={(e) => setFormData({ ...formData, referred_by: e.target.value })}
              placeholder="Name of the team member who referred"
            />
          </div>
          <div>
            <Label>Department / Team</Label>
            <Input
              value={formData.source_department || ""}
              onChange={(e) => setFormData({ ...formData, source_department: e.target.value })}
              placeholder="e.g., Sales, Operations, Finance"
            />
          </div>
        </>
      );
    }

    if (source === "Reference") {
      return (
        <>
          <div>
            <Label>Referrer Name</Label>
            <Input
              value={formData.referrer_name || ""}
              onChange={(e) => setFormData({ ...formData, referrer_name: e.target.value })}
              placeholder="Name of the person who referred this lead"
            />
          </div>
          <div>
            <Label>Referrer Email / Contact</Label>
            <Input
              value={formData.referrer_contact || ""}
              onChange={(e) => setFormData({ ...formData, referrer_contact: e.target.value })}
              placeholder="Email or phone number"
            />
          </div>
        </>
      );
    }

    if (source === "General List") {
      return (
        <>
          <div>
            <Label>List Source / Provider</Label>
            <Input
              value={formData.list_source || ""}
              onChange={(e) => setFormData({ ...formData, list_source: e.target.value })}
              placeholder="e.g., Apollo, Clearbit, ZoomInfo"
            />
          </div>
          <div>
            <Label>List Name / Campaign</Label>
            <Input
              value={formData.list_name || ""}
              onChange={(e) => setFormData({ ...formData, list_name: e.target.value })}
              placeholder="Name of the list or campaign"
            />
          </div>
        </>
      );
    }

    return null;
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

      <Card className="max-w-4xl">
        <div className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">{isCreating ? "Create New Lead" : "Edit Lead"}</h1>

          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="address">Address & Details</TabsTrigger>
              <TabsTrigger value="contacts">Contact Information</TabsTrigger>
            </TabsList>

            {/* Tab 1: Basic Info */}
            <TabsContent value="basic" className="space-y-6">
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

              {/* Source & Client Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Source *</Label>
                  <Select value={formData.source || ""} onValueChange={(val) => setFormData({ ...formData, source: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((src) => (
                        <SelectItem key={src} value={src}>
                          {src}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Client Name</Label>
                  <Input
                    value={formData.client_name || ""}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    placeholder="Client name"
                  />
                </div>
              </div>

              {/* Source-Specific Fields */}
              {formData.source && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  {renderSourceSpecificFields()}
                </div>
              )}

              {/* Industry & Client Type */}
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
                  <Label>Client Type *</Label>
                  <Select value={formData.client_type || ""} onValueChange={(val) => setFormData({ ...formData, client_type: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* PA License & Fully Approved */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>PA License</Label>
                  <Select value={formData.pa_license || ""} onValueChange={(val) => setFormData({ ...formData, pa_license: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select license" />
                    </SelectTrigger>
                    <SelectContent>
                      {PA_LICENSES.map((lic) => (
                        <SelectItem key={lic} value={lic}>
                          {lic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fully Approved</Label>
                  <Select value={formData.fully_approved || ""} onValueChange={(val) => setFormData({ ...formData, fully_approved: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Payment Offerings & Website */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Offering (multi-select) *</Label>
                  <MultiSelect
                    options={PAYMENT_OFFERINGS.map((p) => ({ label: p, value: p }))}
                    value={(formData.payment_offerings || []).map((p: any) => String(p))}
                    onChange={(val) => setFormData({ ...formData, payment_offerings: val })}
                    placeholder="Select payment offerings"
                  />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input
                    value={formData.website || ""}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                    type="url"
                  />
                </div>
              </div>

              {/* Geography & Txn Volume */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Geography *</Label>
                  <Select value={formData.geography || ""} onValueChange={(val) => setFormData({ ...formData, geography: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select geography" />
                    </SelectTrigger>
                    <SelectContent>
                      {GEOGRAPHY.map((geo) => (
                        <SelectItem key={geo} value={geo}>
                          {geo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Txn Volume / per day in million</Label>
                  <Select value={formData.txn_volume || ""} onValueChange={(val) => setFormData({ ...formData, txn_volume: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select volume" />
                    </SelectTrigger>
                    <SelectContent>
                      {TXN_VOLUMES.map((vol) => (
                        <SelectItem key={vol} value={vol}>
                          {vol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Product Tags */}
              <div>
                <Label>Product Tag Info</Label>
                <Input
                  value={formData.product_tags || ""}
                  onChange={(e) => setFormData({ ...formData, product_tags: e.target.value })}
                  placeholder="Enter product tags"
                />
              </div>

              {/* Company Size & Revenue */}
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

              {/* Status */}
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
            </TabsContent>

            {/* Tab 2: Address & Details */}
            <TabsContent value="address" className="space-y-6">
              <div className="text-sm text-gray-500 mb-4">All address and contact fields are optional</div>

              {/* Street Address */}
              <div>
                <Label>Street Address</Label>
                <Textarea
                  value={formData.street_address || ""}
                  onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
                  placeholder="Building, street, area"
                  rows={3}
                />
              </div>

              {/* Location - Cascading Searchable Dropdowns */}
              <div className="space-y-4">
                {/* Country */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Country</Label>
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
                    <PopoverContent className="w-full max-h-96 p-0 overflow-hidden">
                      <Command className="max-h-96">
                        <CommandInput placeholder="Search countries..." />
                        <CommandEmpty>No country found.</CommandEmpty>
                        <div className="max-h-80 overflow-y-auto">
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
                        </div>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* State/Province */}
                {formData.country && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">State/Province</Label>
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
                      <PopoverContent className="w-full max-h-96 p-0 overflow-hidden">
                        <Command className="max-h-96">
                          <CommandInput placeholder="Search states..." />
                          <CommandEmpty>No state found.</CommandEmpty>
                          <div className="max-h-80 overflow-y-auto">
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
                          </div>
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
                      <PopoverContent className="w-full max-h-96 p-0 overflow-hidden">
                        <Command className="max-h-96">
                          <CommandInput placeholder="Search cities..." />
                          <CommandEmpty>No city found.</CommandEmpty>
                          <div className="max-h-80 overflow-y-auto">
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
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Contact Information */}
            <TabsContent value="contacts">
              <ClientContactInformationSection
                contacts={formData.contacts || []}
                onContactsChange={(contacts) => setFormData({ ...formData, contacts })}
              />
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex gap-3 justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => navigate("/lead-management")}
            >
              Cancel
            </Button>

            <div className="flex gap-3">
              {/* Save Draft button - visible on all tabs */}
              <Button
                variant="secondary"
                onClick={() => saveDraftMutation.mutate()}
                disabled={saveDraftMutation.isPending}
              >
                Save Draft
              </Button>

              {/* Previous button - hidden on first tab */}
              {currentTabIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentTab(tabs[currentTabIndex - 1])}
                >
                  Previous
                </Button>
              )}

              {/* Next button - visible on all except last tab */}
              {currentTabIndex < tabs.length - 1 && (
                <Button
                  onClick={() => setCurrentTab(tabs[currentTabIndex + 1])}
                >
                  Next
                </Button>
              )}

              {/* Create Lead button - only on last tab */}
              {currentTabIndex === tabs.length - 1 && (
                <Button
                  onClick={handleSubmit}
                  disabled={isCreating ? createMutation.isPending : updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isCreating ? "Create Lead" : "Save Changes"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
