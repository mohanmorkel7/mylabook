const MITRA_BASE_URL =
  process.env.MITRA_BASE_URL || "https://mitra.mylapay-dev.com";
const MITRA_API_KEY = process.env.MITRA_API_KEY || "";

export interface MitraTicketPayload {
  issue: {
    project_id: number;
    subject: string;
    description: string;
    assigned_to_id: number;
    priority_id: number;
    watcher_user_ids?: number[];
  };
}

export interface MitraTicketResponse {
  issue: {
    id: number;
    project: {
      id: number;
      name: string;
    };
    subject: string;
    [key: string]: any;
  };
}

export interface CreateTicketResult {
  success: boolean;
  ticketId?: number;
  error?: string;
  response?: MitraTicketResponse;
}

/**
 * Create a ticket in Mitra from an email that matched a config
 */
export async function createTicketInMitra(
  config: any,
  emailData: {
    subject: string;
    body: string;
    from?: string;
  },
): Promise<CreateTicketResult> {
  try {
    if (!MITRA_API_KEY) {
      return {
        success: false,
        error: "MITRA_API_KEY is not configured",
      };
    }

    const payload: MitraTicketPayload = {
      issue: {
        project_id: config.project_id,
        subject: emailData.subject,
        description: emailData.body,
        assigned_to_id: config.assigned_to_id,
        priority_id: config.priority_id,
        watcher_user_ids: config.watcher_user_ids || [],
      },
    };

    const response = await fetch(`${MITRA_BASE_URL}/issues.json`, {
      method: "POST",
      headers: {
        "X-Redmine-API-Key": MITRA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
      );
    }

    const data: MitraTicketResponse = await response.json();

    if (data?.issue?.id) {
      return {
        success: true,
        ticketId: data.issue.id,
        response: data,
      };
    }

    return {
      success: false,
      error: "No ticket ID returned from Mitra",
      response: data,
    };
  } catch (error: any) {
    console.error("Error creating ticket in Mitra:", error);

    return {
      success: false,
      error: `Failed to create ticket in Mitra: ${error.message || error}`,
    };
  }
}

/**
 * Validate that the config has all required fields for Mitra ticket creation
 */
export function validateConfigForMitra(config: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.project_id) {
    errors.push("project_id is required");
  }

  if (!config.assigned_to_id) {
    errors.push("assigned_to_id is required");
  }

  if (!config.priority_id) {
    errors.push("priority_id is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get available projects from Mitra (for validation and UI)
 */
export async function getAvailableProjects(): Promise<any[]> {
  try {
    if (!MITRA_API_KEY) {
      console.warn("MITRA_API_KEY not configured");
      return [];
    }

    const response = await fetch(`${MITRA_BASE_URL}/projects.json`, {
      headers: {
        "X-Redmine-API-Key": MITRA_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data?.projects || [];
  } catch (error) {
    console.error("Error fetching projects from Mitra:", error);
    return [];
  }
}
