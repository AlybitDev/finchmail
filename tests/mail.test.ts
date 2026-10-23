import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { folderRole, initials, previewText, senderColor } from "../src/lib/mail";
import { isPrivateAddress } from "../src/lib/net";
import { isAllowedMailHost, normalizeHost } from "../src/lib/outbound";
import { descendingUidBatch } from "../src/lib/sync-cursor";

test("credential encryption round trips and uses a unique nonce", () => {
  process.env.APP_ENCRYPTION_KEY = "ab".repeat(32);
  const first = encryptSecret("example app password");
  const second = encryptSecret("example app password");
  assert.equal(decryptSecret(first), "example app password");
  assert.notEqual(first, second);
  assert.throws(() => decryptSecret(`${first.slice(0, -2)}00`));
});

test("mailbox roles recognize standard and common folder names", () => {
  assert.equal(folderRole("\\Inbox", "Inbox"), "inbox");
  assert.equal(folderRole("\\Sent", "Sent Items"), "sent");
  assert.equal(folderRole("\\Trash", "Deleted Items"), "trash");
  assert.equal(folderRole(null, "INBOX.Archive"), "archive");
  assert.equal(folderRole(null, "Projects"), "all");
});

test("sender presentation helpers are deterministic and bounded", () => {
  assert.equal(initials("Maya Chen"), "MC");
  assert.equal(initials("unknown"), "U");
  assert.equal(senderColor("maya@example.com"), senderColor("maya@example.com"));
  assert.equal(previewText("a   thoughtful\nmessage"), "a thoughtful message");
  assert.equal(previewText("hello world", 6), "hello…");
});

test("outbound network policy blocks private targets and normalizes hostnames", () => {
  assert.equal(isPrivateAddress("127.0.0.1", 4), true);
  assert.equal(isPrivateAddress("10.10.0.7", 4), true);
  assert.equal(isPrivateAddress("169.254.10.4", 4), true);
  assert.equal(isPrivateAddress("8.8.8.8", 4), false);
  assert.equal(isPrivateAddress("::1", 6), true);
  assert.equal(isPrivateAddress("fc00::1", 6), true);
  assert.equal(isPrivateAddress("2606:4700:4700::1111", 6), false);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1", 6), true);
  assert.equal(isPrivateAddress("::ffff:8.8.8.8", 6), false);
  assert.equal(normalizeHost("[2001:4860:4860::8888]"), "2001:4860:4860::8888");
  assert.equal(isAllowedMailHost("mail.example.com"), true);
  assert.equal(isAllowedMailHost("mail.local"), false);
});

test("bounded reverse UID batches move the cursor backward", () => {
  const first = descendingUidBatch([1, 2, 3, 4, 5, 6], 2);
  assert.deepEqual(first.batch, [5, 6]);
  assert.equal(first.nextBeforeUid, 4);
  assert.equal(first.complete, false);
  const next = descendingUidBatch([1, 2, 3, 4], 2);
  assert.deepEqual(next.batch, [3, 4]);
  assert.equal(next.nextBeforeUid, 2);
  assert.equal(descendingUidBatch([1, 2], 2).complete, true);
});
