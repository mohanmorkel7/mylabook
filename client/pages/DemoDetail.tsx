import React, { useState, useEffect } from "react";
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
import { Play, Trash2, ChevronRight, Copy, Link2, FileText, Plus, Download, Archive } from "lucide-react";
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

interface DemoResult {
  id: number;
  demo_id: number;
  result_status: string;
  client_feedback?: string;
  next_steps?: string;
  proceed_to_next: boolean;
  next_module?: string;
}

interface Material {
  id: number;
  title: string;
  description?: string;
  file_type: "video" | "pdf" | "ppt" | "word";
  file_url: string;
  file_size_bytes: number;
}

interface LinkedMaterial {
  id: number;
  material_id: number;
  demo_id: number;
  display_order: number;
  added_at: string;
  material?: Material;
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

async function fetchMaterials() {
  const res = await fetch(`/api/materials?is_published=true`);
  if (!res.ok) throw new Error("Failed to fetch materials");
  return res.json();
}

async function fetchLinkedMaterials(demoId: string) {
  const res = await fetch(`/api/materials/demo/${demoId}/materials`);
  if (!res.ok) throw new Error("Failed to fetch linked materials");
  return res.json();
}

async function linkMaterial(demoId: string, materialId: number) {
  const res = await fetch(`/api/materials/${materialId}/link-to-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demo_id: parseInt(demoId) }),
  });
  if (!res.ok) throw new Error("Failed to link material");
  return res.json();
}

async function unlinkMaterial(demoId: string, materialId: number) {
  const res = await fetch(`/api/materials/${materialId}/unlink-from-demo/${demoId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to unlink material");
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

  const [showAddMaterialDialog, setShowAddMaterialDialog] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [zipFileLink, setZipFileLink] = useState<string>("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showZipDialog, setShowZipDialog] = useState(false);

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

  const { data: materialsData = { materials: [] } } = useQuery({
    queryKey: ["materials"],
    queryFn: () => fetchMaterials(),
  });

  const { data: linkedMaterialsData = { materials: [] } } = useQuery({
    queryKey: ["demo-materials", id],
    queryFn: () => fetchLinkedMaterials(id!),
    enabled: !!id,
  });

  const linkMaterialMutation = useMutation({
    mutationFn: (materialId: number) => linkMaterial(id!, materialId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-materials", id] });
      setSelectedMaterialId("");
      setShowAddMaterialDialog(false);
      toast({ title: "Material linked successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to link material",
        variant: "destructive",
      });
    },
  });

  const unlinkMaterialMutation = useMutation({
    mutationFn: (materialId: number) => unlinkMaterial(id!, materialId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-materials", id] });
      toast({ title: "Material unlinked successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unlink material",
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
  const linkedMaterials: Material[] = linkedMaterialsData.materials || [];
  const availableMaterials: Material[] = (materialsData.materials || []).filter(
    (m: Material) => !linkedMaterials.some((lm: Material) => lm.id === m.id)
  );
  const results: DemoResult = demoData.results;

  const FILE_TYPE_ICONS: Record<string, string> = {
    video: "🎥",
    pdf: "📄",
    ppt: "📊",
    word: "📝",
  };

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
          {/* Demo Materials Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Demo Materials</CardTitle>
                  <CardDescription className="mt-1">
                    {linkedMaterials.length} material(s) linked
                  </CardDescription>
                </div>
                {availableMaterials.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setShowAddMaterialDialog(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Material
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkedMaterials.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">No materials linked to this demo yet</p>
                  {availableMaterials.length === 0 ? (
                    <p className="text-xs text-gray-400">No materials available. Create materials in the Materials library first.</p>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setShowAddMaterialDialog(true)}
                      variant="outline"
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Material
                    </Button>
                  )}
                </div>
              ) : (
                linkedMaterials.map((material) => (
                  <div
                    key={material.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">{FILE_TYPE_ICONS[material.file_type]}</span>
                          <div>
                            <h4 className="font-medium">{material.title}</h4>
                            <p className="text-xs text-gray-500">
                              {material.file_type.toUpperCase()} • {(material.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        {material.description && (
                          <p className="text-sm text-gray-600 mt-2">{material.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {material.file_type === "video" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPlayingVideoId(material.id)}
                            className="gap-2"
                          >
                            <Play className="h-4 w-4" />
                            Play
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(material.file_url, "_blank")}
                          className="gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => unlinkMaterialMutation.mutate(material.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Video Player for video materials */}
                    {playingVideoId === material.id && material.file_type === "video" && (
                      <div className="mt-4 bg-black rounded-lg overflow-hidden">
                        <video
                          width="100%"
                          height="auto"
                          controls
                          autoPlay
                          className="w-full"
                        >
                          <source src={material.file_url} type="video/mp4" />
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

          {/* Share Materials Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Share Materials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-2">Individual Material Links</p>
                <div className="space-y-2">
                  {linkedMaterials.length === 0 ? (
                    <p className="text-xs text-gray-500">No materials to share</p>
                  ) : (
                    linkedMaterials.map((material) => (
                      <div key={material.id} className="flex items-center justify-between text-xs">
                        <span className="truncate">{material.title}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(material.file_url);
                            toast({ title: "Link copied!" });
                          }}
                          className="h-6 px-2"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">All Materials Bundle</p>
                <Button
                  className="w-full gap-2 mb-2"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowZipDialog(true)}
                >
                  <Archive className="h-4 w-4" />
                  Create Zip Download
                </Button>
                {zipFileLink && (
                  <>
                    <div className="bg-gray-50 p-2 rounded text-xs break-all font-mono border mb-2">
                      {zipFileLink}
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => {
                        navigator.clipboard.writeText(zipFileLink);
                        toast({ title: "Zip link copied!" });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Zip Link
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Shareable Link Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Demo Viewer Link
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

      {/* Add Material Dialog */}
      <Dialog open={showAddMaterialDialog} onOpenChange={setShowAddMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Material to Demo</DialogTitle>
            <DialogDescription>
              Select a material from your materials library to add to this demo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="material-select">Select Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger id="material-select" className="mt-2">
                  <SelectValue placeholder="Choose a material..." />
                </SelectTrigger>
                <SelectContent>
                  {availableMaterials.map((material) => (
                    <SelectItem key={material.id} value={material.id.toString()}>
                      {FILE_TYPE_ICONS[material.file_type]} {material.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMaterialDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedMaterialId && linkMaterialMutation.mutate(parseInt(selectedMaterialId))}
              disabled={!selectedMaterialId || linkMaterialMutation.isPending}
            >
              {linkMaterialMutation.isPending ? "Adding..." : "Add Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zip File Dialog */}
      <Dialog open={showZipDialog} onOpenChange={setShowZipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download All Materials as ZIP</DialogTitle>
            <DialogDescription>
              Create a ZIP file link to download all linked materials at once
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Label htmlFor="zip-link">Paste your ZIP file link here:</Label>
            <Input
              id="zip-link"
              placeholder="https://..."
              value={zipFileLink}
              onChange={(e) => setZipFileLink(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              You can generate a ZIP file link from your file storage service and paste it here. This link will be available for clients to download all materials together.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowZipDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (zipFileLink) {
                  toast({ title: "ZIP link saved successfully" });
                  setShowZipDialog(false);
                }
              }}
              disabled={!zipFileLink}
            >
              Save ZIP Link
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
