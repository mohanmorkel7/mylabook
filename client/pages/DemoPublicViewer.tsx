import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, ExternalLink, FileText, FolderOpen, Play, Video } from "lucide-react";

interface DemoMaterial {
  id: number;
  file_type: "video" | "pdf" | "ppt" | "word";
  filename: string;
  file_url: string;
  title?: string;
  description?: string;
  display_order?: number;
}

interface SharedDemo {
  demo: {
    id: number;
    title: string;
    description: string;
    status: string;
  };
  materials?: DemoMaterial[];
  files?: DemoMaterial[];
}

async function fetchSharedDemo(token: string) {
  const res = await fetch(`/api/demos/public/${token}`);
  if (!res.ok) throw new Error("Failed to fetch shared demo");
  return res.json();
}

const FILE_TYPE_META: Record<DemoMaterial["file_type"], { label: string; icon: typeof FileText; color: string }> = {
  video: { label: "Videos", icon: Video, color: "text-red-600" },
  pdf: { label: "PDF Documents", icon: FileText, color: "text-red-500" },
  ppt: { label: "Presentations", icon: FileText, color: "text-orange-600" },
  word: { label: "Word Documents", icon: FileText, color: "text-blue-600" },
};

function getFileTypeLabel(fileType: string) {
  return fileType.toUpperCase();
}

function getFolderIcon(fileType: DemoMaterial["file_type"]) {
  const Icon = FILE_TYPE_META[fileType].icon;
  return <Icon className={`h-5 w-5 ${FILE_TYPE_META[fileType].color}`} />;
}

function getPreviewType(fileType: DemoMaterial["file_type"]) {
  if (fileType === "video") return "video";
  if (fileType === "pdf") return "pdf";
  return "document";
}

export default function DemoPublicViewer() {
  const { token } = useParams<{ token: string }>();
  const [demoData, setDemoData] = useState<SharedDemo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<DemoMaterial | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid shareable link");
      setIsLoading(false);
      return;
    }

    fetchSharedDemo(token)
      .then((data) => {
        setDemoData(data);
        const linkedMaterials = data.materials || [];
        if (linkedMaterials.length > 0) {
          setSelectedMaterial(linkedMaterials[0]);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching demo:", err);
        setError("This shareable link is invalid or has expired");
        setIsLoading(false);
      });
  }, [token]);

  const materials = demoData?.materials || [];

  const groupedMaterials = useMemo(() => {
    const groups: Record<DemoMaterial["file_type"], DemoMaterial[]> = {
      video: [],
      pdf: [],
      ppt: [],
      word: [],
    };

    materials.forEach((material) => {
      if (groups[material.file_type]) {
        groups[material.file_type].push(material);
      }
    });

    return (Object.keys(FILE_TYPE_META) as DemoMaterial["file_type"][])
      .map((type) => ({ type, items: groups[type] }))
      .filter((group) => group.items.length > 0);
  }, [materials]);

  useEffect(() => {
    if (!selectedMaterial && materials.length > 0) {
      setSelectedMaterial(materials[0]);
      return;
    }

    if (selectedMaterial && materials.length > 0) {
      const stillExists = materials.some((material) => material.id === selectedMaterial.id);
      if (!stillExists) {
        setSelectedMaterial(materials[0]);
      }
    }
  }, [materials, selectedMaterial]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading demo...</p>
        </div>
      </div>
    );
  }

  if (error || !demoData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">{error || "Unable to access this demo"}</p>
            <p className="text-sm text-gray-500">
              The shareable link may have expired. Please contact the sender for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { demo } = demoData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 overflow-y-auto">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{demo.title}</h1>
              {demo.description && <p className="text-gray-600 mt-2">{demo.description}</p>}
            </div>
            <Badge className="bg-blue-100 text-blue-800">{demo.status}</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Attached Materials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {materials.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No materials attached to this demo</p>
              ) : (
                <Accordion type="multiple" defaultValue={groupedMaterials.map((group) => group.type)} className="w-full space-y-3">
                  {groupedMaterials.map((group) => {
                    const meta = FILE_TYPE_META[group.type];
                    return (
                      <AccordionItem key={group.type} value={group.type} className="border rounded-lg px-3 bg-gray-50">
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-3 text-left">
                            <FolderOpen className="h-5 w-5 text-blue-600" />
                            <div>
                              <p className="font-medium">{meta.label}</p>
                              <p className="text-xs text-gray-500">{group.items.length} file(s)</p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="ml-auto mr-2">
                            {group.items.length}
                          </Badge>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          <div className="space-y-2">
                            {group.items.map((material) => {
                              const isSelected = selectedMaterial?.id === material.id;
                              return (
                                <button
                                  key={material.id}
                                  type="button"
                                  onClick={() => setSelectedMaterial(material)}
                                  className={`w-full rounded-lg border p-3 text-left transition ${
                                    isSelected
                                      ? "border-blue-500 bg-blue-50 shadow-sm"
                                      : "border-gray-200 bg-white hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {getFolderIcon(material.file_type)}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="font-medium text-sm truncate">
                                          {material.title || "Untitled"}
                                        </p>
                                        <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                                          {getFileTypeLabel(material.file_type)}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1 truncate">
                                        {material.filename}
                                      </p>
                                      {material.description && (
                                        <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                                          {material.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {selectedMaterial ? (
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl">{selectedMaterial.title || "Selected Material"}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {FILE_TYPE_META[selectedMaterial.file_type].label} • {selectedMaterial.filename}
                      </p>
                    </div>
                    <Badge variant="outline">{selectedMaterial.file_type.toUpperCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 p-6 pb-12">
                  {selectedMaterial.file_type === "video" ? (
                    <div className="space-y-4">
                      <div className="bg-black rounded-lg overflow-hidden">
                        <video className="w-full max-h-[70vh]" controls autoPlay>
                          <source src={selectedMaterial.file_url} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    </div>
                  ) : selectedMaterial.file_type === "pdf" ? (
                    <div className="space-y-4">
                      <iframe
                        src={selectedMaterial.file_url}
                        title={selectedMaterial.title || selectedMaterial.filename}
                        className="w-full min-h-[120vh] rounded-lg border bg-white"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-white p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-blue-600" />
                          <div>
                            <p className="font-medium">Document Preview</p>
                            <p className="text-sm text-gray-500">
                              If the document does not render inline, use the open button below.
                            </p>
                          </div>
                        </div>
                      </div>
                      <iframe
                        src={selectedMaterial.file_url}
                        title={selectedMaterial.title || selectedMaterial.filename}
                        className="w-full min-h-[120vh] rounded-lg border bg-white"
                      />
                    </div>
                  )}

                  {selectedMaterial.description && (
                    <div className="pt-2">
                      <p className="text-sm text-gray-600">{selectedMaterial.description}</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      className="gap-2"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = selectedMaterial.file_url;
                        a.download = selectedMaterial.filename;
                        a.click();
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => window.open(selectedMaterial.file_url, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in new tab
                    </Button>
                    {getPreviewType(selectedMaterial.file_type) === "video" && (
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          const video = document.querySelector("video");
                          if (video) (video as HTMLVideoElement).play();
                        }}
                      >
                        <Play className="h-4 w-4" />
                        Play
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-10 pb-10 text-center text-gray-500">
                  <p>No file selected</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
