import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Plus, MoreVertical, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MailConfigModal } from "@/components/MailConfigModal";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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

export default function MailConfigs() {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<MailConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<MailConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
    fetchUsers();
  }, []);

  const fetchConfigs = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/mail-configs");
      setConfigs(response.data || []);
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

  interface User {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    type: string;
  }

  const fetchUsers = async () => {
    try {
      const resp = await api.get("/users");
      const list = (resp && (resp.users || resp.data || resp)) || [];
      setUsers(list as User[]);
      console.log("Users fetched:", list);
    } catch (error) {
      console.error("Error fetching users:", error);
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
    console.log("Assigned userId:", userId);
    console.log(
      "All user IDs:",
      users.map((u) => u.id),
    );
    const user = users.find((u) => Number(u.id) === Number(userId));
    if (!user) return "Unknown";
    if (user.name?.trim()) return user.name.trim();
    if (user.firstname && user.lastname) {
      return `${user.firstname} ${user.lastname}`;
    }
    return "Unknown";
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Mail Configs</h1>
          <p className="text-gray-600 mt-2">
            Manage email-to-ticket automation configurations
          </p>
        </div>
        <Button onClick={handleCreateNew} size="lg">
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
                emails are received, tickets are automatically created in
                Redmine with the specified details.
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
        <div className="grid gap-4">
          {configs.map((config) => (
            <Card
              key={config.id}
              className={`${!config.is_active ? "opacity-60" : ""} border-l-4 ${
                config.is_active ? "border-l-green-500" : "border-l-gray-300"
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <CardTitle>{config.name}</CardTitle>
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
                      <p className="text-sm text-gray-600 mt-2">
                        {config.description}
                      </p>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(config)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(config)}
                      >
                        {config.is_active ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(config.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Field Type</p>
                    <p className="font-medium">
                      {getFieldTypeLabel(config.field_type)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Priority</p>
                    <Badge className={PRIORITY_COLORS[config.priority_id]}>
                      {PRIORITY_NAMES[config.priority_id]}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Assigned To</p>
                    <p className="font-medium text-sm">
                      {getAssignedUserName(config.assigned_to_id)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Watchers</p>
                    <p className="text-sm font-medium">
                      {config.watcher_user_ids.length} watcher(s)
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-gray-100 rounded">
                  <p className="text-xs text-gray-600">Field Value</p>
                  <p className="font-mono text-sm break-all">
                    {config.field_value}
                  </p>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  Created: {new Date(config.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
    </div>
  );
}
