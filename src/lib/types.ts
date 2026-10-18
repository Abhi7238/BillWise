export type Customer = {
  id: number;
  name: string;
  email: string;
  company: string;
  address: string;
  createdAt: string;
};

export type InvoiceItem = {
  id?: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type InvoiceStatus = "draft" | "sent" | "paid";
export type EmailStatus = "pending" | "sent" | "failed";

export type Invoice = {
  id: number;
  number: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  emailStatus: EmailStatus;
  emailError: string | null;
  sentAt: string | null;
  paidAt: string | null;
  notes: string;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: InvoiceItem[];
};

export type DashboardData = {
  customers: Customer[];
  invoices: Invoice[];
  stats: {
    totalInvoicedCents: number;
    outstandingCents: number;
    paidCents: number;
    overdueCount: number;
  };
  currency: string;
  businessName: string;
  mailConfigured: boolean;
};
