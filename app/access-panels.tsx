"use client";

import { FormEvent, useState } from "react";

type Mode = "setup" | "login";

export function AuthPanel({ mode, onSuccess }: { mode: Mode; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await getCsrfToken();
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Finchmail-CSRF": token },
        body: JSON.stringify({ email, password, ...(mode === "setup" ? { setupToken } : {}) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="access-page">
    <section className="access-card">
      <div className="access-brand"><div className="brand-mark"><span /><span /><span /></div><span className="brand-name">finch<span>mail</span></span></div>
      <div className="access-kicker">A QUIETER INBOX</div>
      <h1>{mode === "setup" ? "Make this space yours." : "Welcome back."}</h1>
      <p>{mode === "setup" ? "Create the owner account for your private mail space." : "Sign in to pick up where you left off."}</p>
      <form onSubmit={submit} className="access-form">
        <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} /></label>
        <label>Password<input type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "setup" ? "At least 12 characters" : "Your password"} required minLength={mode === "setup" ? 12 : 1} maxLength={128} /></label>
        {mode === "setup" && <label>One-time setup key<input type="password" autoComplete="off" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} placeholder="Set INITIAL_SETUP_TOKEN on your server" required maxLength={256} /></label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="access-submit" disabled={busy}>{busy ? "One moment…" : mode === "setup" ? "Create private space" : "Sign in"}</button>
      </form>
      <div className="access-footnote"><span className="status-dot" />Your mailbox stays on your server.</div>
    </section>
    <div className="access-quote">A little room to breathe.<span>Finchmail is yours, and yours alone.</span></div>
  </main>;
}

export function AccountPanel({ onConnected, onCancel }: { onConnected: () => void; onCancel?: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
      const secureValue = (key: string) => data.get(key) === "tls";
    const payload = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      imapHost: String(data.get("imapHost") ?? ""),
      imapPort: Number(data.get("imapPort")),
      imapSecure: secureValue("imapSecure"),
      imapUsername: String(data.get("imapUsername") ?? ""),
      imapPassword: String(data.get("imapPassword") ?? ""),
      smtpHost: String(data.get("smtpHost") ?? ""),
      smtpPort: Number(data.get("smtpPort")),
      smtpSecure: secureValue("smtpSecure"),
      smtpUsername: String(data.get("smtpUsername") ?? ""),
      smtpPassword: String(data.get("smtpPassword") ?? ""),
    };
    try {
      const { token } = await getCsrfToken();
      const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json", "X-Finchmail-CSRF": token }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not connect this account.");
      onConnected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect this account.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="account-setup-page">
    <section className="account-setup-card">
      <div className="account-panel-head"><div className="access-brand"><div className="brand-mark"><span /><span /><span /></div><span className="brand-name">finch<span>mail</span></span></div>{onCancel && <button type="button" className="text-button" onClick={onCancel}>Cancel</button>}</div>
      <div className="access-kicker">MAIL ACCOUNT</div>
      <h1>Bring your inbox home.</h1>
      <p>Connect an IMAP account. Finchmail will verify both servers, then securely save the credentials on this machine.</p>
      <form className="account-form" onSubmit={submit}>
        <label>Display name<input name="name" placeholder="Personal mail" required maxLength={100} /></label>
        <label>Email address<input name="email" type="email" placeholder="you@example.com" required maxLength={254} /></label>
        <div className="server-fields">
          <label>IMAP server<input name="imapHost" placeholder="imap.example.com" required /></label>
          <label>Port<input name="imapPort" type="number" defaultValue={993} min={1} max={65535} required /></label>
        </div>
        <label>IMAP username<input name="imapUsername" autoComplete="username" placeholder="Usually your email address" required /></label>
        <label>IMAP password or app password<input name="imapPassword" type="password" autoComplete="new-password" required /></label>
        <label className="secure-check">Connection security<select name="imapSecure" defaultValue="tls"><option value="tls">Implicit SSL/TLS</option><option value="starttls">STARTTLS</option></select></label>
        <div className="account-form-divider"><span />Outgoing mail · SMTP<span /></div>
        <div className="server-fields">
          <label>SMTP server<input name="smtpHost" placeholder="smtp.example.com" required /></label>
          <label>Port<input name="smtpPort" type="number" defaultValue={465} min={1} max={65535} required /></label>
        </div>
        <label>SMTP username<input name="smtpUsername" placeholder="Usually your email address" required /></label>
        <label>SMTP password or app password<input name="smtpPassword" type="password" autoComplete="new-password" required /></label>
        <label className="secure-check">Connection security<select name="smtpSecure" defaultValue="tls"><option value="tls">Implicit SSL/TLS</option><option value="starttls">STARTTLS</option></select></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="access-submit" disabled={busy}>{busy ? "Testing connections…" : "Test & connect account"}</button>
      </form>
      <div className="account-security-note"><strong>Private by design</strong><span>Credentials are encrypted at rest. Message content is synced to your own database so you can search it.</span></div>
    </section>
  </main>;
}

async function getCsrfToken() {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not prepare a secure request.");
  return response.json() as Promise<{ token: string }>;
}
