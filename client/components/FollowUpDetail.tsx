import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Clock,
  Edit,
  Trash2,
  Mic,
  StopCircle,
  X,
  Save,
  AlertCircle,
  Send,
  Settings,
  MoreVertical,
  Play,
  Pause,
  Volume2,
  Wand2,
  ChevronDown,
  Bell,
  Users,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

const STATUSES = ["Pending", "Completed", "Cancelled", "Delayed", "Overdue"];

interface FollowUp {
  id: number;
  lead_id: number;
  follow_up_date: string;
  status: "Pending" | "Completed" | "Cancelled";
  notes: string;
  source?: string;
  assigned_to_user_id?: number;
  image_url?: string;
  image_filename?: string;
  created_at?: string;
  updated_at?: string;
}

interface ChatMessage {
  id: number;
  type: "text" | "audio" | "system"; // text message, audio message, or system event
  content: string; // text content or audio URL
  author: string; // username
  timestamp: Date;
  audioFilename?: string;
  audioUrl?: string;
  replyTo?: number; // ID of message this is replying to
  isEdited?: boolean;
  systemEventType?: "status_change" | "assignment_change" | "date_change" | "note_change"; // Type of system event
}

interface FollowUpDetailProps {
  followUp: FollowUp;
  leadId: number;
  onUpdate?: () => void;
  onDelete?: () => void;
}

