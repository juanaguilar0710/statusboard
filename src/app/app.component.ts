import { Component, HostListener, OnInit } from '@angular/core';
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

  constructor(
    private router: Router,
    private requestsService: RequestsService,
    private logger: LoggerService,
    private storage: Storage,
    private localdataService: LocaldataService,
    private notificationService: NotificationService,
    private modalController: ModalController,
    private platform: Platform
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
        this.currentUrl = event.url || event.urlAfterRedirects;
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
    });
  }

  // ========== LIVE UPDATES - ACTUALIZACIÓN SIEMPRE PERMITIDA ==========

  /**
   * Inicializa Live Updates - Sin restricciones, se actualiza siempre
   */
  private async initializeLiveUpdates(): Promise<void> {
    try {
      console.log('🚀 Inicializando Live Updates (sin restricciones)...');

      // Listener: cuando la app vuelve del background
      App.addListener('resume', async () => {
        console.log('📱 App resumida desde background');
        await this.checkAndApplyUpdate();
      });

      // Primera verificación al iniciar
      await this.checkForUpdates();

    } catch (error) {
      console.error('❌ Error al inicializar Live Updates:', error);
    }
  }

  /**
   * Verifica y aplica actualizaciones inmediatamente si están disponibles
   */
  private async checkAndApplyUpdate(): Promise<void> {
    const shouldReload = localStorage.getItem('shouldReloadApp');

    if (shouldReload === 'true') {
      console.log('🔄 Aplicando actualización inmediatamente...');
      localStorage.removeItem('shouldReloadApp');

      try {
        await LiveUpdates.reload();
      } catch (error) {
        console.error('❌ Error al aplicar actualización:', error);
        localStorage.removeItem('shouldReloadApp');
      }
    } else {
      await this.checkForUpdates();
    }
  }

  /**
   * Verifica si hay actualizaciones disponibles y las descarga
   */
  private async checkForUpdates(): Promise<void> {
    try {
      console.log('🔍 Verificando actualizaciones...');

      const result = await LiveUpdates.sync();

      if (result.activeApplicationPathChanged) {
        console.log('✅ Nueva actualización descargada');
        localStorage.setItem('shouldReloadApp', 'true');
      } else {
        console.log('ℹ️ App actualizada');
      }
    } catch (error) {
      console.error('❌ Error al verificar actualizaciones:', error);
    }
  }

  // ========== FIN LIVE UPDATES ==========

  checkRoute(url: string) {
    if (url.includes('/dashboard')) {
      this.enableScreensaver = false;
    } else {
      this.enableScreensaver = true;
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
