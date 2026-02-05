import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { reload, sync } from '@capacitor/live-updates';
import { AlertController, Platform } from '@ionic/angular';

type LiveUpdateSyncResult = {
  activeApplicationPathChanged: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class LiveUpdatesService {
  private initialized = false;
  private syncInFlight = false;
  private pendingReload = false;
  private lastSyncAt = 0;
  private appIsActive = true;
  private pollTimer: any;
  private restartTimer: any;

  // Avoid excessive sync calls on resume loops.
  private readonly minSyncIntervalMs = 60_000;
  private readonly pollIntervalMs = 120_000;

  constructor(
    private platform: Platform,
    private router: Router,
    private alertController: AlertController,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.platform.ready();

    if (!Capacitor.isNativePlatform()) {
      alert('Live Updates solo está disponible en plataformas nativas.');
      return;
    }

    App.addListener('appStateChange', ({ isActive }) => {
      this.appIsActive = isActive;
      if (!isActive) return;
      void this.syncAndMaybeReload('resume');
    });

    this.startPolling();

    void this.syncAndMaybeReload('startup');
  }

  /** Manual trigger, useful for a future "Check updates" button. */
  async checkNow(): Promise<void> {
    await this.syncAndMaybeReload('resume');
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (!this.appIsActive) return;
      void this.syncAndMaybeReload('resume');
    }, this.pollIntervalMs);
  }

  private isSyncResult(result: any): result is LiveUpdateSyncResult {
    return result && typeof result === 'object' && typeof result.activeApplicationPathChanged === 'boolean';
  }

  private isSafeToAutoReload(url: string): boolean {
    // Ahora permitimos el reinicio automático en cualquier pantalla.
    return true;
  }

  private async syncAndMaybeReload(reason: 'startup' | 'resume'): Promise<void> {
    if (this.syncInFlight) return;

    const now = Date.now();
    if (now - this.lastSyncAt < this.minSyncIntervalMs) {
      if (this.pendingReload && this.isSafeToAutoReload(this.router.url)) {
        this.scheduleDelayedRestart();
      }
      return;
    }

    this.syncInFlight = true;
    this.lastSyncAt = now;

    try {
      const result = await sync();

      if (!this.isSyncResult(result)) {
        return;
      }

      const updateReady = Boolean(result.activeApplicationPathChanged);
      if (!updateReady) {
        await Toast.show({ text: 'LiveUpdates: sin actualización disponible', duration: 'short' });
        return;
      }

      if (this.isSafeToAutoReload(this.router.url)) {
        await Toast.show({ text: 'Update downloaded. App will restart in 2 minutes.' });
        this.scheduleDelayedRestart();
        return;
      }

      if (this.pendingReload) {
        return;
      }

      this.pendingReload = true;
      await this.promptReload(reason);
    } catch {
      await Toast.show({ text: 'LiveUpdates: error al comprobar actualización', duration: 'short' });
    } finally {
      this.syncInFlight = false;
    }
  }

  private async promptReload(reason: 'startup' | 'resume'): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update available',
      message:
        reason === 'startup'
          ? 'An update was downloaded. Reload to apply it now?'
          : 'An update was downloaded while the app was in background. Reload to apply it now?',
      buttons: [
        {
          text: 'Later',
          role: 'cancel',
        },
        {
          text: 'Reload',
          handler: () => {
            void this.reloadApp();
          },
        },
      ],
      backdropDismiss: true,
    });

    await alert.present();
  }

  private async reloadApp(): Promise<void> {
    try {
      this.pendingReload = false;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
      }
      await reload();
    } catch {
      // Fallback: if native reload fails for any reason.
      window.location.reload();
    }
  }

  private scheduleDelayedRestart(): void {
    if (this.restartTimer) {
      return;
    }

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = undefined;
      await this.reloadApp();
    }, 2 * 60 * 1000); // 2 minutos
  }
}
