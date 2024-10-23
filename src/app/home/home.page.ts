import { Component, AfterViewInit, ViewChild, OnInit, NgZone, EventEmitter } from '@angular/core';
import { AlertController, IonModal, NavController } from '@ionic/angular';
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

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements AfterViewInit, OnInit {

  @ViewChild('modallogout') modallogout: IonModal | undefined;
  public disableYesterdaysToggle: EventEmitter<boolean> = new EventEmitter<boolean>();
  //subscribe to the remaining time on app.component
  remainingTime: number = 0;
  viewYesterdaysPatients: boolean = false;

  user: any = null;
  configuration: any = null;
  patients: any[] = [];
  patientsCopy: any[] = [];
  filtering = false;
  filteredLetter: string | null = null;
  letters = this.getFirstLetterFromNames();
  laravelEcho: Echo | undefined;
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
    public requestsService: RequestsService,
    private router: Router,
    public activatedRoute: ActivatedRoute,
    private navController: NavController,
    private storage: Storage,
    private _ngZone: NgZone,
    private networkService: NetworkService,
    private notificationService: NotificationService,
    private appComponent: AppComponent) {

    //subscribe to the remaining time on app.component
    // this.requestsService.timeRemaining$.subscribe((time: number) => {
    //   this.remainingTime = time;
    // });

    //listen for logout event
    // this.requestsService.logout$.subscribe(async (logout: boolean) => {
    //   if (logout) {
    //     this.logout();
    //   }
    // });

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
  }

  async ngOnInit() { 
    this.appComponent.timeRemaining$.subscribe(time => {
      this.timeRemaining = time;
    });   
    this.user = await this.LocaldataService.getUser();      
    this.username = JSON.parse(localStorage.getItem('user')!);
    console.log('this.username',this.username.user.username);
    
    this.configuration = await this.LocaldataService.getConfiguration();    
    this.requestsService.getOperatingRoomWithUsers(this.configuration.waitingRoom.id).subscribe(resp => {   
      this.storage.set('OperatingRoomWithUsers', resp);      
    },error => {
      console.log(error);
    })
    

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
                await Toast.show({
                  text: response.data.message,
                  duration: 'long'
                });
              }
            });
          });
        }  
      });
    });

    
    // const scrollY = await this.storage.get('scrollY');
    // if (scrollY) {
    //   setTimeout(() => {
    //     const element = document.getElementById('patient'+scrollY);
    //     if (element != null) {
    //       this.storage.remove('scrollY');
    //       element?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    //     }
    //   }, 1000);
    // }
    
  }


  private updatePatientList(eventType: string, patient: any) {    
    const index = this.patients.findIndex((p: any) => p.id === patient.id);
    switch(eventType) {
      case 'created':
        if (index === -1) {
          this.patients.push(patient);
          //this.patientsCopy.push(patient);
        }
        break;
      case 'updated':
        if (index > -1) {
          this.patients[index] = patient;
          //this.patientsCopy[index] = patient;
        }
        break;
      case 'deleted':
        if (index > -1) {
          this.patients.splice(index, 1);
          //this.patientsCopy.splice(index, 1);
        }
        break;
    }
    this.patientsCopy = this.patients;
    this.letters = this.getFirstLetterFromNames();
    this.LocaldataService.setPatients(this.patients);
    this.requestsService.lastSync = new Date().toLocaleString();
  }
  
  ngAfterViewInit(): void {
    this.requestsService.init().then(async () => {
      this.requestsService.initDropdowns().then((response: any) => {
        (<any>window).Pusher = Pusher;
        this.laravelEcho = new Echo({
          broadcaster: 'pusher',
          key: environment.pusher.key,
          cluster: environment.pusher.cluster,
          forceTLS: environment.pusher.forceTLS,
          disableStats: true
        });
  
        const channel = `branch.${this.requestsService.config.branch.id}.room.${this.requestsService.config.waitingRoom.id}`;
        
        this.laravelEcho.channel(channel).listen('.patient.created', (e: any) => {
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {             
            this.updatePatientList('created', e.patient);
          }
        });
  
        this.laravelEcho.channel(channel).listen('.patient.updated', (e: any) => {
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
            this.updatePatientList('updated', e.patient);
          }
        });
  
        this.laravelEcho.channel(channel).listen('.patient.deleted', (e: any) => {
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
            this.updatePatientList('deleted', e.patient);
          }
        });
  
        this.laravelEcho.channel(channel).listen('.patient.new.day', (e: any) => {
          if (this.networkStatus === "ONLINE" && !this.viewYesterdaysPatients) {
            this.patients = [];
            this.patientsCopy = [];
            this.LocaldataService.setPatients([]);
            this.getTodaysPatientsFromServer();
            this.requestsService.lastSync = new Date().toLocaleString();
          }
        });
      });
    });
  }


  getOperatingRoomsFromStorageOrLoadFromServer() {
    // load from local
    this.LocaldataService.getOperatingRooms().then((response: any) => {
      if (response) {
        this.operatingRooms = response;
        // load from server
        this.requestsService.getOperatingRooms().then((response: any) => {
          this.operatingRooms = response.data.data;
          this.getRandomColor(this.operatingRooms);
          this.LocaldataService.setOperatingRooms(this.operatingRooms);
        });
      } else {
        if (this.requestsService.operatingRooms.length > 0) {
          this.operatingRooms = this.requestsService.operatingRooms;
          this.getRandomColor(this.operatingRooms);
          this.LocaldataService.setOperatingRooms(this.operatingRooms);
        } else {
          this.requestsService.getOperatingRooms().then((response: any) => {
            this.operatingRooms = response.data.data;
            this.getRandomColor(this.operatingRooms);
            this.LocaldataService.setOperatingRooms(this.operatingRooms);
          });
        }
      }
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

  handleRefresh(event: any) {
    this.requestsService.init().then(async () => {
      this.getTodaysPatientsFromLocal(event);
    });
  }

  async getTodaysPatientsFromLocal(event?: any) {
    this.updating = true;
    this.LocaldataService.getPatients().then(response => {      
      if (response) {
        this.patients = response;        
        this.patientsCopy = response;
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
    this.requestsService.getTodaysPatients(yesterday).then(async (response: any) => {
      if (event) {
        event.target.complete();
      }
      if (response.status === 200) {
        this.lastsync = new Date().toLocaleString();
        this.patients = response.data;
        this.patientsCopy = response.data;
        this.letters = this.getFirstLetterFromNames();
        this.LocaldataService.setPatients(response.data);
        this.viewYesterdaysPatients = yesterday;
      } else {
        if (response.status === 401) {
          Preferences.remove({ key: 'user' });
          this.router.navigate(['/pin'], { replaceUrl: true });
        }
      }
      this.updating = false;
    }).catch((error) => {
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
        this.patients = this.patientsCopy;
      } else {
        this.filtering = true;
        this.patients = this.patients.filter(p => p.fullName.split(' ')[0].charAt(0).toUpperCase() === letter);
      }
    } else {
      if (this.filtering) {
        this.patients = this.patientsCopy;
        this.patients = this.patients.filter(p => p.fullName.split(' ')[0].charAt(0).toUpperCase() === letter);
      } else {
        this.filtering = true;
        this.patients = this.patients.filter(p => p.fullName.split(' ')[0].charAt(0).toUpperCase() === letter);
      }
    }
    this.filteredLetter = letter;
  }

  getFirstLetterFromNames() {
    return this.patients?.map(p => p.fullName.split(' ')[0].charAt(0).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).sort();
  }

  cancel() {
    this.modallogout?.dismiss(null, 'cancel');
  }

  newPatient() {
    this.navController.navigateForward(['/new-patient'], { replaceUrl: true, animated: false });
  }

  toggleYesterday(event: any) {
    this.toogleselected = !this.toogleselected;
    this.getTodaysPatientsFromServer(null, event.target.checked);
  }

  goToUpdatePatient(patient: any, index: number) {
    if (!this.loading) {
      this.storage.set('scrollY', index);
      this.loading = true;
      this.navController.navigateForward(['/update-patient'], { state: { patient }, replaceUrl: true });
    }
  }

  editRoom(room: any, index: number) {
    const assignedPatients = this.patients.filter(p => { return p.operating_room_id === room.id });
    const availablePatients = this.patients.filter(p => { return p.operating_room_id === null });
    this.navController.navigateForward(['/edit-room'], { state: { room, assignedPatients, availablePatients }, replaceUrl: false });
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
