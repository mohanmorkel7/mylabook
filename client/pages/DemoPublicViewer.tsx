import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Play, MessageCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface DemoFile {
  id: number;
  file_type: "video" | "pdf" | "ppt" | "word";
  filename: string;
  file_url: string;
  title?: string;
  description?: string;
}

interface SharedDemo {
  demo: {
    id: number;
    title: string;
    description: string;
    status: string;
  };
  files: DemoFile[];
}

async function fetchSharedDemo(token: string) {
  const res = await fetch(`/api/demos/public/${token}`);
  if (!res.ok) throw new Error("Failed to fetch shared demo");
  return res.json();
}

function getFileIcon(fileType: string) {
  switch (fileType) {
    case "video":
      return <Play className="h-6 w-6 text-red-600" />;
    case "pdf":
      return <FileText className="h-6 w-6 text-red-500" />;
    case "ppt":
      return <FileText className="h-6 w-6 text-orange-600" />;
    case "word":
      return <FileText className="h-6 w-6 text-blue-600" />;
    default:
      return <FileText className="h-6 w-6 text-gray-600" />;
  }
}

function getFileTypeLabel(fileType: string) {
  return fileType.toUpperCase();
}

export default function DemoPublicViewer() {
  const { token } = useParams<{ token: string }>();
  const [demoData, setDemoData] = useState<SharedDemo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DemoFile | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid shareable link");
      setIsLoading(false);
      return;
    }

    fetchSharedDemo(token)
      .then((data) => {
        setDemoData(data);
        if (data.files && data.files.length > 0) {
          setSelectedFile(data.files[0]);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching demo:", err);
        setError("This shareable link is invalid or has expired");
        setIsLoading(false);
      });
  }, [token]);

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

  const { demo, files } = demoData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{demo.title}</h1>
              {demo.description && (
                <p className="text-gray-600 mt-2">{demo.description}</p>
              )}
            </div>
            <Badge className="bg-blue-100 text-blue-800">{demo.status}</Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Files List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Demo Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {files.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No files available</p>
                ) : (
                  files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg transition ${
                        selectedFile?.id === file.id
                          ? "bg-blue-100 border-2 border-blue-500"
                          : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      <div className="mt-1">{getFileIcon(file.file_type)}</div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-sm">{file.title || "Untitled"}</p>
                        <p className="text-xs text-gray-500">
                          {getFileTypeLabel(file.file_type)}
                        </p>
                        {file.description && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {file.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Viewer */}
          <div className="lg:col-span-2">
            {selectedFile ? (
              <Card>
                <CardContent className="pt-6">
                  {selectedFile.file_type === "video" ? (
                    <div className="space-y-4">
                      <div className="bg-black rounded-lg overflow-hidden">
                        <video
                          width="100%"
                          height="auto"
                          controls
                          autoPlay
                          className="w-full"
                          controlsList="nodownload"
                        >
                          <source src={selectedFile.file_url} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                      {selectedFile.title && (
                        <div>
                          <h3 className="font-semibold text-lg">{selectedFile.title}</h3>
                          {selectedFile.description && (
                            <p className="text-gray-600 mt-2">{selectedFile.description}</p>
                          )}
                        </div>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = selectedFile.file_url;
                          a.download = selectedFile.filename;
                          a.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download Video
                      </Button>
                    </div>
                  ) : selectedFile.file_type === "pdf" ? (
                    <div className="space-y-4">
                      <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
                        <div className="text-center">
                          <FileText className="h-16 w-16 text-red-500 mx-auto mb-4" />
                          <p className="text-gray-600 mb-4">PDF Document</p>
                          <Button
                            onClick={() => {
                              window.open(selectedFile.file_url, "_blank");
                            }}
                            className="gap-2"
                          >
                            <Play className="h-4 w-4" />
                            View PDF
                          </Button>
                        </div>
                      </div>
                      {selectedFile.title && (
                        <div>
                          <h3 className="font-semibold text-lg">{selectedFile.title}</h3>
                          {selectedFile.description && (
                            <p className="text-gray-600 mt-2">{selectedFile.description}</p>
                          )}
                        </div>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = selectedFile.file_url;
                          a.download = selectedFile.filename;
                          a.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download PDF
                      </Button>
                    </div>
                  ) : selectedFile.file_type === "ppt" ? (
                    <div className="space-y-4">
                      <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
                        <div className="text-center">
                          <FileText className="h-16 w-16 text-orange-600 mx-auto mb-4" />
                          <p className="text-gray-600 mb-4">PowerPoint Presentation</p>
                          <Button
                            onClick={() => {
                              window.open(selectedFile.file_url, "_blank");
                            }}
                            className="gap-2"
                          >
                            <Play className="h-4 w-4" />
                            View Presentation
                          </Button>
                        </div>
                      </div>
                      {selectedFile.title && (
                        <div>
                          <h3 className="font-semibold text-lg">{selectedFile.title}</h3>
                          {selectedFile.description && (
                            <p className="text-gray-600 mt-2">{selectedFile.description}</p>
                          )}
                        </div>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = selectedFile.file_url;
                          a.download = selectedFile.filename;
                          a.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download PPT
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
                        <div className="text-center">
                          <FileText className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                          <p className="text-gray-600 mb-4">Word Document</p>
                          <Button
                            onClick={() => {
                              window.open(selectedFile.file_url, "_blank");
                            }}
                            className="gap-2"
                          >
                            <Play className="h-4 w-4" />
                            View Document
                          </Button>
                        </div>
                      </div>
                      {selectedFile.title && (
                        <div>
                          <h3 className="font-semibold text-lg">{selectedFile.title}</h3>
                          {selectedFile.description && (
                            <p className="text-gray-600 mt-2">{selectedFile.description}</p>
                          )}
                        </div>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = selectedFile.file_url;
                          a.download = selectedFile.filename;
                          a.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download Document
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  <p>No files to display</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
