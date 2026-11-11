import * as nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

let transporter: nodemailer.Transporter | null = null;

// SES_ENABLED=true sends through the AWS SES API using the default credential chain
// (IAM role on AWS, AWS_REGION from env). Otherwise messages are only logged as JSON.
function getTransporter() {
  if (transporter) return transporter;
  const sesEnabled = String(process.env.SES_ENABLED || "").toLowerCase() === "true";
  const isLocalEnvironment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (!sesEnabled && !isLocalEnvironment) {
    throw new Error("AWS SES is disabled. Set SES_ENABLED=true to send email outside development and tests.");
  }
  if (sesEnabled && !process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    throw new Error("AWS_REGION must be set when AWS SES is enabled.");
  }
  transporter = sesEnabled
    ? nodemailer.createTransport({
        SES: { sesClient: new SESv2Client({}), SendEmailCommand },
      } as nodemailer.TransportOptions)
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

export function sendMail(options: nodemailer.SendMailOptions) {
  if (process.env.NODE_ENV === "production" && !process.env.MAIL_FROM) {
    throw new Error("MAIL_FROM must be set to a verified SES sender in production.");
  }
  return getTransporter().sendMail({
    from: process.env.MAIL_FROM || "finops@company.com",
    ...options,
  });
}
