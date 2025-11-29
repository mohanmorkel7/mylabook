export function findMatchingRule(email: Email, source: SourceConfig): EmailRule | null {
  if (!source || !source.emailRules || source.emailRules.length === 0) return null;
  for (const rule of source.emailRules) {
    try {
      if (evaluateSingleRule(rule as any, email)) return rule as EmailRule;
    } catch (e) {
      // ignore
    }
  }
  return null;
}
