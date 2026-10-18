"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Customer, DashboardData, Invoice } from "@/lib/types";

type Section = "Overview" | "Invoices" | "Customers";
type LineDraft = { description: string; quantity: string; unitPrice: string };
const EMPTY_INVOICES: Invoice[] = [];
const EMPTY_CUSTOMERS: Customer[] = [];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "The request could not be completed.";
    throw new Error(message);
  }
  return result as T;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function displayDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function invoiceStatus(invoice: Invoice): "Paid" | "Overdue" | "Sent" | "Draft" {
  if (invoice.status === "paid") return "Paid";
  if (invoice.dueDate < localIsoDate(new Date())) return "Overdue";
  return invoice.status === "sent" ? "Sent" : "Draft";
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("Overview");
  const [dialog, setDialog] = useState<"invoice" | "customer" | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { description: "", quantity: "1", unitPrice: "" },
  ]);

  const refresh = useCallback(async () => {
    const result = await requestJson<DashboardData>("/api/dashboard");
    setData(result);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestJson<DashboardData>("/api/dashboard")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load your billing data.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const invoices = data?.invoices ?? EMPTY_INVOICES;
  const customers = data?.customers ?? EMPTY_CUSTOMERS;
  const currency = data?.currency ?? "USD";
  const shownInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedInvoices = section === "Overview" ? invoices.slice(0, 5) : invoices;
    if (!query) return selectedInvoices;
    return selectedInvoices.filter(
      (invoice) =>
        invoice.number.toLowerCase().includes(query) ||
        invoice.customerName.toLowerCase().includes(query) ||
        invoice.customerEmail.toLowerCase().includes(query),
    );
  }, [invoices, search, section]);

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await requestJson<Customer>("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          company: form.get("company"),
          address: form.get("address"),
        }),
      });
      await refresh();
      setDialog(null);
      setNotice("Customer added.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save customer.");
    } finally {
      setBusy(false);
    }
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson<{
        invoiceNumber: string;
        email: { sent: boolean; error?: string };
      }>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.get("customerId"),
          issueDate: form.get("issueDate"),
          dueDate: form.get("dueDate"),
          notes: form.get("notes"),
          items: lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        }),
      });
      await refresh();
      setDialog(null);
      setSection("Invoices");
      setLines([{ description: "", quantity: "1", unitPrice: "" }]);
      setNotice(
        result.email.sent
          ? `${result.invoiceNumber} created and emailed with its PDF attached.`
          : `${result.invoiceNumber} created, but email failed: ${result.email.error ?? "Check your SMTP settings."}`,
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(invoice: Invoice) {
    setError("");
    try {
      await requestJson(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
      });
      await refresh();
      setNotice(`Payment recorded for ${invoice.number}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to record payment.");
    }
  }

  async function resendInvoice(invoice: Invoice) {
    setError("");
    try {
      await requestJson(`/api/invoices/${invoice.id}/send`, { method: "POST" });
      await refresh();
      setNotice(`${invoice.number} emailed successfully.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to send invoice.");
    }
  }

  async function logOut() {
    setLoggingOut(true);
    setError("");
    try {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
      window.location.replace("/login");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to sign out.");
      setLoggingOut(false);
    }
  }

  function openDialog(nextDialog: "invoice" | "customer") {
    setError("");
    if (nextDialog === "invoice") {
      const today = new Date();
      setIssueDate(localIsoDate(today));
      const due = new Date(today);
      due.setDate(due.getDate() + 30);
      setDueDate(localIsoDate(due));
    }
    setDialog(nextDialog);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Billwise home">
          <span className="brand-mark">b</span>
          <span>billwise<span className="brand-period">.</span></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <span className="workspace-avatar">
            {(data?.businessName || "B").trim().slice(0, 1).toUpperCase()}
          </span>
          <span className="workspace-name">{data?.businessName || "Your business"}</span>
          <span className="workspace-chevron">⌄</span>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <div className="nav-label">MENU</div>
          {(["Overview", "Invoices", "Customers"] as Section[]).map((item) => (
            <button
              className={`nav-item ${section === item ? "active" : ""}`}
              key={item}
              onClick={() => {
                setSection(item);
                setSearch("");
              }}
            >
              <span className={`nav-icon nav-icon-${item.toLowerCase()}`} aria-hidden="true">
                {item === "Overview" ? "◫" : item === "Invoices" ? "▤" : "♙"}
              </span>
              {item}
              {item === "Invoices" && invoices.length > 0 && (
                <span className="nav-count">{invoices.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className={`mail-setup ${data?.mailConfigured ? "configured" : ""}`}>
            <span className="mail-dot" />
            <div>
              <strong>{data?.mailConfigured ? "Email settings ready" : "Email not connected"}</strong>
              <span>{data?.mailConfigured ? "Invoices are ready to send" : "Set up SMTP to send invoices"}</span>
            </div>
          </div>
          <div className="sidebar-foot">BILLWISE <span>·</span> PERSONAL</div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span>{section}</div>
          <div className="topbar-right">
            <span className="secure-note"><span className="secure-dot" /> Your workspace</span>
            <span className="profile-avatar">{(data?.businessName || "B").trim().slice(0, 1).toUpperCase()}</span>
            <button className="logout-button" onClick={logOut} disabled={loggingOut}>
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <div className="page-content">
          {error && !dialog && (
            <div className="inline-alert" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
            </div>
          )}
          {section === "Overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR BUSINESS AT A GLANCE</div>
                  <h1>Good day<span className="heading-dot">.</span></h1>
                  <p>Here&apos;s what&apos;s happening with your invoices.</p>
                </div>
                <button className="primary-button" onClick={() => openDialog("invoice")}>
                  <span aria-hidden="true">＋</span> Create invoice
                </button>
              </div>

              <div className="stats-grid">
                <StatCard
                  label="Total invoiced"
                  value={formatMoney(data?.stats.totalInvoicedCents ?? 0, currency)}
                  hint={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} created`}
                  accent="green"
                />
                <StatCard
                  label="Outstanding"
                  value={formatMoney(data?.stats.outstandingCents ?? 0, currency)}
                  hint={`${invoices.filter((invoice) => invoice.status !== "paid").length} awaiting payment`}
                  accent="amber"
                />
                <StatCard
                  label="Collected"
                  value={formatMoney(data?.stats.paidCents ?? 0, currency)}
                  hint="Payments recorded manually"
                  accent="blue"
                />
                <StatCard
                  label="Overdue"
                  value={String(data?.stats.overdueCount ?? 0).padStart(2, "0")}
                  hint="Invoices past their due date"
                  accent="rose"
                />
              </div>

              {!data?.mailConfigured && (
                <div className="setup-banner">
                  <div className="setup-icon">✉</div>
                  <div className="setup-copy">
                    <strong>Connect your email to send invoices automatically</strong>
                    <span>Add your SMTP details to <code>.env.local</code>. Your invoice will still be saved if sending is not configured.</span>
                  </div>
                  <span className="setup-guide-note">See README for SMTP setup</span>
                </div>
              )}

              <InvoiceTable
                invoices={shownInvoices}
                currency={currency}
                loading={loading}
                search={search}
                onSearch={setSearch}
                onPaid={markPaid}
                onResend={resendInvoice}
                onViewAll={() => setSection("Invoices")}
                onCreate={() => openDialog("invoice")}
              />

              <div className="bottom-grid">
                <section className="info-card">
                  <div className="card-heading">
                    <div><span className="eyebrow">YOUR PEOPLE</span><h2>Customers</h2></div>
                    <button className="text-button" onClick={() => setSection("Customers")}>View all <span>→</span></button>
                  </div>
                  {customers.length === 0 ? (
                    <p className="quiet-empty">Your customer list will show up here.</p>
                  ) : (
                    <div className="customer-preview-list">
                      {customers.slice(0, 4).map((customer) => (
                        <CustomerPreview key={customer.id} customer={customer} />
                      ))}
                    </div>
                  )}
                </section>
                <section className="tip-card">
                  <span className="tip-spark">✳</span>
                  <div className="eyebrow">A LITTLE TIP</div>
                  <h2>Make getting paid feel effortless.</h2>
                  <p>Every invoice is neatly formatted and ready to send as a PDF attachment.</p>
                  <button className="tip-action" onClick={() => openDialog("invoice")}>Create your next invoice <span>→</span></button>
                </section>
              </div>
            </>
          )}

          {section === "Invoices" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">KEEP EVERY DETAIL IN ONE PLACE</div>
                  <h1>Your invoices<span className="heading-dot">.</span></h1>
                  <p>Create, send, and keep track of every bill.</p>
                </div>
                <button className="primary-button" onClick={() => openDialog("invoice")}><span aria-hidden="true">＋</span> Create invoice</button>
              </div>
              <InvoiceTable
                invoices={shownInvoices}
                currency={currency}
                loading={loading}
                search={search}
                onSearch={setSearch}
                onPaid={markPaid}
                onResend={resendInvoice}
                onCreate={() => openDialog("invoice")}
              />
            </>
          )}

          {section === "Customers" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE PEOPLE YOU WORK WITH</div>
                  <h1>Your customers<span className="heading-dot">.</span></h1>
                  <p>A tidy list of the people and businesses you bill.</p>
                </div>
                <button className="primary-button" onClick={() => openDialog("customer")}><span aria-hidden="true">＋</span> Add customer</button>
              </div>
              <section className="table-card customer-table-card">
                <div className="table-toolbar">
                  <div><h2>All customers</h2><span className="table-subtitle">{customers.length} saved contact{customers.length === 1 ? "" : "s"}</span></div>
                  <SearchBox value={search} onChange={setSearch} placeholder="Search customers..." />
                </div>
                {loading ? <div className="table-message">Loading customers…</div> : customers.length === 0 ? (
                  <EmptyState
                    title="Your customer list starts here"
                    description="Add a customer and you’ll be ready to create your first invoice."
                    action="Add your first customer"
                    onAction={() => openDialog("customer")}
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="invoice-table customer-table">
                      <thead><tr><th>CUSTOMER</th><th>COMPANY</th><th>EMAIL</th><th>ADDED</th></tr></thead>
                      <tbody>
                        {customers.filter((customer) => {
                          const query = search.trim().toLowerCase();
                          return !query || `${customer.name} ${customer.company} ${customer.email}`.toLowerCase().includes(query);
                        }).map((customer) => (
                          <tr key={customer.id}>
                            <td><CustomerPreview customer={customer} /></td>
                            <td>{customer.company || <span className="muted-cell">—</span>}</td>
                            <td><a className="customer-email" href={`mailto:${customer.email}`}>{customer.email}</a></td>
                            <td className="date-cell">{new Date(customer.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="page-footer"><span>Made for the business you&apos;re building.</span><span>Simple billing, less busywork <b>✳</b></span></footer>
        </div>
      </section>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

      {dialog === "customer" && (
        <Modal title="Add a customer" subtitle="Keep their details handy for the next invoice." onClose={() => setDialog(null)}>
          <form className="modal-form" onSubmit={submitCustomer}>
            <Field label="Customer name" name="name" placeholder="e.g. Jamie Parker" required />
            <Field label="Email address" name="email" type="email" placeholder="jamie@example.com" required />
            <Field label="Company" name="company" placeholder="Company name (optional)" />
            <label className="field">
              <span>Billing address <small>OPTIONAL</small></span>
              <textarea name="address" rows={2} placeholder="Street, city, postal code" />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button>
              <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save customer"}</button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "invoice" && (
        <Modal title="Create an invoice" subtitle="A polished invoice, ready for your customer’s inbox." onClose={() => setDialog(null)} wide>
          {customers.length === 0 ? (
            <div className="invoice-needs-customer">
              <span className="empty-icon">♙</span>
              <h3>Add a customer first</h3>
              <p>Every invoice needs a customer and an email address.</p>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setDialog(null)}>Cancel</button>
                <button className="primary-button" onClick={() => openDialog("customer")}>Add customer</button>
              </div>
            </div>
          ) : (
            <form className="modal-form" onSubmit={submitInvoice}>
              <label className="field">
                <span>Bill to</span>
                <select name="customerId" required defaultValue="">
                  <option value="" disabled>Select a customer</option>
                  {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.email}</option>)}
                </select>
              </label>
              <div className="field-row">
                <Field label="Issue date" name="issueDate" type="date" defaultValue={issueDate} required />
                <Field label="Due date" name="dueDate" type="date" defaultValue={dueDate} required />
              </div>
              <div className="line-items-heading">
                <div><span className="eyebrow">WHAT YOU&apos;RE BILLING FOR</span><strong>Line items</strong></div>
                <span className="amount-heading">AMOUNT</span>
              </div>
              {lines.map((line, index) => (
                <div className="line-item-row" key={index}>
                  <label className="field line-description">
                    {index === 0 && <span>Description</span>}
                    <input
                      value={line.description}
                      onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}
                      placeholder="e.g. Design consultation"
                      maxLength={240}
                      required
                    />
                  </label>
                  <label className="field line-quantity">
                    {index === 0 && <span>Qty</span>}
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))}
                      required
                    />
                  </label>
                  <label className="field line-price">
                    {index === 0 && <span>Rate ({currency})</span>}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item))}
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <div className="line-total">
                    {formatMoney(Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100), currency)}
                    {lines.length > 1 && <button type="button" className="remove-line" aria-label="Remove line item" onClick={() => setLines(lines.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
                  </div>
                </div>
              ))}
              <button type="button" className="add-line-button" onClick={() => setLines([...lines, { description: "", quantity: "1", unitPrice: "" }])}>＋ Add line item</button>
              <div className="invoice-total-preview"><span>Total due</span><strong>{formatMoney(lines.reduce((total, line) => total + Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100), 0), currency)}</strong></div>
              <label className="field">
                <span>Note <small>OPTIONAL</small></span>
                <textarea name="notes" rows={2} maxLength={2000} placeholder="A thank you, payment details, or anything else your customer should know." />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <p className="send-note"><span>✉</span> Your invoice will be emailed automatically when you create it.</p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button>
                <button className="primary-button" disabled={busy}>{busy ? "Creating & sending…" : "Create & send invoice"}</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: string }) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span>{label}</span><span className={`stat-mark ${accent}`} /></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-hint">{hint}</span>
      <span className={`stat-glow ${accent}`} />
    </article>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="search-box">
      <span aria-hidden="true">⌕</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button type="button" onClick={() => onChange("")} aria-label="Clear search">×</button>}
    </label>
  );
}

function InvoiceTable({
  invoices,
  currency,
  loading,
  search,
  onSearch,
  onPaid,
  onResend,
  onViewAll,
  onCreate,
}: {
  invoices: Invoice[];
  currency: string;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onPaid: (invoice: Invoice) => void;
  onResend: (invoice: Invoice) => void;
  onViewAll?: () => void;
  onCreate: () => void;
}) {
  return (
    <section className="table-card">
      <div className="table-toolbar">
        <div><h2>{onViewAll ? "Recent invoices" : "All invoices"}</h2><span className="table-subtitle">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}{onViewAll ? " to keep an eye on" : " in your workspace"}</span></div>
        <div className="table-tools">
          <SearchBox value={search} onChange={onSearch} placeholder="Search invoices..." />
          {onViewAll && <button className="text-button view-all" onClick={onViewAll}>View all <span>→</span></button>}
        </div>
      </div>
      {loading ? <div className="table-message">Loading invoices…</div> : invoices.length === 0 ? (
        search ? <div className="table-message">No invoices match “{search}”.</div> : (
          <EmptyState
            title="Your first invoice is a few clicks away"
            description="Add a customer, list what you’re billing for, and we’ll prepare a PDF invoice."
            action="Create your first invoice"
            onAction={onCreate}
          />
        )
      ) : (
        <div className="table-scroll">
          <table className="invoice-table">
            <thead><tr><th>INVOICE</th><th>CUSTOMER</th><th>ISSUED</th><th>DUE DATE</th><th>STATUS</th><th>AMOUNT</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {invoices.map((invoice) => {
                const status = invoiceStatus(invoice);
                return (
                  <tr key={invoice.id}>
                    <td><a className="invoice-number" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">{invoice.number}</a><span className={`email-status ${invoice.emailStatus === "sent" ? "email-sent" : "email-failed"}`}>{invoice.emailStatus === "sent" ? "Email sent" : invoice.emailStatus === "failed" ? "Email failed" : "Not emailed"}</span></td>
                    <td><div className="customer-cell"><span className="customer-avatar">{invoice.customerName.trim().slice(0, 1).toUpperCase()}</span><div><strong>{invoice.customerName}</strong><span>{invoice.customerEmail}</span></div></div></td>
                    <td className="date-cell">{displayDate(invoice.issueDate)}</td>
                    <td className="date-cell">{displayDate(invoice.dueDate)}</td>
                    <td><span className={`status-pill status-${status.toLowerCase()}`}><span />{status}</span></td>
                    <td className="amount-cell">{formatMoney(invoice.totalCents, currency)}</td>
                    <td><div className="row-actions">
                      {invoice.emailStatus !== "sent" && <button className="row-action" title={invoice.emailError || "Send invoice email"} onClick={() => onResend(invoice)}>Send</button>}
                      {invoice.status !== "paid" && <button className="row-action mark-paid" onClick={() => onPaid(invoice)}>Mark paid</button>}
                      <a className="pdf-action" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" aria-label={`Open PDF for ${invoice.number}`}>PDF ↗</a>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CustomerPreview({ customer }: { customer: Customer }) {
  return (
    <div className="customer-cell">
      <span className="customer-avatar">{customer.name.trim().slice(0, 1).toUpperCase()}</span>
      <div><strong>{customer.name}</strong><span>{customer.email}</span></div>
    </div>
  );
}

function EmptyState({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">▤</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="primary-button" onClick={onAction}><span>＋</span>{action}</button>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, defaultValue, required }: { label: string; name: string; type?: string; placeholder?: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} />
    </label>
  );
}

function Modal({ title, subtitle, onClose, wide, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
