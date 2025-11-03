import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

interface User {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  type?: string;
}

interface MailConfig {
  id?: number;
  name: string;
  description?: string;
  field_type: "subject" | "fromEmail" | "toEmail" | "body";
  field_value: string;
  project_id: number;
  priority_id: number;
  assigned_to_id: number;
  watcher_user_ids: number[];
  is_active?: boolean;
}

interface MailConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
  initialConfig?: MailConfig;
  users: User[];
  priorities: Array<{ id: number; name: string }>;
}

const FIELD_TYPES = [
  { value: "subject", label: "Subject" },
  { value: "fromEmail", label: "From Email" },
  { value: "toEmail", label: "To Email" },
  { value: "body", label: "Body" },
];

const PRIORITY_OPTIONS = [
  { id: 1, name: "Low" },
  { id: 2, name: "Normal" },
  { id: 3, name: "High" },
  { id: 4, name: "Urgent" },
  { id: 5, name: "Immediate" },
];

export function MailConfigModal({
  isOpen,
  onClose,
  onConfigSaved,
  initialConfig,
  users: initialUsers,
  priorities = PRIORITY_OPTIONS,
}: MailConfigModalProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const { toast } = useToast();

  useEffect(() => {
    // Use users passed from parent (already fetched in MailConfigsPanel)
    if (initialUsers && initialUsers.length > 0) {
      setUsers(initialUsers);
    }
  }, [initialUsers, isOpen]);
  const [searchAssignee, setSearchAssignee] = useState("");

  const [config, setConfig] = useState<MailConfig>(
    initialConfig || {
      name: "",
      description: "",
      field_type: "subject",
      field_value: "",
      project_id: 28,
      priority_id: 3,
      assigned_to_id: 0,
      watcher_user_ids: [],
    },
  );
  const [openAssignee, setOpenAssignee] = useState(false);
  const [openWatchers, setOpenWatchers] = useState(false);
  const [searchWatchers, setSearchWatchers] = useState("");
  // const { toast } = useToast();

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const handleFieldTypeChange = (value: string) => {
    setConfig({
      ...config,
      field_type: value as "subject" | "fromEmail" | "toEmail" | "body",
    });
  };

  const handleFieldValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({
      ...config,
      field_value: e.target.value,
    });
  };

  const handleAssigneeSelect = (userId: number) => {
    setConfig({
      ...config,
      assigned_to_id: userId,
    });
    setOpenAssignee(false);
  };

  const handleWatcherToggle = (userId: number) => {
    const newWatchers = config.watcher_user_ids.includes(userId)
      ? config.watcher_user_ids.filter((id) => id !== userId)
      : [...config.watcher_user_ids, userId];

    setConfig({
      ...config,
      watcher_user_ids: newWatchers,
    });
  };

  const filteredWatchers = users.filter((user) => {
    const displayName = getUserName(user);
    const email = user.email || "";
    return (
      displayName.toLowerCase().includes(searchWatchers.toLowerCase()) ||
      email.toLowerCase().includes(searchWatchers.toLowerCase())
    );
  });

  const getFieldValueLabel = (fieldType: string): string => {
    switch (fieldType) {
      case "fromEmail":
        return "From Email Address";
      case "toEmail":
        return "To Email Address";
      case "subject":
        return "Subject Text";
      case "body":
        return "Body Text";
      default:
        return "Field Value";
    }
  };

  const getFieldValuePlaceholder = (fieldType: string): string => {
    switch (fieldType) {
      case "fromEmail":
        return "e.g., sender@example.com";
      case "toEmail":
        return "e.g., recipient@example.com";
      case "subject":
        return "e.g., Invoice from...";
      case "body":
        return "e.g., text to search in email body...";
      default:
        return "Enter field value...";
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);

      // Validate required fields
      if (!config.name.trim()) {
        toast({
          title: "Validation Error",
          description: "Config name is required",
          variant: "destructive",
        });
        return;
      }

      if (!config.field_value.trim()) {
        toast({
          title: "Validation Error",
          description: "Field value is required",
          variant: "destructive",
        });
        return;
      }

      if (!config.assigned_to_id) {
        toast({
          title: "Validation Error",
          description: "Please select an assignee",
          variant: "destructive",
        });
        return;
      }

      const payload: any = {
        name: config.name,
        description: config.description,
        field_type: config.field_type,
        field_value: config.field_value,
        project_id: config.project_id,
        priority_id: config.priority_id,
        assigned_to_id: config.assigned_to_id,
        watcher_user_ids: config.watcher_user_ids,
      };

      // Include user ID if available
      if (user?.id) {
        payload.userId = parseInt(user.id, 10);
      }

      if (config.id) {
        // Update existing config
        await api.put(`/mail-configs/${config.id}`, payload);
        toast({
          title: "Success",
          description: "Mail config updated successfully",
        });
      } else {
        // Create new config
        await api.post("/mail-configs", payload);
        toast({
          title: "Success",
          description: "Mail config created successfully",
        });
      }

      onConfigSaved();
      onClose();
    } catch (error) {
      console.error("Error saving mail config:", error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to save mail config",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get user display name from either old or new structure
  const getUserName = (user?: User): string => {
    console.log("USERS FUNCTION CALLED with", user);
    if (!user) return "";
    if (user?.name) return user.name.trim();
    if (user.first_name || user.last_name)
      return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    if (user.firstname || user.lastname)
      return `${user.firstname || ""} ${user.lastname || ""}`.trim();
    return "Unknown";
  };

  const assignedUser = users.find((u) => u.id === config.assigned_to_id);
  const selectedWatchers = users.filter((u) =>
    config.watcher_user_ids.includes(u.id),
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {config.id ? "Edit Mail Config" : "Create New Mail Config"}
          </DialogTitle>
          <p className="text-sm text-gray-600 mt-2">
            {config.id
              ? "Update the mail configuration settings."
              : "Configure email matching rules to automatically create tickets when matching emails are received."}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Config Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Config Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Invoice Processing"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              value={config.description || ""}
              onChange={(e) =>
                setConfig({ ...config, description: e.target.value })
              }
            />
          </div>

          {/* Field Type and Value */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="field_type">Field to Read *</Label>
              <Select
                value={config.field_type}
                onValueChange={handleFieldTypeChange}
              >
                <SelectTrigger id="field_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field_value">
                {getFieldValueLabel(config.field_type)} *
              </Label>
              <Input
                id="field_value"
                placeholder={getFieldValuePlaceholder(config.field_type)}
                value={config.field_value}
                onChange={handleFieldValueChange}
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority *</Label>
            <Select
              value={config.priority_id.toString()}
              onValueChange={(value) =>
                setConfig({ ...config, priority_id: parseInt(value) })
              }
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div className="space-y-2">
            <Label>Assigned To *</Label>

            <Popover open={openAssignee} onOpenChange={setOpenAssignee}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openAssignee}
                  className="w-full justify-between"
                >
                  {assignedUser
                    ? getUserName(assignedUser)
                    : "Select assignee..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder="Search users..."
                    value={searchAssignee}
                    onValueChange={setSearchAssignee}
                  />

                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {users
                        .filter((user) =>
                          getUserName(user)
                            .toLowerCase()
                            .includes(searchAssignee.toLowerCase()),
                        )
                        .sort((a, b) =>
                          getUserName(a).localeCompare(getUserName(b)),
                        )
                        .map((user) => (
                          <CommandItem
                            key={user.id}
                            value={getUserName(user).toLowerCase()}
                            onSelect={() => handleAssigneeSelect(user.id)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                config.assigned_to_id === user.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              }`}
                            />
                            {getUserName(user)}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Watchers */}
          <div className="space-y-2">
            <Label>Watchers (Optional)</Label>
            <Popover open={openWatchers} onOpenChange={setOpenWatchers}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {config.watcher_user_ids.length > 0
                    ? `${config.watcher_user_ids.length} selected`
                    : "Select watchers..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder="Search watchers..."
                    value={searchWatchers}
                    onValueChange={setSearchWatchers}
                  />
                  <CommandEmpty>No user found.</CommandEmpty>
                  <CommandGroup>
                    <CommandList className="max-h-48">
                      {filteredWatchers.map((user) => (
                        <CommandItem
                          key={user.id}
                          onSelect={() => handleWatcherToggle(user.id)}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              config.watcher_user_ids.includes(user.id)
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          {getUserName(user)}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Display selected watchers */}
            {selectedWatchers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedWatchers.map((user) => (
                  <div
                    key={user.id}
                    className="bg-primary/10 text-primary px-2 py-1 rounded text-sm flex items-center gap-1"
                  >
                    {getUserName(user)}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleWatcherToggle(user.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Config"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
