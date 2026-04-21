import React, { useState } from "react";
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
import { Upload, Edit2, Trash2, Download, Eye, FilePlus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsStudio } from "@/components/DocumentsStudio";
import { toast } from "@/components/ui/use-toast";

interface Material {
  id: number;
  title: string;
  description?: string;
  file_type: "video" | "pdf" | "ppt" | "word";
  filename: string;
  file_url: string;
  file_size_bytes: number;
  mime_type: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

async function fetchMaterials(fileType?: string) {
  const query = new URLSearchParams();
  if (fileType && fileType !== "all") {
    query.append("file_type", fileType);
  }
  const res = await fetch(`/api/materials?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch materials");
  return res.json();
}

async function uploadMaterial(file: File, title: string, description: string, fileType: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  formData.append("description", description);
  formData.append("file_type", fileType);

  const res = await fetch("/api/materials", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload material");
  return res.json();
}

async function updateMaterial(id: number, title: string, description: string, isPublished: boolean) {
  const res = await fetch(`/api/materials/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, is_published: isPublished }),
  });
  if (!res.ok) throw new Error("Failed to update material");
  return res.json();
}

async function deleteMaterial(id: number) {
  const res = await fetch(`/api/materials/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete material");
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
  pdf: "PDF",
  ppt: "PowerPoint",
  word: "Word Document",
};

export default function MaterialsManagement() {
  const qc = useQueryClient();

  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [fileType, setFileType] = useState<"video" | "pdf" | "ppt" | "word">("pdf");
  const [filterFileType, setFilterFileType] = useState<"all" | "video" | "pdf" | "ppt" | "word">("all");
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"materials" | "documents">("materials");

  const { data: materialsData = { materials: [] }, isLoading } = useQuery({
    queryKey: ["materials", filterFileType],
    queryFn: () => fetchMaterials(filterFileType),
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadMaterial(materialFile!, materialTitle, materialDescription, fileType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
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

  const updateMutation = useMutation({
    mutationFn: () =>
      updateMaterial(
        editingMaterial!.id,
        editingMaterial!.title,
        editingMaterial!.description || "",
        editingMaterial!.is_published
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      setEditingMaterial(null);
      setShowEditDialog(false);
      toast({ title: "Material updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update material",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMaterial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
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

  const materials: Material[] = materialsData.materials || [];

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Materials Library</h1>
            <p className="text-gray-600">
              Manage your reusable materials (videos, PDFs, presentations, documents) and link them to demos
            </p>
          </div>
          <Button onClick={() => setShowUploadDialog(true)} className="gap-2 h-fit">
            <FilePlus className="h-4 w-4" />
            Upload New Material
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "materials" | "documents") }>
          <TabsList className="grid w-full max-w-2xl grid-cols-2">
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "materials" ? (
        <>
      {/* Filter Section */}
      {materials.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label htmlFor="filter" className="text-sm font-medium">
                Filter by Type:
              </Label>
              <Select value={filterFileType} onValueChange={(val) => setFilterFileType(val as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="pdf">PDFs</SelectItem>
                  <SelectItem value="ppt">Presentations</SelectItem>
                  <SelectItem value="word">Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materials Grid */}
      {isLoading ? (
        <div className="text-center py-12">Loading materials...</div>
      ) : materials.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 mb-4">No materials uploaded yet</p>
            <Button onClick={() => setShowUploadDialog(true)} variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Your First Material
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {materials.map((material) => (
            <Card key={material.id} className="hover:shadow-md transition">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{FILE_TYPE_ICONS[material.file_type]}</span>
                      <div>
                        <h3 className="font-semibold text-lg">{material.title}</h3>
                        <p className="text-sm text-gray-500">{FILE_TYPE_LABELS[material.file_type]}</p>
                      </div>
                    </div>

                    {material.description && (
                      <p className="text-sm text-gray-600 mt-2 mb-3">{material.description}</p>
                    )}

                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-xs text-gray-500">
                        Size: {formatFileSize(material.file_size_bytes)}
                      </span>
                      <span className="text-xs text-gray-500">
                        Uploaded: {new Date(material.created_at).toLocaleDateString()}
                      </span>
                      {material.is_published ? (
                        <Badge variant="outline" className="text-xs bg-green-50">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-yellow-50">
                          Draft
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(material.file_url, "_blank")}
                      className="gap-2"
                      title="View material"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = material.file_url;
                        a.download = material.filename;
                        a.click();
                      }}
                      className="gap-2"
                      title="Download material"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingMaterial(material);
                        setShowEditDialog(true);
                      }}
                      className="gap-2"
                      title="Edit material"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Delete "${material.title}"?`)) {
                          deleteMutation.mutate(material.id);
                        }
                      }}
                      title="Delete material"
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

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload New Material</DialogTitle>
            <DialogDescription>
              Upload a video, PDF, PowerPoint presentation, or Word document to your materials library
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
              <Label htmlFor="material-file">File *</Label>
              <Input
                id="material-file"
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
              <Label htmlFor="material-title">Title *</Label>
              <Input
                id="material-title"
                placeholder="Enter material title"
                value={materialTitle}
                onChange={(e) => setMaterialTitle(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="material-description">Description</Label>
              <Textarea
                id="material-description"
                placeholder="Enter material description (optional)"
                value={materialDescription}
                onChange={(e) => setMaterialDescription(e.target.value)}
                className="mt-2 min-h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!materialFile || !materialTitle || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingMaterial && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Material</DialogTitle>
              <DialogDescription>Update material details</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editingMaterial.title}
                  onChange={(e) =>
                    setEditingMaterial({ ...editingMaterial, title: e.target.value })
                  }
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingMaterial.description || ""}
                  onChange={(e) =>
                    setEditingMaterial({ ...editingMaterial, description: e.target.value })
                  }
                  className="mt-2 min-h-20"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-published"
                  checked={editingMaterial.is_published}
                  onChange={(e) =>
                    setEditingMaterial({ ...editingMaterial, is_published: e.target.checked })
                  }
                />
                <Label htmlFor="edit-published" className="cursor-pointer">
                  Publish this material
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
        </>
      ) : (
        <DocumentsStudio />
      )}
    </div>
  );
}
