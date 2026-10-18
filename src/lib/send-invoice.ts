import { getCustomer, getInvoice, setInvoiceEmailResult } from "./db";
import { sendInvoiceEmail } from "./mailer";

export async function deliverInvoice(id: number): Promise<
  | { sent: true; invoiceNumber: string }
  | { sent: false; invoiceNumber: string; error: string }
> {
  const savedInvoice = await getInvoice(id);
  if (!savedInvoice) {
    throw new Error("Invoice not found.");
  }
  const customer = await getCustomer(savedInvoice.customerId);
  if (!customer) {
    throw new Error("Invoice customer not found.");
  }

  try {
    await sendInvoiceEmail(savedInvoice, customer);
    await setInvoiceEmailResult(id, { sent: true });
    return { sent: true, invoiceNumber: savedInvoice.number };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The mail service returned an unknown error.";
    await setInvoiceEmailResult(id, { sent: false, error: message });
    return { sent: false, invoiceNumber: savedInvoice.number, error: message };
  }
}
