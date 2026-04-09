import { Component, OnDestroy, OnInit } from '@angular/core';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { sync } from '@capacitor/live-updates';
import { RequestsService } from 'src/app/api/requests.service';
import { NotificationService } from 'src/app/api/notification.service';
import { LoggerService } from 'src/app/api/logger.service';
import { WebhookService } from 'src/app/services/webhook.service';
import { environment } from 'src/environments/environment';
import { DevicesService } from 'src/app/api/devices.service';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';

export interface DeviceRegistrationData {
  id: string;
  name: string;
  device_id: string;
  confirmation_code: string;
  temp_token: string;
  confirmation_expires_at: string; // ISO date string
}

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
  selector: 'app-device-activation',
  templateUrl: './device-activation.component.html',
  styleUrls: ['./device-activation.component.scss']
})
export class DeviceActivationComponent implements OnInit, OnDestroy {
  private static registrationRequestInFlight = false;

  private readonly DEVICE_REGISTRATION_STORAGE_KEY = 'deviceRegistrationData';
  private readonly DEVICE_TOKEN_RESPONSE_STORAGE_KEY = 'deviceTokenResponse';

  platformInfo = {
    platform: Capacitor.getPlatform(),
    userAgent: navigator.userAgent
  };

  version: string = environment.version;
  activationCode: string = '------';
  remainingSeconds: number = 300;
  isRegistering: boolean = false;
  isCheckingForUpdates: boolean = false;

  private countdownInterval: any;
  private webhookUnsubscribers: Array<() => void> = [];
  private deviceMetadata: any = null;
  private hasInitialized = false;
  private initializationInProgress = false;
  private tokenRequestInProgress = false;
  private useRecoverOnly: boolean = false;
  private manualRefreshRequested = false;
  private routeSubscription?: Subscription;
  DeviceRegistrationData: DeviceRegistrationData | null = null;

  constructor(
    private requestsService: RequestsService,
    private deviceservice: DevicesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private webhookService: WebhookService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    if (this.hasInitialized) {
      return;
    }
    DeviceActivationComponent.registrationRequestInFlight = false;
    this.hasInitialized = true;
    this.trackRouteState();
    await this.loadStoredDeviceRegistrationData();
    await this.ensureActivationFlowReady();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    // Cleanup webhooks solamente si tenemos unsubscribers registrados
    this.webhookUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.webhookUnsubscribers = [];

    this.routeSubscription?.unsubscribe();
  }

