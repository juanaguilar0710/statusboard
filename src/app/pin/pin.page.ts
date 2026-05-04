import { Component, EventEmitter, Input, NgZone, OnInit, Output, OnDestroy } from '@angular/core';
import { RequestsService } from '../api/requests.service';
import { Router } from '@angular/router';
import { Preferences, RemoveOptions } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { Capacitor } from '@capacitor/core';
import { sync } from '@capacitor/live-updates';
import { AlertController, LoadingController } from '@ionic/angular';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../api/network.service';
import { LocaldataService } from '../api/localdata.service';
import { NotificationService } from '../api/notification.service';
import { AppComponent } from '../app.component';
import { App } from '@capacitor/app';
import { LoggerService } from '../api/logger.service';
import { TranslateService } from '../services/translate.service';
import { DevicesService } from '../api/devices.service';
import { WebhookService } from '../services/webhook.service';
import { Device } from '@capacitor/device';
import Swal from 'sweetalert2';


interface DeviceTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  monitor: {
    id: number;
    name: string;
    device_id: string;
    is_enabled: boolean;
    is_confirmed: boolean;
    confirmed_at: string;
    view_mode: number | string;
    visible_statuses?: any[];
    privacy_mode?: boolean;
    lang?: string;
    branch?: {
      id: number;
      name: string;
      image_url: string;
    };
    room: {
      id: number;
      name: string;
      slug?: string;
      branch_id: number;
    };
  };
}

@Component({
  selector: 'app-pin',
  templateUrl: './pin.page.html',
  styleUrls: ['./pin.page.scss'],
})

export class PinPage implements OnInit{//, OnDestroy {

  private readonly DEVICE_REGISTRATION_STORAGE_KEY = 'deviceRegistrationData';
  private readonly DEVICE_TOKEN_RESPONSE_STORAGE_KEY = 'deviceTokenResponse';
  private readonly RECAPTCHA_FIELD_NAME = 'g-recaptcha-response';
  private readonly RECAPTCHA_SCRIPT_ID = 'google-recaptcha-v3';
  private recaptchaScriptLoadPromise: Promise<void> | null = null;

  @Input() pagetitle: String = "Enter Pin";
  loading: boolean = true;
  isInitializing: boolean = true;
  pin: string = "";
  clicks = 0;
  version: string = environment.version;
  isCheckingForUpdates: boolean = false;
  @Output() change: EventEmitter<string> = new EventEmitter<string>();
  networkStatus: string = "ONLINE";
  lastsync: string = new Date().toLocaleString();
  image_url = "";
  branch_name = "";
  waitingRoom_name = "";
  configResponse:any
  private webhookUnsubscribers: Array<() => void> = [];
  private monitorEventsConnected = false;

  private isNavigating = false; // Indicador de estado de navegación

  constructor(
    public requestsService: RequestsService,
    private alertController: AlertController,
    private router: Router,
    private networkService: NetworkService,
    private _ngZone: NgZone,
    private localdataService: LocaldataService,
    public loadingController: LoadingController,
    private appComponent: AppComponent,
    private logger: LoggerService,
    private notificationService: NotificationService,
    public translate: TranslateService,
    private deviceservice: DevicesService,
    private webhookService: WebhookService,
  ) {
    // Escuchar el estado de la red
    this.networkService.networkStatus$.subscribe((status: string) => {
      this._ngZone.run(() => {
        this.networkStatus = status;
      });
    });

  }

  async presentLoading() {
    this.loading = true;
    return await this.loadingController.create({
      message: this.translate.instant('pin.loggingIn'),
      spinner: 'crescent',
    }).then(a => {
      a.present().then(() => {
        if (!this.loading) {
          a.dismiss();
        }
      });
    });
  }

  async dismissLoading() {
    if (!this.loading) return;  // Solo intentar cerrar si está abierto
    this.loading = false;
    try {
      await this.loadingController.dismiss();
    } catch (error) {
      console.error('Error al intentar cerrar el overlay:', error);
    }
  }

  emitEvent() {
    this.change.emit(this.pin);
  }

  async noInternet() {
    const alert = await this.alertController.create({
      header: this.translate.instant('pin.noInternet'),
      message: this.translate.instant('pin.noInternetMessage'),
      buttons: ['OK']
    });
    await alert.present();
  }

