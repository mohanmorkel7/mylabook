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
  users,
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
    }
  }, [isOpen]);

  const fetchConfigs = async () => {
    try {
      setIsLoading(true);
      const endpoint = user?.id
        ? `/mail-configs?userId=${user.id}`
        : "/mail-configs";
      const response = await api.get(endpoint);
      setConfigs(response.data);
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

  const handleCreateNew = () => {
    setSelectedConfig(null);
    setIsModalOpen(true);
  };

  const handleEdit = (config: MailConfig) => {
    setSelectedConfig(config);
    setIsModalOpen(true);
  };

  const handleConfigSaved = () => {
    fetchConfigs();
  };

  const handleDeleteClick = (configId: number) => {
    setConfigToDelete(configId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!configToDelete) return;

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
      setConfigs(
        configs.map((c) => (c.id === config.id ? updatedConfig.data : c)),
      );
      toast({
        title: "Success",
        description: `Mail config ${updatedConfig.data.is_active ? "enabled" : "disabled"}`,
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
    // Handle new mitra_users structure
    if (user.name) return user.name;
    // Handle old structure
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return "Unknown";
  };

  const getWatcherInitials = (watcherId: number): string => {
    const watcher = users.find((u) => u.id === watcherId);
    if (!watcher) return "?";
    // Handle new mitra_users structure
    if (watcher.name) {
      const parts = watcher.name.split(" ");
      return parts.map((p) => p.charAt(0)).join("").substring(0, 2);
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

      <div className="fixed inset-0 bg-white z-50 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="p-6">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Mylapay</h2>
              <p className="text-xs text-gray-600 mt-1">Mail Configs</p>
            </div>

            <nav className="space-y-1">
              <Button
                onClick={onClose}
                variant="ghost"
                className="w-full justify-start text-gray-700 hover:bg-gray-100 mb-4"
              >
                ← Back to Mails
              </Button>

              <a
                href="/dashboard"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Dashboard
              </a>
              <a
                href="/clients"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Clients
              </a>
              <a
                href="/vc"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                VC
              </a>
              <a
                href="/fundraise"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Fund Raise
              </a>
              <a
                href="/mails"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Mails
              </a>
              <a
                href="/tickets"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Tickets
              </a>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="mb-6">
              <h2 className="text-3xl font-bold">Mail Configs</h2>
              <p className="text-gray-600 mt-1">
                Manage email-to-ticket automation configurations
              </p>
            </div>

            <Button
              onClick={handleCreateNew}
              className="mb-6"
              disabled={isLoading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Config
            </Button>

            {isLoading && configs.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              </div>
            ) : configs.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p>No mail configs created yet</p>
                <p className="text-sm mt-2">
                  Click "Create New Config" to get started
                </p>
              </div>
            ) : (
              <div className="space-y-4">
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
        initialConfig={
          selectedConfig
            ? {
                id: selectedConfig.id,
                name: selectedConfig.name,
                description: selectedConfig.description,
                field_type: selectedConfig.field_type,
                field_value: selectedConfig.field_value,
                project_id: selectedConfig.project_id,
                priority_id: selectedConfig.priority_id,
                assigned_to_id: selectedConfig.assigned_to_id,
                watcher_user_ids: selectedConfig.watcher_user_ids,
                is_active: selectedConfig.is_active,
              }
            : undefined
        }
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
