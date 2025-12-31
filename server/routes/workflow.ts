import { Router, Request, Response } from "express";
import {
  WorkflowRepository,
  CreateWorkflowProjectData,
  CreateWorkflowStepData,
  CreateWorkflowCommentData,
} from "../models/WorkflowIntegration";

const router = Router();

// Helper function to check if database is available (for fallback to mock data)
async function isDatabaseAvailable() {
  try {
    await WorkflowRepository.getAllProjects();
    return true;
  } catch (error) {
    console.log("Workflow database not available:", error.message);
    return false;
  }
}

// Mock data for development/testing
const WorkflowMockData = {
  projects: [
    {
      id: 1,
      name: "TechCorp Solutions - Core Platform",
      description: "Product development project for TechCorp Solutions",
      source_type: "lead",
      source_id: 1,
      project_type: "product_development",
      status: "in_progress",
      priority: "high",
      assigned_team: "Product Team",
      project_manager_id: 2,
      progress_percentage: 45,
      total_steps: 8,
      completed_steps: 3,
      active_steps: 2,
      pending_steps: 3,
      created_at: "2024-01-15T00:00:00Z",
      lead_data: {
        client_name: "TechCorp Solutions",
        project_title: "Enterprise Platform Development",
        project_description: "Building a comprehensive enterprise platform",
        lead_status: "completed",
      },
    },
    {
      id: 2,
      name: "FinOps Daily Operations",
      description: "Daily financial operations and reconciliation processes",
      source_type: "manual",
      project_type: "finops_process",
      status: "in_progress",
      priority: "critical",
      assigned_team: "FinOps Team",
      progress_percentage: 90,
      total_steps: 4,
      completed_steps: 3,
      active_steps: 1,
      pending_steps: 0,
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
  steps: [
    {
      id: 1,
      project_id: 1,
      step_name: "Build base using platform",
      step_description:
        "Create the foundational architecture using our existing platform components",
      step_order: 1,
      status: "in_progress",
      assigned_to: 3,
      assigned_user_name: "John Developer",
      estimated_hours: 40,
      actual_hours: 25,
      created_at: "2024-01-15T00:00:00Z",
    },
    {
      id: 2,
      project_id: 1,
      step_name: "Follow-up with development team",
      step_description:
        "Coordinate with development team and assign specific tasks with tracking",
      step_order: 2,
      status: "pending",
      assigned_to: 2,
      assigned_user_name: "Alice Manager",
      estimated_hours: 20,
      created_at: "2024-01-15T00:00:00Z",
    },
    {
      id: 3,
      project_id: 2,
      step_name: "Daily Transaction Reconciliation",
      step_description:
        "Run automated transaction reconciliation at 5:00 AM daily",
      step_order: 1,
      status: "completed",
      is_automated: true,
      automation_config: {
        schedule: "0 5 * * 1-5",
        timeout: 30,
        alert_on_failure: true,
      },
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      id: 4,
      project_id: 2,
      step_name: "Process files before 5 AM",
      step_description:
        "Ensure all files are processed before the 5 AM cutoff time",
      step_order: 2,
      status: "in_progress",
      is_automated: true,
      automation_config: {
        schedule: "45 4 * * 1-5",
        alert_on_failure: true,
      },
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
  comments: [
    {
      id: 1,
      project_id: 1,
      step_id: 1,
      comment_text:
        "Started working on the base platform setup. Using React and Node.js stack as discussed.",
      comment_type: "comment",
      is_internal: false,
      created_at: "2024-01-20T10:30:00Z",
      creator_name: "John Developer",
      user_name: "John Developer",
      user_id: 3,
    },
    {
      id: 2,
      project_id: 1,
      comment_text:
        "Project milestone reached - 45% completion. Moving to next phase.",
      comment_type: "status_update",
      is_internal: true,
      created_at: "2024-01-25T14:00:00Z",
      creator_name: "System",
      user_name: "System",
      user_id: 1,
    },
  ],
  notifications: [
    {
      id: 1,
      notification_type: "step_overdue",
      title: "Step Overdue: Follow-up with development team",
      message:
        "The step 'Follow-up with development team' is overdue. Please take action.",
      recipient_id: 2,
      project_id: 1,
      step_id: 2,
      source_type: "product",
      priority: "high",
      is_read: false,
      created_at: "2024-01-26T09:00:00Z",
    },
    {
      id: 2,
      notification_type: "process_failed",
      title: "Daily reconciliation failed",
      message:
        "The automated reconciliation process failed at 5:00 AM. Manual intervention required.",
      recipient_id: 4,
      project_id: 2,
      source_type: "finops",
      priority: "critical",
      is_read: false,
      created_at: "2024-01-26T05:15:00Z",
    },
  ],
};

// DASHBOARD ENDPOINTS

// Get workflow dashboard data
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const userRole = (req.query.userRole as string) || "admin";

    if (await isDatabaseAvailable()) {
      const dashboardData = await WorkflowRepository.getDashboardData(
        userId,
        userRole,
      );
      res.json(dashboardData);
    } else {
      // Return mock dashboard data
      const mockData = {
        project_stats: [
          { status: "in_progress", count: 2 },
          { status: "completed", count: 3 },
          { status: "created", count: 1 },
        ],
        overdue_steps: 1,
        unread_notifications: 2,
        recent_notifications: WorkflowMockData.notifications,
      };
      res.json(mockData);
    }
  } catch (error) {
    console.error("Error fetching workflow dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// PROJECT ENDPOINTS

// Get all projects
router.get("/projects", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const userRole = (req.query.userRole as string) || "admin";

    if (await isDatabaseAvailable()) {
      const projects = await WorkflowRepository.getAllProjects(
        userId,
        userRole,
      );
      res.json(projects);
    } else {
      let filteredProjects = WorkflowMockData.projects;

      if (userRole === "product") {
        filteredProjects = filteredProjects.filter(
          (p) => p.project_type === "product_development",
        );
      } else if (userRole === "finance") {
        filteredProjects = filteredProjects.filter(
          (p) => p.project_type === "finops_process",
        );
      }

      res.json(filteredProjects);
    }
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.json(WorkflowMockData.projects);
  }
});

// Get project by ID
router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    if (await isDatabaseAvailable()) {
      // Try DB first
      const project = await WorkflowRepository.getProjectById(id, true, true);

      if (project) {
        // Ensure forward-compatible fields are present for the client
        project.template_id = project.template_id ?? null;
        project.product_master_ids = project.product_master_ids ?? [];
        return res.json(project);
      }

      // DB available but no project found - fallback to mock data if present
      const mockProject = WorkflowMockData.projects.find((p) => p.id === id);
      if (mockProject) {
        const projectSteps = WorkflowMockData.steps.filter(
          (s) => s.project_id === id,
        );
        const projectComments = WorkflowMockData.comments.filter(
          (c) => c.project_id === id,
        );
        return res.json({
          ...mockProject,
          template_id: mockProject.template_id ?? null,
          product_master_ids: mockProject.product_master_ids ?? [],
          steps: projectSteps,
          comments: projectComments,
        });
      }

      return res.status(404).json({ error: "Project not found" });
    } else {
      // DB not available - use mock data
      const mockProject = WorkflowMockData.projects.find((p) => p.id === id);
      if (!mockProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Add related data
      const projectSteps = WorkflowMockData.steps.filter(
        (s) => s.project_id === id,
      );
      const projectComments = WorkflowMockData.comments.filter(
        (c) => c.project_id === id,
      );

      res.json({
        ...mockProject,
        steps: projectSteps,
        comments: projectComments,
      });
    }
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// Create project
router.post("/projects", async (req: Request, res: Response) => {
  try {
    const projectData: CreateWorkflowProjectData = req.body;

    // Validate required fields
    if (
      !projectData.name ||
      !projectData.project_type ||
      !projectData.created_by
    ) {
      return res.status(400).json({
        error: "Missing required fields: name, project_type, created_by",
      });
    }

    if (await isDatabaseAvailable()) {
      // Ensure source_type is set to a valid default to satisfy DB NOT NULL constraint
      projectData.source_type = projectData.source_type || "manual";
      projectData.source_id = projectData.source_id ?? null;
      projectData.created_by = projectData.created_by || 1;

      const newProject = await WorkflowRepository.createProject(projectData);

      // If client included steps in payload, create them now
      if (Array.isArray(projectData.steps) && projectData.steps.length > 0) {
        try {
          for (const s of projectData.steps) {
            const stepData: CreateWorkflowStepData = {
              project_id: newProject.id,
              step_name: s.step_name || s.name || s.stepName,
              step_description:
                s.step_description ||
                s.description ||
                s.stepDescription ||
                null,
              step_order: s.step_order ?? s.stepOrder ?? null,
              assigned_to: s.assigned_to ?? s.assignedTo ?? null,
              estimated_hours: s.estimated_hours ?? s.estimatedHours ?? null,
              due_date: s.due_date ?? s.dueDate ?? s.eta ?? null,
              status: s.status || "pending",
              created_by: projectData.created_by || 1,
              // include probability_percent when client provides it
              probability_percent:
                s.probability_percent ?? s.probability ?? null,
            };
            await WorkflowRepository.createStep(stepData);
          }
        } catch (stepsErr) {
          console.warn("Failed to create project steps:", stepsErr);
        }
      }

      // Reload project with steps
      const projectWithSteps = await WorkflowRepository.getProjectById(
        newProject.id,
      );
      res.status(201).json(projectWithSteps);
    } else {
      // Return mock created project
      const mockProject = {
        id: Math.floor(Math.random() * 1000) + 100,
        ...projectData,
        status: "created",
        progress_percentage: 0,
        total_steps: 0,
        completed_steps: 0,
        active_steps: 0,
        pending_steps: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      res.status(201).json(mockProject);
    }
  } catch (error) {
    console.error("Error creating project:", error);
    // Return detailed message for debugging (consider sanitizing in production)
    res
      .status(500)
      .json({ error: (error as Error).message || "Failed to create project" });
  }
});

// Delete project
router.delete("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid project ID" });

    if (await isDatabaseAvailable()) {
      await WorkflowRepository.deleteProject(id);
      res.status(204).json({});
    } else {
      // Remove from mock data
      const idx = WorkflowMockData.projects.findIndex((p) => p.id === id);
      if (idx !== -1) WorkflowMockData.projects.splice(idx, 1);
      res.status(204).json({});
    }
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// Update project
router.patch("/projects/:id", async (req: Request, res: Response) => {
  try {
    // Log incoming request for debugging update issues
    try {
      console.log("[workflow PATCH] incoming request:", {
        method: req.method,
        url: req.originalUrl || req.url,
        contentType: req.headers["content-type"],
        rawBody: req.rawBody ? req.rawBody.toString("utf8") : null,
      });
    } catch (logErr) {
      console.warn("Failed to log request body:", logErr);
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid project ID" });

    const updateData: Partial<CreateWorkflowProjectData> = req.body || {};

    if (await isDatabaseAvailable()) {
      // Use repository to apply updates
      const updated = await WorkflowRepository.updateProject(id, updateData);
      if (!updated) return res.status(404).json({ error: "Project not found" });
      res.json(updated);
    } else {
      // Update mock
      const idx = WorkflowMockData.projects.findIndex((p) => p.id === id);
      if (idx === -1)
        return res.status(404).json({ error: "Project not found" });
      WorkflowMockData.projects[idx] = {
        ...WorkflowMockData.projects[idx],
        ...updateData,
        updated_at: new Date().toISOString(),
      } as any;
      const mockProject = WorkflowMockData.projects[idx];
      const projectSteps = WorkflowMockData.steps.filter(
        (s) => s.project_id === id,
      );
      const projectComments = WorkflowMockData.comments.filter(
        (c) => c.project_id === id,
      );
      res.json({
        ...mockProject,
        template_id: mockProject.template_id ?? null,
        product_master_ids: mockProject.product_master_ids ?? [],
        steps: projectSteps,
        comments: projectComments,
      });
    }
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// Create project from completed lead
router.post(
  "/projects/from-lead/:leadId",
  async (req: Request, res: Response) => {
    try {
      const leadId = parseInt(req.params.leadId);
      const projectData = req.body;
      const createdBy = parseInt(req.body.created_by) || 1;

      if (isNaN(leadId)) {
        return res.status(400).json({ error: "Invalid lead ID" });
      }

      if (await isDatabaseAvailable()) {
        const newProject = await WorkflowRepository.createProjectFromLead(
          leadId,
          projectData,
          createdBy,
        );
        res.status(201).json(newProject);
      } else {
        // Return mock project created from lead
        const mockProject = {
          id: Math.floor(Math.random() * 1000) + 100,
          name: `Lead ${leadId} - Product Development`,
          description: `Product development project created from completed lead ${leadId}`,
          source_type: "lead",
          source_id: leadId,
          project_type: "product_development",
          status: "created",
          priority: "high",
          assigned_team: "Product Team",
          progress_percentage: 0,
          created_at: new Date().toISOString(),
          lead_data: {
            client_name: "Sample Client",
            project_title: "Sample Project",
            lead_status: "completed",
          },
        };
        res.status(201).json(mockProject);
      }
    } catch (error) {
      console.error("Error creating project from lead:", error);
      res.status(500).json({ error: "Failed to create project from lead" });
    }
  },
);

// STEP ENDPOINTS

// Get project steps
router.get(
  "/projects/:projectId/steps",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (await isDatabaseAvailable()) {
        let steps = await WorkflowRepository.getProjectSteps(projectId);

        // If no explicit project steps exist yet, fall back to the project's template steps
        // so the UI can show the expected pipeline even before steps are persisted.
        if ((steps || []).length === 0) {
          try {
            const project = await WorkflowRepository.getProjectById(
              projectId,
              false,
              false,
            );
            const templateId = (project as any)?.template_id;
            if (templateId) {
              // Lazy-load template steps
              const { TemplateRepository } = await import("../models/Template");
              const tpl = await TemplateRepository.findById(templateId);
              if (
                tpl &&
                Array.isArray((tpl as any).steps) &&
                (tpl as any).steps.length > 0
              ) {
                // Map template steps to the workflow step shape expected by the client
                const mapped = (tpl as any).steps.map(
                  (ts: any, idx: number) => ({
                    id: ts.id,
                    project_id: projectId,
                    step_name: ts.name || ts.step_name,
                    step_description:
                      ts.description || ts.step_description || null,
                    step_order: ts.step_order || idx + 1,
                    status: "pending",
                    assigned_to: null,
                    estimated_hours: ts.default_eta_days
                      ? ts.default_eta_days * 8
                      : null,
                    actual_hours: null,
                    start_date: null,
                    due_date: null,
                    completion_date: null,
                    dependencies: null,
                    is_automated: ts.is_automated || false,
                    automation_config: ts.automation_config || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    created_by: tpl.created_by || 1,
                    probability_percent: ts.probability_percent || 0,
                    // Mark as template-derived so client knows these are not persisted project steps
                    is_template: true,
                    isTemplate: true,
                  }),
                );

                return res.json(mapped);
              }
            }
          } catch (tplErr) {
            console.warn("Failed to load template steps fallback:", tplErr);
          }
        }

        return res.json(steps);
      } else {
        const mockSteps = WorkflowMockData.steps.filter(
          (s) => s.project_id === projectId,
        );
        res.json(mockSteps);
      }
    } catch (error) {
      console.error("Error fetching project steps:", error);
      res.json([]);
    }
  },
);

// Create step
router.post(
  "/projects/:projectId/steps",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const stepData: CreateWorkflowStepData = {
        ...req.body,
        project_id: projectId,
      };

      // Provide sensible default for created_by when not provided
      stepData.created_by = stepData.created_by || 1;

      // Validate required fields
      if (!stepData.step_name) {
        return res
          .status(400)
          .json({ error: "Missing required fields: step_name" });
      }

      if (await isDatabaseAvailable()) {
        const newStep = await WorkflowRepository.createStep(stepData);
        res.status(201).json(newStep);
      } else {
        // Return mock created step
        const mockStep = {
          id: Math.floor(Math.random() * 1000) + 100,
          ...stepData,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        res.status(201).json(mockStep);
      }
    } catch (error) {
      console.error("Error creating step:", error);
      res.status(500).json({ error: "Failed to create step" });
    }
  },
);

// Update step status
router.patch("/steps/:stepId/status", async (req: Request, res: Response) => {
  try {
    const stepId = parseInt(req.params.stepId);
    const { status, updated_by } = req.body;

    if (isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid step ID" });
    }

    if (!status || !updated_by) {
      return res
        .status(400)
        .json({ error: "Missing required fields: status, updated_by" });
    }

    if (await isDatabaseAvailable()) {
      await WorkflowRepository.updateStepStatus(
        stepId,
        status,
        parseInt(updated_by),
      );
      res.json({ success: true, message: "Step status updated" });
    } else {
      // Update mock data for testing
      const mockStep = WorkflowMockData.steps.find((s) => s.id === stepId);
      if (mockStep) {
        mockStep.status = status;
        mockStep.updated_at = new Date().toISOString();
        console.log(`Mock step ${stepId} status updated to ${status}`);
      }
      res.json({ success: true, message: "Step status updated (mock)" });
    }
  } catch (error) {
    console.error("Error updating step status:", error);
    res.status(500).json({ error: "Failed to update step status" });
  }
});

// Delete step
router.delete("/steps/:stepId", async (req: Request, res: Response) => {
  try {
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId))
      return res.status(400).json({ error: "Invalid step ID" });

    if (await isDatabaseAvailable()) {
      await WorkflowRepository.deleteStep(stepId);
      res.status(204).json({});
    } else {
      const idx = WorkflowMockData.steps.findIndex((s) => s.id === stepId);
      if (idx !== -1) WorkflowMockData.steps.splice(idx, 1);
      res.status(204).json({});
    }
  } catch (error) {
    console.error("Error deleting step:", error);
    res.status(500).json({ error: "Failed to delete step" });
  }
});

// Reorder project steps
router.post(
  "/projects/:projectId/steps/reorder",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { stepOrders } = req.body;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (!stepOrders || !Array.isArray(stepOrders)) {
        return res
          .status(400)
          .json({ error: "Missing or invalid stepOrders array" });
      }

      if (await isDatabaseAvailable()) {
        await WorkflowRepository.reorderProjectSteps(projectId, stepOrders);
        res.json({ success: true, message: "Steps reordered successfully" });
      } else {
        // Mock response - update mock data step orders
        stepOrders.forEach((stepOrder: { id: number; order: number }) => {
          const mockStep = WorkflowMockData.steps.find(
            (s) => s.id === stepOrder.id && s.project_id === projectId,
          );
          if (mockStep) {
            mockStep.step_order = stepOrder.order;
          }
        });
        res.json({
          success: true,
          message: "Steps reordered successfully (mock)",
        });
      }
    } catch (error) {
      console.error("Error reordering project steps:", error);
      res.status(500).json({ error: "Failed to reorder project steps" });
    }
  },
);

// COMMENTS ENDPOINTS

// Get project comments
router.get(
  "/projects/:projectId/comments",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const stepId = req.query.stepId
        ? parseInt(req.query.stepId as string)
        : undefined;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (await isDatabaseAvailable()) {
        const comments = await WorkflowRepository.getProjectComments(
          projectId,
          stepId,
        );
        // Map DB comment rows to chat message shape expected by the client
        const mapped = (comments || []).map((c: any) => {
          let attachments = [] as any[];
          try {
            if (c.attachments)
              attachments =
                typeof c.attachments === "string"
                  ? JSON.parse(c.attachments)
                  : c.attachments;
          } catch (e) {
            attachments = [];
          }
          return {
            id: c.id,
            user_id: c.created_by,
            user_name: c.creator_name || c.user_name || c.email || "Unknown",
            message: c.comment_text || c.message || "",
            message_type: c.comment_type || "comment",
            is_rich_text: !!c.is_rich_text,
            attachments,
            created_at: c.created_at,
            updated_at: c.updated_at,
            step_id: c.step_id,
          };
        });
        res.json(mapped);
      } else {
        let mockComments = WorkflowMockData.comments.filter(
          (c) => c.project_id === projectId,
        );
        if (stepId) {
          mockComments = mockComments.filter((c) => c.step_id === stepId);
        }
        const mappedMock = mockComments.map((c: any) => ({
          id: c.id,
          user_id: c.created_by || c.user_id,
          user_name: c.creator_name || c.user_name || "Mock User",
          message: c.comment_text || c.message || "",
          message_type: c.comment_type || "comment",
          is_rich_text: !!c.is_rich_text,
          attachments: c.attachments || [],
          created_at: c.created_at,
          updated_at: c.updated_at,
          step_id: c.step_id,
        }));
        res.json(mappedMock);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.json([]);
    }
  },
);

