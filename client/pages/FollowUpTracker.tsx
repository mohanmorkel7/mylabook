import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  MessageCircle,
  User,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  ExternalLink,
  Reply,
  Target,
} from "lucide-react";
import { formatToIST, formatToISTDateTime, isOverdue } from "@/lib/dateUtils";
import { updateFollowUpStatusWithNotification } from "@/utils/followUpUtils";

interface FollowUp {
  id: number;
  message_id?: number;
  step_id?: number;
  lead_id?: number;
  vc_id?: number;
  client_id?: number;
  title: string;
  description?: string;
  lead_name?: string;
  lead_client_name?: string;
  client_name?: string;
  vc_round_title?: string;
  investor_name?: string;
  step_name?: string;
  assigned_to?: number;
  assigned_user_name?: string;
  created_by?: number;
  created_by_name?: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  priority?: "low" | "medium" | "high" | "urgent";
  follow_up_type?: string;
  due_date?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  notes?: string;
  type?: "lead" | "vc" | "sales"; // Add 'sales' for business offering follow-ups
}

// Mock follow-up data with both leads and VC follow-ups
const mockFollowUps: FollowUp[] = [
  // Lead follow-ups
  {
    id: 13,
    message_id: 2,
    step_id: 1,
    lead_id: 1,
    title: "Technical Specifications Review",
    description: "Review technical specifications for TechCorp integration",
    lead_client_name: "TechCorp Solutions",
    step_name: "Initial Contact",
    assigned_user_name: "Mike Johnson",
    created_by_name: "Jane Smith",
    status: "pending",
    priority: "high",
    due_date: "2024-01-25",
    created_at: "2024-01-16T14:15:00Z",
    notes: "Need to validate feasibility of custom integration requirements",
    type: "lead",
  },
  {
    id: 14,
    message_id: 4,
    step_id: 2,
    lead_id: 1,
    title: "API Documentation",
    description: "Provide API documentation for client review",
    lead_client_name: "TechCorp Solutions",
    step_name: "Document Collection",
    assigned_user_name: "John Doe",
    created_by_name: "Jane Smith",
    status: "in_progress",
    priority: "medium",
    due_date: "2024-01-24",
    created_at: "2024-01-21T09:00:00Z",
    notes: "API documentation is 70% complete, waiting for security review",
    type: "lead",
  },
  {
    id: 15,
    message_id: 6,
    step_id: 3,
    lead_id: 2,
    title: "Timeline Assessment",
    description: "Assess timeline impact for additional reporting features",
    lead_client_name: "RetailMax Inc",
    step_name: "Proposal Sent",
    assigned_user_name: "Mike Johnson",
    created_by_name: "John Doe",
    status: "completed",
    priority: "medium",
    due_date: "2024-01-20",
    created_at: "2024-01-18T11:30:00Z",
    completed_at: "2024-01-19T16:45:00Z",
    notes:
      "Timeline assessment completed - 2 additional weeks needed for reporting features",
    type: "lead",
  },
  // VC follow-ups (visible only to admin)
  {
    id: 16,
    vc_id: 1,
    step_id: 4,
    title: "Investment Committee Presentation",
    description:
      "Schedule and prepare presentation for Accel Partners investment committee",
    vc_round_title: "Series A Funding",
    investor_name: "Accel Partners",
    step_name: "Due Diligence Review",
    assigned_user_name: "Emily Davis",
    created_by_name: "David Kim",
    status: "pending",
    priority: "high",
    due_date: "2024-01-27",
    created_at: "2024-01-24T10:00:00Z",
    notes: "Need to coordinate with legal team for compliance review",
    type: "vc",
  },
  {
    id: 17,
    vc_id: 2,
    step_id: 5,
    title: "Financial Projections Update",
    description: "Send updated Q4 financial projections to Sequoia Capital",
    vc_round_title: "Seed Round",
    investor_name: "Sequoia Capital",
    step_name: "Financial Review",
    assigned_user_name: "Finance Team",
    created_by_name: "Bob Wilson",
    status: "in_progress",
    priority: "medium",
    due_date: "2024-01-26",
    created_at: "2024-01-23T14:30:00Z",
    notes: "Waiting for final approval from CFO",
    type: "vc",
  },
  {
    id: 18,
    vc_id: 4,
    step_id: 6,
    title: "Technical Architecture Deep Dive",
    description: "Technical review meeting with Lightspeed technical partners",
    vc_round_title: "Pre-Series A",
    investor_name: "Lightspeed Venture",
    step_name: "Technical Due Diligence",
    assigned_user_name: "Tech Lead",
    created_by_name: "David Kim",
    status: "pending",
    priority: "high",
    due_date: "2024-01-30",
    created_at: "2024-01-22T09:15:00Z",
    notes: "Prepare detailed system architecture documentation",
    type: "vc",
  },
];

