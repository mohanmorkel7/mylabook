import { apiClient } from "@/lib/api";

export interface FollowUpStatusChangeData {
  followUpId: number;
  newStatus: string;
  stepId?: number;
  userId: number;
  userName: string;
  followUpTitle?: string;
  isVC?: boolean;
  stepApiBase?: "vc" | "fund-raises" | "leads" | "business-offerings";
}

/**
 * Creates a system chat message when a follow-up status changes
 */

export async function notifyFollowUpStatusChange(
  data: FollowUpStatusChangeData,
) {
  const {
    followUpId,
    newStatus,
    stepId,
    userId,
    userName,
    followUpTitle,
    isVC,
    stepApiBase,
  } = data;

  console.log("Follow-up notification data:", data);

  if (!stepId) {
    console.warn("No step ID provided for follow-up status notification");
    return null;
  }

  let message = "";
  let messageType: "system" | "text" = "system";

  // Unified plain system message without emojis
  switch (newStatus) {
    case "completed":
      message = `Step status changed to "Completed" by ${userName}`;
      break;
    case "in_progress":
      message = `Step status changed to "In Progress" by ${userName}`;
      break;
    case "overdue":
      message = `Step status changed to "Overdue" by ${userName}`;
      break;
    default:
      message = `Step status changed to "${newStatus}" by ${userName}`;
      break;
  }

  const chatData = {
    user_id: userId,
    user_name: userName,
    message,
    message_type: messageType,
    is_rich_text: false,
  };

  try {
    console.log(
      "Creating chat notification for step:",
      stepId,
      "with data:",
      chatData,
    );
    // Determine API base
    const base = stepApiBase || (isVC ? "vc" : "leads");

    const endpoint = `/${base}/steps/${stepId}/chats`;
    console.log("Using endpoint:", endpoint);

    const result = await apiClient.request<any>(endpoint, {
      method: "POST",
      body: JSON.stringify(chatData),
    });

    console.log(
      `Follow-up status notification added to step ${stepId}:`,
      result,
    );
    return result;
  } catch (error) {
    console.error("Failed to create follow-up status notification:", error);
    return null;
  }
}

/**
 * Enhanced follow-up status update that includes chat notification
 */
export async function updateFollowUpStatusWithNotification(
  followUpId: number,
  statusData: { status: string; completed_at?: string | null },
  notificationData: Omit<FollowUpStatusChangeData, "followUpId" | "newStatus">,
) {
  try {
    // Update the follow-up status
    const updateResponse = await apiClient.updateFollowUpStatus(
      followUpId,
      statusData,
    );

    // Create chat notification for status change
    if (notificationData.stepId) {
      await notifyFollowUpStatusChange({
        followUpId,
        newStatus: statusData.status,
        ...notificationData,
      });
    }

    return updateResponse;
  } catch (error) {
    console.error(
      "Failed to update follow-up status with notification:",
      error,
    );
    throw error;
  }
}
