import { AfterViewInit, ChangeDetectorRef, Component, OnInit, AfterViewChecked, ElementRef, ViewChild } from '@angular/core';
import { LocaldataService } from '../api/localdata.service';
import { DevicesService } from '../api/devices.service';
import { RequestsService } from '../api/requests.service';
import { RoomColors } from 'colors';
import { Preferences, RemoveOptions } from '@capacitor/preferences';
import { Router } from '@angular/router';
import { Toast } from '@capacitor/toast';
import Pusher from 'pusher-js';
import Echo from 'laravel-echo';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../api/network.service';
import { AlertController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { interval, Subscription } from 'rxjs';
import { NotificationService } from '../api/notification.service';
import { Storage } from '@ionic/storage-angular';
import { Network } from '@capacitor/network';

import { LoggerService } from '../api/logger.service';
import { AudioService } from '../services/audio.service';
import Swal from 'sweetalert2'



import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { TranslateService } from '../services/translate.service';
import { Device } from '@capacitor/device';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})


  export class DashboardComponent  implements OnInit, AfterViewChecked {
    @ViewChild('audio') miBoton!: ElementRef<HTMLButtonElement>;
  operatingRooms: any[] = [];
  patients: any[] = [];
  pageSize: number = environment.pageSizeWhitPatients;
  currentGroups: { [key: string]: number } = {};
  intervalId: any;
  laravelEcho: Echo<any> | undefined;
  networkStatus: string = "ONLINE";
  deviceWasOffline: boolean = false;
  updating: boolean = true;
  patientsCopy: any[] = [];
  lastsync = new Date();
  viewYesterdaysPatients: boolean = false;
  currentDate: Date = new Date();
  currentTime: string = '';
  config:any;
  timeRoomsPerPage = environment.timeRoomsPerPageWhitPatients;
  totalPagesWhitPatients:any;
  totalPages:any;
  totalPagesWithPatients: number = 0;
  currentPageWithPatients: number = 0;
  countdown: number = 0;
  intervalIdForPages: any;
  totalGroups = 0;
  roomsWithPatients:any[] = []
  clicks = 0;
  version: string = environment.version;

  // 🎤 Propiedades para manejo de voces
  availableVoices: any[] = [];
  availableLanguages: any[] = [];
  selectedVoice: string = '';
  showVoicePanel: boolean = false;
  private audioContextInitialized: boolean = false;
  totalPagesCurrentPatients:any;

  currentPagePatients: number = 0; // Página actual
  patientsPerPage: number = 18;   // Número de pacientes por página en el listview
  totalPatientPages: number = 0;  // Total de páginas

  logs: any[] = [];
  newAction: string = '';
  logDetails: string = '';
  isRefreshing = false;

  private timeUpdateIntervalId: any;
  private pageRoomsIntervalId: any;
  private pusherMonitorIntervalId: any;
  private monitorUpdatedSub?: Subscription;
  isLoading = true; // Variable para controlar el estado de loading
  totales:any;
  private dataLoaded = false; // Flag para controlar si los datos fueron cargados
  private viewChecked = false; // Flag para evitar bucles infinitos en ngAfterViewChecked
  private readonly TOKEN_EXPIRATION_KEY_Admin = 'auth_token_expiration_admin';

  // 🎤 Sistema de cola de speech
  private readonly SPEECH_QUEUE_KEY = 'speech_queue';

  // UI: cache para evitar lecturas/mutaciones en template (NG0100)
  private updatedPatientIdsCache: { ids: Set<number>; validUntil: number } | null = null;
  private readonly UPDATED_PATIENT_CACHE_TTL_MS = 250;

  constructor(private LocaldataService: LocaldataService, private devicesService: DevicesService,
              public requestsService: RequestsService,
              private router: Router,
              private alertController: AlertController,
              private networkService: NetworkService,
              private notificationService: NotificationService,
              private storage: Storage,
              private logger: LoggerService,
              private cdr: ChangeDetectorRef,
              private audioService: AudioService,
              public translate: TranslateService,
              private appComponent: AppComponent
  ) {
    setTimeout(() => {
      this.timeUpdateIntervalId = setInterval(async () => {
        this.updateTime();
        if (this.isRefreshing) return;
        const expiresAt = await this.storage.get(this.TOKEN_EXPIRATION_KEY_Admin);
        if (!expiresAt) return;
        const timeLeft = expiresAt - Date.now();
        if (timeLeft <= 60000 && timeLeft > 0) {
          this.isRefreshing = true;
          try {
            await this.refreshToken();
          } catch (error) {
            console.error('Error al refrescar el token:', error);
          } finally {
            this.isRefreshing = false;
          }
        }
      }, 1000);

      this.pageRoomsIntervalId = setInterval(() => {
        this.changePageRooms();
        const event = new MouseEvent('mousemove');
        document.dispatchEvent(event);
      }, environment.timeRoomsPerPage);
        this.checkNetworkStatus();
        this.listenToNetworkChanges();
    }, 3000);
  }



  getPatientInitials(fullName: string): string {
    if (!fullName) return '';
    return fullName
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase())
      .join('');
  }

  private formatExternalIdSuffix(externalId: any): string {
    if (externalId === null || externalId === undefined || externalId === '') return '';
    const raw = String(externalId);
    const digits = raw.replace(/\D/g, '');
    const base = digits.length > 0 ? digits : raw;
    const last6 = base.slice(-6);
    return last6 ? ` (${last6})` : '';
  }


  getPatientDisplayName(patient: any): string {
    if (this.config?.privacy_mode) {
      const initials = this.getPatientInitials(patient.fullName);
      const externalId = this.formatExternalIdSuffix(patient.external_id);
      return `${initials}${externalId}`;
    }
    return patient.fullName;
  }

  getPatientDisplayNameWithAge(patient: any): string {
    const age = `(${patient.age}${this.translate.getCurrentLanguage() === 'en' ? 'y' : 'a'}) `;
    if (this.config?.privacy_mode) {
      const initials = this.getPatientInitials(patient.fullName);
      const externalId = this.formatExternalIdSuffix(patient.external_id);
      //hay que extraerle el ultimos 5 digitos del id externo
      return `${age}${initials}${externalId}`;
    }
    return `${age}${patient.fullName}`;
  }

  async checkNetworkStatus() {
    const status = await Network.getStatus();
    this.networkStatus = status.connected ? "ONLINE" : "OFFLINE";
    if (!status.connected) {
      this.deviceWasOffline = true;
      console.log("OFFLINE");
    } else {
      if (this.deviceWasOffline) {
        console.log("ONLINE");
        this.reloadDashboardData();
        this.deviceWasOffline = false;
      }
    }
  }

  listenToNetworkChanges() {
    Network.addListener('networkStatusChange', async (status) => {
      this.networkStatus = status.connected ? "ONLINE" : "OFFLINE";
      if (!status.connected) {
        this.deviceWasOffline = true;
        console.log("OFFLINE");
        await this.logger.addLog('Dispositivo Sin conexión', {
          deviceStatus: 'Offline',
          component: 'Dashboard',
          status: 'error',
        }, 'error');
      } else {
        if (this.deviceWasOffline) {
          console.log("ONLINE");
          await this.logger.addLog('Dispositivo Con conexión', {
            deviceStatus: 'Online',
            component: 'Dashboard',
            status: 'success',
          },'success');
          this.reloadDashboardData();
          this.deviceWasOffline = false;
        }
      }
    });
  }

  async ngOnInit() {
    if (!this.monitorUpdatedSub) {
      this.monitorUpdatedSub = this.requestsService.monitorUpdated$.subscribe(() => {
        console.log('[Dashboard] Recibida actualización desde monitorUpdated$. Recargando datos...');
        this.reloadDashboardData();
      });
    }
    this.isLoading = true;
    if (!this.requestsService.statuses) {
      this.requestsService.statuses = [];
    }
    this.setupAudioPermissions();
    this.loadSystemVoicesInBackground();
    await this.loadLogs();
    await Preferences.get({ key: 'config' })
        .then(async (response: any) => {
          if (response?.value) {
            this.config = JSON.parse(response.value);
            this.requestsService.setToken(this.config.token);
            this.requestsService.setAdminToken(this.config.token);

            try {
              if (this.config.token) {
                const monitorResp = await this.devicesService.getMonitorData(this.config.token);
                if (monitorResp.status === 200 && monitorResp.data?.data) {
                  const mData = monitorResp.data.data;
                  this.config.monitor_id = mData.id;
                  this.config.stationName = mData.name;
                  this.config.device_id = mData.device_id;
                  this.config.aplication = mData.view_mode ? mData.view_mode.toString() : this.config.aplication;
                  this.config.statuses = mData.visible_statuses;
                  if (mData.lang) this.config.lang = mData.lang;
                  if (mData.privacy_mode !== undefined) this.config.privacy_mode = mData.privacy_mode;
                  if (mData.is_enabled !== undefined) this.config.is_enabled = mData.is_enabled;
                  if (mData.branch) this.config.branch = mData.branch;

                  // Verificar screensaver al iniciar
                  if (this.config.is_enabled === false) {
                    console.log('[Dashboard] 🔒 Monitor deshabilitado al iniciar, mostrando screensaver');
                    this.appComponent.showScreensaver();
                  } else {
                    this.appComponent.hideScreensaver();
                  }
                  if (mData.room) this.config.waitingRoom = mData.room;

                  await Preferences.set({ key: 'config', value: JSON.stringify(this.config) });
                }
              }
            } catch (err) {
              console.error('Error fetching monitor data from API', err);
            }

            localStorage.setItem('config', JSON.stringify(this.config));
          if (this.config.branch?.id) {
            await this.loadBranchStatuses(this.config.branch.id);
          }
        } else {
          console.warn('No se encontró la llave "config" en Preferences');
          this.config = { token: null };
        }
      })
      .catch((error) => {
        console.error('Error al leer Preferences:', error);
      });
     await this.updateTime();
     await this.startlists();

     this.requestsService.patientsStats(this.requestsService.config.branch.id, this.requestsService.config.waitingRoom.id).subscribe(resp => {
      console.log('respuesta stats', resp);
      this.totales = resp;

     })
  }

  // Método separado para recargar solo los datos sin reinicializar todo el componente
  private async reloadDashboardData() {
    console.log('[Dashboard] Recargando datos del dashboard...');
    try {
      this.getTodaysPatients = false;
      this.getOperatingRooms = false;
      await this.getOperatingRoomsFromStorageOrLoadFromServer();
    } catch (error) {
      console.error('[Dashboard] Error al recargar datos:', error);
    }
  }

  ngAfterViewChecked() {
    if (this.dataLoaded && !this.viewChecked && this.isLoading) {
      this.checkIfRenderingComplete();
    }
  }

  private checkIfRenderingComplete() {
    setTimeout(() => {
      const hasConfig = this.config && this.config.aplication;
      if (!hasConfig) {
        return;
      }

      let renderingComplete = false;
      const expectedPatients = this.patients?.length || 0;

      if (this.config.aplication === '3') {
        // Vista de tabla
        const tableRows = document.querySelectorAll('tbody tr');
        renderingComplete = expectedPatients === 0 || tableRows.length > 0;
      } else if (this.config.aplication === '2') {
        // Vista de cards
        const roomCards = document.querySelectorAll('.ionCard');
        const patientElements = document.querySelectorAll('.textCardPatients');
        renderingComplete = expectedPatients === 0 || (roomCards.length > 0 || patientElements.length > 0);
      } else {
        renderingComplete = true;
      }

      if (renderingComplete) {
        this.viewChecked = true;
        setTimeout(() => {
          this.isLoading = false;
        }, 5000);
      }
    }, 100);
  }

  updateTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    this.currentTime = now.toLocaleTimeString('es-ES', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).replace(' ', ' ').toUpperCase();
    if (hours === 23 && minutes === 59) {
      setTimeout(() => {
        window.location.reload();
      }, 60000);
    }
  }

  async startlists(){
    this.isLoading = true;
    this.dataLoaded = false;
    this.viewChecked = false;
    try {
      await this.getOperatingRoomsFromStorageOrLoadFromServer();
      // Limpiar intervalos anteriores antes de crear nuevos
      this.stopCarousel();
      if (this.intervalIdForPages) {
        clearInterval(this.intervalIdForPages);
        this.intervalIdForPages = null;
      }
      this.startCarousel();
      this.startCountdown();
      this.dataLoaded = true;
      this.cdr.detectChanges();
      setTimeout(() => {
        if (this.isLoading) {
          console.log('Fallback: ocultando loading después de timeout');
          this.isLoading = false;
          this.miBoton.nativeElement.click();
        }
      }, 5000);

    } catch (error) {
      console.error('Error loading data:', error);
      this.isLoading = false;
    }
  }

  private isRefreshingToken = false;

  async refreshToken(skipReload: boolean = false){
    this.logger.addLog('Inicio refresco de token', {}, 'info')
      if (this.isRefreshingToken) return;
        this.isRefreshingToken = true;
        try {
          const token = await this.logger.getTokenAdmin();
          this.requestsService.refreshToken(token).then(async resp =>{
            console.log(resp);
            if (resp?.status === 200) {
              this.config.token = resp.data?.access_token
              this.requestsService.setToken(resp.data.access_token);
              this.requestsService.setRefreshToken(resp.data.refresh_token);
              this.logger.setTokenAdmin(
                resp.data.access_token,
                resp.data.expires_in
              );
              this.requestsService.setAdminToken(resp.data.access_token);
              await Preferences.set({
                key: 'config',
                value: JSON.stringify(this.config),
              });

              if (!skipReload) {
                setTimeout(() => {
                  this.notificationService.showInfo('Token refresh.',3000);
                  this.startlists()
                }, 3000);
              }
              this.logger.addLog('Refresco de token exitoso', {}, 'success')
            }
            if (resp?.status === 500) {
              console.error('Error 500 al refrescar token');
              this.logger.addLog('Error 500 refrescando token', resp, 'error');
              // No recargar, dejar que el usuario intente manualmente
            }
            if (resp?.status === 401) {
              console.log(resp);
              this.logger.addLog('Error refrescando el token', resp, 'error')
            }
          }).catch(resp => {
            this.logger.addLog('Error refrescando el token', resp, 'error')
          });
        } finally {
          this.isRefreshingToken = false;
        }
  }

  private getOperatingRooms = false;
  async getOperatingRoomsFromStorageOrLoadFromServer() {

    if (this.getOperatingRooms) {
      await this.logger.addLog('Petición getOperatingRooms duplicada evitada', {}, 'warning');
      return;
    }
    this.getOperatingRooms = true;
    try {
        await this.logger.addLog('Iniciando petición getOperatingRooms', {}, 'info');
        // Remover await en subscribe - no se deben mezclar
        this.requestsService.getOperatingRoomsDevices().subscribe(async (response: any) => {
          if(response.status == 500 || response.status == 403){
            if(response.status == 403 || response.data.error.code == 1000){
              console.log('aqui');
              await this.logger.addLog('Fallo getOperatingRooms', {response}, 'error');
              await this.refreshToken(true);
              // No llamar recursivamente, dejar que el flujo normal continúe
              console.warn('Token refrescado, se recargará en el siguiente ciclo');
              this.getOperatingRooms = false;
          }
          }else{
            this.operatingRooms = response.data.data;
            this.LocaldataService.setOperatingRooms(this.operatingRooms);
            await this.logger.addLog('Exitoso getOperatingRooms', {response}, 'success');
            await this.getTodaysPatientsFromServer();
            this.getOperatingRooms = false;
          }
        },error => {
          console.log('error getOperatingRooms',error);
          this.getOperatingRooms = false;
        });
      } catch(err) {
        console.error('Error inesperado en getOperatingRoomsFromStorageOrLoadFromServer:', err);
        this.getOperatingRooms = false;
      }
  }

  private getTodaysPatients = false;
  listPatients: any[] = [];
  async getTodaysPatientsFromServer(event?: any, yesterday: boolean = false) {
      if (this.getTodaysPatients) {
        console.log('getTodaysPatientsFromServer ya en ejecución, evitando duplicado');
        return;
      }
      this.getTodaysPatients = true;
      this.updating = true;

      try {
        const response: any = await this.requestsService.getTodaysPatientsDashboard(yesterday);

        if (event) {
          event.target.complete();
        }

        if (response.status === 200) {
          const newPatients = response.data;
          const updatedPatients:any = [];
          const filteredPatients = newPatients.filter((patient: any) =>
            this.shouldPatientBeVisible(patient.status_Id)
          );
          filteredPatients.forEach((newPatient:any) => {
            const existingPatient = this.patients.find(p => p.id === newPatient.id);
            if (!existingPatient || this.hasPatientChanged(existingPatient, newPatient)) {
              updatedPatients.push(newPatient);
            }
          });
          this.lastsync = new Date();
          this.patients = [...filteredPatients];
          this.listPatients = response.data;
          this.patientsCopy = [...filteredPatients];
          this.LocaldataService.setPatients(filteredPatients);
          this.viewYesterdaysPatients = yesterday;
          updatedPatients.forEach((patient:any) => this.addUpdatedPatient(patient));
          // Solo conectar Pusher si no está ya conectado
          if (!this.laravelEcho) {
            await this.ngAfterView();
          }
        }
      } catch (error:any) {
        if (event) {
          event.target.complete();
        }
        console.error('Error en getTodaysPatientsFromServer:', error);
        if (error.status === 404) {
          Toast.show({
            text: error.message || 'Error al cargar pacientes',
            duration: 'long'
          });
          await this.logger.addLog('Error en peticion',error,'error');
          // No recargar la página, solo mostrar error
        }
      } finally {
        this.updating = false;
        this.getTodaysPatients = false;
      }
  }
  startCarousel() {
    this.updatePaginationDetails();
    this.intervalId = setInterval(() => {
      this.getRoomsWithPatients().forEach(room => {
        const patientsInRoom = this.filterPatientsByRoom(room.name);
        if (patientsInRoom.length > this.pageSize) {
          const currentGroup = this.currentGroups[room.name] || 0;
          this.totalGroups = Math.ceil(patientsInRoom.length / this.pageSize);
          this.currentGroups[room.name] = (currentGroup + 1) % this.totalGroups;
        }
      });
      this.updatePaginationDetails();
    }, environment.timeForCardsWhitPatients);
  }
  updatePaginationDetails() {
    const roomsWithPatients = this.getRoomsWithPatients();
    if (roomsWithPatients.length === 0) {
      this.totalPagesWithPatients = 0;
      this.currentPageWithPatients = 0;
      return;
    }
    this.totalPagesWithPatients = Math.ceil(roomsWithPatients.length / environment.roomsPerPageWhitPatients);
    this.currentPageWithPatients = environment.currentPageWhitPatients + 1;
  }
  stopCarousel() {
    clearInterval(this.intervalId);
  }
  getRoomsWithPatients(): any[] {
    this.roomsWithPatients = this.roomsWithPatients || [];
        // Filtrar salas usando shouldShowRoom para consistencia
        const filteredRooms = this.operatingRooms.filter(room => this.shouldShowRoom(room));

        filteredRooms.forEach(room => {
            const patientsInRoom = this.filterPatientsByRoom(room.name);
            const existingRoom = this.roomsWithPatients.find(r => r.name === room.name);
            if (existingRoom) {
                existingRoom.patients = patientsInRoom;
                existingRoom.totalpage= Math.ceil(patientsInRoom.length / this.pageSize);
            } else if (patientsInRoom.length > 0) {
                this.roomsWithPatients.push({
                    name: room.name,
                    id: room.id,
                    totalpage: Math.ceil(patientsInRoom.length / this.pageSize),
                    actualPage: 1,
                    patients: patientsInRoom,
                });
            }
        });
        const patientsWithoutRoom = this.patients.filter(patient =>
            !this.operatingRooms.some(room => room.name === patient.operating_room_name)
        );
        const existingUnassignedRoom = this.roomsWithPatients.find(room => room.name === 'TO FOLLOW');
        if (patientsWithoutRoom.length > 0) {
            if (existingUnassignedRoom) {
                existingUnassignedRoom.patients = patientsWithoutRoom;
                existingUnassignedRoom.totalpage = Math.ceil(patientsWithoutRoom.length / this.pageSize);
            } else {
                this.roomsWithPatients.push({
                    name: 'TO FOLLOW',
                    id: 'unassigned-room',
                    totalpage: Math.ceil(patientsWithoutRoom.length / this.pageSize),
                    actualPage: 1,
                    patients: patientsWithoutRoom,
                });
            }
        } else if (existingUnassignedRoom) {
            this.roomsWithPatients = this.roomsWithPatients.filter(room => room.name !== 'TO FOLLOW');
        }

        // Filtrar salas que ya no tienen pacientes ni roles asignados
        this.roomsWithPatients = this.roomsWithPatients.filter(room => {
            if (room.name === 'TO FOLLOW') return room.patients && room.patients.length > 0;

            const originalRoom = this.operatingRooms.find(r => r.name === room.name);
            if (!originalRoom) return false;

            const hasPatientsAssigned = room.patients && room.patients.length > 0;
            const hasRoleWithMembers = originalRoom.roles && originalRoom.roles.some((role: any) => role.persons && role.persons.length > 0);

            return hasPatientsAssigned || hasRoleWithMembers;
        });

         // Ordenar las salas alfabéticamente por nombre
        this.roomsWithPatients.sort((a, b) => {
          // Si el id es string (ej: 'unassigned-room'), lo ponemos al final
          if (typeof a.id === 'string' && typeof b.id === 'number') return 1;
          if (typeof a.id === 'number' && typeof b.id === 'string') return -1;
          if (typeof a.id === 'string' && typeof b.id === 'string') return a.id.localeCompare(b.id);
          // Ambos son números
          return a.id - b.id;
        });
        return this.roomsWithPatients;
  }
  startCountdown() {
    if (this.intervalIdForPages) {
      clearInterval(this.intervalIdForPages);
    }
    this.countdown = environment.timeRoomsPerPageWhitPatients / 1000;
    this.intervalIdForPages = setInterval(() => {
      if (this.countdown > 1) {
        this.countdown--;
      } else {
        this.changePageRoomsWhitPatients();
        this.updatePaginationDetails();
        this.updatePatientPaginationDetails();
        this.changePatientPage();
        this.countdown = environment.timeRoomsPerPageWhitPatients / 1000;
      }
    }, 1000);
  }
  changePageRooms() {
    const filteredRooms = this.operatingRooms?.filter(room => this.shouldShowRoom(room)) || [];
    const totalPages = filteredRooms.length > 0 ? Math.ceil(filteredRooms.length / environment.roomsPerPage) : 1;

    // Solo paginar si hay más de una página
    if (totalPages > 1) {
      environment.currentPage = (environment.currentPage + 1) % totalPages;
    } else {
      environment.currentPage = 0;
    }
  }
  changePageRoomsWhitPatients() {
  const roomsWithPatients = this.getRoomsWithPatients();
  if (roomsWithPatients.length === 0) {
    this.totalPagesWhitPatients = 0;
    environment.currentPageWhitPatients = 0;
    return;
  }
  this.totalPagesWhitPatients = Math.ceil(roomsWithPatients.length / environment.roomsPerPageWhitPatients);

  // Solo paginar si hay más de una página
  if (this.totalPagesWhitPatients > 1) {
    environment.currentPageWhitPatients = (environment.currentPageWhitPatients + 1) % this.totalPagesWhitPatients;
  } else {
    environment.currentPageWhitPatients = 0;
  }
  this.totalPagesCurrentPatients = environment.currentPageWhitPatients;
}
  getRoomsForCurrentPage() {
    const filteredRooms = this.operatingRooms?.filter(room => this.shouldShowRoom(room)) || [];
    const start = environment.currentPage * environment.roomsPerPage;
    const end = start + environment.roomsPerPage;
    return filteredRooms.slice(start, end);
  }
  getRoomsForCurrentPagewhitpatients() {
    const start = environment.currentPageWhitPatients * environment.roomsPerPageWhitPatients;
    const end = start + environment.roomsPerPageWhitPatients;
    this.totalPages = end
    return this.getRoomsWithPatients().slice(start, end);
  }
  filterPatientsByRoom(roomName: string): any[] {
    if (roomName === 'TO FOLLOW') {
      return this.patients.filter(patient =>
        !this.operatingRooms.some(room => room.name === patient.operating_room_name)
      );
    }
    return this.patients.filter(patient =>
      patient.operating_room_name === roomName &&
      this.shouldPatientBeVisible(patient.status?.id || patient.status_Id)
    );
  }
  getPatientsGroup(roomName: string): any[] {
    const patientsInRoom = this.filterPatientsByRoom(roomName);
    if (!patientsInRoom.length) return [];
    const currentGroup = this.currentGroups[roomName] || 0;
    const start = currentGroup * this.pageSize;
    const end = start + this.pageSize;
    const room = this.roomsWithPatients.find(r => r.name === roomName);
    if (room) {
        room.actualPage = currentGroup + 1;
    }
    if (patientsInRoom.length <= this.pageSize) {
      return patientsInRoom;
    }
    return patientsInRoom.slice(start, end);

  }
  async getAccessToken() {
    var adminResponse:any = await Preferences.get({ key: 'admin' });
        adminResponse = JSON.parse(adminResponse.value);
     return adminResponse.jwt.access_token;
  }
  async ngAfterView() {
    try {
      await this.logger.addLog('Inicio de ngAfterViewInit', {
        deviceStatus: this.deviceWasOffline ? 'offline' : 'online',
        component: 'Dashboard'
      },'info');

      if(this.deviceWasOffline){
        await this.logger.addLog('Dispositivo sin conexión', {
          action: 'Omitiendo inicialización de Pusher',
          level: 'warn'
        },'warning');
        console.warn('Dispositivo sin conexión - Pusher no se inicializará');
      }else{
        await this.logger.addLog('Inicio de autorizacion a pusher', {
          component: 'Dashboard',
        },'info');

        if(this.requestsService.config == null){
          console.log('configuracion no encontrada en el ngafter: ' + this.requestsService.config);
        }else{
          console.log(this.requestsService.config);
          await this.conectionPusher();
          const channel = `rooms.${this.requestsService.config.waitingRoom.id}.monitors`;
          await this.logger.addLog('Canal configurado', {
            channel: channel,
            config: this.sanitizeConfig(this.requestsService.config)
          },'info');
          await this.listenToPatientEvents(channel);
          this.handlePusherConnection();
          this.monitorConnection();
        }
      }
    } catch (error) {
      console.log(error);
      await this.logger.addLog('Error conexion pusher', {
        status: 'error',
        error: this.sanitizeError(error)
      },'error');
      // No llamar ngOnInit(), solo reportar el error
      console.error('Error al inicializar Pusher, pero continuando sin real-time');
    }
  }

  private conectionPusher(){
    // Desconectar instancia anterior si existe
    // if (this.laravelEcho) {
    //   try {
    //     this.laravelEcho.disconnect();
    //   } catch (e) {
    //     console.warn('Error al desconectar Echo anterior:', e);
    //   }
    // }

    (<any>window).Pusher = Pusher;
        this.laravelEcho = new Echo({
          broadcaster: 'pusher',
          key: environment.pusher.key,
          cluster: environment.pusher.cluster,
          forceTLS: environment.pusher.forceTLS,
          disableStats: true,
          authorizer: (channel: any, options: any) => {
            return {
              authorize: async (socketId: any, callback: any) => {
                localStorage.setItem('socketId', socketId);
                await this.requestsService.authorizeBroadcasting(socketId, channel.name).subscribe( async response => {
                  this.enableAudioContext();
                  await this.logger.addLog('Autorización exitosa', {
                    channel: channel.name,
                    status: 'success',
                    response: this.sanitizeResponse(response)
                  },'success');
                  callback(false, response);
                }, async error => {
                  await this.logger.addLog('Error en autorización, recargando y reintentando conexión.', {
                    channel: channel.name,
                    status: 'error',
                    error: this.sanitizeError(error)
                  },'error');
                  // No recargar todo, solo reportar error
                  console.error('Error en autorización de canal Pusher');
                  callback(true, error);
                });
              }
            };
          },
        });
  }


  private sanitizeResponse(response: any): any {
    if (!response) return null;
    return {
      status: response.status,
      channel_data: response.channel_data ? '***REDACTED***' : null
    };
  }
  private sanitizeConfig(config: any): any {
    if (!config) return null;
    return {
      waitingRoomId: config.waitingRoom?.id,
      branchId: config.branch?.id,
      user: config.user ? { id: config.user.id } : null
    };
  }
  private sanitizeError(error: any): any {
    if (!error) return null;
    return {
      message: error.message || 'Error sin mensaje',
      code: error.code || 'unknown',
      stack: error.stack ? error.stack.toString().substring(0, 200) + '...' : null
    };
  }

  hasPatientChanged(existingPatient: any, newPatient: any): boolean {
    return (
      existingPatient.status_Id !== newPatient.status_Id ||
      existingPatient.operating_room_name !== newPatient.operating_room_name
    );
  }

  private normalizePatientId(id: any): string {
    if (id === null || id === undefined) return '';
    return String(id).trim();
  }

  private findPatientIndexById(list: any[], patientId: any): number {
    const normalizedId = this.normalizePatientId(patientId);
    if (!normalizedId) return -1;
    return list.findIndex((item: any) => this.normalizePatientId(item?.id) === normalizedId);
  }

  private deduplicatePatientsById(list: any[]): any[] {
    const deduplicated = new Map<string, any>();
    const withoutId: any[] = [];

    for (const item of list) {
      const normalizedId = this.normalizePatientId(item?.id);
      if (!normalizedId) {
        withoutId.push(item);
        continue;
      }

      const existing = deduplicated.get(normalizedId);
      deduplicated.set(normalizedId, existing ? { ...existing, ...item } : item);
    }

    return [...deduplicated.values(), ...withoutId];
  }

  addUpdatedPatient(patient: any) {
    const now = Date.now();
    const expiry = now + 60000; // 60 segundos
    const updatedPatients = JSON.parse(localStorage.getItem('updatedPatients') || '[]');

    // Prune de expirados aquí (fuera de change detection) para evitar NG0100
    const validPatients = Array.isArray(updatedPatients)
      ? updatedPatients.filter((p: any) => p && typeof p.expiry === 'number' && now <= p.expiry)
      : [];

    // Guardar mínimo necesario para el highlight
    validPatients.push({ id: patient?.id, expiry });
    localStorage.setItem('updatedPatients', JSON.stringify(validPatients));

    // Invalidar cache para que el highlight se refleje inmediatamente
    this.updatedPatientIdsCache = null;
}

