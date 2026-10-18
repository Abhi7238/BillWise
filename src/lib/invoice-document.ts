import PDFDocument from "pdfkit";
import type { Customer, Invoice } from "./types";

const businessName = process.env.BUSINESS_NAME || "Your Business";
const businessEmail = process.env.BUSINESS_EMAIL || "";
const businessAddress = process.env.BUSINESS_ADDRESS || "";

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function createInvoicePdf(invoice: Invoice, customer: Customer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 54 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.font("Helvetica-Bold").fontSize(24).fillColor("#173f35").text(businessName);
    document.font("Helvetica").fontSize(9).fillColor("#64716c");
    if (businessAddress) document.text(businessAddress);
    if (businessEmail) document.text(businessEmail);
    document.moveDown(2);

    document.font("Helvetica-Bold").fontSize(30).fillColor("#18231f").text("INVOICE");
    document.moveDown(0.4);
    document.font("Helvetica").fontSize(11).fillColor("#64716c").text(invoice.number);
    document.moveDown(1.6);

    const left = 54;
    const right = 310;
    document.font("Helvetica-Bold").fontSize(9).fillColor("#64716c").text("BILL TO", left);
    document.font("Helvetica-Bold").fontSize(12).fillColor("#18231f").text(customer.name, left, document.y + 7);
    document.font("Helvetica").fontSize(10).fillColor("#64716c").text(customer.company || customer.email);
    if (customer.company) document.text(customer.email);
    if (customer.address) document.text(customer.address);

    const metaY = document.y - 45;
    document.font("Helvetica-Bold").fontSize(9).fillColor("#64716c").text("ISSUED", right, metaY);
    document.font("Helvetica").fontSize(10).fillColor("#18231f").text(invoice.issueDate, right, metaY + 14);
    document.font("Helvetica-Bold").fontSize(9).fillColor("#64716c").text("DUE DATE", right, metaY + 42);
    document.font("Helvetica").fontSize(10).fillColor("#18231f").text(invoice.dueDate, right, metaY + 56);

    const tableY = Math.max(document.y, metaY + 92) + 28;
    document
      .rect(left, tableY, 487, 30)
      .fill("#f1f5f2");
    document.fillColor("#64716c").font("Helvetica-Bold").fontSize(9);
    document.text("DESCRIPTION", left + 10, tableY + 10);
    document.text("QTY", 330, tableY + 10, { width: 40, align: "right" });
    document.text("RATE", 380, tableY + 10, { width: 65, align: "right" });
    document.text("AMOUNT", 455, tableY + 10, { width: 75, align: "right" });

    let rowY = tableY + 43;
    document.font("Helvetica").fontSize(10).fillColor("#18231f");
    for (const item of invoice.items) {
      document.text(item.description, left + 10, rowY, { width: 245 });
      document.text(String(item.quantity), 330, rowY, { width: 40, align: "right" });
      document.text(formatMoney(item.unitPriceCents, invoice.currency), 380, rowY, {
        width: 65,
        align: "right",
      });
      document.text(formatMoney(item.amountCents, invoice.currency), 455, rowY, {
        width: 75,
        align: "right",
      });
      rowY = Math.max(document.y, rowY + 24) + 8;
      document
        .moveTo(left, rowY - 2)
        .lineTo(541, rowY - 2)
        .strokeColor("#e6ebe8")
        .stroke();
    }

    rowY += 18;
    document.font("Helvetica").fontSize(11).fillColor("#64716c").text("Total due", 380, rowY);
    document
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#173f35")
      .text(formatMoney(invoice.totalCents, invoice.currency), 455, rowY - 2, {
        width: 75,
        align: "right",
      });

    if (invoice.notes) {
      document.moveDown(4);
      document.font("Helvetica-Bold").fontSize(9).fillColor("#64716c").text("NOTE");
      document.moveDown(0.4);
      document.font("Helvetica").fontSize(10).fillColor("#18231f").text(invoice.notes);
    }
    document.end();
  });
}
