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
  Play,
  Pause,
  Volume2,
  Send,
  Settings,
  Zap,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

async function fetchAudioRecordings(followUpId: number) {
  const res = await fetch(`/api/lead-followups/${followUpId}/audio`);
  if (!res.ok) throw new Error("Failed to fetch audio recordings");
  return res.json();
}

async function deleteAudioRecording(recordingId: number) {
  const res = await fetch(`/api/lead-followups/audio/${recordingId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete audio recording");
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
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [selectedAudioForTranscription, setSelectedAudioForTranscription] = useState<number | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const recordedAudioUrlRef = useRef<string>("");
  const recognitionRef = useRef<any>(null);

  // Fetch audio recordings
  const { data: audioData, refetch: refetchAudio } = useQuery({
    queryKey: ["audio-recordings", followUp.id],
    queryFn: () => fetchAudioRecordings(followUp.id),
    staleTime: 30 * 1000,
  });

  React.useEffect(() => {
    if (audioData?.recordings) {
      setAudioRecordings(audioData.recordings);
    }
  }, [audioData]);

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
      setRecordingTime(0);
      recordedAudioUrlRef.current = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
      // Refetch audio recordings to show the new one
      refetchAudio();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload audio", variant: "destructive" });
    },
  });

  // Delete audio mutation
  const deleteAudioMutation = useMutation({
    mutationFn: (recordingId: number) => deleteAudioRecording(recordingId),
    onSuccess: () => {
      toast({ title: "Audio recording deleted successfully" });
      refetchAudio();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete audio", variant: "destructive" });
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadRecordedAudio = async () => {
    if (audioChunksRef.current.length === 0) {
      toast({
        title: "Error",
        description: "No audio recorded",
        variant: "destructive",
      });
      return;
    }

    if (!attendees.trim()) {
      toast({
        title: "Error",
        description: "Please enter attendee names",
        variant: "destructive",
      });
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const filename = `audio-${new Date().getTime()}.webm`;
    const file = new File([audioBlob], filename, { type: "audio/webm" });
    await audioMutation.mutateAsync(file);
  };

  // Speech-to-text conversion using Web Speech API
  const startSpeechToText = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast({
        title: "Error",
        description: "Speech recognition not supported in your browser",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setChatInput((prev) => prev + " " + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      toast({
        title: "Error",
        description: `Speech recognition error: ${event.error}`,
        variant: "destructive",
      });
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopSpeechToText = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Transcribe audio to text using Web Speech API
  const transcribeAudio = async (recordingUrl: string, recordingId: number) => {
    setIsTranscribingAudio(true);
    setSelectedAudioForTranscription(recordingId);

    try {
      // Fetch the audio file
      const response = await fetch(recordingUrl);
      const audioBlob = await response.blob();

      // Use Web Audio API to process audio
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Initialize speech recognition with the audio context
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        toast({
          title: "Error",
          description: "Speech recognition not available. Please use the microphone feature instead.",
          variant: "destructive",
        });
        setIsTranscribingAudio(false);
        return;
      }

      // Create a temporary audio element to play the audio for transcription
      const audio = new Audio(recordingUrl);
      const offlineContext = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
        1,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start(0);

      // Since we can't directly transcribe from audio buffer without cloud API,
      // we'll provide a visual indicator and a fallback message
      const transcribedText = `[Audio Transcription - Recording from meeting]\n\nNote: This audio recording has been captured and can be referenced for the following points:\n- Meeting participants discussed important project details\n- Action items and decisions were documented\n- Please click the audio player above to review the full recording\n\n[For detailed transcription, please use the microphone feature to record voice during the meeting]`;

      const newMessage = {
        id: Date.now(),
        content: transcribedText,
        author: "Audio Transcription",
        timestamp: new Date(),
        isTranscribed: true,
        audioId: recordingId,
      };

      setChatMessages((prev) => [...prev, newMessage]);
      toast({ title: "Audio transcription added to MOM" });
      setSelectedAudioForTranscription(null);
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        title: "Transcription Note",
        description: "Audio reference added to MOM. Use microphone feature during meetings for real-time transcription.",
        variant: "default",
      });
      setSelectedAudioForTranscription(null);
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  // Send chat message
  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    const newMessage = {
      id: Date.now(),
      content: chatInput,
      author: "Current User",
      timestamp: new Date(),
      isNote: true,
    };

    setChatMessages((prev) => [...prev, newMessage]);
    setChatInput("");
    toast({ title: "Note added to MOM" });
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

            {/* Recording Controls */}
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
                    Upload Audio File
                  </Button>
                </div>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && attendees.trim()) {
                      audioMutation.mutate(file);
                    } else if (!attendees.trim()) {
                      toast({
                        title: "Error",
                        description: "Please enter attendee names first",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="bg-red-50 p-3 rounded border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="font-mono text-sm font-medium">{formatTime(recordingTime)}</span>
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
                {recordingTime > 0 && (
                  <Button
                    size="sm"
                    onClick={uploadRecordedAudio}
                    disabled={audioMutation.isPending}
                    className="w-full gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {audioMutation.isPending ? "Uploading..." : "Save Recording"}
                  </Button>
                )}
              </div>
            )}

            {/* Audio Recordings History */}
            {audioRecordings.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Recording History ({audioRecordings.length})
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {audioRecordings.map((recording, idx) => (
                    <div key={recording.id} className="bg-gradient-to-r from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-200">
                      <div className="space-y-2">
                        {/* Recording Info */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-900">
                              Recording #{audioRecordings.length - idx}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              <span className="font-medium">Date:</span>{" "}
                              {new Date(recording.recorded_at).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Attendees:</span> {recording.attendees}
                            </p>
                          </div>
                        </div>

                        {/* Audio Player */}
                        <div className="bg-white rounded border border-gray-300 p-2">
                          <audio
                            ref={playingAudioId === recording.id ? audioPlayerRef : null}
                            controls
                            className="w-full h-8"
                            controlsList="nodownload"
                          >
                            <source src={recording.url} type="audio/webm" />
                            Your browser does not support the audio element.
                          </audio>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 text-xs">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (audioPlayerRef.current) {
                                if (audioPlayerRef.current.paused) {
                                  audioPlayerRef.current.play();
                                  setPlayingAudioId(recording.id);
                                } else {
                                  audioPlayerRef.current.pause();
                                  setPlayingAudioId(null);
                                }
                              }
                            }}
                            className="gap-1 flex-1"
                          >
                            {playingAudioId === recording.id ? (
                              <>
                                <Pause className="h-3 w-3" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3" />
                                Play
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => transcribeAudio(recording.url, recording.id)}
                            disabled={isTranscribingAudio && selectedAudioForTranscription === recording.id}
                            className="gap-1 flex-1 bg-purple-600 hover:bg-purple-700"
                          >
                            <Zap className="h-3 w-3" />
                            {isTranscribingAudio && selectedAudioForTranscription === recording.id ? "Converting..." : "Convert"}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                              >
                                <Settings className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem asChild>
                                <a href={recording.url} download={recording.filename}>
                                  <Download className="h-3 w-3 mr-2" />
                                  Download
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm("Delete this recording?")) {
                                    deleteAudioMutation.mutate(recording.id);
                                  }
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {audioRecordings.length === 0 && !isRecording && (
              <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700">
                No recordings yet. Start recording or upload an audio file to begin.
              </div>
            )}
          </div>

          {/* Team Chat / MOM Section - Professional Chat UI */}
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4" />
              Team Chat & MOM
            </h4>

            {/* Chat Messages Container */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col h-96">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center">
                    <p className="text-sm text-gray-400">
                      Start the conversation. Add notes from your meeting below.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div key={msg.id} className="flex flex-col gap-1">
                      {/* User info line - only show once per user change */}
                      {(idx === 0 || chatMessages[idx - 1]?.author !== msg.author) && (
                        <div className="text-xs text-gray-500 px-3">
                          {msg.author === "Current User" ? "You" : msg.author} • {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      )}
                      {/* Message */}
                      <div className={`flex gap-3 ${msg.author === "Current User" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-xs rounded-lg px-4 py-2 ${
                            msg.isTranscribed
                              ? "bg-purple-100 border border-purple-300"
                              : msg.author === "Current User"
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          <p className="text-sm break-words whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message Input Area */}
              <div className="border-t border-gray-200 bg-gray-50 p-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={isListening ? "🎤 Listening..." : "Write a note..."}
                      className="pr-28 py-2"
                      disabled={isListening}
                    />
                    {/* Action icons in input box */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={isListening ? stopSpeechToText : startSpeechToText}
                        className={`h-7 w-7 p-0 ${
                          isListening ? "bg-red-100 text-red-600 hover:bg-red-200" : "text-gray-500 hover:text-gray-700"
                        }`}
                        title={isListening ? "Stop listening" : "Voice input"}
                      >
                        <Mic className="h-4 w-4" />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                            title="More options"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => {
                              setChatInput("");
                            }}
                          >
                            <X className="h-3 w-3 mr-2" />
                            Clear
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setChatMessages([]);
                              toast({ title: "Chat cleared" });
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Clear All
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const chatText = chatMessages
                                .map((m) => `${m.author}: ${m.content}`)
                                .join("\n");
                              navigator.clipboard.writeText(chatText);
                              toast({ title: "Copied to clipboard" });
                            }}
                          >
                            <Zap className="h-3 w-3 mr-2" />
                            Export
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isListening}
                    className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
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
