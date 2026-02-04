import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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

  // Avoid excessive sync calls on resume loops.
  private readonly minSyncIntervalMs = 60_000;

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
      return;
    }

    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void this.syncAndMaybeReload('resume');
    });

    void this.syncAndMaybeReload('startup');
  }

  private isSyncResult(result: any): result is LiveUpdateSyncResult {
    return result && typeof result === 'object' && typeof result.activeApplicationPathChanged === 'boolean';
  }

  private isSafeToAutoReload(url: string): boolean {
    // Avoid reloading on the main dashboard to prevent interrupting clinical workflow.
    if (url.includes('/dashboard')) return false;
    return true;
  }

  private async syncAndMaybeReload(reason: 'startup' | 'resume'): Promise<void> {
    if (this.syncInFlight) return;

    const now = Date.now();
    if (now - this.lastSyncAt < this.minSyncIntervalMs) {
      if (this.pendingReload && this.isSafeToAutoReload(this.router.url)) {
        await this.reloadApp();
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
        return;
      }

      if (this.isSafeToAutoReload(this.router.url)) {
        await this.reloadApp();
        return;
      }

      this.pendingReload = true;
      await this.promptReload(reason);
    } catch {
      // Ignore sync errors to avoid interrupting the app.
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
      await reload();
    } catch {
      // Fallback: if native reload fails for any reason.
      window.location.reload();
    }
  }
}
