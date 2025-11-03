import React, { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  useClient,
  useClientOnboardingSteps,
  useCreateOnboardingStep,
  useUpdateOnboardingStep,
  useDeleteOnboardingStep,
} from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  DollarSign,
  User,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Upload,
  MessageCircle,
  Plus,
  ChevronDown,
  ChevronRight,
  Download,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import { StepItem } from "@/components/StepItem";


// Mock follow-up data
const mockFollowUps = [
  {
    id: 1,
    description: "Follow up on missing tax documents",
    due_date: "2024-07-15",
    status: "overdue",
    assigned_to: "Jane Smith",
  },
  {
    id: 2,
    description: "Schedule follow-up call for contract review",
    due_date: "2024-07-10",
    status: "overdue",
    assigned_to: "Jane Smith",
  },
  {
    id: 3,
    description: "Send welcome packet",
    due_date: "2024-07-20",
    status: "pending",
    assigned_to: "Jane Smith",
  },
  {
    id: 4,
    description: "Confirm initial setup requirements",
    due_date: "2024-07-25",
    status: "upcoming",
    assigned_to: "Jane Smith",
  },
];

export default function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const clientId = parseInt(id || "0");

  const { data: client, isLoading, error } = useClient(clientId);
  const { data: onboardingSteps = [], isLoading: stepsLoading } =
    useClientOnboardingSteps(clientId);

  // Mutations
  const createStepMutation = useCreateOnboardingStep();
  const updateStepMutation = useUpdateOnboardingStep();
  const deleteStepMutation = useDeleteOnboardingStep();

  // UI State
  const [expandedSteps, setExpandedSteps] = useState<number[]>([]);
  const [newStepDialog, setNewStepDialog] = useState(false);
  const [newStep, setNewStep] = useState({
    name: "",
    description: "",
    estimated_days: 1,
    due_date: "",
  });

  const handleBack = () => {
    navigate("/clients");
  };

  const handleEdit = () => {
    const inClients = location.pathname.startsWith("/clients");
    const base = inClients ? "/clients" : "/sales/client";
    navigate(`${base}/${id}/edit`);
  };

  const handleAddFollowUp = () => {
    navigate(`/sales/client/${id}/followup/new`);
  };

  const updateStepStatus = async (stepId: number, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === "completed") {
        updateData.completed_date = new Date().toISOString().split("T")[0];
      }
      await updateStepMutation.mutateAsync({ stepId, stepData: updateData });
    } catch (error) {
      console.error("Failed to update step status:", error);
    }
  };

  const toggleStepExpansion = (stepId: number) => {
    setExpandedSteps((prev) =>
      prev.includes(stepId)
        ? prev.filter((id) => id !== stepId)
        : [...prev, stepId],
    );
  };

  const handleAddStep = async () => {
    if (newStep.name.trim() && newStep.description.trim()) {
      try {
        await createStepMutation.mutateAsync({
          clientId,
          stepData: newStep,
        });
        setNewStep({
          name: "",
          description: "",
          estimated_days: 1,
          due_date: "",
        });
        setNewStepDialog(false);
      } catch (error) {
        console.error("Failed to create step:", error);
      }
    }
  };

  const handleDeleteStep = async (stepId: number) => {
    try {
      await deleteStepMutation.mutateAsync(stepId);
    } catch (error) {
      console.error("Failed to delete step:", error);
    }
  };

  const handleAddComment = async (stepId: number) => {
    const comment = newComment[stepId]?.trim();
    if (!comment || !user) return;

    try {
      await createCommentMutation.mutateAsync({
        stepId,
        commentData: {
          message: comment,
          user_name: `${user.first_name} ${user.last_name}`,
          user_id: parseInt(user.id),
          comment_type: "note",
        },
      });
      setNewComment((prev) => ({ ...prev, [stepId]: "" }));
    } catch (error) {
      console.error("Failed to add comment:", error);
    }
  };

  const handleFileUpload = async (
    stepId: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    const file = files[0];

    try {
      // In a real implementation, you'd upload the file to a server/cloud storage
      // For now, we'll simulate the file upload
      const documentData = {
        name: file.name,
        file_path: `/uploads/${file.name}`,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: `${user.first_name} ${user.last_name}`,
      };

      await uploadDocumentMutation.mutateAsync({ stepId, documentData });

      // Reset input
      event.target.value = "";
    } catch (error) {
      console.error("Failed to upload document:", error);
    }
  };

  if (isLoading || stepsLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading client details...</div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-6">
        <div className="text-center text-red-600">
          Error loading client details
        </div>
      </div>
    );
  }

  const clientData = client as any;
  const meta = (() => {
    if (!clientData?.notes) return {} as any;
    try {
      const obj = JSON.parse(clientData.notes);
      return obj && typeof obj === "object" ? obj : ({} as any);
    } catch {
      return {} as any;
    }
  })();
  const primaryContact = Array.isArray((meta as any).contacts)
    ? (meta as any).contacts[0]
    : undefined;
  const phoneDisplay = primaryContact?.phone
    ? `${primaryContact.phone_prefix || ""} ${primaryContact.phone}`
    : clientData.phone || "Not provided";
  const telHref = primaryContact?.phone
    ? `tel:${primaryContact.phone_prefix || ""}${primaryContact.phone}`.replace(
        /\s+/g,
        "",
      )
    : clientData.phone
      ? `tel:${String(clientData.phone).replace(/\s+/g, "")}`
      : "";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Clients
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {clientData.client_name}
            </h1>
            <p className="text-gray-600 mt-1">Client Overview</p>
          </div>
        </div>
        <div className="flex space-x-3">
          <Button onClick={handleEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Client
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column - Client Information */}
        <div className="lg:col-span-3 space-y-6">


          {/* Client Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Client Overview</CardTitle>
              <CardDescription>
                Basic client information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-600">
                    Client Name:
                  </span>
                  <span className="text-gray-900">
                    {clientData.client_name}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-600">
                    Contact Person:
                  </span>
                  <span className="text-gray-900">
                    {clientData.contact_person}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-600">Email:</span>
                  <a
                    href={`mailto:${clientData.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {clientData.email}
                  </a>
                </div>
                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-600">Phone:</span>
                  <span className="text-gray-900">{phoneDisplay}</span>
                </div>
                {clientData.industry && (
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">Industry:</span>
                    <span className="text-gray-900">{clientData.industry}</span>
                  </div>
                )}
                {clientData.company_size && (
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">
                      Company Size:
                    </span>
                    <span className="text-gray-900">
                      {clientData.company_size}
                    </span>
                  </div>
                )}
                {clientData.expected_value !== undefined &&
                  clientData.expected_value !== null && (
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-600">
                        Expected Value:
                      </span>
                      <span className="text-gray-900">{`$${Number(clientData.expected_value).toLocaleString()}`}</span>
                    </div>
                  )}
                {clientData.start_date && (
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-600">
                      Start Date:
                    </span>
                    <span className="text-gray-900">
                      {new Date(clientData.start_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">Source:</span>
                    <span className="text-gray-900">{meta.source || "-"}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">
                      Source Info:
                    </span>
                    <span className="text-gray-900">
                      {meta.source_value || "-"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">
                      Client Type:
                    </span>
                    <span className="text-gray-900">
                      {meta.client_type || "-"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">
                      Geography:
                    </span>
                    <span className="text-gray-900">
                      {meta.geography || "-"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">
                      Txn Volume:
                    </span>
                    <span className="text-gray-900">
                      {meta.txn_volume || "-"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">
                      Product Tags:
                    </span>
                    <span className="text-gray-900">
                      {meta.product_tag_info || "-"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-600">Website:</span>
                    {clientData.website || meta.website ? (
                      <a
                        className="text-blue-600 hover:underline"
                        href={clientData.website || meta.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {clientData.website || meta.website}
                      </a>
                    ) : (
                      <span className="text-gray-900">-</span>
                    )}
                  </div>
                </div>
              </div>

              {Array.isArray(meta.payment_offerings) &&
                meta.payment_offerings.length > 0 && (
                  <div className="mt-4">
                    <div className="font-medium text-gray-600 mb-2">
                      Payment Offerings:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {meta.payment_offerings.map((p: string) => (
                        <Badge key={p} variant="secondary">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              {clientData.address && (
                <>
                  <Separator className="mt-4" />
                  <div className="mt-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-600">
                        Address:
                      </span>
                    </div>
                    <div className="pl-6 text-gray-900">
                      <div>{clientData.address}</div>
                      <div>
                        {clientData.city}
                        {clientData.state ? `, ${clientData.state}` : ""}{" "}
                        {clientData.zip_code || ""}
                      </div>
                      <div>{clientData.country}</div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {false && (
            <Card>
              <CardHeader>
                <CardTitle>Follow-up Tracker</CardTitle>
                <CardDescription>Manage client follow-up tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockFollowUps.map((followUp) => (
                    <div key={followUp.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {followUp.description}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Due:{" "}
                            {new Date(followUp.due_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          className={
                            followUp.status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : followUp.status === "pending"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-blue-100 text-blue-700"
                          }
                        >
                          {followUp.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          Assigned to: {followUp.assigned_to}
                        </p>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() =>
                  (window.location.href = `mailto:${clientData.email}`)
                }
              >
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => telHref && (window.location.href = telHref)}
                disabled={!telHref}
              >
                <Phone className="w-4 h-4 mr-2" />
                Call Phone
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
