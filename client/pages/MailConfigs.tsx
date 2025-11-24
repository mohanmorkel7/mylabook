import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Plus, Eye, AlertCircle, ChevronDown } from "lucide-react";
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
  const [selectedConfigPreview, setSelectedConfigPreview] = useState<MailConfig | null>(null);
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
      0
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
          <h1 className="text-3xl font-bold text-gray-900">Mail Configurations</h1>
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
        <div className="space-y-4">
          {configs.map((config) => (
            <Card
              key={config.id}
              className={`hover:shadow-lg transition-shadow ${
                !config.is_active ? "opacity-60" : ""
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* Left side - Config details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {config.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={
                          config.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {config.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    {config.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {config.description}
                      </p>
                    )}

                    {/* Metadata grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {/* Team */}
                      {config.team && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Team</p>
                          <Badge variant="secondary">{config.team}</Badge>
                        </div>
                      )}

                      {/* Sources count */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Sources</p>
                        <Badge variant="outline">
                          {config.sources?.length || 0}
                        </Badge>
                      </div>

                      {/* Rules count */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Rules</p>
                        <Badge variant="outline">{countRules(config)}</Badge>
                      </div>

                      {/* Assigned To */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Assigned To</p>
                        <p className="text-sm font-medium truncate">
                          {getAssignedUserName(config.assigned_to_id)}
                        </p>
                      </div>

                      {/* Priority SLA */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">SLA</p>
                        <Badge className={PRIORITY_COLORS[config.priority_id]}>
                          {PRIORITY_SLA_MAP[config.priority_id] ||
                            PRIORITY_NAMES[config.priority_id]}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Right side - Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenPreview(config)}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/mail-configs/edit/${config.id}`)}
                      title="Edit config"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(config.id)}
                      className="text-red-600 hover:text-red-700"
                      title="Delete config"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      {previewOpen && selectedConfigPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
              <CardTitle>{selectedConfigPreview.name}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
              >
                ✕
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Config Info */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Configuration</h4>
                <div className="space-y-2">
                  {selectedConfigPreview.description && (
                    <div>
                      <p className="text-sm text-gray-600">Description</p>
                      <p className="text-sm text-gray-900">
                        {selectedConfigPreview.description}
                      </p>
                    </div>
                  )}
                  {selectedConfigPreview.team && (
                    <div>
                      <p className="text-sm text-gray-600">Team</p>
                      <Badge variant="secondary">
                        {selectedConfigPreview.team}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Sources */}
              {selectedConfigPreview.sources &&
                selectedConfigPreview.sources.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">
                      Sources ({selectedConfigPreview.sources.length})
                    </h4>
                    <div className="space-y-3">
                      {selectedConfigPreview.sources.map((source, idx) => (
                        <div key={source.id} className="bg-gray-50 p-3 rounded">
                          <p className="font-medium text-sm mb-2">
                            Source {idx + 1}: {source.type}
                          </p>
                          {source.type === "Email" && (
                            <div className="text-sm space-y-1">
                              <p className="text-gray-600">
                                Email:{" "}
                                <span className="font-mono">
                                  {source.customEmailSource || source.emailSource}
                                </span>
                              </p>
                              {source.emailRules &&
                                source.emailRules.length > 0 && (
                                  <div>
                                    <p className="text-gray-600 mb-1">
                                      Rules:
                                    </p>
                                    {source.emailRules.map((rule, rIdx) => (
                                      <div
                                        key={rule.id}
                                        className="text-xs text-gray-600 ml-2"
                                      >
                                        {rIdx + 1}. {rule.fieldType}
                                        {rule.domain
                                          ? ` = ${rule.domain}`
                                          : ` ${rule.operator} "${rule.value}"`}
                                        {rule.nextOperator !== "END" && (
                                          <span className="font-medium">
                                            {" "}
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
                            <div className="text-sm space-y-1">
                              <p className="text-gray-600">
                                Type:{" "}
                                <span className="font-medium">
                                  {source.slackType}
                                </span>
                              </p>
                              <p className="text-gray-600">
                                Name:{" "}
                                <span className="font-mono">
                                  {source.slackName}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Allocation */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Allocation</h4>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-gray-600">Assigned To</p>
                    <p className="text-sm font-medium">
                      {getAssignedUserName(
                        selectedConfigPreview.assigned_to_id
                      )}
                    </p>
                  </div>
                  {selectedConfigPreview.watcher_user_ids &&
                    selectedConfigPreview.watcher_user_ids.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-600">Watchers</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedConfigPreview.watcher_user_ids.map((id) => (
                            <Badge key={id} variant="outline">
                              {getAssignedUserName(id)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  <div>
                    <p className="text-sm text-gray-600">Priority</p>
                    <Badge
                      className={
                        PRIORITY_COLORS[selectedConfigPreview.priority_id]
                      }
                    >
                      {PRIORITY_SLA_MAP[selectedConfigPreview.priority_id] ||
                        PRIORITY_NAMES[selectedConfigPreview.priority_id]}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="text-xs text-gray-500 space-y-1 border-t pt-4">
                <p>
                  Created:{" "}
                  {new Date(selectedConfigPreview.created_at).toLocaleDateString()}
                </p>
                <p>
                  Updated:{" "}
                  {new Date(selectedConfigPreview.updated_at).toLocaleDateString()}
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
