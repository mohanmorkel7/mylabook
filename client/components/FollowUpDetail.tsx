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
import { useQuery } from "@tanstack/react-query";

const STATUSES = ["Pending", "Completed", "Cancelled"];

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
  type: "text" | "audio"; // text message or audio message
  content: string; // text content or audio URL
  author: string; // username
  timestamp: Date;
  audioFilename?: string;
  audioUrl?: string;
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

export function FollowUpDetail({
  followUp,
  leadId,
  onUpdate,
  onDelete,
}: FollowUpDetailProps) {
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

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Edit state
  const [editData, setEditData] = useState({
    status: followUp.status,
    notes: followUp.notes,
    follow_up_date: followUp.follow_up_date.split("T")[0],
    follow_up_time: followUp.follow_up_date.split("T")[1]?.slice(0, 5) || "",
  });

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
        type: msg.message_type as "text" | "audio",
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
    mutationFn: () =>
      updateFollowUp(followUp.id, {
        status: editData.status,
        notes: editData.notes,
        follow_up_date: `${editData.follow_up_date}T${editData.follow_up_time || "00:00"}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      toast({ title: "Follow-up updated successfully" });
      setIsEditing(false);
      onUpdate?.();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteFollowUp(followUp.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
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
        const url = URL.createObjectURL(audioBlob);

        // Add audio message to chat
        const newMessage: ChatMessage = {
          id: Date.now(),
          type: "audio",
          content: url,
          author: "You",
          timestamp: new Date(),
          audioFilename: `audio-${Date.now()}.webm`,
          audioUrl: url,
        };

        setChatMessages((prev) => [...prev, newMessage]);

        // Save to database
        try {
          await saveChatMessage(followUp.id, {
            type: "audio",
            content: url,
            author: "You",
            audioFilename: newMessage.audioFilename,
            audioUrl: url,
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

  // Convert audio to text
  const convertAudioToText = async (audioUrl: string) => {
    setIsConverting(true);
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setConversionText(
          "[Audio Transcription Unavailable]\n\nNote: Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari for automatic audio transcription.\n\nAlternatively, you can manually add the notes from the audio recording using the chat input."
        );
        setShowConversionDialog(true);
        setIsConverting(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      let transcript = "";
      let hasError = false;
      const startTime = Date.now();
      const timeoutDuration = 60000; // 60 seconds timeout

      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log("Speech recognition started");
        toast({ title: "Processing audio...", description: "Converting audio to text" });
      };

      recognition.onresult = (event: any) => {
        console.log("Recognition result received");
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const transcriptSegment = event.results[i][0].transcript;
            transcript += transcriptSegment + " ";
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        hasError = true;

        if (event.error === "network") {
          setConversionText(
            "[Network Error During Transcription]\n\nThe speech recognition service requires an internet connection. Please ensure you have an active network connection and try again.\n\nAlternatively, you can manually transcribe the key points from the audio recording into the chat."
          );
        } else if (event.error === "no-speech") {
          setConversionText(
            "[No Speech Detected]\n\nThe audio file appears to be silent or contains no recognizable speech.\n\nPlease check the recording and try again or manually add notes from the audio."
          );
        } else {
          setConversionText(
            `[Transcription Error: ${event.error}]\n\nAn error occurred during speech recognition. Please try again or manually add notes from the audio recording.`
          );
        }

        toast({
          title: "Transcription Error",
          description: `Error: ${event.error}. Please check your internet connection and try again.`,
          variant: "destructive",
        });
      };

      recognition.onend = () => {
        console.log("Recognition ended");
        if (!hasError) {
          if (transcript.trim()) {
            setConversionText(transcript.trim());
          } else {
            setConversionText(
              "[No Speech Detected]\n\nThe audio could not be converted to text. Please try again or manually add notes."
            );
          }
        }
        setShowConversionDialog(true);
        setIsConverting(false);
      };

      // Timeout handler
      const timeoutId = setTimeout(() => {
        recognition.abort();
        if (!hasError && !transcript) {
          setConversionText(
            "[Transcription Timeout]\n\nThe conversion took too long. This might indicate:\n- Very long audio file\n- Poor internet connection\n- Speech recognition service delay\n\nPlease try again or manually add notes."
          );
          setShowConversionDialog(true);
        }
        setIsConverting(false);
      }, timeoutDuration);

      // Create audio element to play while recognizing
      const audio = new Audio(audioUrl);

      // Try to start recognition
      try {
        recognition.start();

        // Play audio for context (user can hear what's being transcribed)
        audio.play().catch((err) => {
          console.log("Audio playback not critical:", err);
        });

        // Clean up timeout on successful end
        recognition.addEventListener("end", () => {
          clearTimeout(timeoutId);
        });
      } catch (err) {
        console.error("Failed to start recognition:", err);
        clearTimeout(timeoutId);
        setConversionText(
          "[Recognition Start Error]\n\nFailed to start the speech recognition engine. Please ensure:\n- Your browser supports speech recognition (Chrome, Edge, Safari)\n- You have granted microphone permissions\n- Your internet connection is active"
        );
        setShowConversionDialog(true);
        setIsConverting(false);
      }
    } catch (error: any) {
      console.error("Conversion error:", error);
      setIsConverting(false);
      setConversionText(
        `[Conversion Error]\n\n${error?.message || "An unexpected error occurred during audio conversion."}\n\nPlease try again or manually add notes from the audio.`
      );
      setShowConversionDialog(true);
      toast({
        title: "Error",
        description: "Failed to convert audio. Check your internet connection.",
        variant: "destructive",
      });
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
    };

    setChatMessages((prev) => [...prev, newMessage]);
    const messageContent = chatInput;
    setChatInput("");

    // Save to database
    try {
      await saveChatMessage(followUp.id, {
        type: "text",
        content: messageContent,
        author: "You",
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

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={`followup-${followUp.id}`} className="border rounded-lg mb-3">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center justify-between w-full mr-4">
            <div className="flex items-center gap-3 flex-1">
              <Clock className="h-4 w-4 text-gray-400" />
              <div className="text-left">
                <p className="font-medium">
                  {new Date(followUp.follow_up_date).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">{followUp.notes}</p>
              </div>
            </div>
            <Badge
              variant={followUp.status === "Completed" ? "default" : "outline"}
              className="ml-2"
            >
              {followUp.status}
            </Badge>
          </div>
        </AccordionTrigger>

        <AccordionContent className="px-4 py-4 space-y-4">
          {/* Status and Basic Info */}
          {isEditing ? (
            <div className="space-y-4 border rounded-lg p-4 bg-blue-50">
              <h4 className="font-medium">Edit Follow-up</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date</Label>
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

              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={editData.notes}
                  onChange={(e) =>
                    setEditData({ ...editData, notes: e.target.value })
                  }
                  rows={3}
                />
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
                <div className="text-sm text-gray-600">
                  <p><strong>Status:</strong> {followUp.status}</p>
                  <p className="mt-2"><strong>Notes:</strong> {followUp.notes}</p>
                  {followUp.source && (
                    <p className="mt-1"><strong>Source:</strong> {followUp.source}</p>
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
                          msg.author === "You" ? "justify-end" : "justify-start"
                        } gap-2`}
                      >
                        {msg.type === "text" ? (
                          // Text Message
                          <div
                            className={`max-w-xs rounded-lg px-4 py-2 ${
                              msg.author === "You"
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-900"
                            }`}
                          >
                            <p className="text-xs font-medium mb-1 opacity-90">
                              {msg.author}
                            </p>
                            <p className="text-sm break-words">
                              {msg.content}
                            </p>
                            <p className="text-xs mt-1 opacity-75">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        ) : (
                          // Audio Message
                          <div className="max-w-sm">
                            <div className="text-xs font-medium text-gray-700 mb-2">
                              {msg.author} • {new Date(msg.timestamp).toLocaleTimeString()}
                            </div>
                            <div className="bg-gray-100 rounded-lg p-3 border border-gray-200">
                              <audio
                                ref={audioPlayerRef}
                                controls
                                className="w-full h-8"
                                src={msg.audioUrl}
                              />
                              <div className="mt-2 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => convertAudioToText(msg.audioUrl || "")}
                                  disabled={isConverting}
                                  className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-xs"
                                >
                                  {isConverting ? "Converting..." : "Convert to Text"}
                                </Button>
                              </div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audio Transcription</DialogTitle>
            <DialogDescription>
              Review the converted text below. Click "Approve & Send" to add it to the chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <Label className="text-sm font-medium text-gray-700">Transcribed Text:</Label>
              <Textarea
                value={conversionText}
                onChange={(e) => setConversionText(e.target.value)}
                className="mt-2 min-h-32"
                placeholder="Transcribed text will appear here..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConversionDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={approveConvertedText}
              disabled={!conversionText.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Approve & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Accordion>
  );
}