  registerDeviceManually(): boolean {
    if (!this.isCodeScreenActive() || this.isRegistering || DeviceActivationComponent.registrationRequestInFlight) {
      console.warn('[DeviceActivation] registerDeviceManually skipped', {
        isCodeScreenActive: this.isCodeScreenActive(),
        isRegistering: this.isRegistering,
        registrationRequestInFlight: DeviceActivationComponent.registrationRequestInFlight,
      });
      return false;
    }

    this.isRegistering = true;
    DeviceActivationComponent.registrationRequestInFlight = true;
    const deviceId = this.deviceMetadata?.uuid || 'unknown-uuid';
    const recoverDeviceId = this.getRecoverDeviceId();
    // Si ya sabemos que el monitor está registrado, solo usamos /api/recover
    if (this.useRecoverOnly) {
      console.log('[DeviceActivation] recoverDevice using stored device id', {
        recoverDeviceId,
        inMemoryDeviceId: deviceId,
        storedDeviceId: this.DeviceRegistrationData?.device_id,
      });
      this.deviceservice.recoverDevice(recoverDeviceId).subscribe(
        (recoverResp: any) => {
          const data = recoverResp?.data ?? recoverResp;
          this.applyRegistrationData(data as DeviceRegistrationData);
          this.trackManualRefreshSuccess(data as DeviceRegistrationData);
          this.notificationService.showSuccess('Device recovered successfully!', 5000);
          this.finishRegistrationRequest();
        },
        (recoverError: any) => {
          console.log('recover error (only)', recoverError);
          console.error('[DeviceActivation] recoverDevice failed', recoverError);
          void this.trackManualRefreshFailure(recoverError);
          this.notificationService.showError('Failed to recover device. Please try again.', 5000);
          this.finishRegistrationRequest();
        }
      );
      return true;
    }

    // Primer intento: /api/register
    this.deviceservice.registerDevice({
      device_id: deviceId,
      name: this.deviceMetadata?.name || 'Unknown Device',
      model: this.deviceMetadata?.model || 'Unknown Model',
      manufacturer: this.deviceMetadata?.manufacturer || 'Unknown Manufacturer',
      platform: this.deviceMetadata?.platform || 'Unknown Platform',
      os_version: this.deviceMetadata?.osVersion || 'Unknown OS Version',
      generatedAt: new Date().toISOString(),
    }).subscribe(
      (resp: any) => {
        if (resp.status === 500 && resp.data?.error?.detail === 'Monitor already registered') {
          this.useRecoverOnly = true;
          console.log('[DeviceActivation] register returned already registered, switching to recover with stored device id', {
            recoverDeviceId,
            inMemoryDeviceId: deviceId,
            storedDeviceId: this.DeviceRegistrationData?.device_id,
          });
          this.deviceservice.recoverDevice(recoverDeviceId).subscribe(
            (recoverResp: any) => {
              const data = recoverResp?.data ?? recoverResp;
              this.applyRegistrationData(data as DeviceRegistrationData);
              this.trackManualRefreshSuccess(data as DeviceRegistrationData);
              this.notificationService.showSuccess('Device recovered successfully!', 5000);
              this.finishRegistrationRequest();
            },
            (recoverError: any) => {
              console.log('recover error', recoverError);
              console.error('[DeviceActivation] recoverDevice failed after already registered response', recoverError);
              void this.trackManualRefreshFailure(recoverError);
              this.notificationService.showError('Failed to recover device. Please try again.', 5000);
              this.finishRegistrationRequest();
            }
          );
        } else {
          this.applyRegistrationData(resp.data as DeviceRegistrationData);
          this.trackManualRefreshSuccess(resp.data as DeviceRegistrationData);
          this.notificationService.showSuccess('Device registered successfully!', 5000);
          this.finishRegistrationRequest();
        }
      },
      (error: any) => {
        console.log('register error', error);
        console.error('[DeviceActivation] registerDeviceManually failed', { error, deviceId });
        void this.trackManualRefreshFailure(error);
        this.finishRegistrationRequest();
      }
    );

    return true;
  }

  private finishRegistrationRequest(): void {
    this.isRegistering = false;
    DeviceActivationComponent.registrationRequestInFlight = false;
  }

  get timeRemaining(): string {
    const minutes = Math.floor(this.remainingSeconds / 60).toString().padStart(2, '0');
    const seconds = (this.remainingSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
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
      console.error('[DeviceActivation] checkForUpdatesManually failed', error);
      await Toast.show({ text: 'Update check failed.', duration: 'long' });
    } finally {
      this.isCheckingForUpdates = false;
    }
  }

  private async initializeDeviceActivationFlow(): Promise<void> {
    if (!this.isCodeScreenActive()) {
      this.stopCodeCountdown();
      return;
    }

    this.deviceMetadata = await this.collectDeviceMetadata();
    if (!this.deviceMetadata.uuid) {
      this.deviceMetadata.uuid = 'WEB-' + Math.random().toString(36).slice(2, 11);
    }
    await this.subscribeToDeviceWebhooks();

    if (!this.DeviceRegistrationData) {
      await this.registerAndResetCountdown();
      return;
    }

    const remainingSeconds = this.getRemainingSecondsFromRegistration(this.DeviceRegistrationData);
    if (remainingSeconds > 0 && this.hasValidRegistrationData(this.DeviceRegistrationData)) {
      this.remainingSeconds = remainingSeconds;
      this.startCodeCountdown();
      return;
    }

    await this.registerAndResetCountdown();
  }

  private async ensureActivationFlowReady(): Promise<void> {
    if (this.initializationInProgress || !this.isCodeScreenActive()) {
      return;
    }

    this.initializationInProgress = true;

    try {
      await this.initializeDeviceActivationFlow();
    } finally {
      this.initializationInProgress = false;
    }
  }

