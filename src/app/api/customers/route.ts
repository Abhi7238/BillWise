import { NextResponse } from "next/server";
import { addCustomer, getCustomers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCustomers());
  } catch (error) {
    console.error("Unable to load customers:", error);
    return NextResponse.json({ error: "Unable to load customers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Customer details are required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const company = typeof input.company === "string" ? input.company.trim() : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";

  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: "Enter a customer name between 1 and 120 characters." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid customer email address." }, { status: 400 });
  }
  if (company.length > 120 || address.length > 500) {
    return NextResponse.json({ error: "Company or address is too long." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await addCustomer({ name, email, company, address }),
      { status: 201 },
    );
  } catch (error) {
    console.error("Unable to save customer:", error);
    return NextResponse.json({ error: "Unable to save customer." }, { status: 500 });
  }
}