const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

const priorityColors = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
  urgent: "bg-purple-100 text-purple-700",
};

const statusIcons = {
  pending: Clock,
  in_progress: AlertCircle,
  completed: CheckCircle,
  overdue: AlertCircle,
};

export default function FollowUpTracker() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(
    null,
  );
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // Filter for lead vs VC follow-ups

  // Check user role for follow-up visibility
  const isAdmin = user?.role === "admin";
  const isSales = user?.role === "sales";
  const isVC = user?.role === "vc" || user?.role === "venture";

  // Helper function to check if user can see a follow-up based on role
  const canViewFollowUp = (followUp: FollowUp) => {
    const followUpType =
      followUp.type ||
      ((followUp as any).business_offering_id ||
      (followUp as any).business_offering_solution ||
      (followUp as any).business_offering_product
        ? "sales"
        : followUp.vc_id || followUp.vc_round_title || followUp.investor_name
          ? "vc"
          : "lead");

    if (isAdmin) return true; // Admin sees all
    if (followUpType === "vc" && !isVC) return false; // VC follow-ups only for VC/admin
    if (followUpType === "lead" && isVC) return false; // Lead follow-ups hidden from VC role
    if (followUpType === "sales" && isVC) return false; // Hide sales from VC role
    return true;
  };

  const assigneeOptions = React.useMemo(() => {
    const set = new Set<string>();
    followUps.forEach((f) => {
      if (canViewFollowUp(f) && f.assigned_user_name) {
        const name = String(f.assigned_user_name).trim();
        if (name) set.add(name);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [followUps, user?.role]);

  // Fetch follow-ups data from API
  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();

    const fetchFollowUps = async () => {
      try {
        setLoading(true);
        const data = await apiClient.getAllFollowUps({
          userId: user?.id || "",
          userRole: user?.role || "",
        });

        // Only update state if the request wasn't aborted
        if (!controller.signal.aborted) {
          const useMock = apiClient.isOffline() || !Array.isArray(data);
          const source = useMock ? mockFollowUps : data;

          // Convert to expected format and ensure IST timestamps
          const formattedFollowUps = source.map((f: any) => ({
            ...f,
            created_at: new Date(f.created_at).toISOString(),
            updated_at: new Date(f.updated_at || f.created_at).toISOString(),
            due_date: f.due_date,
            // Determine type based on available fields if not explicitly set
            type:
              f.type ||
              (f.business_offering_id ||
              f.business_offering_solution ||
              f.business_offering_product
                ? "sales"
                : f.vc_id || f.vc_round_title || f.investor_name
                  ? "vc"
                  : "lead"),
          }));

          // Debug VC follow-ups to check stepId fields
          const vcFollowUps = formattedFollowUps.filter(
            (f: any) =>
              f.type === "vc" || f.vc_id || f.vc_round_title || f.investor_name,
          );
          if (vcFollowUps.length > 0) {
            console.log(
              "�� VC Follow-ups fetched:",
              vcFollowUps.map((f: any) => ({
                id: f.id,
                title: f.title,
                vc_step_id: f.vc_step_id,
                message_id: f.message_id,
                step_id: f.step_id,
                vc_id: f.vc_id,
                type: f.type,
              })),
            );
          }

          const uniqueMap = new Map<string | number, FollowUp>();
          formattedFollowUps.forEach((f: any) => {
            const compositeKey =
              f.id ??
              `${f.type || (f.business_offering_id || f.business_offering_solution || f.business_offering_product ? "sales" : f.vc_id || f.vc_round_title || f.investor_name ? "vc" : "lead")}-${f.lead_id ?? ""}-${f.vc_id ?? ""}-${(f as any).business_offering_id ?? ""}-${f.step_id ?? f.message_id ?? ""}-${f.created_at}`;
            uniqueMap.set(compositeKey, f);
          });
          setFollowUps(Array.from(uniqueMap.values()));
        }
      } catch (error) {
        // Only handle non-abort errors
        const errName = (error as any)?.name || "";
        if (errName !== "AbortError") {
          console.error("Failed to fetch follow-ups:", error);
          // Fallback to mock data when API fails
          const formattedMockFollowUps = mockFollowUps.map((f: any) => ({
            ...f,
            created_at: new Date(f.created_at).toISOString(),
            updated_at: new Date(f.updated_at || f.created_at).toISOString(),
            due_date: f.due_date,
            // Determine type based on available fields if not explicitly set
            type:
              f.type ||
              (f.vc_id || f.vc_round_title || f.investor_name ? "vc" : "lead"),
          }));
          const uniqueMockMap = new Map<string | number, FollowUp>();
          formattedMockFollowUps.forEach((f: any) => {
            const compositeKey =
              f.id ??
              `${f.type || (f.business_offering_id || f.business_offering_solution || f.business_offering_product ? "sales" : f.vc_id || f.vc_round_title || f.investor_name ? "vc" : "lead")}-${f.lead_id ?? ""}-${f.vc_id ?? ""}-${(f as any).business_offering_id ?? ""}-${f.step_id ?? f.message_id ?? ""}-${f.created_at}`;
            uniqueMockMap.set(compositeKey, f);
          });
          setFollowUps(Array.from(uniqueMockMap.values()));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchFollowUps();

    // Cleanup function to abort the request if component unmounts or dependencies change
    return () => {
      try {
        // Provide a reason to help debuggers and guard against environments that throw
        // when aborting in StrictMode double-invocation.
        (controller as any).abort?.("component-unmounted");
      } catch {
        // no-op: safely ignore abort errors
      }
    };
  }, [user]);

  // Check if we came here to view a specific follow-up ID
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const followUpId = params.get("id");
    if (followUpId && followUps.length > 0) {
      const followUp = followUps.find((f) => f.id === parseInt(followUpId));
      if (followUp) {
        setSelectedFollowUp(followUp);
      }
    }
  }, [location.search, followUps]);

  // Ensure assignee selection stays valid when options change
  useEffect(() => {
    if (assigneeFilter !== "all" && !assigneeOptions.includes(assigneeFilter)) {
      setAssigneeFilter("all");
    }
  }, [assigneeOptions]);

  const handleNavigateToMessage = (followUp: FollowUp) => {
    // Navigate to the lead details page and scroll to the specific message
    navigate(`/leads/${followUp.lead_id}`, {
      state: {
        scrollToMessage: followUp.message_id,
        highlightMessage: true,
        fromFollowUp: followUp.id,
      },
    });
  };

  const handleUpdateStatus = async (followUpId: number, newStatus: string) => {
    try {
      const completedAt =
        newStatus === "completed" ? new Date().toISOString() : null;

      // Find the follow-up to get step_id and title for notification
      const followUp = followUps.find((f) => f.id === followUpId);
      console.log("Found follow-up for status update:", followUp);

      if (followUp && user) {
        // Determine if this is a VC, business offering, or lead follow-up
        const followUpType =
          followUp.type ||
          ((followUp as any).business_offering_id ||
          (followUp as any).business_offering_solution ||
          (followUp as any).business_offering_product
            ? "sales"
            : followUp.vc_id ||
                followUp.vc_round_title ||
                followUp.investor_name
              ? "vc"
              : "lead");

        // Derive the correct stepId and API base for notifications
        let stepApiBase: "vc" | "fund-raises" | "leads" | "business-offerings" =
          "leads";
        let stepIdValue: number | undefined = followUp.step_id;

        if (followUpType === "sales") {
          // Business offering follow-up handling
          const businessOfferingStepId = (followUp as any)
            .business_offering_step_id;
          const messageId = followUp.message_id;

          if (businessOfferingStepId) {
            stepIdValue = businessOfferingStepId;
            stepApiBase = "business-offerings";
          } else if (messageId) {
            stepIdValue = messageId;
            stepApiBase = "business-offerings";
          } else {
            stepIdValue = followUp.step_id;
            stepApiBase = "business-offerings";
          }
        } else if (
          // Explicit fund-raise context
          (followUp as any).fund_raise_id ||
          (followUp as any).fund_raise_stage
        ) {
          const frStepId =
            followUp.message_id ||
            (followUp as any).vc_step_id ||
            followUp.step_id;
          stepIdValue = frStepId;
          stepApiBase = "fund-raises";
        } else if (followUpType === "vc") {
          // VC-related follow-up handling
          const vcStepId = (followUp as any).vc_step_id;
          const messageId = followUp.message_id;

          if (messageId) {
            // Stored as fund-raise step id
            stepIdValue = messageId;
            stepApiBase = "fund-raises";
          } else if (vcStepId) {
            stepIdValue = vcStepId;
            stepApiBase = "vc";
          } else {
            stepIdValue = followUp.step_id;
            stepApiBase = "vc";
          }
        } else {
          stepApiBase = "leads";
        }

        const notificationData = {
          stepId: stepIdValue,
          userId: parseInt(user.id),
          userName: user.name,
          followUpTitle:
            followUp.title ||
            followUp.description?.substring(0, 50) + "..." ||
            `Follow-up #${followUpId}`,
          isVC: followUpType === "vc",
          stepApiBase,
        } as const;

        console.log("✅ Successfully derived notification data:", {
          stepIdValue,
          stepApiBase,
          followUpType,
          followUpFields: {
            vc_step_id: (followUp as any).vc_step_id,
            message_id: followUp.message_id,
            step_id: followUp.step_id,
            vc_id: (followUp as any).vc_id,
          },
        });

        console.log("Updating follow-up status with notification:", {
          followUpId,
          newStatus,
          notificationData,
        });

        // Validate stepId before proceeding
        if (!stepIdValue) {
          console.error("❌ Critical error: stepId is null/undefined", {
            followUpId,
            followUp,
            notificationData,
          });

          // Still update the status, but skip notification
          const response = await fetch(`/api/follow-ups/${followUpId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: newStatus,
              completed_at: completedAt,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to update status");
          }

          alert(
            "Follow-up status updated, but team chat notification could not be sent due to missing step information.",
          );

          // Update local state and return early
          setFollowUps((prevFollowUps) =>
            prevFollowUps.map((f) =>
              f.id === followUpId
                ? { ...f, status: newStatus as any, completed_at: completedAt }
                : f,
            ),
          );
          return;
        }

        // Update status
        const resp = await fetch(`/api/follow-ups/${followUpId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            completed_at: completedAt,
          }),
        });
        if (!resp.ok) throw new Error("Failed to update status");

        // Post unified system message to the appropriate team chat
        const statusDisplayMap: Record<string, string> = {
          pending: "Pending",
          in_progress: "In Progress",
          completed: "Completed",
          overdue: "Overdue",
        };
        const oldDisplay =
          statusDisplayMap[(followUp as any).status] ||
          (followUp as any).status;
        const newDisplay = statusDisplayMap[newStatus] || newStatus;
        const sysMsg = `Step status changed from "${oldDisplay}" to "${newDisplay}" by ${user.name}`;

        await apiClient.request(`/${stepApiBase}/steps/${stepIdValue}/chats`, {
          method: "POST",
          body: JSON.stringify({
            user_id: parseInt(user.id),
            user_name: "System",
            message: sysMsg,
            message_type: "system",
            is_rich_text: false,
            attachments: [],
          }),
        });

        console.log(
          "Follow-up status update and chat notification completed successfully",
        );
      } else {
        // Fallback to original method if follow-up not found or no user
        const response = await fetch(`/api/follow-ups/${followUpId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
            completed_at: completedAt,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update status");
        }
      }

      // Update local state
      setFollowUps((prevFollowUps) =>
        prevFollowUps.map((f) =>
          f.id === followUpId
            ? { ...f, status: newStatus as any, completed_at: completedAt }
            : f,
        ),
      );
      console.log(`Follow-up ${followUpId} status updated to ${newStatus}`);
    } catch (error) {
      console.error("Failed to update follow-up status:", error);
      alert("Failed to update status. Please try again.");
    }
  };

  // Base filter function for search and filters
  const baseFilter = (followUp: FollowUp) => {
    if (!followUp) return false;

    // Determine follow-up type with fallback logic
    const followUpType =
      followUp.type ||
      ((followUp as any).business_offering_id ||
      (followUp as any).business_offering_solution ||
      (followUp as any).business_offering_product
        ? "sales"
        : followUp.vc_id || followUp.vc_round_title || followUp.investor_name
          ? "vc"
          : "lead");

    // Role-based filtering for follow-up visibility
    if (!canViewFollowUp(followUp)) {
      return false;
    }

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (
        followUp.lead_name ||
        followUp.lead_client_name ||
        followUp.vc_round_title ||
        ""
      )
        .toLowerCase()
        .includes(searchLower) ||
      (followUp.investor_name || "").toLowerCase().includes(searchLower) ||
      (followUp.step_name || "").toLowerCase().includes(searchLower) ||
      (followUp.assigned_user_name || "").toLowerCase().includes(searchLower) ||
      (followUp.created_by_name || "").toLowerCase().includes(searchLower) ||
      (followUp.title || "").toLowerCase().includes(searchLower) ||
      (followUp.description || "").toLowerCase().includes(searchLower) ||
      (followUp.id || "").toString().includes(searchTerm);

    const matchesStatus =
      statusFilter === "all" || followUp.status === statusFilter;
    const matchesAssignee =
      assigneeFilter === "all" ||
      followUp.assigned_user_name === assigneeFilter;
    const matchesType = typeFilter === "all" || followUpType === typeFilter;

    // Date-wise filtering using due_date (fallback to created_at)
    const targetDateStr = followUp.due_date || followUp.created_at;
    const targetDate = targetDateStr ? new Date(targetDateStr) : null;

    let matchesDate = true;
    if (targetDate) {
      const normalizedTarget = new Date(targetDate);
      normalizedTarget.setHours(0, 0, 0, 0);
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (normalizedTarget < from) matchesDate = false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(0, 0, 0, 0);
        if (normalizedTarget > to) matchesDate = false;
      }
    }

    return (
      matchesSearch &&
      matchesStatus &&
      matchesAssignee &&
      matchesType &&
      matchesDate
    );
  };

  // Filter follow-ups based on search and filters
  const filteredFollowUps = React.useMemo(() => {
    return followUps.filter(baseFilter);
  }, [
    followUps,
    searchTerm,
    statusFilter,
    assigneeFilter,
    typeFilter,
    dateFrom,
    dateTo,
    user?.role,
  ]);

  // Tab-specific filtered follow-ups
  const allFollowUps = filteredFollowUps;
  const pendingFollowUps = React.useMemo(
    () => filteredFollowUps.filter((f) => f.status === "pending"),
    [filteredFollowUps],
  );
  const inProgressFollowUps = React.useMemo(
    () => filteredFollowUps.filter((f) => f.status === "in_progress"),
    [filteredFollowUps],
  );
  const completedFollowUps = React.useMemo(
    () => filteredFollowUps.filter((f) => f.status === "completed"),
    [filteredFollowUps],
  );
  const overdueFollowUps = React.useMemo(() => {
    return filteredFollowUps.filter((f) => {
      const isOverdueStatus =
        f.status === "overdue" ||
        (f.status !== "completed" && f.due_date && isOverdue(f.due_date));
      return isOverdueStatus;
    });
  }, [filteredFollowUps]);

  const myFollowUps = React.useMemo(() => {
    const myId = parseInt(user?.id || "0");
    const myName = user?.name || "";
    return filteredFollowUps.filter((f: any) => {
      const byName = f.assigned_user_name === myName;
      const byId =
        (f.assigned_to && myId && parseInt(f.assigned_to) === myId) || false;
      const list = f.assigned_to_list;
      const inList = Array.isArray(list)
        ? list.some((x: any) => parseInt(String(x)) === myId)
        : false;
      const names = f.assigned_users_names || "";
      const inNames =
        typeof names === "string" && names.split(", ").includes(myName);
      return byName || byId || inList || inNames;
    });
  }, [filteredFollowUps, user?.id, user?.name]);
  const assignedByMe = React.useMemo(
    () => filteredFollowUps.filter((f) => f.created_by_name === user?.name),
    [filteredFollowUps, user?.name],
  );

  // Current tab's follow-ups (derived)
  const currentTabFollowUps = React.useMemo(() => {
    switch (activeTab) {
      case "pending":
        return pendingFollowUps;
      case "in_progress":
        return inProgressFollowUps;
      case "completed":
        return completedFollowUps;
      case "overdue":
        return overdueFollowUps;
      case "my_tasks":
        return myFollowUps;
      case "assigned_by_me":
        return assignedByMe;
      default:
        return allFollowUps;
    }
  }, [
    activeTab,
    allFollowUps,
    pendingFollowUps,
    inProgressFollowUps,
    completedFollowUps,
    overdueFollowUps,
    myFollowUps,
    assignedByMe,
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Follow-up Tracker
          </h1>
          <p className="text-gray-600 mt-1">
            Track and manage follow-up tasks from{" "}
            {isAdmin
              ? "leads, business offerings, and VC rounds"
              : isVC
                ? "VC rounds"
                : "leads"}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-sm">
            {myFollowUps.length} assigned to me
          </Badge>
          <Badge variant="outline" className="text-sm">
            {assignedByMe.length} assigned by me
          </Badge>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-600 text-sm font-medium">Pending</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {
                    filteredFollowUps.filter(
                      (f) => f.status === "pending" && canViewFollowUp(f),
                    ).length
                  }
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">In Progress</p>
                <p className="text-2xl font-bold text-blue-900">
                  {
                    filteredFollowUps.filter(
                      (f) => f.status === "in_progress" && canViewFollowUp(f),
                    ).length
                  }
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Completed</p>
                <p className="text-2xl font-bold text-green-900">
                  {
                    filteredFollowUps.filter(
                      (f) => f.status === "completed" && canViewFollowUp(f),
                    ).length
                  }
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-600 text-sm font-medium">Overdue</p>
                <p className="text-2xl font-bold text-red-900">
                  {
                    filteredFollowUps.filter((f) => {
                      const isOverdueStatus =
                        f.status === "overdue" ||
                        (f.status !== "completed" &&
                          f.due_date &&
                          isOverdue(f.due_date));
                      return isOverdueStatus && canViewFollowUp(f);
                    }).length
                  }
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by lead, assignee, message content, or follow-up ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="vc">Fund Raise</SelectItem>
                    <SelectItem value="sales">Business Offering</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {assigneeOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
                {(dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Follow-ups */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="all" className="text-sm">
            All ({allFollowUps.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-sm">
            Pending ({pendingFollowUps.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="text-sm">
            In Progress ({inProgressFollowUps.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-sm">
            Completed ({completedFollowUps.length})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="text-sm">
            Overdue ({overdueFollowUps.length})
          </TabsTrigger>
          <TabsTrigger value="my_tasks" className="text-sm">
            My Tasks ({myFollowUps.length})
          </TabsTrigger>
          <TabsTrigger value="assigned_by_me" className="text-sm">
            Assigned by Me ({assignedByMe.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {/* Follow-ups List */}
          <div className="grid gap-4">
            {loading ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="w-8 h-8 text-gray-400 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Loading follow-ups...
                  </h3>
                </CardContent>
              </Card>
            ) : currentTabFollowUps.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No follow-ups found
                  </h3>
                  <p className="text-gray-600">
                    {searchTerm ||
                    statusFilter !== "all" ||
                    assigneeFilter !== "all"
                      ? "Try adjusting your search criteria"
                      : "Follow-ups will appear here when team members mention specific tasks"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              currentTabFollowUps.map((followUp) => {
                const StatusIcon = statusIcons[followUp.status] || Clock;
                const isFollowUpOverdue =
                  followUp.status === "overdue" ||
                  (followUp.status !== "completed" &&
                    followUp.due_date &&
                    isOverdue(followUp.due_date));
                const isAssignedToMe =
                  followUp.assigned_user_name === user?.name;

                // Determine follow-up type with fallback logic
                const followUpType =
                  followUp.type ||
                  ((followUp as any).business_offering_id ||
                  (followUp as any).business_offering_solution ||
                  (followUp as any).business_offering_product
                    ? "sales"
                    : followUp.vc_id ||
                        followUp.vc_round_title ||
                        followUp.investor_name
                      ? "vc"
                      : "lead");

                return (
                  <Card
                    key={
                      followUp.id ??
                      `${followUp.type || ((followUp as any).business_offering_id || (followUp as any).business_offering_solution || (followUp as any).business_offering_product ? "sales" : followUp.vc_id || followUp.vc_round_title || followUp.investor_name ? "vc" : "lead")}-${followUp.lead_id ?? ""}-${(followUp as any).vc_id ?? ""}-${(followUp as any).business_offering_id ?? ""}-${followUp.step_id ?? followUp.message_id ?? ""}-${followUp.created_at}`
                    }
                    className={`hover:shadow-md transition-shadow border-l-4 ${
                      isAssignedToMe
                        ? isFollowUpOverdue
                          ? "border-l-red-500 bg-red-50"
                          : "border-l-blue-500 bg-blue-50"
                        : "border-l-gray-300"
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <Badge
                              className="text-lg font-bold cursor-pointer hover:bg-primary hover:text-white transition-colors"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `#${followUp.id}`,
                                );
                                // Show a brief success message
                              }}
                            >
                              #{followUp.id}
                            </Badge>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {followUpType === "vc" ? (
                                <>
                                  <Badge
                                    variant="secondary"
                                    className="mr-2 bg-purple-100 text-purple-700"
                                  >
                                    Fund Raise
                                  </Badge>
                                  {(() => {
                                    // For fund raise follow-ups, create a meaningful title
                                    const investorName =
                                      followUp.investor_name ||
                                      "Unknown Investor";
                                    const stage = (followUp as any)
                                      .fund_raise_stage
                                      ? (followUp as any).fund_raise_stage
                                          .split("_")
                                          .map(
                                            (word: string) =>
                                              word.charAt(0).toUpperCase() +
                                              word.slice(1),
                                          )
                                          .join(" ") + " Round"
                                      : followUp.vc_round_title || "Fund Raise";
                                    return `${stage} • ${investorName}`;
                                  })()}
                                </>
                              ) : followUpType === "sales" ? (
                                <>
                                  <Badge
                                    variant="secondary"
                                    className="mr-2 bg-green-100 text-green-700"
                                  >
                                    Business Offering
                                  </Badge>
                                  {(followUp as any)
                                    .business_offering_solution ||
                                    (followUp as any)
                                      .business_offering_product ||
                                    followUp.client_name ||
                                    "Business Offering"}
                                </>
                              ) : (
                                <>
                                  <Badge
                                    variant="secondary"
                                    className="mr-2 bg-blue-100 text-blue-700"
                                  >
                                    LEAD
                                  </Badge>
                                  {followUp.lead_client_name ||
                                    followUp.client_name ||
                                    "Unknown Lead"}
                                </>
                              )}{" "}
                              • {followUp.title || "Follow-up"}
                            </h3>
                            <Badge
                              className={
                                statusColors[followUp.status] ||
                                "bg-gray-100 text-gray-700"
                              }
                            >
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {(followUp.status || "unknown").replace("_", " ")}
                            </Badge>
                            {followUp.priority && (
                              <Badge
                                className={priorityColors[followUp.priority]}
                              >
                                {followUp.priority}
                              </Badge>
                            )}
                          </div>

                          <div className="bg-gray-50 p-3 rounded-lg mb-3 border-l-4 border-blue-200">
                            <p className="text-sm text-gray-700 italic">
                              "
                              {followUp.description ||
                                followUp.title ||
                                "No description available"}
                              "
                            </p>
                          </div>

                          <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center space-x-1">
                              <User className="w-4 h-4" />
                              <span>
                                Assigned to:{" "}
                                <strong>
                                  {(followUp as any).assigned_users_names ||
                                    followUp.assigned_user_name ||
                                    "Unassigned"}
                                </strong>
                              </span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <User className="w-4 h-4" />
                              <span>
                                By: {followUp.created_by_name || "Unknown"}
                              </span>
                            </span>
                            {followUp.due_date && (
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span
                                  className={
                                    isFollowUpOverdue
                                      ? "text-red-600 font-medium"
                                      : ""
                                  }
                                >
                                  Due:{" "}
                                  {formatToISTDateTime(followUp.due_date, {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </span>
                            )}
                          </div>

                          {followUp.notes && (
                            <div className="bg-yellow-50 p-2 rounded text-sm text-gray-700 mb-3">
                              <strong>Notes:</strong> {followUp.notes}
                            </div>
                          )}

                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>
                              Created: {formatToIST(followUp.created_at)}
                            </span>
                            {followUp.completed_at && (
                              <span>
                                Completed: {formatToIST(followUp.completed_at)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col space-y-2">
                          {followUpType === "lead" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleNavigateToMessage(followUp)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View Message
                            </Button>
                          ) : followUpType === "sales" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const businessOfferingId = (followUp as any)
                                  .business_offering_id;
                                if (businessOfferingId) {
                                  const stepId =
                                    (followUp as any)
                                      .business_offering_step_id ||
                                    (followUp as any).message_id ||
                                    (followUp as any).step_id;
                                  const params = new URLSearchParams();
                                  if (stepId)
                                    params.set("focusStepId", String(stepId));
                                  params.set(
                                    "focusFollowUpId",
                                    String(followUp.id),
                                  );
                                  navigate(
                                    `/business-offerings/${businessOfferingId}?${params.toString()}`,
                                    {
                                      state: {
                                        focusFollowUpId: followUp.id,
                                        focusStepId: stepId,
                                      },
                                    },
                                  );
                                }
                              }}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View Business Offering
                            </Button>
                          ) : (
                            (() => {
                              // Check if this is a fund raise follow-up (has message_id indicating fund_raise_step)
                              const isFundRaise =
                                followUp.message_id &&
                                (followUp as any).fund_raise_stage;
                              const fundRaiseId = (followUp as any)
                                .fund_raise_id;
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (isFundRaise && fundRaiseId) {
                                      const stepId =
                                        (followUp as any).message_id ||
                                        (followUp as any).step_id ||
                                        (followUp as any).vc_step_id;
                                      navigate(`/fundraise/${fundRaiseId}`, {
                                        state: {
                                          openStepId: stepId,
                                          focusFollowUpId: followUp.id,
                                        },
                                      });
                                    } else {
                                      navigate(`/vc/${followUp.vc_id}`);
                                    }
                                  }}
                                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  {isFundRaise
                                    ? "View Fund Raise"
                                    : "View VC Round"}
                                </Button>
                              );
                            })()
                          )}

                          <Select
                            value={followUp.status}
                            onValueChange={(value) =>
                              handleUpdateStatus(followUp.id, value)
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">
                                In Progress
                              </SelectItem>
                              <SelectItem value="completed">
                                Completed
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
