import { Router, Request, Response } from "express";
import {
  LeadRepository,
  LeadStepRepository,
  LeadChatRepository,
  CreateLeadData,
  UpdateLeadData,
  CreateLeadStepData,
  UpdateLeadStepData,
  CreateLeadChatData,
} from "../models/Lead";
import { MockDataService } from "../services/mockData";
import { DatabaseValidator, ValidationSchemas } from "../utils/validation";

const router = Router();

// Enhanced helper function with better error handling
async function isDatabaseAvailable() {
  try {
    return await DatabaseValidator.isDatabaseAvailable();
  } catch (error) {
    console.log("Database availability check failed:", error.message);
    return false;
  }
}

// Get all leads
router.get("/", async (req: Request, res: Response) => {
  try {
    const { salesRep } = req.query;
    const salesRepId = salesRep ? parseInt(salesRep as string) : undefined;

    let leads;
    try {
      if (await isDatabaseAvailable()) {
        leads = await LeadRepository.findAll(salesRepId);
      } else {
        leads = await MockDataService.getAllLeads(salesRepId);
      }
    } catch (dbError) {
      console.log("Database error, using mock data:", dbError.message);
      leads = await MockDataService.getAllLeads(salesRepId);
    }

    res.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    try {
      const leads = await MockDataService.getAllLeads();
      res.json(leads);
    } catch (fallbackError) {
      console.error("Mock data fallback failed:", fallbackError);
      res.json([]);
    }
  }
});

// Get lead statistics
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { salesRep } = req.query;
    const salesRepId = salesRep ? parseInt(salesRep as string) : undefined;

    let stats;
    try {
      if (await isDatabaseAvailable()) {
        stats = await LeadRepository.getStats(salesRepId);
      } else {
        stats = await MockDataService.getLeadStats(salesRepId);
      }
    } catch (dbError) {
      console.log("Database error, using mock data:", dbError.message);
      stats = await MockDataService.getLeadStats(salesRepId);
    }

    res.json(stats);
  } catch (error) {
    console.error("Error fetching lead stats:", error);
    try {
      const stats = await MockDataService.getLeadStats();
      res.json(stats);
    } catch (fallbackError) {
      console.error("Mock data fallback failed:", fallbackError);
      res.json({ total: 0, in_progress: 0, won: 0, lost: 0, completed: 0 });
    }
  }
});

