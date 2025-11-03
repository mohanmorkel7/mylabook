import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClient, useUpdateClient } from "@/hooks/useApi";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { Country, State, City } from "country-state-city";
import {
  Plus,
  Minus,
  Save,
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseNotesMeta(notes?: string | null): any {
  if (!notes) return {};
  try {
    const obj = JSON.parse(notes);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export default function ClientEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateClient();

  const {
    data: originalClient,
    isLoading,
    error,
  } = useClient(parseInt(id || "0"));

  const [activeTab, setActiveTab] = useState("client-info");
  const [showClientErrors, setShowClientErrors] = useState(false);
  const [showContactErrors, setShowContactErrors] = useState(false);

  const [clientInfo, setClientInfo] = useState({
    source: "",
    client_name: "",
    client_type: "",
    pa_license:"",
    payment_offerings: [] as string[],
    website: "",
    geography: "" as "" | (typeof GEOGRAPHY)[number],
    txn_volume: "",
    product_tag_info: "",
    source_value: "",
  });

  const [referenceConnections, setReferenceConnections] = useState<string[]>(
    [],
  );

  const [contacts, setContacts] = useState<
    {
      contact_name: string;
      designation: string;
      phone_prefix: string;
      phone: string;
      email: string;
      linkedin_profile_link?: string;
    }[]
  >([
    {
      contact_name: "",
      designation: "",
      phone_prefix: "+91",
      phone: "",
      email: "",
      linkedin_profile_link: "",
    },
  ]);

  const [addressInfo, setAddressInfo] = useState({
    address: "",
    country: "",
    state: "",
    city: "",
  });

  // Populate initial data from existing client
  useEffect(() => {
    if (!originalClient) return;
    const meta = parseNotesMeta(originalClient.notes);
    setClientInfo({
      source: meta.source || "",
      client_name: originalClient.client_name || "",
      client_type: meta.client_type || "",
      pa_license: meta.pa_license ||"",
      payment_offerings: Array.isArray(meta.payment_offerings)
        ? meta.payment_offerings
        : [],
      website: originalClient.website || meta.website || "",
      geography: (meta.geography as any) || "",
      txn_volume: meta.txn_volume || "",
      product_tag_info: meta.product_tag_info || "",
      source_value: meta.source_value || "",
    });

    if (meta.source === "Reference") {
      setReferenceConnections(
        String(meta.source_value || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }

    // Contacts
    const primary = {
      contact_name:
        originalClient.contact_person || meta.contacts?.[0]?.contact_name || "",
      designation: meta.contacts?.[0]?.designation || "",
      phone_prefix: meta.contacts?.[0]?.phone_prefix || "+91",
      phone: originalClient.phone || meta.contacts?.[0]?.phone || "",
      email: originalClient.email || meta.contacts?.[0]?.email || "",
      linkedin_profile_link: meta.contacts?.[0]?.linkedin_profile_link || "",
    };
    const others = Array.isArray(meta.contacts) ? meta.contacts.slice(1) : [];
    setContacts([primary, ...others]);

    // Address
    setAddressInfo({
      address: originalClient.address || meta.address || "",
      country: originalClient.country || meta.country || "",
      state: originalClient.state || meta.state || "",
      city: originalClient.city || meta.city || "",
    });
  }, [originalClient]);

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

  // Normalize city value to match options format (e.g., "City" -> "City-STATE") so it shows as selected
  useEffect(() => {
    if (!addressInfo.city) return;
    const optionValues = uniqueCities.map(
      (c) => `${c.name}${c.stateCode ? `-${c.stateCode}` : ""}`,
    );
    const hasExact = optionValues.includes(addressInfo.city);
    if (!hasExact) {
      const match = optionValues.find(
        (opt) => opt.split("-")[0] === addressInfo.city,
      );
      if (match) {
        setAddressInfo((p) => ({ ...p, city: match }));
      }
    }
  }, [addressInfo.city, JSON.stringify(uniqueCities)]);

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiClient.getConnections(),
  });

  // Validation
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!clientInfo.source) e.source = "Required";
    if (!clientInfo.client_name.trim()) e.client_name = "Required";
    if (!clientInfo.client_type) e.client_type = "Required";
    if (clientInfo.payment_offerings.length === 0)
      e.payment_offerings = "Select at least one";
    if (!clientInfo.geography) e.geography = "Required";
    if (!addressInfo.country) e.country = "Required";
    if (!addressInfo.state) e.state = "Required";
    if (!addressInfo.city) e.city = "Required";
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setShowContactErrors(true);
    if (Object.keys(contactTabErrors).length > 0) {
      toast({
        title: "Missing address",
        description: "Country, State and City are required",
        variant: "destructive",
      });
      setActiveTab("contact-info");
      return;
    }

    try {
      const primary = contacts[0] || {
        contact_name: "",
        email: "",
        phone: "",
        phone_prefix: "+91",
        designation: "",
      };
      const cityName = addressInfo.city
        ? addressInfo.city.split("__")[0].split("-")[0]
        : "";
      const payload: any = {
        client_name: clientInfo.client_name.trim(),
        contact_person: primary.contact_name.trim(),
        email: primary.email.trim(),
        phone: primary.phone?.trim() || undefined,
        address: addressInfo.address || undefined,
        country: addressInfo.country || undefined,
        state: addressInfo.state || undefined,
        city: cityName || undefined,
        notes: JSON.stringify({
          source: clientInfo.source,
          client_type: clientInfo.client_type || undefined,
          pa_license: clientInfo.pa_license || undefined,
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
          contacts,
        }),
      };

      await updateMutation.mutateAsync({
        id: parseInt(id),
        clientData: payload,
      });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-stats"] });
      toast({
        title: "Client updated",
        description: "Changes saved successfully",
      });
      navigate(`/clients/${id}`);
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.message || "Unable to update client",
        variant: "destructive",
      });
    }
  };

  const updateContact = (idx: number, key: string, value: string) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
    );
  };

  const addContact = () =>
    setContacts((prev) => [
      ...prev,
      {
        contact_name: "",
        designation: "",
        phone_prefix: "+91",
        phone: "",
        email: "",
        linkedin_profile_link: "",
      },
    ]);
  const removeContact = (idx: number) =>
    setContacts((prev) => prev.filter((_, i) => i !== idx));

  if (isLoading || !originalClient) {
    return (
      <div className="p-6">
        <div className="text-center">Loading client details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center text-red-600">
          Error loading client details
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/clients/${id}`)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Client
        </Button>



        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Client</h1>
          <p className="text-gray-600 mt-1">
            Update company and contact details
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="client-info">Client Info</TabsTrigger>
            <TabsTrigger value="contact-info">Contact & Address</TabsTrigger>
          </TabsList>

          <TabsContent value="client-info" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" /> Client Information
                </CardTitle>
                <CardDescription>Update basic client details</CardDescription>
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
                                    `/connections/new?returnTo=${encodeURIComponent(`/clients/${id}/edit`)}`,
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
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
  {/* Client Name */}
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

  {/* Client Type */}
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

  {/* PA License */}
  <div>
    <Label>PA License</Label>
    <Select
      value={clientInfo.pa_license || ""}
      onValueChange={(v) =>
        setClientInfo((p) => ({ ...p, pa_license: v }))
      }
      disabled={clientInfo.client_type !== "PA-PG"}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select PA license" />
      </SelectTrigger>
      <SelectContent>
        {[
          "Fully Approved",
          "In-Principle Authorization",
          "Application Returned",
          "Application Under Process",
        ].map((option) => (
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
                  Address is optional, Country/State/City are mandatory
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
                    <Label>Country *</Label>
                    <Combobox
                      placeholder="Search country..."
                      value={addressInfo.country}
                      onChange={(val) =>
                        setAddressInfo((p) => ({
                          ...p,
                          country: val,
                          state: "",
                          city: "",
                        }))
                      }
                      options={countries.map((c) => c.name)}
                    />
                    {showContactErrors && errors.country && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.country}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>State *</Label>
                    <Combobox
                      placeholder="Search state..."
                      value={addressInfo.state}
                      onChange={(val) =>
                        setAddressInfo((p) => ({ ...p, state: val, city: "" }))
                      }
                      options={states.map((s) => s.name)}
                      disabled={!addressInfo.country}
                    />
                    {showContactErrors && errors.state && (
                      <p className="text-red-600 text-xs mt-1">
                        {errors.state}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Combobox
                      placeholder="Search city..."
                      value={addressInfo.city}
                      onChange={(val) =>
                        setAddressInfo((p) => ({ ...p, city: val }))
                      }
                      options={uniqueCities.map(
                        (c) =>
                          `${c.name}${c.stateCode ? `-${c.stateCode}` : ""}`,
                      )}
                      disabled={!addressInfo.state}
                    />
                    {showContactErrors && errors.city && (
                      <p className="text-red-600 text-xs mt-1">{errors.city}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" /> Client Contact Information
                </CardTitle>
                <CardDescription>
                  Primary and additional contacts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {contacts.map((c, idx) => (
                  <div key={idx} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Contact #{idx + 1}</Badge>
                      {contacts.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeContact(idx)}
                        >
                          <Minus className="w-4 h-4 mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={c.contact_name}
                          onChange={(e) =>
                            updateContact(idx, "contact_name", e.target.value)
                          }
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <Label>Designation</Label>
                        <Input
                          value={c.designation}
                          onChange={(e) =>
                            updateContact(idx, "designation", e.target.value)
                          }
                          placeholder="Job title"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            className="pl-10"
                            value={c.email}
                            onChange={(e) =>
                              updateContact(idx, "email", e.target.value)
                            }
                            placeholder="name@company.com"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <div className="flex gap-2">
                          <Select
                            value={c.phone_prefix || "+91"}
                            onValueChange={(v) =>
                              updateContact(idx, "phone_prefix", v)
                            }
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PHONE_PREFIXES.map((p) => (
                                <SelectItem key={p.code} value={p.code}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative flex-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              className="pl-10"
                              value={c.phone}
                              onChange={(e) =>
                                updateContact(idx, "phone", e.target.value)
                              }
                              placeholder="98765 43210"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>LinkedIn Profile Link (Optional)</Label>
                      <Input
                        value={c.linkedin_profile_link || ""}
                        onChange={(e) =>
                          updateContact(
                            idx,
                            "linkedin_profile_link",
                            e.target.value,
                          )
                        }
                        placeholder="https://linkedin.com/in/..."
                        type="url"
                      />
                    </div>
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addContact}>
                  <Plus className="w-4 h-4 mr-1" /> Add Another Contact
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/clients/${id}`)}
          >
            Cancel
          </Button>
          {activeTab === "client-info" ? (
            <div className="flex gap-2">
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" /> Save Changes
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("client-info")}
              >
                Previous
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" /> Save Changes
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o === value) || "";
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
            disabled && "opacity-60 cursor-not-allowed",
          )}
          disabled={disabled}
        >
          {selected ? selected : placeholder || "Select option"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder={placeholder || "Search..."} />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(currentValue) => {
                    onChange(currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
