import postgres, { type Sql } from "postgres";
import type { Customer, DashboardData, Invoice, InvoiceItem } from "./types";

type CustomerRow = {
  id: number | string;
  name: string;
  email: string;
  company: string;
  address: string;
  createdAt: Date | string;
};

type InvoiceRow = {
  id: number | string;
  number: string;
  customerId: number | string;
  customerName: string;
  customerEmail: string;
  issueDate: string;
  dueDate: string;
  status: Invoice["status"];
  emailStatus: Invoice["emailStatus"];
  emailError: string | null;
  sentAt: Date | string | null;
  paidAt: Date | string | null;
  notes: string;
  subtotalCents: number | string;
  totalCents: number | string;
  currency: string;
  createdAt: Date | string;
};

type InvoiceItemRow = {
  id: number | string;
  description: string;
  quantity: number | string;
  unitPriceCents: number | string;
  amountCents: number | string;
};

let db: Sql | undefined;
let schemaReady: Promise<void> | undefined;

function getDb(): Promise<Sql> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL to your hosted PostgreSQL connection string.",
    );
  }

  db ??= postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  schemaReady ??= (async () => {
    await db!.unsafe(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id BIGSERIAL PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        customer_id BIGINT NOT NULL REFERENCES customers(id),
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
        email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
        email_error TEXT,
        sent_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        notes TEXT NOT NULL DEFAULT '',
        subtotal_cents BIGINT NOT NULL,
        total_cents BIGINT NOT NULL,
        currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id BIGSERIAL PRIMARY KEY,
        invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity DOUBLE PRECISION NOT NULL,
        unit_price_cents BIGINT NOT NULL,
        amount_cents BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_sequences (
        invoice_year INTEGER PRIMARY KEY,
        last_number INTEGER NOT NULL
      );
    `);
  })();

  return schemaReady.then(() => db!);
}

const currency = process.env.CURRENCY || "USD";
if (!/^[A-Z]{3}$/.test(currency)) {
  throw new Error("CURRENCY must be a three-letter ISO currency code such as USD.");
}
try {
  new Intl.NumberFormat("en-US", { style: "currency", currency });
} catch {
  throw new Error("CURRENCY must be a supported ISO currency code such as USD.");
}
const businessName = process.env.BUSINESS_NAME || "Your Business";

function customerFromRow(row: CustomerRow): Customer {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    company: row.company,
    address: row.address,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function invoiceFromRow(row: InvoiceRow, items: InvoiceItem[]): Invoice {
  return {
    id: Number(row.id),
    number: row.number,
    customerId: Number(row.customerId),
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    status: row.status,
    emailStatus: row.emailStatus,
    emailError: row.emailError,
    sentAt: row.sentAt == null ? null : new Date(row.sentAt).toISOString(),
    paidAt: row.paidAt == null ? null : new Date(row.paidAt).toISOString(),
    notes: row.notes,
    subtotalCents: Number(row.subtotalCents),
    totalCents: Number(row.totalCents),
    currency: row.currency,
    createdAt: new Date(row.createdAt).toISOString(),
    items,
  };
}

const invoiceSelect = `
  SELECT i.id, i.number, i.customer_id AS "customerId",
         c.name AS "customerName", c.email AS "customerEmail",
         TO_CHAR(i.issue_date, 'YYYY-MM-DD') AS "issueDate",
         TO_CHAR(i.due_date, 'YYYY-MM-DD') AS "dueDate",
         i.status, i.email_status AS "emailStatus", i.email_error AS "emailError",
         i.sent_at AS "sentAt", i.paid_at AS "paidAt", i.notes,
         i.subtotal_cents AS "subtotalCents", i.total_cents AS "totalCents",
         i.currency, i.created_at AS "createdAt"
  FROM invoices i JOIN customers c ON c.id = i.customer_id
`;

async function getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
  const sql = await getDb();
  const rows = await sql<InvoiceItemRow[]>`
    SELECT id, description, quantity,
           unit_price_cents AS "unitPriceCents", amount_cents AS "amountCents"
    FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY id
  `;

  return rows.map((item) => ({
    id: Number(item.id),
    description: item.description,
    quantity: Number(item.quantity),
    unitPriceCents: Number(item.unitPriceCents),
    amountCents: Number(item.amountCents),
  }));
}

export async function getCustomers(): Promise<Customer[]> {
  const sql = await getDb();
  const rows = await sql<CustomerRow[]>`
    SELECT id, name, email, company, address, created_at AS "createdAt"
    FROM customers ORDER BY LOWER(name)
  `;
  return rows.map(customerFromRow);
}

export async function getCustomer(id: number): Promise<Customer | undefined> {
  const sql = await getDb();
  const rows = await sql<CustomerRow[]>`
    SELECT id, name, email, company, address, created_at AS "createdAt"
    FROM customers WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ? customerFromRow(rows[0]) : undefined;
}

export async function addCustomer(
  input: Omit<Customer, "id" | "createdAt">,
): Promise<Customer> {
  const sql = await getDb();
  const rows = await sql<CustomerRow[]>`
    INSERT INTO customers (name, email, company, address)
    VALUES (${input.name}, ${input.email}, ${input.company}, ${input.address})
    RETURNING id, name, email, company, address, created_at AS "createdAt"
  `;
  if (!rows[0]) {
    throw new Error("Customer was saved but could not be loaded.");
  }
  return customerFromRow(rows[0]);
}

export async function createInvoice(input: {
  customerId: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  items: InvoiceItem[];
}): Promise<Invoice> {
  const subtotalCents = input.items.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(subtotalCents)) {
    throw new Error("Invoice total is too large.");
  }
  const sql = await getDb();
  const year = Number(input.issueDate.slice(0, 4));

  const id = await sql.begin(async (transaction) => {
    const sequence = await transaction<{ lastNumber: number }[]>`
      INSERT INTO invoice_sequences (invoice_year, last_number)
      VALUES (${year}, 1)
      ON CONFLICT (invoice_year)
      DO UPDATE SET last_number = invoice_sequences.last_number + 1
      RETURNING last_number AS "lastNumber"
    `;
    if (!sequence[0]) {
      throw new Error("Unable to reserve an invoice number.");
    }
    const number = `INV-${year}-${String(sequence[0].lastNumber).padStart(4, "0")}`;
    const invoices = await transaction<{ id: number | string }[]>`
      INSERT INTO invoices (
        number, customer_id, issue_date, due_date, notes,
        subtotal_cents, total_cents, currency
      )
      VALUES (
        ${number}, ${input.customerId}, ${input.issueDate}, ${input.dueDate}, ${input.notes},
        ${subtotalCents}, ${subtotalCents}, ${currency}
      )
      RETURNING id
    `;
    if (!invoices[0]) {
      throw new Error("Invoice was saved but could not be loaded.");
    }

    for (const item of input.items) {
      await transaction`
        INSERT INTO invoice_items (
          invoice_id, description, quantity, unit_price_cents, amount_cents
        )
        VALUES (
          ${invoices[0].id}, ${item.description}, ${item.quantity},
          ${item.unitPriceCents}, ${item.amountCents}
        )
      `;
    }
    return Number(invoices[0].id);
  });

  const invoice = await getInvoice(id);
  if (!invoice) {
    throw new Error("Invoice was saved but could not be loaded.");
  }
  return invoice;
}

export async function getInvoice(id: number): Promise<Invoice | undefined> {
  const sql = await getDb();
  const rows = await sql.unsafe<InvoiceRow[]>(
    `${invoiceSelect} WHERE i.id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) {
    return undefined;
  }
  return invoiceFromRow(rows[0], await getInvoiceItems(id));
}

export async function getDashboardData(): Promise<DashboardData> {
  const sql = await getDb();
  const [customers, rows] = await Promise.all([
    getCustomers(),
    sql.unsafe<InvoiceRow[]>(
      `${invoiceSelect} ORDER BY i.created_at DESC, i.id DESC`,
    ),
  ]);
  const invoices = await Promise.all(
    rows.map(async (row) =>
      invoiceFromRow(row, await getInvoiceItems(Number(row.id))),
    ),
  );
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const totalInvoicedCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const outstandingCents = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const paidCents = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const overdueCount = invoices.filter(
    (invoice) => invoice.status !== "paid" && invoice.dueDate < today,
  ).length;

  return {
    customers,
    invoices,
    currency,
    businessName,
    mailConfigured: Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD,
    ),
    stats: { totalInvoicedCents, outstandingCents, paidCents, overdueCount },
  };
}

export async function setInvoiceEmailResult(
  id: number,
  result: { sent: true } | { sent: false; error: string },
): Promise<void> {
  const sql = await getDb();
  if (result.sent) {
    await sql`
      UPDATE invoices SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'sent' END,
        email_status = 'sent', email_error = NULL, sent_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE invoices SET email_status = 'failed', email_error = ${result.error}
      WHERE id = ${id}
    `;
  }
}

export async function markInvoicePaid(id: number): Promise<boolean> {
  const sql = await getDb();
  const rows = await sql<{ id: number }[]>`
    UPDATE invoices SET status = 'paid', paid_at = NOW()
    WHERE id = ${id} AND status != 'paid'
    RETURNING id
  `;
  return rows.length > 0;
}
