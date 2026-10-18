import type { VaultItem } from '../shared/types'

export const AUTO_DELETE_DAYS = 14
export const AUTO_DELETE_INTERVAL_MS = 60 * 60 * 1_000

export function isAutoDeleteCandidate(item: VaultItem, now = Date.now()): boolean {
  const cutoff = now - AUTO_DELETE_DAYS * 86_400_000
  return item.status === 'temporary' && item.addedAt <= cutoff
}
