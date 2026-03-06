import { Component, HostListener, OnInit, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { RequestsService } from './api/requests.service';
import { Storage } from '@ionic/storage-angular';
import { NetworkService } from './api/network.service';
import { environment } from 'src/environments/environment';
import { LocaldataService } from './api/localdata.service';
import { BehaviorSubject } from 'rxjs';
import { NotificationService } from './api/notification.service';
import { ModalController, Platform } from '@ionic/angular';
import { LoggerService } from './api/logger.service';

import { App } from '@capacitor/app';
import * as LiveUpdates from '@capacitor/live-updates';
import { WebhookService } from './services/webhook.service';
import { Device } from '@capacitor/device';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {

  timeoutHandle: any;
  enableScreensaver = true;
  excludedUrls: any;
  isExcluded: any;
  currentUrl: any;
  inactiveTime = environment.timeSaveScreen * 60 * 1000;

  private hasNavigated = false;

  private inactivityTime: number = 0;
  private maxInactivityTime: number = environment.maxInactivityTime;
  private timer: any;
  private events: string[] = ['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll', 'input'];

  public timeRemaining$: BehaviorSubject<number> = new BehaviorSubject<number>(this.maxInactivityTime);
  private listenerRefs: { [key: string]: any } = {};
  private isTrackingActive: boolean = false;
  private isIntervalRunning: boolean = false;

  // Live Updates polling control
  private liveUpdatePollTimer: any;
  private liveUpdateInFlight = false;
  private readonly liveUpdatePollIntervalMs = 60_000; // 2 min

  // Live Updates status for on-screen diagnostics
  liveUpdateStatus = 'Idle';
  liveUpdateDetail = '';
  liveUpdateDownloaded = false;
  liveUpdateLastCheck: Date | null = null;
  liveUpdateLastResult = '';

  constructor(
    private router: Router,
    private requestsService: RequestsService,
    private logger: LoggerService,
    private storage: Storage,
    private localdataService: LocaldataService,
    private notificationService: NotificationService,
    private modalController: ModalController,
    private platform: Platform,
    private webhookService: WebhookService,
    private ngZone: NgZone
  ) {
    this.init();

    this.requestsService.startTimer$.subscribe(async (start: boolean) => {
      if (start) {
        await this.startListeners();
      } else {
        await this.stopInterval();
      }
    });

    new NetworkService();
  }

  ngOnInit() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.excludedUrls = ['/login', '/pin', '/configuration', '/dashboard'];
        // Usar siempre la URL final después de redirecciones (por ejemplo, '' -> '/pin' -> '/login')
        this.currentUrl = event.urlAfterRedirects || event.url;
        this.isExcluded = this.excludedUrls.some((url: any) => this.currentUrl.includes(url));
        this.checkRoute(this.currentUrl);
        if (this.isExcluded) {
          this.stopInactivityTracking();
        } else {
          this.startInactivityTracking();
        }
      }
    });

    this.platform.ready().then(() => {
      this.resetInactivityTimer();
      this.initializeLiveUpdates();
      this.initializeMonitorWebhooks();
    });
  }

  private async initializeMonitorWebhooks() {
    try {
      await this.webhookService.connect();

      // Buscamos si tenemos registrada una sala para escuchar en el canal específico
      const configResponse = await Preferences.get({ key: 'config' });
      let roomId = null;
      if (configResponse.value) {
        const config = JSON.parse(configResponse.value);
        roomId = config?.waitingRoom?.id;
      }

        const checkIsCurrentDevice = async (event: any) => {
          let isMatch = false;

          // 1. Check device_id
          const storedRegistration = await Preferences.get({ key: 'deviceRegistrationData' });
          let currentDeviceId = '';
          if (storedRegistration.value) {
            const data = JSON.parse(storedRegistration.value);
            currentDeviceId = data.device_id || data.uuid;
          }
          if (!currentDeviceId) {
            const deviceIdInfo = await Device.getId();
            currentDeviceId = deviceIdInfo.identifier;
          }

          if (event?.device_id === currentDeviceId || event?.device?.device_id === currentDeviceId) {
            isMatch = true;
          }

          // 2. Check monitor id stored on the user object
          const userResponse = await Preferences.get({ key: 'user' });
          if (userResponse.value && !isMatch) {
            const userData = JSON.parse(userResponse.value);
            const monitorId = userData?.monitor?.id || userData?.id;
            if (monitorId && (event?.id === monitorId || event?.monitor?.id === monitorId || event?.device?.id === monitorId)) {
              isMatch = true;
            }
          }

          // 3. Fallback: compare against monitor metadata persisted in config
          if (!isMatch) {
            const configResponse = await Preferences.get({ key: 'config' });
            if (configResponse.value) {
              const configData = JSON.parse(configResponse.value);
              const configMonitorId = configData?.monitor_id || configData?.monitorId;
              if (configMonitorId && (event?.id === configMonitorId || event?.monitor?.id === configMonitorId || event?.device?.id === configMonitorId)) {
                isMatch = true;
              }

              const configDeviceId = configData?.device_id || configData?.deviceId;
              if (!isMatch && configDeviceId && (event?.device_id === configDeviceId || event?.device?.device_id === configDeviceId)) {
                isMatch = true;
              }
            }
          }

          return isMatch;
        };

      const subscribeToChannel = (channel: string, isPresence: boolean) => {
        const subscriber = isPresence ?
          this.webhookService.subscribePresence.bind(this.webhookService) :
          this.webhookService.subscribePublic.bind(this.webhookService);

        // monitor.deleted
        subscriber(channel, '.monitor.deleted', async (event: any) => {
          console.log(`[AppComponent] Evento monitor.deleted recibido en ${channel}:`, event);

          let parsedData = event;
          if (typeof event === 'string') {
            try {
              parsedData = JSON.parse(event);
            } catch (e) { }
          } else if (event?.data && typeof event.data === 'string') {
            try {
              parsedData = JSON.parse(event.data);
            } catch (e) { }
          }

          const monitorPayload = parsedData?.monitor || parsedData;
          const isMatch = await checkIsCurrentDevice(monitorPayload);

          if (isMatch) {
            console.log('[AppComponent] Match found for deleted event. Clearing data and redirecting to login...');
            await Preferences.clear();
              localStorage.removeItem('config');
              localStorage.removeItem('user');
              this.localdataService.deletePreviousPatients();
              this.ngZone.run(async () => {
                await this.router.navigate(['/login'], { replaceUrl: true });
                setTimeout(() => window.location.reload(), 100);
              });
            }
          });

          // monitor.updated
          subscriber(channel, '.monitor.updated', async (event: any) => {
            console.log(`[AppComponent] Evento monitor.updated recibido en ${channel}:`, event);

          let parsedData = event;
          if (typeof event === 'string') {
            try {
              parsedData = JSON.parse(event);
            } catch (e) {
              console.error('Error parsing event data', e);
            }
          } else if (event?.data && typeof event.data === 'string') {
            try {
              parsedData = JSON.parse(event.data);
            } catch (e) {
              console.error('Error parsing event.data', e);
            }
          }

          const monitorPayload = parsedData?.monitor || parsedData;
          const isMatch = await checkIsCurrentDevice(monitorPayload);

          if (isMatch) {
            console.log('[AppComponent] Match found for updated event. Updating preferences and reloading view...', monitorPayload);

            // Actualizar config en preferencias
            try {
              const currentConfigRaw = await Preferences.get({ key: 'config' });
              if (currentConfigRaw.value) {
                const currentConfig = JSON.parse(currentConfigRaw.value);

                const room = monitorPayload?.room || currentConfig.waitingRoom;
                const branch = monitorPayload?.branch || currentConfig.branch;
                const appMode = String(monitorPayload?.view_mode ?? currentConfig.aplication);

                const newConfig = {
                  ...currentConfig,
                  branch,
                  waitingRoom: {
                    id: room.id,
                    name: room.name,
                    slug: room.slug,
                    branch_Id: room.branch_id,
                    branch_id: room.branch_id,
                    program: 'status_board'
                  },
                  stationName: monitorPayload?.name || currentConfig.stationName,
                  stationType: appMode === '1' ? 'OR Controller' : 'OR Dashboard',
                  aplication: appMode,
                  statuses: Array.isArray(monitorPayload?.visible_statuses) ? monitorPayload.visible_statuses : currentConfig.statuses,
                  privacy_mode: !!monitorPayload?.privacy_mode,
                    language: monitorPayload?.lang || currentConfig.language,
                    monitor_id: monitorPayload?.id ?? currentConfig.monitor_id,
                    device_id: monitorPayload?.device_id ?? currentConfig.device_id
                };

                await Preferences.set({ key: 'config', value: JSON.stringify(newConfig) });
                await Preferences.set({ key: 'branch', value: JSON.stringify(branch) });
                await Preferences.set({ key: 'waiting_rooms', value: JSON.stringify([newConfig.waitingRoom]) });

                // IMPORTANTE: Mantener en sincronía localStorage para los Guards y visuales inmediatos
                localStorage.setItem('config', JSON.stringify(newConfig));

                const currentUserRaw = await Preferences.get({ key: 'user' });
                if(currentUserRaw.value) {
                  const currentUser = JSON.parse(currentUserRaw.value);
                  currentUser.monitor = { ...currentUser.monitor, ...monitorPayload };
                  await Preferences.set({ key: 'user', value: JSON.stringify(currentUser) });
                }

                const appModeChanged = currentConfig.aplication !== newConfig.aplication;

                this.ngZone.run(async () => {
                  if (appModeChanged) {
                    const destination = (newConfig.aplication === '2' || newConfig.aplication === '3') ? '/dashboard' : '/home';
                    console.log('[AppComponent] Cambiando vista a:', destination);
                    await this.router.navigate([destination], { replaceUrl: true });
                    // Micro-refresh para forzar que los guards y la UI tomen el localStorage y context Angular correctos
                    setTimeout(() => window.location.reload(), 100);
                  } else {
                    const destination = (newConfig.aplication === '2' || newConfig.aplication === '3') ? '/dashboard' : '/home';
                    const currentUrl = this.router.url;
                    if (!currentUrl.includes(destination)) {
                      await this.router.navigate([destination], { replaceUrl: true });
                    } else {
                      // Mismo modo, solo recargar datos
                      this.requestsService.monitorUpdated$.next(true);
                    }
                  }
                });

              }
            } catch (e) {
              console.error('[AppComponent] Error actualizando preferencias:', e);
            }
          }
        });
      };

      // Si ya hay configuración (Room ID), escuchamos en el canal de la sala. Si no, en el canal general 'monitors'.
      if (roomId) {
        console.log(`[AppComponent] Suscribiendo webhooks al canal de presence: rooms.${roomId}.monitors`);
        subscribeToChannel(`rooms.${roomId}.monitors`, true);
      } else {
        console.log(`[AppComponent] Suscribiendo webhooks al canal publico: monitors`);
        subscribeToChannel(`monitors`, false);
      }

    } catch (error) {
      console.error('[AppComponent] Error al inicializar webhooks de monitores:', error);
    }
  }

  // ========== LIVE UPDATES: descarga y recarga inmediata ==========

  /**
   * Inicializa Live Updates y recarga inmediatamente cuando haya una nueva versión
   */
  private async initializeLiveUpdates(): Promise<void> {
    try {
      this.liveUpdateStatus = 'Initializing';
      this.liveUpdateDetail = 'Setting up listeners';
      this.liveUpdateDownloaded = false;
      this.liveUpdateLastCheck = new Date();
      this.liveUpdateLastResult = 'Init';
      console.log('🚀 Inicializando Live Updates (recarga inmediata)...');

      // Verificar al volver del background
      App.addListener('resume', async () => {
        console.log('📱 App resumida desde background');
        await this.checkForUpdatesAndReload('resume');
      });

      // Primera verificación al iniciar
      await this.checkForUpdatesAndReload('startup');

      this.startLiveUpdatePolling();

    } catch (error) {
      console.error('❌ Error al inicializar Live Updates:', error);
      this.liveUpdateStatus = 'Error';
      this.liveUpdateDetail = 'Init failed';
    }
  }

  /**
   * Verifica si hay actualización y la aplica de inmediato
   */
  private async checkForUpdatesAndReload(reason: 'startup' | 'resume' | 'poll'): Promise<void> {
    if (this.liveUpdateInFlight) return;

    this.liveUpdateInFlight = true;
    try {
      console.log('🔍 Verificando actualizaciones...');
      this.liveUpdateStatus = 'Checking';
      this.liveUpdateDetail =
        reason === 'startup'
          ? 'At app start'
          : reason === 'resume'
            ? 'On resume'
            : 'Periodic poll';
      this.liveUpdateLastCheck = new Date();
      this.liveUpdateLastResult = `Checking (${reason})`;

      const result = await LiveUpdates.sync();

      if (result.activeApplicationPathChanged) {
        console.log('✅ Nueva actualización descargada, recargando app...');
        this.liveUpdateDownloaded = true;
        this.liveUpdateStatus = 'Downloaded';
        this.liveUpdateDetail = 'Reloading now';
        this.liveUpdateLastResult = 'Downloaded and reloading';
        await LiveUpdates.reload();
      } else {
        console.log('ℹ️ App actualizada');
        this.liveUpdateDownloaded = false;
        this.liveUpdateStatus = 'No update';
        this.liveUpdateDetail = 'Already on latest';
        this.liveUpdateLastResult = 'No update (latest)';
      }
    } catch (error) {
      console.error('❌ Error al verificar/aplicar actualizaciones:', error);
      this.liveUpdateStatus = 'Error';
      this.liveUpdateDetail = 'Sync failed';
      this.liveUpdateLastResult = `Error: ${(error as any)?.message || 'sync failed'}`;
    } finally {
      this.liveUpdateInFlight = false;
    }
  }

  private startLiveUpdatePolling(): void {
    if (this.liveUpdatePollTimer) return;

    this.liveUpdatePollTimer = setInterval(() => {
      void this.checkForUpdatesAndReload('poll');
    }, this.liveUpdatePollIntervalMs);
  }

  // ========== FIN LIVE UPDATES ==========

  checkRoute(url: string) {
    // El screensaver solo debe mostrarse en la pantalla de PIN
    if (url.includes('/pin')) {
      this.enableScreensaver = true;
      this.resetInactivityTimer();
    } else {
      this.enableScreensaver = false;
      this.hideScreensaver();
    }
  }

  resetInactivityTimer() {
    if (!this.enableScreensaver) {
      clearTimeout(this.timeoutHandle);
      return;
    }
    clearTimeout(this.timeoutHandle);
    this.hideScreensaver();
    this.timeoutHandle = setTimeout(() => this.showScreensaver(), this.inactiveTime);
  }

  showScreensaver() {
    document.getElementById('screensaver')?.classList.add('active');
  }

  hideScreensaver() {
    document.getElementById('screensaver')?.classList.remove('active');
  }

  @HostListener('document:mousemove') onUserActivity() { this.resetInactivityTimer(); }
  @HostListener('document:click') onClick() { this.resetInactivityTimer(); }
  @HostListener('document:touchstart') onTouchStart() { this.resetInactivityTimer(); }
  @HostListener('document:keydown') onKeyDown() { this.resetInactivityTimer(); }

  async init(): Promise<any> {
    if (this.hasNavigated) return;
    try {
      await this.storage.create();
      const userResponse = await Preferences.get({ key: 'user' });
      if (!userResponse.value) {
        this.hasNavigated = true;
        return;
      }
      const configResponse = await Preferences.get({ key: 'config' });
      if (!configResponse.value) {
        this.router.navigate(['/configuration'], { replaceUrl: true });
        this.hasNavigated = true;
        return;
      }

      var tokenAdmin = await this.logger.getTokenAdmin();
      this.requestsService.setAdminToken(tokenAdmin);

      if (!tokenAdmin) {
        this.router.navigate(['/login'], { replaceUrl: true });
        this.hasNavigated = true;
        return;
      } else {
        const token = tokenAdmin;
        if (token && this.localdataService.isTokenExpired(token)) {
          const newToken = await this.requestsService.refreshToken(token);
          if (newToken?.status === 200) {
            this.requestsService.setAdminToken(newToken.data?.jwt.access_token);
            await Preferences.set({
              key: 'admin',
              value: JSON.stringify(newToken.data),
            });
          }
        } else {
          if (token) {
            this.requestsService.setAdminToken(token);
          } else {
            this.router.navigate(['/login'], { replaceUrl: true });
            this.hasNavigated = true;
            return;
          }
        }
      }
      this.localdataService.deletePreviousPatients();
      return true;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  ngOnDestroy() {
    this.stopInactivityTracking();
    App.removeAllListeners();
  }

  private startInactivityTracking(): void {
    if (this.isTrackingActive) {
      return;
    }

    this.stopInactivityTracking();
    this.isTrackingActive = true;
    this.initListener();
    this.initInterval();
  }

  private initListener(): void {
    this.removeListeners();

    this.events.forEach(event => {
      const passiveEvents = ['scroll', 'wheel', 'touchstart', 'touchmove', 'touchend'];
      const options = passiveEvents.includes(event) ? { passive: true } : undefined;
      this.listenerRefs[event] = this.resetTimer.bind(this);
      document.addEventListener(event, this.listenerRefs[event], options);
    });
  }

  private resetTimer(): void {
    if (!this.isTrackingActive) {
      return;
    }

    this.inactivityTime = 0;
    this.timeRemaining$.next(this.maxInactivityTime);
  }

  stopInactivityTracking(): void {
    this.isTrackingActive = false;
    this.removeListeners();
    this.stopInterval();
  }

  private stopInterval(): void {
    this.inactivityTime = 0;
    this.isIntervalRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.timeRemaining$.next(this.maxInactivityTime);
  }

  private removeListeners(): void {
    this.events.forEach(event => {
      if (this.listenerRefs[event]) {
        document.removeEventListener(event, this.listenerRefs[event]);
        delete this.listenerRefs[event];
      }
    });
  }

  private initInterval(): void {
    if (this.isIntervalRunning || this.timer) {
      return;
    }

    this.isIntervalRunning = true;
    this.inactivityTime = 0;
    this.timeRemaining$.next(this.maxInactivityTime);

    this.timer = setInterval(() => {
      if (!this.isTrackingActive || !this.isIntervalRunning) {
        this.stopInterval();
        return;
      }

      const excludedUrls = ['/login', '/pin', '/configuration', '/dashboard'];
      const currentUrl = this.router.url;

      if (excludedUrls.some(url => currentUrl.includes(url))) {
        this.stopInactivityTracking();
        return;
      }

      this.inactivityTime++;
      const remaining = this.maxInactivityTime - this.inactivityTime;
      this.timeRemaining$.next(remaining);

      if (this.inactivityTime >= this.maxInactivityTime) {
        this.modalController.dismiss(null).then(() => true).catch(() => false);
        this.handleLogout();
        this.stopInactivityTracking();
      }
    }, 1000);
  }

  private handleLogout(): void {
    this.notificationService.showInfo('Your session has expired. Please sign in again.', 6000);
    this.router.navigate(['/pin'], { replaceUrl: true });
    this.resetSession();
  }

  public resetSession(): void {
    this.stopInactivityTracking();
    this.inactivityTime = 0;
    this.timeRemaining$.next(this.maxInactivityTime);
    this.startInactivityTracking();
  }

  async startListeners(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      if (!this.isTrackingActive && !this.timer) {
        await this.initListener();
        await this.initInterval();
      }
      resolve(true);
    });
  }
}









