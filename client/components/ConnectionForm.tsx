import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Country, State, City } from "country-state-city";
import { useToast } from "@/hooks/use-toast";
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
import { ChevronsUpDown, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CONNECTION_TYPES = [
  "Business Team",
  "Internal Team",
  "VC",
  "Advisory Board",
  "Consultants",
  "Client",
  "General",
] as const;

type ConnectionType = (typeof CONNECTION_TYPES)[number];

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

export type ConnectionFormValues = {
  name: string;
  type: ConnectionType | null;
  phone_prefix: string;
  phone: string;
  email?: string | null;
  designation?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
};

export default function ConnectionForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  initial?: Partial<ConnectionFormValues>;
  onSubmit: (data: Partial<ConnectionFormValues>) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<Partial<ConnectionFormValues>>({
    name: initial?.name || "",
    type: (initial?.type as ConnectionType) || null,
    phone_prefix: initial?.phone_prefix || "+91",
    phone: initial?.phone || "",
    email: initial?.email || "",
    designation: (initial?.designation as string) || "",
    country: initial?.country || "",
    state: initial?.state || "",
    city: initial?.city || "",
  });

  const countries = Country.getAllCountries();
  const selectedCountry = countries.find((c) => c.name === form.country);
  const states = selectedCountry
    ? State.getStatesOfCountry(selectedCountry.isoCode)
    : [];
  const selectedState = states.find((s) => s.name === form.state);
  const cities = selectedCountry
    ? selectedState
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : City.getCitiesOfCountry(selectedCountry.isoCode)
    : [];

  function submit() {
    const missing: string[] = [];
    if (!form.name || !String(form.name).trim()) missing.push("name");
    if (!form.type || !String(form.type).trim()) missing.push("type");
    if (!form.phone_prefix || !String(form.phone_prefix).trim())
      missing.push("phone_prefix");
    if (!form.phone || !String(form.phone).trim()) missing.push("phone");
    if (missing.length) {
      toast({
        title: "Missing required",
        description: `Please fill: ${missing.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    onSubmit({
      name: String(form.name).trim(),
      type: form.type || null,
      phone_prefix: String(form.phone_prefix).trim(),
      phone: String(form.phone).trim(),
      email: form.email ? String(form.email).trim() : null,
      designation: form.designation ? String(form.designation).trim() : null,
      country: form.country ? String(form.country).trim() : null,
      state: form.state ? String(form.state).trim() : null,
      city: form.city ? String(form.city).trim() : null,
    });
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Name full width */}
      <div>
        <Label>Name *</Label>
        <Input
          value={(form.name as string) || ""}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Member name"
        />
      </div>

      {/* Row 2: Designation | Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Designation</Label>
          <Input
            value={(form.designation as string) || ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, designation: e.target.value }))
            }
            placeholder="e.g. Senior Manager"
          />
        </div>
        <div>
          <Label>Type *</Label>
          <Select
            value={(form.type as any) || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, type: v as any }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {CONNECTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Phone Prefix | Phone | Email (reduced prefix width) */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="md:col-span-1">
          <Label>Phone Prefix *</Label>
          <Select
            value={form.phone_prefix as string}
            onValueChange={(v) => setForm((f) => ({ ...f, phone_prefix: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select prefix" />
            </SelectTrigger>
            <SelectContent>
              {PHONE_PREFIXES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Phone *</Label>
          <Input
            value={(form.phone as string) || ""}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Phone number"
          />
        </div>
        <div className="md:col-span-3">
          <Label>Email</Label>
          <Input
            type="email"
            value={(form.email as string) || ""}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="name@example.com"
          />
        </div>
      </div>

      {/* Row 4: Location (Country / State / City) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Country</Label>
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={false}
                className="w-full justify-between"
              >
                {form.country || "Select country"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="w-[--radix-popover-trigger-width] p-0 max-h-80"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              data-radix-scroll-lock-ignore
            >
              <Command>
                <CommandInput placeholder="Search country..." />
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandList
                  className="max-h-72 overflow-y-auto overscroll-contain"
                  data-radix-scroll-lock-ignore
                >
                  <CommandGroup>
                    {countries.map((c) => (
                      <CommandItem
                        key={c.isoCode}
                        value={c.name}
                        onSelect={(value) => {
                          setForm((f) => ({
                            ...f,
                            country: value,
                            state: "",
                            city: "",
                          }));
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            form.country === c.name
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label>State</Label>
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={false}
                className="w-full justify-between"
                disabled={!selectedCountry}
              >
                {form.state || "Select state"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="w-[--radix-popover-trigger-width] p-0 max-h-80"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              data-radix-scroll-lock-ignore
            >
              <Command>
                <CommandInput placeholder="Search state..." />
                <CommandEmpty>No state found.</CommandEmpty>
                <CommandList
                  className="max-h-72 overflow-y-auto overscroll-contain"
                  data-radix-scroll-lock-ignore
                >
                  <CommandGroup>
                    {states.map((s) => (
                      <CommandItem
                        key={s.isoCode}
                        value={s.name}
                        onSelect={(value) => {
                          setForm((f) => ({ ...f, state: value, city: "" }));
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            form.state === s.name ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {s.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label>City</Label>
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={false}
                className="w-full justify-between"
                disabled={!selectedCountry}
              >
                {form.city || "Select city"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="w-[--radix-popover-trigger-width] p-0 max-h-80"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              data-radix-scroll-lock-ignore
            >
              <Command>
                <CommandInput placeholder="Search city..." />
                <CommandEmpty>No city found.</CommandEmpty>
                <CommandList
                  className="max-h-72 overflow-y-auto overscroll-contain"
                  data-radix-scroll-lock-ignore
                >
                  <CommandGroup>
                    {cities.map((c: any) => {
                      const val = `${c.name}|${c.stateCode || ""}`;
                      return (
                        <CommandItem
                          key={val}
                          value={val}
                          onSelect={(value) => {
                            const [name, stateCode] = value.split("|");
                            setForm((f) => ({ ...f, city: name }));
                            if (stateCode && selectedCountry?.isoCode) {
                              const stObj = State.getStateByCodeAndCountry(
                                stateCode,
                                selectedCountry.isoCode,
                              );
                              if (stObj)
                                setForm((f) => ({ ...f, state: stObj.name }));
                            }
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.city === c.name
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {c.name}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
        )}
        <Button onClick={submit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