// Create comment
router.post(
  "/projects/:projectId/comments",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const commentData: CreateWorkflowCommentData = {
        ...req.body,
        project_id: projectId,
      };

      // Validate required fields
      if (!commentData.comment_text || !commentData.created_by) {
        return res
          .status(400)
          .json({ error: "Missing required fields: comment_text, created_by" });
      }

      if (await isDatabaseAvailable()) {
        const created = await WorkflowRepository.createComment(commentData);
        // Parse attachments if stored as JSON string
        let attachments = [] as any[];
        try {
          if (created.attachments)
            attachments =
              typeof created.attachments === "string"
                ? JSON.parse(created.attachments)
                : created.attachments;
        } catch (e) {
          attachments = [];
        }
        // Map created comment to client's chat shape
        const mappedCreated = {
          id: created.id,
          user_id: created.created_by,
          user_name: created.creator_name || created.user_name || "Unknown",
          message: created.comment_text || created.message || "",
          message_type: created.comment_type || "comment",
          is_rich_text: !!created.is_rich_text,
          attachments,
          created_at: created.created_at,
          updated_at: created.updated_at,
          step_id: created.step_id,
        };
        res.status(201).json(mappedCreated);
      } else {
        // Return mock created comment
        const mockComment = {
          id: Math.floor(Math.random() * 1000) + 100,
          ...commentData,
          comment_type: commentData.comment_type || "comment",
          is_internal: commentData.is_internal || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          creator_name: commentData.user_name || "Current User",
          user_name: commentData.user_name || "Current User",
        };
        res.status(201).json(mockComment);
      }
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  },
);

