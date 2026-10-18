import { NextResponse } from "next/server";
import { createInvoice, getCustomer, getDashboardData } from "@/lib/db";
import { deliverInvoice } from "@/lib/send-invoice";
import type { InvoiceItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json((await getDashboardData()).invoices);
  } catch (error) {
    console.error("Unable to load invoices:", error);
    return NextResponse.json({ error: "Unable to load invoices." }, { status: 500 });
  }
}

function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invoice details are required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const customerId = Number(input.customerId);
  const itemsInput = input.items;
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";

  if (!Number.isSafeInteger(customerId) || customerId < 1) {
    return NextResponse.json({ error: "Select a valid customer." }, { status: 400 });
  }
  try {
    if (!(await getCustomer(customerId))) {
      return NextResponse.json({ error: "The selected customer could not be found." }, { status: 400 });
    }
  } catch (error) {
    console.error("Unable to verify invoice customer:", error);
    return NextResponse.json({ error: "Unable to verify the selected customer." }, { status: 500 });
  }
  if (!isDate(input.issueDate) || !isDate(input.dueDate) || input.dueDate < input.issueDate) {
    return NextResponse.json(
      { error: "Enter valid issue and due dates; the due date must not be earlier." },
      { status: 400 },
    );
  }
  if (!Array.isArray(itemsInput) || itemsInput.length === 0 || itemsInput.length > 100) {
    return NextResponse.json({ error: "Add between 1 and 100 invoice items." }, { status: 400 });
  }
  if (notes.length > 2000) {
    return NextResponse.json({ error: "Notes must be 2,000 characters or fewer." }, { status: 400 });
  }

  const items: InvoiceItem[] = [];
  for (const item of itemsInput) {
    if (!item || typeof item !== "object") {
      return NextResponse.json({ error: "Each invoice item must be valid." }, { status: 400 });
    }
    const line = item as Record<string, unknown>;
    const description = typeof line.description === "string" ? line.description.trim() : "";
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (
      !description ||
      description.length > 240 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 100000 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > 100000000
    ) {
      return NextResponse.json(
        { error: "Enter a description, positive quantity, and valid non-negative unit price for every item." },
        { status: 400 },
      );
    }
    const roundedQuantity = Math.round(quantity * 1000) / 1000;
    const unitPriceCents = Math.round(unitPrice * 100);
    const amountCents = Math.round(roundedQuantity * unitPriceCents);
    if (!Number.isSafeInteger(amountCents)) {
      return NextResponse.json({ error: "An invoice item total is too large." }, { status: 400 });
    }
    items.push({ description, quantity: roundedQuantity, unitPriceCents, amountCents });
  }

  try {
    const invoice = await createInvoice({
      customerId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      notes,
      items,
    });
    const email = await deliverInvoice(invoice.id);
    return NextResponse.json({ invoiceNumber: invoice.number, email }, { status: 201 });
  } catch (error) {
    console.error("Unable to create invoice:", error);
    const message = error instanceof Error ? error.message : "Unable to create invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
