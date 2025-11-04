import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Ticket {
  id: number;
  subject: string;
  description: string;
  project_id: number;
  assigned_to_id: number;
  priority_id: number;
  status: string;
  created_from_mail_config: boolean;
  mail_config_id?: number;
  created_at: string;
  updated_at: string;
}

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

interface FilterOptions {
  searchText: string;
  priority: string;
  status: string;
  assignedTo: string;
  source: string;
  dateFrom: string;
  dateTo: string;
}

const PRIORITY_OPTIONS = {
  1: { name: "Low", color: "bg-blue-100 text-blue-800" },
  2: { name: "Normal", color: "bg-gray-100 text-gray-800" },
  3: { name: "High", color: "bg-orange-100 text-orange-800" },
  4: { name: "Urgent", color: "bg-red-100 text-red-800" },
  5: { name: "Immediate", color: "bg-red-200 text-red-900" },
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "on_hold", label: "On Hold" },
];

export default function ManageTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [createdTickets, setCreatedTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "created">("all");
  const [filters, setFilters] = useState<FilterOptions>({
    searchText: "",
    priority: "",
    status: "",
    assignedTo: "",
    source: "",
    dateFrom: "",
    dateTo: "",
  });
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchTickets();
    fetchUsers();
    if (activeTab === "created") {
      fetchCreatedTickets();
    }
  }, [activeTab]);

  useEffect(() => {
    applyFilters();
  }, [filters, tickets]);

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/tickets");
      setTickets(response.data || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast({
        title: "Error",
        description: "Failed to load tickets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get("/users/list/mitra");
      setUsers(response.data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchCreatedTickets = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append("date_from", filters.dateFrom);
      if (filters.dateTo) params.append("date_to", filters.dateTo);
      if (filters.priority) params.append("priority_id", filters.priority);
      if (filters.assignedTo) params.append("assigned_user_id", filters.assignedTo);

      const response = await api.get(`/email-processing/created-tickets?${params}`);
      setCreatedTickets(response.data?.tickets || []);
    } catch (error) {
      console.error("Error fetching created tickets:", error);
      toast({
        title: "Error",
        description: "Failed to load created tickets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...tickets];

    // Search text filter
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.subject.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower),
      );
    }

    // Priority filter
    if (filters.priority) {
      filtered = filtered.filter(
        (t) => t.priority_id === parseInt(filters.priority),
      );
    }

    // Status filter
    if (filters.status) {
      filtered = filtered.filter((t) => t.status === filters.status);
    }

    // Assigned to filter
    if (filters.assignedTo) {
      filtered = filtered.filter(
        (t) => t.assigned_to_id === parseInt(filters.assignedTo),
      );
    }

    // Source filter (mail config vs manual)
    if (filters.source === "mail_config") {
      filtered = filtered.filter((t) => t.created_from_mail_config);
    } else if (filters.source === "manual") {
      filtered = filtered.filter((t) => !t.created_from_mail_config);
    }

    // Date range filter
    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom).getTime();
      filtered = filtered.filter(
        (t) => new Date(t.created_at).getTime() >= dateFrom,
      );
    }

    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo).getTime();
      filtered = filtered.filter(
        (t) => new Date(t.created_at).getTime() <= dateTo,
      );
    }

    setFilteredTickets(filtered);
  };

  const clearFilters = () => {
    setFilters({
      searchText: "",
      priority: "",
      status: "",
      assignedTo: "",
      source: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const getAssignedUserName = (userId: number): string => {
    const user = users.find((u) => u.id === userId);
    if (!user) return "Unassigned";
    // Handle new mitra_users structure (firstname + lastname)
    if (user.firstname || user.lastname) {
      return `${user.firstname || ""} ${user.lastname || ""}`.trim();
    }
    // Handle name field
    if (user.name) return user.name;
    // Handle old structure
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return "Unassigned";
  };

  const getPriorityBadge = (priority: number) => {
    const p = PRIORITY_OPTIONS[priority as keyof typeof PRIORITY_OPTIONS];
    return p ? { name: p.name, color: p.color } : null;
  };

  const isAnyFilterActive = Object.values(filters).some((v) => v !== "");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900">Manage Tickets</h1>
        <div className="flex gap-4 mt-4">
          <Button
            variant={activeTab === "all" ? "default" : "outline"}
            onClick={() => setActiveTab("all")}
          >
            All Tickets ({tickets.length})
          </Button>
          <Button
            variant={activeTab === "created" ? "default" : "outline"}
            onClick={() => setActiveTab("created")}
          >
            Created from Email ({createdTickets.length})
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            {isAnyFilterActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-blue-600 hover:text-blue-700"
              >
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Input
                  placeholder="Search by subject or description..."
                  value={filters.searchText}
                  onChange={(e) =>
                    setFilters({ ...filters, searchText: e.target.value })
                  }
                  className="pl-10"
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <Select
                value={filters.priority}
                onValueChange={(value) =>
                  setFilters({ ...filters, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Priorities</SelectItem>
                  {Object.entries(PRIORITY_OPTIONS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters({ ...filters, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned To
              </label>
              <Select
                value={filters.assignedTo}
                onValueChange={(value) =>
                  setFilters({ ...filters, assignedTo: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <Select
                value={filters.source}
                onValueChange={(value) =>
                  setFilters({ ...filters, source: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Sources</SelectItem>
                  <SelectItem value="mail_config">From Mail Config</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Date
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value })
                }
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To Date
              </label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List - Conditional Tab Display */}
      {activeTab === "all" ? (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <p className="text-gray-600 text-lg">
                    {tickets.length === 0
                      ? "No tickets yet"
                      : "No tickets match your filters"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => {
            const priority = getPriorityBadge(ticket.priority_id);
            return (
              <Card
                key={ticket.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          #{ticket.id}: {ticket.subject}
                        </h3>
                        {ticket.created_from_mail_config && (
                          <Badge className="bg-green-100 text-green-800">
                            From Mail Config
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {ticket.description}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Status</p>
                          <Badge variant="outline" className="mt-1">
                            {ticket.status}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-gray-600">Priority</p>
                          {priority && (
                            <Badge className={`mt-1 ${priority.color}`}>
                              {priority.name}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-600">Assigned To</p>
                          <p className="font-medium mt-1">
                            {getAssignedUserName(ticket.assigned_to_id)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Created</p>
                          <p className="font-medium mt-1">
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
            </div>
          )}
        </>
      ) : (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : createdTickets.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <p className="text-gray-600 text-lg">No tickets created from email automation yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {createdTickets.map((ticket) => (
                <Card key={ticket.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {ticket.email_subject}
                          </h3>
                          <Badge className="bg-blue-100 text-blue-800">
                            {ticket.config_name}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          From: {ticket.email_from}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-gray-600">Assigned To</p>
                            <p className="font-medium mt-1">{ticket.assigned_to?.name || "Unassigned"}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Priority</p>
                            {getPriorityBadge(ticket.priority_id) && (
                              <Badge className={`mt-1 ${getPriorityBadge(ticket.priority_id)?.color}`}>
                                {getPriorityBadge(ticket.priority_id)?.name}
                              </Badge>
                            )}
                          </div>
                          <div>
                            <p className="text-gray-600">Mitra Ticket ID</p>
                            <p className="font-medium mt-1">#{ticket.mitra_ticket_id}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Created</p>
                            <p className="font-medium mt-1">
                              {new Date(ticket.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