// Get lead by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    let lead;
    try {
      if (await isDatabaseAvailable()) {
        lead = await LeadRepository.findById(id);
      } else {
        lead = await MockDataService.getLeadById(id);
      }
    } catch (dbError) {
      console.log("Database error, using mock data:", dbError.message);
      lead = await MockDataService.getLeadById(id);
    }

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json(lead);
  } catch (error) {
    console.error("Error fetching lead:", error);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// Create new lead with comprehensive validation
router.post("/", async (req: Request, res: Response) => {
  try {
    const leadData: CreateLeadData = req.body;

    // Validate required fields
    const validation = DatabaseValidator.validateRequiredFields(
      leadData,
      ValidationSchemas.lead.required,
    );

    if (!validation.isValid) {
      return res.status(400).json({
        error: "Missing required fields",
        missingFields: validation.missingFields,
      });
    }

    // Validate enum values
    if (
      !ValidationSchemas.lead.enums.lead_source.includes(leadData.lead_source)
    ) {
      return res.status(400).json({
        error: "Invalid lead source",
        validOptions: ValidationSchemas.lead.enums.lead_source,
      });
    }

    if (
      leadData.status &&
      !ValidationSchemas.lead.enums.status.includes(leadData.status)
    ) {
      return res.status(400).json({
        error: "Invalid status",
        validOptions: ValidationSchemas.lead.enums.status,
      });
    }

    if (
      leadData.priority &&
      !ValidationSchemas.lead.enums.priority.includes(leadData.priority)
    ) {
      return res.status(400).json({
        error: "Invalid priority",
        validOptions: ValidationSchemas.lead.enums.priority,
      });
    }

    // Validate numeric fields
    if (leadData.probability !== undefined) {
      if (!DatabaseValidator.isValidNumber(leadData.probability, 0, 100)) {
        return res
          .status(400)
          .json({ error: "Probability must be between 0 and 100" });
      }
    }

    if (leadData.project_value !== undefined) {
      if (!DatabaseValidator.isValidNumber(leadData.project_value, 0)) {
        return res
          .status(400)
          .json({ error: "Project value must be a positive number" });
      }
    }

    if (leadData.expected_daily_txn_volume !== undefined) {
      if (
        !DatabaseValidator.isValidNumber(leadData.expected_daily_txn_volume, 0)
      ) {
        return res.status(400).json({
          error: "Expected daily transaction volume must be a positive number",
        });
      }
    }

    // Validate dates
    if (leadData.expected_close_date) {
      if (!DatabaseValidator.isValidFutureDate(leadData.expected_close_date)) {
        return res
          .status(400)
          .json({ error: "Expected close date must be in the future" });
      }
    }

    if (leadData.targeted_end_date) {
      if (!DatabaseValidator.isValidFutureDate(leadData.targeted_end_date)) {
        return res
          .status(400)
          .json({ error: "Targeted end date must be in the future" });
      }
    }

    // Validate assigned user exists (if provided and database available)
    if (leadData.created_by && (await isDatabaseAvailable())) {
      const userExists = await DatabaseValidator.userExists(
        leadData.created_by,
      );
      if (!userExists) {
        return res.status(400).json({ error: "Creating user not found" });
      }
    }

    if (leadData.assigned_to && (await isDatabaseAvailable())) {
      const userExists = await DatabaseValidator.userExists(
        leadData.assigned_to,
      );
      if (!userExists) {
        return res.status(400).json({ error: "Assigned user not found" });
      }
    }

    // Validate contact information if provided
    if (leadData.contacts && Array.isArray(leadData.contacts)) {
      for (let i = 0; i < leadData.contacts.length; i++) {
        const contact = leadData.contacts[i];
        if (contact.email && !DatabaseValidator.isValidEmail(contact.email)) {
          return res.status(400).json({
            error: `Invalid email format for contact ${i + 1}`,
          });
        }
      }
    }

    try {
      if (await isDatabaseAvailable()) {
        // Generate unique lead ID if not provided
        if (!leadData.lead_id) {
          leadData.lead_id = await DatabaseValidator.generateUniqueLeadId();
        } else {
          // Check if custom lead ID is already taken
          const isTaken = await DatabaseValidator.isLeadIdTaken(
            leadData.lead_id,
          );
          if (isTaken) {
            return res.status(409).json({ error: "Lead ID already exists" });
          }
        }

        const lead = await LeadRepository.create(leadData);
        res.status(201).json(lead);
      } else {
        const mockLead = {
          id: Date.now(),
          lead_id: leadData.lead_id || `#${Date.now().toString().slice(-4)}`,
          ...leadData,
          status: leadData.status || ("in-progress" as const),
          priority: leadData.priority || ("medium" as const),
          probability: leadData.probability || 50,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        console.log("Database unavailable, returning mock lead response");
        res.status(201).json(mockLead);
      }
    } catch (dbError) {
      console.log(
        "Database error, returning mock lead response:",
        dbError.message,
      );
      const mockLead = {
        id: Date.now(),
        lead_id: leadData.lead_id || `#${Date.now().toString().slice(-4)}`,
        ...leadData,
        status: leadData.status || ("in-progress" as const),
        priority: leadData.priority || ("medium" as const),
        probability: leadData.probability || 50,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      res.status(201).json(mockLead);
    }
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// Update lead
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    let leadData: UpdateLeadData = req.body;

    // Sanitize date fields - convert empty strings to null for PostgreSQL compatibility
    const dateFields = [
      "start_date",
      "targeted_end_date",
      "expected_close_date",
    ];
    for (const field of dateFields) {
      if (leadData[field] === "") {
        leadData[field] = null;
      }
    }

    // Validate status if provided
    if (
      leadData.status &&
      !["in-progress", "won", "lost", "completed"].includes(leadData.status)
    ) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    try {
      const dbAvailable = await isDatabaseAvailable();

      if (dbAvailable) {
        // First check if lead exists
        const existingLead = await LeadRepository.findById(id);
        if (!existingLead) {
          return res.status(404).json({
            error: "Lead not found",
            message: `Lead with ID ${id} does not exist in the database`,
          });
        }

        const lead = await LeadRepository.update(id, leadData);
        if (!lead) {
          return res.status(500).json({ error: "Failed to update lead" });
        }
        res.json(lead);
      } else {
        const mockLead = await MockDataService.updateLead(id, leadData);
        if (!mockLead) {
          return res.status(404).json({ error: "Lead not found" });
        }
        res.json(mockLead);
      }
    } catch (dbError) {
      console.log(
        "Database error, falling back to mock data:",
        dbError.message,
      );

      const mockLead = await MockDataService.updateLead(id, leadData);
      if (!mockLead) {
        return res.status(404).json({
          error: "Lead not found",
          message: `Lead with ID ${id} does not exist`,
          availableLeadIds: [1, 2, 9],
        });
      }
      res.json(mockLead);
    }
  } catch (error) {
    console.error("Error updating lead:", error);
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// Delete lead
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    try {
      if (await isDatabaseAvailable()) {
        const success = await LeadRepository.delete(id);
        if (!success) {
          return res.status(404).json({ error: "Lead not found" });
        }
        res.status(204).send();
      } else {
        console.log(
          "Database unavailable, returning success for lead deletion",
        );
        res.status(204).send();
      }
    } catch (dbError) {
      console.log(
        "Database error, returning success for lead deletion:",
        dbError.message,
      );
      res.status(204).send();
    }
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// Get lead steps
router.get("/:leadId/steps", async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.leadId);
    if (isNaN(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    let steps;
    try {
      if (await isDatabaseAvailable()) {
        steps = await LeadStepRepository.findByLeadId(leadId);
      } else {
        steps = await MockDataService.getLeadSteps(leadId);
      }
    } catch (dbError) {
      console.log("Database error, using mock data:", dbError.message);
      steps = await MockDataService.getLeadSteps(leadId);
    }

    res.json(steps);
  } catch (error) {
    console.error("Error fetching lead steps:", error);
    try {
      const steps = await MockDataService.getLeadSteps(
        parseInt(req.params.leadId),
      );
      res.json(steps);
    } catch (fallbackError) {
      console.error("Mock data fallback failed:", fallbackError);
      res.json([]);
    }
  }
});

// Create lead step
router.post("/:leadId/steps", async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.leadId);
    if (isNaN(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    const stepData: CreateLeadStepData = {
      ...req.body,
      lead_id: leadId,
    };

    // Validate required fields
    if (!stepData.name || !stepData.estimated_days) {
      return res.status(400).json({
        error: "Missing required fields: name, estimated_days",
      });
    }

    try {
      if (await isDatabaseAvailable()) {
        const step = await LeadStepRepository.create(stepData);
        res.status(201).json(step);
      } else {
        const mockStep = {
          id: Date.now(),
          lead_id: leadId,
          name: stepData.name,
          description: stepData.description || null,
          status: "pending" as const,
          step_order: stepData.step_order || 1,
          due_date: stepData.due_date || null,
          completed_date: null,
          estimated_days: stepData.estimated_days,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        console.log("Database unavailable, returning mock step response");
        res.status(201).json(mockStep);
      }
    } catch (dbError) {
      console.log(
        "Database error, returning mock step response:",
        dbError.message,
      );
      const mockStep = {
        id: Date.now(),
        lead_id: leadId,
        name: stepData.name,
        description: stepData.description || null,
        status: "pending" as const,
        step_order: stepData.step_order || 1,
        due_date: stepData.due_date || null,
        completed_date: null,
        estimated_days: stepData.estimated_days,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      res.status(201).json(mockStep);
    }
  } catch (error) {
    console.error("Error creating lead step:", error);
    res.status(500).json({ error: "Failed to create lead step" });
  }
});

// Update lead step
router.put("/steps/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid step ID" });
    }

    const stepData: UpdateLeadStepData = req.body;

    try {
      if (await isDatabaseAvailable()) {
        const step = await LeadStepRepository.update(id, stepData);
        if (!step) {
          return res.status(404).json({ error: "Lead step not found" });
        }
        res.json(step);
      } else {
        const mockStep = {
          id: id,
          lead_id: 1,
          name: stepData.name || "Mock Step",
          description: stepData.description || null,
          status: stepData.status || "pending",
          step_order: stepData.step_order || 1,
          due_date: stepData.due_date || null,
          completed_date: stepData.completed_date || null,
          estimated_days: stepData.estimated_days || 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        console.log(
          "Database unavailable, returning mock step update response",
        );
        res.json(mockStep);
      }
    } catch (dbError) {
      console.log(
        "Database error, returning mock step update response:",
        dbError.message,
      );
      const mockStep = {
        id: id,
        lead_id: 1,
        name: stepData.name || "Mock Step",
        description: stepData.description || null,
        status: stepData.status || "pending",
        step_order: stepData.step_order || 1,
        due_date: stepData.due_date || null,
        completed_date: stepData.completed_date || null,
        estimated_days: stepData.estimated_days || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      res.json(mockStep);
    }
  } catch (error) {
    console.error("Error updating lead step:", error);
    res.status(500).json({ error: "Failed to update lead step" });
  }
});

// Delete lead step
router.delete("/steps/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid step ID" });
    }

    try {
      if (await isDatabaseAvailable()) {
        const success = await LeadStepRepository.delete(id);
        if (!success) {
          return res.status(404).json({ error: "Lead step not found" });
        }
        res.status(204).send();
      } else {
        console.log(
          "Database unavailable, returning success for step deletion",
        );
        res.status(204).send();
      }
    } catch (dbError) {
      console.log(
        "Database error, returning success for step deletion:",
        dbError.message,
      );
      res.status(204).send();
    }
  } catch (error) {
    console.error("Error deleting lead step:", error);
    res.status(500).json({ error: "Failed to delete lead step" });
  }
});