getUpdatedPatients(now: number = Date.now()) {
  const updatedPatients = JSON.parse(localStorage.getItem('updatedPatients') || '[]');
  if (!Array.isArray(updatedPatients)) return [];
  return updatedPatients.filter((patient: any) => patient && typeof patient.expiry === 'number' && now <= patient.expiry);
}

private getUpdatedPatientIdsSnapshot(): Set<number> {
  const now = Date.now();
  if (this.updatedPatientIdsCache && this.updatedPatientIdsCache.validUntil > now) {
    return this.updatedPatientIdsCache.ids;
  }

  const validPatients = this.getUpdatedPatients(now);
  const ids = new Set<number>();
  for (const p of validPatients) {
    if (p && typeof p.id === 'number') {
      ids.add(p.id);
    }
  }

  this.updatedPatientIdsCache = { ids, validUntil: now + this.UPDATED_PATIENT_CACHE_TTL_MS };
  return ids;
}

isPatientUpdated(patientId: number): boolean {
  return this.getUpdatedPatientIdsSnapshot().has(patientId);
}


async speak(text = '') {
  try {
    await this.audioService.playSound('notification', text);
  } catch (error) {
    // Error silencioso para evitar logs excesivos
  }
}


  async testAudio() {
    try {
      await this.audioService.testAudio('Cargando pacientes, por favor espere');
    } catch (error) {
      // Error silencioso
    }
  }

  async loadSystemVoices() {
    try {
      const voices = await this.audioService.getAvailableVoices();
      const languages = await this.audioService.getAvailableLanguages();
      return { voices, languages };
    } catch (error) {
      return { voices: [], languages: [] };
    }
  }

  // 🎯 Probar una voz específica
  async testSpecificVoice(langCode: string, voiceName: string) {
    try {
      const testMessage = `Esta es una prueba de la voz ${voiceName}. ¿Te gusta cómo suena?`;
      await this.audioService.testVoiceWithLanguage(langCode, testMessage);
    } catch (error) {
      // Error silencioso
    }
  }

  // ⚙️ Configurar voz preferida
  async setPreferredVoice(langCode: string) {
    try {
      this.selectedVoice = langCode;
      this.audioService.setPreferredVoice(langCode);
      await this.audioService.testAudio('Voz configurada correctamente');
    } catch (error) {
      // Error silencioso
    }
  }

  // 🔄 Cargar voces en segundo plano
  private async loadSystemVoicesInBackground() {
    try {
      setTimeout(async () => {
        const result = await this.loadSystemVoices();
        this.availableVoices = result.voices;
        this.availableLanguages = result.languages;
      }, 2000); // Cargar después de 2 segundos
    } catch (error) {
      // Error silencioso
    }
  }

  // 🎛️ Mostrar/ocultar panel de voces
  toggleVoicePanel() {
    this.showVoicePanel = !this.showVoicePanel;
    if (this.showVoicePanel && this.availableVoices.length === 0) {
      this.loadSystemVoices().then(result => {
        this.availableVoices = result.voices;
        this.availableLanguages = result.languages;
      });
    }
  }