  private async showLogAlert(action: string, details: any = {}): Promise<void> {
    const detailMessage = details?.error?.detail
      || details?.error?.message
      || details?.detail
      || details?.message
      || '';

    const message = detailMessage
      ? `${action}<br><br>${detailMessage}`
      : action;

    const alert = await this.alertController.create({
      header: 'Error',
      message,
      buttons: ['OK']
    });

    await alert.present();
  }

  async checkForUpdatesManually(): Promise<void> {
    if (this.isCheckingForUpdates) {
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      this.notificationService.showInfo('Manual update check is only available on the installed app.', 5000);
      return;
    }

    this.isCheckingForUpdates = true;

    try {
      await Toast.show({ text: 'Checking for updates…', duration: 'short' });

      const result: any = await sync();

      if (result && typeof result === 'object' && typeof result.activeApplicationPathChanged === 'boolean') {
        if (!result.activeApplicationPathChanged) {
          await Toast.show({ text: 'No updates available.', duration: 'short' });
        } else {
          await Toast.show({ text: 'Update downloaded and will be applied now.', duration: 'long' });
        }
      } else if (result && typeof result === 'object' && typeof result.message === 'string') {
        await Toast.show({ text: `Update error: ${result.message}`, duration: 'long' });
      }
    } catch (error: any) {
      await this.showLogAlert('pin.checkForUpdatesManually', { error });
      await Toast.show({ text: 'Update check failed.', duration: 'long' });
    } finally {
      this.isCheckingForUpdates = false;
    }
  }

  handleInput(pin: string) {
    if (this.networkStatus.toUpperCase() === "OFFLINE") {
      this.noInternet();
      return;
    }
    if (pin === "clear") {
      this.pin = "";
      return;
    }

    if (this.pin.length === 6) {
      return;
    }
    this.pin += pin;
    if (this.pin.length === 6) {
      this.loading = true;
      this.isInitializing = false;

      if (localStorage.getItem('is_activation_flow') === 'true') {
        this.requestTokenFromConfirmation();
      } else {
        this.login();
      }
      return;
    }
  }

