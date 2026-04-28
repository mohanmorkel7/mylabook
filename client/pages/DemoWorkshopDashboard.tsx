import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Play,
  Trash2,
  Edit,
  Eye,
  Search,
  Calendar,
  Users,
  Video,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Demo {
  id: number;
  lead_id: number;
  title: string;
  description?: string;
  status: "Draft" | "Scheduled" | "In Progress" | "Completed" | "Cancelled";
  demo_date?: string;
  location?: string;
  attendees?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-800",
  Scheduled: "bg-blue-100 text-blue-800",
  "In Progress": "bg-yellow-100 text-yellow-800",
  Completed: "bg-green-100 text-green-800",
  Cancelled: "bg-red-100 text-red-800",
};

async function fetchDemos(leadId?: string) {
  const params = new URLSearchParams();
  if (leadId) params.append("lead_id", leadId);
  const res = await fetch(`/api/demos?${params}`);
  if (!res.ok) throw new Error("Failed to fetch demos");
  return res.json();
}

async function deleteDemo(id: number) {
  const res = await fetch(`/api/demos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete demo");
  return res.json();
}

export default function DemoWorkshopDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const { data: demoData = { demos: [] }, isLoading } = useQuery({
    queryKey: ["demos", filterStatus],
    queryFn: () => fetchDemos(),
  });

  const filteredDemos = demoData.demos.filter((demo: Demo) => {
    const matchesSearch =
      demo.title.toLowerCase().includes(search.toLowerCase()) ||
      demo.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || demo.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this demo?")) return;
    try {
      await deleteDemo(id);
      qc.invalidateQueries({ queryKey: ["demos"] });
      toast({ title: "Demo deleted successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete demo",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Demo/Workshop</h1>
            <p className="text-gray-600 mt-1">Manage and schedule product demonstrations</p>
          </div>
          <Button onClick={() => navigate("/demo-workshop/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Demo
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {demoData.demos.length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Total Demos</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">
                {demoData.demos.filter((d: Demo) => d.status === "Scheduled").length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Scheduled</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {demoData.demos.filter((d: Demo) => d.status === "Completed").length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Completed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">
                {demoData.demos.filter((d: Demo) => d.status === "Draft").length}
              </div>
              <p className="text-sm text-gray-600 mt-1">Draft</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search demos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Demos List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading demos...</div>
      ) : filteredDemos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No demos found</div>
      ) : (
        <div className="space-y-3">
          {filteredDemos.map((demo: Demo) => (
            <Card
              key={demo.id}
              className="p-5 hover:shadow-lg transition cursor-pointer border-l-4 border-l-gray-200 hover:border-l-blue-500"
              onClick={() => navigate(`/demo-workshop/${demo.id}`)}
            >
              <div className="flex items-start justify-between">
                {/* Main Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-semibold text-lg">{demo.title}</h3>
                    <Badge className={`${STATUS_COLORS[demo.status]} font-semibold`}>
                      {demo.status}
                    </Badge>
                  </div>

                  {demo.description && (
                    <p className="text-sm text-gray-600 mb-3">{demo.description}</p>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {demo.demo_date && (
                      <div className="flex items-center gap-1 text-gray-600">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(demo.demo_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {demo.location && (
                      <div className="text-gray-600">📍 {demo.location}</div>
                    )}
                    {demo.attendees && (
                      <div className="flex items-center gap-1 text-gray-600">
                        <Users className="h-3 w-3" />
                        <span>{JSON.parse(demo.attendees || "[]").length} attendees</span>
                      </div>
                    )}
                    <div className="text-gray-400">ID: {demo.id}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/demo-workshop/${demo.id}`);
                    }}
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/demo-workshop/${demo.id}/edit`);
                    }}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(demo.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
