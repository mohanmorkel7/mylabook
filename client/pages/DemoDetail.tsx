import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Play, Trash2, Send, Check, X, ChevronRight, Copy, Link2, FileText } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Demo {
  id: number;
  lead_id: number;
  title: string;
  description?: string;
  status: string;
  demo_date?: string;
  location?: string;
  attendees?: string;
}

interface DemoVideo {
  id: number;
  demo_id: number;
  filename: string;
  file_url: string;
  title?: string;
  description?: string;
  uploaded_at: string;
}

interface DemoResult {
  id: number;
  demo_id: number;
  result_status: string;
  client_feedback?: string;
  next_steps?: string;
  proceed_to_next: boolean;
  next_module?: string;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-800",
  Scheduled: "bg-blue-100 text-blue-800",
  "In Progress": "bg-yellow-100 text-yellow-800",
  Completed: "bg-green-100 text-green-800",
  Cancelled: "bg-red-100 text-red-800",
};

async function fetchDemoDetails(id: string) {
  const res = await fetch(`/api/demos/${id}`);
  if (!res.ok) throw new Error("Failed to fetch demo");
  return res.json();
}

async function uploadFile(demoId: string, file: File, title: string, description: string, fileType: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  formData.append("description", description);
  formData.append("file_type", fileType);

  const res = await fetch(`/api/demos/${demoId}/files`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload file");
  return res.json();
}

async function generateShareableLink(demoId: string) {
  const res = await fetch(`/api/demos/${demoId}/generate-shareable-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expires_days: 30 }),
  });
  if (!res.ok) throw new Error("Failed to generate shareable link");
  return res.json();
}

async function deleteVideo(demoId: string, videoId: number) {
  const res = await fetch(`/api/demos/${demoId}/videos/${videoId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete video");
  return res.json();
}

async function recordResults(demoId: string, results: any) {
  const res = await fetch(`/api/demos/${demoId}/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results),
  });
  if (!res.ok) throw new Error("Failed to record results");
  return res.json();
}

export default function DemoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [fileType, setFileType] = useState<"video" | "pdf" | "ppt" | "word">("video");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const [resultStatus, setResultStatus] = useState("Positive");
  const [clientFeedback, setClientFeedback] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [proceedToNext, setProceedToNext] = useState(false);
  const [nextModule, setNextModule] = useState("Proposal");

  const { data: demoData, isLoading } = useQuery({
    queryKey: ["demo", id],
    queryFn: () => fetchDemoDetails(id!),
    enabled: !!id,
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadFile(id!, videoFile!, videoTitle, videoDescription, fileType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo", id] });
      setVideoFile(null);
      setVideoTitle("");
      setVideoDescription("");
      setFileType("video");
      setShowUploadDialog(false);
      toast({ title: `${fileType.toUpperCase()} uploaded successfully` });
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to upload ${fileType}`,
        variant: "destructive",
      });
    },
  });

  const shareableLinkMutation = useMutation({
    mutationFn: () => generateShareableLink(id!),
    onSuccess: (data) => {
      setShareableLink(data.shareable_link);
      qc.invalidateQueries({ queryKey: ["demo", id] });
      toast({ title: "Shareable link generated successfully" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate shareable link",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (videoId: number) => deleteVideo(id!, videoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo", id] });
      toast({ title: "Video deleted successfully" });
    },
  });

  const resultsMutation = useMutation({
    mutationFn: () =>
      recordResults(id!, {
        result_status: resultStatus,
        client_feedback: clientFeedback,
        next_steps: nextSteps,
        proceed_to_next: proceedToNext,
        next_module: nextModule,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo", id] });
      setShowResultsDialog(false);
      toast({ title: "Results recorded successfully" });
    },
  });

  if (isLoading) return <div className="text-center py-12">Loading...</div>;
  if (!demoData) return <div className="text-center py-12">Demo not found</div>;

  const demo: Demo = demoData.demo;
  const videos: DemoVideo[] = demoData.videos || [];
  const results: DemoResult = demoData.results;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{demo.title}</h1>
              <Badge className={`${STATUS_COLORS[demo.status]}`}>{demo.status}</Badge>
            </div>
            {demo.description && <p className="text-gray-600">{demo.description}</p>}
          </div>
          <Button variant="outline" onClick={() => navigate("/demo-workshop")}>
            Back to Demos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Demo Files Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Demo Files</CardTitle>
                <Button
                  size="sm"
                  onClick={() => setShowUploadDialog(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Video
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {videos.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No videos uploaded yet</p>
              ) : (
                videos.map((video) => (
                  <div
                    key={video.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{video.title || "Untitled Video"}</h4>
                          {playingVideoId === video.id && (
                            <Badge variant="outline" className="text-xs">
                              Playing
                            </Badge>
                          )}
                        </div>
                        {video.description && (
                          <p className="text-sm text-gray-600 mt-1">{video.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Uploaded: {new Date(video.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPlayingVideoId(video.id)}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(video.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Video Player */}
                    {playingVideoId === video.id && (
                      <div className="mt-4 bg-black rounded-lg overflow-hidden">
                        <video
                          width="100%"
                          height="auto"
                          controls
                          autoPlay
                          className="w-full"
                        >
                          <source src={video.file_url} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Demo Info */}
          <Card>
            <CardHeader>
              <CardTitle>Demo Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {demo.demo_date && (
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{new Date(demo.demo_date).toLocaleString()}</p>
                </div>
              )}
              {demo.location && (
                <div>
                  <p className="text-sm text-gray-600">Location</p>
                  <p className="font-medium">{demo.location}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Results Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Demo Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {results ? (
                <>
                  <div>
                    <p className="text-sm text-gray-600">Result Status</p>
                    <Badge
                      className={`mt-1 ${
                        results.result_status === "Positive"
                          ? "bg-green-100 text-green-800"
                          : results.result_status === "Negative"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {results.result_status}
                    </Badge>
                  </div>

                  {results.client_feedback && (
                    <div>
                      <p className="text-sm text-gray-600">Client Feedback</p>
                      <p className="text-sm mt-1">{results.client_feedback}</p>
                    </div>
                  )}

                  {results.next_steps && (
                    <div>
                      <p className="text-sm text-gray-600">Next Steps</p>
                      <p className="text-sm mt-1">{results.next_steps}</p>
                    </div>
                  )}

                  {results.proceed_to_next && (
                    <div className="pt-4 border-t">
                      <Badge className="bg-blue-100 text-blue-800">
                        Proceeding to {results.next_module}
                      </Badge>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No results recorded</p>
              )}

              <Button
                onClick={() => setShowResultsDialog(true)}
                className="w-full gap-2"
              >
                {results ? "Update" : "Record"} Results
              </Button>
            </CardContent>
          </Card>

          {/* Shareable Link Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Share with Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {shareableLink ? (
                <>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 break-all text-xs font-mono">
                    {shareableLink}
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      navigator.clipboard.writeText(shareableLink);
                      toast({ title: "Link copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </Button>
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-2">
                  No shareable link yet
                </p>
              )}
              <Button
                className="w-full gap-2"
                variant={shareableLink ? "outline" : "default"}
                onClick={() => shareableLinkMutation.mutate()}
                disabled={shareableLinkMutation.isPending}
              >
                <Link2 className="h-4 w-4" />
                {shareableLink ? "Generate New Link" : "Generate Link"}
              </Button>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-2">
            {demo.status === "Draft" && (
              <Button
                className="w-full gap-2 bg-blue-600"
                onClick={() => {
                  // Update status to Scheduled
                  navigate(`/demo-workshop/${id}/edit`);
                }}
              >
                Schedule Demo
              </Button>
            )}

            {results?.proceed_to_next && (
              <Button
                className="w-full gap-2 bg-green-600"
                onClick={() => navigate(`/lead-management/${demo.lead_id}/overview`)}
              >
                <ChevronRight className="h-4 w-4" />
                Go to Next Module
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Upload File Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Demo File</DialogTitle>
            <DialogDescription>
              Upload video, PDF, PowerPoint, or Word document for this demo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="file-type">File Type</Label>
              <Select value={fileType} onValueChange={(val) => setFileType(val as any)}>
                <SelectTrigger id="file-type" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video (MP4, WebM, Ogg)</SelectItem>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="ppt">PowerPoint Presentation</SelectItem>
                  <SelectItem value="word">Word Document</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="demo-file">File</Label>
              <Input
                id="demo-file"
                type="file"
                accept={fileType === "video" ? "video/*" : fileType === "pdf" ? ".pdf" : fileType === "ppt" ? ".ppt,.pptx" : ".doc,.docx"}
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
              {videoFile && (
                <p className="text-sm text-gray-600 mt-2">{videoFile.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="video-title">Video Title</Label>
              <Input
                id="video-title"
                placeholder="Enter video title"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="video-description">Description (Optional)</Label>
              <Textarea
                id="video-description"
                placeholder="Enter video description"
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value)}
                className="mt-2 min-h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!videoFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Demo Results</DialogTitle>
            <DialogDescription>
              Document the outcome and next steps for this demo/workshop
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="result-status">Result Status</Label>
              <Select value={resultStatus} onValueChange={setResultStatus}>
                <SelectTrigger id="result-status" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Positive">Positive - Client Interested</SelectItem>
                  <SelectItem value="Neutral">Neutral - Needs Follow-up</SelectItem>
                  <SelectItem value="Needs Follow-up">Needs Follow-up</SelectItem>
                  <SelectItem value="Lost">Lost - No Interest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="feedback">Client Feedback</Label>
              <Textarea
                id="feedback"
                placeholder="Enter client feedback"
                value={clientFeedback}
                onChange={(e) => setClientFeedback(e.target.value)}
                className="mt-2 min-h-20"
              />
            </div>

            <div>
              <Label htmlFor="next-steps">Next Steps</Label>
              <Textarea
                id="next-steps"
                placeholder="What are the next steps?"
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                className="mt-2 min-h-20"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="proceed"
                checked={proceedToNext}
                onChange={(e) => setProceedToNext(e.target.checked)}
              />
              <Label htmlFor="proceed" className="cursor-pointer">
                Proceed to next module
              </Label>
            </div>

            {proceedToNext && (
              <div>
                <Label htmlFor="next-module">Next Module</Label>
                <Select value={nextModule} onValueChange={setNextModule}>
                  <SelectTrigger id="next-module" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Proposal">Proposal</SelectItem>
                    <SelectItem value="Negotiation">Negotiation</SelectItem>
                    <SelectItem value="Closing">Closing</SelectItem>
                    <SelectItem value="Implementation">Implementation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => resultsMutation.mutate()}
              disabled={resultsMutation.isPending}
            >
              {resultsMutation.isPending ? "Saving..." : "Record Results"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
