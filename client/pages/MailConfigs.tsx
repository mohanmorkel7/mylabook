import React, { useState, useEffect } from "react";

// Utility to escape HTML in values to avoid accidental rendering of user-supplied content
const escapeHtml = (unsafe: string | undefined) => {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Edit2,
  Trash2,
  Plus,
  Eye,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface User {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  firstname?: string;
  lastname?: string;
  type?: string;
  email?: string;
}

interface EmailRule {
  id: string;
  fieldType: "From" | "To" | "Cc" | "Subject" | "Body";
  operator?: "Starts with" | "Contains" | "Ends with" | "domain";
  value: string;
  domain?: string;
  nextOperator: "AND" | "OR" | "END";
}

interface SourceConfig {
  id: string;
  type: "Email" | "Slack";
  emailSource?: string;
  customEmailSource?: string;
  slackType?: "Channel" | "Workspace";
  slackName?: string;
  emailRules?: EmailRule[];
}

interface MailConfig {
  id: number;
  name: string;
  description?: string;
  field_type: "subject" | "fromEmail" | "toEmail" | "body";
  field_value: string;
  project_id: number;
  priority_id: number;
  assigned_to_id: number;
  watcher_user_ids: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sources?: SourceConfig[];
  team?: string;
}

const PRIORITY_NAMES: Record<number, string> = {
  1: "Low",
  2: "Normal",
  3: "High",
  4: "Urgent",
  5: "Immediate",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-blue-100 text-blue-800",
  2: "bg-gray-100 text-gray-800",
  3: "bg-orange-100 text-orange-800",
  4: "bg-red-100 text-red-800",
  5: "bg-red-200 text-red-900",
};

const PRIORITY_SLA_MAP: Record<number, string> = {
  4: "2 Hours",
  3: "5 Hours",
  2: "24 Hours",
};

export default function MailConfigs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [configs, setConfigs] = useState<MailConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);
  const [selectedConfigPreview, setSelectedConfigPreview] =
    useState<MailConfig | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
    fetchUsers();
  }, []);

  const fetchConfigs = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/mail-configs");
      setConfigs(Array.isArray(response) ? response : response.data || []);
    } catch (error) {
      console.error("Error fetching mail configs:", error);
      toast({
        title: "Error",
        description: "Failed to load mail configs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const resp = await api.get("/users");
      const list = (resp && (resp.users || resp.data || resp)) || [];
      setUsers(list as User[]);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleDeleteClick = (configId: number) => {
    setConfigToDelete(configId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!configToDelete) return;

    try {
      await api.delete(`/mail-configs/${configToDelete}`);
      toast({
        title: "Success",
        description: "Mail config deleted successfully",
      });
      fetchConfigs();
      setDeleteConfirmOpen(false);
      setConfigToDelete(null);
    } catch (error) {
      console.error("Error deleting mail config:", error);
      toast({
        title: "Error",
        description: "Failed to delete mail config",
        variant: "destructive",
      });
    }
  };

  const getAssignedUserName = (userId: number): string => {
    const user = users.find((u) => Number(u.id) === Number(userId));
    if (!user) return "Unassigned";
    if (user.name?.trim()) return user.name.trim();
    if (user.firstname && user.lastname) {
      return `${user.firstname} ${user.lastname}`;
    }
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return user.email || "Unknown";
  };

  const countRules = (config: MailConfig): number => {
    if (!config.sources || config.sources.length === 0) return 0;
    return config.sources.reduce(
      (total, source) => total + (source.emailRules?.length || 0),
      0,
    );
  };

  // Map demand IDs used in mail config rules to human-friendly SLA labels
  const DEMAND_SLA_MAP: Record<number, string> = {
    0: "2 Hours",
    1: "5 Hours",
    2: "24 Hours",
  };

  // Derive SLA label for a mail config. Prefer explicit demand value from sources' rules,
  // fallback to priority-based mapping when no demand is present.
  const getConfigSlaLabel = (config: MailConfig | null | undefined): string => {
    if (!config) return "-";

    // Look for demand on any email rule across sources (prefer the first explicit demand)
    if (config.sources && config.sources.length > 0) {
      for (const src of config.sources) {
        if (src.emailRules && src.emailRules.length > 0) {
          for (const rule of src.emailRules) {
            // @ts-ignore - some rules may include a `demand` property
            if (typeof (rule as any).demand === "number") {
              const d = (rule as any).demand as number;
              if (DEMAND_SLA_MAP[d]) return DEMAND_SLA_MAP[d];
            }
          }
        }
      }
    }

    // Fallback to priority mapping
    return (
      PRIORITY_SLA_MAP[config.priority_id] ||
      PRIORITY_NAMES[config.priority_id] ||
      "-"
    );
  };

  const handleOpenPreview = (config: MailConfig) => {
    setSelectedConfigPreview(config);
    setPreviewOpen(true);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Mail Configurations
          </h1>
          <p className="text-gray-600 mt-2">
            Manage email-to-ticket automation configurations
          </p>
        </div>
        <Button onClick={() => navigate("/mail-configs/create")} size="lg">
          <Plus className="h-5 w-5 mr-2" />
          Create Config
        </Button>
      </div>

      {/* Info box */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">How it works</p>
              <p className="text-sm text-blue-800 mt-1">
                Configurations are processed in the background. When matching
                emails are received, tickets are automatically created with the
                specified details.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && configs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : configs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">
                No mail configs created yet
              </p>
              <p className="text-gray-500 mt-2">
                Click "Create Config" to start automating email-to-ticket
                conversion
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0 border rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="bg-gray-50 border-b grid grid-cols-12 gap-4 p-4 font-semibold text-sm text-gray-700">
            <div className="col-span-3">Configuration</div>
            <div className="col-span-2">Team</div>
            <div className="col-span-1 text-center">Sources</div>
            <div className="col-span-1 text-center">Rules</div>
            <div className="col-span-2">Assigned To</div>
            <div className="col-span-2">SLA / Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {/* Table Rows */}
          {configs.map((config) => (
            <div
              key={config.id}
              className="border-b hover:bg-gray-50 transition-colors"
            >
              {/* Main Row */}
              <div
                className={`grid grid-cols-12 gap-4 p-4 items-center ${!config.is_active ? "opacity-60" : ""}`}
              >
                <div className="col-span-3 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {config.name}
                  </h3>
                  {config.description && (
                    <p className="text-xs text-gray-600 truncate mt-1">
                      {config.description}
                    </p>
                  )}
                </div>

                <div className="col-span-2">
                  {config.team ? (
                    <Badge variant="secondary" className="text-xs">
                      {config.team}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-500">-</span>
                  )}
                </div>

                <div className="col-span-1 text-center">
                  <Badge variant="outline" className="text-xs">
                    {config.sources?.length || 0}
                  </Badge>
                </div>

                <div className="col-span-1 text-center">
                  <Badge variant="outline" className="text-xs">
                    {countRules(config)}
                  </Badge>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-gray-900 truncate">
                    {getAssignedUserName(config.assigned_to_id)}
                  </p>
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <Badge
                    className={`text-xs ${PRIORITY_COLORS[config.priority_id]}`}
                  >
                    {getConfigSlaLabel(config)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      config.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {config.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="col-span-1 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenPreview(config)}
                    title="View details"
                    className="h-8 w-8 p-0"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/mail-configs/edit/${config.id}`)}
                    title="Edit config"
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(config.id)}
                    className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                    title="Delete config"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Expandable Details */}
              {config.sources && config.sources.length > 0 && (
                <div className="bg-gray-50 border-t px-4 py-2 text-xs">
                  <details className="cursor-pointer">
                    <summary className="font-medium text-gray-700 py-2">
                      Email Rules & Configuration Details
                    </summary>
                    <div className="mt-3 space-y-2 text-gray-600">
                      {config.sources.map((source, idx) => (
                        <div
                          key={source.id}
                          className="bg-white p-2 rounded border"
                        >
                          <p className="font-medium text-gray-900">
                            {source.type} Source {idx + 1}
                          </p>
                          {source.type === "Email" && (
                            <div className="text-xs space-y-1 mt-1">
                              <p>
                                <span className="text-gray-500">Email:</span>{" "}
                                <span className="font-mono">
                                  {source.customEmailSource ||
                                    source.emailSource}
                                </span>
                              </p>
                              {source.emailRules &&
                                source.emailRules.length > 0 && (
                                  <div>
                                    <p className="text-gray-500 mb-1">Rules:</p>
                                    {source.emailRules.map((rule, rIdx) => (
                                      <div
                                        key={rule.id}
                                        className="text-gray-600 ml-2"
                                      >
                                        {rIdx + 1}. {rule.fieldType}
                                        {rule.domain ? (
                                          <span className="ml-1">
                                            {" "}
                                            ={" "}
                                            <span className="font-mono">
                                              {escapeHtml(rule.domain)}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="ml-1">
                                            {" "}
                                            {rule.operator} "
                                            <span className="font-mono">
                                              {escapeHtml(rule.value)}
                                            </span>
                                            "
                                          </span>
                                        )}
                                        {rule.nextOperator !== "END" && (
                                          <span className="font-medium ml-1">
                                            {rule.nextOperator}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                          )}
                          {source.type === "Slack" && (
                            <div className="text-xs space-y-1 mt-1">
                              <p>
                                <span className="text-gray-500">Type:</span>{" "}
                                <span className="font-medium">
                                  {source.slackType}
                                </span>
                              </p>
                              <p>
                                <span className="text-gray-500">Name:</span>{" "}
                                <span className="font-mono">
                                  {source.slackName}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      {previewOpen && selectedConfigPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-auto">
            <CardHeader className="sticky top-0 bg-white border-b flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">
                  {selectedConfigPreview.name}
                </CardTitle>
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge
                    className={
                      selectedConfigPreview.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }
                  >
                    {selectedConfigPreview.is_active ? "Active" : "Inactive"}
                  </Badge>
                  {selectedConfigPreview.team && (
                    <Badge variant="secondary">
                      {selectedConfigPreview.team}
                    </Badge>
                  )}
                  <Badge
                    className={
                      PRIORITY_COLORS[selectedConfigPreview.priority_id]
                    }
                  >
                    {getConfigSlaLabel(selectedConfigPreview)}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Description */}
              {selectedConfigPreview.description && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">
                    Description
                  </h4>
                  <p className="text-sm text-blue-800">
                    {selectedConfigPreview.description}
                  </p>
                </div>
              )}

              {/* Sources Section */}
              {selectedConfigPreview.sources &&
                selectedConfigPreview.sources.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-4 text-lg">
                      Email Sources ({selectedConfigPreview.sources.length})
                    </h4>
                    <div className="space-y-3">
                      {selectedConfigPreview.sources.map((source, idx) => (
                        <div
                          key={source.id}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-gray-900">
                              Source {idx + 1}: {source.type}
                            </p>
                            <Badge variant="outline">{source.type}</Badge>
                          </div>

                          {source.type === "Email" && (
                            <div className="space-y-3">
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-xs text-gray-600 mb-1">
                                  Email Address
                                </p>
                                <p className="text-sm font-mono font-semibold text-gray-900">
                                  {source.customEmailSource ||
                                    source.emailSource}
                                </p>
                              </div>

                              {source.emailRules &&
                                source.emailRules.length > 0 && (
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900 mb-2">
                                      Email Rules ({source.emailRules.length})
                                    </p>
                                    <div className="space-y-2">
                                      {source.emailRules.map((rule, rIdx) => (
                                        <div
                                          key={rule.id}
                                          className="bg-gray-50 p-2 rounded text-sm"
                                        >
                                          <span className="inline-block bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs mr-2 font-semibold">
                                            {rIdx + 1}
                                          </span>
                                          <span className="font-medium text-gray-900">
                                            {rule.fieldType}
                                          </span>
                                          {rule.domain ? (
                                            <span className="text-gray-700 ml-2">
                                              ={" "}
                                              <span className="font-mono">
                                                {escapeHtml(rule.domain)}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-gray-700 ml-2">
                                              {rule.operator} &quot;
                                              <span className="font-mono">
                                                {escapeHtml(rule.value)}
                                              </span>
                                              &quot;
                                            </span>
                                          )}
                                          {rule.nextOperator !== "END" && (
                                            <span className="ml-2 font-semibold text-blue-600">
                                              {rule.nextOperator}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}

                          {source.type === "Slack" && (
                            <div className="space-y-2 text-sm">
                              <div className="bg-gray-50 p-2 rounded">
                                <p className="text-xs text-gray-600 mb-1">
                                  Type
                                </p>
                                <p className="font-medium text-gray-900">
                                  {source.slackType}
                                </p>
                              </div>
                              <div className="bg-gray-50 p-2 rounded">
                                <p className="text-xs text-gray-600 mb-1">
                                  Channel/Workspace
                                </p>
                                <p className="font-mono text-gray-900">
                                  {source.slackName}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Allocation Section */}
              <div className="border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-4 text-lg">
                  Ticket Allocation
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600 mb-2 font-semibold">
                      ASSIGNED TO
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {getAssignedUserName(
                        selectedConfigPreview.assigned_to_id,
                      )}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600 mb-2 font-semibold">
                      PRIORITY
                    </p>
                    <Badge
                      className={
                        PRIORITY_COLORS[selectedConfigPreview.priority_id]
                      }
                    >
                      {getConfigSlaLabel(selectedConfigPreview)}
                    </Badge>
                  </div>

                  {selectedConfigPreview.watcher_user_ids &&
                    selectedConfigPreview.watcher_user_ids.length > 0 && (
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-2 font-semibold">
                          WATCHERS (
                          {selectedConfigPreview.watcher_user_ids.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedConfigPreview.watcher_user_ids
                            .slice(0, 3)
                            .map((id) => (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="text-xs"
                              >
                                {getAssignedUserName(id).split(" ")[0]}
                              </Badge>
                            ))}
                          {selectedConfigPreview.watcher_user_ids.length >
                            3 && (
                            <Badge variant="outline" className="text-xs">
                              +
                              {selectedConfigPreview.watcher_user_ids.length -
                                3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                </div>

                {selectedConfigPreview.watcher_user_ids &&
                  selectedConfigPreview.watcher_user_ids.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-gray-900 mb-2">
                        All Watchers
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedConfigPreview.watcher_user_ids.map((id) => (
                          <Badge key={id} variant="outline">
                            {getAssignedUserName(id)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* Metadata Footer */}
              <div className="border-t pt-4 text-xs text-gray-500 space-y-1 bg-gray-50 p-4 rounded">
                <p>
                  <span className="font-semibold">Created:</span>{" "}
                  {new Date(selectedConfigPreview.created_at).toLocaleString()}
                </p>
                <p>
                  <span className="font-semibold">Updated:</span>{" "}
                  {new Date(selectedConfigPreview.updated_at).toLocaleString()}
                </p>
                <p>
                  <span className="font-semibold">Config ID:</span> #
                  {selectedConfigPreview.id}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mail Config</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this mail config? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
