"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";

async function readError(response: Response): Promise<string> {
  const result: unknown = await response.json();
  if (result && typeof result === "object" && "error" in result) {
    return String(result.error);
  }
  return "Unable to sign in.";
}

export default function LoginForm({ authConfigured }: { authConfigured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const next = new URLSearchParams(window.location.search).get("from");
      window.location.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <Link className="brand login-brand" href="/" aria-label="Billwise home">
          <Image className="brand-mark" src="/brand-logo.png" alt="" width={32} height={25} />
          <span>billwise<span className="brand-period">.</span></span>
        </Link>
        <div className="eyebrow">YOUR PRIVATE BILLING WORKSPACE</div>
        <h1>Welcome back<span className="heading-dot">.</span></h1>
        <p className="login-intro">Sign in to manage your customers and invoices.</p>
        {!authConfigured ? (
          <div className="login-setup" role="status">
            <strong>Finish setting up secure access</strong>
            <span>
              Add <code>BILLING_APP_PASSWORD</code> and <code>AUTH_SECRET</code> in the deployment environment.
              Use a password of at least 16 characters and a random secret of at least 32 characters.
            </span>
          </div>
        ) : (
          <form className="modal-form login-form" onSubmit={submit}>
            <label className="field">
              <span>Password</span>
              <input type="password" name="password" autoComplete="current-password" required autoFocus />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
        <div className="login-foot"><span className="secure-dot" /> Private and protected</div>
      </section>
    </main>
  );
}
