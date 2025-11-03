import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Country, State, City } from "country-state-city";
import {
  Plus,
  ArrowLeft,
  Building2,
  Globe,
  MapPin,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
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
import { ClientContactInformationSection } from "@/components/ClientContactInformationSection";

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

const PAYMENT_OFFERINGS = [
  "Online Payments",
  "Offline Payment",
  "UPI Payments",
];

const GEOGRAPHY = ["Domestic", "International"] as const;

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

const PHONE_PREFIXES = [
  { code: "+1", label: "+1 (US)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+91", label: "+91 (IN)" },
  { code: "+971", label: "+971 (UAE)" },
  { code: "+61", label: "+61 (AU)" },
  { code: "+65", label: "+65 (SG)" },
  { code: "+81", label: "+81 (JP)" },
  { code: "+49", label: "+49 (DE)" },
];

function isValidEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}


export default function CreateClient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("client-info");
  const [showClientErrors, setShowClientErrors] = useState(false);
  const [showContactErrors, setShowContactErrors] = useState(false);

  const [clientInfo, setClientInfo] = useState({
    source: "",
    source_value: "",
    client_name: "",
    client_type: "",
    pa_license:"",
    payment_offerings: [] as string[],
    website: "",
    geography: "" as "Domestic" | "International" | "",
    txn_volume: "",
    product_tag_info: "",
  });

  const [referenceConnections, setReferenceConnections] = useState<string[]>(
    [],
  );

  const [contacts, setContacts] = useState<
    Array<{
      contact_name: string;
      designation: string;
      phone_prefix?: string;
      phone: string;
      email: string;
      linkedin_profile_link?: string;
      department?: string;
      reportingTo?: string;
    }>
  >([
    {
      contact_name: "",
      designation: "",
      phone_prefix: "+91",
      phone: "",
      email: "",
      linkedin_profile_link: "",
      department: "",
      reportingTo: "",
    },
  ]);

  const [addressInfo, setAddressInfo] = useState({
    address: "",
    country: "",
    state: "",
    city: "",
  });

  const countries = Country.getAllCountries();
  const selectedCountry = countries.find((c) => c.name === addressInfo.country);
  const states = selectedCountry
    ? State.getStatesOfCountry(selectedCountry.isoCode)
    : [];
  const selectedState = states.find((s) => s.name === addressInfo.state);
  const cities = selectedCountry
    ? selectedState
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : City.getCitiesOfCountry(selectedCountry.isoCode)
    : [];
  const uniqueCities = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; stateCode?: string }[] = [];
    for (const ct of cities as any[]) {
      const val = `${ct.name}__${ct.stateCode || ""}`;
      if (!seen.has(val)) {
        seen.add(val);
        out.push({ name: ct.name, stateCode: ct.stateCode });
      }
    }
    return out;
  }, [JSON.stringify(cities)]);

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiClient.getConnections(),
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!clientInfo.source) e.source = "Required";
    if (!clientInfo.client_name.trim()) e.client_name = "Required";
    if (!clientInfo.client_type) e.client_type = "Required";
    if (clientInfo.payment_offerings.length === 0)
      e.payment_offerings = "Select at least one";
    if (!clientInfo.geography) e.geography = "Required";
    return e;
  }, [clientInfo, addressInfo]);

  const clientInfoErrors = useMemo(() => {
    const { source, client_name, client_type, payment_offerings, geography } =
      errors;
    const filtered: Record<string, string> = {};
    if (source) filtered.source = source;
    if (client_name) filtered.client_name = client_name;
    if (client_type) filtered.client_type = client_type;
    if (payment_offerings) filtered.payment_offerings = payment_offerings;
    if (geography) filtered.geography = geography;
    return filtered;
  }, [errors]);

  const contactTabErrors = useMemo(() => {
    const { country, state, city } = errors;
    const filtered: Record<string, string> = {};
    if (country) filtered.country = country;
    if (state) filtered.state = state;
    if (city) filtered.city = city;
    return filtered;
  }, [errors]);

  const handleNext = () => {
    setShowClientErrors(true);
    if (Object.keys(clientInfoErrors).length === 0) {
      setActiveTab("contact-info");
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } else {
      toast({
        title: "Missing details",
        description: "Please complete the required fields",
        variant: "destructive",
      });
    }
  };

  function sanitize(value: any): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width chars
    .replace(/\u00A0/g, "")                // remove non-breaking spaces
    .trim();
}

  const createMutation = useMutation({
   mutationFn: async () => {
  const primary = contacts[0]
    ? {
        ...contacts[0],
        contact_name: sanitize(contacts[0].contact_name),
        email: sanitize(contacts[0].email),
        phone: sanitize(contacts[0].phone),
      }
    : {
        contact_name: "",
        email: "",
        phone: "",
        phone_prefix: "+91",
        designation: "",
      };

  const cleanEmail = primary.email;

  // 🧹 Only throw if non-empty and invalid
  if (cleanEmail && !isValidEmail(cleanEmail)) {
    console.warn("Skipping invalid email:", cleanEmail);
    toast({
      title: "Invalid email skipped",
      description: `Bad email: ${cleanEmail}`,
      variant: "destructive",
    });
    // Don't throw — just skip setting it
  }

  const cityName = addressInfo.city
    ? addressInfo.city.split("__")[0].split("-")[0]
    : "";

  const payload: any = {
    client_name: clientInfo.client_name.trim(),
    phone: primary.phone || undefined,
    address: addressInfo.address || undefined,
    country: addressInfo.country || undefined,
    state: addressInfo.state || undefined,
    city: cityName || undefined,
    notes: JSON.stringify({
      source: clientInfo.source,
      client_type: clientInfo.client_type || undefined,
      pa_license: clientInfo.pa_license,
      payment_offerings: clientInfo.payment_offerings,
      website: clientInfo.website || undefined,
      geography: clientInfo.geography,
      txn_volume: clientInfo.txn_volume,
      product_tag_info: clientInfo.product_tag_info,
      source_value:
        clientInfo.source === "Reference"
          ? referenceConnections.length
            ? referenceConnections.join(", ")
            : undefined
          : clientInfo.source_value || undefined,
      contacts: contacts.map((c) => ({
        ...c,
        email: sanitize(c.email),
        contact_name: sanitize(c.contact_name),
      })),
    }),
    status: "active",
  };

  if (primary.contact_name) {
    payload.contact_person = primary.contact_name;
  }

  // ✅ Only include valid email
  if (cleanEmail && isValidEmail(cleanEmail)) {
    payload.email = cleanEmail;
  }

  const res = await apiClient.request("/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res;
},




    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-stats"] });
      toast({
        title: "Client created",
        description: "Client has been created successfully.",
      });
      navigate("/clients");
    },
    onError: (err: any) => {
      if (err?.message) {
        toast({
          title: "Create failed",
          description: err.message,
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  // Simple searchable combobox component
  function Combobox({
    items,
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    items: { label: string; value: string }[];
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }) {
    const [open, setOpen] = React.useState(false);
    const selected = items.find((i) => i.value === value);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            disabled={disabled}
          >
            {selected ? selected.label : placeholder || "Select..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder={placeholder || "Search..."} />
            <CommandEmpty>No results</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={`${item.value}`}
                    value={item.label}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        item.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/clients")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Clients
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Client</h1>
          <p className="text-gray-600 mt-1">
            Add a new client with company and contact details
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="client-info">Client Info</TabsTrigger>
            <TabsTrigger value="contact-info">Client Contact Info</TabsTrigger>
          </TabsList>

          <TabsContent value="client-info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" /> Client Information
                </CardTitle>
                <CardDescription>Fill basic client details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <Label>Source *</Label>
                    <Select
                      value={clientInfo.source}
                      onValueChange={(v) => {
                        setClientInfo((p) => ({
                          ...p,
                          source: v,
                          source_value: "",
                        }));
                        if (v !== "Reference") setReferenceConnections([]);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {showClientErrors && errors.source && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.source}
                      </p>
                    )}
                  </div>
                  {clientInfo.source &&
                    (() => {
                      const src = clientInfo.source;
                      if (src === "Reference") {
                        return (
                          <div className="space-y-1">
                            <Label>Referred by (select one or more)</Label>
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <MultiSelect
                                  options={(Array.isArray(connections)
                                    ? connections
                                    : []
                                  ).map((c: any) => c.name)}
                                  value={referenceConnections}
                                  onChange={setReferenceConnections}
                                  placeholder="Select connections"
                                  className="mt-1"
                                />
                              </div>
                              <Button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/connections/new?returnTo=${encodeURIComponent("/clients/create")}`,
                                  )
                                }
                              >
                                Add connection
                              </Button>
                            </div>
                          </div>
                        );
                      }
                      const meta = (() => {
                        if (src.startsWith("Email"))
                          return {
                            label: "Email ID",
                            placeholder: "name@company.com",
                            type: "email" as const,
                          };
                        if (src.startsWith("Call"))
                          return {
                            label: "Phone Number",
                            placeholder: "+91 98765 43210",
                            type: "tel" as const,
                          };
                        if (src.startsWith("LinkedIn"))
                          return {
                            label: "LinkedIn Profile URL",
                            placeholder: "https://linkedin.com/in/...",
                            type: "url" as const,
                          };
                        if (src === "Existing Client")
                          return {
                            label: "Existing Client Name/ID",
                            placeholder: "Enter client name or ID",
                            type: "text" as const,
                          };
                        if (src === "Business Team")
                          return {
                            label: "Team Member Name",
                            placeholder: "Enter internal team member name",
                            type: "text" as const,
                          };
                        if (src === "General List")
                          return {
                            label: "List Name/Link",
                            placeholder: "Enter list name or link",
                            type: "text" as const,
                          };
                        return {
                          label: "Source Information",
                          placeholder:
                            "Provide details for the selected source",
                          type: "text" as const,
                        };
                      })();
                      return (
                        <div>
                          <Label>{meta.label}</Label>
                          <Input
                            type={meta.type}
                            value={clientInfo.source_value}
                            onChange={(e) =>
                              setClientInfo((p) => ({
                                ...p,
                                source_value: e.target.value,
                              }))
                            }
                            placeholder={meta.placeholder}
                          />
                        </div>
                      );
                    })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div>
    <Label>Client Name *</Label>
    <Input
      value={clientInfo.client_name}
      onChange={(e) =>
        setClientInfo((p) => ({
          ...p,
          client_name: e.target.value,
        }))
      }
      placeholder="Enter client name"
    />
    {showClientErrors && errors.client_name && (
      <p className="text-red-600 text-xs mt-1">{errors.client_name}</p>
    )}
  </div>

  <div>
    <Label>Client Type *</Label>
    <Select
      value={clientInfo.client_type}
      onValueChange={(v) =>
        setClientInfo((p) => ({ ...p, client_type: v }))
      }
    >
      <SelectTrigger>
        <SelectValue placeholder="Select type" />
      </SelectTrigger>
      <SelectContent>
        {CLIENT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {showClientErrors && errors.client_type && (
      <p className="text-red-600 text-xs mt-1">{errors.client_type}</p>
    )}
  </div>

  {/* PA License Field */}
  <div>
    <Label>PA License</Label>
    <Select
      value={clientInfo.pa_license || ""}
      onValueChange={(v) =>
        setClientInfo((p) => ({ ...p, pa_license: v }))
      }
      disabled={clientInfo.client_type !== "PA-PG"} // enabled only for PA-PG
    >
      <SelectTrigger>
        <SelectValue placeholder="Select PA license" />
      </SelectTrigger>
      <SelectContent>
        {["Fully Approved", "In-Principle Authorization", "Application Returned", "Application Under Process"].map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
</div>






                <div>
                  <Label>Payment Offering (multi-select) *</Label>
                  <MultiSelect
                    options={PAYMENT_OFFERINGS}
                    value={clientInfo.payment_offerings}
                    onChange={(val) =>
                      setClientInfo((p) => ({ ...p, payment_offerings: val }))
                    }
                    placeholder="Select payment offerings"
                    className="mt-1"
                  />
                  {showClientErrors && errors.payment_offerings && (
                    <p className="text-red-600 text-xs mt-1">
                      {errors.payment_offerings}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        className="pl-10"
                        value={clientInfo.website}
                        onChange={(e) =>
                          setClientInfo((p) => ({
                            ...p,
                            website: e.target.value,
                          }))
                        }
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Client Geography *</Label>
                    <Select
                      value={clientInfo.geography}
                      onValueChange={(v) =>
                        setClientInfo((p) => ({ ...p, geography: v as any }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select geography" />
                      </SelectTrigger>
                      <SelectContent>
                        {GEOGRAPHY.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {showClientErrors && errors.geography && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.geography}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Txn Volume / per day in million</Label>
                    <Select
                      value={clientInfo.txn_volume}
                      onValueChange={(v) =>
                        setClientInfo((p) => ({ ...p, txn_volume: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select volume" />
                      </SelectTrigger>
                      <SelectContent>
                        {TXN_VOLUMES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Product Tag Info</Label>
                    <Input
                      value={clientInfo.product_tag_info}
                      onChange={(e) =>
                        setClientInfo((p) => ({
                          ...p,
                          product_tag_info: e.target.value,
                        }))
                      }
                      placeholder="Enter product tags"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact-info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" /> Address
                </CardTitle>
                <CardDescription>
                  All address and contact fields are optional
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Street Address</Label>
                  <Input
                    value={addressInfo.address}
                    onChange={(e) =>
                      setAddressInfo((p) => ({ ...p, address: e.target.value }))
                    }
                    placeholder="Building, street, area"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Country</Label>
                    <Combobox
                      placeholder="Search country..."
                      items={countries.map((c) => ({
                        label: c.name,
                        value: c.name,
                      }))}
                      value={addressInfo.country}
                      onChange={(v) =>
                        setAddressInfo((p) => ({
                          ...p,
                          country: v,
                          state: "",
                          city: "",
                        }))
                      }
                    />
                    {showContactErrors && errors.country && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.country}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>State</Label>
                    <Combobox
                      placeholder="Search state..."
                      items={states.map((s) => ({
                        label: s.name,
                        value: s.name,
                      }))}
                      value={addressInfo.state}
                      onChange={(v) =>
                        setAddressInfo((p) => ({ ...p, state: v, city: "" }))
                      }
                      disabled={!selectedCountry}
                    />
                    {showContactErrors && errors.state && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.state}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>City</Label>
                    <Combobox
                      placeholder="Search city..."
                      items={uniqueCities.map((ct, idx) => ({
                        label: ct.name,
                        value: `${ct.name}__${ct.stateCode || ""}-${idx}`,
                      }))}
                      value={addressInfo.city}
                      onChange={(v) =>
                        setAddressInfo((p) => ({ ...p, city: v }))
                      }
                      disabled={!selectedCountry}
                    />
                    {showContactErrors && errors.city && (
                      <p className="text-red-600 text-xs mt-1">{errors.city}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <ClientContactInformationSection
              contacts={contacts}
              onContactsChange={setContacts}
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/clients")}
          >
            Cancel
          </Button>
          {activeTab === "client-info" ? (
            <div className="space-x-3">
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
            </div>
          ) : (
            <div className="space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("client-info")}
              >
                Previous
              </Button>
              <Button type="submit">Submit</Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
