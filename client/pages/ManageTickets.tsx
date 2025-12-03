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