async function updateFollowUp(followUpId: number, data: Record<string, any>) {
  const res = await fetch(`/api/lead-followups/${followUpId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update follow-up");
  return res.json();
}

async function deleteFollowUp(followUpId: number) {
  const res = await fetch(`/api/lead-followups/${followUpId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete follow-up");
  return res.json();
}

async function fetchChatMessages(followUpId: number) {
  const res = await fetch(`/api/lead-followups/${followUpId}/chat-messages`);
  if (!res.ok) throw new Error("Failed to fetch chat messages");
  return res.json();
}

async function saveChatMessage(
  followUpId: number,
  message: Omit<ChatMessage, "id" | "timestamp">
) {
  const res = await fetch(`/api/lead-followups/${followUpId}/chat-messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message_type: message.type,
      content: message.content,
      author: message.author,
      audio_filename: message.audioFilename,
      audio_url: message.audioUrl,
    }),
  });
  if (!res.ok) throw new Error("Failed to save chat message");
  return res.json();
}

async function fetchUserName(userId: number) {
  try {
    // Try multiple endpoints to fetch user info
    let res = await fetch(`/api/users/${userId}`);
    if (!res.ok) {
      // Fallback: try alternate endpoint
      res = await fetch(`/api/lead-followups/user/${userId}`);
    }
    if (!res.ok) {
      // If both endpoints fail, return generic "Assigned" text
      console.log(`User ${userId} could not be fetched, returning generic text`);
      return `User #${userId}`;
    }
    const user = await res.json();
    return user.name || user.email || user.username || `User #${userId}`;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    // Return generic text on error instead of null
    return `User #${userId}`;
  }
}

export function FollowUpDetail({
  followUp,
  leadId,
  onUpdate,
  onDelete,
}: FollowUpDetailProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isListening, setIsListening] = useState(false);

  // Audio conversion dialog
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionText, setConversionText] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  // Message editing, replying, and deleting
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [replyingToMessageId, setReplyingToMessageId] = useState<number | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);

  // SLA and Status
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [slaTimeRemaining, setSlaTimeRemaining] = useState<string>("");
  const [showSLAAlert, setShowSLAAlert] = useState(false);
  const [changedStatus, setChangedStatus] = useState(followUp.status);
  const [assignedUserName, setAssignedUserName] = useState<string | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoOverdueTriggeredRef = useRef(false);

  // Edit state
  const [editData, setEditData] = useState({
    status: followUp.status,
    notes: followUp.notes,
    follow_up_date: followUp.follow_up_date.split("T")[0],
    follow_up_time: followUp.follow_up_date.split("T")[1]?.slice(0, 5) || "",
    title: (followUp as any).title || "",
    source: (followUp as any).source || "",
    assigned_users: (followUp as any).assigned_users || [],
    delayed_until: (followUp as any).delayed_until ? new Date(followUp.delayed_until).toISOString().split("T")[0] : "",
    delayed_until_time: (followUp as any).delayed_until ? new Date(followUp.delayed_until).toTimeString().slice(0, 5) : "",
  });

  // Fetch users for edit form - CRITICAL: this is needed for both edit form and accordion display
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      console.log("[Users] Fetching users list...");
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      console.log("[Users] Loaded users:", data.length || data.length || 0);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60_000,
  });

  const users = usersData ? (Array.isArray(usersData) ? usersData : []) : [];
  const [editUsersSearch, setEditUsersSearch] = useState("");
  const [openEditUsersPopover, setOpenEditUsersPopover] = useState(false);

  // Fetch chat messages from database
  const { data: chatData, refetch: refetchChat } = useQuery({
    queryKey: ["chat-messages", followUp.id],
    queryFn: () => fetchChatMessages(followUp.id),
    staleTime: 30 * 1000,
  });

  // Load messages from database on component mount
  useEffect(() => {
    if (chatData?.messages) {
      const loadedMessages: ChatMessage[] = chatData.messages.map((msg: any) => ({
        id: msg.id,
        type: msg.message_type as "text" | "audio" | "system",
        content: msg.content,
        author: msg.author,
        timestamp: new Date(msg.created_at),
        audioFilename: msg.audio_filename,
        audioUrl: msg.audio_url,
      }));
      setChatMessages(loadedMessages);
    }
  }, [chatData]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Recording timer
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: () => {
      const delayedUntil = editData.status === "Delayed" && editData.delayed_until
        ? `${editData.delayed_until}T${editData.delayed_until_time || "00:00"}`
        : null;

      return updateFollowUp(followUp.id, {
        status: editData.status,
        notes: editData.notes,
        follow_up_date: `${editData.follow_up_date}T${editData.follow_up_time || "00:00"}`,
        title: editData.title,
        source: editData.source,
        assigned_users: editData.assigned_users,
        delayed_until: delayedUntil,
      });
    },
    onSuccess: () => {
      autoOverdueTriggeredRef.current = false;
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Follow-up updated successfully" });
      setIsEditing(false);
      onUpdate?.();
    },
  });

  const autoOverdueMutation = useMutation({
    mutationFn: () => updateFollowUp(followUp.id, { status: "Overdue" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      setChangedStatus("Overdue");
      setShowSLAAlert(true);
      autoOverdueTriggeredRef.current = true;
      onUpdate?.();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteFollowUp(followUp.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      qc.invalidateQueries({ queryKey: ["lead-followup-summary"] });
      qc.invalidateQueries({ queryKey: ["lead-dashboard-stats"] });
      toast({ title: "Follow-up deleted successfully" });
      onDelete?.();
    },
  });

  // Start audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const audioFilename = `audio-${Date.now()}.webm`;

        // Upload audio file to server
        const formData = new FormData();
        formData.append("audio", audioBlob, audioFilename);

        try {
          console.log("[Audio Recording] Uploading audio file...");
          const uploadResponse = await fetch("/api/lead-followups/upload-audio", {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error("Failed to upload audio file");
          }

          const uploadResult = await uploadResponse.json();
          const audioUrl = uploadResult.audioUrl || `/uploads/audio/${audioFilename}`;

          console.log("[Audio Recording] Audio uploaded successfully:", audioUrl);

          // Add audio message to chat with persistent URL
          const newMessage: ChatMessage = {
            id: Date.now(),
            type: "audio",
            content: audioUrl,
            author: "You",
            timestamp: new Date(),
            audioFilename: audioFilename,
            audioUrl: audioUrl,
          };

          setChatMessages((prev) => [...prev, newMessage]);

          // Save to database with persistent URL
          await saveChatMessage(followUp.id, {
            type: "audio",
            content: audioUrl,
            author: "You",
            audioFilename: audioFilename,
            audioUrl: audioUrl,
          });

          refetchChat();
          toast({ title: "Audio recorded and saved to chat" });
        } catch (error) {
          console.error("Failed to save audio message:", error);
          toast({
            title: "Warning",
            description: "Audio recorded but failed to save to database",
            variant: "default",
          });
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Convert audio to text using backend endpoint
  const convertAudioToText = async (audioUrl: string) => {
    setIsConverting(true);
    setConversionText(""); // Clear previous text
    try {
      console.log("[Audio Conversion] Starting conversion for:", audioUrl);
      toast({ title: "Processing audio...", description: "Converting audio to text in background" });

      // Fetch the audio blob from the URL
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch audio file");
      }

      const audioBlob = await response.blob();
      console.log("[Audio Conversion] Audio blob size:", audioBlob.size);

      // Create FormData and send to backend
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      console.log("[Audio Conversion] Sending to backend...");
      const transcriptResponse = await fetch("/api/audio-transcription/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcriptResponse.ok) {
        const errorData = await transcriptResponse.json();
        console.error("[Audio Conversion] Backend error:", errorData);
        throw new Error(errorData.error || "Transcription failed");
      }

      const result = await transcriptResponse.json();
      console.log("[Audio Conversion] Backend response:", result);
      console.log("[Audio Conversion] Response text:", result.text);
      console.log("[Audio Conversion] Response success:", result.success);

      if (result.success && result.text) {
        console.log("[Audio Conversion] Text to be set (length:", result.text.length, "):", result.text.substring(0, 100));
        setConversionText(result.text);
        console.log("[Audio Conversion] Opening dialog...");
        setShowConversionDialog(true);
        toast({ title: "Audio converted successfully" });
      } else {
        console.error("[Audio Conversion] Invalid response - success:", result.success, "text:", !!result.text);
        throw new Error("Transcription was not successful or no text returned");
      }
    } catch (error: any) {
      console.error("[Audio Conversion] Error:", error);
      const errorMsg = `[Conversion Error]\n\n${error?.message || "Failed to transcribe audio"}\n\nPlease try again or manually add notes from the audio.`;
      setConversionText(errorMsg);
      setShowConversionDialog(true);
      toast({
        title: "Transcription Error",
        description: error?.message || "Failed to convert audio",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  // Add converted text to chat
  const approveConvertedText = async () => {
    if (conversionText.trim()) {
      const newMessage: ChatMessage = {
        id: Date.now(),
        type: "text",
        content: conversionText,
        author: "You (from audio)",
        timestamp: new Date(),
      };

      setChatMessages((prev) => [...prev, newMessage]);

      // Save to database
      try {
        await saveChatMessage(followUp.id, {
          type: "text",
          content: conversionText,
          author: "You (from audio)",
        });
        refetchChat();
        toast({ title: "Converted text added and saved to chat" });
      } catch (error) {
        console.error("Failed to save converted text:", error);
        toast({
          title: "Warning",
          description: "Text added but failed to save to database",
          variant: "default",
        });
      }

      setShowConversionDialog(false);
      setConversionText("");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const sendTextMessage = async () => {
    if (!chatInput.trim()) return;

    const newMessage: ChatMessage = {
      id: Date.now(),
      type: "text",
      content: chatInput,
      author: "You",
      timestamp: new Date(),
      replyTo: replyingToMessageId || undefined,
    };

    setChatMessages((prev) => [...prev, newMessage]);
    const messageContent = chatInput;
    setChatInput("");
    setReplyingToMessageId(null);

    // Save to database
    try {
      await saveChatMessage(followUp.id, {
        type: "text",
        content: messageContent,
        author: "You",
        replyTo: replyingToMessageId || undefined,
      });
      refetchChat();
    } catch (error) {
      console.error("Failed to save message:", error);
      toast({
        title: "Warning",
        description: "Message sent but failed to save to database",
        variant: "default",
      });
    }
  };

  // Delete message
  const deleteMessage = async (messageId: number) => {
    try {
      setDeletingMessageId(messageId);
      const res = await fetch(`/api/lead-followups/chat-messages/${messageId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete message");
      }

      setChatMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      toast({ title: "Message deleted" });
      refetchChat();
    } catch (error) {
      console.error("Failed to delete message:", error);
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
    } finally {
      setDeletingMessageId(null);
    }
  };

  // Edit message
  const startEditingMessage = (message: ChatMessage) => {
    if (message.type === "text") {
      setEditingMessageId(message.id);
      setEditingMessageText(message.content);
    }
  };

  const saveEditedMessage = async () => {
    if (!editingMessageId) return;

    try {
      // Update message in state
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === editingMessageId
            ? { ...msg, content: editingMessageText, isEdited: true }
            : msg
        )
      );

      setEditingMessageId(null);
      setEditingMessageText("");
      toast({ title: "Message updated" });
      refetchChat();
    } catch (error) {
      console.error("Failed to edit message:", error);
      toast({
        title: "Error",
        description: "Failed to update message",
        variant: "destructive",
      });
    }
  };

  // Reply to message
  const startReplyingToMessage = (message: ChatMessage) => {
    setReplyingToMessageId(message.id);
    // Focus on input
    setTimeout(() => {
      const input = document.querySelector(
        'input[placeholder="Write a message..."]'
      ) as HTMLInputElement;
      if (input) input.focus();
    }, 100);
  };

  // Get current time in IST
  const getISTTime = () => {
    const now = new Date();
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return istTime;
  };

  // Fetch assigned user's name
  useEffect(() => {
    if (followUp.assigned_to_user_id) {
      fetchUserName(followUp.assigned_to_user_id).then((name) => {
        setAssignedUserName(name);
      });
    }
  }, [followUp.assigned_to_user_id]);

  // Calculate SLA countdown - Only runs for Pending status
  useEffect(() => {
    console.log("[Timer] Setting up timer. Status:", changedStatus, "FollowUp:", followUp.follow_up_date);

    // Only set up timer if status is Pending
    if (changedStatus !== "Pending") {
      console.log("[Timer] Status is not Pending, hiding timer");
      setSlaTimeRemaining("");
      setShowSLAAlert(false);
      autoOverdueTriggeredRef.current = false;
      return; // Don't run timer for other statuses
    }

    // Timer update function - only for Pending status
    const updateTimer = () => {
      const now = getISTTime();
      const followUpTime = new Date(followUp.follow_up_date);

      // Calculate time difference
      const diffMs = followUpTime.getTime() - now.getTime();

      if (diffMs > 0) {
        // Still time remaining until follow-up
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
        const timeStr = `${hours}h ${mins}m ${secs}s`;
        setSlaTimeRemaining(timeStr);
        console.log("[Timer] Remaining:", timeStr);

        // Show SLA alert when within 30 mins (orange) or less
        if (diffMs <= 30 * 60 * 1000) {
          setShowSLAAlert(true);
        } else {
          setShowSLAAlert(false);
        }
      } else {
        // Follow-up time has passed - show overdue duration
        const absDiffMs = Math.abs(diffMs);
        const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
        const mins = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((absDiffMs % (1000 * 60)) / 1000);
        const overdueDuration = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        const timeStr = `Overdue: ${overdueDuration}`;
        setSlaTimeRemaining(timeStr);
        setShowSLAAlert(true); // Always show red alert when overdue
        console.log("[Timer] Overdue:", timeStr);

        if (!autoOverdueTriggeredRef.current) {
          autoOverdueTriggeredRef.current = true;
          autoOverdueMutation.mutate();
        }
      }
      setCurrentTime(now);
    };

    // Run immediately
    updateTimer();

    // Set up 1-second interval
    const interval = setInterval(updateTimer, 1000);

    return () => {
      console.log("[Timer] Clearing interval");
      clearInterval(interval);
    };
  }, [changedStatus, followUp.follow_up_date]);

  // Change status inline
  const changeStatusInline = async (newStatus: string) => {
    autoOverdueTriggeredRef.current = newStatus === "Pending" ? false : autoOverdueTriggeredRef.current;
    console.log("[Status Change] Changing status to:", newStatus);
    try {
      // Update UI immediately
      setChangedStatus(newStatus);

      // Save to database - only update status, do not send follow_up_date
      const response = await updateFollowUp(followUp.id, {
        status: newStatus,
      });

      if (newStatus !== "Pending") {
        autoOverdueTriggeredRef.current = false;
      }
      console.log("[Status Change] Response:", response);

      // Add system message to chat with username
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const timeStr = istTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

      // Format: "FirstName LastName changed the status pending to completed @ HH:MM AM/PM"
      const userName = user ? user.name : "User";
      const systemMessageContent = `${userName} changed the status ${followUp.status.toLowerCase()} to ${newStatus.toLowerCase()} @ ${timeStr}`;

      const systemMessage: ChatMessage = {
        id: Date.now(),
        type: "system",
        systemEventType: "status_change",
        content: systemMessageContent,
        author: "System",
        timestamp: now,
      };

      console.log("[Status Change] System message:", systemMessageContent);
      setChatMessages((prev) => [...prev, systemMessage]);

      // Save system message to database
      try {
        await saveChatMessage(followUp.id, {
          type: "system",
          content: systemMessageContent,
          author: "System",
        });

        // Invalidate and refetch chat to ensure message is persisted
        await qc.invalidateQueries({ queryKey: ["chat-messages", followUp.id] });
        await refetchChat();
        console.log("[Status Change] System message saved successfully");
      } catch (error) {
        console.error("Failed to save system message:", error);
      }

      // Invalidate queries to refresh data
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      toast({ title: `Status changed to ${newStatus}` });
      onUpdate?.();
    } catch (error) {
      console.error("Failed to change status:", error);
      // Revert to original status on error
      setChangedStatus(followUp.status);
      toast({
        title: "Error",
        description: "Failed to change status",
        variant: "destructive",
      });
    }
  };

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={`followup-${followUp.id}`} className="border rounded-lg mb-3">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center justify-between w-full mr-4">
            <div className="flex items-center gap-3 flex-1">
              <Clock className="h-4 w-4 text-gray-400" />
              <div className="text-left">
                <p className="font-medium">
                  {new Date(followUp.follow_up_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  {followUp.follow_up_date && (
                    <span className="ml-2 text-sm text-blue-600 font-semibold">
                      {new Date(followUp.follow_up_date).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      })}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-gray-600 font-semibold">{followUp.notes}</p>
                  {((followUp as any).assigned_users && Array.isArray((followUp as any).assigned_users) && (followUp as any).assigned_users.length > 0)
                    ? (followUp as any).assigned_users.map((userId: number) => {
                      const user = users.find((u: any) => u.id === userId);
                      const displayName = user
                        ? `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email
                        : `User #${userId}`;
                      return (
                        <span key={userId} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span className="truncate max-w-xs">{displayName}</span>
                        </span>
                      );
                    })
                    : assignedUserName && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span className="truncate max-w-xs">{assignedUserName}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* SLA Alert - Always visible when pending and has time remaining */}
              {showSLAAlert && changedStatus === "Pending" && slaTimeRemaining && (
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                    slaTimeRemaining.startsWith("Overdue:")
                      ? "bg-red-100 border border-red-300 text-red-700"
                      : "bg-orange-50 border border-orange-200 text-orange-700"
                  }`}
                  title={slaTimeRemaining}
                >
                  <Bell className="h-3 w-3" />
                  <span>{slaTimeRemaining}</span>
                </div>
              )}

              {/* Status Dropdown - Shows selected value */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={changedStatus === "Completed" ? "default" : "outline"}
                    size="sm"
                    className="h-8 px-3 whitespace-nowrap"
                    title="Change status"
                  >
                    {changedStatus}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => changeStatusInline(status)}
                      className={changedStatus === status ? "bg-blue-50" : ""}
                    >
                      <span>{status}</span>
                      {changedStatus === status && <Check className="h-4 w-4 ml-auto ml-2" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent className="px-4 py-4 space-y-4">
          {/* Status and Basic Info */}
          {isEditing ? (
            <div className="space-y-4 border rounded-lg p-4 bg-blue-50 max-h-[70vh] overflow-y-auto">
              <h4 className="font-medium">Edit Follow-up</h4>

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={editData.follow_up_date}
                    onChange={(e) =>
                      setEditData({ ...editData, follow_up_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Time</Label>
                  <Input
                    type="time"
                    value={editData.follow_up_time}
                    onChange={(e) =>
                      setEditData({ ...editData, follow_up_time: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  type="text"
                  value={editData.title}
                  onChange={(e) =>
                    setEditData({ ...editData, title: e.target.value })
                  }
                  placeholder="Follow-up title..."
                />
              </div>

              {/* Source */}
              <div>
                <Label className="text-xs">Source</Label>
                <Select
                  value={editData.source}
                  onValueChange={(val) =>
                    setEditData({ ...editData, source: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["Email", "Call", "Meeting", "LinkedIn", "Website", "Referral", "Other"].map((src) => (
                      <SelectItem key={src} value={src}>
                        {src}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(val: any) =>
                    setEditData({ ...editData, status: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Delayed Until (show only if status is Delayed) */}
              {editData.status === "Delayed" && (
                <div className="grid grid-cols-2 gap-3 border-l-4 border-orange-400 pl-3 bg-orange-50 p-2 rounded">
                  <div>
                    <Label className="text-xs">Postponed to Date</Label>
                    <Input
                      type="date"
                      value={editData.delayed_until}
                      onChange={(e) =>
                        setEditData({ ...editData, delayed_until: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Postponed to Time</Label>
                    <Input
                      type="time"
                      value={editData.delayed_until_time}
                      onChange={(e) =>
                        setEditData({ ...editData, delayed_until_time: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-xs">Notes / Description</Label>
                <Textarea
                  value={editData.notes}
                  onChange={(e) =>
                    setEditData({ ...editData, notes: e.target.value })
                  }
                  rows={3}
                  placeholder="Add any additional notes for this follow-up..."
                />
              </div>

              {/* Assign Users */}
              <div>
                <Label className="text-xs">Assign to</Label>
                <div className="space-y-2">
                  {/* Selected Users */}
                  {editData.assigned_users.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editData.assigned_users.map((userId) => {
                        const user = users.find((u: any) => u.id === userId);
                        const displayName = user
                          ? `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email
                          : `User #${userId}`;

                        return (
                          <Badge key={userId} variant="secondary" className="gap-1">
                            {displayName}
                            <button
                              onClick={() =>
                                setEditData({
                                  ...editData,
                                  assigned_users: editData.assigned_users.filter((id) => id !== userId),
                                })
                              }
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
                  <Popover open={openEditUsersPopover} onOpenChange={setOpenEditUsersPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openEditUsersPopover}
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
                          value={editUsersSearch}
                          onValueChange={setEditUsersSearch}
                        />
                        <CommandEmpty>No users found.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-y-auto">
                          {(users as any[])
                            .filter((u) =>
                              `${u.firstname || ""} ${u.lastname || ""} ${u.email || ""}`
                                .toLowerCase()
                                .includes(editUsersSearch.toLowerCase())
                            )
                            .map((u: any) => (
                              <CommandItem
                                key={u.id}
                                onSelect={() => {
                                  const isSelected = editData.assigned_users.includes(u.id);
                                  setEditData({
                                    ...editData,
                                    assigned_users: isSelected
                                      ? editData.assigned_users.filter((id) => id !== u.id)
                                      : [...editData.assigned_users, u.id],
                                  });
                                  setEditUsersSearch("");
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    editData.assigned_users.includes(u.id) ? "opacity-100" : "opacity-0"
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

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm text-gray-600 space-y-2">
                  {(followUp as any).title && (
                    <p><strong>Title:</strong> {(followUp as any).title}</p>
                  )}
                  <p><strong>Status:</strong> {followUp.status}</p>
                  {(followUp as any).source && (
                    <p><strong>Source:</strong> {(followUp as any).source}</p>
                  )}
                  <p><strong>Notes:</strong> {followUp.notes}</p>
                  {(followUp as any).assigned_users && (followUp as any).assigned_users.length > 0 && (
                    <p><strong>Assigned to:</strong> {(followUp as any).assigned_users.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(followUp as any).assigned_users.map((userId: number) => {
                          const user = users.find((u: any) => u.id === userId);
                          const displayName = user
                            ? `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email
                            : `User #${userId}`;
                          return (
                            <Badge key={userId} variant="secondary" className="text-xs">
                              {displayName}
                            </Badge>
                          );
                        })}
                      </div>
                    )}</p>
                  )}
                  {(followUp as any).delayed_until && (
                    <p className="text-orange-600"><strong>Postponed to:</strong> {new Date((followUp as any).delayed_until).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Delete this follow-up?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {/* Team Chat Section - Teams Style UI */}
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm mb-3">Team Chat</h4>

            {/* Chat Messages Container */}
            <div className="bg-white rounded-lg border border-gray-200 flex flex-col h-96">
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center">
                    <p className="text-sm text-gray-400">
                      No messages yet. Start recording or typing to begin.
                    </p>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.type === "system" ? "justify-center" : msg.author === "You" ? "justify-end" : "justify-start"
                        } gap-2 group`}
                      >
                        {msg.type === "system" ? (
                          // System Message - Single line, centered
                          <div className="flex items-center justify-center w-full my-2">
                            <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 border border-gray-300 text-gray-700 font-medium text-center max-w-2xl" style={{ fontSize: '0.65rem', lineHeight: '1' }}>
                              <span className="inline-block whitespace-nowrap overflow-ellipsis overflow-hidden">
                                • {msg.content}
                              </span>
                            </div>
                          </div>
                        ) : msg.type === "text" ? (
                          // Text Message with actions
                          <div className="flex items-start gap-1">
                            {editingMessageId === msg.id ? (
                              // Edit mode
                              <div className="flex-1 flex gap-1">
                                <Input
                                  value={editingMessageText}
                                  onChange={(e) => setEditingMessageText(e.target.value)}
                                  className="text-sm"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={saveEditedMessage}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditingMessageText("");
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div
                                  className={`max-w-xs rounded-lg px-4 py-2 ${
                                    msg.author === "You"
                                      ? "bg-blue-500 text-white"
                                      : "bg-gray-100 text-gray-900"
                                  }`}
                                >
                                  <p className="text-xs font-medium mb-1 opacity-90">
                                    {msg.author} {msg.isEdited && <span className="text-xs opacity-75">(edited)</span>}
                                  </p>
                                  <p className="text-sm break-words">
                                    {msg.content}
                                  </p>
                                  <p className="text-xs mt-1 opacity-75">
                                    {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' })}
                                  </p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="p-1 hover:bg-gray-200 rounded">
                                        <MoreVertical className="h-4 w-4 text-gray-600" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align={msg.author === "You" ? "end" : "start"}>
                                      {msg.author === "You" && (
                                        <>
                                          <DropdownMenuItem onClick={() => startEditingMessage(msg)}>
                                            <Edit className="h-4 w-4 mr-2" />
                                            Edit
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => deleteMessage(msg.id)}
                                            disabled={deletingMessageId === msg.id}
                                            className="text-red-600"
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      <DropdownMenuItem onClick={() => startReplyingToMessage(msg)}>
                                        <Send className="h-4 w-4 mr-2" />
                                        Reply
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          // Audio Message with actions
                          <div className="flex items-start gap-1">
                            <div className="w-96">
                              <div className="text-xs font-medium text-gray-700 mb-1">
                                {msg.author} • {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' })}
                              </div>
                              <div className="bg-blue-50 rounded-lg p-2 border border-blue-200 flex items-center gap-1.5">
                                <audio
                                  controls
                                  className="flex-1 h-6"
                                  src={msg.audioUrl || msg.content}
                                  onError={(e) => {
                                    console.error("[Audio Playback] Error loading audio:", e);
                                  }}
                                />
                                <button
                                  onClick={() => convertAudioToText(msg.audioUrl || msg.content || "")}
                                  disabled={isConverting}
                                  title="Convert to text"
                                  className="p-1.5 hover:bg-blue-100 rounded transition disabled:opacity-50 disabled:cursor-not-allowed text-purple-600 hover:text-purple-700"
                                >
                                  <Wand2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* Action buttons for audio */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1 hover:bg-gray-200 rounded">
                                    <MoreVertical className="h-4 w-4 text-gray-600" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {msg.author === "You" && (
                                    <DropdownMenuItem
                                      onClick={() => deleteMessage(msg.id)}
                                      disabled={deletingMessageId === msg.id}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => startReplyingToMessage(msg)}>
                                    <Send className="h-4 w-4 mr-2" />
                                    Reply
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Message Input Area */}
              <div className="border-t border-gray-200 bg-gray-50 p-3">
                {isRecording ? (
                  <div className="bg-red-50 border border-red-200 rounded p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="font-mono text-sm">{formatTime(recordingTime)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopRecording}
                      className="gap-2"
                    >
                      <StopCircle className="h-4 w-4" />
                      Stop Recording
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendTextMessage();
                          }
                        }}
                        placeholder="Write a message..."
                        className="py-2"
                      />
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={startRecording}
                      className="h-9 w-9 p-0 text-gray-600 hover:text-gray-900"
                      title="Record audio"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>

                    <Button
                      size="sm"
                      onClick={sendTextMessage}
                      disabled={!chatInput.trim()}
                      className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Audio Conversion Dialog */}
      <Dialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Audio Transcription Result</DialogTitle>
            <DialogDescription className="text-base">
              Review the transcribed text below. You can edit it if needed, then click "Approve & Send" to add it to the chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold text-gray-800">Transcribed Text:</Label>
                {conversionText && (
                  <span className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full">
                    {conversionText.length} characters
                  </span>
                )}
              </div>
              <Textarea
                value={conversionText || ""}
                onChange={(e) => setConversionText(e.target.value)}
                className="w-full min-h-48 p-4 text-sm bg-white border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder="Transcribed text will appear here... (Loading...)"
              />
              {conversionText.length === 0 && (
                <p className="text-sm text-gray-500 mt-2 italic">Waiting for transcription...</p>
              )}
            </div>

            {conversionText.toLowerCase().includes("error") && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">
                  ⚠️ There was an issue transcribing the audio. You can manually type the notes or try again.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowConversionDialog(false)}
              className="text-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={approveConvertedText}
              disabled={!conversionText.trim() || conversionText.toLowerCase().includes("error")}
              className="bg-purple-600 hover:bg-purple-700 text-white flex-1"
            >
              ✓ Approve & Send to Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Accordion>
  );
}
