import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  open: "Open",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  delayed: "Delayed",
  archived: "Archived",
  created: "Created",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};
function formatStatusLabel(s?: string) {
  if (!s) return "";
  return (
    STATUS_LABELS[s] ||
    s.replace(/_/g, " ").replace(/(^|\s)\S/g, (t) => t.toUpperCase())
  );
}
import { useAuth } from "@/lib/auth-context";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  ArrowRight,
  CheckCircle,
  Clock,
  Users,
  FileText,
  MessageSquare,
  Target,
  Calendar,
  DollarSign,
  Package,
  Rocket,
  Edit,
  Eye,
  Trash2,
  ArrowUp,
  ArrowDown,
  PlayCircle,
  PauseCircle,
  AlertTriangle,
  Upload,
  Paperclip,
  Send,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Move,
} from "lucide-react";
import { format } from "date-fns";
import { DraggableProjectStepsList } from "@/components/DraggableProjectStepsList";
import { AddStepModal } from "@/components/AddStepModal";
import { LeadOverviewModal } from "@/components/LeadOverviewModal";
import { StepsPreviewModal } from "@/components/StepsPreviewModal";

interface ProjectStep {
  id?: number;
  step_name: string;
  step_description: string;
  step_order: number;
  status: "pending" | "in_progress" | "completed" | "blocked";
  assigned_to?: number;
  estimated_hours?: number;
  due_date?: string;
  probability_percent?: number;
}

interface CreateProjectFromLeadDialogProps {
  lead?: any;
  project?: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateProjectFromLeadDialog({
  lead,
  project,
  isOpen,
  onClose,
  onSuccess,
}: CreateProjectFromLeadDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const formatToDateInput = (d: any) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const [projectData, setProjectData] = useState<any>(() => ({
    name: lead
      ? `${lead.client_name} - ${lead.project_title}`
      : project?.name || "",
    description: lead
      ? `Product development project for ${lead.client_name}`
      : project?.description || "",
    assigned_team: project?.assigned_team || "Product Team",
    project_manager_id: project?.project_manager_id
      ? String(project.project_manager_id)
      : "",
    target_completion_date: project?.target_completion_date
      ? formatToDateInput(project.target_completion_date)
      : "",
    estimated_hours: project?.estimated_hours
      ? String(project.estimated_hours)
      : "",
    template_id: project?.template_id ? String(project.template_id) : "",
  }));

  const [steps, setSteps] = useState<ProjectStep[]>(() => {
    if (project?.steps && Array.isArray(project.steps)) {
      return project.steps.map((s: any, i: number) => ({
        id: s.id,
        step_name: s.step_name || s.name,
        step_description: s.step_description || s.description || "",
        step_order: s.step_order ?? i + 1,
        status: s.status || "pending",
        probability_percent:
          parseFloat(s.probability_percent ?? s.probability ?? 0) || 0,
        estimated_hours: s.estimated_hours,
        due_date:
          s.due_date || s.dueDate || s.eta
            ? formatToDateInput(s.due_date || s.dueDate || s.eta)
            : "",
      }));
    }
    return [];
  });
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateChangedByUser, setTemplateChangedByUser] = useState(false);

