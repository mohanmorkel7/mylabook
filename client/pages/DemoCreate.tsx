import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { ChevronLeft, User, Mail, Phone, Building } from "lucide-react";

interface DemoFormData {
  title: string;
  description: string;
  demo_date: string;
  demo_time: string;
  location: string;
  lead_id: string;
}

async function fetchDemo(id: string) {
  const res = await fetch(`/api/demos/${id}`);
  if (!res.ok) throw new Error("Failed to fetch demo");
  return res.json();
}

async function createDemo(data: any) {
  const res = await fetch("/api/demos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create demo");
  return res.json();
}

async function updateDemo(id: string, data: any) {
  const res = await fetch(`/api/demos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update demo");
  return res.json();
}

async function fetchLeads() {
  const res = await fetch(`/api/lead-management?limit=1000`);
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

async function fetchLead(id: string) {
  const res = await fetch(`/api/lead-management/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

export default function DemoCreate() {
  const { id } = useParams<{ id?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEditing = !!id;

  // Get lead_id from URL params if creating new demo from lead dashboard
  const queryParams = new URLSearchParams(location.search);
  const leadIdFromQuery = queryParams.get("lead_id") || "";

  const [formData, setFormData] = useState<DemoFormData>({
    title: "",
    description: "",
    demo_date: "",
    demo_time: "",
    location: "",
    lead_id: leadIdFromQuery,
  });

  const { data: demoData } = useQuery({
    queryKey: ["demo", id],
    queryFn: () => fetchDemo(id!),
    enabled: isEditing,
  });

  const { data: leadsData = { leads: [] } } = useQuery({
    queryKey: ["leads"],
    queryFn: () => fetchLeads(),
  });

  const { data: selectedLeadData } = useQuery({
    queryKey: ["lead", formData.lead_id],
    queryFn: () => fetchLead(formData.lead_id),
    enabled: !!formData.lead_id,
  });

  useEffect(() => {
    if (demoData?.demo) {
      const demo = demoData.demo;
      const demoDateTime = demo.demo_date ? new Date(demo.demo_date) : null;
      setFormData({
        title: demo.title || "",
        description: demo.description || "",
        demo_date: demoDateTime
          ? demoDateTime.toISOString().split("T")[0]
          : "",
        demo_time: demoDateTime
          ? demoDateTime.toTimeString().slice(0, 5)
          : "",
        location: demo.location || "",
        lead_id: demo.lead_id || "",
      });
    }
  }, [demoData]);

  const mutation = useMutation({
    mutationFn: async () => {
      const demoDateTime = formData.demo_date
        ? `${formData.demo_date}T${formData.demo_time || "00:00"}`
        : null;

      const payload = {
        title: formData.title,
        description: formData.description,
        demo_date: demoDateTime,
        location: formData.location,
        lead_id: parseInt(formData.lead_id),
      };

      if (isEditing) {
        return await updateDemo(id!, payload);
      } else {
        return await createDemo(payload);
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["demos"] });
      toast({
        title: isEditing ? "Demo updated" : "Demo created",
      });
      navigate(`/demo-workshop/${data.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: isEditing ? "Failed to update demo" : "Failed to create demo",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof DemoFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.lead_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/demo-workshop")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isEditing ? "Edit Demo" : "Create New Demo"}
            </h1>
            <p className="text-gray-600 mt-1">
              {isEditing
                ? "Update demo details and schedule"
                : "Set up a new demo/workshop session"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Demo Information</CardTitle>
            <CardDescription>
              Fill in the details for this demo/workshop session
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title">Demo Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Product Demo for Acme Corp"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  className="mt-2"
                  required
                />
              </div>

              {/* Lead ID */}
              <div>
                <Label htmlFor="lead_id">Lead ID *</Label>
                <Select value={formData.lead_id} onValueChange={(value) => handleChange("lead_id", value)}>
                  <SelectTrigger id="lead_id" className="mt-2">
                    <SelectValue placeholder="Select a lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leadsData.leads && leadsData.leads.length > 0 ? (
                      leadsData.leads.map((lead: any) => (
                        <SelectItem key={lead.id} value={lead.id.toString()}>
                          {lead.company_name} - {lead.contact_name || "N/A"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        No leads available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected Lead Client Details */}
              {selectedLeadData && selectedLeadData.lead && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-lg">Selected Lead Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-start gap-3">
                        <Building className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-600">Company</p>
                          <p className="font-medium">{selectedLeadData.lead.company_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-600">Contact</p>
                          <p className="font-medium">{selectedLeadData.lead.contact_name || "N/A"}</p>
                        </div>
                      </div>
                      {selectedLeadData.lead.email && (
                        <div className="flex items-start gap-3">
                          <Mail className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-600">Email</p>
                            <p className="font-medium text-sm break-all">{selectedLeadData.lead.email}</p>
                          </div>
                        </div>
                      )}
                      {selectedLeadData.lead.phone && (
                        <div className="flex items-start gap-3">
                          <Phone className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-600">Phone</p>
                            <p className="font-medium">{selectedLeadData.lead.phone}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {selectedLeadData.lead.description && (
                      <div className="pt-2 border-t border-blue-200">
                        <p className="text-xs text-gray-600">Notes</p>
                        <p className="text-sm mt-1">{selectedLeadData.lead.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Description */}
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the demo/workshop agenda"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  className="mt-2 min-h-24"
                />
              </div>

              {/* Demo Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="demo_date">Demo Date</Label>
                  <Input
                    id="demo_date"
                    type="date"
                    value={formData.demo_date}
                    onChange={(e) => handleChange("demo_date", e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="demo_time">Demo Time</Label>
                  <Input
                    id="demo_time"
                    type="time"
                    value={formData.demo_time}
                    onChange={(e) => handleChange("demo_time", e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., Conference Room A, Zoom, Client Office"
                  value={formData.location}
                  onChange={(e) => handleChange("location", e.target.value)}
                  className="mt-2"
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/demo-workshop")}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  className="gap-2 flex-1"
                >
                  {mutation.isPending
                    ? isEditing
                      ? "Updating..."
                      : "Creating..."
                    : isEditing
                      ? "Update Demo"
                      : "Create Demo"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900">
              <strong>Next Step:</strong> After creating the demo, you'll be able to upload
              video files and record results from the demo detail page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