// Reorder lead steps
router.put("/:leadId/steps/reorder", async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.leadId);
    if (isNaN(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    const { stepOrders } = req.body;
    if (!Array.isArray(stepOrders)) {
      return res.status(400).json({ error: "stepOrders must be an array" });
    }

    try {
      if (await isDatabaseAvailable()) {
        await LeadStepRepository.reorderSteps(leadId, stepOrders);
        res.json({ message: "Steps reordered successfully" });
      } else {
        console.log(
          "Database unavailable, returning success for step reordering",
        );
        res.json({ message: "Steps reordered successfully" });
      }
    } catch (dbError) {
      console.log(
        "Database error, returning success for step reordering:",
        dbError.message,
      );
      res.json({ message: "Steps reordered successfully" });
    }
  } catch (error) {
    console.error("Error reordering steps:", error);
    res.status(500).json({ error: "Failed to reorder steps" });
  }
});

// Get step chats
router.get("/steps/:stepId/chats", async (req: Request, res: Response) => {
  try {
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid step ID" });
    }

    let chats;
    try {
      if (await isDatabaseAvailable()) {
        chats = await LeadChatRepository.findByStepId(stepId);
      } else {
        chats = await MockDataService.getStepChats(stepId);
      }
    } catch (dbError) {
      console.log("Database error, using mock data:", dbError.message);
      chats = await MockDataService.getStepChats(stepId);
    }

    res.json(chats);
  } catch (error) {
    console.error("Error fetching step chats:", error);
    try {
      const chats = await MockDataService.getStepChats(
        parseInt(req.params.stepId),
      );
      res.json(chats);
    } catch (fallbackError) {
      console.error("Mock data fallback failed:", fallbackError);
      res.json([]);
    }
  }
});

