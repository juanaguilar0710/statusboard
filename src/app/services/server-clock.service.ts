import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from 'src/environments/environment';

type ClockSource = 'dtouch-api' | 'google' | 'cloudflare' | 'timeapi' | 'stored-offset' | 'device';

interface StoredClockState {
  offsetMs: number;
  source: ClockSource;
  synchronizedAt: string;
}

interface ClockSample {
  source: ClockSource;
  serverTimeMs: number;
}

@Injectable({
  providedIn: 'root'
})
export class ServerClockService {
  private readonly storageKey = 'server_clock_state_v1';
  private readonly syncTtlMs = 15 * 60 * 1000;
  private readonly requestTimeoutMs = 5000;

  private baseServerTimeMs = Date.now();
  private baseMonotonicMs = this.monotonicNow();
  private lastSuccessfulSyncMonotonicMs: number | null = null;
  private initializationPromise?: Promise<void>;
  private synchronizationPromise?: Promise<boolean>;

  source: ClockSource = 'device';
  synchronized = false;

  nowMs(): number {
    return this.baseServerTimeMs + (this.monotonicNow() - this.baseMonotonicMs);
  }

  now(): Date {
    return new Date(this.nowMs());
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
      this.initializationPromise = this.restoreStoredOffset();
    }
    return this.initializationPromise;
  }

  private async restoreStoredOffset(): Promise<void> {
    try {
      const stored = await Preferences.get({ key: this.storageKey });
      if (!stored.value) return;

      const state = JSON.parse(stored.value) as StoredClockState;
      if (!Number.isFinite(state.offsetMs)) return;

      this.setClock(Date.now() + state.offsetMs, 'stored-offset', false);
    } catch (error) {
      console.warn('[ServerClock] No fue posible recuperar la hora guardada', error);
    }
  }

  private async synchronize(): Promise<boolean> {
    const sources = Capacitor.isNativePlatform()
      ? [
          () => this.readHttpDate(environment.url, 'dtouch-api'),
          () => this.readHttpDate('https://www.google.com/generate_204', 'google'),
          () => this.readCloudflareTime(),
          () => this.readTimeApi()
        ]
      : [
          () => this.readCloudflareTime(),
          () => this.readTimeApi()
        ];

    for (const readSource of sources) {
      const startedAt = this.monotonicNow();
      try {
        const sample = await this.withTimeout(readSource());
        const finishedAt = this.monotonicNow();
        const estimatedTimeAtResponse = sample.serverTimeMs + ((finishedAt - startedAt) / 2);
        this.setClock(estimatedTimeAtResponse, sample.source, true);
        await this.persistOffset();
        console.info(`[ServerClock] Hora sincronizada desde ${sample.source}`);
        return true;
      } catch {
        // Se intenta la siguiente fuente sin bloquear el arranque de la aplicacion.
      }
    }

    console.warn('[ServerClock] Sin conexion a una fuente de hora; se usa el ultimo ajuste disponible');
    return this.synchronized;
  }

  private async readHttpDate(url: string, source: 'dtouch-api' | 'google'): Promise<ClockSample> {
    const response = await CapacitorHttp.get({
      url: this.withCacheBuster(url),
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
    });
    const dateHeader = this.getHeader(response, 'date');
    const serverTimeMs = dateHeader ? Date.parse(dateHeader) : NaN;
    if (!Number.isFinite(serverTimeMs)) {
      throw new Error(`La fuente ${source} no expuso una fecha valida`);
    }
    return { source, serverTimeMs };
  }

  private async readCloudflareTime(): Promise<ClockSample> {
    const response = await CapacitorHttp.get({
      url: this.withCacheBuster('https://www.cloudflare.com/cdn-cgi/trace'),
      headers: { 'Cache-Control': 'no-cache' }
    });
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
    const timestamp = Number(body.match(/(?:^|\n)ts=([0-9.]+)/)?.[1]);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error('Cloudflare no devolvio una hora valida');
    }
    return { source: 'cloudflare', serverTimeMs: timestamp * 1000 };
  }

  private async readTimeApi(): Promise<ClockSample> {
    const response = await CapacitorHttp.get({
      url: this.withCacheBuster('https://timeapi.io/api/time/current/zone?timeZone=UTC'),
      headers: { 'Cache-Control': 'no-cache' }
    });
    const value = response.data?.dateTime ?? response.data?.currentDateTime;
    const serverTimeMs = typeof value === 'string'
      ? Date.parse(value.endsWith('Z') ? value : `${value}Z`)
      : NaN;
    if (!Number.isFinite(serverTimeMs)) {
      throw new Error('TimeAPI no devolvio una hora valida');
    }
    return { source: 'timeapi', serverTimeMs };
  }

  private getHeader(response: HttpResponse, name: string): string | undefined {
    const headers = response.headers ?? {};
    const key = Object.keys(headers).find(header => header.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  }

  private setClock(serverTimeMs: number, source: ClockSource, successfulNetworkSync: boolean): void {
    this.baseServerTimeMs = serverTimeMs;
    this.baseMonotonicMs = this.monotonicNow();
    this.source = source;
    this.synchronized = successfulNetworkSync || source === 'stored-offset';
    if (successfulNetworkSync) {
      this.lastSuccessfulSyncMonotonicMs = this.baseMonotonicMs;
    }
  }

  private async persistOffset(): Promise<void> {
    const state: StoredClockState = {
      offsetMs: this.nowMs() - Date.now(),
      source: this.source,
      synchronizedAt: this.now().toISOString()
    };
    await Preferences.set({ key: this.storageKey, value: JSON.stringify(state) });
  }

  private withCacheBuster(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_clock=${Math.random().toString(36).slice(2)}`;
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
