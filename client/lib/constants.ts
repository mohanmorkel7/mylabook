export const VC_TYPES = [
  { value: "early_stage", label: "Early Stage" },
  { value: "accelerator", label: "Accelerator" },
  { value: "growth", label: "Growth" },
  { value: "strategic_bank", label: "Strategic - Bank" },
  { value: "strategic_fintech", label: "Strategic - Fintech" },
  { value: "strategic_individual", label: "Strategic - Individual" },
  { value: "angel", label: "Angel" },
];

export const SECTOR_FOCUS = [
  { value: "fintech", label: "Fintech" },
  { value: "fintech_b2b", label: "Fintech -B2B" },
  { value: "fintech_saas", label: "Fintech - SaaS" },
  { value: "fintech_infrastructure", label: "Fintech - Infrastructure" },
  { value: "sector_agnostic", label: "Sector Agnostic" },
];

export const INVESTOR_FEEDBACK = [
  { value: "existing_investor", label: "Existing Investor" },
  { value: "general", label: "General" },
  { value: "pass", label: "Pass" },
  { value: "ghosting", label: "Ghosting" },
  { value: "potential_future", label: "Potential Future" },
];

// VC lead source options
export const VC_LEAD_SOURCES = [
  { value: "linkedin_outbound", label: "LinkedIn-Outbound" },
  { value: "linkedin_inbound", label: "LinkedIn - Inbound" },
  { value: "email_outbound", label: "Email - Outbound" },
  { value: "email_inbound", label: "Email - Inbound" },
  { value: "call_outbound", label: "Call - Outbound" },
  { value: "call_inbound", label: "Call - Inbound" },
  { value: "reference", label: "Reference" },
  { value: "general_list", label: "General List" },
] as const;

const SECTOR_FOCUS_MAP = new Map(SECTOR_FOCUS.map((s) => [s.value, s.label]));
const INVESTOR_FEEDBACK_MAP = new Map(
  INVESTOR_FEEDBACK.map((s) => [s.value, s.label]),
);
const VC_LEAD_SOURCE_MAP = new Map(
  VC_LEAD_SOURCES.map((s) => [s.value, s.label]),
);

export function getSectorLabel(value?: string | null): string {
  if (!value) return "";
  const key = value.trim();
  const mapped = SECTOR_FOCUS_MAP.get(key);
  if (mapped) return mapped;
  const prettified = key
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return prettified;
}

export function getInvestorFeedbackLabel(value?: string | null): string {
  if (!value) return "";
  const key = value.trim();
  return (
    INVESTOR_FEEDBACK_MAP.get(key) ||
    key
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function getSourceLabel(value?: string | null): string {
  if (!value) return "";
  const key = value.trim();
  return (
    VC_LEAD_SOURCE_MAP.get(key) ||
    key
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const COUNTRY_DIAL_CODES = new Map<string, string>([
  ["india", "+91"],
  ["united states", "+1"],
  ["usa", "+1"],
  ["united arab emirates", "+971"],
  ["uae", "+971"],
  ["saudi arabia", "+966"],
  ["ksa", "+966"],
  ["qatar", "+974"],
  ["kuwait", "+965"],
  ["bahrain", "+973"],
  ["singapore", "+65"],
  ["united kingdom", "+44"],
  ["uk", "+44"],
  ["canada", "+1"],
  ["australia", "+61"],
]);

function normalizeCountry(country?: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toLowerCase();
  if (!c) return null;
  return c;
}

function digitsOnly(s?: string | null): string {
  if (!s) return "";
  return String(s).replace(/\D+/g, "");
}

export function formatPhoneDisplay(
  phone?: string | null,
  country?: string | null,
): string {
  if (!phone) return "";
  const trimmed = String(phone).trim();
  if (/^(\+|00)/.test(trimmed)) return trimmed;
  const code = COUNTRY_DIAL_CODES.get(normalizeCountry(country) || "");
  return code ? `${code} ${trimmed}` : trimmed;
}

export function formatPhoneHref(
  phone?: string | null,
  country?: string | null,
): string {
  if (!phone) return "";
  const raw = String(phone).trim();
  if (raw.startsWith("+")) return `+${digitsOnly(raw)}`;
  if (raw.startsWith("00")) return `+${digitsOnly(raw.slice(2))}`;
  const code = COUNTRY_DIAL_CODES.get(normalizeCountry(country) || "");
  const number = digitsOnly(raw);
  return code ? `${code}${number}`.replace(/^\+\+/, "+") : number;
}
