import { Component, AfterViewInit, ViewChild, OnInit, NgZone, EventEmitter, OnDestroy } from '@angular/core';
import { AlertController, IonModal, NavController, ModalController } from '@ionic/angular';
import { RequestsService } from '../api/requests.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { LocaldataService } from '../api/localdata.service';
import { DevicesService } from '../api/devices.service';
import { Storage } from '@ionic/storage-angular';
import { NetworkService } from '../api/network.service';
import { RoomColors } from 'colors';
import { AppComponent } from '../app.component';
import { NotificationService } from '../api/notification.service';
import { LoggerService } from '../api/logger.service';
import { UpdatePatientPage } from '../update-patient/update-patient.page';
import { NewPatientPage } from '../new-patient/new-patient.page';
import { PatientChatComponent } from '../patient-chat/patient-chat.component';
import { EditRoomComponent } from '../edit-room/edit-room.component';
import { AudioService } from '../services/audio.service';
import { TranslateService } from '../services/translate.service';
import { WebhookService } from '../services/webhook.service';
import { Device } from '@capacitor/device';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements AfterViewInit, OnInit, OnDestroy {

  @ViewChild('modallogout') modallogout: IonModal | undefined;
  public disableYesterdaysToggle: EventEmitter<boolean> = new EventEmitter<boolean>();
  //subscribe to the remaining time on app.component
  remainingTime: number = 0;
  viewYesterdaysPatients: boolean = false;

  user: any = null;
  configuration: any = null;
  patients: any[] = [];
  patientsCopy: any[] = [];
  allPatients: any[] = []; // Fuente de verdad
  filtering = false;
  filteredLetter: string | null = null;
  letters = this.getFirstLetterFromNames();
  private webhookUnsubscribers: Array<() => void> = [];
  private webhooksInitialized = false;
  operatingRooms: any = [];
  //create a list of 10 light pallette colors
  updating: boolean = true;
  networkStatus: string = "ONLINE";
  lastsync: string = new Date().toLocaleString();
  deviceWasOffline: boolean = false;
  loading: boolean = false;
  disableYesterday: boolean = false;
  usedColors: string[] = [];
  username: any = "";

  toogleselected = false;

  resolution: string = '';


  public timeRemaining: number = 0;



  constructor(
    private LocaldataService: LocaldataService,
    private devicesService: DevicesService,
    private logger: LoggerService,
    public requestsService: RequestsService,
    private router: Router,
    public activatedRoute: ActivatedRoute,
    private navController: NavController,
    private storage: Storage,
    private _ngZone: NgZone,
    private networkService: NetworkService,
    private notificationService: NotificationService,
    private appComponent: AppComponent,
    private audioService: AudioService,
    private modalController: ModalController,
    private webhookService: WebhookService,
    public translate: TranslateService) {

    //listen for the network status
    this.networkService.networkStatus$.subscribe((status: string) => {
      this.networkStatus = status;
      if (status === "OFFLINE") {
        this.deviceWasOffline = true;
      } else {
        if (this.deviceWasOffline) {
          this.getTodaysPatientsFromServer();
          this.deviceWasOffline = false;
        }
      }
    });
  }

  showResolution() {
    const width = window.screen.width;
    const height = window.screen.height;
    this.resolution = `Resolución: ${width} x ${height}`;
    return this.resolution;
  }

  async ngOnInit() {
    var token = await this.logger.getTokenAdmin();
    this.requestsService.setAdminToken(token);
      this.LocaldataService.setPatients(this.patients);
      this.appComponent.timeRemaining$.subscribe(time => {
        this.timeRemaining = time;
      });
      this.user = await this.LocaldataService.getUser();
      this.username = JSON.parse(localStorage.getItem('user')!);
      this.configuration = await this.LocaldataService.getConfiguration();
      console.log('Configuration:', this.configuration);

      // Verificar screensaver al iniciar
      if (this.configuration?.is_enabled === false) {
        console.log('[Home] 🔒 Monitor deshabilitado al iniciar, mostrando screensaver');
        this.appComponent.showScreensaver();
        return;
      } else {
        this.appComponent.hideScreensaver();
      }

      if(this.configuration.aplication == '2'){
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      }
      this.getTodaysPatientsFromLocal().then(resp => {
        this.storage.get('patient').then(response => {
          this.getOperatingRoomsFromStorageOrLoadFromServer();
          if (response) {
            this._ngZone.run(() => {
              this.requestsService.updatePatient(response).then(async (response: any) => {
                this.storage.set('patient', null);
                if (response.status === 200) {
                  this.getTodaysPatientsFromServer();
                  this.notificationService.showInfo(response.data.message, 5000);
                }else{
                  this.notificationService.showError(response.data.error.detail, 5000);
                }
              }, error =>{
                this.notificationService.showError(this.translate.instant('home.errorUpdatingUser'), 5000);
              });
            });
          }
        });
      });
      this.letters = this.getFirstLetterFromNames();
  }

  private updatePatientList(eventType: string, patient: any) {
    // Actualiza la fuente de verdad
    const index = this.allPatients.findIndex((p: any) => p.id === patient.id);
    switch(eventType) {
      case 'created':
        if (index === -1) {
          this.allPatients.push(patient);
        }
        break;
      case 'updated':
        if (index > -1) {
          this.allPatients[index] = patient;
        }
        break;
      case 'deleted':
        if (index > -1) {
          this.allPatients.splice(index, 1);
        }
        break;
    }
    this.patientsCopy = [...this.allPatients];
    if (this.filtering && this.filteredLetter) {
      this.patients = this.patientsCopy.filter(p => p.fullName.split(' ')[0].charAt(0).toUpperCase() === this.filteredLetter);
    } else {
      this.patients = [...this.patientsCopy];
    }
    this.patients = this.patients.sort((a, b) => {
      if (!a.fullName) return 1;
      if (!b.fullName) return -1;
      return a.fullName.localeCompare(b.fullName);
    });
    this.letters = this.getFirstLetterFromNames();
    this.LocaldataService.setPatients(this.allPatients);
    this.requestsService.lastSync = new Date().toLocaleString();
  }

  async ngAfterViewInit(): Promise<void> {
    if (this.webhooksInitialized) return;

    await this.requestsService.init();
    await this.requestsService.initDropdowns();

    const channel = `rooms.${this.requestsService.config.waitingRoom.id}`;
    const channelForChat = `branch.${this.requestsService.config.branch.id}.room.${this.requestsService.config.waitingRoom.id}`;
    const channelForMonitor = `rooms.${this.requestsService.config.waitingRoom.id}.monitors`;

    const unsubscribeCreated = await this.webhookService.subscribePrivate(channel, '.patient.created', async (e: any) => {
      if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
        this.updatePatientList('created', e.patient);
        await this.getOperatingRoomsFromStorageOrLoadFromServer();
      }
    });

    const unsubscribeUpdated = await this.webhookService.subscribePrivate(channel, '.patient.updated', (e: any) => {
      if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
        this.updatePatientList('updated', e.patient);
        this.getOperatingRoomsFromStorageOrLoadFromServer();
      }
    });

    const unsubscribeDeleted = await this.webhookService.subscribePrivate(channel, '.patient.deleted', (e: any) => {
      if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
        this.updatePatientList('deleted', e.patient);
        this.getOperatingRoomsFromStorageOrLoadFromServer();
      }
    });

    const unsubscribeChat = await this.webhookService.subscribePublic(channelForChat, '.chat.message.created', (e: any) => {
      if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
          if (e.message.sender_type == "App\\Models\\Patients") {
            const patientIndex = this.patients.findIndex(p => p.id === e.message.sender_id);
            if (patientIndex > -1) {
              this.patients[patientIndex].chat_has_message = true;
              this.patients[patientIndex].chat_unread_count = this.patients[patientIndex].chat_unread_count + 1;
            }
          }
      }
    });

    const unsubscribeMonitorUpdated= await this.webhookService.subscribePresence(channelForMonitor, '.monitor.updated', async (e: any) => {
      if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
          console.log('[Home] 🟢 monitor.updated recibido:', e);
          const monitorPayload = e?.monitor || e;
          const isMatch = await this.checkIsCurrentDevice(monitorPayload);
          if (isMatch) {
            console.log('[Home] 🔄 Actualizando configuración del monitor...');
            // Actualizar configuración local
            const currentConfig = this.configuration;
            if (monitorPayload.name) currentConfig.stationName = monitorPayload.name;
            if (monitorPayload.view_mode) currentConfig.aplication = monitorPayload.view_mode.toString();
            if (monitorPayload.visible_statuses) currentConfig.statuses = monitorPayload.visible_statuses;
            if (monitorPayload.lang) currentConfig.lang = monitorPayload.lang;
            if (monitorPayload.privacy_mode !== undefined) currentConfig.privacy_mode = monitorPayload.privacy_mode;
            if (monitorPayload.is_enabled !== undefined) currentConfig.is_enabled = monitorPayload.is_enabled;
            if (monitorPayload.branch) currentConfig.branch = monitorPayload.branch;
            // Guardar cambios
            this.configuration = currentConfig;
            this.requestsService.config = currentConfig;
            await Preferences.set({ key: 'config', value: JSON.stringify(currentConfig) });
            console.log('[Home] ✅ Configuración actualizada:', currentConfig);

            // Manejar screensaver según is_enabled
            if (currentConfig.is_enabled === false) {
              console.log('[Home] 🔒 Monitor deshabilitado, mostrando screensaver');
              this.appComponent.showScreensaver();
            } else {
              console.log('[Home] 🔓 Monitor habilitado, ocultando screensaver');
              this.appComponent.hideScreensaver();
            }
          }
      }
    });

    const unsubscribeMonitorDeleted = await this.webhookService.subscribePresence(channelForMonitor, '.monitor.deleted', async (e: any) => {
      if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
          console.log('evento monitor deleted', e);
          console.log('[Dashboard] 🔴 monitor.deleted recibido:', e);
          const monitorPayload = e?.monitor || e;
          const isMatch = await this.checkIsCurrentDevice(monitorPayload);
          if (isMatch) {
            console.log('[Dashboard] ⚠️ Este dispositivo fue eliminado. Limpiando datos...');
            await Preferences.clear();
            localStorage.clear();
            this.LocaldataService.deletePreviousPatients();
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
      unsubscribeCreated,
      unsubscribeUpdated,
      unsubscribeDeleted,
      unsubscribeChat,
      unsubscribeMonitorUpdated,
      unsubscribeMonitorDeleted
    );
    this.webhooksInitialized = true;
  }

  async playAudio(){
    await this.audioService.playSound('notification', '');
  }

  ngOnDestroy() {
    // this.webhookUnsubscribers.forEach((unsubscribe) => unsubscribe());
    // this.webhookUnsubscribers = [];
    // this.webhooksInitialized = false;
  }

  getUserNames(role: any): string[] {
    const displayCode = role.code?.trim().toUpperCase() === 'MD' ? 'SURG' : role.code;
    if (role.persons.length > 0) {
      return role.persons.map((person: any) => `<strong>${displayCode}:</strong> ${person.full_name}`);
    }
    return [`<strong>${displayCode}:</strong> ${this.translate.instant('home.noAssigned')}`];
  }

  shouldShowRoom(room: any): boolean {
    // Verificar si hay al menos un paciente asignado a esta sala
    const hasPatientsAssigned = this.patients.some(p => p.operating_room_id === room.id);

    // Verificar si hay al menos un rol con miembros
    const hasRoleWithMembers = room.roles && room.roles.some((role: any) => role.persons && role.persons.length > 0);

    return hasPatientsAssigned || hasRoleWithMembers;
  }

  loadingRooms: boolean = false;
  getOperatingRoomsFromStorageOrLoadFromServer() {
      if (this.loadingRooms) return;
      this.loadingRooms = true;

      this.LocaldataService.getOperatingRooms().then((response: any) => {
        this.operatingRooms = response;
        this.requestsService.getOperatingRooms().subscribe((response: any) => {
          this.loadingRooms = false;
          this.operatingRooms = response.data.data;
          this.getRandomColor(this.operatingRooms);
          this.LocaldataService.setOperatingRooms(this.operatingRooms);
        });
      });
    }

  getRandomColor(operatingRooms: any[]) {
    return operatingRooms.map((room) => {
      if (!room.color) {
        for (var i = 0; i < 6; i++) {
          room.color = RoomColors[i];
        }
      }
    });
  }

  async getTodaysPatientsFromLocal(event?: any) {
    this.updating = true;
    this.LocaldataService.getPatients().then(response => {
      if (response) {
        this.allPatients = response;
        this.patientsCopy = [...this.allPatients];
        this.patients = [...this.patientsCopy];
        this.updating = false;
        this.letters = this.getFirstLetterFromNames();
        this.getTodaysPatientsFromServer(event);
      } else {
        this.getTodaysPatientsFromServer();
      }
    })
  }

  async getTodaysPatientsFromServer(event?: any, yesterday: boolean = false) {
    this.updating = true;
    this.disableYesterdaysToggle.emit(true);
    this.requestsService.getTodaysPatients(yesterday).subscribe(async (response: any) => {
      if (event) {
        event.target.complete();
      }
      if (response.status === 200) {
        this.lastsync = new Date().toLocaleString();
        this.allPatients = response.data;
        this.patientsCopy = [...this.allPatients];
        this.patients = [...this.patientsCopy];
        this.letters = this.getFirstLetterFromNames();
        this.LocaldataService.setPatients(response.data);
        this.viewYesterdaysPatients = yesterday;
      } else {
        this.notificationService.showInfo(response.data.message, 5000);
        if (response.status === 401) {
          this.modalController.dismiss();
          Preferences.remove({ key: 'user' });
          this.router.navigate(['/pin'], { replaceUrl: true });
        }
      }
      this.updating = false;
    },(error:any) => {
      if (event) {
        event.target.complete();
      }
      if (error.status === 404) {
        Toast.show({
          text: error.message,
          duration: 'long'
        });
        this.router.navigate([error.redirectUrl], { replaceUrl: true });
      }
    });
  }

  filterPatients(letter: string) {
    if (this.filteredLetter === letter) {
      if (this.filtering) {
        this.filtering = false;
        this.patients = [...this.patientsCopy];
      } else {
        this.filtering = true;
        this.patients = this.patientsCopy.filter(p => p.fullName.split(' ')[0].charAt(0).toUpperCase() === letter);
      }
    } else {
      this.filtering = true;
      this.patients = this.patientsCopy.filter(p => p.fullName.split(' ')[0].charAt(0).toUpperCase() === letter);
    }
    this.filteredLetter = letter;
  }

  getFirstLetterFromNames() {
    return this.patients?.map(p => p.fullName.split(' ')[0].charAt(0).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).sort();
  }

  cancel() {
    this.modallogout?.dismiss(null, 'cancel');
  }

  async newPatient() {
    const modal = await this.modalController.create({
      component: NewPatientPage,
      cssClass: 'full-modal'
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();

    this.letters = this.patientsCopy?.map(p => p.fullName.split(' ')[0].charAt(0).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).sort();

  }

  toggleYesterday(event: any) {
    this.toogleselected = !this.toogleselected;
    this.getTodaysPatientsFromServer(null, event.target.checked);
  }

  async goToUpdatePatient(patient: any, index: number) {
    if (!this.loading) {
      this.storage.set('scrollY', index);
      this.loading = true;
        const modal = await this.modalController.create({
          component: UpdatePatientPage,
          componentProps: { patient },
          cssClass: 'full-modal'
        });
        await modal.present();
        await modal.onDidDismiss();
        this.letters = this.patientsCopy?.map(p => p.fullName.split(' ')[0].charAt(0).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).sort();
        this.loading = false;
    }
  }

    async goToPatientChat(patient: any) {
      this.loading = true;
      const modal = await this.modalController.create({
        component: PatientChatComponent,
        componentProps: { patient },
        cssClass: 'full-modal',
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();
      this.loading = false;
      // Si el chat devuelve un nuevo contador, actualizar el paciente
      if (data && typeof data.chat_unread_count === 'number') {
        const idx = this.patients.findIndex((p: any) => p.id === patient.id);
        if (idx > -1) {
          this.patients[idx].chat_unread_count = data.chat_unread_count;
        }
      }
    }

  async editRoom(room: any, index: number) {
    const assignedPatients = this.patients.filter(p => p.operating_room_id === room.id);
    const availablePatients = this.patients.filter(p => p.operating_room_id === null);
    this.navController.navigateForward(['/edit-room'], { state: { room, assignedPatients, availablePatients }, replaceUrl: true });
  }

  formatTime(time: string) {
    if (!time) {
      return '';
    }
    var hour = Number(time.split(':')[0]);
    const minutes = time.split(':')[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour > 12) {
      hour = hour - 12;
    }
    return `${hour}:${minutes} ${ampm}`;
  }

  async deleteCurrentMonitor() {
    try {
      const configStr = localStorage.getItem('config');
      if (configStr) {
        const pcfg = JSON.parse(configStr);
        if (pcfg && pcfg.monitor_id) {
          const token = this.requestsService.getToken();
          if (token) {
            await this.devicesService.deleteMonitor(pcfg.monitor_id, token);
            console.log('Monitor deleted successfully on logout');
          }
        }
      }
    } catch (e) {
      console.error('Error deleting monitor during logout', e);
    }
  }

  async logout() {
    await this.deleteCurrentMonitor();
    this.notificationService.showInfo(this.translate.instant('home.logoutSuccess'), 5000);
    this.requestsService.startTimer$.next(false);
    Preferences.remove({ key: 'user' });
    this.modallogout?.dismiss(null, 'confirm');
    this.router.navigate(['/pin'], { replaceUrl: true });
  }

  private async checkIsCurrentDevice(event: any): Promise<boolean> {
    let isMatch = false;

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

      if (event?.device_id === currentDeviceId || event?.device?.device_id === currentDeviceId) {
        console.log('[Dashboard] ✓ Match por device_id:', currentDeviceId);
        isMatch = true;
      }

      // 2. Verificar por monitor_id desde config
      if (!isMatch) {
        const configResponse = await Preferences.get({ key: 'config' });
        if (configResponse.value) {
          const configData = JSON.parse(configResponse.value);
          const configMonitorId = configData?.monitor_id || configData?.monitorId;
          if (configMonitorId && (event?.id === configMonitorId || event?.monitor?.id === configMonitorId || event?.monitor_id === configMonitorId)) {
            console.log('[Dashboard] ✓ Match por monitor_id:', configMonitorId);
            isMatch = true;
          }
        }
      }

      // 3. Verificar por monitor_id desde user
      if (!isMatch) {
        const userResponse = await Preferences.get({ key: 'user' });
        if (userResponse.value) {
          const userData = JSON.parse(userResponse.value);
          const monitorId = userData?.monitor?.id || userData?.id;
          if (monitorId && (event?.id === monitorId || event?.monitor?.id === monitorId || event?.monitor_id === monitorId)) {
            console.log('[Dashboard] ✓ Match por user.monitor_id:', monitorId);
            isMatch = true;
          }
        }
      }

      console.log('[Dashboard] checkIsCurrentDevice result:', isMatch);
      return isMatch;
    } catch (error) {
      console.error('[Dashboard] ❌ Error en checkIsCurrentDevice:', error);
      return false;
    }
  }

}



