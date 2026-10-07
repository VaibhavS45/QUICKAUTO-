/**
 * "Keep this computer awake for routines" — the toggle, for real.
 *
 * Pref-gated powerSaveBlocker of type 'prevent-app-suspension' (Electron docs:
 * keeps the system active but lets the screen sleep — matches the banner copy
 * "a closed lid still sleeps"). Holds only while plugged in via powerMonitor;
 * on battery the blocker is released and re-acquired when AC returns.
 *
 * ponytail: holds whenever enabled + on AC, not just the hour before a routine.
 * Add a scheduler-driven hold window if always-on while plugged in ever matters.
 */

export interface AwakePrefStore {
  load(): boolean
  save(enabled: boolean): void
}

export class MemoryAwakeStore implements AwakePrefStore {
  constructor(private value = true) {}
  load(): boolean {
    return this.value
  }
  save(enabled: boolean): void {
    this.value = enabled
  }
}

export interface AwakePlatform {
  startBlocker(): number
  stopBlocker(id: number): void
  isOnBattery(): boolean
  /** Subscribe to AC/battery flips; returns unsubscribe. */
  onPowerChange(cb: () => void): () => void
}

export class AwakeManager {
  private blockerId: number | null = null

  constructor(
    private readonly prefs: AwakePrefStore,
    private readonly platform: AwakePlatform
  ) {}

  get enabled(): boolean {
    return this.prefs.load()
  }

  setEnabled(enabled: boolean): boolean {
    this.prefs.save(enabled)
    this.reconcile()
    return this.enabled
  }

  /** True while a blocker is currently held. */
  get holding(): boolean {
    return this.blockerId !== null
  }

  /** Apply the wanted state: call at launch and on AC/battery flips. Idempotent. */
  reconcile(): void {
    let onBattery = false
    try {
      onBattery = this.platform.isOnBattery()
    } catch {
      onBattery = false
    }
    const wanted = this.prefs.load() && !onBattery
    if (wanted && this.blockerId === null) {
      try {
        this.blockerId = this.platform.startBlocker()
      } catch {
        this.blockerId = null
      }
    } else if (!wanted && this.blockerId !== null) {
      try {
        this.platform.stopBlocker(this.blockerId)
      } catch {
        // Blocker already gone; just forget it.
      }
      this.blockerId = null
    }
  }

  /** Subscribe to AC/battery flips for the life of the app. */
  attach(): () => void {
    return this.platform.onPowerChange(() => this.reconcile())
  }
}
