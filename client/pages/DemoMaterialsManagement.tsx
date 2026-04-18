import React, { useState } from "react";
import { useParams } from "react-router-dom";
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
import { Upload, Edit2, Trash2, Download, Eye } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface DemoFile {
  id: number;
  demo_id: number;
  file_type: "video" | "pdf" | "ppt" | "word";
  filename: string;
  file_url: string;
  title?: string;
  description?: string;
  file_size_bytes: number;
  uploaded_at: string;
  is_published: boolean;
}

async function fetchDemoFiles(demoId: string) {
  const res = await fetch(`/api/demos/${demoId}/files`);
  if (!res.ok) throw new Error("Failed to fetch materials");
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

async function deleteFile(demoId: string, fileId: number) {
  const res = await fetch(`/api/demos/${demoId}/files/${fileId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete file");
  return res.json();
}

const FILE_TYPE_ICONS: Record<string, string> = {
  video: "🎥",
  pdf: "📄",
  ppt: "📊",
  word: "📝",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  pdf: "PDF Document",
  ppt: "PowerPoint",
  word: "Word Document",
};

export default function DemoMaterialsManagement() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [fileType, setFileType] = useState<"video" | "pdf" | "ppt" | "word">("pdf");
  const [editingFile, setEditingFile] = useState<DemoFile | null>(null);

  const { data: filesData = { files: [] }, isLoading } = useQuery({
    queryKey: ["demo-files", id],
    queryFn: () => fetchDemoFiles(id!),
    enabled: !!id,
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadFile(id!, materialFile!, materialTitle, materialDescription, fileType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-files", id] });
      qc.invalidateQueries({ queryKey: ["demo", id] });
      setMaterialFile(null);
      setMaterialTitle("");
      setMaterialDescription("");
      setFileType("pdf");
      setShowUploadDialog(false);
      toast({ title: "Material uploaded successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload material",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => deleteFile(id!, fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-files", id] });
      qc.invalidateQueries({ queryKey: ["demo", id] });
      toast({ title: "Material deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete material",
        variant: "destructive",
      });
    },
  });

  const files: DemoFile[] = filesData.files || [];

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (isLoading) return <div className="text-center py-12">Loading materials...</div>;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Materials Management</h1>
        <p className="text-gray-600">Upload, manage, and organize demo materials (videos, PDFs, presentations, documents)</p>
      </div>

      {/* Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload New Material</CardTitle>
          <CardDescription>Add videos, PDFs, PowerPoint presentations, or Word documents</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setShowUploadDialog(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Choose Material to Upload
          </Button>
        </CardContent>
      </Card>

      {/* Materials List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          Materials ({files.length})
        </h2>

        {files.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-gray-500">No materials uploaded yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {files.map((file) => (
              <Card key={file.id} className="hover:shadow-md transition">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{FILE_TYPE_ICONS[file.file_type]}</span>
                        <div>
                          <h3 className="font-semibold text-lg">{file.title || "Untitled"}</h3>
                          <p className="text-sm text-gray-500">{FILE_TYPE_LABELS[file.file_type]}</p>
                        </div>
                      </div>

                      {file.description && (
                        <p className="text-sm text-gray-600 mt-2">{file.description}</p>
                      )}

                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span>Size: {formatFileSize(file.file_size_bytes)}</span>
                        <span>Uploaded: {new Date(file.uploaded_at).toLocaleDateString()}</span>
                        {file.is_published && (
                          <Badge variant="outline" className="text-xs">
                            Published
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(file.file_url, "_blank")}
                        className="gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = file.file_url;
                          a.download = file.filename;
                          a.click();
                        }}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingFile(file)}
                        className="gap-2"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this material?")) {
                            deleteMutation.mutate(file.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Material</DialogTitle>
            <DialogDescription>
              Upload a video, PDF, PowerPoint presentation, or Word document
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="file-type">Material Type</Label>
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
                accept={
                  fileType === "video"
                    ? "video/*"
                    : fileType === "pdf"
                      ? ".pdf"
                      : fileType === "ppt"
                        ? ".ppt,.pptx"
                        : ".doc,.docx"
                }
                onChange={(e) => setMaterialFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
              {materialFile && (
                <p className="text-sm text-gray-600 mt-2">
                  {materialFile.name} ({formatFileSize(materialFile.size)})
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="material-title">
                {fileType === "video" ? "Video Title" : fileType === "pdf" ? "PDF Title" : fileType === "ppt" ? "Presentation Title" : "Document Title"}
              </Label>
              <Input
                id="material-title"
                placeholder={`Enter ${fileType} title`}
                value={materialTitle}
                onChange={(e) => setMaterialTitle(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="material-description">Description (Optional)</Label>
              <Textarea
                id="material-description"
                placeholder="Enter material description"
                value={materialDescription}
                onChange={(e) => setMaterialDescription(e.target.value)}
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
              disabled={!materialFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingFile && (
        <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Material</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Edit functionality coming soon. For now, you can delete and re-upload to make changes.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingFile(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
