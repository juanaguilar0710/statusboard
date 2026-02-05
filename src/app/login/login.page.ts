import { Component, ElementRef, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RequestsService } from '../api/requests.service';
import { Toast } from '@capacitor/toast';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { NotificationService } from '../api/notification.service';
import { LoggerService } from '../api/logger.service';
import { environment } from 'src/environments/environment';
import { Capacitor } from '@capacitor/core';
import { reload, sync } from '@capacitor/live-updates';
import { AlertController } from '@ionic/angular';



@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit, OnDestroy {

  platformInfo = {
  platform: Capacitor.getPlatform(),
  userAgent: navigator.userAgent
  };

  @ViewChild('twoFactorCode', { read: ElementRef }) twoFactorCode!: ElementRef<HTMLIonInputElement>;

  showPassword: boolean = false;
  loading: boolean = false;
  form: FormGroup = this._formbuilder.group({
    username: [null, [Validators.required, Validators.minLength(3)]],
    password: [null, [Validators.required, Validators.minLength(3)]],
    code: [null],
  });

  version: string = environment.version;

  two_fa_source: string = '';
  authenticationRequired: boolean = false;
  twoFactorCodeValue: string = '';

  private liveUpdatesTimer: any;
  private liveUpdatesCheckInFlight = false;
  private liveUpdatesAlertOpen = false;
  private readonly liveUpdatesCheckIntervalMs = 60_000;


  constructor(private _formbuilder: FormBuilder,
    private requestsService: RequestsService,
    private renderer: Renderer2,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private router: Router,
    private alertController: AlertController) { }

  async ngOnInit() {
    // Guardar el idioma antes de limpiar las preferencias
    const languageResponse = await Preferences.get({ key: 'language' });
    const savedLanguage = languageResponse.value;

    Preferences.clear();
    localStorage.clear();

    // Restaurar el idioma si existía, si no usar inglés por defecto
    if (savedLanguage) {
      await Preferences.set({ key: 'language', value: savedLanguage });
    } else {
      await Preferences.set({ key: 'language', value: 'en' });
    }
  }

  ionViewDidEnter() {
    this.startLiveUpdatesChecks();
  }

  ionViewWillLeave() {
    this.stopLiveUpdatesChecks();
  }

  ngOnDestroy(): void {
    this.stopLiveUpdatesChecks();
  }

  private startLiveUpdatesChecks(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    if (this.liveUpdatesTimer) {
      return;
    }

    void this.checkLiveUpdateOnce('startup');
    this.liveUpdatesTimer = setInterval(() => {
      void this.checkLiveUpdateOnce('interval');
    }, this.liveUpdatesCheckIntervalMs);
  }

  private stopLiveUpdatesChecks(): void {
    if (this.liveUpdatesTimer) {
      clearInterval(this.liveUpdatesTimer);
      this.liveUpdatesTimer = undefined;
    }
  }

  private async checkLiveUpdateOnce(reason: 'startup' | 'interval'): Promise<void> {
    if (this.liveUpdatesCheckInFlight) {
      return;
    }

    this.liveUpdatesCheckInFlight = true;

    try {
      await Toast.show({
        text: reason === 'startup' ? 'Live Update: checking…' : 'Live Update: checking (1 min)…',
        duration: 'short',
      });

      const result: any = await sync();

      // SyncResult
      if (result && typeof result === 'object' && typeof result.activeApplicationPathChanged === 'boolean') {
        if (!result.activeApplicationPathChanged) {
          await Toast.show({ text: 'Live Update: no update', duration: 'short' });
          return;
        }

        await Toast.show({ text: 'Live Update: downloaded (ready to apply)', duration: 'long' });

        if (this.liveUpdatesAlertOpen) {
          return;
        }

        this.liveUpdatesAlertOpen = true;
        const alert = await this.alertController.create({
          header: 'Update available',
          message: 'A Live Update was downloaded. Reload to apply it now?',
          buttons: [
            {
              text: 'Later',
              role: 'cancel',
              handler: () => {
                this.liveUpdatesAlertOpen = false;
              },
            },
            {
              text: 'Reload',
              handler: () => {
                this.liveUpdatesAlertOpen = false;
                void this.reloadApp();
              },
            },
          ],
          backdropDismiss: true,
        });

        alert.onDidDismiss().then(() => {
          this.liveUpdatesAlertOpen = false;
        });

        await alert.present();
        return;
      }

      // LiveUpdateError
      if (result && typeof result === 'object' && typeof result.message === 'string') {
        await Toast.show({ text: `Live Update error: ${result.message}`, duration: 'long' });
      }
    } catch {
      await Toast.show({ text: 'Live Update: check failed', duration: 'long' });
    } finally {
      this.liveUpdatesCheckInFlight = false;
    }
  }

  private async reloadApp(): Promise<void> {
    try {
      await reload();
    } catch {
      // Fallback: last resort JS reload.
      window.location.reload();
    }
  }

  // Comprobación manual de Live Updates desde el botón del login
  async manualCheckUpdate(): Promise<void> {
    await this.checkLiveUpdateOnce('startup');
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    this.loading = true;
     let user = {
        username: this.form.get('username')?.value,
        password: this.form.get('password')?.value,
        grant_type: environment.oauthObj.grantType,
        client_id: environment.oauthObj.clientId,
        client_secret: environment.oauthObj.clientSecret
      };
    this.requestsService.loginOauth(user).then(async (response: any) => {
      this.loading = false;
      if (response.status === 200) {
        this.requestsService.setToken(response.data.access_token);
        this.requestsService.setExpiresIn(response.data.expires_in);
        this.requestsService.setRefreshToken(response.data.refresh_token);
        this.requestsService.setAdminToken(response.data.access_token);
         this.logger.setTokenAdmin(
                    response.data.access_token,
                    response.data.expires_in
                  );
        this.getUser();
      } else {
        await Toast.show({
          text: 'Login failed',
          duration: 'long'
        });
        this.notificationService.showError('Incorrect username or password.',6000);
      }
    });
  }

  getUser() {
       this.requestsService.getOAuthUser().subscribe(responseUser => {
            this.requestsService.setAuthUser(responseUser.data);
            console.log('mensaje');

            // if (responseUser.data.default_2fa !== null && (responseUser.data.two_fa_enabled_at !== null || responseUser.data.two_fa_enabled_at == null)) {
                const user = responseUser.data;
                console.log(responseUser);

                if (user.roles.length > 0 && (user.roles.find((r: any) => r.name.toLowerCase() == 'administrator') || user.roles.find((r: any) => r.name.toLowerCase() == 'manager'))) {
                  Preferences.set({
                    key: 'admin',
                    value: JSON.stringify(responseUser.data)
                  });
                  Preferences.set({
                    key: 'branch',
                    value: JSON.stringify(responseUser.data.branch)
                  });
                  Preferences.set({
                    key: 'waiting_rooms',
                    value: JSON.stringify(responseUser.data.waiting_rooms)
                  });
                  Toast.show({
                    text: 'Login successful',
                    duration: 'long'
                  });
                  this.router.navigate(['/configuration'], { replaceUrl: true });
                } else {
                    this.notificationService.showError('Insufficient permissions.',6000);
                  }
          // }
          // this.notificationService.showError('Please enable 2FA authentication.',6000);
        },error => {
            console.log('Error fetching user data:', error);
            this.two_fa_source = error.error.two_fa_source;
             this.authenticationRequired = true;
            setTimeout(() => {
                this.showTwoFactorInput();
                const card = document.getElementsByClassName('card')[0];
                card.classList.remove('card-hidden');
              }, 700);
              this.resendCode();
          }
        )

    }

    showTwoFactorInput() {
      if (!this.twoFactorCode) return;
      requestAnimationFrame(() => {
        const inputEl = this.twoFactorCode.nativeElement;
        inputEl.hidden = false;
        setTimeout(() => {
          inputEl.focus();
          const card = this.renderer.selectRootElement('.card', true);
          if (card) {
            this.renderer.removeClass(card, 'card-hidden');
          }
        }, 50);
      });
    }

    resendCode(){
      if(this.two_fa_source !== 'app'){
        this.requestsService.sendCode().subscribe(response => {
          console.log('Código de verificación enviado exitosamente:', response);
        },error => {
          console.error('Error al enviar el código de verificación:', error);
          this.notificationService.showError(error.error.error.detail,6000);
        });
      }
    }

    verifyTwoFactorCode() {
      const code = this.form.get('code')?.value;
      if (!code || code.trim() === '') {
        console.error('El código 2FA está vacío');
        return;
      }
      this.requestsService.verifyTwoFactorCode(code).subscribe(
        (success:any) => {
          if (success) {
            this.getUser();
          } else {
            console.log('Invalid verification code');
            this.notificationService.showError('Invalid verification code',6000);
          }
        },
        (error) => {
          console.log(error);
          this.notificationService.showError(error.error.error.detail,6000);
          console.log('Error enviando el codigo');
        }
      );
    }
}


