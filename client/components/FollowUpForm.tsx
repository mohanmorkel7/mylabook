import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Check, ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth-context";

const SOURCES = ["Email", "Call", "Meeting", "LinkedIn", "Website", "Referral", "Other"];

interface User {
  id: number;
  email: string;
  firstname?: string;
  lastname?: string;
  name?: string;
}

interface FollowUpFormProps {
  leadId: number;
  leadName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

async function fetchUsers() {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function createFollowUp(data: Record<string, any>) {
  const res = await fetch("/api/lead-followups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create follow-up");
  return res.json();
}

export function FollowUpForm({ leadId, leadName, open, onOpenChange, onSuccess }: FollowUpFormProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userEmail = (user as any)?.email || (user as any)?.username || "";

  // State
  const [formData, setFormData] = useState({
    follow_up_date: "",
    follow_up_time: "",
    title: "",
    notes: "",
    source: "",
    assigned_users: [] as (number | string)[],
  });

  const [openUsersPopover, setOpenUsersPopover] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");

  // Fetch users
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    staleTime: 5 * 60_000,
  });

  const users: User[] = usersData || [];

  // Mutation
  const createMutation = useMutation({
    mutationFn: () => {
      const dateTime = formData.follow_up_date && formData.follow_up_time
        ? `${formData.follow_up_date}T${formData.follow_up_time}`
        : formData.follow_up_date;

      // Get the first assigned user ID (backend only supports single assignment currently)
      let assigned_to_user_id = null;
      if (formData.assigned_users.length > 0) {
        const firstAssignee = formData.assigned_users[0];
        // If it's a number, use it directly; if it's an email, find the user
        if (typeof firstAssignee === 'number') {
          assigned_to_user_id = firstAssignee;
        } else {
          const user = users.find(u => u.email === firstAssignee);
          assigned_to_user_id = user?.id || null;
        }
      }

      return createFollowUp({
        lead_id: leadId,
        follow_up_date: dateTime,
        title: formData.title || formData.notes,
        notes: formData.notes,
        source: formData.source,
        assigned_to_user_id: assigned_to_user_id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      qc.invalidateQueries({ queryKey: ["lead", String(leadId)] });
      qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Follow-up created successfully" });
      onOpenChange(false);
      onSuccess?.();
      setFormData({
        follow_up_date: "",
        follow_up_time: "",
        title: "",
        notes: "",
        source: "",
        assigned_users: [],
      });
    },
  });

  // Handlers
  const toggleUser = (userId: number | string) => {
    setFormData((prev) => ({
      ...prev,
      assigned_users: prev.assigned_users.includes(userId)
        ? prev.assigned_users.filter((id) => id !== userId)
        : [...prev.assigned_users, userId],
    }));
  };

  const addSelf = () => {
    if (userEmail && !formData.assigned_users.includes(userEmail)) {
      setFormData((prev) => ({
        ...prev,
        assigned_users: [...prev.assigned_users, userEmail],
      }));
    }
  };

  const filteredUsers = users.filter((u) =>
    `${u.firstname || ""} ${u.lastname || ""} ${u.email || ""}`
      .toLowerCase()
      .includes(usersSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Follow-up</DialogTitle>
          <DialogDescription>Schedule a follow-up for {leadName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.follow_up_date}
                onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={formData.follow_up_time}
                onChange={(e) => setFormData({ ...formData, follow_up_time: e.target.value })}
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title">Follow-up Title *</Label>
            <Input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Check with client, Demo presentation, etc."
              required
            />
          </div>

          {/* Source */}
          <div>
            <Label htmlFor="source">Source</Label>
            <Select value={formData.source} onValueChange={(val) => setFormData({ ...formData, source: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes / Description</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any additional notes for this follow-up..."
              rows={3}
            />
          </div>

          {/* Assign Users */}
          <div>
            <Label>Assign to</Label>
            <div className="space-y-2">
              {/* Add Me Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSelf}
                className="w-full"
              >
                + Add Me
              </Button>

              {/* Selected Users */}
              {formData.assigned_users.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.assigned_users.map((userId) => {
                    const user = users.find((u) => u.id === userId || u.email === userId);
                    const displayName = user
                      ? `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email
                      : String(userId);

                    return (
                      <Badge key={userId} variant="secondary" className="gap-1">
                        {displayName}
                        <button
                          onClick={() => toggleUser(userId)}
                          className="ml-1 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* User Search Dropdown */}
              <Popover open={openUsersPopover} onOpenChange={setOpenUsersPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openUsersPopover}
                    className="w-full justify-between"
                  >
                    Search and select users...
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search users..."
                      value={usersSearch}
                      onValueChange={setUsersSearch}
                    />
                    <CommandEmpty>No users found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-y-auto">
                      {filteredUsers.map((u) => (
                        <CommandItem
                          key={u.id}
                          onSelect={() => {
                            toggleUser(u.id);
                            setUsersSearch("");
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              formData.assigned_users.includes(u.id) ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {u.firstname} {u.lastname}
                            </span>
                            <span className="text-xs text-gray-500">{u.email}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !formData.follow_up_date || !formData.title.trim()}
          >
            Create Follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