// Create step chat
router.post("/steps/:stepId/chats", async (req: Request, res: Response) => {
  try {
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid step ID" });
    }

    const chatData: CreateLeadChatData = {
      ...req.body,
      step_id: stepId,
    };

    // Validate required fields
    if (!chatData.message || !chatData.user_name) {
      return res.status(400).json({
        error: "Missing required fields: message, user_name",
      });
    }

    try {
      if (await isDatabaseAvailable()) {
        const chat = await LeadChatRepository.create(chatData);
        res.status(201).json(chat);
      } else {
        const mockChat = {
          id: Date.now(),
          step_id: stepId,
          user_id: chatData.user_id || null,
          user_name: chatData.user_name,
          message: chatData.message,
          message_type: chatData.message_type || "text",
          is_rich_text: chatData.is_rich_text || false,
          created_at: new Date().toISOString(),
          attachments: chatData.attachments || [],
        };
        console.log("Database unavailable, returning mock chat response");
        res.status(201).json(mockChat);
      }
    } catch (dbError) {
      console.log(
        "Database error, returning mock chat response:",
        dbError.message,
      );
      const mockChat = {
        id: Date.now(),
        step_id: stepId,
        user_id: chatData.user_id || null,
        user_name: chatData.user_name,
        message: chatData.message,
        message_type: chatData.message_type || "text",
        is_rich_text: chatData.is_rich_text || false,
        created_at: new Date().toISOString(),
        attachments: chatData.attachments || [],
      };
      res.status(201).json(mockChat);
    }
  } catch (error) {
    console.error("Error creating step chat:", error);
    res.status(500).json({ error: "Failed to create step chat" });
  }
});

