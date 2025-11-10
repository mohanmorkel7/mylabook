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
  from_email?: string;
  to_email?: string;
  subject_pattern?: string;
  body_content?: string;
  body_match_type?: "word" | "full";
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
  users?: User[];
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
    setUsers(initialUsers);
  }, [initialUsers]);

  // Fetch users if not provided by parent
  useEffect(() => {
    (async () => {
      try {
        if (!initialUsers || initialUsers.length === 0) {
          const resp = await api.get("/users");
          const list = (resp && (resp.users || resp.data || resp)) || [];
          if (Array.isArray(list) && list.length > 0) setUsers(list as any);
        }
      } catch (e) {
        console.warn("Failed to fetch users for mail config modal", e);
      }
    })();
  }, [initialUsers]);

  // Metadata for teams, buckets, statuses
  const [teams, setTeams] = useState<Array<any>>([]);
  const [buckets, setBuckets] = useState<Array<any>>([]);
  const [statuses, setStatuses] = useState<Array<any>>([]);
  const [demands] = useState<Array<{ id: number; label: string }>>([
    { id: 0, label: "2 hours" },
    { id: 1, label: "5 hours" },
    { id: 2, label: "24 hours" },
  ]);

  useEffect(() => {
    (async () => {
      try {
        // Try fetching consolidated metadata first
        const meta = await api.get("/tickets/metadata");
        if (meta && (meta.teams || meta.buckets || meta.statuses)) {
          setTeams(meta.teams || []);
          setBuckets(meta.buckets || []);
          setStatuses(meta.statuses || []);
          return;
        }

        // Fallback to individual endpoints if available
        try {
          const [teamsRes, bucketsRes, statusesRes] = await Promise.all([
            api.get("/tickets/teams").catch(() => []),
            api.get("/tickets/buckets").catch(() => []),
            api.get("/tickets/statuses").catch(() => []),
          ]);

          setTeams(teamsRes || []);
          setBuckets(bucketsRes || []);
          setStatuses(statusesRes || []);
        } catch (innerErr) {
          console.warn("Fallback metadata fetch failed", innerErr);
        }
      } catch (e) {
        console.warn("Failed to fetch metadata for mail config modal", e);
      }
    })();
  }, []);

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

  const handleAssigneeSelect = (userId: number | string) => {
    const id = typeof userId === "string" ? parseInt(userId, 10) : userId;
    setConfig({ ...config, assigned_to_id: id });
    setOpenAssignee(false);
  };

  const handleWatcherToggle = (userId: number | string) => {
    const id = typeof userId === "string" ? parseInt(userId, 10) : userId;
    const exists = config.watcher_user_ids.some(
      (w) => Number(w) === Number(id),
    );
    const newWatchers = exists
      ? config.watcher_user_ids.filter((w) => Number(w) !== Number(id))
      : [...config.watcher_user_ids, id];

    setConfig({
      ...config,
      watcher_user_ids: newWatchers,
    });
  };

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
        from_email: config.from_email,
        to_email: config.to_email,
        subject_pattern: config.subject_pattern,
        body_content: config.body_content,
        body_match_type: config.body_match_type || "word",
        project_id: config.project_id,
        priority_id: config.priority_id,
        assigned_to_id: config.assigned_to_id,
        watcher_user_ids: config.watcher_user_ids,
        team_id: config.team_id,
        bucket_id: config.bucket_id,
        status_id: config.status_id,
        demand: config.demand,
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
    if (!user) return "";
    if (user?.name) return user.name.trim();
    if (user.firstname || user.lastname)
      return `${user.firstname || ""} ${user.lastname || ""}`.trim();
    if ((user as any).first_name || (user as any).last_name)
      return `${(user as any).first_name || ""} ${(user as any).last_name || ""}`.trim();
    return "Unknown";
  };

  const filteredWatchers = users.filter((user) => {
    const displayName = getUserName(user);
    const email = user.email || "";
    return (
      displayName.toLowerCase().includes(searchWatchers.toLowerCase()) ||
      email.toLowerCase().includes(searchWatchers.toLowerCase())
    );
  });

  const assignedUser = users.find(
    (u) => String(u.id) === String(config.assigned_to_id),
  );
  const selectedWatchers = users.filter((u) =>
    config.watcher_user_ids.map((w) => String(w)).includes(String(u.id)),
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full sm:w-[900px] max-h-[80vh] overflow-auto">
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

          {/* Team, Bucket, Status, Demand */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="team">Team (optional)</Label>
              <Select
                value={config.team_id ? String(config.team_id) : "__none"}
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    team_id: v && v !== "__none" ? parseInt(v) : undefined,
                  })
                }
              >
                <SelectTrigger id="team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(Not set)</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket (optional)</Label>
              <Select
                value={config.bucket_id ? String(config.bucket_id) : "__none"}
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    bucket_id: v && v !== "__none" ? parseInt(v) : undefined,
                  })
                }
              >
                <SelectTrigger id="bucket">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(Not set)</SelectItem>
                  {buckets
                    .filter(
                      (b) => !config.team_id || b.team_id === config.team_id,
                    )
                    .map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status (optional)</Label>
              <Select
                value={config.status_id ? String(config.status_id) : "__none"}
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    status_id: v && v !== "__none" ? parseInt(v) : undefined,
                  })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(Not set)</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="demand">Demand / SLA (optional)</Label>
              <Select
                value={
                  config.demand !== undefined && config.demand !== null
                    ? String(config.demand)
                    : "__none"
                }
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    demand:
                      v === "" || v === "__none" ? undefined : parseInt(v),
                  })
                }
              >
                <SelectTrigger id="demand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(Use priority)</SelectItem>
                  {demands.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assigned To */}
          <div className="space-y-2">
            <Label>Assigned To *</Label>

            <Select
              value={
                config.assigned_to_id ? String(config.assigned_to_id) : "__none"
              }
              onValueChange={(v) =>
                setConfig({
                  ...config,
                  assigned_to_id:
                    v && v !== "__none" ? parseInt(v, 10) : undefined,
                })
              }
            >
              <SelectTrigger id="assigned_to">
                <SelectValue>
                  {assignedUser
                    ? getUserName(assignedUser)
                    : "Select assignee..."}
                </SelectValue>
              </SelectTrigger>

              <SelectContent className="p-2">
                <div className="px-2 py-1">
                  <Input
                    placeholder="Search users..."
                    value={searchAssignee}
                    onChange={(e) => setSearchAssignee(e.target.value)}
                    className="w-full"
                  />
                </div>
                <SelectItem value="__none">(Select assignee)</SelectItem>
                {users
                  .filter((u) =>
                    getUserName(u).toLowerCase().includes(searchAssignee.toLowerCase()),
                  )
                  .sort((a, b) => getUserName(a).localeCompare(getUserName(b)))
                  .map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {getUserName(u)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
                  <CommandList className="max-h-64">
                    <CommandGroup>
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
                    </CommandGroup>
                  </CommandList>
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