  // Fetch available templates
  const { data: allTemplates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiClient.getTemplates(),
    enabled: isOpen,
  });

  // Filter templates to only show those with category_id === 1 (Product category)
  const templates = allTemplates.filter((template: any) => {
    // Template might have category_id as number or string; support both
    const cid =
      template.category_id ??
      template.categoryId ??
      (template.category &&
        (typeof template.category === "object"
          ? template.category.id
          : undefined));
    return Number(cid) === 1;
  });

  // Ensure the currently selected template (possibly fetched directly) is included
  // in the dropdown options even if it's not part of the filtered templates list.
  const availableTemplates = (() => {
    if (!selectedTemplate) return templates;
    const exists = templates.find(
      (t: any) => String(t.id) === String(selectedTemplate.id),
    );
    if (exists) return templates;
    return [selectedTemplate, ...templates];
  })();

  // Fetch template steps when template is selected
  const { data: templateSteps = [] } = useQuery({
    queryKey: ["template-steps", selectedTemplate?.id],
    queryFn: () =>
      selectedTemplate ? apiClient.getTemplate(selectedTemplate.id) : null,
    enabled: !!selectedTemplate?.id,
  });

  // Fetch users for Project Manager dropdown
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiClient.getUsers(),
    enabled: isOpen,
  });

  const projectManagers = users.map((u: any) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
  }));
  const [pmQuery, setPmQuery] = useState("");
  const filteredPMs = projectManagers.filter(
    (pm: any) =>
      (pm.name || "").toLowerCase().includes(pmQuery.toLowerCase()) ||
      (pm.email || "").toLowerCase().includes(pmQuery.toLowerCase()),
  );

  // If editing an existing project, sync internal state when project prop changes
  useEffect(() => {
    if (!project) return;
    setProjectData({
      name: project.name || "",
      description: project.description || "",
      assigned_team: project.assigned_team || "Product Team",
      project_manager_id: project.project_manager_id
        ? String(project.project_manager_id)
        : "",
      target_completion_date: project.target_completion_date
        ? formatToDateInput(project.target_completion_date)
        : "",
      estimated_hours: project.estimated_hours
        ? String(project.estimated_hours)
        : "",
      template_id: project.template_id ? String(project.template_id) : "",
    });

    if (Array.isArray(project.steps) && project.steps.length > 0) {
      setSteps(
        project.steps.map((s: any, i: number) => ({
          id: s.id,
          step_name: s.step_name || s.name,
          step_description: s.step_description || s.description || "",
          step_order: s.step_order ?? i + 1,
          status: s.status || "pending",
          probability_percent:
            parseFloat(s.probability_percent ?? s.probability ?? 0) || 0,
          estimated_hours: s.estimated_hours,
          due_date:
            s.due_date || s.dueDate || s.eta
              ? formatToDateInput(s.due_date || s.dueDate || s.eta)
              : "",
        })),
      );
    }
  }, [project]);

  // If templates are loaded and a project has template_id, set selectedTemplate
  useEffect(() => {
    if (project && project.template_id && templates.length > 0) {
      const t = templates.find(
        (tt: any) => String(tt.id) === String(project.template_id),
      );
      if (t) {
        setSelectedTemplate(t);
      } else {
        // Try fetching the template directly in case it's not part of filtered templates
        (async () => {
          try {
            const tpl = await apiClient.getTemplate(project.template_id);
            if (tpl) {
              setSelectedTemplate(tpl);
              setProjectData((prev: any) => ({
                ...prev,
                template_id: String(project.template_id),
              }));
            }
          } catch (e) {
            // ignore - template may not exist or user doesn't have access
            console.debug("Could not fetch template for project:", e);
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length, project?.id]);

  // Reset dialog internal state when opening as a fresh create (no project provided)
  useEffect(() => {
    if (!isOpen) return;
    if (!project) {
      // Reset form to defaults based on lead if present, otherwise blank
      setProjectData({
        name: lead ? `${lead.client_name} - ${lead.project_title}` : "",
        description: lead
          ? `Product development project for ${lead.client_name}`
          : "",
        assigned_team: "Product Team",
        project_manager_id: "",
        target_completion_date: "",
        estimated_hours: "",
        template_id: "",
      });

      if (selectedTemplate) {
        // if a template is preselected, apply its steps
        setSteps(
          (selectedTemplate.steps || []).map((s: any, i: number) => ({
            step_name: s.name,
            step_description: s.description,
            step_order: s.step_order || i + 1,
            status: "pending",
            estimated_hours: s.default_eta_days
              ? s.default_eta_days * 8
              : undefined,
            probability_percent: parseFloat(s.probability_percent ?? 0) || 0,
            due_date: "",
          })),
        );
      } else {
        setSteps([
          {
            step_name: "Build base using platform",
            step_description:
              "Create the foundational architecture using our existing platform components and review lead requirements",
            step_order: 1,
            status: "pending",
            estimated_hours: 40,
            probability_percent: 0,
          },
          {
            step_name: "Follow-up with development team",
            step_description:
              "Coordinate with development team and assign specific tasks with tracking and milestone planning",
            step_order: 2,
            status: "pending",
            estimated_hours: 20,
            probability_percent: 0,
          },
        ]);
      }

      setSelectedTemplate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Update steps when template changes
  useEffect(() => {
    // Only auto-apply template steps when creating a new project or when user explicitly changed the template
    if (
      templateSteps?.steps &&
      templateSteps.steps.length > 0 &&
      (templateChangedByUser || !project)
    ) {
      const convertedSteps = templateSteps.steps.map(
        (step: any, index: number) => ({
          step_name: step.name,
          step_description: step.description,
          step_order: step.step_order || index + 1,
          status: "pending" as const,
          estimated_hours: step.default_eta_days
            ? step.default_eta_days * 8
            : undefined,
          probability_percent: parseFloat(step.probability_percent ?? 0) || 0,
        }),
      );
      setSteps(convertedSteps);
      // reset the flag after applying
      if (templateChangedByUser) setTemplateChangedByUser(false);
    } else if (selectedTemplate === null && !project) {
      // Default steps when no template selected and creating a new project
      setSteps([
        {
          step_name: "Build base using platform",
          step_description:
            "Create the foundational architecture using our existing platform components and review lead requirements",
          step_order: 1,
          status: "pending",
          estimated_hours: 40,
          probability_percent: 0,
        },
        {
          step_name: "Follow-up with development team",
          step_description:
            "Coordinate with development team and assign specific tasks with tracking and milestone planning",
          step_order: 2,
          status: "pending",
          estimated_hours: 20,
          probability_percent: 0,
        },
      ]);
    }
  }, [templateSteps?.steps?.length, selectedTemplate?.id]);

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === "none") {
      setSelectedTemplate(null);
      setProjectData((prev) => ({ ...prev, template_id: "" }));
      setTemplateChangedByUser(true);
    } else {
      const template = templates.find(
        (t: any) => t.id.toString() === templateId,
      );
      setSelectedTemplate(template);
      setProjectData((prev) => ({ ...prev, template_id: templateId }));
      setTemplateChangedByUser(true);
    }
  };

  const teams = [
    "Product Team",
    "Frontend Team",
    "Backend Team",
    "DevOps Team",
    "Full Stack Team",
  ];
  // projectManagers are provided by users query (see above)
  // const projectManagers will be derived from users when dialog opens

  const createProjectMutation = useMutation({
    mutationFn: (data: any) => {
      if (project && project.id) {
        // Update existing project
        return apiClient.request(`/workflow/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
      }
      return lead && lead.id
        ? apiClient.createProjectFromLead(lead.id, data)
        : apiClient.createWorkflowProject(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["workflow-projects"] });
      queryClient.invalidateQueries({ queryKey: ["completed-leads"] });
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const submitData: any = {
      ...projectData,
      project_type: "product_development",
      project_manager_id: projectData.project_manager_id
        ? parseInt(projectData.project_manager_id)
        : undefined,
      estimated_hours: projectData.estimated_hours
        ? parseInt(projectData.estimated_hours)
        : undefined,
      template_id: projectData.template_id
        ? parseInt(projectData.template_id)
        : undefined,
      created_by: parseInt(user?.id || "1"),
      steps: steps,
    };

    // If editing, do not send created_by for updates
    if (project && project.id) {
      delete submitData.created_by;
    }

    createProjectMutation.mutate(submitData);
  };

  const addStep = () => {
    const newStep: ProjectStep = {
      step_name: "",
      step_description: "",
      step_order: steps.length + 1,
      status: "pending",
      probability_percent: 0,
    };
    setSteps([...steps, newStep]);
  };

  const updateStep = (index: number, field: keyof ProjectStep, value: any) => {
    const updatedSteps = [...steps];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    setSteps(updatedSteps);
  };

  const removeStep = (index: number) => {
    const updatedSteps = steps.filter((_, i) => i !== index);
    // Reorder remaining steps
    updatedSteps.forEach((step, i) => {
      step.step_order = i + 1;
    });
    setSteps(updatedSteps);
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === steps.length - 1)
    ) {
      return;
    }

    const newSteps = [...steps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    [newSteps[index], newSteps[targetIndex]] = [
      newSteps[targetIndex],
      newSteps[index],
    ];

    // Update step orders
    newSteps.forEach((step, i) => {
      step.step_order = i + 1;
    });

    setSteps(newSteps);
  };

  // Allow creating project even when not started from a lead (lead may be null)

  const totalProbability = steps.reduce(
    (sum, s) => sum + (Number(s.probability_percent) || 0),
    0,
  );
  const probabilityInvalid = totalProbability > 0 && totalProbability !== 100;

  // Format total probability for display (avoid odd concatenation or locale issues)
  const formattedTotalProbability = (() => {
    const v = Number(totalProbability) || 0;
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2);
  })();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {project && project.id
              ? "Edit Product Project"
              : lead
                ? "Create Product Project from Lead"
                : "Create Product Project"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Lead Information Summary */}
          {lead ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lead Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Client:</strong> {lead.client_name}
                  </div>
                  <div>
                    <strong>Project:</strong> {lead.project_title}
                  </div>
                  <div>
                    <strong>Completed:</strong>{" "}
                    {lead.completion_date &&
                      format(new Date(lead.completion_date), "MMM d, yyyy")}
                  </div>
                  <div>
                    <strong>Lead Steps:</strong> {lead.completed_steps}/
                    {lead.total_steps}
                  </div>
                </div>
                <div className="mt-2">
                  <strong>Description:</strong>
                  <p className="text-gray-600">{lead.project_description}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lead Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600">
                  No lead selected. You can proceed to create a project without
                  a lead or select a completed lead from the list.
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={projectData.name}
                    onChange={(e) =>
                      setProjectData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="assigned_team">Assigned Team *</Label>
                  <Select
                    value={projectData.assigned_team}
                    onValueChange={(value) =>
                      setProjectData((prev) => ({
                        ...prev,
                        assigned_team: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team} value={team}>
                          {team}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Project Description</Label>
                <Textarea
                  id="description"
                  value={projectData.description}
                  onChange={(e) =>
                    setProjectData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="template">Project Template</Label>
                <Select
                  value={projectData.template_id || "none"}
                  onValueChange={handleTemplateSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      Manual Steps (Create Custom)
                    </SelectItem>
                    {availableTemplates.length > 0 ? (
                      availableTemplates.map((template: any) => (
                        <SelectItem
                          key={template.id}
                          value={template.id.toString()}
                        >
                          {template.name}
                          {template.description && (
                            <span className="text-sm text-gray-500 block">
                              {template.description}
                            </span>
                          )}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="loading" disabled>
                        {allTemplates.length === 0
                          ? "Loading templates..."
                          : "No product templates available"}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-900">
                      {selectedTemplate.name}
                    </div>
                    {selectedTemplate.description && (
                      <div className="text-sm text-blue-700 mt-1">
                        {selectedTemplate.description}
                      </div>
                    )}
                    <div className="text-xs text-blue-600 mt-1">
                      This will load {templateSteps?.steps?.length || 0}{" "}
                      pre-defined steps
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="project_manager">Project Manager</Label>
                  <Select
                    value={projectData.project_manager_id}
                    onValueChange={(value) =>
                      setProjectData((prev) => ({
                        ...prev,
                        project_manager_id: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select PM" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="Search users..."
                          value={pmQuery}
                          onChange={(e) => setPmQuery(e.target.value)}
                          className="mb-2"
                        />
                      </div>
                      {filteredPMs.length > 0 ? (
                        filteredPMs.map((pm) => (
                          <SelectItem key={pm.id} value={pm.id.toString()}>
                            <div className="flex flex-col">
                              <span>{pm.name}</span>
                              <span className="text-xs text-gray-500">
                                {pm.email}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          No users found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="target_completion_date">
                    Target Completion Date
                  </Label>
                  <Input
                    id="target_completion_date"
                    type="date"
                    value={projectData.target_completion_date}
                    onChange={(e) =>
                      setProjectData((prev) => ({
                        ...prev,
                        target_completion_date: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="estimated_hours">Estimated Hours</Label>
                  <Input
                    id="estimated_hours"
                    type="number"
                    value={projectData.estimated_hours}
                    onChange={(e) =>
                      setProjectData((prev) => ({
                        ...prev,
                        estimated_hours: e.target.value,
                      }))
                    }
                    placeholder="Total project hours"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Project Steps */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Project Steps</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">
                    Total Probability:{" "}
                    <span className="font-medium text-gray-900">
                      {formattedTotalProbability}%
                    </span>
                    {probabilityInvalid && (
                      <span className="ml-3 text-sm text-red-600">
                        Total must equal 100%
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addStep}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Step
                  </Button>
                </div>
              </div>
              <CardDescription>
                Define the specific steps for this product development project
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {steps.map((step, index) => (
                <Card key={index} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Step {step.step_order}</Badge>
                        <div className="text-sm text-gray-600">
                          {step.probability_percent ?? 0}%
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => moveStep(index, "up")}
                          disabled={index === 0}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => moveStep(index, "down")}
                          disabled={index === steps.length - 1}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStep(index)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label>Step Name *</Label>
                        <Input
                          value={step.step_name}
                          onChange={(e) =>
                            updateStep(index, "step_name", e.target.value)
                          }
                          placeholder="Enter step name"
                          required
                        />
                      </div>

                      <div>
                        <Label>Description</Label>
                        <Textarea
                          value={step.step_description}
                          onChange={(e) =>
                            updateStep(
                              index,
                              "step_description",
                              e.target.value,
                            )
                          }
                          placeholder="Describe what needs to be done in this step"
                          rows={2}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label>Estimated Hours</Label>
                          <Input
                            type="number"
                            value={step.estimated_hours || ""}
                            onChange={(e) =>
                              updateStep(
                                index,
                                "estimated_hours",
                                e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              )
                            }
                            placeholder="Hours"
                          />
                        </div>
                        <div>
                          <Label>Due Date</Label>
                          <Input
                            type="date"
                            value={step.due_date || ""}
                            onChange={(e) =>
                              updateStep(index, "due_date", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <Label>Probability (%)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={String(step.probability_percent ?? 0)}
                            onChange={(e) =>
                              updateStep(
                                index,
                                "probability_percent",
                                e.target.value ? parseFloat(e.target.value) : 0,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {steps.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Target className="w-12 h-12 mx-auto mb-2" />
                  <p>
                    No steps defined yet. Add steps to structure your project.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !projectData.name.trim() ||
                steps.length === 0 ||
                createProjectMutation.isPending ||
                probabilityInvalid
              }
            >
              <Rocket className="w-4 h-4 mr-2" />
              {createProjectMutation.isPending
                ? project && project.id
                  ? "Updating..."
                  : "Creating..."
                : project && project.id
                  ? "Update Project"
                  : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductWorkflow() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
  const [isLeadDetailOpen, setIsLeadDetailOpen] = useState(false);
  const [selectedLeadForOverview, setSelectedLeadForOverview] =
    useState<any>(null);
  const [isLeadOverviewOpen, setIsLeadOverviewOpen] = useState(false);
  const [selectedLeadForSteps, setSelectedLeadForSteps] = useState<any>(null);
  const [isStepsPreviewOpen, setIsStepsPreviewOpen] = useState(false);
  const location = useLocation();
  const routeParams = useParams();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Prefer query param `id`, fallback to route param `id` (for /products/:id/edit)
    const pid = params.get("id") || (routeParams as any)?.id;
    if (!pid) return;
    const loadProject = async () => {
      try {
        const proj = await apiClient.getWorkflowProject(pid);
        setSelectedProject(proj);

        // Try to fetch a linked product record to obtain template and step probabilities
        try {
          const product = await apiClient.request(`/products/${proj.id}`);
          if (product) {
            // copy template if available
            if (product.template_id) {
              proj.template_id = product.template_id;
            }

            // If product has steps with probabilities, merge into proj.steps by step_order or name
            if (
              Array.isArray(product.steps) &&
              product.steps.length > 0 &&
              Array.isArray(proj.steps)
            ) {
              const psByOrder: any = {};
              product.steps.forEach((s: any) => {
                if (s.step_order !== undefined && s.step_order !== null)
                  psByOrder[s.step_order] = s;
              });

              proj.steps = proj.steps.map((s: any, i: number) => {
                const byOrder = psByOrder[s.step_order];
                const byName = product.steps.find(
                  (ps: any) =>
                    (ps.name || ps.step_name) === (s.step_name || s.name),
                );
                const source = byOrder || byName;
                if (source) {
                  return {
                    ...s,
                    probability_percent:
                      parseFloat(
                        source.probability_percent ??
                          source.probability ??
                          s.probability_percent ??
                          0,
                      ) || 0,
                    due_date:
                      s.due_date || source.eta || source.due_date || s.due_date,
                  };
                }
                return s;
              });
            }
          }
        } catch (prodErr) {
          // ignore - product fallback may not exist
          console.debug(
            "No linked product or failed to fetch product for project",
            pid,
            prodErr,
          );
        }

        // Open create dialog in edit mode with enriched project
        setSelectedLead(null);
        setSelectedProject(proj);
        setIsCreateDialogOpen(true);
      } catch (err) {
        console.error("Failed to load project from query param:", err);
      }
    };
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, (routeParams as any)?.id]);

  // Handle project created callback (hoisted so modals can reference it safely)
  function handleProjectCreated() {
    setSelectedLead(null);
    setIsCreateDialogOpen(false);
  }

  // If current path is /products/:id/edit then render only the modals (so overview remains visible underneath)
  const isEditModalPath = Boolean(
    location.pathname.match(/^\/products\/[0-9]+\/edit$/),
  );

  if (isEditModalPath) {
    return (
      <>
        <CreateProjectFromLeadDialog
          lead={selectedLead}
          project={selectedProject}
          isOpen={isCreateDialogOpen}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setSelectedProject(null);
            if ((routeParams as any)?.id)
              navigate(`/products/${(routeParams as any).id}`);
          }}
          onSuccess={handleProjectCreated}
        />

        <ProjectDetailDialog
          project={selectedProject}
          isOpen={isProjectDetailOpen}
          onClose={() => setIsProjectDetailOpen(false)}
        />

        <LeadOverviewModal
          isOpen={isLeadOverviewOpen}
          onClose={() => {
            setIsLeadOverviewOpen(false);
            setSelectedLeadForOverview(null);
          }}
          lead={selectedLeadForOverview}
        />

        <StepsPreviewModal
          isOpen={isStepsPreviewOpen}
          onClose={() => {
            setIsStepsPreviewOpen(false);
            setSelectedLeadForSteps(null);
          }}
          lead={selectedLeadForSteps}
        />
      </>
    );
  }

  // Fetch project statistics
  const { data: projectStats } = useQuery({
    queryKey: ["workflow-project-stats"],
    queryFn: () =>
      apiClient.getWorkflowDashboard(
        parseInt(user?.id || "1"),
        user?.role || "admin",
      ),
  });

  // Fetch completed leads ready for project creation (only leads with status 'completed')
  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["completed-leads"],
    queryFn: () => apiClient.getCompletedLeads(),
  });

  // Filter to only show leads that are actually marked as completed
  const completedLeads = allLeads.filter(
    (lead: any) =>
      lead.status === "completed" || lead.lead_status === "completed",
  );

  // Fetch workflow projects for the product team
  const {
    data: projects = [],
    isLoading: projectsLoading,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ["workflow-projects", user?.id, user?.role],
    queryFn: () =>
      apiClient.getWorkflowProjects(parseInt(user?.id || "1"), user?.role),
    enabled: !!user,
    staleTime: 1000 * 60, // 1 min cache to avoid excessive refetches
  });

  // Ensure we refetch when the user navigates back to the product route
  useEffect(() => {
    try {
      const path = location.pathname || "";
      if (path === "/product" || path.startsWith("/product")) {
        // attempt a fresh fetch whenever this route becomes active
        refetchProjects();
      }
    } catch (e) {
      console.debug("Refetch projects effect error:", e);
    }
  }, [location.pathname, refetchProjects]);

  const handleCreateProject = (lead: any) => {
    setSelectedLead(lead);
    setIsCreateDialogOpen(true);
  };

  const handleViewLead = (lead: any) => {
    setSelectedLeadForOverview(lead);
    setIsLeadOverviewOpen(true);
  };

  const handleViewProject = (project: any) => {
    // Redirect to Product Overview page
    navigate(`/products/${project.id}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return CheckCircle;
      case "in_progress":
        return PlayCircle;
      case "on_hold":
        return PauseCircle;
      case "cancelled":
        return AlertTriangle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-100";
      case "in_progress":
        return "text-blue-600 bg-blue-100";
      case "on_hold":
        return "text-yellow-600 bg-yellow-100";
      case "cancelled":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Workflow</h1>
          <p className="text-gray-600 mt-1">
            Manage lead-to-product handoffs and project development
          </p>
        </div>
        <div>
          <Button
            onClick={() => {
              setSelectedLead(null);
              setIsCreateDialogOpen(true);
            }}
            className="btn btn-primary"
          >
            Create Project
          </Button>
        </div>
      </div>

      {/* Product Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Active Projects
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {
                    projects.filter((p: any) => p.status === "in_progress")
                      .length
                  }
                </p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100">
                <PlayCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Completed Projects
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {projects.filter((p: any) => p.status === "completed").length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-green-100">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Completed Leads
                </p>
                <p className="text-2xl font-bold text-purple-600">
                  {completedLeads.length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-purple-100">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Avg Progress
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {projects.length > 0
                    ? Math.round(
                        projects.reduce(
                          (acc: number, p: any) =>
                            acc +
                            (p.progress_percentage ??
                              p.progress ??
                              p.progress_percent ??
                              0),
                          0,
                        ) / projects.length,
                      )
                    : 0}
                  %
                </p>
              </div>
              <div className="p-3 rounded-lg bg-orange-100">
                <Package className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="completed-leads" className="space-y-6">
        <TabsList>
          <TabsTrigger value="completed-leads">Completed Leads</TabsTrigger>
          <TabsTrigger value="active-projects">Active Projects</TabsTrigger>
          <TabsTrigger value="project-pipeline">Project Pipeline</TabsTrigger>
        </TabsList>

        {/* Completed Leads Tab */}
        <TabsContent value="completed-leads" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Product list</CardTitle>
              <CardDescription>
                List of products and their key details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="text-center py-8">Loading products...</div>
              ) : projects.length > 0 ? (
                <div className="space-y-4">
                  {projects.map((project: any) => (
                    <Card
                      key={project.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleViewProject(project)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {project.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className={getStatusColor(project.status)}
                              >
                                {formatStatusLabel(project.status)}
                              </Badge>
                            </div>

                            <h4 className="font-medium text-gray-900 mb-2">
                              {project.description}
                            </h4>
                            <p className="text-gray-600 mb-3">
                              {project.source_type === "lead"
                                ? `From Lead #${project.source_id}`
                                : ""}
                            </p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="font-medium">Progress:</span>
                                <br />
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-blue-600 h-2 rounded-full"
                                      style={{
                                        width: `${project.progress_percentage || 0}%`,
                                      }}
                                    />
                                  </div>
                                  <span>
                                    {project.progress_percentage || 0}%
                                  </span>
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Lead Steps:</span>
                                <br />
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-green-600" />
                                  <span>
                                    {project.completed_steps || 0}/
                                    {project.total_steps || 0}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Status:</span>
                                <br />
                                <span className="text-sm text-gray-700">
                                  {project.status}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2 ml-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/product?id=${project.id}`);
                              }}
                              title="Edit"
                              className="p-2 rounded hover:bg-gray-100"
                            >
                              <Edit className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm("Delete this product?")) return;
                                try {
                                  await apiClient.request(
                                    `/workflow/projects/${project.id}`,
                                    { method: "DELETE" },
                                  );
                                  queryClient.invalidateQueries([
                                    "workflow-projects",
                                  ]);
                                } catch (err) {
                                  console.error(err);
                                  alert("Failed to delete product");
                                }
                              }}
                              title="Delete"
                              className="p-2 rounded hover:bg-gray-100"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Products
                  </h3>
                  <p className="text-gray-600 mb-4">
                    There are no products to show at the moment.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Projects Tab */}
        <TabsContent value="active-projects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Product Projects</CardTitle>
              <CardDescription>
                Projects currently in development from converted leads
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="text-center py-8">Loading projects...</div>
              ) : projects.length > 0 ? (
                <div className="space-y-4">
                  {projects
                    .filter(
                      (p: any) => p.project_type === "product_development",
                    )
                    .map((project: any) => {
                      const StatusIcon = getStatusIcon(project.status);

                      return (
                        <Card
                          key={project.id}
                          className="hover:shadow-md transition-shadow"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="font-semibold text-lg">
                                    {project.name}
                                  </h3>
                                  <Select
                                    value={project.status}
                                    onValueChange={(value) => {
                                      console.log(
                                        "Updating project status:",
                                        project.id,
                                        value,
                                      );
                                      // TODO: Implement API call to update project status
                                    }}
                                  >
                                    <SelectTrigger className="w-36 h-7 text-xs">
                                      <div className="flex items-center gap-1">
                                        <StatusIcon className="w-3 h-3" />
                                        <SelectValue />
                                      </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="created">
                                        Created
                                      </SelectItem>
                                      <SelectItem value="in_progress">
                                        In Progress
                                      </SelectItem>
                                      <SelectItem value="review">
                                        Review
                                      </SelectItem>
                                      <SelectItem value="completed">
                                        Completed
                                      </SelectItem>
                                      <SelectItem value="on_hold">
                                        On Hold
                                      </SelectItem>
                                      <SelectItem value="cancelled">
                                        Cancelled
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {project.source_type === "lead" && (
                                    <Badge variant="outline">
                                      From Lead #{project.source_id}
                                    </Badge>
                                  )}
                                </div>

                                <p className="text-gray-600 mb-3">
                                  {project.description}
                                </p>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="font-medium">
                                      Progress:
                                    </span>
                                    <br />
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 bg-gray-200 rounded-full h-2">
                                        <div
                                          className="bg-blue-600 h-2 rounded-full"
                                          style={{
                                            width: `${project.progress_percentage || 0}%`,
                                          }}
                                        />
                                      </div>
                                      <span>
                                        {project.progress_percentage || 0}%
                                      </span>
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium">Steps:</span>
                                    <br />
                                    {project.completed_steps || 0}/
                                    {project.total_steps || 0}
                                  </div>
                                  <div>
                                    <span className="font-medium">Team:</span>
                                    <br />
                                    {project.assigned_team}
                                  </div>
                                  <div>
                                    <span className="font-medium">
                                      Created:
                                    </span>
                                    <br />
                                    {format(
                                      new Date(project.created_at),
                                      "MMM d",
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 ml-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewProject(project)}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Project
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewProject(project)}
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Comments ({project.total_comments || 0})
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Rocket className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Active Projects
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Start by converting completed leads into product development
                    projects.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Project Pipeline Tab */}
        <TabsContent value="project-pipeline" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {["created", "in_progress", "review", "completed"].map((status) => {
              const statusProjects = projects.filter(
                (p: any) => p.status === status,
              );
              const StatusIcon = getStatusIcon(status);

              return (
                <Card key={status}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <StatusIcon className="w-4 h-4" />
                      {status.replace("_", " ").toUpperCase()}
                      <Badge variant="secondary" className="text-xs">
                        {statusProjects.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {statusProjects.map((project: any) => (
                      <Card
                        key={project.id}
                        className="p-3 hover:shadow-sm transition-shadow cursor-pointer"
                      >
                        <div className="space-y-2">
                          <div className="font-medium text-sm">
                            {project.name}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">
                              {project.assigned_team}
                            </span>
                            <span>{project.progress_percentage || 0}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1">
                            <div
                              className="bg-blue-600 h-1 rounded-full"
                              style={{
                                width: `${project.progress_percentage || 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                    {statusProjects.length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No projects
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / Edit Project Dialog */}
      <CreateProjectFromLeadDialog
        lead={selectedLead}
        project={selectedProject}
        isOpen={isCreateDialogOpen}
        onClose={() => {
          setIsCreateDialogOpen(false);
          setSelectedProject(null);
        }}
        onSuccess={handleProjectCreated}
      />

      {/* Project Detail Dialog (read-only overview) */}
      <ProjectDetailDialog
        project={selectedProject}
        isOpen={isProjectDetailOpen}
        onClose={() => setIsProjectDetailOpen(false)}
      />

      {/* Lead Overview Modal */}
      <LeadOverviewModal
        isOpen={isLeadOverviewOpen}
        onClose={() => {
          setIsLeadOverviewOpen(false);
          setSelectedLeadForOverview(null);
        }}
        lead={selectedLeadForOverview}
      />

      {/* Steps Preview Modal */}
      <StepsPreviewModal
        isOpen={isStepsPreviewOpen}
        onClose={() => {
          setIsStepsPreviewOpen(false);
          setSelectedLeadForSteps(null);
        }}
        lead={selectedLeadForSteps}
      />
    </div>
  );
}

// Project Detail Dialog Component
interface ProjectDetailDialogProps {
  project: any;
  isOpen: boolean;
  onClose: () => void;
}

function ProjectDetailDialog({
  project,
  isOpen,
  onClose,
}: ProjectDetailDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [stepComments, setStepComments] = useState<{ [key: number]: string }>(
    {},
  );
  const [expandedSteps, setExpandedSteps] = useState<{
    [key: number]: boolean;
  }>({});
  const [uploadingFiles, setUploadingFiles] = useState<{
    [key: number]: boolean;
  }>({});
  const [addStepModalOpen, setAddStepModalOpen] = useState(false);

  // Helper functions for status display
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return CheckCircle;
      case "in_progress":
        return PlayCircle;
      case "on_hold":
        return PauseCircle;
      case "cancelled":
        return AlertTriangle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-100";
      case "in_progress":
        return "text-blue-600 bg-blue-100";
      case "on_hold":
        return "text-yellow-600 bg-yellow-100";
      case "cancelled":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  // Fetch project details including steps and comments
  const { data: projectDetails, isLoading } = useQuery({
    queryKey: ["workflow-project-details", project?.id],
    queryFn: () => (project ? apiClient.getWorkflowProject(project.id) : null),
    enabled: !!project?.id && isOpen,
  });

  // Fetch project comments
  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ["project-comments", project?.id],
    queryFn: () => (project ? apiClient.getProjectComments(project.id) : []),
    enabled: !!project?.id && isOpen,
  });

  // Fetch all step comments when needed
  const expandedStepIds = Object.keys(expandedSteps)
    .filter((id) => expandedSteps[parseInt(id)])
    .map((id) => parseInt(id));
  const { data: allStepComments = {} } = useQuery({
    queryKey: ["all-step-comments", project?.id, expandedStepIds],
    queryFn: async () => {
      if (!project?.id || expandedStepIds.length === 0) return {};

      const commentsMap: { [key: number]: any[] } = {};
      await Promise.all(
        expandedStepIds.map(async (stepId) => {
          try {
            const comments = await apiClient.getProjectComments(
              project.id,
              stepId,
            );
            commentsMap[stepId] = comments;
          } catch (error) {
            commentsMap[stepId] = [];
          }
        }),
      );
      return commentsMap;
    },
    enabled: !!project?.id && isOpen && expandedStepIds.length > 0,
  });

  const addCommentMutation = useMutation({
    mutationFn: (commentData: any) =>
      apiClient.createProjectComment(project.id, commentData),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-comments", project?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-step-comments", project?.id],
      });
      if (variables.step_id) {
        setStepComments((prev) => ({ ...prev, [variables.step_id]: "" }));
      } else {
        setNewComment("");
      }
    },
  });

  const updateStepStatusMutation = useMutation({
    mutationFn: ({ stepId, status }: { stepId: number; status: string }) => {
      console.log("Updating step status:", stepId, status);
      return apiClient.updateStepStatus(
        stepId,
        status,
        parseInt(user?.id || "1"),
      );
    },
    onSuccess: (data, variables) => {
      console.log("Step status updated successfully");
      queryClient.invalidateQueries({
        queryKey: ["workflow-project-details", project?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["workflow-projects"] });
      queryClient.invalidateQueries({
        queryKey: ["project-step-comments", variables.stepId],
      });
    },
    onError: (error) => {
      console.error("Failed to update step status:", error);
      alert("Failed to update step status. Please try again.");
    },
  });

  const fileUploadMutation = useMutation({
    mutationFn: (files: FileList) => apiClient.uploadFiles(files),
    onSuccess: (uploadedFiles) => {
      console.log("Files uploaded:", uploadedFiles);
      // Handle file upload success
    },
  });

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    addCommentMutation.mutate({
      comment_text: newComment,
      comment_type: "comment",
      is_internal: false,
      created_by: parseInt(user?.id || "1"),
    });
  };

  const handleAddStepComment = (stepId: number) => {
    const comment = stepComments[stepId];
    if (!comment?.trim()) return;

    addCommentMutation.mutate({
      step_id: stepId,
      comment_text: comment,
      comment_type: "comment",
      is_internal: false,
      created_by: parseInt(user?.id || "1"),
    });
  };

  const handleStepStatusUpdate = (stepId: number, newStatus: string) => {
    updateStepStatusMutation.mutate({ stepId, status: newStatus });
  };

  const handleFileUpload = async (stepId: number, files: FileList) => {
    if (files.length === 0) return;

    setUploadingFiles((prev) => ({ ...prev, [stepId]: true }));
    try {
      await fileUploadMutation.mutateAsync(files);
      // Add comment about file upload
      addCommentMutation.mutate({
        step_id: stepId,
        comment_text: `Uploaded ${files.length} file(s): ${Array.from(files)
          .map((f) => f.name)
          .join(", ")}`,
        comment_type: "system",
        is_internal: false,
        created_by: parseInt(user?.id || "1"),
      });
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [stepId]: false }));
    }
  };

  const toggleStepExpansion = (stepId: number) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const handleUpdateStepStatus = (stepId: number, status: string) => {
    updateStepStatusMutation.mutate({ stepId, status });
  };

  if (!project) return null;

  // Calculate auto progress percentage
  const calculateProgress = () => {
    if (!projectDetails?.steps || projectDetails.steps.length === 0) return 0;
    const completedSteps = projectDetails.steps.filter(
      (step: any) => step.status === "completed",
    ).length;
    return Math.round((completedSteps / projectDetails.steps.length) * 100);
  };

  const autoProgress = calculateProgress();
  const displayProgress =
    autoProgress > 0 ? autoProgress : project.progress_percentage || 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project Details - {project.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Project Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(project.status || "")}>
                      {(project.status || "").replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Progress</Label>
                  <div className="mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${displayProgress}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {displayProgress}%
                      </span>
                      {autoProgress > 0 &&
                        autoProgress !== project.progress_percentage && (
                          <Badge variant="outline" className="text-xs">
                            Auto
                          </Badge>
                        )}
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Steps</Label>
                  <div className="mt-1">
                    <div className="text-sm">
                      <span className="font-medium text-green-600">
                        {projectDetails?.steps?.filter(
                          (s: any) => s.status === "completed",
                        ).length || 0}
                      </span>
                      <span className="text-gray-500"> / </span>
                      <span className="font-medium">
                        {projectDetails?.steps?.length || 0}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">
                        completed
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {projectDetails?.steps?.filter(
                        (s: any) => s.status === "in_progress",
                      ).length || 0}{" "}
                      in progress,{" "}
                      {projectDetails?.steps?.filter(
                        (s: any) => s.status === "pending",
                      ).length || 0}{" "}
                      pending
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Team</Label>
                  <p className="text-sm mt-1">{project.assigned_team}</p>
                  <div className="text-xs text-gray-500 mt-1">
                    Created{" "}
                    {format(new Date(project.created_at), "MMM d, yyyy")}
                  </div>
                </div>
              </div>

              {project.description && (
                <div className="mt-4">
                  <Label className="text-sm font-medium">Description</Label>
                  <p className="text-sm text-gray-600 mt-1">
                    {project.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Steps */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Project Steps</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddStepModalOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4">Loading project steps...</div>
              ) : projectDetails?.steps?.length > 0 ? (
                <DraggableProjectStepsList
                  projectId={project.id}
                  steps={projectDetails.steps}
                  expandedSteps={expandedSteps}
                  onToggleExpansion={toggleStepExpansion}
                  onUpdateStepStatus={handleUpdateStepStatus}
                />
              ) : (
                <div className="text-center py-4 text-gray-500">
                  No steps defined for this project yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>

      {/* Add Step Modal */}
      <AddStepModal
        isOpen={addStepModalOpen}
        onClose={() => setAddStepModalOpen(false)}
        projectId={project.id}
        currentStepCount={projectDetails?.steps?.length || 0}
      />
    </Dialog>
  );
}
