import "dotenv/config";
import { prisma } from "../src/lib/db";
import { syncAccount } from "../src/lib/imap";

const POLL_INTERVAL_MS = 5000;
const PERIODIC_SYNC_MS = 10 * 60 * 1000;
const RUNNING_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const SYNC_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
const shuttingDown = new AbortController();
let lastHistoryCleanup = 0;

process.on("SIGTERM", () => shuttingDown.abort());
process.on("SIGINT", () => shuttingDown.abort());

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function queuePeriodicSyncs() {
  const accounts = await prisma.mailAccount.findMany({ select: { id: true } });
  for (const account of accounts) {
    const latest = await prisma.syncRun.findFirst({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } });
    if (latest && ["queued", "running"].includes(latest.status)) continue;
    const lastActivity = latest?.endedAt ?? latest?.startedAt ?? latest?.createdAt;
    const unfinished = await prisma.mailbox.count({ where: { accountId: account.id, OR: [{ recentComplete: false }, { backfillComplete: false }] } });
    let retryReady = false;
    if (latest?.status === "failed") {
      const attempts = await prisma.syncRun.count({ where: { accountId: account.id, status: "failed", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
      const backoff = Math.min(60_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 5), MAX_BACKOFF_MS);
      if (lastActivity && Date.now() - lastActivity.getTime() < backoff) continue;
      retryReady = true;
    } else if (unfinished && latest?.status === "completed") {
      // Drain the bounded backfill batches without waiting for the normal sync interval.
    } else if (lastActivity && Date.now() - lastActivity.getTime() < PERIODIC_SYNC_MS) {
      continue;
    }
    if (retryReady || !lastActivity || unfinished || Date.now() - lastActivity.getTime() >= PERIODIC_SYNC_MS) {
      await prisma.syncRun.create({ data: { accountId: account.id, status: "queued" } });
    }
  }
  if (Date.now() - lastHistoryCleanup >= 24 * 60 * 60 * 1000) {
    await prisma.syncRun.deleteMany({ where: { endedAt: { lt: new Date(Date.now() - SYNC_HISTORY_MS) }, status: { notIn: ["queued", "running"] } } });
    lastHistoryCleanup = Date.now();
  }
}

async function recoverStaleRuns() {
  await prisma.syncRun.updateMany({
    where: { status: "running", startedAt: { lt: new Date(Date.now() - RUNNING_TIMEOUT_MS) } },
    data: { status: "failed", endedAt: new Date(), error: "Sync worker stopped before completing this run" },
  });
}

async function processQueuedRun() {
  const queuedRuns = await prisma.syncRun.findMany({ where: { status: "queued" }, orderBy: { createdAt: "asc" }, take: 50 });
  if (!queuedRuns.length) return false;
  let run = null;
  for (const candidate of queuedRuns) {
    const attempts = await prisma.syncRun.count({ where: { accountId: candidate.accountId, status: "failed", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    if (!attempts) { run = candidate; break; }
    const previousFailure = await prisma.syncRun.findFirst({ where: { accountId: candidate.accountId, status: "failed" }, orderBy: { createdAt: "desc" } });
    const failedAt = previousFailure?.endedAt ?? previousFailure?.startedAt ?? previousFailure?.createdAt;
    const backoff = Math.min(60_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 5), MAX_BACKOFF_MS);
    if (!failedAt || Date.now() - failedAt.getTime() >= backoff) { run = candidate; break; }
  }
  if (!run) return false;
  try {
    await syncAccount(run.accountId, run.id);
  } catch (error) {
    console.error(`[sync] account ${run.accountId} failed:`, error instanceof Error ? error.message : "unknown error");
  }
  return true;
}

async function main() {
  console.info("[sync] worker started");
  await recoverStaleRuns();
  let lastPeriodicSync = 0;
  while (!shuttingDown.signal.aborted) {
    try {
      if (Date.now() - lastPeriodicSync >= POLL_INTERVAL_MS) {
        await queuePeriodicSyncs();
        lastPeriodicSync = Date.now();
      }
      const hadWork = await processQueuedRun();
      if (!hadWork) await wait(POLL_INTERVAL_MS);
    } catch (error) {
      console.error("[sync] worker loop error:", error instanceof Error ? error.message : "unknown error");
      await wait(POLL_INTERVAL_MS);
    }
  }
  await prisma.$disconnect();
  console.info("[sync] worker stopped");
}

main().catch((error: unknown) => {
  console.error("[sync] fatal worker error:", error);
  process.exitCode = 1;
});