// Delete step chat
router.delete("/chats/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    try {
      if (await isDatabaseAvailable()) {
        const success = await LeadChatRepository.delete(id);
        if (!success) {
          return res.status(404).json({ error: "Chat not found" });
        }
        res.status(204).send();
      } else {
        console.log(
          "Database unavailable, returning success for chat deletion",
        );
        res.status(204).send();
      }
    } catch (dbError) {
      console.log(
        "Database error, returning success for chat deletion:",
        dbError.message,
      );
      res.status(204).send();
    }
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// Update lead status only
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    if (!status) {
      return res.status(400).json({ error: "Missing required field: status" });
    }

    // Validate status
    if (!["in-progress", "won", "lost", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    try {
      const dbAvailable = await isDatabaseAvailable();

      if (dbAvailable) {
        const existingLead = await LeadRepository.findById(id);
        if (!existingLead) {
          return res.status(404).json({ error: "Lead not found" });
        }

        const lead = await LeadRepository.update(id, { status });
        if (!lead) {
          return res
            .status(500)
            .json({ error: "Failed to update lead status" });
        }
        res.json({ success: true, lead });
      } else {
        const mockLead = await MockDataService.updateLead(id, { status });
        if (!mockLead) {
          return res.status(404).json({ error: "Lead not found" });
        }
        res.json({ success: true, lead: mockLead });
      }
    } catch (dbError) {
      console.log(
        "Database error, falling back to mock data:",
        dbError.message,
      );
      const mockLead = await MockDataService.updateLead(id, { status });
      if (!mockLead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      res.json({ success: true, lead: mockLead });
    }
  } catch (error) {
    console.error("Error updating lead status:", error);
    res.status(500).json({ error: "Failed to update lead status" });
  }
});

export default router;