  private async subscribeToDeviceWebhooks(): Promise<void> {
    const deviceUuid = this.deviceMetadata?.uuid;
    if (!deviceUuid) {
      return;
    }

    await this.webhookService.connect();

    const channel = `monitors`;

    const unsubscribeAllEvents = await this.webhookService.subscribePublicAllEvents(channel, (eventName: string, payload: any) => {
      console.log(`[monitors] event: ${eventName}`, payload);
    });

    const unsubscribeSave = await this.webhookService.subscribePublic(channel, '.monitor.confirmed', (event: any) => {
      console.log('log event confirmed: ', event);
      this.handleDeviceWebhookEvent('confirmed', event);
    });

    // NO guardamos los unsubscribers - permitir que la conexión persista para PIN o Dashboard
    // this.webhookUnsubscribers.push(unsubscribeAllEvents, unsubscribeSave);
  }

  private handleDeviceWebhookEvent(type: 'confirmed' | 'update' | 'delete', event: any): void {
    if (type === 'confirmed') {
      void this.requestTokenFromConfirmation(event);
    }

    if (type === 'update' && event?.device) {
      this.deviceMetadata = {
        ...this.deviceMetadata,
        ...event.device,
      };
    }

    if (type === 'delete') {
      this.notificationService.showInfo('Device record removed from server.', 5000);
    }
  }

  private async persistDeviceRegistrationData(data: DeviceRegistrationData): Promise<void> {
    try {
      await Preferences.set({
        key: this.DEVICE_REGISTRATION_STORAGE_KEY,
        value: JSON.stringify(data)
      });
    } catch (error) {
      console.error('[DeviceActivation] persistDeviceRegistrationData failed', error);
    }
  }

  private async loadStoredDeviceRegistrationData(): Promise<void> {
    try {
      const stored = await Preferences.get({ key: this.DEVICE_REGISTRATION_STORAGE_KEY });
      if (!stored.value) {
        return;
      }
      const parsed = JSON.parse(stored.value) as DeviceRegistrationData;
      if (!this.hasValidRegistrationData(parsed)) {
        await Preferences.remove({ key: this.DEVICE_REGISTRATION_STORAGE_KEY });
        console.warn('[DeviceActivation] loadStoredDeviceRegistrationData invalid payload removed', parsed);
        this.DeviceRegistrationData = null;
        this.activationCode = '------';
        this.remainingSeconds = 300;
        return;
      }
      this.applyRegistrationData(parsed, false);
    } catch (error) {
      console.log('loadStoredDeviceRegistrationData', error);
    }
  }

  private async requestTokenFromConfirmation(event: any): Promise<void> {
    try {
      if (this.tokenRequestInProgress) {
        return;
      }

      if (!this.isCurrentDeviceConfirmation(event)) {
        return;
      }

      const IdDevice = event?.id
      const tempToken = this.DeviceRegistrationData?.temp_token;
      localStorage.setItem('tempToken', tempToken || '');
      localStorage.setItem('event', JSON.stringify(event));
      if (!IdDevice || !tempToken) {
        console.error('[DeviceActivation] requestTokenFromConfirmation missing IdDevice or tempToken', {
          IdDevice,
          hasTempToken: !!tempToken,
          event,
        });
        return;
      }
      // Si view_mode === 1, redirigimos a la pantalla de PIN y pausamos la solicitud de token aquí
      if (event?.view_mode === 1 || event?.view_mode === '1') {
        this.stopCodeCountdown();
        // Guardamos un flag para que la vista de PIN sepa que está en versión "Device Activation"
        localStorage.setItem('is_activation_flow', 'true');
        // Check platform and use run inside zone if necessary for Angular Routing in WebHooks callbacks
        this.router.navigate(['/pin'], { replaceUrl: true }).then(navResult => {
            console.log('Navigation to /pin result:', navResult);
        }).catch(err => {
            console.error('Error navigating to /pin:', err);
        });

        return;
      }

      this.tokenRequestInProgress = true;
      this.stopCodeCountdown();

      const tokenResponse = await this.deviceservice.requestDeviceToken(IdDevice, {
        temp_token: tempToken,
        client_id: environment.oauthObj.clientId,
        client_secret: environment.oauthObj.clientSecret,
      });
      const payload = (tokenResponse?.data ?? tokenResponse) as DeviceTokenResponse;
      await this.applyTokenResponseConfiguration(payload);
    } catch (error) {
      this.tokenRequestInProgress = false;
      console.error('[DeviceActivation] requestTokenFromConfirmation failed', { error, event });
    }
  }

