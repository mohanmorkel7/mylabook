export interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  receivedDateTime?: string;
}

export interface MailConfig {
  id: number;
  from_email?: string;
  to_email?: string;
  subject_pattern?: string;
  body_content?: string;
  body_match_type?: "word" | "full";
  field_type?: string;
  field_value?: string;
}

/**
 * Convert email pattern with wildcards to regex pattern
 * Supports * (any characters) and ? (single character)
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Check if text matches a pattern
 */
export function matchPattern(
  pattern: string | undefined,
  text: string,
): boolean {
  if (!pattern || pattern.trim() === "") return true;
  try {
    const regex = patternToRegex(pattern);
    return regex.test(text);
  } catch (error) {
    console.error("Pattern matching error:", error);
    return false;
  }
}

/**
 * Check if email body contains content based on match type
 */
export function matchBodyContent(
  bodyContent: string | undefined,
  emailBody: string,
  matchType: "word" | "full" = "word",
): boolean {
  if (!bodyContent || bodyContent.trim() === "") return true;

  const normalizedBody = emailBody.toLowerCase();
  const normalizedContent = bodyContent.toLowerCase();

  if (matchType === "full") {
    return normalizedBody === normalizedContent;
  } else {
    return normalizedBody.includes(normalizedContent);
  }
}

/**
 * Check if email matches the mail config criteria
 * Returns true if all configured criteria match
 */
export function matchEmailAgainstConfig(
  email: Email,
  config: MailConfig,
): boolean {
  // Check from_email pattern
  if (config.from_email) {
    if (!matchPattern(config.from_email, email.from)) {
      return false;
    }
  }

  // Check to_email pattern
  if (config.to_email) {
    if (!matchPattern(config.to_email, email.to)) {
      return false;
    }
  }

  // Check subject_pattern
  if (config.subject_pattern) {
    if (!matchPattern(config.subject_pattern, email.subject)) {
      return false;
    }
  }

  // Check body_content with match type
  if (config.body_content) {
    if (
      !matchBodyContent(config.body_content, email.body, config.body_match_type)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Check if email has already been processed for this config
 */
export function hasEmailBeenProcessed(
  emailId: string,
  processedEmailIds: Set<string>,
): boolean {
  return processedEmailIds.has(emailId);
}
