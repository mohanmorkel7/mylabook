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
  operator?:
    | "Starts with"
    | "Contains"
    | "Ends with"
    | "domain"
    | "Does not contain";
  value: string;
  domain?: string;
  nextOperator: "AND" | "OR" | "END";
  // optional routing metadata
  bucket?: string | null;
  demand?: number | null;
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
  let s = subject;
  s = s.replace(/^((re|fwd|fw)[:\s]*)+/i, "");
  return s.trim();
}

export function evaluateSingleRule(rule: EmailRule, email: Email): boolean {
  const fieldType = rule.fieldType;
  const operatorRaw = rule.operator || "Contains";
  const operator = String(operatorRaw).toLowerCase().replace(/_/g, " ").trim();
  const value = (rule.value || "").toLowerCase();
  const domain = (rule.domain || "").toLowerCase();

  let target = "";
  switch (fieldType) {
    case "Subject":
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

  const debug = process.env.DEBUG_EMAIL_MATCHING === "true";
  if (debug) {
    try {
      console.log(
        `[emailMatching] Evaluating rule ${rule.id} field=${fieldType} operator=${operator} value="${value}" domain="${domain}" against target="${(target || "").substring(0, 200)}"`,
      );
    } catch (e) {}
  }

  if (operator === "domain") {
    const match = target.match(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/i);
    if (!match) {
      if (debug)
        console.log(
          `[emailMatching] domain rule: no email address found in target for rule ${rule.id}`,
        );
      return false;
    }
    const actualDomain = match[2].toLowerCase();
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

  // Special-case: when operator is 'does not contain' and value looks like an email address,
  // check parsed addresses in the target for exact equality first (more reliable than substring checks).
  if (operator === "does not contain" && value.includes("@")) {
    const addrRegex = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
    const found = (target.match(addrRegex) || []).map((s) => s.toLowerCase());
    if (found.includes(value)) {
      result = false; // value present => does not contain should fail
    } else {
      result = !target.includes(value);
    }
  } else if (operator === "starts with") result = target.startsWith(value);
  else if (operator === "ends with") result = target.endsWith(value);
  else if (operator === "does not contain") result = !target.includes(value);
  else result = target.includes(value);

  if (debug)
    console.log(
      `[emailMatching] text check: operator=${operator} value="${value}" => ${result} (target excerpt: "${(target || "").substring(0, 120)}")`,
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
  let result = evaluateSingleRule(rules[0], email);
  for (let i = 1; i < rules.length; i++) {
    const prev = rules[i - 1];
    const op = prev.nextOperator || "END";
    if (op === "END") break;
    const currentVal = evaluateSingleRule(rules[i], email);
    if (op === "AND") result = result && currentVal;
    else if (op === "OR") result = result || currentVal;
  }
  return result;
}

export function matchEmailAgainstSource(
  email: Email,
  source: SourceConfig,
): boolean {
  if (!source) return true;
  if (!source.emailRules || source.emailRules.length === 0) return true;
  return evaluateRuleChain(source.emailRules, email);
}

export function matchEmailAgainstConfig(
  email: Email,
  config: MailConfig,
): boolean {
  if (
    config.sources &&
    Array.isArray(config.sources) &&
    config.sources.length > 0
  ) {
    for (const src of config.sources) {
      if (src.type === "Email") {
        if (src.emailRules && src.emailRules.length > 0) {
          const ok = matchEmailAgainstSource(email, src);
          if (ok) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  }

  if (config.field_type && config.field_value) {
    const operatorRaw = String((config as any).field_operator || "contains");
    const operatorNorm = operatorRaw
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
      .trim();
    const valueToCheckRaw = config.field_value;
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
        if (operatorNorm === "does not contain") {
          return !matchBodyContent(
            valueToCheckRaw,
            email.body || "",
            (config as any).body_match_type || "word",
          );
        }
        return matchBodyContent(
          valueToCheckRaw,
          email.body || "",
          (config as any).body_match_type || "word",
        );
      default:
        return false;
    }

    if (operatorNorm === "does not contain") {
      return !emailFieldValue.includes(valueToCheck);
    }

    return emailFieldValue.includes(valueToCheck);
  }

  if ((config as any).from_email) {
    if (!matchPattern((config as any).from_email, email.from)) return false;
  }
  if ((config as any).to_email) {
    if (!matchPattern((config as any).to_email, email.to)) return false;
  }
  if ((config as any).subject_pattern) {
    if (!matchPattern((config as any).subject_pattern, email.subject))
      return false;
  }
  if ((config as any).body_content) {
    if (
      !matchBodyContent(
        (config as any).body_content,
        email.body,
        (config as any).body_match_type,
      )
    )
      return false;
  }
  return true;
}

export function hasEmailBeenProcessed(
  emailId: string,
  processedEmailIds: Set<string>,
): boolean {
  return processedEmailIds.has(emailId);
}

export function findMatchingRule(
  email: Email,
  source: SourceConfig,
): EmailRule | null {
  if (!source || !source.emailRules || source.emailRules.length === 0)
    return null;
  for (const rule of source.emailRules) {
    try {
      if (evaluateSingleRule(rule as any, email)) return rule as EmailRule;
    } catch (e) {
      // ignore
    }
  }
  return null;
}
