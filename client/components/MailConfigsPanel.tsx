import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MailConfigModal } from "./MailConfigModal";
import { ConfigPageSidebar } from "./ConfigPageSidebar";
import api from "@/lib/api";

interface User {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  email: string;
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
}

interface MailConfigsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  emails?: any[]; // GraphEmail[] from Mails page (optional)
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

export function MailConfigsPanel({
  isOpen,
  onClose,
  users: initialUsers,
  emails = [],
}: MailConfigsPanelProps) {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<MailConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<MailConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchConfigs();
      // Only fetch users if initialUsers not provided
      if (!initialUsers || initialUsers.length === 0) {
        fetchUsers();
      } else {
        setUsers(initialUsers);
      }
    }
  }, [isOpen, initialUsers]);
  const [users, setUsers] = useState<User[]>([]);

  const fetchUsers = async () => {
    try {
      const resp = await api.get("/users");
      const list = (resp && (resp.users || resp.data || resp)) || [];
      console.log("Fetched users:", list);
      setUsers(list as User[]);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load user list",
        variant: "destructive",
      });
    }
  };

  const fetchConfigs = async () => {
    try {
      setIsLoading(true);
      const endpoint = user?.id
        ? `/mail-configs?userId=${user.id}`
        : "/mail-configs";
      const response = await api.get(endpoint);
      console.log("Fetched mail configs response:", response);
      console.log("Response type:", typeof response);
      console.log("Response is array?", Array.isArray(response));
      console.log("Response length:", response?.length);

      // Handle both array and object responses
      const configsArray = Array.isArray(response)
        ? response
        : response?.data || response?.configs || [];
      console.log("Final configs array:", configsArray);
      setConfigs(configsArray);
    } catch (error) {
      console.error("Error fetching mail configs:", error);
      toast({
        title: "Error",
        description: "Failed to load mail configs",
        variant: "destructive",
      });
      setConfigs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedConfig(null);
    setIsModalOpen(true);
  };

  const handleEdit = (config: MailConfig) => {
    setSelectedConfig(config);
    setIsModalOpen(true);
  };

  const handleConfigSaved = async () => {
    await fetchConfigs();
    // After saving a config, if emails are available, find matches and trigger processing
    if (emails && emails.length > 0) {
      try {
        // Log matched emails and payloads
        const matched: any[] = [];
        for (const email of emails) {
          for (const cfg of configs) {
            const field = cfg.field_type;
            const value = (cfg.field_value || "").toLowerCase();
            let emailField = "";
            if (field === "subject") {
              emailField = (email.subject || "").toLowerCase();
            } else if (field === "fromEmail") {
              emailField = (
                email.from?.emailAddress?.address ||
                email.sender?.emailAddress?.address ||
                ""
              ).toLowerCase();
            } else if (field === "body") {
              emailField = (
                email.bodyPreview ||
                email.body?.content ||
                ""
              ).toLowerCase();
            }

            if (value && emailField.includes(value)) {
              // matched
              const payload = {
                issue: {
                  project_id: cfg.project_id,
                  subject: email.subject || "(No subject)",
                  description: (
                    email.bodyPreview ||
                    email.body?.content ||
                    ""
                  ).replace(/<[^>]*>/g, ""),
                  assigned_to_id: cfg.assigned_to_id,
                  priority_id: cfg.priority_id,
                  watcher_user_ids: cfg.watcher_user_ids || [],
                },
              };
              console.log(
                "Matched email for config:",
                cfg.name,
                "emailId:",
                email.id,
              );
              console.log("Payload to send:", payload);
              matched.push({ emailId: email.id, configId: cfg.id, payload });
            }
          }
        }

        // If any matches found, send emails to server to process (server will create tickets)
        if (matched.length > 0) {
          await api.post(`/mail-configs/process-emails`, {
            matches: matched, // send only matched emails/configs
            userId: user?.id ? parseInt(user.id, 10) : undefined,
          });
          toast({
            title: "Processing",
            description: `Found ${matched.length} matches and triggered processing`,
          });
        } else {
          console.log("No matching emails found for current configs");
        }
      } catch (err) {
        console.error("Error triggering processing after config saved:", err);
      }
    }
  };

  const handleDeleteClick = (configId: number) => {
    setConfigToDelete(configId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (configToDelete === null) return;

    try {
      const url = user?.id
        ? `/mail-configs/${configToDelete}?userId=${user.id}`
        : `/mail-configs/${configToDelete}`;
      await api.delete(url);
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

  const handleToggleActive = async (config: MailConfig) => {
    try {
      const payload: any = {
        is_active: !config.is_active,
      };
      if (user?.id) {
        payload.userId = parseInt(user.id, 10);
      }
      const updatedConfig = await api.put(
        `/mail-configs/${config.id}`,
        payload,
      );
      setConfigs(configs.map((c) => (c.id === config.id ? updatedConfig : c)));
      toast({
        title: "Success",
        description: `Mail config ${updatedConfig.is_active ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error("Error updating mail config:", error);
      toast({
        title: "Error",
        description: "Failed to update mail config",
        variant: "destructive",
      });
    }
  };

  const getFieldTypeLabel = (fieldType: string): string => {
    const labels: Record<string, string> = {
      subject: "Subject",
      fromEmail: "From Email",
      toEmail: "To Email",
      body: "Body",
    };
    return labels[fieldType] || fieldType;
  };

  const getAssignedUserName = (userId: number): string => {
    const user = users.find((u) => u.id === userId);
    if (!user) return "Unknown";
    if (user.name) return user.name;
    if (user.first_name && user.last_name)
      return `${user.first_name} ${user.last_name}`;
    return "Unknown";
  };

  const getWatcherInitials = (watcherId: number): string => {
    const watcher = users.find((u) => u.id === watcherId);
    if (!watcher) return "?";
    // Handle new mitra_users structure
    if (watcher.name) {
      const parts = watcher.name.split(" ");
      return parts
        .map((p) => p.charAt(0))
        .join("")
        .substring(0, 2);
    }
    // Handle old structure
    if (watcher.first_name && watcher.last_name) {
      return `${watcher.first_name.charAt(0)}${watcher.last_name.charAt(0)}`;
    }
    return "?";
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 overflow-auto flex items-start justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-5xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Mail Configs</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Manage email-to-ticket automation configurations
                </p>
              </div>
              <div>
                <Button variant="ghost" onClick={onClose} className="mr-2">
                  Close
                </Button>
                <Button
                  onClick={handleCreateNew}
                  className="ml-2"
                  disabled={isLoading}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Config
                </Button>
              </div>
            </div>

            {isLoading && (configs?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              </div>
            ) : (configs?.length ?? 0) === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p>No mail configs created yet</p>
                <p className="text-sm mt-2">
                  Click "Create New Config" to get started
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {configs.map((config) => (
                  <Card
                    key={config.id}
                    className={`${
                      !config.is_active ? "opacity-60" : ""
                    } border-l-4 ${
                      config.is_active
                        ? "border-l-green-500"
                        : "border-l-gray-300"
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            {config.name}
                          </CardTitle>
                          {config.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {config.description}
                            </p>
                          )}
                        </div>
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
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Field Type</p>
                          <p className="font-medium">
                            {getFieldTypeLabel(config.field_type)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Priority</p>
                          <Badge
                            className={PRIORITY_COLORS[config.priority_id]}
                          >
                            {PRIORITY_NAMES[config.priority_id]}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <p className="text-gray-600 text-sm">Field Value</p>
                        <p className="text-sm font-mono bg-gray-100 p-2 rounded truncate">
                          {config.field_value}
                        </p>
                      </div>

                      <div>
                        <p className="text-gray-600 text-sm">Assigned To</p>
                        <p className="font-medium text-sm">
                          {getAssignedUserName(config.assigned_to_id)}
                        </p>
                      </div>

                      {config.watcher_user_ids.length > 0 && (
                        <div>
                          <p className="text-gray-600 text-sm">Watchers</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {config.watcher_user_ids
                              .slice(0, 3)
                              .map((watcherId) => (
                                <Badge
                                  key={watcherId}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {getWatcherInitials(watcherId)}
                                </Badge>
                              ))}
                            {config.watcher_user_ids.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{config.watcher_user_ids.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-4 pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(config)}
                          className="flex-1"
                        >
                          {config.is_active ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(config)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteClick(config.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <MailConfigModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedConfig(null);
        }}
        onConfigSaved={handleConfigSaved}
        initialConfig={selectedConfig || undefined}
        users={users}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mail Config</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this mail config? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction onClick={handleConfirmDelete}>
            Delete
          </AlertDialogAction>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
