import { Injectable } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { RequestsService } from '../api/requests.service';
import { LoggerService } from '../api/logger.service';

type ListenerScope = 'private' | 'public' | 'presence';

interface ListenerEntry {
  key: string;
  scope: ListenerScope;
  channelName: string;
  eventName: string;
  refCount: number;
  subject: Subject<any>;
  channelRef: any;
}

@Injectable({
  providedIn: 'root'
})
export class WebhookService {
  private readonly DEBUG_WEBHOOK = true;
  private echoInstance?: Echo<any>;
  private initializationPromise?: Promise<Echo<any>>;
  private listeners = new Map<string, ListenerEntry>();

  private connectionStateSubject = new BehaviorSubject<string>('disconnected');
  connectionState$ = this.connectionStateSubject.asObservable();

  constructor(
    private requestsService: RequestsService,
    private logger: LoggerService
  ) {}

  private debug(step: string, details?: any): void {
    if (!this.DEBUG_WEBHOOK) {
      return;
    }

    console.log(`[WebhookService] ${step}`, details ?? '');
    void this.logger.addLog(`WebhookService.${step}`, details ?? {}, 'info');
  }

  async connect(): Promise<void> {
    this.debug('connect.start');
    await this.getEcho();
    this.debug('connect.done');
  }

  async subscribePrivate(
    channelName: string,
    eventName: string,
    handler: (payload: any) => void
  ): Promise<() => void> {
    return this.subscribe('private', channelName, eventName, handler);
  }

  async subscribePublic(
    channelName: string,
    eventName: string,
    handler: (payload: any) => void
  ): Promise<() => void> {
    return this.subscribe('public', channelName, eventName, handler);
  }

  async subscribePresence(
    channelName: string,
    eventName: string,
    handler: (payload: any) => void
  ): Promise<() => void> {
    return this.subscribe('presence', channelName, eventName, handler);
  }

  async subscribePublicAllEvents(
    channelName: string,
    handler: (eventName: string, payload: any) => void
  ): Promise<() => void> {
    const echo = await this.getEcho();
    const channelRef = echo.channel(channelName);
    const rawChannel = (channelRef as any)?.subscription ?? channelRef;

    if (typeof rawChannel?.bind_global !== 'function') {
      return () => {
      };
    }

    const globalHandler = (eventName: string, payload: any) => {
      handler(eventName, payload);
    };

    rawChannel.bind_global(globalHandler);

    return () => {
      try {
        rawChannel.unbind_global(globalHandler);
      } catch {
      }
    };
  }

  disconnect(): void {
    this.listeners.forEach((entry) => {
      try {
        entry.channelRef?.stopListening?.(entry.eventName);
      } catch {
      }
      entry.subject.complete();
    });

    this.listeners.clear();

    if (this.echoInstance) {
      this.echoInstance.disconnect();
      this.echoInstance = undefined;
      this.initializationPromise = undefined;
    }

    this.connectionStateSubject.next('disconnected');
  }

  private async subscribe(
    scope: ListenerScope,
    channelName: string,
    eventName: string,
    handler: (payload: any) => void
  ): Promise<() => void> {
    this.debug('subscribe.request', { scope, channelName, eventName });
    const key = this.buildKey(scope, channelName, eventName);
    const entry = await this.ensureEntry(scope, channelName, eventName, key);

    entry.refCount += 1;
    const internalSub = entry.subject.subscribe((payload: any) => handler(payload));

    return () => {
      internalSub.unsubscribe();
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (entry.refCount === 0) {
        this.removeEntry(entry);
      }
    };
  }

