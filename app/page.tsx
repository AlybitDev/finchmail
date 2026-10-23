"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AccountPanel, AuthPanel } from "./access-panels";

type Mail = {
  id: string;
  mailboxId: string;
  mailbox: string;
  mailboxRole: string;
  name: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  initials: string;
  color: string;
  unread: boolean;
  starred: boolean;
  attachment: string | null;
  account: string;
};
type MailDetail = Mail & { body: string; html: string; isRead: boolean; isStarred: boolean; attachments: Array<{ filename: string; contentType: string; size: number }> };
type Mailbox = { id: string; accountId: string; name: string; path: string; role: string; specialUse: string | null };
type IconName = "inbox" | "star" | "send" | "draft" | "archive" | "trash" | "plus" | "search" | "menu" | "compose" | "more" | "chevron" | "back" | "reply" | "forward" | "paperclip" | "sun" | "moon" | "close" | "check" | "refresh" | "settings";

function Icon({ name, size = 18, fill = "none" }: { name: IconName; size?: number; fill?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill, stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<IconName, React.ReactNode> = {
    inbox: <><path d="M4 4.5h16l1.5 10.2v4.8H2.5v-4.8L4 4.5Z"/><path d="M2.8 14.5h5l1.5 2h5.4l1.5-2h5"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    send: <><path d="m21.5 2.5-7.2 19-3.5-8.3-8.3-3.5 19-7.2Z"/><path d="m21.5 2.5-10.7 10.7"/></>,
    draft: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    archive: <><path d="M3 4h18v4H3z"/><path d="M5 8v12h14V8M10 12h4"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5 5"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    compose: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></>,
    reply: <><path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></>,
    forward: <><path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></>,
    paperclip: <><path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
    moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17.5 6.5L20 12M4 12l2.5 5.5A7 7 0 0 0 18.4 15"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5a7 7 0 0 0 0-3l1.7-1.3-1.6-2.8-2 .7a7 7 0 0 0-2.6-1.5L14.2 3h-3.3l-.4 2.6A7 7 0 0 0 8 7.1l-2-.7-1.6 2.8L6 10.5a7 7 0 0 0 0 3l-1.7 1.3 1.6 2.8 2-.7a7 7 0 0 0 2.6 1.5l.4 2.6h3.3l.4-2.6a7 7 0 0 0 2.6-1.5l2 .7 1.6-2.8Z" transform="translate(-1 -1)"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const navItems: { id: string; label: string; icon: IconName }[] = [
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "starred", label: "Starred", icon: "star" },
  { id: "sent", label: "Sent", icon: "send" },
  { id: "drafts", label: "Drafts", icon: "draft" },
  { id: "archive", label: "Archive", icon: "archive" },
  { id: "trash", label: "Trash", icon: "trash" },
  { id: "spam", label: "Spam", icon: "more" },
  { id: "all", label: "All mail", icon: "inbox" },
];

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export default function Home() {
  const [authMode, setAuthMode] = useState<"loading" | "setup" | "login" | "authenticated">("loading");
  const [user, setUser] = useState<{ id: string; email: string; accounts: Array<{ id: string; name: string; email: string }> } | null>(null);
  const [accountPanel, setAccountPanel] = useState(false);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [folder, setFolder] = useState("inbox");
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All mail");
  const [afterDate, setAfterDate] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const [mobilePane, setMobilePane] = useState<"list" | "reader">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [pageOffset, setPageOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [previousOffset, setPreviousOffset] = useState<number | null>(null);

  const securePost = useCallback(async (url: string, init: RequestInit = {}) => {
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Could not prepare a secure request.");
      const { token } = await csrfResponse.json() as { token: string };
      const headers = new Headers(init.headers);
      headers.set("X-Finchmail-CSRF", token);
      const method = init.method ?? "POST";
      headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
      const body = init.body ?? (method === "GET" || method === "HEAD" ? undefined : "{}");
      return await fetch(url, { ...init, method, headers, body });
    } catch (error) {
      if (init.method === "GET") return fetch(url, { cache: "no-store", signal: init.signal });
      throw error;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/setup-status", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not check sign-in status.");
    const data = await response.json() as { mode: "setup" | "login" | "authenticated"; user?: typeof user; sync?: { status: string; error: string | null; updatedAt: string | null } | null };
    setAuthMode(data.mode);
    if (data.mode === "authenticated" && data.user) {
      setUser(data.user);
      setSyncStatus(data.sync?.status ?? "idle");
      setSyncError(data.sync?.error ?? "");
      setSyncUpdatedAt(data.sync?.updatedAt ?? null);
      if (!data.user.accounts.length) setAccountPanel(true);
      else setAccountPanel(false);
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => { refreshStatus().catch(() => setAuthMode("login")); }, [refreshStatus]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("mail-search")?.focus();
        return;
      }
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "c" && authMode === "authenticated") { event.preventDefault(); setComposeOpen(true); }
      if (event.key === "Escape") { setComposeOpen(false); setSidebarOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authMode]);

  const loadMailboxes = useCallback(async () => {
    const response = await fetch("/api/mailboxes", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { mailboxes: Mailbox[] };
    setMailboxes(data.mailboxes);
  }, []);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ folder, q: query, offset: String(pageOffset), state: filter === "Unread" ? "unread" : filter === "Starred" ? "starred" : "all" });
      if (mailboxId) params.set("mailboxId", mailboxId);
      if (afterDate) params.set("after", new Date(`${afterDate}T00:00:00`).toISOString());
      if (beforeDate) params.set("before", new Date(`${beforeDate}T23:59:59.999`).toISOString());
      const response = await fetch(`/api/messages?${params}`, { cache: "no-store", signal });
      if (response.status === 401) { await refreshStatus(); return; }
      if (!response.ok) throw new Error("Could not load mail.");
      const data = await response.json() as { messages: Mail[]; unreadTotal: number; total: number; nextOffset: number | null; previousOffset: number | null };
      setMails(data.messages);
      setUnreadTotal(data.unreadTotal);
      setTotal(data.total);
      setNextOffset(data.nextOffset);
      setPreviousOffset(data.previousOffset);
      setListOffset(pageOffset);
      if (selectedId && !data.messages.some((mail) => mail.id === selectedId)) {
        setSelectedId(null);
        setSelected(null);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setListError(error instanceof Error ? error.message : "Could not load mail.");
    } finally {
      setLoading(false);
    }
  }, [afterDate, beforeDate, filter, folder, mailboxId, pageOffset, query, refreshStatus, selectedId]);

  useEffect(() => {
    if (authMode !== "authenticated" || accountPanel) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadMessages(controller.signal);
      void loadMailboxes();
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authMode, accountPanel, loadMessages, loadMailboxes, query]);

  useEffect(() => {
    if (authMode !== "authenticated") return;
    const interval = window.setInterval(() => {
      void fetch("/api/sync", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ status: string; error: string | null; updatedAt: string | null }> : null)
        .then((status) => {
          if (!status) return;
          if (status.status === "completed" && status.updatedAt && status.updatedAt !== syncUpdatedAt) void loadMessages();
          setSyncUpdatedAt(status.updatedAt);
          setSyncStatus(status.status);
          setSyncError(status.error ?? "");
        })
        .catch(() => undefined);
    }, syncStatus === "running" || syncStatus === "queued" ? 5000 : 30000);
    return () => window.clearInterval(interval);
  }, [authMode, loadMessages, syncStatus, syncUpdatedAt]);

  useEffect(() => {
    if (!selectedId || authMode !== "authenticated") { setSelected(null); return; }
    const controller = new AbortController();
    void fetch(`/api/messages/${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Message could not be opened.");
        return response.json() as Promise<MailDetail>;
      })
      .then((detail) => {
        const listMessage = mails.find((mail) => mail.id === detail.id);
        setSelected({ ...detail, isRead: listMessage ? !listMessage.unread : detail.isRead, isStarred: listMessage?.starred ?? detail.isStarred });
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setSelected(null); });
    return () => controller.abort();
  }, [selectedId, authMode, mails]);

  const unreadCount = unreadTotal;
  const filtered = mails;
  const title = mailboxId ? mailboxes.find((mailbox) => mailbox.id === mailboxId)?.name ?? "Folder" : navItems.find((item) => item.id === folder)?.label ?? "Inbox";

  async function mutateFlags(id: string, flags: { isRead?: boolean; isStarred?: boolean }) {
    const previous = mails;
    const previousUnread = previous.find((mail) => mail.id === id)?.unread ?? false;
    setMails((current) => current.map((mail) => mail.id === id ? { ...mail, unread: flags.isRead === undefined ? mail.unread : !flags.isRead, starred: flags.isStarred ?? mail.starred } : mail));
    if (flags.isRead !== undefined && previousUnread !== !flags.isRead) setUnreadTotal((current) => Math.max(0, current + (flags.isRead ? -1 : 1)));
    if (selected?.id === id) setSelected((current) => current ? { ...current, isRead: flags.isRead ?? current.isRead, isStarred: flags.isStarred ?? current.isStarred } : current);
    try {
      const response = await securePost(`/api/messages/${encodeURIComponent(id)}/flags`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(flags) });
      if (!response.ok) throw new Error("Could not update that message.");
    } catch {
      setMails(previous);
      if (flags.isRead !== undefined && previousUnread !== !flags.isRead) setUnreadTotal((current) => Math.max(0, current + (flags.isRead ? 1 : -1)));
      setToast("Could not save that change.");
      window.setTimeout(() => setToast(""), 2600);
    }
  }

  async function selectMail(mail: Mail) {
    setSelectedId(mail.id);
    setMobilePane("reader");
    setSelected((current) => current?.id === mail.id ? { ...current, isRead: true } : current);
    if (mail.unread) await mutateFlags(mail.id, { isRead: true });
  }

  async function syncNow() {
    try {
      const response = await securePost("/api/sync");
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not queue sync.");
      setSyncStatus("queued");
      setToast("Sync queued");
      window.setTimeout(() => setToast(""), 2400);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not queue sync.");
      window.setTimeout(() => setToast(""), 2600);
    }
  }

  async function logout() {
    try { await securePost("/api/auth/logout"); } catch { /* clear the local view even when the session has expired */ }
    setAuthMode("login");
    setUser(null);
    setMails([]);
    setSelected(null);
  }

  function switchFolder(id: string) {
    setFolder(id);
    setMailboxId(null);
    setPageOffset(0);
    setSelectedId(null);
    setMobilePane("list");
    setSidebarOpen(false);
    setFilter("All mail");
    setAfterDate("");
    setBeforeDate("");
  }

  function switchMailbox(id: string) {
    setMailboxId(id);
    setFolder("all");
    setAfterDate("");
    setBeforeDate("");
    setPageOffset(0);
    setSelectedId(null);
    setMobilePane("list");
    setSidebarOpen(false);
  }

  function composeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComposeOpen(false);
    setToast("Sending will be available in the next milestone.");
    window.setTimeout(() => setToast(""), 3000);
  }

  function setMessageFilter(value: string) {
    setFilter(value);
    setPageOffset(0);
    if (value === "Unread" || value === "Starred") setFolder("all");
  }

  if (authMode === "loading") return <main className="access-page"><div className="access-loading">Opening your private mail space…</div></main>;
  if (authMode === "setup" || authMode === "login") return <AuthPanel mode={authMode} onSuccess={() => { void refreshStatus(); }} />;
  if (accountPanel) return <AccountPanel onConnected={() => { setAccountPanel(false); setFolder("inbox"); void refreshStatus(); void loadMailboxes(); void syncNow(); }} onCancel={user?.accounts.length ? () => setAccountPanel(false) : undefined} />;

  return <main className={`app-shell${dark ? " dark" : ""}`}>
    <aside className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
      <div className="brand-row"><div className="brand-mark"><span /><span /><span /></div><span className="brand-name">finch<span>mail</span></span><button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button></div>
      <button className="compose-button" onClick={() => setComposeOpen(true)}><Icon name="compose" size={17} /><span>Compose</span><kbd>C</kbd></button>
      <div className="nav-section-label">MAIL</div>
      <nav className="main-nav" aria-label="Mail folders">{navItems.map((item) => <button key={item.id} className={`nav-item${folder === item.id && !mailboxId ? " active" : ""}`} onClick={() => switchFolder(item.id)}><Icon name={item.icon} size={17} fill={item.id === "starred" && folder === item.id ? "currentColor" : "none"} /><span>{item.label}</span>{item.id === "inbox" && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}</button>)}</nav>
      <div className="sidebar-divider" />
      <div className="nav-section-label labels-heading">FOLDERS <button className="tiny-icon" aria-label="Add mail account" onClick={() => setAccountPanel(true)}><Icon name="plus" size={14} /></button></div>
      <div className="mailbox-nav">{mailboxes.map((mailbox) => <button key={mailbox.id} className={`label-item mailbox-item${mailboxId === mailbox.id ? " label-active" : ""}`} title={`${mailbox.name} · ${mailbox.path}`} onClick={() => switchMailbox(mailbox.id)}><span className={`label-dot ${mailbox.role === "inbox" ? "primary-dot" : mailbox.role === "sent" ? "updates-dot" : "social-dot"}`} /><span>{mailbox.name}</span></button>)}</div>
      <div className="sidebar-bottom">
        <div className="storage-card"><div className="storage-top"><span>Sync status</span><span className="sync-label">{syncStatus === "running" ? "Syncing…" : syncStatus === "queued" ? "Queued" : syncStatus === "failed" ? "Needs attention" : syncStatus === "completed" ? "Up to date" : "Ready"}</span></div><div className="storage-track"><span className={syncStatus === "running" ? "sync-progress" : ""} /></div><div className="storage-caption">{syncError ? syncError.slice(0, 100) : "Your mailbox is kept in sync"}</div></div>
        <button className="account-button" onClick={() => setAccountPanel(true)}><div className="avatar avatar-account">{user?.email.slice(0, 1).toUpperCase() ?? "A"}</div><span className="account-copy"><strong>{user?.accounts[0]?.name ?? "Mail account"}</strong><small>{user?.email}</small></span><Icon name="settings" size={17} /></button>
          <button className="signout-button" onClick={() => void logout()}>Sign out</button>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <section className={`mail-area ${mobilePane === "reader" ? "show-reader" : "show-list"}`}>
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><div className="breadcrumbs"><span>Mail</span><span className="crumb-slash">/</span><strong>{title}</strong></div><div className="topbar-actions"><button className={`icon-button${syncStatus === "running" ? " refreshing" : ""}`} aria-label="Sync mail" title="Sync mail" onClick={() => void syncNow()}><Icon name="refresh" /></button><span className="topbar-divider" /><button className="icon-button theme-toggle" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark(!dark)}><Icon name={dark ? "sun" : "moon"} size={17} /></button><button className="help-button" title="Sign out" onClick={() => void logout()}>?</button></div></header>
      <div className="workspace">
        <section className="message-column">
          <div className="list-heading"><div className="list-title-row"><h1>{title}</h1><span className="mail-total">{total}</span></div><p>{syncStatus === "running" ? "Your mail is finding its way home…" : listError || (folder === "inbox" ? "A little space for what matters." : `${title} messages`)}</p></div>
          <div className="search-wrap"><Icon name="search" size={17} /><input id="mail-search" aria-label="Search mail" placeholder="Search all your mail" value={query} onChange={(event) => { setQuery(event.target.value); setPageOffset(0); }} />{query ? <button className="search-clear" aria-label="Clear search" onClick={() => { setQuery(""); setPageOffset(0); }}><Icon name="close" size={15} /></button> : <kbd className="search-shortcut">⌘ K</kbd>}</div>
          <div className="date-filter"><label>From<input type="date" aria-label="Search after date" value={afterDate} onChange={(event) => { setAfterDate(event.target.value); setPageOffset(0); }} /></label><label>To<input type="date" aria-label="Search before date" value={beforeDate} onChange={(event) => { setBeforeDate(event.target.value); setPageOffset(0); }} /></label>{(afterDate || beforeDate) && <button className="date-clear" onClick={() => { setAfterDate(""); setBeforeDate(""); setPageOffset(0); }}>Clear</button>}</div>
          {filter !== "All mail" && <button className="active-filter" onClick={() => { setFilter("All mail"); setPageOffset(0); }}>{filter} <Icon name="close" size={13} /></button>}
          <div className="category-tabs" role="tablist" aria-label="Message filter">{["All mail", "Unread", "Starred"].map((tab) => <button key={tab} role="tab" aria-selected={filter === tab} className={filter === tab ? "tab-active" : ""} onClick={() => setMessageFilter(tab)}>{tab}{tab === "Unread" && unreadCount > 0 && <i />}</button>)}<button className="tabs-more" aria-label="Refresh mail" onClick={() => void loadMessages()}><Icon name="refresh" size={15} /></button></div>
          <div className="message-list">
            {loading && !mails.length ? <div className="empty-list"><div className="empty-icon"><Icon name="refresh" size={22} /></div><strong>Bringing your inbox home</strong><span>It can take a little while the first time.</span></div> : filtered.length ? filtered.map((mail) => <article key={mail.id} className={`message-row${mail.unread ? " unread" : ""}${selectedId === mail.id ? " selected" : ""}`}>
              <button className={`avatar avatar-${mail.color}`} onClick={() => void selectMail(mail)} aria-label={`Open email from ${mail.name}`}>{mail.initials}</button>
              <button className="message-main" onClick={() => void selectMail(mail)}><div className="message-sender"><span className="sender-name">{mail.name}</span><time>{formatTime(mail.time)}</time></div><div className="message-subject">{mail.subject}</div><div className="message-preview">{mail.preview}</div>{mail.attachment && <span className="attachment-chip"><Icon name="paperclip" size={12} />{mail.attachment}</span>}</button>
              <button className={`star-button${mail.starred ? " starred" : ""}`} aria-label={mail.starred ? "Remove star" : "Add star"} onClick={() => void mutateFlags(mail.id, { isStarred: !mail.starred })}><Icon name="star" size={17} fill={mail.starred ? "currentColor" : "none"} /></button>{mail.unread && <span className="unread-dot" />}
            </article>) : <div className="empty-list"><div className="empty-icon"><Icon name={query ? "search" : "inbox"} size={22} /></div><strong>{query ? "No matching messages" : listError ? "Your mailbox could not be loaded" : "Nothing here just yet"}</strong><span>{query ? "Try a different search." : listError || "Connect an account or give sync a moment."}</span>{!listError && <button className="empty-action" onClick={() => void syncNow()}>Check for mail</button>}</div>}
          </div>
          <div className="list-footer"><span>{loading ? "Updating…" : `Showing ${total ? listOffset + 1 : 0}–${Math.min(listOffset + filtered.length, total)} of ${total}`}</span><div><button disabled={previousOffset === null} aria-label="Previous page" onClick={() => { if (previousOffset !== null) setPageOffset(previousOffset); }}>‹</button><button disabled={nextOffset === null} aria-label="Next page" onClick={() => { if (nextOffset !== null) { setPageOffset(nextOffset); setSelectedId(null); setSelected(null); } }}>›</button></div></div>
        </section>
        <section className="reader-column">
          {selected ? <><div className="reader-toolbar"><button className="icon-button reader-back" aria-label="Back to messages" onClick={() => setMobilePane("list")}><Icon name="back" /></button><div className="reader-tools-left"><button className="icon-button" title="Archive is read-only in this milestone" aria-label="Archive is not available yet" disabled><Icon name="archive" size={17} /></button><button className="icon-button" title="Delete is not available yet" aria-label="Delete is not available yet" disabled><Icon name="trash" size={17} /></button></div><span className="toolbar-separator" /><div className="reader-tools-right"><button className="icon-button" title={selected.isRead ? "Mark unread" : "Mark read"} aria-label={selected.isRead ? "Mark unread" : "Mark read"} onClick={() => void mutateFlags(selected.id, { isRead: !selected.isRead })}><Icon name="draft" size={17} /></button><button className="icon-button" title="More actions" aria-label="More actions"><Icon name="more" size={18} /></button></div></div>
          <div className="reader-scroll"><div className="reader-subject-row"><h2>{selected.subject}</h2>{selected.isStarred && <Icon name="star" size={16} fill="currentColor" />}</div><div className="message-labels"><span className="inbox-tag">{selected.mailbox}</span></div><div className="sender-card"><div className={`avatar avatar-large avatar-${mails.find((mail) => mail.id === selected.id)?.color ?? "sage"}`}>{selected.name.slice(0, 2).toUpperCase()}</div><div className="sender-details"><div><strong>{selected.name}</strong><span className="sender-address">&lt;{selected.email}&gt;</span></div><span className="to-me">to {user?.accounts.find((account) => account.name === selected.account)?.email ?? user?.accounts[0]?.email ?? "me"}</span></div><time>{formatTime(selected.time)}</time><button className={`star-button sender-star${selected.isStarred ? " starred" : ""}`} aria-label="Toggle star" onClick={() => void mutateFlags(selected.id, { isStarred: !selected.isStarred })}><Icon name="star" size={17} fill={selected.isStarred ? "currentColor" : "none"} /></button><button className="icon-button sender-more" aria-label="More message options"><Icon name="more" size={17} /></button></div>
              {selected.html ? <div className="external-content-note">External images are hidden to protect your privacy.</div> : null}{selected.html ? <iframe className="email-html" title={`Email from ${selected.name}`} sandbox="" referrerPolicy="no-referrer" srcDoc={selected.html} /> : <div className="email-body">{selected.body.split("\n").map((line, index) => line ? <p key={index}>{line}</p> : <div key={index} className="email-spacer" />)}</div>}
              {selected.attachments.map((attachment, index) => <div className="attachment-card" key={`${attachment.filename}-${index}`}><div className="attachment-file-icon">FILE</div><div><strong>{attachment.filename}</strong><span>{Math.max(1, Math.round(attachment.size / 1024))} KB · {attachment.contentType}</span></div><button aria-label="Attachment download is not available yet" title="Attachment download is not available yet"><Icon name="more" size={17} /></button></div>)}
              <div className="reply-actions"><button onClick={() => setComposeOpen(true)}><Icon name="reply" size={16} />Reply</button><button onClick={() => setComposeOpen(true)}><Icon name="forward" size={16} />Forward</button><button className="reaction-button" aria-label="Add reaction">☺</button></div></div>
          </> : <div className="reader-empty"><div className="empty-illustration"><div className="illustration-paper"><span /><span /><span /><span /></div><div className="illustration-spark spark-one">✳</div><div className="illustration-spark spark-two">✳</div></div><h2>A little room to breathe.</h2><p>Select a message to settle in and read.</p><span className="reader-tip">Your inbox is a place, not a to-do list.</span></div>}
        </section>
      </div>
      <footer className="status-bar"><span><i className={`status-dot${syncStatus === "failed" ? " status-error" : ""}`} />{syncStatus === "running" ? "Syncing your mailbox" : syncStatus === "failed" ? "Sync needs attention" : syncStatus === "queued" ? "Mail sync is queued" : syncStatus === "completed" ? "All mail is up to date" : "Ready when you are"}</span><span>Made for a calmer inbox <b>✳</b></span></footer>
    </section>
    {composeOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false); }}><form className="compose-modal" onSubmit={composeSubmit}><div className="compose-header"><strong>New message</strong><button type="button" aria-label="Close compose" onClick={() => setComposeOpen(false)}><Icon name="close" size={17} /></button></div><label className="compose-field"><span>To</span><input name="to" type="email" placeholder="recipient@example.com" required autoFocus /></label><label className="compose-field"><span>Subject</span><input name="subject" placeholder="Add a subject" /></label><textarea name="body" placeholder="Write something thoughtful…" required /><div className="compose-footer"><button className="send-button" type="submit">Coming soon <Icon name="send" size={14} /></button><div><button type="button" className="icon-button" aria-label="Attachments are not available yet"><Icon name="paperclip" size={17} /></button><button type="button" className="icon-button" aria-label="More compose options"><Icon name="more" size={18} /></button></div></div></form></div>}
    {toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}<button onClick={() => setToast("")}>Dismiss</button></div>}
  </main>;
}
