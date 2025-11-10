import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, Edit, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/lib/auth-context";

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
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [createdTickets, setCreatedTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [overdueStatusId, setOverdueStatusId] = useState<number | null>(null);
  const autoMarkedRef = useRef(new Set<number>());
  const { user: currentUser } = useAuth();

  // realtime clock for countdowns
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
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

  // Show/hide filters and pagination state
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    fetchTickets();
    fetchUsers();
    if (activeTab === "created") {
      fetchCreatedTickets();
    }

    // Listen for created tickets updates from other parts of the app (e.g., Mails)
    const handler = () => {
      if (activeTab === "created") fetchCreatedTickets();
    };
    window.addEventListener("createdTicketsUpdated", handler);
    return () => window.removeEventListener("createdTicketsUpdated", handler);
  }, [activeTab]);

  useEffect(() => {
    applyFilters();
  }, [filters, tickets]);

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/tickets");
      // API may return parsed JSON directly or an axios-like { data } wrapper
      const data = response?.data ?? response;
      const ticketsArray = data?.tickets ?? (Array.isArray(data) ? data : []);
      // Normalize fields so UI can rely on consistent keys
      const normalized = ticketsArray.map((t: any) => ({
        ...t,
        assigned_to_id:
          t.assigned_to_id ??
          (t.assigned_to !== undefined && t.assigned_to !== null
            ? Number(t.assigned_to)
            : null) ??
          null,
        track_id:
          t.track_id ?? t.trackId ?? `TKT-${String(t.id).padStart(4, "0")}`,
        description: t.description || "",
      }));
      setTickets(normalized);
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
      // Use only the regular users API
      const resp = await api.get("/users");
      const regular = resp.data?.users ?? resp.data ?? [];

      // Normalize user fields so getAssignedUserName can handle various shapes
      const normalized = (regular as any[]).map((u) => {
        const fullName =
          `${u.first_name || u.firstname || ""} ${u.last_name || u.lastname || ""}`.trim();
        return {
          id: Number(u.id),
          name: u.name ?? (fullName || u.email),
          first_name: u.first_name,
          last_name: u.last_name,
          firstname: u.firstname,
          lastname: u.lastname,
          email: u.email,
          type: u.type,
        };
      });

      setUsers(normalized as User[]);
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
      if (filters.assignedTo)
        params.append("assigned_user_id", filters.assignedTo);

      const response = await api.get(
        `/email-processing/created-tickets?${params}`,
      );
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

  const getAssignedUserName = (
    userId: number | string | null | undefined,
  ): string => {
    if (userId === null || userId === undefined) return "Unassigned";
    const uid = typeof userId === "number" ? userId : parseInt(String(userId));
    if (isNaN(uid)) return "Unassigned";
    const user = users.find((u) => Number(u.id) === uid);
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

  const getSlaTextFor = (ticketSubset: any[]) => {
    if (!ticketSubset || ticketSubset.length === 0) return "No SLA";
    // Compute remaining ms for each ticket (use helper which falls back to created_at+priority)
    const remainingMs = ticketSubset
      .map((t) => computeSlaMsForTicket(t))
      .filter((m) => m !== null) as number[];
    if (remainingMs.length === 0) return "No SLA";
    const earliestRemaining = Math.min(...remainingMs);
    if (earliestRemaining < 0) {
      // overdue
      return `Overdue ${formatRemaining(Math.abs(earliestRemaining))}`;
    }
    return `${formatRemaining(earliestRemaining)} hours remaining`;
  };

  // fetch ticket metadata to discover overdue status id
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meta = await api.getTicketMetadata();
        const statuses = meta?.data?.statuses ?? meta?.statuses ?? [];
        const overdue = statuses.find((s: any) =>
          String(s.name).toLowerCase().includes("overdue"),
        );
        if (mounted && overdue) setOverdueStatusId(Number(overdue.id));
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const formatRemaining = (ms: number | null) => {
    if (ms === null) return "No SLA";
    if (ms <= 0) return "00:00:00";
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Helper to parse timestamps from DB as UTC (handles 'YYYY-MM-DD HH:MM:SS' format)
  const parseTimestampAsUTC = (ts?: string | null) => {
    if (!ts) return null;
    try {
      // If string already contains timezone info or 'Z', parse directly
      if (/[Tt].*Z$/.test(ts) || /[+\-]\d{2}:\d{2}$/.test(ts))
        return new Date(ts);
      const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
      return new Date(iso + "Z");
    } catch (e) {
      return null;
    }
  };

  // Format timestamp in IST (Asia/Kolkata) reliably by converting UTC -> IST (+5:30)
  const formatToIST = (ts?: string | null) => {
    const d = parseTimestampAsUTC(ts);
    if (!d || isNaN(d.getTime())) return ts || "-";
    const IST_OFFSET_MS = 5.5 * 3600 * 1000;
    const istDate = new Date(d.getTime() + IST_OFFSET_MS);
    return istDate.toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  // Compute SLA remaining ms for a ticket. If ticket.sla_time exists, use it.
  // Otherwise, fallback to created_at + priority-based SLA hours.
  const computeSlaMsForTicket = (ticket: any): number | null => {
    try {
      if (ticket.sla_time) {
        const parsed = parseTimestampAsUTC(ticket.sla_time);
        const ts = parsed ? parsed.getTime() : NaN;
        if (isNaN(ts)) return null;
        return ts - Date.now();
      }

      // Fallback mapping (use priority IDs that the UI uses)
      const PRIORITY_SLA_HOURS: Record<number, number> = {
        0: 2, // Priority 0 -> 2 hours
        1: 5, // Priority 1 -> 5 hours
        2: 24, // Priority 2 -> End of day -> 24 hours
        3: 8,
        4: 24,
        5: 48,
      };

      const pr = Number(
        ticket.priority_id ?? ticket.priority?.id ?? ticket.priority_id,
      );
      const hours = PRIORITY_SLA_HOURS[pr];
      if (hours === undefined || hours === null) return null;
      const createdTs = ticket.created_at
        ? parseTimestampAsUTC(ticket.created_at).getTime()
        : NaN;
      if (isNaN(createdTs)) return null;
      const slaTs = createdTs + hours * 3600 * 1000;
      return slaTs - Date.now();
    } catch (e) {
      console.error("SLA compute error", e);
      return null;
    }
  };

  const markOverdue = async (ticket: any) => {
    if (!overdueStatusId) return;
    if (autoMarkedRef.current.has(ticket.id)) return;

    // Avoid marking if already overdue or closed
    const sName = (ticket.status && ticket.status.name) || ticket.status;
    if (String(sName).toLowerCase().includes("overdue")) return;
    if (
      (ticket.status && ticket.status.is_closed) ||
      /closed/i.test(String(sName || ""))
    )
      return;

    autoMarkedRef.current.add(ticket.id);
    try {
      await api.updateTicket(ticket.id, {
        status_id: overdueStatusId,
        updated_by: currentUser?.id || 1,
      });
      // update local state
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id
            ? {
                ...t,
                status: {
                  ...(t.status || {}),
                  id: overdueStatusId,
                  name: "Overdue",
                  is_closed: false,
                },
                status_id: overdueStatusId,
              }
            : t,
        ),
      );
    } catch (e) {
      console.error("Failed to mark ticket overdue:", e);
      autoMarkedRef.current.delete(ticket.id);
    }
  };

  const nextSlaInfo = React.useMemo(() => {
    const withSla = tickets
      .map((t) =>
        t.sla_time
          ? { ...t, slaTs: parseTimestampAsUTC(t.sla_time)?.getTime() ?? null }
          : null,
      )
      .filter((x) => x && x.slaTs !== null) as any[];
    if (!withSla || withSla.length === 0) return { ticket: null, ms: null };
    // find the earliest SLA timestamp
    const earliest = withSla.reduce((prev, cur) =>
      cur.slaTs < prev.slaTs ? cur : prev,
    );
    const ms =
      earliest && typeof earliest.slaTs === "number"
        ? earliest.slaTs - Date.now()
        : null;
    return { ticket: earliest, ms };
  }, [tickets, now]);

  const isAnyFilterActive = Object.values(filters).some((v) => v !== "");

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const paginatedTickets = filteredTickets.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900">Manage Tickets</h1>
        <div className="flex gap-4 mt-4 items-center">
          <div className="flex gap-4">
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

          <div className="ml-auto flex items-center gap-3">
            <Button variant="outline" onClick={() => setShowFilters((s) => !s)}>
              Filters
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Show</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Link to="/tickets/create">
              <Button>Create Ticket</Button>
            </Link>

            {currentUser?.role === "admin" && activeTab === "all" && (
              <div className="ml-4 text-right">
                <div className="text-xs text-gray-500">Next SLA</div>
                <div
                  className={`text-sm font-medium ${nextSlaInfo.ms !== null && nextSlaInfo.ms <= 0 ? "text-red-600" : "text-gray-700"}`}
                >
                  {nextSlaInfo.ticket
                    ? nextSlaInfo.ms !== null && nextSlaInfo.ms <= 0
                      ? `Overdue ${formatRemaining(Math.abs(nextSlaInfo.ms))} — ${String(nextSlaInfo.ticket.subject).slice(0, 40)}`
                      : `${formatRemaining(nextSlaInfo.ms)} hours remaining — ${String(nextSlaInfo.ticket.subject).slice(0, 40)}`
                    : "No SLA"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-indigo-600">
              {
                tickets.filter((t) => {
                  const s = (t as any).status?.name || t.status;
                  return /open/i.test(String(s || ""));
                }).length
              }
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Open</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-orange-500">
              {
                tickets.filter((t) => {
                  const s = (t as any).status?.name || t.status;
                  return (
                    /in progress/i.test(String(s || "")) ||
                    /in_progress/i.test(String(s || ""))
                  );
                }).length
              }
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">
              In Progress
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-yellow-600">
              {
                tickets.filter((t) => {
                  const s = (t as any).status?.name || t.status;
                  return /pending/i.test(String(s || ""));
                }).length
              }
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Pending</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-2xl md:text-3xl font-bold text-green-600">
              {
                tickets.filter((t) => {
                  const s = (t as any).status?.name || t.status;
                  return (
                    (t as any).status?.is_closed === true ||
                    /closed/i.test(String(s || ""))
                  );
                }).length
              }
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Closed</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-red-600">
              {
                tickets.filter((t) => {
                  const s = (t as any).status?.name || t.status;
                  const isClosed =
                    (t as any).status?.is_closed === true ||
                    /closed/i.test(String(s || ""));
                  const computed = computeSlaMsForTicket(t);
                  return computed !== null && computed < 0 && !isClosed;
                }).length
              }
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Overdue</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      {showFilters && (
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
                        {getAssignedUserName(user.id)}
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
                    <SelectItem value="mail_config">
                      From Mail Config
                    </SelectItem>
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
      )}

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
              {paginatedTickets.map((ticket) => {
                const priority = getPriorityBadge(ticket.priority_id);
                const slaMs = computeSlaMsForTicket(ticket);
                return (
                  <Card
                    key={ticket.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {ticket.track_id ||
                                `TKT-${String(ticket.id).padStart(4, "0")}`}
                              : {ticket.subject}
                            </h3>
                            {ticket.created_from_mail_config && (
                              <Badge className="bg-green-100 text-green-800">
                                From Mail Config
                              </Badge>
                            )}

                            <div className="ml-auto flex items-center gap-2">
                              <Link
                                to={`/tickets/${ticket.id}`}
                                className="p-1 rounded hover:bg-gray-100"
                                title="View"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Search size={16} />
                              </Link>
                              <Link
                                to={`/tickets/${ticket.id}/edit`}
                                className="p-1 rounded hover:bg-gray-100"
                                title="Edit"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Edit size={16} />
                              </Link>
                              <button
                                className="p-1 rounded hover:bg-gray-100 text-red-600"
                                title="Delete"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm("Delete this ticket?")) return;
                                  try {
                                    await api.deleteTicket(ticket.id);
                                    setTickets((prev) =>
                                      prev.filter((p) => p.id !== ticket.id),
                                    );
                                    toast({
                                      title: "Deleted",
                                      description: "Ticket deleted",
                                    });
                                  } catch (delErr) {
                                    console.error("Delete failed", delErr);
                                    toast({
                                      title: "Error",
                                      description: "Failed to delete ticket",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                <Trash size={16} />
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 mb-3 text-sm text-gray-700 max-h-24 overflow-hidden">
                            <div
                              dangerouslySetInnerHTML={{
                                __html: ((): string => {
                                  try {
                                    const parser = new DOMParser();
                                    const raw = ticket.description || "";
                                    if (
                                      raw.includes("&lt;") ||
                                      raw.includes("&gt;")
                                    ) {
                                      return (
                                        parser.parseFromString(raw, "text/html")
                                          .body.textContent || ""
                                      );
                                    }
                                    return raw;
                                  } catch (e) {
                                    return ticket.description || "";
                                  }
                                })(),
                              }}
                            />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-sm">
                            <div>
                              <p className="text-gray-600">Status</p>
                              <Badge variant="outline" className="mt-1">
                                {typeof ticket.status === "object"
                                  ? ticket.status?.name
                                  : ticket.status}
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
                                {ticket.assignee?.name ||
                                  getAssignedUserName(ticket.assigned_to_id)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Created</p>
                              <p className="font-medium mt-1">
                                {formatToIST(ticket.created_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Updated</p>
                              <p className="font-medium mt-1">
                                {formatToIST(ticket.updated_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">SLA</p>
                              <p
                                className={`font-medium mt-1 ${slaMs !== null && slaMs <= 0 ? "text-red-600" : ""}`}
                              >
                                {slaMs === null
                                  ? "No SLA"
                                  : slaMs <= 0
                                    ? `Overdue ${formatRemaining(Math.abs(slaMs))}`
                                    : `${formatRemaining(slaMs)} hours remaining`}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Track ID</p>
                              <Badge variant="secondary" className="mt-1">
                                {ticket.track_id ||
                                  `TKT-${String(ticket.id).padStart(4, "0")}`}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <Button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
                <div className="text-sm text-gray-600">
                  {filteredTickets.length} items
                </div>
              </div>
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
                  <p className="text-gray-600 text-lg">
                    No tickets created from email automation yet
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {createdTickets.map((ticket) => (
                <Card
                  key={ticket.id}
                  className="hover:shadow-lg transition-shadow"
                >
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
                            <p className="font-medium mt-1">
                              {ticket.assigned_to?.name || "Unassigned"}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Priority</p>
                            {getPriorityBadge(ticket.priority_id) && (
                              <Badge
                                className={`mt-1 ${getPriorityBadge(ticket.priority_id)?.color}`}
                              >
                                {getPriorityBadge(ticket.priority_id)?.name}
                              </Badge>
                            )}
                          </div>
                          <div>
                            <p className="text-gray-600">Mitra Ticket ID</p>
                            <p className="font-medium mt-1">
                              #{ticket.mitra_ticket_id}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Created</p>
                            <p className="font-medium mt-1">
                              {formatToIST(ticket.created_at)}
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
