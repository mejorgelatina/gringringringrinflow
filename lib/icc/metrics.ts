import type { IccRecord } from "./types.ts"

// Intake metrics for the one-handed operational flow (docs/v0.10/PRODUCT_PHILOSOPHY.md). The under-10-second
// goal is for capture and first structuring, not for finishing every verification.

export type IntakeSample = {
  icc: IccRecord
  /** When the operator started capturing (opened the camera, began the voice note), if the channel knows. */
  captureStartedAt?: string | null
  /** When the record first had enough to evaluate an action (no blocking gap left), if it got there. */
  actionableAt?: string | null
  /** A person changed a value the system had produced (quantity, weight, condition). */
  humanCorrected: boolean
  /** The operator typed text (not only a photo, a voice note or taps). */
  typed: boolean
}

const ms = (a?: string | null, b?: string | null) => (a && b ? Date.parse(b) - Date.parse(a) : null)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export type IntakeMetrics = {
  samples: number
  /** Median ms from capture start to receipt. Null when no channel reported capture times. */
  timeToCaptureMs: number | null
  /** Median ms from receipt to the structured ICC record. */
  timeToStructuredResourceMs: number | null
  /** Median ms from receipt to the first moment an action could be evaluated. */
  timeToActionableResourceMs: number | null
  /** Share of records that reached "actionable". */
  actionableRate: number
  humanCorrectionRate: number
  completionWithoutTypingRate: number
}

export function intakeMetrics(samples: IntakeSample[]): IntakeMetrics {
  const n = samples.length || 1
  const nums = (f: (s: IntakeSample) => number | null) => samples.map(f).filter((x): x is number => x !== null && x >= 0)
  return {
    samples: samples.length,
    timeToCaptureMs: median(nums((s) => ms(s.captureStartedAt, s.icc.receivedAt))),
    timeToStructuredResourceMs: median(nums((s) => ms(s.icc.receivedAt, s.icc.structuredAt))),
    timeToActionableResourceMs: median(nums((s) => ms(s.icc.receivedAt, s.actionableAt))),
    actionableRate: samples.filter((s) => s.actionableAt).length / n,
    humanCorrectionRate: samples.filter((s) => s.humanCorrected).length / n,
    completionWithoutTypingRate: samples.filter((s) => !s.typed && s.actionableAt).length / n,
  }
}
