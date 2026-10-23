import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { accountSchema, loginSchema, setupSchema } from "../src/lib/schemas";

test("owner setup requires a long password and a one-time token", () => {
  assert.equal(setupSchema.safeParse({ email: "owner@example.com", password: "correct horse battery", setupToken: "x".repeat(40) }).success, true);
  assert.equal(setupSchema.safeParse({ email: "owner@example.com", password: "short", setupToken: "x".repeat(40) }).success, false);
  assert.equal(setupSchema.safeParse({ email: "owner@example.com", password: "correct horse battery" }).success, false);
});

test("login schema normalizes email addresses", () => {
  const result = loginSchema.safeParse({ email: " Owner@Example.com ", password: "secret" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, "owner@example.com");
});

test("mail account schema validates ports and credentials", () => {
  const valid = {
    name: "Personal", email: "owner@example.com", imapHost: "imap.example.com", imapPort: 993,
    imapSecure: true, imapUsername: "owner@example.com", imapPassword: "app-password",
    smtpHost: "smtp.example.com", smtpPort: 465, smtpSecure: true,
    smtpUsername: "owner@example.com", smtpPassword: "app-password",
  };
  assert.equal(accountSchema.safeParse(valid).success, true);
  assert.equal(accountSchema.safeParse({ ...valid, imapPort: 70000 }).success, false);
  assert.equal(accountSchema.safeParse({ ...valid, smtpHost: "https://example.com" }).success, false);
});

test("initial migration includes the full-text search index", async () => {
  const migration = await readFile(new URL("../prisma/migrations/20261020000000_initial/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE INDEX "Message_search_fts_idx"/);
  assert.match(migration, /CREATE TABLE "LoginAttempt"/);
  assert.match(migration, /"recentComplete" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /"lastFullReconcileAt" TIMESTAMP\(3\)/);
  assert.match(migration, /CREATE INDEX "Message_search_fts_idx"/);
});
