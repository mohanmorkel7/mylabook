import React, { useEffect, useState, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, Edit, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
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
import TicketCharts from "@/components/charts/TicketCharts";

interface StatusInfo {
  id: number;
  name: string;
  color: string;
  is_closed: boolean;
  sort_order: number;
  created_at?: string;
}

interface TicketAssignee {
  id: number;
  name: string;
  email: string;
}

interface TicketPriority {
  id: number;
  name: string;
  level: number;
  color: string;
  created_at?: string;
}

interface Ticket {
  id: number;
  track_id: string;
  subject: string;
  description: string;
  priority_id: number;
  priority?: TicketPriority;
  status_id: number;
  status: StatusInfo;
  category_id?: number;
  team_id?: number;
  bucket_id?: number;
  demand?: number;
  assigned_to_id?: number | null;
  assignee?: TicketAssignee;
  related_lead_id?: number;
  related_client_id?: number;
  created_by?: number;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  custom_fields?: any;
  sla_time?: string;
  sla_remaining_ms?: number;
  resolved_at?: string;
  closed_at?: string;
  created_from_mail_config?: boolean;
  mail_config_id?: number;
  mail_config_sources?: any;
  created_at: string;
  updated_at: string;
  __server_time_ms?: number;
  __fetched_at_ms?: number;
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
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "overdue", label: "Overdue" },
  { value: "closed", label: "Closed" },
];

