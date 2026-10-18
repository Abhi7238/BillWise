import nodemailer from "nodemailer";
import { createInvoicePdf } from "./invoice-document";
import type { Customer, Invoice } from "./types";

const businessName = process.env.BUSINESS_NAME || "Your Business";

export async function sendInvoiceEmail(invoice: Invoice, customer: Customer): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error(
      "Email was not sent. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD, then retry.",
    );
  }

  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Email was not sent. SMTP_PORT must be a valid port number.");
  }

  const from = process.env.SMTP_FROM || SMTP_USER;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  const pdf = await createInvoicePdf(invoice, customer);
  await transporter.sendMail({
    from: { name: businessName, address: from },
    to: customer.email,
    replyTo: process.env.BUSINESS_EMAIL || undefined,
    subject: `Invoice ${invoice.number} from ${businessName}`,
    text: [
      `Hello ${customer.name},`,
      "",
      `Please find invoice ${invoice.number} attached.`,
      `The total due is ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: invoice.currency,
      }).format(invoice.totalCents / 100)}.`,
      `Payment is due on ${invoice.dueDate}.`,
      "",
      `Thank you,`,
      businessName,
    ].join("\n"),
    attachments: [
      {
        filename: `${invoice.number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });
}
