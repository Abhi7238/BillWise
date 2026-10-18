import { NextResponse } from "next/server";
import { getCustomer, getInvoice } from "@/lib/db";
import { createInvoicePdf } from "@/lib/invoice-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const invoice = await getInvoice(id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const customer = await getCustomer(invoice.customerId);
  if (!customer) {
    return NextResponse.json({ error: "Invoice customer not found." }, { status: 404 });
  }

  try {
    const pdf = await createInvoicePdf(invoice, customer);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`Unable to generate PDF for invoice ${invoice.number}:`, error);
    return NextResponse.json({ error: "Unable to generate invoice PDF." }, { status: 500 });
  }
}
