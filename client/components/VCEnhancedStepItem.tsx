import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  MessageCircle,
  Upload,
  Send,
  Trash2,
  GripVertical,
  Reply,
  Paperclip,
  X,
  Bold,
  Italic,
  Link,
  AlignLeft,
  List,
  Image,
  Eye,
  Edit,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  useCreateFollowUp,
  useUsers,
  useUpdateFollowUpStatus,
} from "@/hooks/useApi";
import { notifyFollowUpStatusChange } from "@/utils/followUpUtils";
import { apiClient } from "@/lib/api";
import { formatToISTDateTime } from "@/lib/dateUtils";

interface VCEnhancedStepItemProps {
  step: any;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onUpdateStatus: (stepId: number, status: string) => void;
  onDeleteStep: (stepId: number) => void;
  isDragOverlay?: boolean;
  stepApiBase?: "vc" | "fund-raises" | "business-offerings";
  focusStepId?: number;
  focusFollowUpId?: number;
}

interface ChatMessage {
  id: number;
  user_name: string;
  user_id?: number;
  message: string;
  is_rich_text: boolean;
  message_type: "text" | "file" | "system";
  created_at: string;
  attachments?: any[];
}

export function VCEnhancedStepItem({
  step,
  isExpanded,
  onToggleExpansion,
  onUpdateStatus,
  onDeleteStep,
  isDragOverlay = false,
  stepApiBase = "vc",
  focusStepId,
  focusFollowUpId,
}: VCEnhancedStepItemProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { data: users = [], isLoading: usersLoading } = useUsers();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Filter active users and format for dropdown
  const teamMembers = users
    .filter((user: any) => user.status === "active")
    .map((user: any) => ({
      id: user.id,
      name: `${user.first_name} ${user.last_name}`,
      role: user.role,
    }));

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<any>(null);
  const hasFocusedRef = useRef(false);

  // Load chats when expanded
  useEffect(() => {
    const loadChats = async () => {
      if (!isExpanded || !step?.id) return;
      try {
        setChatLoading(true);
        setChatError(null);
        const rows = await apiClient.request(
          `/${stepApiBase}/steps/${step.id}/chats`,
        );
        setChatMessages(Array.isArray(rows) ? rows : []);
      } catch (e: any) {
        setChatError(e);
      } finally {
        setChatLoading(false);
      }
    };
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, step?.id, stepApiBase]);

  // Sort messages by created_at in ascending order (latest last for bottom scroll)
  const sortedMessages = useMemo(() => {
    return [...chatMessages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [chatMessages]);

  // Auto-scroll to a targeted follow-up message or to bottom
  useEffect(() => {
    if (!messagesContainerRef.current || sortedMessages.length === 0) return;

    // If focus requested and this is the target step, try to scroll to the message containing #<followUpId>
    if (
      isExpanded &&
      focusFollowUpId &&
      focusStepId &&
      step?.id === focusStepId &&
      !hasFocusedRef.current
    ) {
      const target = messagesContainerRef.current.querySelector(
        `#focus-followup-${focusFollowUpId}`,
      ) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        // Temporary highlight effect
        target.classList.add("ring-2", "ring-yellow-400");
        setTimeout(
          () => target.classList.remove("ring-2", "ring-yellow-400"),
          2000,
        );
        hasFocusedRef.current = true;
        return;
      }
    }

    // Fallback: scroll to bottom
    messagesContainerRef.current.scrollTop =
      messagesContainerRef.current.scrollHeight;
  }, [sortedMessages, isExpanded, focusFollowUpId, focusStepId, step?.id]);

  const [newMessage, setNewMessage] = useState("");
  const [stagedAttachments, setStagedAttachments] = useState<any[]>([]);

  // Follow-up related states
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [followUpAssignees, setFollowUpAssignees] = useState<string[]>([]);
  const [followUpDueDate, setFollowUpDueDate] = useState(() => {
    // Default to 3 days from now with time
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const yyyy = defaultDate.getFullYear();
    const mm = pad(defaultDate.getMonth() + 1);
    const dd = pad(defaultDate.getDate());
    const hh = pad(defaultDate.getHours());
    const min = pad(defaultDate.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  });

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editMessageText, setEditMessageText] = useState("");

  // Delete confirmation modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<number | null>(null);

  const createFollowUpMutation = useCreateFollowUp();
  const updateFollowUpStatus = useUpdateFollowUpStatus();
  const [followUpStatuses, setFollowUpStatuses] = useState<
    Record<number, string>
  >({});

  // Load status for follow-up IDs referenced in system messages
  useEffect(() => {
    if (!isExpanded) return;
    const ids = new Set<number>();
    for (const m of sortedMessages) {
      if (m.message_type === "system") {
        const text = m.message || "";
        const matches = Array.from(text.matchAll(/#(\d+)/g));
        for (const mm of matches) {
          const idNum = parseInt(mm[1]);
          if (!isNaN(idNum)) ids.add(idNum);
        }
      }
    }
    ids.forEach(async (fid) => {
      if (followUpStatuses[fid]) return;
      try {
        const f = await apiClient.request(`/follow-ups/${fid}`);
        if (f && f.status) {
          setFollowUpStatuses((s) => ({ ...s, [fid]: f.status }));
        }
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, sortedMessages.length]);

  // Function to highlight mentions and make follow-up IDs clickable
  const processMessageContent = (messageText: string) => {
    if (!user) return messageText;

    let processedText = messageText;

    // Look for mentions of current user (case insensitive)
    const userNamePattern = new RegExp(`@${user.name}`, "gi");
    processedText = processedText.replace(
      userNamePattern,
      `<span class="bg-red-100 text-red-700 px-1 rounded font-medium">@${user.name}</span>`,
    );

    // Make follow-up IDs clickable (#13, #14, etc.)
    const followUpPattern = /#(\d+)/g;
    processedText = processedText.replace(
      followUpPattern,
      `<span class="follow-up-link bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium cursor-pointer hover:bg-blue-200"
        data-follow-up-id="$1"
        onclick="window.location.href='/follow-ups?id=$1'"
      >#$1</span>`,
    );

    return processedText;
  };

  // Don't render if step is invalid
  if (!step || !step.id) {
    return null;
  }

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    try {
      const result: any = await apiClient.uploadFiles(files);
      const uploaded = Array.isArray(result?.files) ? result.files : [];
      const newAttachments = uploaded.map((f: any) => ({
        file_name: f.originalName || f.filename,
        file_size: f.size,
        file_type: f.mimetype,
        file_path: f.path,
        filename: f.filename,
        download_url: `/api/files/download/${f.filename}`,
      }));
      setStagedAttachments((prev) => [...prev, ...newAttachments]);
    } catch (e) {
      console.error("File upload failed:", e);
      alert("File upload failed. Please try again.");
    } finally {
      event.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setStagedAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && stagedAttachments.length === 0) return;

    try {
      const payload = {
        user_id: parseInt(user?.id || "0"),
        user_name: user?.name || "Anonymous",
        message: newMessage.trim(),
        is_rich_text: true,
        message_type: "text" as const,
        attachments: stagedAttachments,
      };

      const saved = await apiClient.request(
        `/${stepApiBase}/steps/${step.id}/chats`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      setChatMessages((prev) => [...prev, saved]);
      setNewMessage("");
      setStagedAttachments([]);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Fallback to local state
      const fallback: ChatMessage = {
        id: Date.now(),
        user_id: parseInt(user?.id || "0"),
        user_name: user?.name || "Anonymous",
        message: newMessage.trim(),
        is_rich_text: true,
        message_type: "text",
        created_at: new Date().toISOString(),
        attachments: stagedAttachments,
      } as any;
      setChatMessages((prev) => [...prev, fallback]);
      setNewMessage("");
      setStagedAttachments([]);
    }
  };

  const handleFollowUp = (messageId: number) => {
    setCreateFollowUp(true);
  };

  const handleCreateFollowUp = async () => {
    if (
      !followUpNotes.trim() ||
      followUpAssignees.length === 0 ||
      !followUpDueDate
    ) {
      alert("Please fill in all follow-up fields");
      return;
    }

    console.log("🚀 Starting follow-up creation process...", {
      step: { id: step.id, name: step.name, vc_id: step.vc_id },
      stepApiBase,
      user: { id: user?.id, name: user?.name },
    });

    try {
      // Create the follow-up task with proper context based on stepApiBase
      console.log("📝 Creating follow-up with mutation...");

      const baseFollowUp: any = {
        description: followUpNotes,
        due_date: new Date(followUpDueDate).toISOString(),
        priority: "medium",
        created_by: parseInt(user?.id || "1"),
      };

      if (stepApiBase === "business-offerings") {
        // Business offering follow-up
        baseFollowUp.title = `Sales Follow-up: ${step.name}`;
        baseFollowUp.follow_up_type = "sales";
        baseFollowUp.business_offering_id = step.business_offering_id;
        baseFollowUp.business_offering_step_id = step.id;
      } else if (stepApiBase === "fund-raises") {
        // Fund raise follow-up: pass fund_raise_step id as vc_step_id so server resolves vc_id and stores step ref in message_id
        baseFollowUp.title = `Fund Raise Follow-up: ${step.name}`;
        baseFollowUp.vc_step_id = step.id;
      } else {
        // VC follow-up
        baseFollowUp.title = `VC Follow-up: ${step.name}`;
        baseFollowUp.vc_id = step.vc_id;
        baseFollowUp.vc_step_id = step.id;
      }

      // Parse unique assignee IDs from labels like "Name (#123)"
      const selectedIds: number[] = followUpAssignees
        .map((label) => {
          const match = label.match(/#(\d+)/);
          return match ? parseInt(match[1]) : null;
        })
        .filter((v): v is number => typeof v === "number" && !isNaN(v));
      const uniqueIds = Array.from(new Set(selectedIds));

      // Create a single follow-up (team task) with a primary assignee for ownership
      const primaryAssigneeId = uniqueIds.length > 0 ? uniqueIds[0] : null;
      const payload = {
        ...baseFollowUp,
        assigned_to: primaryAssigneeId,
        assigned_to_list: uniqueIds,
      };
      const created = await createFollowUpMutation.mutateAsync(payload);
      const createdId: number | null = (created as any)?.id ?? null;

      // Send notifications to all selected users
      try {
        const actionUrl =
          stepApiBase === "business-offerings"
            ? `/business-offerings/${step.business_offering_id}`
            : stepApiBase === "fund-raises"
              ? `/fundraise/${step.fund_raise_id || step.fund_raise || step.vc_id}`
              : `/vc/${step.vc_id}`;
        for (const uid of uniqueIds) {
          await apiClient.request(`/notifications-production`, {
            method: "POST",
            body: JSON.stringify({
              type: "follow_up",
              title: "New follow-up created",
              description: `${followUpNotes} | Due: ${formatToISTDateTime(new Date(followUpDueDate).toISOString())}`,
              user_id: uid,
              entity_type: "follow_up",
              entity_id: createdId,
              action_url: actionUrl,
              priority: "medium",
            }),
          });
        }
      } catch (e) {
        console.warn("Failed to send some notifications:", e);
      }

      const assigneeNames = uniqueIds
        .map((id) => teamMembers.find((m) => m.id === id)?.name)
        .filter(Boolean) as string[];

      const details = [
        assigneeNames.length ? `Assignees: ${assigneeNames.join(", ")}` : null,
        `Due: ${formatToISTDateTime(new Date(followUpDueDate).toISOString())}`,
      ]
        .filter(Boolean)
        .join(" | ");

      const idSegment = createdId ? `#${createdId} — ` : "";

      const systemMessageText = `📋 Follow-up created: ${idSegment}"${followUpNotes}" ${details}`;
      const chatApiUrl = `/${stepApiBase}/steps/${step.id}/chats`;

      console.log("💬 Preparing to send system message to team chat:", {
        url: chatApiUrl,
        message: systemMessageText,
        stepApiBase,
        stepId: step.id,
      });

      try {
        // Use the correct steps chat API endpoint
        const systemMessageResponse = await apiClient.request(chatApiUrl, {
          method: "POST",
          body: JSON.stringify({
            user_id: parseInt(user?.id || "0"),
            user_name: "System",
            message: systemMessageText,
            message_type: "system",
            is_rich_text: false,
            attachments: [],
          }),
        });

        console.log(
          "✅ System message sent successfully:",
          systemMessageResponse,
        );

        // Verify the response is valid (not an error response)
        if (
          systemMessageResponse &&
          typeof systemMessageResponse === "object" &&
          systemMessageResponse.id
        ) {
          // Add to local state if API call successful and response is valid
          setChatMessages((prev) => [...prev, systemMessageResponse]);
        } else {
          console.warn(
            "⚠️ System message response is invalid:",
            systemMessageResponse,
          );
          throw new Error("Invalid system message response");
        }
      } catch (messageError: any) {
        console.error(
          "❌ Failed to save follow-up creation message to team chat:",
          messageError,
        );
        console.error("❌ Error details:", {
          url: chatApiUrl,
          stepApiBase,
          stepId: step.id,
          error: messageError,
          status: messageError?.status,
          statusText: messageError?.statusText,
        });

        // Check if it's a database availability issue
        if (
          messageError?.status === 503 ||
          messageError?.message?.includes("Database unavailable")
        ) {
          alert(
            "Follow-up created successfully, but the database is currently unavailable. The team chat notification could not be sent. Please refresh the page and check the chat manually.",
          );
        } else {
          alert(
            "Follow-up created successfully, but failed to notify team chat. Please check the chat manually.",
          );
        }

        // Fallback: add to local state only
        const systemMessage = {
          id: Date.now(),
          message: systemMessageText,
          message_type: "system" as const,
          user_id: parseInt(user?.id || "0"),
          user_name: "System",
          is_rich_text: false,
          created_at: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, systemMessage]);
        console.log(
          "📝 Added fallback system message to local state:",
          systemMessage,
        );
      }

      setCreateFollowUp(false);
      setFollowUpNotes("");
      setFollowUpAssignees([]);
      setFollowUpDueDate("");
    } catch (error) {
      console.error("❌ Failed to create follow-up:", error);
      alert("Failed to create follow-up. Please try again.");
    }
  };

  const handleEditMessage = (
    messageId: number,
    messageText: string,
    isRichText: boolean,
  ) => {
    setEditingMessageId(messageId);
    setEditMessageText(messageText);
  };

  const handleSaveEdit = async (
    messageId: number,
    originalIsRichText: boolean,
  ) => {
    try {
      const saved = await apiClient.request(
        `/${stepApiBase}/chats/${messageId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: editMessageText.trim(),
            is_rich_text: true,
          }),
        },
      );

      setChatMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, ...saved } : msg)),
      );
      setEditingMessageId(null);
      setEditMessageText("");
    } catch (error) {
      console.error("Failed to edit message:", error);
      // Fallback: update locally
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                message: editMessageText.trim(),
                is_rich_text: true,
              }
            : msg,
        ),
      );
      setEditingMessageId(null);
      setEditMessageText("");
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditMessageText("");
  };

  const handleDeleteMessage = (messageId: number) => {
    setMessageToDelete(messageId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;

    try {
      await apiClient.request(`/${stepApiBase}/chats/${messageToDelete}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Failed to delete on server, removing locally:", error);
    } finally {
      setChatMessages((prev) =>
        prev.filter((msg) => msg.id !== messageToDelete),
      );
      setDeleteConfirmOpen(false);
      setMessageToDelete(null);
    }
  };

  const cancelDeleteMessage = () => {
    setDeleteConfirmOpen(false);
    setMessageToDelete(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg bg-white border-l-4 ${
        step.status === "completed"
          ? "border-green-600"
          : step.status === "in_progress"
            ? "border-blue-600"
            : "border-gray-300"
      } ${isDragOverlay ? "shadow-2xl" : ""}`}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggleExpansion}>
        <div className="flex items-center space-x-4 p-4">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            title="Drag to reorder"
          >
            <GripVertical className="w-5 h-5" />
          </div>

          {/* Status Icon */}
          <div className="flex-shrink-0">
            {step.status === "completed" ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : step.status === "in_progress" ? (
              <Clock className="w-6 h-6 text-blue-600" />
            ) : (
              <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
            )}
          </div>

          <CollapsibleTrigger className="flex-1 flex items-center justify-between text-left">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">{step.name}</span>
                {/* Status badge for quick visual cue */}
                {step.status && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      step.status === "completed"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : step.status === "in_progress"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                    }`}
                  >
                    {step.status === "in_progress"
                      ? "In Progress"
                      : step.status.charAt(0).toUpperCase() +
                        step.status.slice(1).replace("_", " ")}
                  </Badge>
                )}
                <div className="flex items-center space-x-2">
                  {typeof step.probability_percent !== "undefined" &&
                    step.probability_percent !== null && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                      >
                        {parseFloat(step.probability_percent) || 0}%
                      </Badge>
                    )}
                  {step.estimated_days && (
                    <Badge variant="outline" className="text-xs">
                      {step.estimated_days}d ETA
                    </Badge>
                  )}
                  {stepApiBase === "vc" && step.priority && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        step.priority === "high"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : step.priority === "medium"
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                            : "bg-green-50 text-green-700 border-green-200"
                      }`}
                    >
                      {step.priority} priority
                    </Badge>
                  )}
                  {(() => {
                    const count =
                      !chatLoading && sortedMessages.length > 0
                        ? sortedMessages.length
                        : step.message_count || 0;
                    return count > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {count} message{count !== 1 ? "s" : ""}
                      </Badge>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {step.description}
              </div>
              <div className="text-sm text-gray-600">
                {step.status === "completed" &&
                  step.completed_date &&
                  `Completed on ${new Date(step.completed_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`}
                {step.status !== "completed" &&
                  step.due_date &&
                  `Due: ${new Date(step.due_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`}
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>

          <div className="flex items-center space-x-2">
            <Select
              value={step.status}
              onValueChange={(value) => onUpdateStatus(step.id, value)}
            >
              <SelectTrigger
                className={`w-32 ${
                  step.status === "completed"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : step.status === "in_progress"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteStep(step.id)}
              className="text-red-600 hover:text-red-700"
              title="Delete this step"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t bg-gray-50">
            <div className="p-4">
              {/* Full Chat Functionality for All Steps */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-4 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Team Chat
                      </CardTitle>
                      <CardDescription className="text-gray-600">
                        Real-time collaboration for this VC step
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-1">
                      {sortedMessages.length > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                          {sortedMessages.length} messages
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Chat Messages */}
                  <div
                    ref={messagesContainerRef}
                    className="space-y-3 max-h-96 overflow-y-auto"
                  >
                    {chatLoading && (
                      <div className="text-center py-4 text-gray-500">
                        Loading messages...
                      </div>
                    )}
                    {chatError && (
                      <div className="text-center py-4 text-red-500">
                        Error loading messages: {chatError.message}
                      </div>
                    )}
                    {!chatLoading &&
                      !chatError &&
                      sortedMessages.map((message, index) => {
                        const isStatusChange =
                          message.message_type === "system" &&
                          (() => {
                            const txt = message.message || "";
                            return (
                              /Step status changed/i.test(txt) ||
                              /Follow-up task (completed|started)/i.test(txt) ||
                              /Follow-up task status changed/i.test(txt)
                            );
                          })();
                        const isFocusAnchor =
                          !!focusFollowUpId &&
                          !!focusStepId &&
                          step?.id === focusStepId &&
                          typeof message.message === "string" &&
                          message.message.includes(`#${focusFollowUpId}`);
                        return (
                          <div
                            key={`msg-${message.id}-${index}`}
                            id={
                              isFocusAnchor
                                ? `focus-followup-${focusFollowUpId}`
                                : undefined
                            }
                            className={`flex space-x-3 ${
                              isStatusChange
                                ? "px-2 py-1"
                                : "p-3 rounded border " +
                                  (message.message_type === "system"
                                    ? "bg-blue-50 border-blue-200"
                                    : message.user_id ===
                                        parseInt(user?.id || "0")
                                      ? "bg-green-50 border-green-200"
                                      : "bg-white")
                            }`}
                          >
                            {isStatusChange ? null : (
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                                  message.message_type === "system"
                                    ? "bg-orange-500"
                                    : "bg-blue-500"
                                }`}
                              >
                                {message.message_type === "system"
                                  ? "📋"
                                  : message.user_name.charAt(0)}
                              </div>
                            )}
                            <div className="flex-1">
                              {isStatusChange ? (
                                <span className="text-xs text-gray-600">
                                  {`📝 ${(message.message || "").trimStart().replace(/^([📝📋]\s*)+/, "")} ${formatToISTDateTime(message.created_at)}`}
                                </span>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-900">
                                      {message.user_id ===
                                      parseInt(user?.id || "0")
                                        ? "Me"
                                        : message.user_name}
                                    </span>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs text-gray-500">
                                        {formatToISTDateTime(
                                          message.created_at,
                                        )}
                                      </span>
                                      {message.message_type === "system" &&
                                        (() => {
                                          const matches = Array.from(
                                            (message.message || "").matchAll(
                                              /#(\d+)/g,
                                            ),
                                          );
                                          if (matches.length === 0) return null;
                                          return (
                                            <div className="flex items-center flex-wrap gap-2">
                                              {matches.map((mm, idx) => {
                                                const fid = parseInt(mm[1]);
                                                const current =
                                                  followUpStatuses[fid] ||
                                                  "pending";
                                                return (
                                                  <div
                                                    key={`status-${fid}-${idx}`}
                                                    className="flex items-center space-x-1"
                                                  >
                                                    <Badge
                                                      variant="outline"
                                                      className="text-[10px]"
                                                    >
                                                      #{fid}
                                                    </Badge>
                                                    <Select
                                                      value={current}
                                                      onValueChange={async (
                                                        val,
                                                      ) => {
                                                        setFollowUpStatuses(
                                                          (s) => ({
                                                            ...s,
                                                            [fid]: val,
                                                          }),
                                                        );
                                                        const isFundRaises =
                                                          (stepApiBase as any) ===
                                                          "fund-raises";
                                                        const isBusinessOfferings =
                                                          (stepApiBase as any) ===
                                                          "business-offerings";

                                                        if (
                                                          isFundRaises ||
                                                          isBusinessOfferings
                                                        ) {
                                                          try {
                                                            await updateFollowUpStatus.mutateAsync(
                                                              {
                                                                followUpId: fid,
                                                                statusData: {
                                                                  status: val,
                                                                  completed_at:
                                                                    val ===
                                                                    "completed"
                                                                      ? new Date().toISOString()
                                                                      : null,
                                                                },
                                                              },
                                                            );

                                                            const statusDisplayMap: Record<
                                                              string,
                                                              string
                                                            > = {
                                                              pending:
                                                                "Pending",
                                                              in_progress:
                                                                "In Progress",
                                                              completed:
                                                                "Completed",
                                                              overdue:
                                                                "Overdue",
                                                            };
                                                            const oldDisplay =
                                                              statusDisplayMap[
                                                                current
                                                              ] || current;
                                                            const newDisplay =
                                                              statusDisplayMap[
                                                                val
                                                              ] || val;
                                                            const sysMsg = `Step status changed from "${oldDisplay}" to "${newDisplay}" by ${user?.name || "User"}`;

                                                            const optimistic = {
                                                              id: Date.now(),
                                                              user_id: parseInt(
                                                                user?.id || "0",
                                                              ),
                                                              user_name:
                                                                "System",
                                                              message: sysMsg,
                                                              message_type:
                                                                "system" as const,
                                                              is_rich_text:
                                                                false,
                                                              created_at:
                                                                new Date().toISOString(),
                                                            } as any;
                                                            setChatMessages(
                                                              (prev) => [
                                                                ...prev,
                                                                optimistic,
                                                              ],
                                                            );

                                                            const created =
                                                              await apiClient.request(
                                                                `/${stepApiBase}/steps/${step.id}/chats`,
                                                                {
                                                                  method:
                                                                    "POST",
                                                                  body: JSON.stringify(
                                                                    {
                                                                      user_id:
                                                                        parseInt(
                                                                          user?.id ||
                                                                            "0",
                                                                        ),
                                                                      user_name:
                                                                        "System",
                                                                      message:
                                                                        sysMsg,
                                                                      message_type:
                                                                        "system",
                                                                      is_rich_text:
                                                                        false,
                                                                      attachments:
                                                                        [],
                                                                    },
                                                                  ),
                                                                },
                                                              );
                                                            if (
                                                              created &&
                                                              (created as any)
                                                                .id
                                                            ) {
                                                              setChatMessages(
                                                                (prev) =>
                                                                  prev.map(
                                                                    (m) =>
                                                                      m.id ===
                                                                      optimistic.id
                                                                        ? (created as any)
                                                                        : m,
                                                                  ),
                                                              );
                                                            }
                                                          } catch (e) {}
                                                          return;
                                                        }

                                                        const statusDisplayMap: Record<
                                                          string,
                                                          string
                                                        > = {
                                                          pending: "Pending",
                                                          in_progress:
                                                            "In Progress",
                                                          completed:
                                                            "Completed",
                                                          overdue: "Overdue",
                                                        };
                                                        const oldDisplay =
                                                          statusDisplayMap[
                                                            current
                                                          ] || current;
                                                        const newDisplay =
                                                          statusDisplayMap[
                                                            val
                                                          ] || val;
                                                        const sysMsg = `Step status changed from "${oldDisplay}" to "${newDisplay}" by ${user?.name || "User"}`;
                                                        const optimistic = {
                                                          id: Date.now(),
                                                          user_id: parseInt(
                                                            user?.id || "0",
                                                          ),
                                                          user_name: "System",
                                                          message: sysMsg,
                                                          message_type:
                                                            "system" as const,
                                                          is_rich_text: false,
                                                          created_at:
                                                            new Date().toISOString(),
                                                        } as any;
                                                        setChatMessages(
                                                          (prev) => [
                                                            ...prev,
                                                            optimistic,
                                                          ],
                                                        );
                                                        try {
                                                          await updateFollowUpStatus.mutateAsync(
                                                            {
                                                              followUpId: fid,
                                                              statusData: {
                                                                status: val,
                                                                completed_at:
                                                                  val ===
                                                                  "completed"
                                                                    ? new Date().toISOString()
                                                                    : null,
                                                              },
                                                            },
                                                          );
                                                          const created =
                                                            await apiClient.request(
                                                              `/${stepApiBase}/steps/${step.id}/chats`,
                                                              {
                                                                method: "POST",
                                                                body: JSON.stringify(
                                                                  {
                                                                    user_id:
                                                                      parseInt(
                                                                        user?.id ||
                                                                          "0",
                                                                      ),
                                                                    user_name:
                                                                      "System",
                                                                    message:
                                                                      sysMsg,
                                                                    message_type:
                                                                      "system",
                                                                    is_rich_text:
                                                                      false,
                                                                    attachments:
                                                                      [],
                                                                  },
                                                                ),
                                                              },
                                                            );
                                                          if (
                                                            created &&
                                                            (created as any).id
                                                          ) {
                                                            setChatMessages(
                                                              (prev) =>
                                                                prev.map((m) =>
                                                                  m.id ===
                                                                  optimistic.id
                                                                    ? (created as any)
                                                                    : m,
                                                                ),
                                                            );
                                                          }
                                                        } catch (e) {
                                                          // keep optimistic message on error
                                                        }
                                                      }}
                                                    >
                                                      <SelectTrigger className="h-7 w-36 text-xs">
                                                        <SelectValue placeholder="Update status" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        <SelectItem value="pending">
                                                          Pending
                                                        </SelectItem>
                                                        <SelectItem value="in_progress">
                                                          In Progress
                                                        </SelectItem>
                                                        <SelectItem value="completed">
                                                          Completed
                                                        </SelectItem>
                                                      </SelectContent>
                                                    </Select>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          );
                                        })()}
                                      {message.message_type !== "system" && (
                                        <>
                                          {message.user_id ===
                                            parseInt(user?.id || "0") && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                  handleEditMessage(
                                                    message.id,
                                                    message.message,
                                                    message.is_rich_text,
                                                  )
                                                }
                                                className="text-gray-600 hover:text-gray-700"
                                              >
                                                <Edit className="w-3 h-3" />
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                  handleDeleteMessage(
                                                    message.id,
                                                  )
                                                }
                                                className="text-red-600 hover:text-red-700"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-700">
                                    {editingMessageId === message.id ? (
                                      <div className="space-y-2">
                                        <RichTextEditor
                                          value={editMessageText}
                                          onChange={setEditMessageText}
                                          placeholder="Edit your message with rich formatting..."
                                          className="min-h-[80px] border-gray-200"
                                        />
                                        <div className="flex space-x-2">
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              handleSaveEdit(
                                                message.id,
                                                message.is_rich_text,
                                              )
                                            }
                                            disabled={!editMessageText.trim()}
                                          >
                                            Save
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleCancelEdit}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div
                                        dangerouslySetInnerHTML={{
                                          __html: processMessageContent(
                                            message.message,
                                          ),
                                        }}
                                      />
                                    )}
                                    {message.attachments &&
                                      message.attachments.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {message.attachments.map(
                                            (attachment, idx) => {
                                              const fname =
                                                attachment.filename ||
                                                attachment.file_name ||
                                                "file";
                                              const directPath =
                                                attachment.file_path ||
                                                attachment.path ||
                                                "";
                                              const downloadUrl =
                                                attachment.download_url ||
                                                (attachment.filename
                                                  ? `/api/files/download/${attachment.filename}`
                                                  : directPath);
                                              return (
                                                <div
                                                  key={idx}
                                                  className="flex items-center space-x-2 text-xs bg-gray-100 px-2 py-1 rounded"
                                                >
                                                  <FileText className="w-3 h-3" />
                                                  <a
                                                    href={downloadUrl || "#"}
                                                    onClick={async (e) => {
                                                      e.stopPropagation();
                                                      if (!downloadUrl) return;
                                                      try {
                                                        if (
                                                          attachment.filename
                                                        ) {
                                                          const response =
                                                            await fetch(
                                                              `/api/files/download/${attachment.filename}`,
                                                            );
                                                          if (!response.ok)
                                                            throw new Error(
                                                              "Download failed",
                                                            );
                                                          const blob =
                                                            await response.blob();
                                                          const url =
                                                            window.URL.createObjectURL(
                                                              blob,
                                                            );
                                                          const link =
                                                            document.createElement(
                                                              "a",
                                                            );
                                                          link.href = url;
                                                          link.download =
                                                            attachment.file_name ||
                                                            fname;
                                                          document.body.appendChild(
                                                            link,
                                                          );
                                                          link.click();
                                                          document.body.removeChild(
                                                            link,
                                                          );
                                                          window.URL.revokeObjectURL(
                                                            url,
                                                          );
                                                        } else {
                                                          window.open(
                                                            downloadUrl,
                                                            "_blank",
                                                          );
                                                        }
                                                      } catch (err) {
                                                        console.error(
                                                          "Download failed:",
                                                          err,
                                                        );
                                                        alert(
                                                          "Download failed. File may not be available.",
                                                        );
                                                      }
                                                    }}
                                                    download={
                                                      !!attachment.filename
                                                    }
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    {fname}
                                                  </a>
                                                  {attachment.file_size ? (
                                                    <span className="text-gray-500">
                                                      (
                                                      {(
                                                        attachment.file_size /
                                                        1024
                                                      ).toFixed(1)}{" "}
                                                      KB)
                                                    </span>
                                                  ) : null}
                                                </div>
                                              );
                                            },
                                          )}
                                        </div>
                                      )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Staged Attachments Display */}
                  {stagedAttachments.length > 0 && (
                    <div className="border-t pt-3">
                      <Label className="text-sm font-medium mb-2 block">
                        Attachments ({stagedAttachments.length})
                      </Label>
                      <div className="space-y-2">
                        {stagedAttachments.map((attachment, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-100 rounded text-sm"
                          >
                            <div className="flex items-center space-x-2">
                              <FileText className="w-4 h-4" />
                              <span>{attachment.file_name}</span>
                              <span className="text-gray-500">
                                ({(attachment.file_size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeAttachment(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Input Section */}
                  <div className="border-t pt-4">
                    <div className="space-y-3">
                      <RichTextEditor
                        value={newMessage}
                        onChange={setNewMessage}
                        placeholder="Type your message with rich formatting..."
                        className="min-h-[100px] border-gray-300"
                      />

                      {/* Create Follow-up Checkbox */}
                      <div className="flex items-center space-x-2">
                        <input
                          id="create_follow_up_checkbox_"
                          type="checkbox"
                          checked={createFollowUp}
                          onChange={(e) => setCreateFollowUp(e.target.checked)}
                        />
                        <Label
                          htmlFor="create_follow_up_checkbox_"
                          className="text-sm"
                        >
                          Create follow-up
                        </Label>
                      </div>

                      {/* Follow-up Creation Section (below editor) */}
                      {createFollowUp && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <Label className="text-sm font-medium mb-3 block">
                            Create Follow-up Task
                          </Label>
                          <div className="space-y-3">
                            <Textarea
                              placeholder="Follow-up description..."
                              value={followUpNotes}
                              onChange={(e) => setFollowUpNotes(e.target.value)}
                              className="min-h-[60px]"
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <MultiSelect
                                options={teamMembers.map(
                                  (m) => `${m.name} (#${m.id})`,
                                )}
                                value={followUpAssignees}
                                onChange={setFollowUpAssignees}
                                placeholder="Assign to users..."
                              />
                              <Input
                                type="datetime-local"
                                value={followUpDueDate}
                                onChange={(e) =>
                                  setFollowUpDueDate(e.target.value)
                                }
                              />
                            </div>
                            <div className="flex space-x-2">
                              <Button size="sm" onClick={handleCreateFollowUp}>
                                Create Follow-up
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCreateFollowUp(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            multiple
                            className="hidden"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Paperclip className="w-4 h-4 mr-1" />
                            Attach Files
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSendMessage}
                          disabled={
                            !newMessage.trim() && stagedAttachments.length === 0
                          }
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Send
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteMessage}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMessage}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
