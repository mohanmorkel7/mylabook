import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertCircle,
  Building,
  Globe,
  Mail,
  Phone,
  Plus,
  Search,
  Target,
  User,
  Trash,
  Trash2,
  Calendar,
  DollarSign,
  MapPin,
  Upload,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useDeleteClient } from "@/hooks/useApi";
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
import { ImportClientsModal } from "@/components/ImportClientsModal";

function getInitials(name?: string) {
  if (!name) return "CL";
  const letters = (name.match(/\b\w/g) || []).slice(0, 2).join("");
  return letters.toUpperCase();
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

export default function ClientDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const openClient = (id: number) => navigate(`/clients/${id}`);
  const deleteMutation = useDeleteClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);

  const selectedMeta = useMemo(
    () => parseNotesMeta(selectedClient?.notes),
    [selectedClient],
  );
  const primaryContact = Array.isArray(selectedMeta.contacts)
    ? selectedMeta.contacts[0]
    : undefined;
  const phoneDisplay = primaryContact?.phone
    ? `${primaryContact.phone_prefix || ""} ${primaryContact.phone}`
    : selectedClient?.phone || "Not provided";
  const telHref = primaryContact?.phone
    ? `tel:${primaryContact.phone_prefix || ""}${primaryContact.phone}`.replace(
        /\s+/g,
        "",
      )
    : selectedClient?.phone
      ? `tel:${String(selectedClient.phone).replace(/\s+/g, "")}`
      : "";

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-gray-100 text-gray-700",
    onboarding: "bg-blue-100 text-blue-700",
    completed: "bg-purple-100 text-purple-700",
  };

  const priorityColors: Record<string, string> = {
    low: "bg-gray-100 text-gray-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };
  const handleDelete = async (id: number, name?: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      toast({
        title: "Client deleted",
        description: `${name || "Client"} has been removed.`,
      });
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message || "Failed to delete client",
        variant: "destructive",
      } as any);
    } finally {
      setDeletingId(null);
    }
  };

  // Fetch Clients
  const {
    data: clients = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/clients");
        return Array.isArray(result) ? result : [];
      } catch (e) {
        console.error("Failed to fetch clients", e);
        return [];
      }
    },
    staleTime: 30000,
  });

  // Fetch Stats
  const {
    data: stats = { total: 0, active: 0, onboarding: 0, completed: 0 },
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["client-stats"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/clients/stats");
        return result || { total: 0, active: 0, onboarding: 0, completed: 0 };
      } catch (e) {
        console.error("Failed to fetch client stats", e);
        return { total: 0, active: 0, onboarding: 0, completed: 0 };
      }
    },
    staleTime: 60000,
  });

  const { data: allOfferings = [] } = useQuery({
    queryKey: ["business-offerings"],
    queryFn: () => apiClient.getBusinessOfferings(),
    staleTime: 10000,
  });

  const StatusDot = ({ status }: { status?: string | null }) => {
    const color =
      status === "completed"
        ? "bg-green-500"
        : status === "in_progress" || status === "in-progress"
          ? "bg-blue-500"
          : "bg-gray-400";
    return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
  };

  function BusinessOfferingItem({ offering }: { offering: any }) {
    return (
      <div
        className="px-2.5 py-2 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/business-offerings/${offering.id}`);
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={offering.client_status} />
            <span className="text-sm font-medium text-gray-800 truncate max-w-[220px]">
              {offering.solution || "Offering"}
              {offering.product ? ` - ${offering.product}` : ""}
            </span>
          </div>
          {offering.client_status && (
            <Badge className="capitalize">
              {String(offering.client_status).replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>
    );
  }

  function ClientLinkedBusinessOfferings({ clientId }: { clientId: number }) {
    const tagged = useMemo(
      () =>
        (allOfferings as any[]).filter((o: any) => o.client_id === clientId),
      [allOfferings, clientId],
    );

    if (!tagged || tagged.length === 0) return null;

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" /> Tagged Business
            Offerings
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            {tagged.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {tagged.slice(0, 4).map((o: any) => (
            <BusinessOfferingItem key={o.id} offering={o} />
          ))}
          {tagged.length > 4 && (
            <div className="text-xs text-gray-500">
              +{tagged.length - 4} more
            </div>
          )}
        </div>
      </div>
    );
  }

  const filtered = useMemo(() => {
    if (!searchTerm) return clients;
    const s = searchTerm.toLowerCase();
    return clients.filter(
      (c: any) =>
        (c.client_name || "").toLowerCase().includes(s) ||
        (c.contact_person || "").toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s),
    );
  }, [clients, searchTerm]);

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Failed to Load Clients
            </h3>
            <p className="text-gray-600 mb-4">
              There was an error loading the client dashboard.
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
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
          <h1 className="text-3xl font-bold text-gray-900">Client Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage clients and onboarding</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setImportModalOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => navigate("/clients/create")}>
            <Plus className="w-4 h-4 mr-2" />
            Create Client
          </Button>
        </div>
      </div>

      {/* Stats */}
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
                  <p className="text-blue-600 text-sm font-medium">
                    Total Clients
                  </p>
                  <p className="text-2xl font-bold text-blue-900">
                    {stats?.total || 0}
                  </p>
                </div>
                <div className="bg-blue-200 p-3 rounded-full">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 text-sm font-medium">Active</p>
                  <p className="text-2xl font-bold text-green-900">
                    {stats?.active || 0}
                  </p>
                </div>
                <div className="bg-green-200 p-3 rounded-full">
                  <Building className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-600 text-sm font-medium">
                    Onboarding
                  </p>
                  <p className="text-2xl font-bold text-orange-900">
                    {stats?.onboarding || 0}
                  </p>
                </div>
                <div className="bg-orange-200 p-3 rounded-full">
                  <User className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-600 text-sm font-medium">
                    Completed
                  </p>
                  <p className="text-2xl font-bold text-purple-900">
                    {stats?.completed || 0}
                  </p>
                </div>
                <div className="bg-purple-200 p-3 rounded-full">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search clients by name, contact, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-gray-600">Loading clients...</p>
            </div>
          ) : (filtered || []).length > 0 ? (
            <div className="space-y-4">
              {(filtered || []).map((c: any) => {
                const meta = parseNotesMeta(c.notes);
                const source = meta.source || meta.lead_source;
                const geography = meta.geography || meta.client_geography;
                const website = c.website || meta.website;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openClient(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openClient(c.id);
                      }
                    }}
                    className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-lg transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 relative"
                  >
                    <div
                      className="hidden"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            aria-label={`Delete ${c.client_name || "client"}`}
                            disabled={deletingId === c.id}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete client?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will
                              permanently delete{" "}
                              {c.client_name || "this client"} and remove
                              related data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              onClick={(e) => e.stopPropagation()}
                            >
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(c.id, c.client_name);
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10 bg-blue-100 text-blue-700">
                            <AvatarFallback>
                              {getInitials(c.client_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-lg">
                                {c.client_name || "Unknown Client"}
                              </h3>
                              {source && (
                                <Badge variant="secondary">
                                  {String(source)}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 text-sm text-gray-700 flex flex-wrap gap-4">
                              {c.contact_person && (
                                <span>
                                  Contact:{" "}
                                  <span className="font-medium">
                                    {c.contact_person}
                                  </span>
                                </span>
                              )}
                              {c.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-4 h-4 text-gray-400" />{" "}
                                  {c.email}
                                </span>
                              )}
                              {c.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-4 h-4 text-gray-400" />{" "}
                                  {c.phone}
                                </span>
                              )}
                              {geography && (
                                <span className="flex items-center gap-1">
                                  <Globe className="w-4 h-4 text-gray-400" />{" "}
                                  {String(geography)}
                                </span>
                              )}
                              {website && (
                                <a
                                  href={website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  Website
                                </a>
                              )}
                              {meta.client_type && (
                                <span>
                                  Client Type:{" "}
                                  <span className="font-medium">
                                    {String(meta.client_type)}
                                  </span>
                                </span>
                              )}
                              {Array.isArray(meta.payment_offerings) &&
                                meta.payment_offerings.length > 0 && (
                                  <span className="flex items-center gap-2">
                                    <span>Payment Offering:</span>
                                    <span className="flex flex-wrap gap-1">
                                      {meta.payment_offerings.map(
                                        (p: string) => (
                                          <Badge key={p} variant="outline">
                                            {p}
                                          </Badge>
                                        ),
                                      )}
                                    </span>
                                  </span>
                                )}
                            </div>

                            <ClientLinkedBusinessOfferings clientId={c.id} />
                          </div>
                          <div className="flex items-center gap-2">
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
                                    Delete Client
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "
                                    {c.client_name || "this client"}"? This will
                                    also delete all related business offerings
                                    and follow-ups. This action cannot be
                                    undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(c.id, c.client_name);
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
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Clients Found
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm
                  ? "Try adjusting your search."
                  : "Get started by creating your first client."}
              </p>
              <Button onClick={() => navigate("/clients/create")}>
                <Plus className="w-4 h-4 mr-2" />
                Create Client
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {false && (
        <Dialog open={quickViewOpen} onOpenChange={setQuickViewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {selectedClient?.client_name || "Client"}
              </DialogTitle>
              <DialogDescription>
                Snapshot, contacts, and quick actions
              </DialogDescription>
            </DialogHeader>
            {selectedClient && (
              <div className="space-y-6">
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-md border p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">Status</div>
                      <div
                        className={`inline-flex items-center px-2 py-0.5 rounded ${statusColors[selectedClient.status || "active"] || statusColors.active}`}
                      >
                        {selectedClient.status || "active"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">Priority</div>
                      <div
                        className={`inline-flex items-center px-2 py-0.5 rounded ${priorityColors[selectedClient.priority || "medium"] || priorityColors.medium}`}
                      >
                        {selectedClient.priority || "medium"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">
                        Account Owner
                      </div>
                      <div className="font-medium">
                        {selectedClient.sales_rep_name || "-"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">
                        Expected Value
                      </div>
                      <div className="font-medium">
                        {selectedClient.expected_value != null
                          ? `$${Number(selectedClient.expected_value).toLocaleString()}`
                          : "-"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">
                        Start Date
                      </div>
                      <div className="font-medium">
                        {selectedClient.start_date
                          ? new Date(
                              selectedClient.start_date,
                            ).toLocaleDateString()
                          : "-"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">Industry</div>
                      <div className="font-medium">
                        {selectedClient.industry || "-"}
                      </div>
                    </div>
                  </div>
                </div>

                {Array.isArray(selectedMeta.contacts) &&
                  selectedMeta.contacts.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold mb-2">Contacts</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedMeta.contacts.map((c: any, idx: number) => (
                          <div
                            key={`contact-${idx}`}
                            className="rounded-md border p-4 bg-white"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-semibold text-gray-900">
                                  {c.name ||
                                    selectedClient.contact_person ||
                                    "Contact"}
                                </div>
                                {c.role && (
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {c.role}
                                  </div>
                                )}
                              </div>
                              {c.primary && (
                                <Badge variant="secondary">Primary</Badge>
                              )}
                            </div>
                            <div className="mt-3 space-y-2 text-sm">
                              {(c.email || selectedClient.email) && (
                                <div className="flex items-center gap-2 text-gray-700">
                                  <Mail className="w-4 h-4 text-gray-400" />
                                  <a
                                    href={`mailto:${c.email || selectedClient.email}`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {c.email || selectedClient.email}
                                  </a>
                                </div>
                              )}
                              {(c.phone || selectedClient.phone) && (
                                <div className="flex items-center gap-2 text-gray-700">
                                  <Phone className="w-4 h-4 text-gray-400" />
                                  <span>
                                    {`${c.phone_prefix || ""} ${c.phone || selectedClient.phone}`.trim()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div>
                  <div className="text-sm font-semibold mb-2">
                    Quick Actions
                  </div>
                  <div className="space-y-2">
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() =>
                        selectedClient?.email &&
                        (window.location.href = `mailto:${selectedClient.email}`)
                      }
                      disabled={!selectedClient?.email}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send Email
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() =>
                        telHref && (window.location.href = telHref)
                      }
                      disabled={!telHref}
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Call Phone
                    </Button>
                    {(selectedClient?.website || selectedMeta.website) && (
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() =>
                          window.open(
                            selectedClient?.website || selectedMeta.website,
                            "_blank",
                          )
                        }
                      >
                        <Globe className="w-4 h-4 mr-2" />
                        Open Website
                      </Button>
                    )}
                    {selectedClient?.address && (
                      <div className="text-xs text-gray-500 mt-2">
                        <div className="font-medium text-gray-700 mb-1">
                          Address
                        </div>
                        <div className="rounded-md border bg-gray-50 p-2">
                          {selectedClient.address}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      <ImportClientsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImportSuccess={() => {
          setImportModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["clients"] });
          queryClient.invalidateQueries({ queryKey: ["client-stats"] });
        }}
      />
    </div>
  );
}
