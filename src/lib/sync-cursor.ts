export function descendingUidBatch(uids: number[], limit: number) {
  const ordered = [...new Set(uids)].sort((a, b) => a - b);
  const batch = ordered.slice(-limit);
  const nextBeforeUid = batch.length ? Math.min(...batch) - 1 : 0;

  return {
    batch,
    nextBeforeUid,
    complete: ordered.length <= limit || nextBeforeUid <= 0,
  };
}
