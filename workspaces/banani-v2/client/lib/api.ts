const API_BASE_URL = "/api";

export class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    };

    try {
      console.log("Making API request to:", url);
      const response = await fetch(url, config);

      if (!response.ok) {
        // Handle specific status codes
        if (response.status === 401) {
          throw new Error("Invalid credentials");
        }

        let errorText: string = "";
        try {
          // Clone the response to avoid consuming the stream
          const clonedResponse = response.clone();
          errorText = await clonedResponse.text();
        } catch (textError) {
          // If we can't read the response body, provide a generic error
          throw new Error(`Authentication failed (${response.status})`);
        }

        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            throw new Error(
              errorData.error || `HTTP error! status: ${response.status}`,
            );
          } catch {
            throw new Error(
              `HTTP error! status: ${response.status} - ${errorText}`,
            );
          }
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      // Handle no content responses
      if (response.status === 204) {
        return {} as T;
      }

      try {
        return await response.json();
      } catch (jsonError) {
        throw new Error("Invalid JSON response from server");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("API request failed:", errorMessage, "URL:", url);

      if (error instanceof TypeError) {
        if (error.message.includes("Failed to fetch")) {
          throw new Error(
            "Network error: Cannot connect to server. Please check your internet connection or try again later.",
          );
        }
        if (error.message.includes("body stream")) {
          throw new Error("Network error: Please try again");
        }
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error("An unexpected error occurred");
    }
  }

  // Auth methods
  async login(email: string, password: string) {
    return this.request("/users/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // User methods
  async getUsers() {
    return this.request("/users");
  }

  async getUser(id: number) {
    return this.request(`/users/${id}`);
  }

  async createUser(userData: any) {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id: number, userData: any) {
    return this.request(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(id: number) {
    return this.request(`/users/${id}`, {
      method: "DELETE",
    });
  }

  // Client methods
  async getClients(salesRepId?: number) {
    const params = salesRepId ? `?salesRep=${salesRepId}` : "";
    return this.request(`/clients${params}`);
  }

  async getClient(id: number) {
    return this.request(`/clients/${id}`);
  }

  async createClient(clientData: any) {
    return this.request("/clients", {
      method: "POST",
      body: JSON.stringify(clientData),
    });
  }

  async updateClient(id: number, clientData: any) {
    return this.request(`/clients/${id}`, {
      method: "PUT",
      body: JSON.stringify(clientData),
    });
  }

  async deleteClient(id: number) {
    return this.request(`/clients/${id}`, {
      method: "DELETE",
    });
  }

  async getClientStats() {
    return this.request("/clients/stats");
  }

  // Template methods
  async getTemplates() {
    return this.request("/templates");
  }

  async getTemplate(id: number) {
    return this.request(`/templates/${id}`);
  }

  async createTemplate(templateData: any) {
    return this.request("/templates", {
      method: "POST",
      body: JSON.stringify(templateData),
    });
  }

  async updateTemplate(id: number, templateData: any) {
    return this.request(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(templateData),
    });
  }

  async deleteTemplate(id: number) {
    return this.request(`/templates/${id}`, {
      method: "DELETE",
    });
  }

  async duplicateTemplate(templateId: number, createdBy?: number) {
    return this.request(`/templates/${templateId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ created_by: createdBy || 1 }),
    });
  }

  // Deployment methods
  async getDeployments(assigneeId?: number) {
    const params = assigneeId ? `?assignee=${assigneeId}` : "";
    return this.request(`/deployments${params}`);
  }

  async getDeployment(id: number) {
    return this.request(`/deployments/${id}`);
  }

  async createDeployment(deploymentData: any) {
    return this.request("/deployments", {
      method: "POST",
      body: JSON.stringify(deploymentData),
    });
  }

  async updateDeployment(id: number, deploymentData: any) {
    return this.request(`/deployments/${id}`, {
      method: "PUT",
      body: JSON.stringify(deploymentData),
    });
  }

  async updateDeploymentStatus(id: number, status: string) {
    return this.request(`/deployments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  async deleteDeployment(id: number) {
    return this.request(`/deployments/${id}`, {
      method: "DELETE",
    });
  }

  async getDeploymentStats() {
    return this.request("/deployments/stats");
  }

  async getProducts() {
    return this.request("/deployments/products/list");
  }

  // Onboarding methods
  async getClientOnboardingSteps(clientId: number) {
    return this.request(`/onboarding/clients/${clientId}/steps`);
  }

  async createOnboardingStep(clientId: number, stepData: any) {
    return this.request(`/onboarding/clients/${clientId}/steps`, {
      method: "POST",
      body: JSON.stringify(stepData),
    });
  }

  async updateOnboardingStep(stepId: number, stepData: any) {
    return this.request(`/onboarding/steps/${stepId}`, {
      method: "PUT",
      body: JSON.stringify(stepData),
    });
  }

  async deleteOnboardingStep(stepId: number) {
    return this.request(`/onboarding/steps/${stepId}`, {
      method: "DELETE",
    });
  }

  async reorderOnboardingSteps(
    clientId: number,
    stepOrders: { id: number; order: number }[],
  ) {
    return this.request(`/onboarding/clients/${clientId}/steps/reorder`, {
      method: "PUT",
      body: JSON.stringify({ stepOrders }),
    });
  }

  async getStepDocuments(stepId: number) {
    return this.request(`/onboarding/steps/${stepId}/documents`);
  }

  async uploadStepDocument(stepId: number, documentData: any) {
    return this.request(`/onboarding/steps/${stepId}/documents`, {
      method: "POST",
      body: JSON.stringify(documentData),
    });
  }

  async deleteStepDocument(documentId: number) {
    return this.request(`/onboarding/documents/${documentId}`, {
      method: "DELETE",
    });
  }

  async getStepComments(stepId: number) {
    return this.request(`/onboarding/steps/${stepId}/comments`);
  }

  async createStepComment(stepId: number, commentData: any) {
    return this.request(`/onboarding/steps/${stepId}/comments`, {
      method: "POST",
      body: JSON.stringify(commentData),
    });
  }

  async deleteStepComment(commentId: number) {
    return this.request(`/onboarding/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  // Lead methods
  async getLeads(salesRepId?: number) {
    const params = salesRepId ? `?salesRep=${salesRepId}` : "";
    return this.request(`/leads${params}`);
  }

  async getLead(id: number) {
    return this.request(`/leads/${id}`);
  }

  async createLead(leadData: any) {
    return this.request("/leads", {
      method: "POST",
      body: JSON.stringify(leadData),
    });
  }

  async updateLead(id: number, leadData: any) {
    return this.request(`/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(leadData),
    });
  }

  async deleteLead(id: number) {
    return this.request(`/leads/${id}`, {
      method: "DELETE",
    });
  }

  async getLeadStats(salesRepId?: number) {
    const params = salesRepId ? `?salesRep=${salesRepId}` : "";
    return this.request(`/leads/stats${params}`);
  }

  // Lead steps methods
  async getLeadSteps(leadId: number) {
    return this.request(`/leads/${leadId}/steps`);
  }

  async createLeadStep(leadId: number, stepData: any) {
    return this.request(`/leads/${leadId}/steps`, {
      method: "POST",
      body: JSON.stringify(stepData),
    });
  }

  async updateLeadStep(stepId: number, stepData: any) {
    return this.request(`/leads/steps/${stepId}`, {
      method: "PUT",
      body: JSON.stringify(stepData),
    });
  }

  async deleteLeadStep(stepId: number) {
    return this.request(`/leads/steps/${stepId}`, {
      method: "DELETE",
    });
  }

  async reorderLeadSteps(
    leadId: number,
    stepOrders: { id: number; order: number }[],
  ) {
    return this.request(`/leads/${leadId}/steps/reorder`, {
      method: "PUT",
      body: JSON.stringify({ stepOrders }),
    });
  }

  // Lead chat methods
  async getStepChats(stepId: number) {
    return this.request(`/leads/steps/${stepId}/chats`);
  }

  async createStepChat(stepId: number, chatData: any) {
    return this.request(`/leads/steps/${stepId}/chats`, {
      method: "POST",
      body: JSON.stringify(chatData),
    });
  }

  async deleteStepChat(chatId: number) {
    return this.request(`/leads/chats/${chatId}`, {
      method: "DELETE",
    });
  }

  // File upload method
  async uploadFiles(files: FileList) {
    const formData = new FormData();

    Array.from(files).forEach((file) => {
      formData.append("files", file);
    });

    const url = `${API_BASE_URL}/files/upload`;

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        // Don't set Content-Type header, let browser set it with boundary
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("An unexpected error occurred during upload");
    }
  }

  // Follow-up methods
  async getAllFollowUps(params?: {
    userId?: string;
    userRole?: string;
    status?: string;
    assigned_to?: string;
  }) {
    try {
      const searchParams = new URLSearchParams();
      if (params?.userId) searchParams.append("userId", params.userId);
      if (params?.userRole) searchParams.append("userRole", params.userRole);
      if (params?.status) searchParams.append("status", params.status);
      if (params?.assigned_to)
        searchParams.append("assigned_to", params.assigned_to);

      const queryString = searchParams.toString();
      const endpoint = `/follow-ups${queryString ? `?${queryString}` : ""}`;

      console.log("Fetching follow-ups from:", endpoint);
      const result = await this.request(endpoint);
      console.log(
        "Follow-ups fetch successful, got",
        Array.isArray(result) ? result.length : "non-array",
        "items",
      );
      return result;
    } catch (error) {
      console.error("Failed to fetch follow-ups:", error);

      // Check if it's a network error vs server error
      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch")
      ) {
        console.error("Network error - server may be unreachable");
      }

      // Return empty array as fallback to prevent crashes
      return [];
    }
  }

  async createFollowUp(followUpData: any) {
    return this.request("/follow-ups", {
      method: "POST",
      body: JSON.stringify(followUpData),
    });
  }

  async getClientFollowUps(clientId: number) {
    return this.request(`/follow-ups/client/${clientId}`);
  }

  async getLeadFollowUps(leadId: number) {
    return this.request(`/follow-ups/lead/${leadId}`);
  }

  async updateFollowUpStatus(followUpId: number, statusData: any) {
    return this.request(`/follow-ups/${followUpId}`, {
      method: "PATCH",
      body: JSON.stringify(statusData),
    });
  }

  // Ticketing API methods
  async getTicketMetadata() {
    return this.request<{
      priorities: any[];
      statuses: any[];
      categories: any[];
    }>("/tickets/metadata");
  }

  async getTickets(filters?: any, page?: number, limit?: number) {
    let endpoint = "/tickets";
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, String(value));
        }
      });
    }

    if (page) params.append("page", String(page));
    if (limit) params.append("limit", String(limit));

    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    return this.request<{
      tickets: any[];
      total: number;
      pages: number;
    }>(endpoint);
  }

  async getTicketById(id: number) {
    return this.request<any>(`/tickets/${id}`);
  }

  async getTicketByTrackId(trackId: string) {
    return this.request<any>(`/tickets/track/${trackId}`);
  }

  async createTicket(ticketData: any, attachments?: File[]) {
    const formData = new FormData();

    // Add ticket data
    Object.entries(ticketData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    // Add attachments
    if (attachments) {
      attachments.forEach((file) => {
        formData.append("attachments", file);
      });
    }

    return this.request<any>("/tickets", {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  async updateTicket(id: number, updateData: any) {
    return this.request<any>(`/tickets/${id}`, {
      method: "PUT",
      body: JSON.stringify(updateData),
    });
  }

  async deleteTicket(id: number) {
    return this.request<void>(`/tickets/${id}`, {
      method: "DELETE",
    });
  }

  async getTicketComments(ticketId: number) {
    return this.request<any[]>(`/tickets/${ticketId}/comments`);
  }

  async addTicketComment(ticketId: number, commentData: any) {
    return this.request<any>(`/tickets/${ticketId}/comments`, {
      method: "POST",
      body: JSON.stringify(commentData),
    });
  }

  async getTicketNotifications(userId: string, unreadOnly?: boolean) {
    let endpoint = `/tickets/notifications/${userId}`;
    if (unreadOnly) {
      endpoint += "?unread_only=true";
    }
    return this.request<any[]>(endpoint);
  }

  async markNotificationAsRead(notificationId: number) {
    return this.request<void>(`/tickets/notifications/${notificationId}/read`, {
      method: "PUT",
    });
  }

  async uploadTicketAttachment(
    ticketId: number,
    file: File,
    commentId?: number,
    userId?: string,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    if (commentId) formData.append("comment_id", String(commentId));
    if (userId) formData.append("user_id", userId);

    return this.request<any>(`/tickets/${ticketId}/attachments`, {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  // Enhanced Template API methods
  async getTemplateCategories() {
    return this.request<any[]>("/templates/categories");
  }

  async getTemplatesByCategory(categoryId: number) {
    return this.request<any[]>(`/templates/category/${categoryId}`);
  }

  async getTemplatesWithCategories() {
    return this.request<any[]>("/templates/with-categories");
  }

  async getTemplateStats() {
    return this.request<any>("/templates/stats");
  }

  async searchTemplates(searchTerm: string, categoryId?: number) {
    let endpoint = `/templates/search?q=${encodeURIComponent(searchTerm)}`;
    if (categoryId) {
      endpoint += `&category=${categoryId}`;
    }
    return this.request<any[]>(endpoint);
  }

  async getStepCategories() {
    return this.request<any[]>("/templates/step-categories");
  }

  async recordTemplateUsage(
    templateId: number,
    entityType: string,
    entityId: number,
  ) {
    return this.request<void>(`/templates/${templateId}/usage`, {
      method: "POST",
      body: JSON.stringify({ entityType, entityId }),
    });
  }

  // FinOps API methods
  async getFinOpsDashboard() {
    return this.request("/finops/dashboard");
  }

  async getFinOpsMetrics(
    period?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const params = new URLSearchParams();
    if (period) params.append("period", period);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    const query = params.toString();
    return this.request(`/finops/metrics${query ? `?${query}` : ""}`);
  }

  async getFinOpsAccounts() {
    return this.request("/finops/accounts");
  }

  async createFinOpsAccount(accountData: any) {
    return this.request("/finops/accounts", {
      method: "POST",
      body: JSON.stringify(accountData),
    });
  }

  async getFinOpsTransactions(limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());

    const query = params.toString();
    return this.request(`/finops/transactions${query ? `?${query}` : ""}`);
  }

  async getFinOpsTransaction(id: number) {
    return this.request(`/finops/transactions/${id}`);
  }

  async createFinOpsTransaction(transactionData: any) {
    return this.request("/finops/transactions", {
      method: "POST",
      body: JSON.stringify(transactionData),
    });
  }

  async getFinOpsBudgets() {
    return this.request("/finops/budgets");
  }

  async createFinOpsBudget(budgetData: any) {
    return this.request("/finops/budgets", {
      method: "POST",
      body: JSON.stringify(budgetData),
    });
  }

  async getFinOpsInvoices() {
    return this.request("/finops/invoices");
  }

  async createFinOpsInvoice(invoiceData: any) {
    return this.request("/finops/invoices", {
      method: "POST",
      body: JSON.stringify(invoiceData),
    });
  }

  async getFinOpsCosts(referenceType?: string, referenceId?: number) {
    const params = new URLSearchParams();
    if (referenceType) params.append("reference_type", referenceType);
    if (referenceId) params.append("reference_id", referenceId.toString());

    const query = params.toString();
    return this.request(`/finops/costs${query ? `?${query}` : ""}`);
  }

  async createFinOpsCost(costData: any) {
    return this.request("/finops/costs", {
      method: "POST",
      body: JSON.stringify(costData),
    });
  }

  async generateFinOpsReport(reportData: any) {
    return this.request("/finops/reports/generate", {
      method: "POST",
      body: JSON.stringify(reportData),
    });
  }

  async exportFinOpsData(
    type: string,
    format?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const params = new URLSearchParams();
    if (format) params.append("format", format);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    const query = params.toString();
    return this.request(`/finops/export/${type}${query ? `?${query}` : ""}`);
  }

  // Workflow API methods
  async getWorkflowDashboard(userId: number, userRole: string) {
    return this.request(
      `/workflow/dashboard?userId=${userId}&userRole=${userRole}`,
    );
  }

  async getWorkflowProjects(userId?: number, userRole?: string) {
    const params = new URLSearchParams();
    if (userId) params.append("userId", userId.toString());
    if (userRole) params.append("userRole", userRole);

    const query = params.toString();
    return this.request(`/workflow/projects${query ? `?${query}` : ""}`);
  }

  async getWorkflowProject(id: number) {
    return this.request(`/workflow/projects/${id}`);
  }

  async createWorkflowProject(projectData: any) {
    return this.request("/workflow/projects", {
      method: "POST",
      body: JSON.stringify(projectData),
    });
  }

  async createProjectFromLead(leadId: number, projectData: any) {
    return this.request(`/workflow/projects/from-lead/${leadId}`, {
      method: "POST",
      body: JSON.stringify(projectData),
    });
  }

  async getProjectSteps(projectId: number) {
    return this.request(`/workflow/projects/${projectId}/steps`);
  }

  async updateStepStatus(stepId: number, status: string, updatedBy: number) {
    return this.request(`/workflow/steps/${stepId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, updated_by: updatedBy }),
    });
  }

  async getProjectComments(projectId: number, stepId?: number) {
    const params = new URLSearchParams();
    if (stepId) params.append("stepId", stepId.toString());

    const query = params.toString();
    return this.request(
      `/workflow/projects/${projectId}/comments${query ? `?${query}` : ""}`,
    );
  }

  async createProjectComment(projectId: number, commentData: any) {
    return this.request(`/workflow/projects/${projectId}/comments`, {
      method: "POST",
      body: JSON.stringify(commentData),
    });
  }

  async getWorkflowNotifications(userId: number, unreadOnly?: boolean) {
    const params = new URLSearchParams();
    params.append("userId", userId.toString());
    if (unreadOnly) params.append("unreadOnly", "true");

    const query = params.toString();
    return this.request(`/workflow/notifications?${query}`);
  }

  async markNotificationAsRead(notificationId: number) {
    return this.request(`/workflow/notifications/${notificationId}/read`, {
      method: "PATCH",
    });
  }

  async getWorkflowAutomations() {
    return this.request("/workflow/automations");
  }

  async triggerAutomation(automationId: number) {
    return this.request(`/workflow/automations/${automationId}/trigger`, {
      method: "POST",
    });
  }

  async getCompletedLeads() {
    return this.request("/workflow/leads/completed");
  }

  async reorderProjectSteps(
    projectId: number,
    stepOrders: { id: number; order: number }[],
  ) {
    return this.request(`/workflow/projects/${projectId}/steps/reorder`, {
      method: "POST",
      body: JSON.stringify({ stepOrders }),
    });
  }

  // Update project status
  async updateProjectStatus(projectId: number, status: string) {
    return this.request(`/workflow/projects/${projectId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  // Update lead status
  async updateLeadStatus(leadId: number, status: string) {
    return this.request(`/leads/${leadId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  async createProjectFollowUp(projectId: number, followUpData: any) {
    return this.request(`/workflow/projects/${projectId}/follow-ups`, {
      method: "POST",
      body: JSON.stringify(followUpData),
    });
  }
}

export const apiClient = new ApiClient();