  private isCurrentDeviceConfirmation(event: any): boolean {
    const incomingDeviceId = event?.device_id;
    const currentDeviceId = this.getRecoverDeviceId();

    if (!incomingDeviceId || !currentDeviceId || incomingDeviceId !== currentDeviceId) {
      console.log('[DeviceActivation] requestTokenFromConfirmation ignored', {
        incomingDeviceId,
        currentDeviceId,
        reason: 'Device mismatch or missing device_id'
      });
      return false;
    }

    return true;
  }

  private getRecoverDeviceId(): string {
    return this.DeviceRegistrationData?.device_id || this.deviceMetadata?.uuid || 'unknown-uuid';
  }

  private async applyTokenResponseConfiguration(payload: DeviceTokenResponse): Promise<void> {
    const accessToken = payload?.access_token;
    const monitor = payload?.monitor;
    const room = monitor?.room;
    if (!accessToken || !monitor || !room?.id || !room?.branch_id) {
      console.error('[DeviceActivation] applyTokenResponseConfiguration invalid payload', payload);
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

    const appMode = String(monitor.view_mode ?? '1');
    const config = {
      branch,
      waitingRoom,
      stationName: monitor.name,
      stationType: appMode === '1' ? 'OR Controller' : 'OR Dashboard',
      aplication: appMode,
      statuses: Array.isArray(monitor.visible_statuses) ? monitor.visible_statuses : [],
      privacy_mode: !!monitor.privacy_mode,
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

    this.stopCodeCountdown();

    this.webhookUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.webhookUnsubscribers = [];

    const destination = appMode === '2' || appMode === '3' ? '/dashboard' : '/pin';
    await this.router.navigate([destination], { replaceUrl: true });
  }

  private trackRouteState(): void {
    this.routeSubscription = this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) {
        return;
      }

      if (!this.isCodeScreenActive()) {
        this.stopCodeCountdown();
        return;
      }

      if (!this.deviceMetadata || this.activationCode === '------') {
        void this.ensureActivationFlowReady();
        return;
      }

      if (!this.countdownInterval && !this.tokenRequestInProgress) {
        this.startCodeCountdown();
      }
    });
  }

  private isCodeScreenActive(): boolean {
    return this.router.url.startsWith('/login');
  }


  private startCodeCountdown(): void {
    if (!this.isCodeScreenActive()) {
      return;
    }

    this.stopCodeCountdown();

    this.countdownInterval = setInterval(async() => {
      if (!this.isCodeScreenActive()) {
        this.stopCodeCountdown();
        return;
      }

      this.remainingSeconds -= 1;
      if (this.remainingSeconds <= 0) {
        await this.registerAndResetCountdown();
      }
    }, 1000);
  }

  private stopCodeCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  async refreshActivationCode(): Promise<void> {
    if (!this.isCodeScreenActive() || this.isRegistering || DeviceActivationComponent.registrationRequestInFlight) {
      console.warn('[DeviceActivation] refreshActivationCode skipped', {
        isCodeScreenActive: this.isCodeScreenActive(),
        isRegistering: this.isRegistering,
        registrationRequestInFlight: DeviceActivationComponent.registrationRequestInFlight,
      });
      return;
    }

    if (!this.deviceMetadata) {
      await this.ensureActivationFlowReady();
    }

    if (!this.deviceMetadata) {
      console.warn('[DeviceActivation] refreshActivationCode skipped', {
        reason: 'deviceMetadataUnavailable'
      });
      await Toast.show({ text: 'Unable to refresh code right now.', duration: 'short' });
      return;
    }

    this.manualRefreshRequested = true;
    console.log('[DeviceActivation] refreshActivationCode started', {
      currentCode: this.activationCode,
      remainingSeconds: this.remainingSeconds,
      useRecoverOnly: this.useRecoverOnly,
    });
    await Toast.show({ text: 'Updating code...', duration: 'short' });
    this.stopCodeCountdown();
    await this.refreshCodeAndRestartCountdown();
  }

  private async registerAndResetCountdown(): Promise<void> {
    if (!this.isCodeScreenActive()) {
      this.stopCodeCountdown();
      return;
    }

    this.activationCode = '------';
    this.remainingSeconds = 300;
    const started = this.registerDeviceManually();

    if (!started) {
      this.stopCodeCountdown();
    }
  }

  private async refreshCodeAndRestartCountdown(): Promise<void> {
    await this.registerAndResetCountdown();
  }

  private trackManualRefreshSuccess(data: DeviceRegistrationData): void {
    if (!this.manualRefreshRequested) {
      return;
    }

    this.manualRefreshRequested = false;
    console.log('[DeviceActivation] refreshActivationCode succeeded', {
      confirmation_code: data?.confirmation_code,
      confirmation_expires_at: data?.confirmation_expires_at,
      device_id: data?.device_id,
    });
  }

  private async trackManualRefreshFailure(error: any): Promise<void> {
    if (!this.manualRefreshRequested) {
      return;
    }

    this.manualRefreshRequested = false;
    console.error('[DeviceActivation] refreshActivationCode failed', error);
    await Toast.show({ text: 'Code update failed.', duration: 'long' });
  }

  private applyRegistrationData(data: DeviceRegistrationData, persist: boolean = true): void {
    if (!this.hasValidRegistrationData(data)) {
      console.warn('[DeviceActivation] applyRegistrationData received invalid data', data);
      return;
    }

    this.DeviceRegistrationData = data;
    this.useRecoverOnly = true;
    this.activationCode = data.confirmation_code;
    this.remainingSeconds = this.getRemainingSecondsFromRegistration(data);

    if (this.isCodeScreenActive()) {
      this.startCodeCountdown();
    }

    if (persist) {
      void this.persistDeviceRegistrationData(data);
    }
  }

  private hasValidRegistrationData(data: DeviceRegistrationData | null): boolean {
    if (!data) {
      return false;
    }

    return !!data.device_id && !!data.temp_token && !!data.confirmation_code && !!data.confirmation_expires_at;
  }

  private getRemainingSecondsFromRegistration(data: DeviceRegistrationData | null): number {
    const expiresAt = data?.confirmation_expires_at ? new Date(data.confirmation_expires_at).getTime() : NaN;

    if (!Number.isFinite(expiresAt)) {
      return 300;
    }

    const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
    return remainingSeconds > 0 ? remainingSeconds : 0;
  }

  private async collectDeviceMetadata(): Promise<any> {
    try {
      const [deviceInfo, deviceId, batteryInfo, languageInfo, appInfo] = await Promise.all([
        Device.getInfo(),
        Device.getId(),
        Device.getBatteryInfo(),
        Device.getLanguageCode(),
        App.getInfo()
      ]);

      const networkIdentifiers = await this.getNetworkIdentifiers();

      return {
        uuid: deviceId.identifier,
        name: deviceInfo.name,
        model: deviceInfo.model,
        manufacturer: deviceInfo.manufacturer,
        platform: deviceInfo.platform,
        osVersion: deviceInfo.osVersion,
        operatingSystem: deviceInfo.operatingSystem,
        isVirtual: deviceInfo.isVirtual,
        memUsed: deviceInfo.memUsed,
        webViewVersion: deviceInfo.webViewVersion,
        batteryLevel: batteryInfo.batteryLevel,
        isCharging: batteryInfo.isCharging,
        languageCode: languageInfo.value,
        appName: appInfo.name,
        appId: appInfo.id,
        appVersion: appInfo.version,
        appBuild: appInfo.build,
        ipAddress: networkIdentifiers.ipAddress,
        macAddress: networkIdentifiers.macAddress,
        screenWidth: window?.screen?.width,
        screenHeight: window?.screen?.height,
        pixelRatio: window?.devicePixelRatio,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
        platformInfo: this.platformInfo
      };





    } catch (error) {
      console.error('[DeviceActivation] collectDeviceMetadata failed', error);
      return {
        ipAddress: null,
        macAddress: null,
        platformInfo: this.platformInfo,
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screenWidth: window?.screen?.width,
        screenHeight: window?.screen?.height
      };
    }
  }

  private async getNetworkIdentifiers(): Promise<{ ipAddress: string | null; macAddress: string | null }> {
    const ipAddress = await this.getPublicIpAddress();
    return {
      ipAddress,
      macAddress: null,
    };
  }

  private async getPublicIpAddress(): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch('https://api.ipify.org?format=json', {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return typeof data?.ip === 'string' ? data.ip : null;
    } catch {
      return null;
    }
  }

}
