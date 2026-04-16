import React, { useState, useRef } from "react";
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
  ChevronDown,
  Paperclip,
  MessageSquare,
  Mic,
  StopCircle,
  Download,
  X,
  Save,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

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

interface FollowUpNote {
  id: number;
  follow_up_id: number;
  content: string;
  author: string;
  created_at: string;
}

interface AudioRecording {
  id: number;
  follow_up_id: number;
  filename: string;
  duration: number;
  url: string;
  attendees: string;
  recorded_at: string;
  created_at: string;
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

async function uploadFollowUpAttachment(followUpId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/lead-followups/${followUpId}/attachment`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload attachment");
  return res.json();
}

async function addFollowUpNote(followUpId: number, content: string, author: string) {
  const res = await fetch(`/api/lead-followups/${followUpId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, author }),
  });
  if (!res.ok) throw new Error("Failed to add note");
  return res.json();
}

async function uploadAudioRecording(
  followUpId: number,
  file: File,
  attendees: string
) {
  const formData = new FormData();
  formData.append("audio", file);
  formData.append("attendees", attendees);
  const res = await fetch(`/api/lead-followups/${followUpId}/audio`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload audio");
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Edit state
  const [editData, setEditData] = useState({
    status: followUp.status,
    notes: followUp.notes,
    follow_up_date: followUp.follow_up_date.split("T")[0],
    follow_up_time: followUp.follow_up_date.split("T")[1]?.slice(0, 5) || "",
  });

  // Notes state
  const [noteContent, setNoteContent] = useState("");
  const [notes, setNotes] = useState<FollowUpNote[]>([]);

  // Audio state
  const [attendees, setAttendees] = useState("");
  const [audioRecordings, setAudioRecordings] = useState<AudioRecording[]>([]);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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

  // Attachment mutation
  const attachmentMutation = useMutation({
    mutationFn: (file: File) => uploadFollowUpAttachment(followUp.id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-followups", String(leadId)] });
      toast({ title: "Attachment uploaded successfully" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  // Note mutation
  const noteMutation = useMutation({
    mutationFn: () => addFollowUpNote(followUp.id, noteContent, "Current User"),
    onSuccess: () => {
      toast({ title: "Note added successfully" });
      setNoteContent("");
      // In a real app, would fetch notes from backend
    },
  });

  // Audio mutation
  const audioMutation = useMutation({
    mutationFn: (file: File) => uploadAudioRecording(followUp.id, file, attendees),
    onSuccess: () => {
      toast({ title: "Audio recording uploaded successfully" });
      setAttendees("");
      if (audioInputRef.current) audioInputRef.current.value = "";
    },
  });

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
        const filename = `audio-${new Date().getTime()}.webm`;
        const file = new File([audioBlob], filename, { type: "audio/webm" });
        await audioMutation.mutateAsync(file);
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
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      attachmentMutation.mutate(file);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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

          {/* Attachment Section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Attachments
              </h4>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachmentMutation.isPending}
                  className="gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  Add Attachment
                </Button>
              </div>
            </div>
            {followUp.image_url && (
              <div className="space-y-2">
                <img
                  src={followUp.image_url}
                  alt={followUp.image_filename}
                  className="max-w-xs rounded border"
                />
                <p className="text-xs text-gray-500">{followUp.image_filename}</p>
              </div>
            )}
            {!followUp.image_url && (
              <p className="text-xs text-gray-400">No attachments yet</p>
            )}
          </div>

          {/* Notes/Chat Section */}
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4" />
              Notes & Comments
            </h4>
            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded border min-h-24 max-h-40 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-xs text-gray-400">No notes yet</p>
                ) : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="text-xs">
                        <p className="font-medium text-gray-700">{note.author}</p>
                        <p className="text-gray-600">{note.content}</p>
                        <p className="text-gray-400">
                          {new Date(note.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Add a note or comment..."
                  rows={2}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => noteMutation.mutate()}
                  disabled={noteMutation.isPending || !noteContent.trim()}
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Add Note
                </Button>
              </div>
            </div>
          </div>

          {/* Audio Recording Section */}
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
              <Mic className="h-4 w-4" />
              Call/Meeting Recording
            </h4>
            
            {!isRecording ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="attendees" className="text-xs">
                    Attendees (comma-separated)
                  </Label>
                  <Input
                    id="attendees"
                    placeholder="John Doe, Jane Smith, etc."
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={startRecording}
                    variant="outline"
                    className="gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    Start Recording
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => audioInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Audio
                  </Button>
                </div>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) audioMutation.mutate(file);
                  }}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="bg-red-50 p-3 rounded border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
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
              </div>
            )}

            {audioRecordings.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">Recordings:</p>
                {audioRecordings.map((recording) => (
                  <div key={recording.id} className="bg-gray-50 p-2 rounded text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{recording.filename}</p>
                        <p className="text-gray-600">
                          {new Date(recording.recorded_at).toLocaleString()} • {recording.attendees}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface UploadIconProps {
  className?: string;
}

const Upload: React.FC<UploadIconProps> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);