  deviceInfo: any = null;
   async ngOnInit() {
    await Preferences.get({ key: 'deviceRegistrationData' }).then(res => {
      this.deviceInfo = res.value ? JSON.parse(res.value) : null;
    });

    this.appComponent.stopInactivityTracking();
    this.loading = true;
    this.isInitializing = true;
    this.lastsync = this.requestsService.lastSync;


    if (localStorage.getItem('is_activation_flow') === 'true') {

      // Estamos en el flujo de activación, no requerimos config previa.
      setTimeout(() => {
        this.image_url = 'assets/logos/DTouchmedia_Black.png';
        this.branch_name = 'Activación de Dispositivo';
        this.waitingRoom_name = 'Ingrese su PIN para continuar';
        this.isInitializing = false;
        this.loading = false;
      }, 1000);

       const event = localStorage.getItem('event')
      const IdDevice = event ? JSON.parse(event)?.id : null;
      const tempToken = localStorage.getItem('tempToken') || '';

      const tokenMonitorResponse = await this.deviceservice.requestDeviceToken(IdDevice, {
          temp_token: tempToken,
          client_id: environment.oauthObj.clientId,
          client_secret: environment.oauthObj.clientSecret,
        });

      localStorage.setItem('monitorToken', tokenMonitorResponse.data.access_token);
      await this.applyTokenMonitorResponseConfiguration(tokenMonitorResponse.data);
      await this.connectToMonitorEvents();
      return;
    }
    // Obtener configuración local y redirigir según el modo
    const config = await this.localdataService.getConfiguration();
    if (!config) {
      this.isInitializing = false;
      this.router.navigate(['/login'], { replaceUrl: true });
      this.loading = false;
      return;
    }
    this.configResponse = config;
    await this.connectToMonitorEvents();
    // Redirección según el valor de aplication
    if (String(this.configResponse.aplication) === "1") {
      // Tablet: no redirige, espera PIN y luego va a /home
      setTimeout(() => {
        this.image_url = this.requestsService.config?.branch?.image_url ?? 'assets/logos/logotipo_placeholder.png';
        this.branch_name = this.requestsService.config?.branch?.name ?? "";
        this.waitingRoom_name = this.requestsService.config?.waitingRoom?.name ?? "";
        if (this.configResponse?.is_enabled === false) {
          this.appComponent.showScreensaver();
        } else {
          this.appComponent.hideScreensaver();
        }
        this.isInitializing = false;
        this.loading = false;
      }, 2500);

    } else if (String(this.configResponse.aplication) === "2" || String(this.configResponse.aplication) === "3") {
      // Dashboard o modo especial: ir directo a dashboard
      this.isInitializing = false;
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }

  async headerClicked() {
    this.clicks++;
    if (this.clicks === 3) {
      const alert = await this.alertController.create({
        header: this.translate.instant('pin.enterAdminPassword'),
        message: this.translate.instant('pin.adminPasswordWarning'),
        buttons: [this.translate.instant('common.cancel'), this.translate.instant('common.ok')],
        inputs: [{
          name: 'pin',
          type: 'password',
          placeholder: this.translate.instant('pin.enterPassword')
        }]
      });
      await alert.present();
      alert.onDidDismiss().then((data) => {
        this.clicks = 0;
        if (data.data?.values)
          if (data.data.values.pin === environment.resetPin) {
            this.presentAlert();
          } else {
            Toast.show({
              text: this.translate.instant('pin.incorrectPassword'),
              duration: 'long'
            });
          }
      });
    }
  }

   resolution:any;

  showResolution() {
    const width = window.screen.width;
    const height = window.screen.height;
    this.resolution = `Width ${width} x height ${height}`;
  }

async deleteCurrentMonitor() {
      try {
        const deviceTokenResponse = await Preferences.get({ key: 'deviceRegistrationData' });

        if (deviceTokenResponse.value) {
          const monitorObj = JSON.parse(deviceTokenResponse.value);
          const monitorId = monitorObj.id;
          const token = await this.logger.getTokenAdmin();
          if (monitorId && token) {
           const tokenResponse = await this.deviceservice.deleteMonitor(monitorId, token);
             if (tokenResponse.status === 404) {
                this.loading = false;
                return;
              }
          }
        }
      } catch (err) {
        console.error('Error eliminando el monitor del backend:', err);
      }
    }

    private async navigateToLoginForFreshRegistration(): Promise<void> {
      this.webhookUnsubscribers.forEach((unsubscribe) => unsubscribe());
      this.webhookUnsubscribers = [];
      this.monitorEventsConnected = false;

      await Preferences.clear();
      localStorage.clear();
      await this.router.navigate(['/login'], {
        replaceUrl: true,
        state: { resetDeviceRegistration: true }
      });
    }

    async presentAlert() {
      // Presentar alerta con opciones para ir a login o configuración
      const alert = await this.alertController.create({
        header: this.translate.instant('pin.adminOptions'),
        message: this.translate.instant('pin.selectOption'),
        buttons: [
          // {
          //   text: this.translate.instant('pin.login'),
          //   handler: async () => {
          //     this.loading = true;
          //     await this.deleteCurrentMonitor();
          //     await this.navigateToLoginForFreshRegistration();
          //     this.loading = false;
          //   }
          // },
          {
          text: this.translate.instant('pin.showResolution'),
          handler: () => {
            this.showResolutionAlert();
            return false;
          }
          },
        // {
        //   text: this.translate.instant('pin.configuration'),
        //   handler: () => {
        //     // const options: RemoveOptions = { key: 'config' };
        //     // Preferences.remove(options);
        //     this.router.navigate(['/configuration'], { replaceUrl: true });
        //   }
        // },
        {
          text: this.translate.instant('pin.closeApp'),
            handler: async () => {
              await this.deleteCurrentMonitor();
              await this.navigateToLoginForFreshRegistration();
            App.exitApp(); // Cierra la aplicación
          }
        }
      ]
    });
    await alert.present();
  }

    async showResolutionAlert() {
      this.showResolution(); // Actualiza this.resolution

      const resolutionAlert = await this.alertController.create({
          header: this.translate.instant('pin.deviceResolution'),
          message: this.resolution,
          buttons: ['OK']
        });

        await resolutionAlert.present();
      }

  private getRecaptchaSiteKey(): string {
    return String(environment?.recaptcha?.siteKey || '').trim();
  }

  private async ensureRecaptchaScriptLoaded(): Promise<void> {
    const siteKey = this.getRecaptchaSiteKey();
    if (!siteKey || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const hasRecaptchaGlobal = (window as any).grecaptcha
      && typeof (window as any).grecaptcha.execute === 'function'
      && typeof (window as any).grecaptcha.ready === 'function';

    if (hasRecaptchaGlobal) {
      return;
    }

    if (!this.recaptchaScriptLoadPromise) {
      this.recaptchaScriptLoadPromise = new Promise<void>((resolve, reject) => {
        let scriptElement = document.getElementById(this.RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;
        if (!scriptElement) {
          scriptElement = document.createElement('script');
          scriptElement.id = this.RECAPTCHA_SCRIPT_ID;
          scriptElement.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
          scriptElement.async = true;
          scriptElement.defer = true;
          document.head.appendChild(scriptElement);
        }

        const startTime = Date.now();
        const timeoutMs = 12000;
        const interval = window.setInterval(() => {
          const grecaptcha = (window as any).grecaptcha;
          if (grecaptcha && typeof grecaptcha.execute === 'function' && typeof grecaptcha.ready === 'function') {
            window.clearInterval(interval);
            resolve();
            return;
          }

          if (Date.now() - startTime > timeoutMs) {
            window.clearInterval(interval);
            reject(new Error('reCAPTCHA script load timeout'));
          }
        }, 100);

        scriptElement.addEventListener('error', () => {
          window.clearInterval(interval);
          reject(new Error('reCAPTCHA script failed to load'));
        }, { once: true });
      });
    }

    return this.recaptchaScriptLoadPromise;
  }

  private async getRecaptchaToken(action: string): Promise<string> {
    const siteKey = this.getRecaptchaSiteKey();
    if (!siteKey) {
      return '';
    }

    try {
      await this.ensureRecaptchaScriptLoaded();

      const grecaptcha = (window as any).grecaptcha;
      if (!grecaptcha || typeof grecaptcha.ready !== 'function' || typeof grecaptcha.execute !== 'function') {
        return '';
      }

      await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
      const token = await grecaptcha.execute(siteKey, { action });

      return typeof token === 'string' ? token : '';
    } catch (error) {
      await this.showLogAlert('pin.getRecaptchaToken', { error, action });
      return '';
    }
  }

  private getStatusCode(error: any): number {
    const rawStatus = error?.status
      ?? error?.data?.status
      ?? error?.response?.status
      ?? error?.response?.data?.status
      ?? error?.error?.status
      ?? error?.error?.response?.status
      ?? error?.error?.response?.data?.status
      ?? error?.error?.error?.status;

    const status = Number(rawStatus);
    return Number.isFinite(status) ? status : 0;
  }

  private getRecaptchaValidationMessages(error: any): string[] {
    const groups = [
      error?.validation?.recaptcha,
      error?.data?.validation?.recaptcha,
      error?.response?.data?.validation?.recaptcha,
      error?.error?.validation?.recaptcha,
      error?.error?.data?.validation?.recaptcha,
      error?.error?.response?.data?.validation?.recaptcha,
      error?.error?.error?.validation?.recaptcha,
    ];

    const flattened = groups
      .filter((group: any) => Array.isArray(group))
      .reduce((acc: any[], group: any[]) => acc.concat(group), []);

    return flattened
      .filter((msg: any) => typeof msg === 'string' && msg.trim().length > 0)
      .map((msg: string) => msg.trim());
  }

  private getErrorDetail(error: any): string {
    if (!error || typeof error !== 'object') {
      return '';
    }

    const validationMessages = this.getRecaptchaValidationMessages(error);
    if (validationMessages.length > 0) {
      return validationMessages[0];
    }

    const detailCandidates = [
      error?.detail,
      error?.data?.detail,
      error?.response?.data?.detail,
      error?.error?.detail,
      error?.data?.message,
      error?.response?.data?.message,
      error?.error?.error?.detail,
    ];

    for (const candidate of detailCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    const fallbackMessageCandidates = [
      error?.message,
      error?.error?.message,
      error?.error?.data?.message,
      error?.error?.response?.data?.message,
      error?.error?.error?.message,
    ];

    for (const candidate of fallbackMessageCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return '';
  }

  private isRecaptchaAppClientMismatch(error: any): boolean {
    const detail = this.getErrorDetail(error).toLowerCase();
    const status = this.getStatusCode(error);

    const validationMessages = this.getRecaptchaValidationMessages(error)
      .map((msg: string) => msg.toLowerCase());

    const hasRecaptchaValidation = validationMessages.length > 0;
    const signalText = [
      detail,
      validationMessages.join(' | '),
      String(error?.response?.data?.detail || '').toLowerCase(),
      String(error?.data?.detail || '').toLowerCase(),
      String(error?.error?.detail || '').toLowerCase(),
      String(error?.error?.response?.data?.detail || '').toLowerCase(),
    ].join(' | ');

    const hasSuspiciousActivity = signalText.includes('suspicious activity detected. please try again later.');
    const hasKnownRecaptchaCode = signalText.includes('[app_client_mismatch:')
      || signalText.includes('[verify_failed:')
      || signalText.includes('invalid-keys')
      || signalText.includes('recaptcha');
    const looksLikeHttpError = status >= 400 || status === 0;

    return looksLikeHttpError && (hasRecaptchaValidation || hasSuspiciousActivity || hasKnownRecaptchaCode);
  }

  private escapeHtml(value: string): string {
    const raw = String(value || '');
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }



  async login() {
    if (this.isNavigating) return;
    this.isNavigating = true;
    try {
      const event = localStorage.getItem('event')
      const IdDevice = event ? JSON.parse(event)?.id : null;
      const tempToken = localStorage.getItem('tempToken') || '';
      const recaptchaToken = await this.getRecaptchaToken('monitor_pin_login');
      const tokenResponse = await this.deviceservice.requestDeviceToken(IdDevice, {
        temp_token: tempToken,
        user_pin: this.pin,
        client_id: environment.oauthObj.clientId,
        client_secret: environment.oauthObj.clientSecret,
        [this.RECAPTCHA_FIELD_NAME]: recaptchaToken,
      });

      if (tokenResponse.status === 404) {
          this.loading = false;
          this.notificationService.showError(this.translate.instant('pin.incorrectMonitor'), 6000);
          Preferences.clear();
          this.router.navigate(['/login'], { replaceUrl: true });
          return;
        }

      if (tokenResponse.status === 401) {
        this.loading = false;
        this.notificationService.showError(tokenResponse.data?.message || this.translate.instant('pin.incorrectPin'), 6000);
        this.handleInput("clear");
        return;
      }

      const payload = tokenResponse?.data ?? tokenResponse;
      await this.applyTokenResponseConfiguration(payload);
      this.appComponent.resetSession();
    } catch (error: any) {
      console.error('Error durante el proceso de login:', error);

      this.handleInput("clear");
      this.loading = false;
      try {
        await this.loadingController.dismiss();
      } catch (dismissError) {
        console.error('Error al intentar cerrar el loading:', dismissError);
      }

      if (error?.status === 401) {
        this.notificationService.showError(this.translate.instant('pin.incorrectPin'), 6000);
      } else {
        this.notificationService.showError(this.translate.instant('pin.internalError') + ' ' + (error?.error?.detail || error?.message || error), 4000);
      }
    } finally {
      this.isNavigating = false;
    }
  }


  private async navigateTo(route: string) {
    if (this.isNavigating || this.router.url === route) return;
    this.isNavigating = true;
    try {
      await this.router.navigate([route], { replaceUrl: true });
    } catch (error) {
      console.error('Navigation error:', error);
    } finally {
      this.isNavigating = false;
    }
  }


  private async requestTokenFromConfirmation(): Promise<void> {
    try {

      const event = localStorage.getItem('event')
      const IdDevice = event ? JSON.parse(event)?.id : null;
      const tempToken = localStorage.getItem('tempToken') || '';
      const recaptchaToken = await this.getRecaptchaToken('monitor_pin_login');

      const tokenResponse = await this.deviceservice.requestDeviceToken(IdDevice, {
        temp_token: tempToken,
        user_pin: this.pin,
        client_id: environment.oauthObj.clientId,
        client_secret: environment.oauthObj.clientSecret,
        [this.RECAPTCHA_FIELD_NAME]: recaptchaToken,
      });

      if (tokenResponse.status === 404) {
        this.loading = false;
        this.notificationService.showError(this.translate.instant('pin.incorrectMonitor'), 6000);
        Preferences.clear();
        this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      if (tokenResponse.status === 401) {
        this.loading = false;
        this.notificationService.showError(tokenResponse.data.message ? tokenResponse.data.message : this.translate.instant('pin.incorrectMonitor'), 6000);
        this.handleInput("clear");
        return;
      }

      if (tokenResponse.status === 500) {
        this.loading = false;
        this.notificationService.showError(tokenResponse.data.error.detail ? tokenResponse.data.error.detail : this.translate.instant('pin.incorrectMonitor'), 6000);
        this.handleInput("clear");
        return;
      }


      const payload = (tokenResponse?.data ?? tokenResponse);
      await this.applyTokenResponseConfiguration(payload);
    } catch (error: any) {
        console.log(error);
        this.loading = false;
        this.loadingController.dismiss();
        this.handleInput("clear");
        this.notificationService.showError(this.translate.instant('pin.incorrectPin') + ' / ' + (error?.error?.detail || error.message || 'Error'), 6000);
    }
  }

  private async applyTokenResponseConfiguration(payload: any): Promise<void> {
    const accessToken = payload?.access_token;
    const refreshToken = payload?.refresh_token;
    const monitor = payload?.monitor;
    const room = monitor?.room;

    if (!accessToken || !monitor || !room?.id || !room?.branch_id) {
      await this.showLogAlert('applyTokenResponseConfiguration', { payload });
      this.loading = false;
      this.handleInput("clear");
      return;
    }

    let branch = payload?.user?.branch || monitor?.branch || {
      id: room.branch_id,
      name: `Branch ${room.branch_id}`,
      image_url: 'assets/logos/logotipo_placeholder.png'
    };

    if (branch?.image_url && branch.image_url.includes('localhost')) {
        branch.image_url = branch.image_url.replace('http://localhost', environment.url);
    }

    const waitingRoom = {
      id: monitor.room.id,
      name: monitor.room.name,
      slug: monitor.room.slug,
      branch_Id: monitor.room.branch_id,
      branch_id: monitor.room.branch_id,
      program: 'status_board'
    };

    const waitingRoomsList = payload?.user?.waitingRooms || [waitingRoom];

    const appMode = String(monitor.view_mode ?? '1');
    const config = {
      branch,
      waitingRoom,
      monitor_id: monitor.id,
      device_id: monitor.device_id,
      is_enabled: monitor.is_enabled ?? true,
      stationName: monitor.name,
      stationType: appMode === '1' ? 'OR Controller' : 'OR Dashboard',
      aplication: appMode,
      statuses: Array.isArray(monitor.visible_statuses) ? monitor.visible_statuses : [],
      privacy_mode: !!monitor.privacy_mode,
      lang: monitor.lang || 'es',
      token: accessToken,
      language: monitor.lang || 'es'
    };

    const userToSave = payload?.user ? {
      ...payload.user,
      monitor,
      user: payload.user
    } : {
      id: monitor.id,
      name: monitor.name,
      monitor,
      user: {
        username: monitor.device_id || monitor.name || 'monitor-device'
      }
    };

    await Promise.all([
      Preferences.set({ key: 'deviceTokenResponse', value: JSON.stringify(payload) }),
      Preferences.set({ key: 'config', value: JSON.stringify(config) }),
      Preferences.set({ key: 'branch', value: JSON.stringify(branch) }),
      Preferences.set({ key: 'waiting_rooms', value: JSON.stringify(waitingRoomsList) }),
      Preferences.set({ key: 'admin', value: JSON.stringify({ token: accessToken, expires_in: payload.expires_in }) }),
      Preferences.set({ key: 'user', value: JSON.stringify(userToSave) }),
    ]);

    localStorage.setItem('user', JSON.stringify(userToSave));
    this.localdataService.user = userToSave;

    localStorage.removeItem('is_activation_flow');

    this.requestsService.setToken(accessToken);
    this.requestsService.setAdminToken(accessToken);
    this.requestsService.setExpiresIn(payload.expires_in);
    if (refreshToken) {
      this.requestsService.setRefreshToken(refreshToken);
    }
    this.requestsService.setConfig(config);
    this.requestsService.logout$.next(false);

    await this.logger.setTokenAdmin(accessToken, payload.expires_in ?? 31535999);

    this.loading = false;
    this.loadingController.dismiss();
    const destination = appMode === '2' || appMode === '3' ? '/dashboard' : '/home';
    await this.router.navigate([destination], { replaceUrl: true });
  }

  ngOnDestroy() {
    this.webhookUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.webhookUnsubscribers = [];
    this.monitorEventsConnected = false;
  }

  async connectToMonitorEvents() {
    if (this.monitorEventsConnected) {
      return;
    }

    if (!this.requestsService.config || !this.requestsService.config.waitingRoom) {
      await this.requestsService.init();
      if (!this.requestsService.config || !this.requestsService.config.waitingRoom) return;
    }

    const channelForMonitor = `rooms.${this.requestsService.config.waitingRoom.id}.monitors`;

    const unsubscribeMonitorUpdated = await this.webhookService.subscribePresence(channelForMonitor, '.monitor.updated', async (e: any) => {
      if (this.networkStatus === "ONLINE") {
          console.log('[Pin] 🟢 monitor.updated recibido:', e);
          const monitorPayload = e?.monitor || e;
          const isMatch = await this.checkIsCurrentDevice(monitorPayload);
          if (isMatch) {
            console.log('[Pin] 🔄 Actualizando configuración del monitor...');
            // Actualizar configuración local
            const currentConfig = this.configResponse;
            if (monitorPayload.name) currentConfig.stationName = monitorPayload.name;
            if (monitorPayload.view_mode) currentConfig.aplication = monitorPayload.view_mode.toString();
            if (monitorPayload.visible_statuses) currentConfig.statuses = monitorPayload.visible_statuses;
            if (monitorPayload.lang) currentConfig.lang = monitorPayload.lang;
            if (monitorPayload.privacy_mode !== undefined) currentConfig.privacy_mode = monitorPayload.privacy_mode;
            if (monitorPayload.is_enabled !== undefined) currentConfig.is_enabled = monitorPayload.is_enabled;
            if (monitorPayload.branch) currentConfig.branch = monitorPayload.branch;

            // Guardar cambios
            this.configResponse = currentConfig;
            this.requestsService.config = currentConfig;
            await Preferences.set({ key: 'config', value: JSON.stringify(currentConfig) });
            console.log('[Pin] ✅ Configuración actualizada:', currentConfig);

            // Manejar screensaver según is_enabled
            if (currentConfig.is_enabled === false) {
              console.log('[Pin] 🔒 Monitor deshabilitado, mostrando screensaver');
              this.appComponent.showScreensaver();
            } else {
              console.log('[Pin] 🔓 Monitor habilitado, ocultando screensaver');
              this.appComponent.hideScreensaver();
            }
          }
      }
    });

    const unsubscribeMonitorDeleted = await this.webhookService.subscribePresence(channelForMonitor, '.monitor.deleted', async (e: any) => {
      if (this.networkStatus === "ONLINE") {
          console.log('[Pin] 🔴 monitor.deleted recibido:', e);
          const monitorPayload = e?.monitor || e;
          const isMatch = await this.checkIsCurrentDevice(monitorPayload);
          if (isMatch) {
            console.log('[Pin] ⚠️ Este dispositivo fue eliminado. Limpiando datos...');
            await Preferences.clear();
            localStorage.clear();
            this.localdataService.deletePreviousPatients();
            await Toast.show({
              text: 'Dispositivo eliminado por el administrador',
              duration: 'long',
              position: 'top'
            });
            await this.router.navigate(['/login'], { replaceUrl: true });
            setTimeout(() => window.location.reload(), 100);
          }
      }
    });

    this.webhookUnsubscribers.push(
      unsubscribeMonitorUpdated,
      unsubscribeMonitorDeleted
    );
    this.monitorEventsConnected = true;
  }

  private async checkIsCurrentDevice(event: any): Promise<boolean> {
    let isMatch = false;
    const normalize = (value: any): string => {
      if (value === null || value === undefined) return '';
      return String(value).trim().toLowerCase();
    };
    const eventPayload = event?.monitor || event || {};
    let configData: any = null;

    try {
      // 1. Verificar por device_id
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

      const configResponse = await Preferences.get({ key: 'config' });
      if (configResponse.value) {
        configData = JSON.parse(configResponse.value);
      }
      if (!currentDeviceId) {
        currentDeviceId = configData?.device_id;
      }

      const eventDeviceId = normalize(eventPayload?.device_id || eventPayload?.device?.device_id);
      const normalizedCurrentDeviceId = normalize(currentDeviceId);

      if (eventDeviceId && normalizedCurrentDeviceId && eventDeviceId === normalizedCurrentDeviceId) {
        console.log('[Pin] ✓ Match por device_id:', currentDeviceId);
        isMatch = true;
      }

      // 2. Verificar por monitor_id desde config
      if (!isMatch) {
        const configMonitorId = normalize(configData?.monitor_id || configData?.monitorId);
        const eventMonitorId = normalize(eventPayload?.id || eventPayload?.monitor_id);
        if (configMonitorId && eventMonitorId && configMonitorId === eventMonitorId) {
          console.log('[Pin] ✓ Match por monitor_id:', configMonitorId);
          isMatch = true;
        }
      }

      // 3. Verificar por monitor_id desde user
      if (!isMatch) {
        const userResponse = await Preferences.get({ key: 'user' });
        if (userResponse.value) {
          const userData = JSON.parse(userResponse.value);
          const monitorId = normalize(userData?.monitor?.id || userData?.id);
          const eventMonitorId = normalize(eventPayload?.id || eventPayload?.monitor_id);
          if (monitorId && eventMonitorId && monitorId === eventMonitorId) {
            console.log('[Pin] ✓ Match por user.monitor_id:', monitorId);
            isMatch = true;
          }
        }
      }

      console.log('[Pin] checkIsCurrentDevice result:', isMatch);
      return isMatch;
    } catch (error) {
      console.error('[Pin] ❌ Error en checkIsCurrentDevice:', error);
      return false;
    }
  }

  private async applyTokenMonitorResponseConfiguration(payload: DeviceTokenResponse): Promise<void> {
    const accessToken = payload?.access_token;
    const monitor = payload?.monitor;
    const room = monitor?.room;

    if (!accessToken || !monitor || !room?.id || !room?.branch_id) {
      await this.showLogAlert('applyTokenResponseConfiguration', { payload });
      return;
    }

    let branch: any = monitor?.branch || {
      id: room.branch_id,
      name: `Branch ${room.name}`,
      image_url: 'assets/logos/logotipo_placeholder.png'
    };

    // Limpieza de URL de localhost a la del ambiente configurado
    if (branch?.image_url && branch.image_url.includes('localhost')) {
        branch.image_url = branch.image_url.replace('http://localhost', environment.url);
    }

    const waitingRoom = {
      id: room.id,
      name: room.name,
      slug: room.slug,
      branch_Id: room.branch_id,
      branch_id: room.branch_id,
      program: 'status_board'
    };

    const appMode = monitor.view_mode;
    const config = {
      branch,
      waitingRoom,
      monitor_id: monitor.id,
      device_id: monitor.device_id,
      stationName: monitor.name,
      stationType: appMode === '1' ? 'OR Controller' : 'OR Dashboard',
      aplication: appMode,
      statuses: Array.isArray(monitor.visible_statuses) ? monitor.visible_statuses : [],
      privacy_mode: !!monitor.privacy_mode,
      is_enabled: monitor.is_enabled !== undefined ? monitor.is_enabled : true,
      lang: monitor.lang || 'es',
      token: accessToken,
      language: monitor.lang || 'es'
    };

    const user = {
      id: monitor.id,
      name: monitor.name,
      monitor,
      user: {
        username: monitor.device_id || monitor.name || 'monitor-device'
      }
    };

    await Promise.all([
      Preferences.set({ key: this.DEVICE_TOKEN_RESPONSE_STORAGE_KEY, value: JSON.stringify(payload) }),
      Preferences.set({ key: 'config', value: JSON.stringify(config) }),
      Preferences.set({ key: 'branch', value: JSON.stringify(branch) }),
      Preferences.set({ key: 'waiting_rooms', value: JSON.stringify([waitingRoom]) }),
      Preferences.set({ key: 'admin', value: JSON.stringify({ token: accessToken, expires_in: payload.expires_in }) }),
      Preferences.set({ key: 'user', value: JSON.stringify(user) })
    ]);

    localStorage.setItem('user', JSON.stringify(user));

    this.requestsService.setToken(accessToken);
    this.requestsService.setAdminToken(accessToken);
    this.requestsService.setExpiresIn(payload.expires_in);
    this.requestsService.setConfig(config);
    await this.logger.setTokenAdmin(accessToken, payload.expires_in ?? 31535999);
  }

}