// NOTIFICATIONS ENDPOINTS

// Get user notifications
router.get("/notifications", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const unreadOnly = req.query.unreadOnly === "true";

    if (await isDatabaseAvailable()) {
      const notifications = await WorkflowRepository.getUserNotifications(
        userId,
        unreadOnly,
      );
      res.json(notifications);
    } else {
      let mockNotifications = WorkflowMockData.notifications.filter(
        (n) => n.recipient_id === userId,
      );
      if (unreadOnly) {
        mockNotifications = mockNotifications.filter((n) => !n.is_read);
      }
      res.json(mockNotifications);
    }
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.json([]);
  }
});

// Mark notification as read
router.patch(
  "/notifications/:notificationId/read",
  async (req: Request, res: Response) => {
    try {
      const notificationId = parseInt(req.params.notificationId);
      if (isNaN(notificationId)) {
        return res.status(400).json({ error: "Invalid notification ID" });
      }

      if (await isDatabaseAvailable()) {
        await WorkflowRepository.markNotificationAsRead(notificationId);
        res.json({ success: true, message: "Notification marked as read" });
      } else {
        res.json({
          success: true,
          message: "Notification marked as read (mock)",
        });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  },
);

// AUTOMATION ENDPOINTS

// Get active automations
router.get("/automations", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const automations = await WorkflowRepository.getActiveAutomations();
      res.json(automations);
    } else {
      // Return mock automations
      const mockAutomations = [
        {
          id: 1,
          automation_name: "Daily Transaction Reconciliation",
          automation_type: "daily_task",
          schedule_config: {
            time: "05:00",
            days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          },
          is_active: true,
          last_run_at: "2024-01-26T05:00:00Z",
          success_count: 25,
          failure_count: 1,
        },
        {
          id: 2,
          automation_name: "Pre-5AM File Processing Check",
          automation_type: "scheduled_check",
          schedule_config: {
            time: "04:45",
            days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
          },
          is_active: true,
          last_run_at: "2024-01-26T04:45:00Z",
          success_count: 25,
          failure_count: 0,
        },
      ];
      res.json(mockAutomations);
    }
  } catch (error) {
    console.error("Error fetching automations:", error);
    res.json([]);
  }
});