  private async ensureEntry(
    scope: ListenerScope,
    channelName: string,
    eventName: string,
    key: string
  ): Promise<ListenerEntry> {
    const existing = this.listeners.get(key);
    if (existing) {
      this.debug('ensureEntry.reuse', { scope, channelName, eventName });
      return existing;
    }

    const echo = await this.getEcho();
    const channelRef = scope === 'private'
      ? echo.private(channelName)
      : scope === 'presence'
        ? echo.join(channelName)
        : echo.channel(channelName);
    const subject = new Subject<any>();

    this.debug('ensureEntry.bind', { scope, channelName, eventName });

    channelRef.listen(eventName, (payload: any) => {
      this.debug('event.incoming', { scope, channelName, eventName, hasPayload: !!payload });
      subject.next(payload);
    });

    const entry: ListenerEntry = {
      key,
      scope,
      channelName,
      eventName,
      refCount: 0,
      subject,
      channelRef,
    };

    this.listeners.set(key, entry);
    return entry;
  }

  private removeEntry(entry: ListenerEntry): void {
    try {
      entry.channelRef?.stopListening?.(entry.eventName);
    } catch {
    }

    entry.subject.complete();
    this.listeners.delete(entry.key);

    if (!this.hasActiveChannelListeners(entry.scope, entry.channelName)) {
      this.leaveChannel(entry.scope, entry.channelName);
    }
  }

  private hasActiveChannelListeners(scope: ListenerScope, channelName: string): boolean {
    for (const value of this.listeners.values()) {
      if (value.scope === scope && value.channelName === channelName) {
        return true;
      }
    }

    return false;
  }

  private leaveChannel(scope: ListenerScope, channelName: string): void {
    if (!this.echoInstance) {
      return;
    }

    try {
      this.echoInstance.leave(channelName);
      const prefixedChannel = scope === 'private'
        ? `private-${channelName}`
        : scope === 'presence'
          ? `presence-${channelName}`
          : channelName;
      (this.echoInstance as any)?.leaveChannel?.(prefixedChannel);
    } catch {
    }
  }

  private buildKey(scope: ListenerScope, channelName: string, eventName: string): string {
    return `${scope}:${channelName}:${eventName}`;
  }

  private async getEcho(): Promise<Echo<any>> {
    if (this.echoInstance) {
      this.debug('getEcho.cached');
      return this.echoInstance;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.createEchoInstance();
    this.echoInstance = await this.initializationPromise;
    this.debug('getEcho.created');
    return this.echoInstance;
  }

  private async createEchoInstance(): Promise<Echo<any>> {
    (window as any).Pusher = Pusher;

    this.debug('createEchoInstance.start', {
      key: environment.pusher.key,
      cluster: environment.pusher.cluster,
      forceTLS: environment.pusher.forceTLS,
    });

    const echo = new Echo({
      broadcaster: 'pusher',
      key: environment.pusher.key,
      cluster: environment.pusher.cluster,
      forceTLS: environment.pusher.forceTLS,
      disableStats: true,
      authorizer: (channel: any) => {
        return {
          authorize: (socketId: string, callback: any) => {
            this.debug('authorizer.request', { socketId, channelName: channel?.name });
            localStorage.setItem('socketId', socketId);
            this.requestsService.authorizeBroadcasting(socketId, channel.name).subscribe(
              (response: any) => {
                this.debug('authorizer.success', { channelName: channel?.name });
                callback(false, response);
              },
              (error: any) => {
                this.debug('authorizer.error', { channelName: channel?.name, error });
                callback(true, error);
              }
            );
          },
        };
      },
    });

    this.bindConnectionHandlers(echo);
    return echo;
  }

  private bindConnectionHandlers(echo: Echo<any>): void {
    try {
      const pusherInstance = (echo as any)?.connector?.pusher;
      if (!pusherInstance?.connection) {
        return;
      }

      pusherInstance.connection.bind('connected', async () => {
        this.connectionStateSubject.next('connected');
        await this.logger.addLog('Webhook connected', {}, 'success');
      });

      pusherInstance.connection.bind('disconnected', async (resp: any) => {
        this.connectionStateSubject.next('disconnected');
        await this.logger.addLog('Webhook disconnected', { resp }, 'warning');
      });

      pusherInstance.connection.bind('error', async (err: any) => {
        this.connectionStateSubject.next('error');
        await this.logger.addLog('Webhook error', { err }, 'error');
      });
    } catch {
    }
  }
}