private async handlePatientEvent(type: 'updated' | 'created' | 'deleted', e: any): Promise<void> {
  if (this.networkStatus !== "ONLINE") return;
  try {
    await this.logger.addLog(`Websocket.${type}`, e.patient, 'info');
    await this.updatePatientList(type, e.patient);
  } catch (err) {
    console.error('Error en handlePatientEvent:', err);
  }
}

  private listenToPatientEvents(channel: string): void {
    this.laravelEcho?.leave(channel);
    const channelListeners = this.laravelEcho?.join(channel);
    channelListeners.listen('.patient.created', (e: any) => {
      // Mapear propiedades anidadas a propiedades planas si vienen en el payload
      if (e.patient) {
        if (e.patient.operating_room) {
          e.patient.operating_room_name = e.patient.operating_room.name;
          e.patient.operating_room_id = e.patient.operating_room.id;
        }
        if (e.patient.status) {
          e.patient.status_name = e.patient.status.name;
          e.patient.status_Id = e.patient.status.id;
        }
        if (e.patient.surgeon) {
          e.patient.surgeon_name = e.patient.surgeon.name;
          e.patient.surgeon_id = e.patient.surgeon.id;
          e.patient.surgeon_color = e.patient.surgeon.color;
        }
        if (e.patient.procedure) {
          e.patient.procedure_name = e.patient.procedure.name;
          e.patient.procedure_id = e.patient.procedure.id;
        }
      }

      this.handlePatientEvent('created', e);

      const existingPatientIndex = this.findPatientIndexById(this.listPatients, e.patient?.id);
      if (existingPatientIndex === -1) {
        this.listPatients.push(e.patient);
      } else {
        this.listPatients[existingPatientIndex] = {
          ...this.listPatients[existingPatientIndex],
          ...e.patient,
        };
      }

      this.listPatients = this.deduplicatePatientsById(this.listPatients);
    });
    channelListeners.listen('.patient.deleted', (e: any) => {
      this.listPatients = this.listPatients.filter(
        (patient: any) => this.normalizePatientId(patient?.id) !== this.normalizePatientId(e.patient?.id)
      );
      this.handlePatientEvent('deleted', e);
    });
    channelListeners.listen('.patient.updated', (e: any) => {
      // Mapear propiedades anidadas a propiedades planas si vienen en el payload
      if (e.patient) {
        if (e.patient.operating_room) {
          e.patient.operating_room_name = e.patient.operating_room.name;
          e.patient.operating_room_id = e.patient.operating_room.id;
        }
        if (e.patient.status) {
          e.patient.status_name = e.patient.status.name;
          e.patient.status_Id = e.patient.status.id;
        }
        if (e.patient.surgeon) {
          e.patient.surgeon_name = e.patient.surgeon.name;
          e.patient.surgeon_id = e.patient.surgeon.id;
          e.patient.surgeon_color = e.patient.surgeon.color;
        }
        if (e.patient.procedure) {
          e.patient.procedure_name = e.patient.procedure.name;
          e.patient.procedure_id = e.patient.procedure.id;
        }
      }

      const existingPatientIndex = this.findPatientIndexById(this.listPatients, e.patient?.id);

      this.handlePatientEvent('updated', e);
      if (
        existingPatientIndex !== -1 &&
        this.listPatients[existingPatientIndex]?.status?.id !== undefined &&
        e.patient?.status?.id !== this.listPatients[existingPatientIndex]?.status?.id
      ) {
        this.notificationService.showSuccessEvent('<strong>Patient Updated: </strong><br>&ensp;&ensp;'+e.patient.fullName+'<br>&ensp;&ensp;'+e.patient.status_name,10000)
      }

      if (existingPatientIndex !== -1) {
        this.listPatients[existingPatientIndex] = {
          ...this.listPatients[existingPatientIndex],
          ...e.patient
        };
      } else {
        this.listPatients.push(e.patient);
      }

      this.listPatients = this.deduplicatePatientsById(this.listPatients);
    });
    channelListeners.listen('.play.speech', async (e: any) => {
      console.log("🎤 Evento recibido:", e);
      const enqueued = await this.enqueueSpeechEventSafe(e);
      if (!enqueued) {
        console.log("🚫 Evento duplicado:", e.message);
        return;
      }
      this.processQueue();
    });

    // Eventos de monitores
    channelListeners.listen('.monitor.deleted', async (e: any) => {
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
    });

    channelListeners.listen('.monitor.updated', async (e: any) => {
      console.log('[Dashboard] 🟢 monitor.updated recibido:', e);
      const monitorPayload = e?.monitor || e;
      const isMatch = await this.checkIsCurrentDevice(monitorPayload);
      if (isMatch) {
        console.log('[Dashboard] ℹ️ Configuración actualizada. Recargando...');
        const configResponse = await Preferences.get({ key: 'config' });
        if (configResponse.value) {
          const currentConfig = JSON.parse(configResponse.value);
          if (monitorPayload.name) currentConfig.stationName = monitorPayload.name;
          if (monitorPayload.view_mode !== undefined) currentConfig.aplication = monitorPayload.view_mode.toString();
          if (monitorPayload.visible_statuses) currentConfig.statuses = monitorPayload.visible_statuses;
          if (monitorPayload.lang) currentConfig.lang = monitorPayload.lang;
          if (monitorPayload.privacy_mode !== undefined) currentConfig.privacy_mode = monitorPayload.privacy_mode;
          if (monitorPayload.is_enabled !== undefined) currentConfig.is_enabled = monitorPayload.is_enabled;
          if (monitorPayload.branch) currentConfig.branch = monitorPayload.branch;
          if (monitorPayload.room) currentConfig.waitingRoom = monitorPayload.room;
          await Preferences.set({ key: 'config', value: JSON.stringify(currentConfig) });
          localStorage.setItem('config', JSON.stringify(currentConfig));

          // Manejar screensaver según is_enabled
          if (currentConfig.is_enabled === false) {
            console.log('[Dashboard] 🔒 Monitor deshabilitado, mostrando screensaver');
            this.appComponent.showScreensaver();
            return;
          } else {
            console.log('[Dashboard] 🔓 Monitor habilitado, ocultando screensaver');
            this.appComponent.hideScreensaver();
          }
        }
        this.getTodaysPatients = false;
        this.getOperatingRooms = false;
        await this.ngOnInit();
      }
    });
  }

  private async enqueueSpeechEventSafe(event: any): Promise<boolean> {
      await this.acquireLock();
      try {
        const queueData = await this.storage.get(this.SPEECH_QUEUE_KEY);
        const queue = queueData ? JSON.parse(queueData) : [];

        console.log("📋 Estado actual de la cola:", {
          enCola: queue.length,
          eventos: queue.map((q: any) => ({ id: q.id, message: q.message.substring(0, 50) + '...' }))
        });

        // Verificar duplicados - solo mismo mensaje E ID de waiting room
        const isDuplicate = queue.some((item: any) =>
          item.message === event.message &&
          item.waitingRoomId === event.waitingRoomId
        );

        if (isDuplicate) {
          console.log("🚫 Evento duplicado detectado, no se encola:", event.message);
          return false; // No encolar duplicados
        }

        // Construir item
        const speechItem = {
          id: Date.now() + Math.random(),
          message: event.message,
          waitingRoomId: event.waitingRoomId,
          branchId: event.branchId,
          timestamp: new Date().toISOString(),
          processed: false
        };

        queue.push(speechItem);

        await this.storage.set(this.SPEECH_QUEUE_KEY, JSON.stringify(queue));

        console.log("✅ Evento encolado exitosamente:", {
          id: speechItem.id,
          message: speechItem.message,
          posicionEnCola: queue.length,
          totalEnCola: queue.length
        });

        return true;

      } catch (error) {
        console.error("❌ Error encolando evento:", error);
        return false;
      } finally {
        this.releaseLock();
      }
    }

    private speechMutex = false;

    private async acquireLock() {
        while (this.speechMutex) {
          await new Promise(res => setTimeout(res, 5));
        }
        this.speechMutex = true;
    }

    private releaseLock() {
        this.speechMutex = false;
    }

    private queueProcessing = false;

    private async processQueue() {
      if (this.queueProcessing) {
        console.log("⏸️ Cola ya en procesamiento, esperando...");
        return;
      }

      this.queueProcessing = true;
      console.log("🎬 Iniciando procesamiento de cola");

      try {
        while (true) {
          // Leer la cola actual
          await this.acquireLock();
          let queue: any[] = [];

          try {
            const raw = await this.storage.get(this.SPEECH_QUEUE_KEY);
            queue = raw ? JSON.parse(raw) : [];
          } finally {
            this.releaseLock();
          }

          if (queue.length === 0) {
            console.log("✅ Cola vacía, finalizando procesamiento");
            break;
          }

          // Tomar el primer item sin quitarlo aún
          const item = queue[0];
          console.log(`🎤 Procesando mensaje ${queue.indexOf(item) + 1}/${queue.length}:`, item.message);

          try {
            // ESPERAR a que termine de reproducirse completamente
            await this.processSpeechEvent(item.message, item);
            console.log("✅ Mensaje reproducido completamente");
          } catch (e) {
            console.error("❌ Error procesando mensaje:", e);
          }

          // Quitar el elemento procesado y guardar
          await this.acquireLock();
          try {
            const raw = await this.storage.get(this.SPEECH_QUEUE_KEY);
            const q = raw ? JSON.parse(raw) : [];

            // Verificar que el item sigue siendo el primero (seguridad)
            if (q.length > 0 && q[0].id === item.id) {
              q.shift(); // eliminar primero
              await this.storage.set(this.SPEECH_QUEUE_KEY, JSON.stringify(q));
              console.log(`📤 Mensaje eliminado de la cola. Quedan ${q.length} mensajes`);
            }
          } finally {
            this.releaseLock();
          }

          // Pequeña pausa entre mensajes para evitar solapamiento
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } finally {
        this.queueProcessing = false;
        console.log("🏁 Procesamiento de cola finalizado");
      }
    }

    private async processSpeechEvent(message: string, event: any): Promise<void> {
      console.log("🔊 Iniciando reproducción de mensaje:", message);

      try {
        const patientMatch = message.match(/paciente\s+número\s+(\d+)/i);
        const patientNumber = patientMatch ? Number(patientMatch[1]) : null;

        const statusMatch = message.match(/se\s+encuentra\s+(.+?)\.?$/i);
        const statusName = statusMatch ? statusMatch[1].trim() : null;

        let statusId = null;

        // Intentar resolver status ID
        if (statusName && Array.isArray(this.requestsService.statuses)) {
          statusId = await this.getStatusIdByName(statusName);
        }

        let shouldSpeak = false;

        if (patientNumber) {
          const index = this.patients.findIndex((p: any) => p.identifier === patientNumber);

          if (index > -1) {
            const resolvedStatusId = statusId ?? this.patients[index].status_Id;
            shouldSpeak = this.shouldPatientBeVisible(resolvedStatusId);
            console.log(`📊 Paciente ${patientNumber} encontrado. Visible: ${shouldSpeak}`);
          } else {
            shouldSpeak = statusId ? this.shouldPatientBeVisible(statusId) : true;
            console.log(`⚠️ Paciente ${patientNumber} no encontrado en lista. Se reproducirá: ${shouldSpeak}`);
          }
        } else {
          shouldSpeak = true;
          console.log("ℹ️ Mensaje sin número de paciente, se reproducirá por defecto");
        }

        if (shouldSpeak) {
          console.log("🎤 Reproduciendo mensaje...");
          await this.speak(message);
          console.log("✅ Mensaje reproducido completamente");
        } else {
          console.log("🔇 Mensaje omitido (paciente no visible según configuración)");
        }

      } catch (error) {
        console.error("❌ Error procesando speech:", error);
        // Fallback: reproducir el mensaje de todos modos
        try {
          await this.speak(message);
        } catch (fallbackError) {
          console.error("❌ Error en fallback de speech:", fallbackError);
        }
      }
    }




  private handlePusherConnection(): void {
    const pusherInstance = (<any>this.laravelEcho).connector.pusher;
    pusherInstance.connection.bind('connected', async () => {
      console.log('Pusher connected');
      await this.logger.addLog('Pusher connected', {},'success');
    });

    pusherInstance.connection.bind('disconnected', async (resp:any) => {
      await this.logger.addLog('Pusher disconnected', {resp},'error');
      console.warn('Pusher disconnected, attempting to reconnect...');
      this.retryConnection();
    });

    pusherInstance.connection.bind('error', async (err: any) => {
      console.error('Pusher error:', err);
      await this.logger.addLog('Pusher error', {err},'error');
      // No recargar la página, solo registrar el error
      // y dejar que el mecanismo de retry se encargue
      if(this.networkStatus === "ONLINE"){
        console.warn('Error de Pusher estando online, verificando conexión...');
      }
    });
  }

  private retryConnection(): void {
    let retries = 0;
    const maxRetries = 5;
    const retryInterval = 3000; // 3 segundos

    const interval = setInterval(async () => {
        if (retries >= maxRetries) {
            clearInterval(interval);
            await this.logger.error('Max retries reached. Unable to reconnect to Pusher.', {
                attempts: retries,
                lastAttempt: new Date().toISOString()
            });
            console.error('Max retries reached. Unable to reconnect to Pusher.');
            return;
        }

        retries++;
        console.log(`Reconnecting to Pusher (attempt ${retries}/${maxRetries})...`);
        await this.logger.info(`Reconnecting to Pusher (attempt ${retries}/${maxRetries})...`);

        try {
            // Intento de reconexión
            (<any>this.laravelEcho).connector.pusher.connect();

            // Verificar estado de conexión después de un breve tiempo
            setTimeout(() => {
                if (this.isPusherConnected()) {
                    clearInterval(interval);
                    console.log('Pusher reconnected successfully!');
                    this.logger.success('Pusher reconnected successfully', {
                        attempts: retries,
                        reconnectedAt: new Date().toISOString()
                    });
                }
            }, 1000); // Esperar 1 segundo para verificar

        } catch (error) {
            await this.logger.error('Reconnection attempt failed', {
                attempt: retries,
                error: error,
                timestamp: new Date().toISOString()
            });
            console.error(`Reconnection attempt ${retries} failed:`, error);
        }
    }, retryInterval);
}

// Método para verificar el estado de conexión
private isPusherConnected(): boolean {
    try {
        const pusher = (<any>this.laravelEcho).connector.pusher;
        return pusher.connection.state === 'connected';
    } catch (error) {
        return false;
    }
}

  private monitorConnection(): void {
    const pusherInstance = (<any>this.laravelEcho).connector.pusher;
    this.pusherMonitorIntervalId = setInterval(async () => {
        if (pusherInstance.connection.state !== 'connected') {
            await this.logger.addLog('Pusher is not connected, attempting to reconnect...', {},'error');
            console.warn('Pusher is not connected, attempting to reconnect...');
            this.retryConnection();
        }
    }, 10000);
  }

  private lastUpdateTime = 0;

  private async updatePatientList(eventType: string, patient: any) {

    this.lastUpdateTime = Date.now();
    const index = this.findPatientIndexById(this.patients, patient?.id);
    const shouldBeVisible = this.shouldPatientBeVisible(patient.status?.id || patient.status_Id);

    switch(eventType) {
      case 'created':
        if (index === -1 && shouldBeVisible) {
          const updatedPatient: any = patient;

          this.patients.push(updatedPatient);
          this.patientsCopy = [...this.patients];
          this.lastsync = new Date();
          this.LocaldataService.setPatients(this.patients);
          this.addUpdatedPatient(updatedPatient);
        }
        break;
        case 'updated':
          if (index > -1 || shouldBeVisible) {
            const updatedPatient: any = patient;

            if (shouldBeVisible) {
              // El paciente debe estar visible - actualizar o agregar
              if (index !== -1) {
                this.patients[index] = {
                  ...this.patients[index],
                  ...updatedPatient
                };
              } else {
                this.patients.push(updatedPatient);
              }
              this.addUpdatedPatient(updatedPatient);
            } else if (index !== -1) {
              // El paciente NO debe estar visible - remover si existe
              this.patients.splice(index, 1);
            }

            this.patientsCopy = [...this.patients];
            this.lastsync = new Date();
            this.LocaldataService.setPatients(this.patients);

            // Actualizar la lista de salas para reflejar si alguna quedó vacía
            this.roomsWithPatients = [];
            this.getRoomsWithPatients();
        }
        break;
      case 'deleted':
        if (index > -1) {
          this.patients.splice(index, 1);
        }
        break;
    }
      this.patients = this.deduplicatePatientsById(this.patients);
    this.patientsCopy = [...this.patients];
    this.LocaldataService.setPatients(this.patients);
    this.requestsService.lastSync = new Date().toLocaleString();
    this.lastsync = new Date();
  }
  ngOnDestroy() {
    console.log('[Dashboard] ngOnDestroy llamado');
    // Usar el mismo método de limpieza para consistencia
    this.cleanupBeforeLogout();
  }

  getCompletedRoomPatientsCount(roomName: string): number {
    return this.patients.filter(patient =>
      patient.operating_room_name === roomName && (patient.status.type === 'completed')
    ).length;
  }
  getTotalPatientsInRoom(roomName: string): number {
    return this.patients.filter(patient =>
      patient.operating_room_name === roomName
    ).length;
  }
  getHoldingPatientsCount(): number {
    //return this.patients.filter(patient => patient.status?.type === 'holding').length;
    return this.listPatients.filter(patient => patient.status?.type === 'holding').length;
  }
  getSurgeryPatientsCount(): number {
    // return this.patients.filter(patient => patient.status?.type === 'surgery').length;
    return this.listPatients.filter(patient => patient.status?.type === 'surgery').length;
  }
  getRecoveryPatientsCount(): number {
    //return this.patients.filter(patient => patient.status?.type === 'recovery').length;
    return this.listPatients.filter(patient => patient.status?.type === 'recovery').length;
  }
  getCompletedPatientsCount(): number {
    //return this.patients.filter(patient => patient.status?.type === 'completed').length;
    return this.listPatients.filter(patient => patient.status?.type === 'completed').length;
  }
  getPatientsByRoom(roomName: string): any[] {
    return this.patients.filter(patient => patient.operating_room_name === roomName);
  }
  getUserNames(role: any): string[] {
    const displayCode = role.code?.trim().toUpperCase() === 'MD' ? 'SURG' : role.code;

    if (role.persons.length > 0) {
      return role.persons.map((person: any) => `<strong>${displayCode}:</strong> ${person.full_name}`);
    }
    return [];
  }

  shouldShowRoom(room: any): boolean {
    // Verificar si hay al menos un paciente asignado a esta sala
    const hasPatientsAssigned = this.patients.some(p => p.operating_room_id === room.id);

    // Verificar si hay al menos un rol con miembros
    const hasRoleWithMembers = room.roles && room.roles.some((role: any) => role.persons && role.persons.length > 0);

    return hasPatientsAssigned || hasRoleWithMembers;
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
  async headerClicked() {
    this.clicks++;
    if (this.clicks === 3) {
      const alert = await this.alertController.create({
        header: 'Enter Admin Password',
        message: 'Fail to enter correct password 3 times will alert the Administrator.',
        buttons: ["Cancel", "Ok"],
        inputs: [{
          name: 'pin',
          type: 'password',
          placeholder: 'Enter Password'
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
              text: 'Incorrect Password Entered',
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
            const tokenResponse = await this.devicesService.deleteMonitorlog(monitorId, token);
            if (tokenResponse.status === 404) {
              console.log('[Dashboard] Monitor no encontrado en el backend (404)');
            } else if (tokenResponse.status === 200) {
              console.log('[Dashboard] Monitor eliminado del backend exitosamente');
            }
          }
        }
      } catch (err) {
        console.error('Error eliminando el monitor del backend:', err);
      }
    }

  // Método para limpiar recursos antes del logout
  private cleanupBeforeLogout() {
    console.log('[Dashboard] Limpiando recursos antes del logout...');

    // 1. Desconectar Pusher/Echo
    if (this.laravelEcho) {
      try {
        console.log('[Dashboard] Desconectando Echo...');
        this.laravelEcho.disconnect();
        this.laravelEcho = undefined;
      } catch (e) {
        console.warn('Error al desconectar Echo:', e);
      }
    }

    // 2. Limpiar todos los intervalos
    if (this.timeUpdateIntervalId) {
      clearInterval(this.timeUpdateIntervalId);
      this.timeUpdateIntervalId = null;
    }
    if (this.pageRoomsIntervalId) {
      clearInterval(this.pageRoomsIntervalId);
      this.pageRoomsIntervalId = null;
    }
    if (this.pusherMonitorIntervalId) {
      clearInterval(this.pusherMonitorIntervalId);
      this.pusherMonitorIntervalId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.intervalIdForPages) {
      clearInterval(this.intervalIdForPages);
      this.intervalIdForPages = null;
    }

    // 3. Desuscribirse de observables
    if (this.monitorUpdatedSub) {
      this.monitorUpdatedSub.unsubscribe();
      this.monitorUpdatedSub = undefined;
    }

    // 4. Limpiar datos locales
    this.patients = [];
    this.patientsCopy = [];
    this.listPatients = [];
    this.operatingRooms = [];
    this.roomsWithPatients = [];

    console.log('[Dashboard] Limpieza completada');
  }

  async presentAlert() {
    const alert = await this.alertController.create({
      header: 'Admin Options',
      message: 'Select an option to proceed',
      buttons: [
      {
          text: 'Login',
          handler: async () => {
            try {
              // Limpiar recursos antes de navegar
              this.cleanupBeforeLogout();

              // Eliminar monitor del backend
              await this.deleteCurrentMonitor();

              // Limpiar storage y navegar
              await Preferences.clear();
              this.logger.clearAdminAuthData();
              await this.router.navigate(['/login'], { replaceUrl: true });
            } catch (error) {
              console.error('Error en logout:', error);
              // Aún así navegar en caso de error
              await Preferences.clear();
              await this.router.navigate(['/login'], { replaceUrl: true });
            }
          }
        },
        // {
        //   text: 'Configuration',
        //   handler: () => {
        //     localStorage.setItem('tempConfig',JSON.stringify(this.config))
        //     console.log('config: ',this.config);

        //     // const options: RemoveOptions = { key: 'config' };
        //     // Preferences.remove(options);
        //     this.router.navigate(['/configuration'], { replaceUrl: true });
        //   }
        // },
        {
        text: 'Show Resolution',
        handler: () => {
          this.showResolutionAlert(); // Mostrará la resolución en una nueva alerta
          return false; // Evita que la alerta se cierre al tocar este botón
        }
        }
        // {
        //   text: 'Close App',
        //   handler: () => {
        //     // Preferences.clear();
        //     // this.router.navigate(['/login'], { replaceUrl: true });
        //     App.exitApp(); // Cierra la aplicación
        //   }
        // }
      ]
    });
    await alert.present();
  }

  async showResolutionAlert() {
  this.showResolution(); // Actualiza this.resolution

  const resolutionAlert = await this.alertController.create({
      header: 'Device Resolution',
      message: this.resolution,
      buttons: ['OK']
    });

    await resolutionAlert.present();
  }

  updatePatientPaginationDetails() {
    const filteredPatients = this.getVisiblePatients();
    this.totalPatientPages = Math.ceil(filteredPatients.length / this.patientsPerPage);
  }


  shouldPatientBeVisible(statusId: number): boolean {
    if (!this.config || !this.config.statuses) {
      return true; // Si no hay configuración, mostrar todos
    }
    return this.config.statuses.includes(statusId);
  }


  getVisiblePatientsTotal(): any[] {
   // return this.patients.filter(patient => this.shouldPatientBeVisible(patient.status_Id));
    return this.listPatients;
  }

  getVisiblePatients(): any[] {
   return this.patients.filter(patient => this.shouldPatientBeVisible(patient.status_Id));
  }

  async loadBranchStatuses(branchId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.requestsService.getBranchStatusesDevices(branchId).subscribe(
          (response: any) => {
            console.log(response);

            if (response.length > 0) {
              // Asegurar que los datos sean un array válido
              if (Array.isArray(response)) {
                this.requestsService.statuses = response;
                console.log('Estados cargados exitosamente:', this.requestsService.statuses);
              } else {
                console.warn('Los datos de estados no son un array:', response);
                this.requestsService.statuses = [];
              }
            } else {
              console.warn('Respuesta no exitosa al cargar estados:', response);
              this.requestsService.statuses = [];
            }
            resolve();
          },
          (error: any) => {
            console.error('Error cargando estados:', error);
            this.requestsService.statuses = [];
            resolve(); // No hacer reject para que el flujo continúe
          }
        );
      } catch (error) {
        console.error('Error en loadBranchStatuses:', error);
        this.requestsService.statuses = [];
        resolve(); // No hacer reject para que el flujo continúe
      }
    });
  }

  getStatusIdByName(statusName: string): number | null {
    if (!this.requestsService.statuses ||
        !Array.isArray(this.requestsService.statuses) ||
        this.requestsService.statuses.length === 0) {
      return null;
    }

    const normalizedSearchName = statusName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .trim();

    try {
      const status = this.requestsService.statuses.find((s: any) => {
        if (!s || !s.name) {
          console.warn('Estado inválido encontrado:', s);
          return false;
        }

        const normalizedStatusName = s.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remover acentos
          .trim();

        return normalizedStatusName === normalizedSearchName;
      });

      return status ? status.id : null;
    } catch (error) {
      console.error('Error al buscar estado por nombre:', error);
      return null;
    }
  }

  getPatientsForCurrentPage(): any[] {
    const visiblePatients = this.getVisiblePatients();
    const sortedPatients = [...visiblePatients].sort((a, b) => {
      const surgeonA = (a.surgeon_name || '').toLowerCase();
      const surgeonB = (b.surgeon_name || '').toLowerCase();
      return surgeonA.localeCompare(surgeonB);
    });
    const start = this.currentPagePatients * this.patientsPerPage;
    const end = start + this.patientsPerPage;
    return sortedPatients.slice(start, end);
  }

  changePatientPage() {
    this.currentPagePatients = (this.currentPagePatients + 1) % (this.totalPatientPages == 0 ? 1 : this.totalPatientPages);
  }

  async loadLogs() {
    try {
      this.logs = await this.logger.getLogs();
      console.log('Logs cargados:', this.logs);
    } catch (error) {
      console.error('Error cargando logs:', error);
    }
  }

  async clearLogs() {
    const alert = await this.alertController.create({
      header: 'Confirmar',
      message: '¿Estás seguro de que quieres borrar TODOS los logs?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Borrar',
          handler: async () => {
            try {
              await this.logger.clearLogs();
              this.logs = []; // Limpiar la lista en memoria
              const toast = await this.alertController.create({
                message: 'Logs borrados correctamente',

              });
              await toast.present();
            } catch (error) {
              console.error('Error borrando logs:', error);
            }
          }
        }
      ]
    });

    await alert.present();
  }
  async showLogsAlert() {
    const logs = await this.logger.getLogs();
    const sortedLogs = [...logs].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const logsHtml = `
      <div class="swal-logs-table-container">
        <table class="swal-logs-table">
          <thead>
            <tr>
              <th class="col-time">Fecha/Hora</th>
              <th class="col-action">Acción</th>
              <th class="col-details">Detalles</th>
            </tr>
          </thead>
          <tbody>
            ${sortedLogs.map(log => `
              <tr class="log-row ${log.level || 'info'}">
                <td class="log-time">${new Date(log.timestamp).toLocaleString()}</td>
                <td class="log-action">
                  <div class="action-content">${this.formatAction(log.action)}</div>
                </td>
                <td class="log-details">
                ${log.details ? `
                  <div class="details-container">
                    <button class="details-toggle">
                      <span class="toggle-icon">▼</span> Detalles
                    </button>
                    <div class="details-content">
                      <pre>${JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  </div>
                ` : '<span class="no-details">-</span>'}
              </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const { isConfirmed, isDismissed } = await Swal.fire({
      title: 'Registro de Actividades',
      html: `
        <div class="swal-logs-container">
          <div class="swal-logs-header">
            <div class="swal-logs-count">Total de logs: ${logs.length}</div>
            <button id="clearLogsBtn" class="clear-logs-btn">
              <ion-icon name="trash-outline"></ion-icon> Limpiar Logs
            </button>
          </div>
          ${logsHtml}
        </div>
      `,
      width: '70%',
      showConfirmButton: true,
      confirmButtonText: 'Cerrar',
      showCancelButton: false,
      showCloseButton: true,
      focusConfirm: false,
      heightAuto: false,
      customClass: {
        container: 'swal2-container-ionic',
        popup: 'swal2-popup-ionic',
        actions: 'swal2-actions-custom'
      },
      didOpen: () => {
        const clearBtn = document.getElementById('clearLogsBtn');
        if (clearBtn) {
          clearBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            Swal.close();
            this.clearLogs();
          });
        }

        document.querySelectorAll('.details-toggle').forEach(button => {
          button.addEventListener('click', function(this: HTMLButtonElement) {
            const container = this.closest('.details-container');
            const content = container?.querySelector('.details-content');
            const icon = container?.querySelector('.toggle-icon');
            if (content && icon) {
              content.classList.toggle('expanded');
              icon.textContent = content.classList.contains('expanded') ? '▲' : '▼';
            }
          });
        });
      }
    });
  }

  private formatAction(action: string): string {
    const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const method = httpMethods.find(m => action.startsWith(m));

    if (method) {
      return `
        <span class="http-method ${method.toLowerCase()}">${method}</span>
        <span class="http-url">${action.replace(method, '').trim()}</span>
      `;
    }
    return action;
  }

  private setupAudioPermissions() {
    if (this.audioContextInitialized) return;

    // Solo agregar un listener que se ejecute una sola vez
    document.addEventListener('click', this.enableAudioContext.bind(this), { once: true });
  }

  private async enableAudioContext() {
    if (this.audioContextInitialized) return;

    try {
      console.log('🎤 Inicializando contexto de audio...');

      // Activar contexto de audio web
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const context = new AudioContext();
        if (context.state === 'suspended') {
          await context.resume();
          console.log('✅ AudioContext resumido');
        }
      }

      // Inicializar el AudioService con interacción del usuario
      try {
        await this.audioService.initialize();
        console.log('✅ AudioService inicializado correctamente');
      } catch (ttsError) {
        console.warn('⚠️ Error inicializando AudioService:', ttsError);
      }

      this.audioContextInitialized = true;
      console.log('✅ Contexto de audio y TTS activados');

    } catch (error) {
      console.error('❌ Error al activar contexto de audio:', error);
    }
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
        currentDeviceId = configData?.device_id || this.config?.device_id;
      }

      const eventDeviceId = normalize(eventPayload?.device_id || eventPayload?.device?.device_id);
      const normalizedCurrentDeviceId = normalize(currentDeviceId);

      if (eventDeviceId && normalizedCurrentDeviceId && eventDeviceId === normalizedCurrentDeviceId) {
        console.log('[Dashboard] ✓ Match por device_id:', currentDeviceId);
        isMatch = true;
      }

      // 2. Verificar por monitor_id desde config
      if (!isMatch) {
        const configMonitorId = normalize(configData?.monitor_id || configData?.monitorId || this.config?.monitor_id || this.config?.monitorId);
        const eventMonitorId = normalize(eventPayload?.id || eventPayload?.monitor_id);
        if (configMonitorId && eventMonitorId && configMonitorId === eventMonitorId) {
          console.log('[Dashboard] ✓ Match por monitor_id:', configMonitorId);
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


