import { Injectable } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from 'src/environments/environment';

interface ServerTimeResponse {
  status?: string;
  time?: string;
}

interface StoredClockState {
  clockOffsetMs: number;
  utcOffsetMinutes: number;
  synchronizedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ServerClockService {
  private readonly storageKey = 'server_clock_state_v2';
  private readonly syncTtlMs = 15 * 60 * 1000;
  private readonly requestTimeoutMs = 5000;

  private baseServerTimeMs = Date.now();
  private baseMonotonicMs = this.monotonicNow();
  private utcOffsetMinutes = -new Date().getTimezoneOffset();
  private lastSuccessfulSyncMonotonicMs: number | null = null;
  private initializationPromise?: Promise<void>;
  private synchronizationPromise?: Promise<boolean>;

  synchronized = false;

  nowMs(): number {
    return this.baseServerTimeMs + (this.monotonicNow() - this.baseMonotonicMs);
  }

  now(): Date {
    return new Date(this.nowMs());
  }


  wallNow(): Date {
    const absoluteNowMs = this.nowMs();
    const deviceOffsetMinutes = new Date(absoluteNowMs).getTimezoneOffset();
    return new Date(absoluteNowMs + ((this.utcOffsetMinutes + deviceOffsetMinutes) * 60_000));
  }

  async ensureSynchronized(force = false): Promise<boolean> {
    await this.initialize();

    const isFresh = this.lastSuccessfulSyncMonotonicMs !== null
      && this.monotonicNow() - this.lastSuccessfulSyncMonotonicMs < this.syncTtlMs;
    if (!force && isFresh) {
      return true;
    }

    if (!this.synchronizationPromise) {
      this.synchronizationPromise = this.synchronize().finally(() => {
        this.synchronizationPromise = undefined;
      });
    }

    return this.synchronizationPromise;
  }

  private initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.restoreStoredClock();
    }
    return this.initializationPromise;
  }

  private async restoreStoredClock(): Promise<void> {
    try {
      const stored = await Preferences.get({ key: this.storageKey });
      if (!stored.value) return;

      const state = JSON.parse(stored.value) as StoredClockState;
      if (!Number.isFinite(state.clockOffsetMs) || !Number.isFinite(state.utcOffsetMinutes)) return;

      this.setClock(Date.now() + state.clockOffsetMs, state.utcOffsetMinutes, false);
    } catch (error) {
      console.warn('[ServerClock] No fue posible recuperar el ultimo ajuste', error);
    }
  }

  private async synchronize(): Promise<boolean> {
    const startedAt = this.monotonicNow();

    try {
      const response = await this.withTimeout(CapacitorHttp.get({
        url: `${environment.url}/up?_clock=${Math.random().toString(36).slice(2)}`,
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
      }));
      const finishedAt = this.monotonicNow();
      const payload = response.data as ServerTimeResponse;
      const serverTime = payload?.time;
      const serverTimeMs = typeof serverTime === 'string' ? Date.parse(serverTime) : NaN;
      const utcOffsetMinutes = typeof serverTime === 'string'
        ? this.parseUtcOffsetMinutes(serverTime)
        : NaN;

      if (response.status !== 200 || payload?.status !== 'ok') {
        throw new Error(`Respuesta no valida de /up (HTTP ${response.status})`);
      }
      if (!Number.isFinite(serverTimeMs) || !Number.isFinite(utcOffsetMinutes)) {
        throw new Error('El endpoint /up devolvio una fecha u offset invalidos');
      }

      const estimatedTimeAtResponse = serverTimeMs + ((finishedAt - startedAt) / 2);
      this.setClock(estimatedTimeAtResponse, utcOffsetMinutes, true);
      await this.persistClock();
      console.info(`[ServerClock] Hora sincronizada desde /up: ${serverTime}`);
      return true;
    } catch (error) {
      console.warn('[ServerClock] No fue posible sincronizar con /up; se conserva el ultimo ajuste disponible', error);
      return this.synchronized;
    }
  }

  private parseUtcOffsetMinutes(value: string): number {
    if (/Z$/i.test(value)) return 0;

    const match = value.match(/([+-])(\d{2}):(\d{2})$/);
    if (!match) return NaN;

    const direction = match[1] === '+' ? 1 : -1;
    return direction * ((Number(match[2]) * 60) + Number(match[3]));
  }

  private setClock(serverTimeMs: number, utcOffsetMinutes: number, successfulNetworkSync: boolean): void {
    this.baseServerTimeMs = serverTimeMs;
    this.baseMonotonicMs = this.monotonicNow();
    this.utcOffsetMinutes = utcOffsetMinutes;
    this.synchronized = successfulNetworkSync || this.synchronized;
    if (successfulNetworkSync) {
      this.lastSuccessfulSyncMonotonicMs = this.baseMonotonicMs;
    }
  }

  private async persistClock(): Promise<void> {
    const state: StoredClockState = {
      clockOffsetMs: this.nowMs() - Date.now(),
      utcOffsetMinutes: this.utcOffsetMinutes,
      synchronizedAt: this.now().toISOString()
    };
    await Preferences.set({ key: this.storageKey, value: JSON.stringify(state) });
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Timeout sincronizando la hora')), this.requestTimeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private monotonicNow(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }
}
