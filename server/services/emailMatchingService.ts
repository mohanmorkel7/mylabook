export interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  receivedDateTime?: string;
}

export interface EmailRule {
  id: string;
  fieldType: "From" | "To" | "Cc" | "Subject" | "Body";
  operator?: "Starts with" | "Contains" | "Ends with" | "domain";
  value: string;
  domain?: string;
  nextOperator: "AND" | "OR" | "END";
}

export interface SourceConfig {
  id: string;
  type: "Email" | "Slack";
  emailSource?: string;
  customEmailSource?: string;
  slackType?: "Channel" | "Workspace";
  slackName?: string;
  emailRules?: EmailRule[];
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
  sources?: SourceConfig[];
}

/**
 * Convert email pattern with wildcards to regex pattern
 * Supports * (any characters) and ? (single character)
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\\]\\]/g, "\\$&")
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

function normalizeText(input: string | undefined): string {
  return (input || "").toLowerCase();
}

function stripSubjectPrefixes(subject: string | undefined): string {
  if (!subject) return "";
  // Remove common prefixes like Re:, Fwd:, FW: (possibly repeated) and any surrounding whitespace
  let s = subject;
  // Remove sequences like Re: Re: or Fwd: Re:
  s = s.replace(/^((re|fwd|fw)[:\s]*)+/i, "");
  return s.trim();
}

function evaluateSingleRule(rule: EmailRule, email: Email): boolean {
  const fieldType = rule.fieldType;
  const operator = rule.operator || "Contains";
  const value = (rule.value || "").toLowerCase();
  const domain = (rule.domain || "").toLowerCase();

  let target = "";
  switch (fieldType) {
    case "Subject":
      // Normalize subject by stripping common prefixes like Re:, Fwd:, FW:, and trimming
      target = normalizeText(stripSubjectPrefixes(email.subject));
      break;
    case "Body":
      target = normalizeText(
        email.body ? email.body.replace(/<[^>]*>/g, "") : "",
      );
      break;
    case "From":
      target = normalizeText(email.from);
      break;
    case "To":
    case "Cc":
      target = normalizeText(email.to);
      break;
    default:
      target = "";
  }

  // Debug logging when enabled
  const debug = process.env.DEBUG_EMAIL_MATCHING === "true";
  if (debug) {
    try {
      console.log(
        `[emailMatching] Evaluating rule ${rule.id} field=${fieldType} operator=${operator} value="${value}" domain="${domain}" against target="${(target || "").substring(0, 200)}"`,
      );
    } catch (e) {
      // ignore
    }
  }

  if (operator === "domain") {
    // extract domain from target (take first email address if multiple)
    const match = target.match(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/i);
    if (!match) {
      if (debug)
        console.log(
          `[emailMatching] domain rule: no email address found in target for rule ${rule.id}`,
        );
      return false;
    }
    const actualDomain = match[2].toLowerCase();
    // normalize configured domain (allow values like "@razorpay.com" or "razorpay.com")
    const configuredDomain = domain.startsWith("@")
      ? domain.substring(1)
      : domain;
    const matches = actualDomain === configuredDomain;
    if (debug)
      console.log(
        `[emailMatching] domain check: actual=${actualDomain} configured=${configuredDomain} => ${matches}`,
      );
    return matches;
  }

  let result = false;
  if (operator === "Starts with") result = target.startsWith(value);
  else if (operator === "Ends with") result = target.endsWith(value);
  else result = target.includes(value); // default Contains

  if (debug)
    console.log(
      `[emailMatching] text check: operator=${operator} value="${value}" => ${result}`,
    );
  return result;
}

/**
 * Evaluate a chain of rules (respecting AND/OR/END operators)
 */
export function evaluateRuleChain(
  rules: EmailRule[] | undefined,
  email: Email,
): boolean {
  if (!rules || rules.length === 0) return true;

  // Evaluate sequentially combining with nextOperator of current rule
  let result = evaluateSingleRule(rules[0], email);

  for (let i = 1; i < rules.length; i++) {
    const prev = rules[i - 1];
    const op = prev.nextOperator || "END";
    if (op === "END") break;
    const currentVal = evaluateSingleRule(rules[i], email);
    if (op === "AND") {
      result = result && currentVal;
    } else if (op === "OR") {
      result = result || currentVal;
    }
  }

  return result;
}

/**
 * Check if email matches a given source's emailRules
 */
export function matchEmailAgainstSource(
  email: Email,
  source: SourceConfig,
): boolean {
  if (!source) return true;
  if (!source.emailRules || source.emailRules.length === 0) return true;
  return evaluateRuleChain(source.emailRules, email);
}

/**
 * Check if email matches the mail config criteria
 * Returns true if all configured criteria match
 */
export function matchEmailAgainstConfig(
  email: Email,
  config: MailConfig,
): boolean {
  // If config has sources, try to match any email source rules
  if (
    config.sources &&
    Array.isArray(config.sources) &&
    config.sources.length > 0
  ) {
    // If config.sources includes multiple sources, possibly only one applies.
    // We'll succeed if any source of type Email matches the email using its rules.
    for (const src of config.sources) {
      if (src.type === "Email") {
        // If this source has emailRules, evaluate them
        if (src.emailRules && src.emailRules.length > 0) {
          const ok = matchEmailAgainstSource(email, src);
          if (ok) return true;
        } else {
          // No rules for this source -> default accept
          return true;
        }
      }
    }
    // No email source matched
    return false;
  }

  // Support new field_type/field_value format with operators
  if (config.field_type && config.field_value) {
    const operator = (config as any).field_operator || "contains";
    // Use field_value_not when operator is 'does_not_contain' and value provided, otherwise fallback to field_value
    const valueToCheckRaw =
      operator === "does_not_contain"
        ? ((config as any).field_value_not || config.field_value)
        : config.field_value;
    const valueToCheck = (valueToCheckRaw || "").toLowerCase();

    let emailFieldValue = "";

    switch (config.field_type) {
      case "subject":
        emailFieldValue = normalizeText(stripSubjectPrefixes(email.subject));
        break;
      case "fromEmail":
        emailFieldValue = normalizeText(email.from);
        break;
      case "toEmail":
        emailFieldValue = normalizeText(email.to);
        break;
      case "body":
        // For body, use matchBodyContent helper instead of simple includes
        if (operator === "does_not_contain") {
          return !matchBodyContent(valueToCheckRaw, email.body || "", (config as any).body_match_type || "word");
        }
        return matchBodyContent(valueToCheckRaw, email.body || "", (config as any).body_match_type || "word");















      default:
        return false;
    }

    if (operator === "does_not_contain") {
      return !emailFieldValue.includes(valueToCheck);
    }

    // default: contains
    return emailFieldValue.includes(valueToCheck);
  }

  // Fall back to legacy field patterns
  if ((config as any).from_email) {
    if (!matchPattern((config as any).from_email, email.from)) {
      return false;
    }
  }

  if ((config as any).to_email) {
    if (!matchPattern((config as any).to_email, email.to)) {
      return false;
    }
  }

  if ((config as any).subject_pattern) {
    if (!matchPattern((config as any).subject_pattern, email.subject)) {
      return false;
    }
  }

  if ((config as any).body_content) {
    if (
      !matchBodyContent(
        (config as any).body_content,
        email.body,
        (config as any).body_match_type,
      )
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
