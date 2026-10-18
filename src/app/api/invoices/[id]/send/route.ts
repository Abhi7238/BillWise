import { NextResponse } from "next/server";
import { deliverInvoice } from "@/lib/send-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  try {
    const result = await deliverInvoice(id);
    return NextResponse.json(result, { status: result.sent ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send invoice.";
    const status = message === "Invoice not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