// Trigger automation manually
router.post(
  "/automations/:automationId/trigger",
  async (req: Request, res: Response) => {
    try {
      const automationId = parseInt(req.params.automationId);
      if (isNaN(automationId)) {
        return res.status(400).json({ error: "Invalid automation ID" });
      }

      // In a real implementation, this would trigger the automation
      console.log(`Manually triggering automation ${automationId}`);

      // Mock response
      res.json({
        success: true,
        message: `Automation ${automationId} triggered successfully`,
        triggered_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error triggering automation:", error);
      res.status(500).json({ error: "Failed to trigger automation" });
    }
  },
);

// FOLLOW-UP ENDPOINTS

// Create project follow-up
router.post(
  "/projects/:projectId/follow-ups",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const followUpData = {
        ...req.body,
        project_id: projectId,
      };

      // Validate required fields
      if (!followUpData.title || !followUpData.created_by) {
        return res
          .status(400)
          .json({ error: "Missing required fields: title, created_by" });
      }

      // Mock response for now
      const mockFollowUp = {
        id: Math.floor(Math.random() * 1000) + 100,
        ...followUpData,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      res.status(201).json(mockFollowUp);
    } catch (error) {
      console.error("Error creating follow-up:", error);
      res.status(500).json({ error: "Failed to create follow-up" });
    }
  },
);

// LEAD INTEGRATION ENDPOINTS

// Get completed leads ready for project creation
router.get("/leads/completed", async (req: Request, res: Response) => {
  try {
    // In real implementation, this would query leads with status 'completed'
    // that haven't been converted to projects yet
    const mockCompletedLeads = [
      {
        id: 1,
        client_name: "TechCorp Solutions",
        project_title: "Enterprise Platform Development",
        project_description:
          "Building a comprehensive enterprise platform with microservices architecture",
        lead_status: "completed",
        completion_date: "2024-01-25T00:00:00Z",
        total_steps: 8,
        completed_steps: 8,
        estimated_budget: 250000,
        has_project: false,
      },
      {
        id: 2,
        client_name: "StartupXYZ",
        project_title: "Mobile App Development",
        project_description: "Cross-platform mobile application for e-commerce",
        lead_status: "completed",
        completion_date: "2024-01-20T00:00:00Z",
        total_steps: 6,
        completed_steps: 6,
        estimated_budget: 80000,
        has_project: false,
      },
    ];

    res.json(mockCompletedLeads);
  } catch (error) {
    console.error("Error fetching completed leads:", error);
    res.json([]);
  }
});

export default router;
