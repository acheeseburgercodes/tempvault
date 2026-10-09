import type { TempVaultApi } from '../shared/types'

declare global {
  interface Window {
    tempVault: TempVaultApi & { pathForFile(file: File): string }
  }
}

export {}
