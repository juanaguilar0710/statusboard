import { Component, OnDestroy, OnInit } from '@angular/core';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { RequestsService } from 'src/app/api/requests.service';
import { NotificationService } from 'src/app/api/notification.service';
import { LoggerService } from 'src/app/api/logger.service';
import { WebhookService } from 'src/app/services/webhook.service';
import { environment } from 'src/environments/environment';
import { DevicesService } from 'src/app/api/devices.service';
import { Router } from '@angular/router';

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

  private countdownInterval: any;
  private webhookUnsubscribers: Array<() => void> = [];
  private deviceMetadata: any = null;
  private hasInitialized = false;
  private tokenRequestInProgress = false;
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
    this.hasInitialized = true;
    await this.loadStoredDeviceRegistrationData();
    await this.initializeDeviceActivationFlow();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.webhookUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.webhookUnsubscribers = [];
  }

  async registerDeviceManually(): Promise<void> {
    await this.deviceservice.registerDevice({
      device_id: this.deviceMetadata?.uuid || 'unknown-uuid',
      name: this.deviceMetadata?.name || 'Unknown Device',
      model: this.deviceMetadata?.model || 'Unknown Model',
      manufacturer: this.deviceMetadata?.manufacturer || 'Unknown Manufacturer',
      platform: this.deviceMetadata?.platform || 'Unknown Platform',
      os_version: this.deviceMetadata?.osVersion || 'Unknown OS Version',
      generatedAt: new Date().toISOString(),
  }
  ).then((resp) => {
    this.DeviceRegistrationData = resp.data as DeviceRegistrationData;
    void this.persistDeviceRegistrationData(this.DeviceRegistrationData);


    this.notificationService.showSuccess('Device registered successfully!', 5000);
    this.activationCode = this.DeviceRegistrationData.confirmation_code;
  }).catch((error) => {
    this.logger.addLog('manualDeviceRegistration', { error }, 'error');
    this.notificationService.showError('Failed to register device. Please try again.', 5000);
  });
  }

  get timeRemaining(): string {
    const minutes = Math.floor(this.remainingSeconds / 60).toString().padStart(2, '0');
    const seconds = (this.remainingSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private async initializeDeviceActivationFlow(): Promise<void> {
    this.deviceMetadata = await this.collectDeviceMetadata();
    if (!this.deviceMetadata.uuid) {
      this.deviceMetadata.uuid = 'WEB-' + Math.random().toString(36).slice(2, 11);
    }

    await this.subscribeToDeviceWebhooks();
    await this.registerAndResetCountdown();
    this.startCodeCountdown();
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



    this.webhookUnsubscribers.push(unsubscribeAllEvents, unsubscribeSave);
  }

  private handleDeviceWebhookEvent(type: 'confirmed' | 'update' | 'delete', event: any): void {
    console.log(`logevent ${type}: `, event);

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
      this.logger.addLog('persistDeviceRegistrationData', { error }, 'error');
    }
  }

  private async loadStoredDeviceRegistrationData(): Promise<void> {
    try {
      const stored = await Preferences.get({ key: this.DEVICE_REGISTRATION_STORAGE_KEY });
      if (!stored.value) {
        return;
      }

      this.DeviceRegistrationData = JSON.parse(stored.value) as DeviceRegistrationData;
      this.activationCode = this.DeviceRegistrationData.confirmation_code || this.activationCode;
    } catch (error) {
      this.logger.addLog('loadStoredDeviceRegistrationData', { error }, 'error');
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

      if (!IdDevice || !tempToken) {
        this.logger.addLog('requestTokenFromConfirmation', { IdDevice, hasTempToken: !!tempToken, event }, 'error');
        return;
      }

      this.tokenRequestInProgress = true;
      this.stopCodeCountdown();

      const tokenResponse = await this.deviceservice.requestDeviceToken(IdDevice, {
        temp_token: tempToken,
        client_id: environment.oauthObj.clientId,
        client_secret: environment.oauthObj.clientSecret,
      });

      console.log('Device token response:', tokenResponse);

      const payload = (tokenResponse?.data ?? tokenResponse) as DeviceTokenResponse;
      await this.applyTokenResponseConfiguration(payload);
    } catch (error) {
      this.tokenRequestInProgress = false;
      this.logger.addLog('requestTokenFromConfirmation', { error, event }, 'error');
    }
  }

  private isCurrentDeviceConfirmation(event: any): boolean {
    const incomingDeviceId = event?.device_id;
    const currentDeviceId = this.deviceMetadata?.uuid || this.DeviceRegistrationData?.device_id;

    if (!incomingDeviceId || !currentDeviceId || incomingDeviceId !== currentDeviceId) {
      this.logger.addLog('requestTokenFromConfirmation.ignored', {
        incomingDeviceId,
        currentDeviceId,
        reason: 'Device mismatch or missing device_id'
      }, 'info');
      return false;
    }

    return true;
  }

  private async applyTokenResponseConfiguration(payload: DeviceTokenResponse): Promise<void> {
    const accessToken = payload?.access_token;
    const monitor = payload?.monitor;
    const room = monitor?.room;

    if (!accessToken || !monitor || !room?.id || !room?.branch_id) {
      this.logger.addLog('applyTokenResponseConfiguration', { payload }, 'error');
      return;
    }

    const branch = {
      id: room.branch_id,
      name: `Branch ${room.branch_id}`,
      image_url: 'assets/logos/logotipo_placeholder.png'
    };

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
      anonymousMode: !!monitor.privacy_mode,
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


  private startCodeCountdown(): void {
    this.stopCodeCountdown();

    this.countdownInterval = setInterval(async() => {
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

  private async registerAndResetCountdown(): Promise<void> {
    this.remainingSeconds = 300;
    await this.registerDeviceManually();
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
      this.logger.addLog('collectDeviceMetadata', { error }, 'error');
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
