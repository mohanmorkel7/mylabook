import axios, { AxiosError } from "axios";

const MITRA_BASE_URL = process.env.MITRA_BASE_URL || "https://mitra.mylapay-dev.com";
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

    const response = await axios.post<MitraTicketResponse>(
      `${MITRA_BASE_URL}/issues.json`,
      payload,
      {
        headers: {
          "X-Redmine-API-Key": MITRA_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    if (response.data?.issue?.id) {
      return {
        success: true,
        ticketId: response.data.issue.id,
        response: response.data,
      };
    }

    return {
      success: false,
      error: "No ticket ID returned from Mitra",
      response: response.data,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage =
      axiosError.response?.data instanceof Object
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message;

    console.error("Error creating ticket in Mitra:", {
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message,
    });

    return {
      success: false,
      error: `Failed to create ticket in Mitra: ${errorMessage}`,
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

    const response = await axios.get(`${MITRA_BASE_URL}/projects.json`, {
      headers: {
        "X-Redmine-API-Key": MITRA_API_KEY,
      },
      timeout: 10000,
    });

    return response.data?.projects || [];
  } catch (error) {
    console.error("Error fetching projects from Mitra:", error);
    return [];
  }
}