export default function ManageTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totalTickets, setTotalTickets] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [createdTickets, setCreatedTickets] = useState<any[]>([]);
  const [createdTicketsCount, setCreatedTicketsCount] = useState<number>(0);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [overdueStatusId, setOverdueStatusId] = useState<number | null>(null);
  const serverTimeOffsetRef = useRef<number>(0); // clientNow - serverNow (ms) to adjust remaining time calculations
  const autoMarkedRef = useRef(new Set<number>());
  const { user: currentUser } = useAuth();
  const [sourceTags, setSourceTags] = useState<string[]>([]);
  const [statusesList, setStatusesList] = useState<any[]>([]);
  const [statusesMap, setStatusesMap] = useState<Record<string, number>>({});
  const [assignedOptionsState, setAssignedOptionsState] = useState<
    { value: string; label: string }[]
  >([]);
  const serverFilteredRef = useRef(false);

  // realtime clock for countdowns
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const [activeTab, setActiveTab] = useState<"all" | "created">("all");

  // Derive provider name from mail_config sources. Prefer a rule that matches the email sender when possible.
  function extractEmailFromText(text: string | undefined): string | null {
    if (!text) return null;
    try {
      const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return m ? m[0].toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  function formatProviderNameFromDomain(domain: string): string {
    const stripped = domain.startsWith("@") ? domain.slice(1) : domain;
    const main = stripped.split(".")[0] || stripped;
    return main
      .replace(/[^a-zA-Z0-9]/g, " ")
      .split(" ")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function getMailConfigProviderName(
    sources: any,
    sampleText?: string,
  ): string | null {
    if (!sources) return null;
    try {
      const arr = Array.isArray(sources)
        ? sources
        : typeof sources === "string"
          ? JSON.parse(sources)
          : null;
      if (!arr || !Array.isArray(arr) || arr.length === 0) return null;

      const senderEmail = extractEmailFromText(sampleText || "") || null;
      const senderDomain = senderEmail
        ? senderEmail.split("@").slice(1).join("@").toLowerCase()
        : null;

      // First try to find a rule whose domain matches the sender's domain
      if (senderDomain) {
        for (const src of arr) {
          if (src && Array.isArray(src.emailRules)) {
            for (const rule of src.emailRules) {
              if (rule && rule.domain) {
                const ruleDomain = String(rule.domain || "").trim();
                const strippedRule = ruleDomain.startsWith("@")
                  ? ruleDomain.slice(1).toLowerCase()
                  : ruleDomain.toLowerCase();
                // match by exact suffix (e.g., payswiff.com matches subdomains too)
                if (
                  senderDomain === strippedRule ||
                  senderDomain.endsWith("." + strippedRule)
                ) {
                  return formatProviderNameFromDomain(strippedRule);
                }
              }
            }
          }
        }
      }

      // Fallback: return first rule's provider name
      for (const src of arr) {
        if (src && Array.isArray(src.emailRules)) {
          for (const rule of src.emailRules) {
            if (rule && rule.domain) {
              return formatProviderNameFromDomain(String(rule.domain));
            }
          }
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }
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

  useEffect(() => {
    fetchTickets(currentPage);
    fetchUsers();
    fetchTags();
    fetchAssignedOptions();
    // Always refresh created tickets count so the tab displays an accurate value
    fetchCreatedTicketsCount();
    if (activeTab === "created") {
      fetchCreatedTickets();
    }

    // Listen for created tickets updates from other parts of the app (e.g., Mails)
    const handler = () => {
      if (activeTab === "created") fetchCreatedTickets();
      fetchCreatedTicketsCount();
    };
    window.addEventListener("createdTicketsUpdated", handler);

    return () => {
      window.removeEventListener("createdTicketsUpdated", handler);
    };
  }, [activeTab, currentPage]);

  // When filters change, fetch fresh results from server (reset to page 1)
  useEffect(() => {
    setCurrentPage(1);
    fetchTickets(1);
  }, [filters]);

  // Re-apply local filtering when tickets array changes (clientside adjustments)
  useEffect(() => {
    applyFilters();
  }, [tickets]);

  const fetchTickets = async (page: number = 1) => {
    try {
      setIsLoading(true);

      // Build server-side filters
      const serverFilters: any = {};
      if (filters.searchText) serverFilters.search = filters.searchText;
      if (
        filters.priority !== undefined &&
        String(filters.priority).trim() !== ""
      ) {
        const pid = Number.parseInt(String(filters.priority), 10);
        if (!Number.isNaN(pid)) serverFilters.priority_id = pid;
      }
      if (filters.dateFrom) serverFilters.date_from = filters.dateFrom;
      if (filters.dateTo) serverFilters.date_to = filters.dateTo;

      // status -> map to status_id using statusesMap
      if (
        filters.status !== undefined &&
        String(filters.status).trim() !== ""
      ) {
        const key = String(filters.status || "").toLowerCase();
        const normalizedKey = key
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        const sid = statusesMap[normalizedKey];
        if (sid !== undefined && sid !== null && !Number.isNaN(Number(sid)))
          serverFilters.status_id = Number(sid);
      }

      // assigned to
      if (
        filters.assignedTo !== undefined &&
        String(filters.assignedTo).trim() !== ""
      ) {
        if (filters.assignedTo === "unassigned") {
          serverFilters.unassigned = true;
        } else {
          const aid = Number.parseInt(String(filters.assignedTo), 10);
          if (!Number.isNaN(aid)) serverFilters.assigned_to = aid;
        }
      }

      // source/tag filter
      if (
        filters.source !== undefined &&
        String(filters.source).trim() !== ""
      ) {
        if (filters.source === "mail_config") {
          serverFilters.created_from_mail_config = true;
        } else if (filters.source === "manual") {
          serverFilters.created_from_mail_config = false;
        } else {
          // treat as tag
          serverFilters.tags = [filters.source];
        }
      }

      const response = await api.getTickets(serverFilters, page, 20);
      // API may return parsed JSON directly or an axios-like { data } wrapper
      const data = response?.data ?? response;
      const ticketsArray = data?.tickets ?? (Array.isArray(data) ? data : []);
      // Capture server time when provided to correct client/server clock skew
      let serverMs: number | null = null;
      if (data?.server_time) {
        serverMs = new Date(data.server_time).getTime();
        serverTimeOffsetRef.current = Date.now() - serverMs;
      }
      const fetchClientMs = Date.now();
      // Normalize fields so UI can rely on consistent keys and attach fetch metadata
      const normalized = ticketsArray.map((t: any) => {
        // Extract status info - API returns status as object
        let statusInfo = t.status;
        if (!statusInfo && t.status_id) {
          // Fallback: create status object from status_id if status is missing
          statusInfo = {
            id: t.status_id,
            name: t.status_name || "Unknown",
            color: t.status_color || "#999",
            is_closed: t.status_is_closed || false,
            sort_order: 0,
          };
        }

        return {
          ...t,
          priority_id: ((): number | null => {
            const val =
              t.priority_id ?? (t.priority && (t.priority.id ?? t.priority_id));
            const num = Number(val);
            return Number.isFinite(num) ? num : null;
          })(),
          assigned_to_id:
            t.assigned_to_id ??
            (t.assigned_to !== undefined && t.assigned_to !== null
              ? Number(t.assigned_to)
              : null) ??
            null,
          track_id:
            t.track_id ?? t.trackId ?? `TKT-${String(t.id).padStart(4, "0")}`,
          description: t.description || "",
          status: statusInfo,
          created_from_mail_config: t.created_from_mail_config ?? false,
          __server_time_ms: serverMs,
          __fetched_at_ms: fetchClientMs,
        };
      });

      setTickets(normalized);
      // Use server results directly for displayed list to avoid double-filtering client-side
      serverFilteredRef.current = true;
      setFilteredTickets(normalized);
      // Fallback: compute created-from-mail-config count locally from tickets if server created-tickets table is empty
      const localCreatedCount = normalized.filter(
        (t: any) => t.created_from_mail_config,
      ).length;
      setCreatedTicketsCount((prev) => Math.max(prev || 0, localCreatedCount));
      setTotalTickets(data?.total ?? normalized.length);
      setTotalPages(data?.pages ?? 1);
      setStatusCounts(data?.status_counts ?? {});
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

  const fetchTags = async () => {
    try {
      const resp = await api.get("/tickets/summary/by-tag");
      const data = resp?.data ?? resp;
      const raw = Array.isArray(data?.tags)
        ? data.tags
            .map((t: any) => String(t.tag || t.name || "").trim())
            .filter(Boolean)
        : [];
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const t of raw) {
        const key = t.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(t);
        }
      }
      setSourceTags(unique);
    } catch (e) {
      console.error("Error fetching tag sources:", e);
    }
  };

  const fetchCreatedTicketsCount = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append("date_from", filters.dateFrom);
      if (filters.dateTo) params.append("date_to", filters.dateTo);
      params.append("limit", "1");

      const response = await api.get(
        `/email-processing/created-tickets?${params}`,
      );
      const payload =
        response && !Array.isArray(response) && response.tickets
          ? response
          : response.data || response;
      console.debug(
        "[ManageTickets] fetchCreatedTicketsCount response:",
        response,
      );
      console.debug(
        "[ManageTickets] fetchCreatedTicketsCount payload:",
        payload,
      );
      const total =
        payload.pagination?.total ??
        payload.total ??
        (Array.isArray(payload) ? payload.length : 0);
      console.debug("[ManageTickets] fetchCreatedTicketsCount total:", total);
      setCreatedTicketsCount(Number(total) || 0);
    } catch (error) {
      console.error("Error fetching created tickets count:", error);
    }
  };

  const fetchCreatedTickets = async (ignoreFilters: boolean = false) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (!ignoreFilters) {
        if (filters.dateFrom) params.append("date_from", filters.dateFrom);
        if (filters.dateTo) params.append("date_to", filters.dateTo);
        if (filters.priority) params.append("priority_id", filters.priority);
        if (filters.assignedTo)
          params.append("assigned_user_id", filters.assignedTo);
      }

      const query = params.toString() ? `?${params}` : "";
      const response = await api.get(
        `/email-processing/created-tickets${query}`,
      );
      const payload =
        response && !Array.isArray(response) && response.tickets
          ? response
          : response.data || response;
      console.debug("[ManageTickets] fetchCreatedTickets response:", response);
      console.debug("[ManageTickets] fetchCreatedTickets payload:", payload);
      const ticketsList = Array.isArray(payload)
        ? payload
        : payload.tickets || payload.data?.tickets || [];

      // If server provided server_time, capture offset so SLA math is consistent
      try {
        const srvTime = payload.server_time ?? payload.serverTime ?? null;
        if (srvTime) {
          const serverMs = new Date(String(srvTime)).getTime();
          serverTimeOffsetRef.current = Date.now() - serverMs;
        }
      } catch (e) {
        // ignore
      }

      // Attach fetch metadata to each created ticket so computeSla can use it
      const annotated = (ticketsList || []).map((t: any) => ({
        ...t,
        __server_time_ms: payload.server_time
          ? new Date(String(payload.server_time)).getTime()
          : undefined,
        __fetched_at_ms: Date.now(),
      }));

      // Fallback to local tickets when server returns empty created_tickets
      const localFallback = tickets.filter((t) => t.created_from_mail_config);
      if ((!annotated || annotated.length === 0) && localFallback.length > 0) {
        console.debug(
          "[ManageTickets] Using local fallback for created tickets",
          localFallback.length,
        );
        const mapped = localFallback.map((t: any) => ({
          id: t.id,
          email_subject: t.subject || t.track_id,
          email_from:
            (t.creator && (t.creator.email || t.creator.name)) || "Unknown",
          config_name: t.mail_config_id ? `Config #${t.mail_config_id}` : "",
          assigned_to:
            t.assignee ||
            (t.assigned_to ? { id: t.assigned_to, name: "Unassigned" } : null),
          priority_id: t.priority_id,
          mitra_ticket_id: t.mitra_ticket_id || null,
          created_at: t.created_at,
          updated_at: t.updated_at,
          sla_time: t.sla_time,
          status: t.status || null,
          // include original ticket as source for full parity
          __source_ticket: t,
        }));
        setCreatedTickets(mapped);
        setCreatedTicketsCount((prev) => Math.max(prev || 0, mapped.length));
      } else {
        setCreatedTickets(annotated);
        const total =
          payload.pagination?.total ?? payload.total ?? (annotated.length || 0);
        console.debug("[ManageTickets] fetchCreatedTickets total:", total);
        setCreatedTicketsCount(Number(total) || 0);
      }
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
    // If the last fetch already applied server-side filters, skip client-side re-filtering
    if (serverFilteredRef.current) {
      serverFilteredRef.current = false;
      return;
    }
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
    if (
      filters.priority !== undefined &&
      String(filters.priority).trim() !== ""
    ) {
      filtered = filtered.filter(
        (t) => t.priority_id === parseInt(filters.priority, 10),
      );
    }

    // Status filter
    if (filters.status !== undefined && String(filters.status).trim() !== "") {
      const normalize = (s: any) =>
        String(s || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      filtered = filtered.filter((t) => {
        const statusName = (t.status as any)?.name || t.status || "";
        const token = normalize(statusName);
        return token === normalize(filters.status);
      });
    }

    // Assigned to filter
    if (
      filters.assignedTo !== undefined &&
      String(filters.assignedTo).trim() !== ""
    ) {
      if (filters.assignedTo === "unassigned") {
        filtered = filtered.filter(
          (t) => t.assigned_to_id === null || t.assigned_to_id === undefined,
        );
      } else {
        filtered = filtered.filter(
          (t) => t.assigned_to_id === parseInt(filters.assignedTo, 10),
        );
      }
    }

    // Source filter (mail config vs manual or specific tag)
    if (filters.source) {
      if (filters.source === "mail_config") {
        filtered = filtered.filter((t) => t.created_from_mail_config);
      } else if (filters.source === "manual") {
        filtered = filtered.filter((t) => !t.created_from_mail_config);
      } else {
        // specific tag selected
        const sel = String(filters.source).toLowerCase();
        filtered = filtered.filter((t) => {
          // check ticket tags array first
          try {
            if (Array.isArray(t.tags)) {
              if (t.tags.some((tg: any) => String(tg).toLowerCase() === sel))
                return true;
            }
          } catch (e) {}

          // try deriving provider name from mail_config_sources or description
          try {
            const prov =
              getMailConfigProviderName(
                t.mail_config_sources || t.mail_config_sources,
                t.description,
              ) || null;
            if (prov && String(prov).toLowerCase() === sel) return true;
          } catch (e) {}

          return false;
        });
      }
    }

    // Date range filter (interpret date-only inputs as full IST day ranges)
    const expandIstDate = (dateStr: string, endOfDay = false) => {
      const parts = String(dateStr).split("-");
      if (parts.length !== 3) return null;
      const [y, m, d] = parts.map((p) => parseInt(p, 10));
      if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
      const hour = endOfDay ? 23 : 0;
      const minute = endOfDay ? 59 : 0;
      const second = endOfDay ? 59 : 0;
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const utcTs = Date.UTC(y, m - 1, d, hour, minute, second) - istOffsetMs;
      return new Date(utcTs);
    };

    if (filters.dateFrom) {
      const dateFromDt = expandIstDate(filters.dateFrom, false);
      if (dateFromDt) {
        filtered = filtered.filter(
          (t) => new Date(t.created_at).getTime() >= dateFromDt.getTime(),
        );
      }
    }

    if (filters.dateTo) {
      const dateToDt = expandIstDate(filters.dateTo, true);
      if (dateToDt) {
        filtered = filtered.filter(
          (t) => new Date(t.created_at).getTime() <= dateToDt.getTime(),
        );
      }
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

  const fetchAssignedOptions = async () => {
    try {
      const resp = await api.get("/tickets/assigned-options");
      const data = resp?.data ?? resp;
      if (Array.isArray(data?.options)) setAssignedOptionsState(data.options);
      else setAssignedOptionsState([]);
    } catch (e) {
      console.error("Error fetching assigned options:", e);
      setAssignedOptionsState([]);
    }
  };

  // Export all tickets to Excel with multiple sheets as requested
  const exportAllTicketsToExcel = async () => {
    try {
      setIsLoading(true);
      const allTickets: any[] = [];
      let page = 1;
      let totalPages = 1;

      // Fetch all pages sequentially
      do {
        const resp = await api.getTickets({}, page, 100);
        const data = resp?.data ?? resp;
        const ticketsArr = data?.tickets ?? (Array.isArray(data) ? data : []);

        // Normalize similar to fetchTickets
        const serverMs = data?.server_time
          ? new Date(String(data.server_time)).getTime()
          : null;
        const fetchClientMs = Date.now();
        const normalized = (ticketsArr || []).map((t: any) => {
          let statusInfo = t.status;
          if (!statusInfo && t.status_id) {
            statusInfo = {
              id: t.status_id,
              name: t.status_name || "Unknown",
              color: t.status_color || "#999",
              is_closed: t.status_is_closed || false,
              sort_order: 0,
            };
          }
          const pr = ((): number | null => {
            const val =
              t.priority_id ?? (t.priority && (t.priority.id ?? t.priority_id));
            const num = Number(val);
            return Number.isFinite(num) ? num : null;
          })();

          return {
            ...t,
            priority_id: pr,
            assigned_to_id:
              t.assigned_to_id ??
              (t.assigned_to !== undefined && t.assigned_to !== null
                ? Number(t.assigned_to)
                : null) ??
              null,
            track_id:
              t.track_id ?? t.trackId ?? `TKT-${String(t.id).padStart(4, "0")}`,
            description: t.description || "",
            status: statusInfo,
            created_from_mail_config: t.created_from_mail_config ?? false,
            __server_time_ms: serverMs,
            __fetched_at_ms: fetchClientMs,
          };
        });

        allTickets.push(...normalized);
        totalPages = data?.pages ?? 1;
        page += 1;
      } while (page <= totalPages);

      // Prepare summaries
      const tagCounts = new Map<string, number>();
      const userCounts = new Map<string, number>();
      const statusCounts = new Map<string, number>();

      const tagStatusCounts: Record<string, Record<string, number>> = {};

      const createdEmailRows: any[] = [];

      const normalizeTagForTicket = (t: any): string[] => {
        // Priority: description content (razorpay/payswiff), explicit tags, mail config provider, Manual
        try {
          const desc = String(t.description || "").toLowerCase();
          if (desc.includes("razorpay")) return ["Razorpay"];
          if (desc.includes("payswiff")) return ["Payswiff"];
        } catch (e) {}

        try {
          if (Array.isArray(t.tags) && t.tags.length > 0) {
            return t.tags.map((x: any) => String(x).trim()).filter(Boolean);
          }
        } catch (e) {}

        if (t.created_from_mail_config) {
          try {
            const prov = getMailConfigProviderName(
              t.mail_config_sources || t.mail_config_sources,
              t.description,
            );
            if (prov) return [prov];
          } catch (e) {}
        }

        return [t.created_from_mail_config ? "Email" : "Manual"];
      };

      for (const t of allTickets) {
        const tagNames = normalizeTagForTicket(t);

        const statusLabel =
          (t.status && (t.status.name || t.status)) || "Unknown";

        for (const tg of tagNames) {
          const key = String(tg || "");
          tagCounts.set(key, (tagCounts.get(key) || 0) + 1);

          if (!tagStatusCounts[key]) tagStatusCounts[key] = {};
          tagStatusCounts[key][statusLabel] =
            (tagStatusCounts[key][statusLabel] || 0) + 1;
        }

        // Assigned user
        const assignedLabel =
          t.assignee?.name || getAssignedUserName(t.assigned_to_id);
        userCounts.set(assignedLabel, (userCounts.get(assignedLabel) || 0) + 1);

        // Status
        statusCounts.set(statusLabel, (statusCounts.get(statusLabel) || 0) + 1);

        // Created-from-email rows
        if (t.created_from_mail_config) {
          const provider = ((): string => {
            try {
              const p = getMailConfigProviderName(
                t.mail_config_sources || t.mail_config_sources,
                t.description,
              );
              return (
                p ||
                (Array.isArray(t.tags) && t.tags.length
                  ? String(t.tags[0])
                  : "")
              );
            } catch (e) {
              return Array.isArray(t.tags) && t.tags.length
                ? String(t.tags[0])
                : "";
            }
          })();

          createdEmailRows.push([
            t.id,
            t.subject || t.track_id || "",
            assignedLabel,
            statusLabel,
            (t.priority && t.priority.name) ||
              (PRIORITY_OPTIONS[
                t.priority_id as keyof typeof PRIORITY_OPTIONS
              ] &&
                PRIORITY_OPTIONS[t.priority_id as keyof typeof PRIORITY_OPTIONS]
                  .name) ||
              "",
            formatToIST(t.created_at),
            formatToIST(t.updated_at),
            provider,
          ]);
        }
      }

      // Build workbook
      const wb = XLSX.utils.book_new();

      // Build per-user status counts
      const userStatusCounts: Record<string, Record<string, number>> = {};
      for (const t of allTickets) {
        const assignedLabel =
          t.assignee?.name || getAssignedUserName(t.assigned_to_id);
        const statusLabel =
          (t.status && (t.status.name || t.status)) || "Unknown";
        if (!userStatusCounts[assignedLabel])
          userStatusCounts[assignedLabel] = {};
        userStatusCounts[assignedLabel][statusLabel] =
          (userStatusCounts[assignedLabel][statusLabel] || 0) + 1;
      }

      const tagRows = [["Tag", "Count"]];
      Array.from(tagCounts.entries()).forEach(([k, v]) => tagRows.push([k, v]));

      const userRows = [["User", "Count"]];
      Array.from(userCounts.entries()).forEach(([k, v]) =>
        userRows.push([k, v]),
      );

      const statusRows = [["Status", "Count"]];
      Array.from(statusCounts.entries()).forEach(([k, v]) =>
        statusRows.push([k, v]),
      );

      // Build Summary sheet with per-tag status breakdown
      // Determine status columns from statusesList (fallback to common names)
      const statusNames =
        statusesList && statusesList.length > 0
          ? statusesList.map((s: any) => s.name)
          : ["Open", "In Progress", "Pending", "Overdue", "Closed"];

      const summaryHeader = ["Tag", "Total", ...statusNames];
      const summaryRows = [summaryHeader];

      const uniqueTags = Array.from(
        new Set<string>([...Array.from(tagCounts.keys())]),
      );
      for (const tagName of uniqueTags) {
        const totalsByStatus = tagStatusCounts[tagName] || {};
        const total = tagCounts.get(tagName) || 0;
        const row = [tagName, total];
        for (const sName of statusNames) {
          row.push(totalsByStatus[sName] || 0);
        }
        summaryRows.push(row);
      }

      // Append a blank row and then user per-status summary
      summaryRows.push([]);
      summaryRows.push(["User", "Total", ...statusNames]);
      const uniqueUsers = Array.from(
        new Set<string>([...Array.from(userCounts.keys())]),
      );
      for (const userName of uniqueUsers) {
        const totalsByStatus = userStatusCounts[userName] || {};
        const total = userCounts.get(userName) || 0;
        const row = [userName, total];
        for (const sName of statusNames) {
          row.push(totalsByStatus[sName] || 0);
        }
        summaryRows.push(row);
      }

      // Append overall status totals
      summaryRows.push([]);
      summaryRows.push(["Status", "Count"]);
      Array.from(statusCounts.entries()).forEach(([k, v]) =>
        summaryRows.push([k, v]),
      );

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      // Sheet 2: From Email
      const wsEmailHeaders = [
        [
          "ticket_id",
          "subject",
          "assigned_to",
          "status",
          "Priority",
          "created_at",
          "Updated_at",
          "tag",
        ],
      ];
      const wsEmail = XLSX.utils.aoa_to_sheet([
        ...wsEmailHeaders,
        ...createdEmailRows,
      ]);
      XLSX.utils.book_append_sheet(wb, wsEmail, "From Email");

      // Sheets for each tag (including Manual)
      const uniqueTagsForSheets = Array.from(
        new Set<string>([...Array.from(tagCounts.keys())]),
      );
      for (const tagName of uniqueTagsForSheets) {
        const rows = [
          [
            "ticket_id",
            "subject",
            "assigned_to",
            "status",
            "Priority",
            "created_at",
            "Updated_at",
            "tags",
          ],
        ];
        for (const t of allTickets) {
          let match = false;
          try {
            const norms = normalizeTagForTicket(t).map((x) =>
              String(x).toLowerCase(),
            );
            if (norms.includes(String(tagName).toLowerCase())) match = true;
          } catch (e) {}

          if (match) {
            rows.push([
              t.id,
              t.subject || t.track_id || "",
              t.assignee?.name || getAssignedUserName(t.assigned_to_id),
              (t.status && (t.status.name || t.status)) || "",
              (t.priority && t.priority.name) ||
                (PRIORITY_OPTIONS[
                  t.priority_id as keyof typeof PRIORITY_OPTIONS
                ] &&
                  PRIORITY_OPTIONS[
                    t.priority_id as keyof typeof PRIORITY_OPTIONS
                  ].name) ||
                "",
              formatToIST(t.created_at),
              formatToIST(t.updated_at),
              Array.isArray(t.tags)
                ? t.tags.join(", ")
                : t.created_from_mail_config
                  ? getMailConfigProviderName(
                      t.mail_config_sources || t.mail_config_sources,
                      t.description,
                    ) || ""
                  : "Manual",
            ]);
          }
        }

        const safeName = String(tagName || "Sheet").slice(0, 31);
        const wsTag = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, wsTag, safeName);
      }

      // Write and download
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      saveAs(
        blob,
        `tickets-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );

      toast({ title: "Export ready", description: "Excel export downloaded" });
    } catch (err) {
      console.error("Export failed:", err);
      toast({
        title: "Export failed",
        description: "Could not generate Excel file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const assignedOptions = (() => {
    if (assignedOptionsState && assignedOptionsState.length > 0)
      return assignedOptionsState;

    // Fallback: derive from tickets and users
    const map = new Map<string, string>();
    for (const t of tickets) {
      const id = (t as any).assigned_to_id ?? t.assigned_to ?? null;
      if (id === null || id === undefined) {
        if (!map.has("unassigned")) map.set("unassigned", "Unassigned");
      } else {
        const key = String(id);
        if (!map.has(key)) {
          let label = `User #${key}`;
          const user = users.find((u) => Number(u.id) === Number(id));
          if (user) {
            if (user.firstname || user.lastname)
              label = `${user.firstname || ""} ${user.lastname || ""}`.trim();
            else if (user.name) label = user.name;
            else if (user.first_name && user.last_name)
              label = `${user.first_name} ${user.last_name}`;
          } else if (
            (t as any).assignee &&
            ((t as any).assignee.name || (t as any).assignee.first_name)
          ) {
            label =
              (t as any).assignee.name ||
              `${(t as any).assignee.first_name || ""} ${(t as any).assignee.last_name || ""}`.trim();
          }
          map.set(key, label);
        }
      }
    }
    // Ensure users are present
    for (const u of users) {
      const k = String(u.id);
      if (!map.has(k)) {
        if (u.firstname || u.lastname)
          map.set(k, `${u.firstname || ""} ${u.lastname || ""}`.trim());
        else if (u.name) map.set(k, u.name);
        else map.set(k, `User #${k}`);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  })();

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

  // fetch ticket metadata to discover overdue status id and build statuses map
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meta = await api.getTicketMetadata();
        const statuses = meta?.data?.statuses ?? meta?.statuses ?? [];
        if (mounted) {
          setStatusesList(statuses);
          const map: Record<string, number> = {};
          for (const s of statuses) {
            const key = String(s.name || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "");
            map[key] = Number(s.id);
          }
          setStatusesMap(map);
        }
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
  // Otherwise, fallback to created_at + priority-based SLA hours. Adjust server-provided
  // sla_remaining_ms dynamically so it counts down on the client. Use the client-side
  // server offset to compute a dynamic serverNowMs so values update each render.
  const computeSlaMsForTicket = (ticket: any): number | null => {
    try {
      // Compute current server-aligned 'now' (ms). Prefer clientNow - offset when available
      // so the value changes on every render (setNow interval triggers rerenders).
      const clientNowMs = Date.now();
      const serverNowMs =
        typeof serverTimeOffsetRef.current === "number" &&
        serverTimeOffsetRef.current !== 0
          ? clientNowMs - serverTimeOffsetRef.current
          : clientNowMs;

      // If server provided a precomputed remaining ms, adjust it based on elapsed time since that computation
      if (
        ticket.sla_remaining_ms !== undefined &&
        ticket.sla_remaining_ms !== null
      ) {
        const baseTime = Number(
          ticket.__server_time_ms ?? ticket.__fetched_at_ms ?? serverNowMs,
        );
        const elapsedSinceBase = serverNowMs - baseTime;
        return Number(ticket.sla_remaining_ms) - elapsedSinceBase;
      }

      // If SLA timestamp is available, compute remaining relative to serverNowMs
      if (ticket.sla_time) {
        const parsed = parseTimestampAsUTC(ticket.sla_time);
        const ts = parsed ? parsed.getTime() : NaN;
        if (isNaN(ts)) return null;
        return ts - serverNowMs;
      }

      // Fallback mapping (use priority IDs that the UI uses)
      const PRIORITY_SLA_HOURS: Record<number, number> = {
        0: 2, // Priority 0 -> 2 hours
        1: 2, // Low -> 2 hours
        2: 5, // Normal -> 5 hours
        3: 8, // High -> 8 hours
        4: 24, // Urgent -> 24 hours
        5: 48, // Immediate -> 48 hours
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
      return slaTs - serverNowMs;
    } catch (e) {
      console.error("SLA compute error", e);
      return null;
    }
  };

  const markOverdue = async (ticket: any) => {
    if (!overdueStatusId) return;
    if (autoMarkedRef.current.has(ticket.id)) return;

    // Avoid marking if already overdue, closed, or if status is In Progress
    const sName =
      (ticket.status && (ticket.status.name || ticket.status)) ||
      ticket.status ||
      "";
    const sNameLower = String(sName).toLowerCase();
    if (sNameLower.includes("overdue")) return;
    if (sNameLower.includes("in progress") || sNameLower.includes("inprogress"))
      return;
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

  // Use filtered tickets directly since server provides pagination
  const paginatedTickets = filteredTickets;

  const effectiveCreatedTickets = React.useMemo(() => {
    if (createdTickets && createdTickets.length > 0) {
      // If we have the full ticket object in `tickets`, prefer that as the source so SLA & metadata match
      return createdTickets.map((ct: any) => {
        const ticketId = ct.ticket_id ?? ct.ticket_ref_id ?? ct.id;
        const authoritative = tickets.find(
          (t) => Number(t.id) === Number(ticketId),
        );
        return {
          ...ct,
          __source_ticket: authoritative ?? ct.__source_ticket ?? undefined,
        };
      });
    }
    const local = tickets.filter((t) => t.created_from_mail_config);
    if (!local || local.length === 0) return [];
    return local.map((t: any) => ({
      id: t.id,
      email_subject: t.subject || t.track_id,
      email_from:
        (t.creator && (t.creator.email || t.creator.name)) || "Unknown",
      config_name: t.mail_config_id ? `Config #${t.mail_config_id}` : "",
      assigned_to:
        t.assignee ||
        (t.assigned_to ? { id: t.assigned_to, name: "Unassigned" } : null),
      priority_id: t.priority_id,
      mitra_ticket_id: t.mitra_ticket_id || null,
      created_at: t.created_at,
      __source_ticket: t,
    }));
  }, [createdTickets, tickets]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900">Manage Tickets</h1>
        <div className="flex gap-4 mt-4 items-center">
          <div className="flex gap-4">
            <Button
              variant={activeTab === "all" ? "default" : "outline"}
              onClick={() => {
                setActiveTab("all");
                setCurrentPage(1);
              }}
            >
              All Tickets ({totalTickets})
            </Button>
            <Button
              variant={activeTab === "created" ? "default" : "outline"}
              onClick={() => {
                // If no date filters are set, default created view to today's IST day
                if (!filters.dateFrom || !filters.dateTo) {
                  const now = new Date();
                  const istOffsetMs = 5.5 * 60 * 60 * 1000;
                  const ist = new Date(now.getTime() + istOffsetMs);
                  const yyyy = ist.getUTCFullYear();
                  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
                  const dd = String(ist.getUTCDate()).padStart(2, "0");
                  const today = `${yyyy}-${mm}-${dd}`;
                  setFilters((f) => ({ ...f, dateFrom: today, dateTo: today }));
                  // fetch after state update
                  setTimeout(() => fetchCreatedTickets(true), 50);
                } else {
                  fetchCreatedTickets(true);
                }
                setActiveTab("created");
                setCurrentPage(1);
              }}
            >
              Created from Email ({createdTicketsCount})
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Date picker (IST day) placed left of Filters button */}
            <div>
              <label className="sr-only">Date</label>
              <Input
                type="date"
                value={filters.dateFrom || ""}
                onChange={(e) => {
                  const d = e.target.value;
                  // Set both from and to to the selected date (full IST day)
                  setFilters({ ...filters, dateFrom: d, dateTo: d });
                }}
                className="mr-2"
              />
            </div>

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

            <Button variant="outline" onClick={() => exportAllTicketsToExcel()}>
              Export Excel
            </Button>

            <Link to="/tickets/create">
              <Button>Create Ticket</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Status counts and Charts */}
      {activeTab === "all" && (
        <TicketCharts dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-indigo-600">
              {statusCounts["Open"] ?? 0}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Open</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-orange-600">
              {statusCounts["In Progress"] ?? statusCounts["InProgress"] ?? 0}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">
              In Progress
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-yellow-600">
              {statusCounts["Pending"] ?? 0}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Pending</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-red-600">
              {statusCounts["Overdue"] ?? 0}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Overdue</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-2xl md:text-3xl font-bold text-gray-900">
              {statusCounts["Closed"] ?? 0}
            </p>
            <p className="mt-2 text-sm font-medium text-gray-600">Closed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <Card className="mb-6">
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2">
                <label className="sr-only">Search</label>
                <Input
                  placeholder="Search subject or description"
                  value={filters.searchText}
                  onChange={(e) =>
                    setFilters({ ...filters, searchText: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="sr-only">Priority</label>
                <Select
                  value={String(filters.priority)}
                  onValueChange={(v) => setFilters({ ...filters, priority: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    {Object.entries(PRIORITY_OPTIONS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="sr-only">Status</label>
                <Select
                  value={String(filters.status)}
                  onValueChange={(v) => setFilters({ ...filters, status: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="sr-only">Assigned</label>
                <Select
                  value={String(filters.assignedTo)}
                  onValueChange={(v) =>
                    setFilters({ ...filters, assignedTo: v })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignedOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="sr-only">Source/Tag</label>
                <Select
                  value={String(filters.source)}
                  onValueChange={(v) => setFilters({ ...filters, source: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="mail_config">From Email</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    {sourceTags.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-6 flex items-center gap-2">
                <Button variant="ghost" onClick={clearFilters}>
                  <X size={14} /> Clear
                </Button>
                <div className="ml-auto">
                  <Button onClick={() => setShowFilters(false)}>Done</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticket list */}
      <div>
        {activeTab === "all" && (
          <div>
            {isLoading ? (
              <div className="text-center py-8">Loading tickets...</div>
            ) : paginatedTickets.length === 0 ? (
              <div className="text-center py-8">No tickets found</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedTickets.map((t) => {
                  const pr = getPriorityBadge(t.priority_id || 0);
                  const slaMs = computeSlaMsForTicket(t);
                  const slaText =
                    slaMs === null ? "No SLA" : formatRemaining(slaMs);
                  const provider = getMailConfigProviderName(
                    t.mail_config_sources || t.mail_config_sources,
                    t.description,
                  );

                  return (
                    <Card key={t.id} className="hover:shadow transition-shadow col-span-1">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3">
                            <CardTitle className="text-sm font-semibold">
                              <Link
                                to={`/tickets/${t.id}`}
                                className="hover:underline"
                              >
                                {t.subject || t.track_id}
                              </Link>
                            </CardTitle>
                          </div>

                          <div className="text-right text-xs flex flex-col items-end gap-1">
                            {t.created_from_mail_config ? (
                              <Badge className="bg-green-100 text-green-800">
                                From Mail Config
                              </Badge>
                            ) : provider ? (
                              <Badge variant="outline">{provider}</Badge>
                            ) : null}

                            <div className="font-medium text-gray-600">
                              {t.track_id}
                            </div>
                            <div className="text-gray-500 text-[11px]">
                              {formatToIST(t.created_at)}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-3 text-sm text-gray-700 truncate">
                          {t.description}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {pr && (
                              <Badge className={pr.color}>{pr.name}</Badge>
                            )}
                            <Badge>
                              {t.status?.name || (t.status as any) || "Unknown"}
                            </Badge>
                            {provider && (
                              <Badge variant="outline">{provider}</Badge>
                            )}
                          </div>

                          <div className="text-right text-sm">
                            <div className="text-gray-600">
                              {getAssignedUserName(t.assigned_to_id)}
                            </div>
                            <div
                              className={`text-xs ${slaMs !== null && slaMs < 0 ? "text-red-600" : "text-gray-500"}`}
                            >
                              {slaText}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            Updated{" "}
                            {formatDistanceToNowStrict(new Date(t.updated_at))}{" "}
                            ago
                          </div>
                          <div className="flex gap-2">
                            <Link to={`/tickets/${t.id}/edit`}>
                              <Button size="sm" variant="ghost">
                                <Edit size={14} />
                              </Button>
                            </Link>
                            <Button size="sm" variant="destructive">
                              <Trash size={14} />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <div className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {activeTab === "created" && (
          <div>
            {isLoading ? (
              <div className="text-center py-8">Loading created tickets...</div>
            ) : effectiveCreatedTickets.length === 0 ? (
              <div className="text-center py-8">
                No created-from-email tickets
              </div>
            ) : (
              <div className="space-y-4">
                {effectiveCreatedTickets.map((ct: any) => {
                  const src = ct.__source_ticket || ct;
                  const slaMs = computeSlaMsForTicket(src);
                  const slaText =
                    slaMs === null ? "No SLA" : formatRemaining(slaMs);

                  return (
                    <Card
                      key={ct.id}
                      className="hover:shadow transition-shadow"
                    >
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-sm font-semibold">
                            {ct.email_subject}
                          </CardTitle>
                          <div className="text-right text-xs">
                            <div className="font-medium text-gray-600">
                              {ct.mitra_ticket_id || "-"}
                            </div>
                            <div className="text-gray-500 text-[11px]">
                              {formatToIST(ct.created_at)}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-700">
                            From: {ct.email_from}
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-gray-600">
                              {ct.assigned_to?.name || "Unassigned"}
                            </div>
                            <div
                              className={`text-xs ${slaMs !== null && slaMs < 0 ? "text-red-600" : "text-gray-500"}`}
                            >
                              {slaText}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
