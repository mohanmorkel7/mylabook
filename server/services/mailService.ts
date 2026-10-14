import * as nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

let transporter: nodemailer.Transporter | null = null;

// SES_ENABLED=true sends through the AWS SES API using the default credential chain
// (IAM role on AWS, AWS_REGION from env). Otherwise messages are only logged as JSON.
function getTransporter() {
  if (transporter) return transporter;
  const sesEnabled = String(process.env.SES_ENABLED || "").toLowerCase() === "true";
  transporter = sesEnabled
    ? nodemailer.createTransport({
        SES: { sesClient: new SESv2Client({}), SendEmailCommand },
      } as nodemailer.TransportOptions)
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

export function sendMail(options: nodemailer.SendMailOptions) {
  return getTransporter().sendMail({
    from: process.env.MAIL_FROM || "finops@company.com",
    ...options,
  });
}
