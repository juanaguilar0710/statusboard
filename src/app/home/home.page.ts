import { Component, AfterViewInit, ViewChild, OnInit, NgZone, EventEmitter, OnDestroy } from '@angular/core';
import { AlertController, IonModal, NavController, ModalController } from '@ionic/angular';
import { RequestsService } from '../api/requests.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import Echo from 'laravel-echo';
import { environment } from 'src/environments/environment';
import Pusher from 'pusher-js';
import { LocaldataService } from '../api/localdata.service';
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
  laravelEcho: Echo<any> | undefined;
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
    private modalController: ModalController) {

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
                this.notificationService.showError('Error updating users.', 5000);
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

  ngAfterViewInit(): void {
    if (this.laravelEcho) return;

    this.requestsService.init().then(async () => {
      this.requestsService.initDropdowns().then((response: any) => {
        if (!this.laravelEcho){
          (<any>window).Pusher = Pusher;
            this.laravelEcho = new Echo({
              broadcaster: 'pusher',
              key: environment.pusher.key,
              cluster: environment.pusher.cluster,
              forceTLS: environment.pusher.forceTLS,
              disableStats: true,

              authorizer: (channel: any, options: any) => {
                return {
                  authorize: (socketId: any, callback: any) => {
                    localStorage.setItem('socketId', socketId);
                    this.requestsService.authorizeBroadcasting(socketId, channel.name).subscribe( response => {
                      callback(false, response);
                    }, error => {
                      callback(true, error);
                    });
                  }
                };
              },
            });
         }


        const channel = `rooms.${this.requestsService.config.waitingRoom.id}`;
        const channelForChat = `branch.${this.requestsService.config.branch.id}.room.${this.requestsService.config.waitingRoom.id}`;

        console.log('this.laravelEcho', this.laravelEcho);


        this.laravelEcho?.private(channel).listen('.patient.created',async (e: any) => {
          console.log(e);
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
            this.updatePatientList('created', e.patient);
            await this.getOperatingRoomsFromStorageOrLoadFromServer();
          }
        });

        this.laravelEcho?.private(channel).listen('.patient.updated', (e: any) => {
          console.log(e);
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
            this.updatePatientList('updated', e.patient);
            this.getOperatingRoomsFromStorageOrLoadFromServer();
          }
        });

        this.laravelEcho?.private(channel).listen('.patient.deleted', (e: any) => {
          console.log(e);
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
            this.updatePatientList('deleted', e.patient);
            this.getOperatingRoomsFromStorageOrLoadFromServer();
          }
        });


        this.laravelEcho.channel(channelForChat).listen('.chat.message.created', (e: any) => {
          console.log(e);
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
              if (e.message.sender_type == "App\\Models\\Patients") {
                const patientIndex = this.patients.findIndex(p => p.id === e.message.sender_id);
                this.patients[patientIndex].chat_has_message = true;
                this.patients[patientIndex].chat_unread_count = this.patients[patientIndex].chat_unread_count + 1;
              }
          }
        });

      });
    });
  }

  async playAudio(){
    await this.audioService.playSound('notification', '');
  }

  ngOnDestroy() {
    if (this.laravelEcho) {
      this.laravelEcho.disconnect();
      this.laravelEcho = undefined;
    }
  }

  getUserNames(role: any): string {
    if (role.persons.length > 0) {
      return role.persons.map((person:any) => person.full_name).join(', ');
    }
    return 'No asignado';
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

  async logout() {
    this.notificationService.showInfo('You have successfully logged out.', 5000);
    this.requestsService.startTimer$.next(false);
    Preferences.remove({ key: 'user' });
    this.modallogout?.dismiss(null, 'confirm');
    this.router.navigate(['/pin'], { replaceUrl: true });
  }

}
