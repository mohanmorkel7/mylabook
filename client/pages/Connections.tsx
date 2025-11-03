import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Country, State, City } from "country-state-city";
import {
  Trash2,
  Edit,
  Plus,
  Search,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

type ConnectionType = (typeof CONNECTION_TYPES)[number];

type Connection = {
  id: number;
  name: string;
  type: ConnectionType | null;
  phone_prefix: string;
  phone: string;
  email?: string | null;
  designation?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  created_at?: string;
  updated_at?: string;
};

function useConnections(filters: { q?: string; type?: string }) {
  return useQuery({
    queryKey: ["connections", filters],
    queryFn: () => apiClient.getConnections(filters),
  });
}

function ConnectionForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Connection>;
  onSubmit: (data: Partial<Connection>) => void;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<Partial<Connection>>({
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
          value={form.name as string}
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
          <Label>Type</Label>
          <Select
            value={form.type || undefined}
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
            value={form.phone_prefix}
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
            value={form.phone as string}
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
              data-radix-scroll-lock-ignore
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
                  onWheelCapture={(e) => e.stopPropagation()}
                  onTouchMoveCapture={(e) => e.stopPropagation()}
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
              data-radix-scroll-lock-ignore
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
                  onWheelCapture={(e) => e.stopPropagation()}
                  onTouchMoveCapture={(e) => e.stopPropagation()}
                >
                  <CommandGroup>
                    {states.map((s) => (
                      <CommandItem
                        key={s.isoCode}
                        value={s.isoCode}
                        onSelect={(value) => {
                          const st = states.find((x) => x.isoCode === value);
                          if (st) {
                            setForm((f) => ({
                              ...f,
                              state: st.name,
                              city: "",
                            }));
                          }
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
              data-radix-scroll-lock-ignore
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
                  onWheelCapture={(e) => e.stopPropagation()}
                  onTouchMoveCapture={(e) => e.stopPropagation()}
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
                            if (stateCode) {
                              const stObj = State.getStateByCodeAndCountry(
                                stateCode,
                                selectedCountry?.isoCode || "",
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
        <Button onClick={submit}>Save</Button>
      </div>
    </div>
  );
}

export default function Connections() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const navigate = useNavigate();

  const {
    data: connections = [],
    refetch,
    isLoading,
  } = useConnections({
    q: search ? search : undefined,
    type: typeFilter && typeFilter !== "all" ? typeFilter : undefined,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Connection>) => apiClient.createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Saved", description: "Connection created" });
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast({
        title: "Create failed",
        description: String(e?.message),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: Partial<Connection> }) =>
      apiClient.updateConnection(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Updated", description: "Changes saved" });
      setEditing(null);
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast({
        title: "Update failed",
        description: String(e?.message),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Deleted", description: "Connection removed" });
    },
    onError: (e: any) => {
      toast({
        title: "Delete failed",
        description: String(e?.message),
        variant: "destructive",
      });
    },
  });

  function handleCreate(data: Partial<Connection>) {
    createMutation.mutate(data);
  }

  function handleUpdate(data: Partial<Connection>) {
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, data });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-sm text-gray-500">
            Manage your members and contacts
          </p>
        </div>
        <Button onClick={() => navigate("/connections/new")}>
          <Plus className="w-4 h-4 mr-2" /> Add member
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search & Filters</CardTitle>
          <CardDescription>
            Find connections by name, email, phone and type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search connections"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => refetch()}>
                Search
              </Button>
            </div>
            <div>
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CONNECTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <div className="col-span-full text-center text-sm text-gray-500">
            Loading...
          </div>
        )}
        {!isLoading && connections.length === 0 && (
          <div className="col-span-full text-center text-sm text-gray-500">
            No connections found
          </div>
        )}
        {connections.map((c: Connection) => (
          <Card key={c.id} className="relative h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{c.name}</CardTitle>
                {c.type && <Badge variant="secondary">{c.type}</Badge>}
              </div>
              <CardDescription>
                {c.city ? c.city + ", " : ""}
                {c.state ? c.state + ", " : ""}
                {c.country || ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Phone:</span> {c.phone_prefix}{" "}
                  {c.phone}
                </div>
                {c.email && (
                  <div>
                    <span className="text-gray-500">Email:</span> {c.email}
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="pt-4 justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/connections/${c.id}/edit`)}
              >
                <Edit className="w-4 h-4 mr-1" /> Edit
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete"
                    title="Delete"
                    className="p-2 border border-red-600 text-red-600 hover:bg-red-50 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete connection?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{c.name}"? This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate(c.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
