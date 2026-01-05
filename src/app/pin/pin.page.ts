import { Component, EventEmitter, Input, NgZone, OnInit, Output } from '@angular/core';
import { RequestsService } from '../api/requests.service';
import { Router } from '@angular/router';
import { Preferences, RemoveOptions } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { AlertController, LoadingController } from '@ionic/angular';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../api/network.service';
import { LocaldataService } from '../api/localdata.service';
import { NotificationService } from '../api/notification.service';
import { AppComponent } from '../app.component';
import { App } from '@capacitor/app';
import { LoggerService } from '../api/logger.service';
import { TranslateService } from '../services/translate.service';

@Component({
  selector: 'app-pin',
  templateUrl: './pin.page.html',
  styleUrls: ['./pin.page.scss'],
})
export class PinPage implements OnInit {
  @Input() pagetitle: String = "Enter Pin";
  loading: boolean = false;
  pin: string = "";
  clicks = 0;
  version: string = environment.version;
  @Output() change: EventEmitter<string> = new EventEmitter<string>();
  networkStatus: string = "ONLINE";
  lastsync: string = new Date().toLocaleString();
  image_url = "";
  branch_name = "";
  waitingRoom_name = "";
  configResponse:any


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
    public translate: TranslateService
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
      //this.presentLoading();
      this.login();
      return;
    }
  }

   async ngOnInit() {
    this.appComponent.stopInactivityTracking();
    this.loading = true;
    this.lastsync = this.requestsService.lastSync;
    setTimeout(() => {
      this.image_url = this.requestsService.config?.branch?.image_url ?? 'assets/logos/logotipo_placeholder.png';
      this.branch_name = this.requestsService.config?.branch?.name ?? "";
      this.waitingRoom_name = this.requestsService.config?.waitingRoom?.name ?? "";
      this.loading = false;
    }, 2500);

    // Obtener configuración local y redirigir según el modo
    const config = await this.localdataService.getConfiguration();
    if (!config) {
      this.router.navigate(['/login'], { replaceUrl: true });
      this.loading = false;
      return;
    }
    this.configResponse = config;
    // Redirección según el valor de aplication
    if (String(this.configResponse.aplication) === "1") {
      // Tablet: no redirige, espera PIN y luego va a /home
      // No hacer nada aquí
    } else if (String(this.configResponse.aplication) === "2" || String(this.configResponse.aplication) === "3") {
      // Dashboard o modo especial: ir directo a dashboard
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

  async presentAlert() {
    // Presentar alerta con opciones para ir a login o configuración
    const alert = await this.alertController.create({
      header: this.translate.instant('pin.adminOptions'),
      message: this.translate.instant('pin.selectOption'),
      buttons: [
        {
          text: this.translate.instant('pin.login'),
          handler: () => {
            Preferences.clear();
            this.router.navigate(['/login'], { replaceUrl: true });
          }
        },
        {
          text: this.translate.instant('pin.configuration'),
          handler: () => {
            // const options: RemoveOptions = { key: 'config' };
            // Preferences.remove(options);
            this.router.navigate(['/configuration'], { replaceUrl: true });
          }
        },
        {
        text: this.translate.instant('pin.showResolution'),
        handler: () => {
          this.showResolutionAlert(); // Mostrará la resolución en una nueva alerta
          return false; // Evita que la alerta se cierre al tocar este botón
        }
        },
        {
          text: this.translate.instant('pin.closeApp'),
          handler: () => {
            Preferences.clear();
            this.router.navigate(['/login'], { replaceUrl: true });
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

  async login() {
    if (this.isNavigating) return;
    this.isNavigating = true;
    try {
      //await this.refreshAdminToken();
        console.log('Token no obtenido, solicitando nuevo...');
        this.requestTokenBasedOnPin();
        this.appComponent.resetSession();
        this.isNavigating = false;
    } catch (error) {
      console.error('Error durante el proceso de login:', error);
      this.requestTokenBasedOnPin();
      this.appComponent.resetSession();
    }
  }

   requestTokenBasedOnPin() {
    try {
      this.requestsService.loginWithPin(this.pin).then(async response => {

        if (response.status === 200) {
          const user = response?.data;
          console.log('user',user);
          localStorage.setItem('user',JSON.stringify(user));
          this.localdataService.user = user;
          // this.requestsService.setToken(user.jwt.access_token);
          // this.localdataService.setTokenBasedOnPin(this.pin, user.jwt.access_token);
          Preferences.set({
            key: 'user',
            value: JSON.stringify(user)
          });
          this.loading = false;
          this.requestsService.logout$.next(false);
          // await this.logger.setTokenPin(user.jwt.access_token);
          this.router.navigate(['/home'], { replaceUrl: true }).then(() => {
            console.log('Navegación a /home exitosa');
          }).catch(error => {
            this.loading = false;
            console.error('Error en la navegación:', error);
          });

        } else if (response.status === 401) {
          this.loading = false;
          this.notificationService.showError(this.translate.instant('pin.incorrectPin'), 6000);
          this.loadingController.dismiss();
        }
      },error => {
        console.log(error);
          this.loading = false;
          this.loadingController.dismiss();
          if(error.status == 401){
            this.notificationService.showError(this.translate.instant('pin.incorrectPin'), 6000);
          }else{
            this.notificationService.showError(this.translate.instant('pin.internalError') + ' ' + error, 4000);
            Preferences.clear();
            this.router.navigate(['/login'], { replaceUrl: true });
          }
          this.handleInput("clear");
      });


    } catch (error: any) {
      this.handleInput("clear");

      if (this.loading) {
        try {
          this.loading = false;
          //await this.loadingController.dismiss();
        } catch (error) {
          console.error('Error al intentar cerrar el loading:', error);
        }
      }

      if (error?.status === 401) {
         Toast.show({
          text: 'Pin Incorrecto o No Registrado',
          duration: 'long'
        });
      }
    }
  }

  // async refreshAdminToken() {
  //   const response = await Preferences.get({ key: 'admin' });
  //   if (!response.value) {
  //     this.navigateTo('/login');
  //   } else {
  //     const token = JSON.parse(response.value)?.jwt?.access_token;
  //     if (token && this.localdataService.isTokenExpired(token)) {
  //       const newToken = await this.requestsService.refreshToken(token);
  //       if (newToken?.status === 200) {
  //         this.requestsService.setAdminToken(newToken.data?.jwt.access_token);
  //         await Preferences.set({
  //           key: 'admin',
  //           value: JSON.stringify(newToken.data),
  //         });
  //       }
  //     } else if (token) {
  //       this.requestsService.setAdminToken(token);
  //     } else {
  //       this.navigateTo('/login');
  //     }
  //   }
  // }

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
}
