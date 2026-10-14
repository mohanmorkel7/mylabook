export const INTERNAL_EMAIL_TEMPLATE = {
  subject: "Invoice approval required: {invoiceNumber} ({clientName})",
  body: [
    "Invoice {invoiceNumber} for {clientName} is ready for approval.",
    "Amount: {amount}",
    "",
    "Approval OTP: {otp}",
    "",
    "The finance team must enter this exact 6-digit OTP to approve the invoice. The invoice PDF is attached.",
  ].join("\n"),
};

export function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}
