import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { LocaldataService } from '../api/localdata.service';
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

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent  implements AfterViewInit, OnInit {
  operatingRooms: any[] = []; // Array de todas las salas
  patients: any[] = []; // Array de todos los pacientes
  pageSize: number = 4; // Tamaño de cada grupo de pacientes (4 por cada grupo)
  currentGroups: { [key: string]: number } = {}; // Almacena el grupo actual de cada sala
  intervalId: any;
  laravelEcho: Echo<any> | undefined;
  networkStatus: string = "ONLINE";
  deviceWasOffline: boolean = false;
  updating: boolean = true;
  patientsCopy: any[] = [];
  lastsync: string = new Date().toLocaleString();
  viewYesterdaysPatients: boolean = false;
  currentDate: Date = new Date();
  currentTime: string = '';
  config:any;
  

  constructor(private LocaldataService: LocaldataService,
              public requestsService: RequestsService,
              private router: Router,
              private cdr: ChangeDetectorRef,
              private alertController: AlertController,
              private networkService: NetworkService
  ) { 
    setInterval(() => {
      this.updateTime();
    }, 1000);

    setInterval(() => {
      this.changePageRooms();
      const event = new MouseEvent('mousemove');
      document.dispatchEvent(event); 
    }, environment.timeRoomsPerPage);

    setInterval(() => {
      this.changePageRoomsWhitPatients();
    }, environment.timeRoomsPerPageWhitPatients);

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

  changePageRooms() {
    const totalPages = Math.ceil(this.operatingRooms.length / environment.roomsPerPage);
    environment.currentPage = (environment.currentPage + 1) % totalPages;     
  }

  changePageRoomsWhitPatients() {
    const totalPagesWhitPatients = Math.ceil(this.getRoomsWithPatients().length / environment.roomsPerPageWhitPatients);
    environment.currentPageWhitPatients = (environment.currentPageWhitPatients + 1) % totalPagesWhitPatients;        
  }

  // Método para obtener las salas de la página actual
  getRoomsForCurrentPage() {
    const start = environment.currentPage * environment.roomsPerPage;
    const end = start + environment.roomsPerPage;
    return this.operatingRooms.slice(start, end);
  }

  getRoomsForCurrentPagewhitpatients() {
    const start = environment.currentPageWhitPatients * environment.roomsPerPageWhitPatients;
    const end = start + environment.roomsPerPageWhitPatients;      
    return this.getRoomsWithPatients().slice(start, end);
  }

  


  //solo salas con pacientes
  getRoomsWithPatients(): any[] {
    return this.operatingRooms.filter(room => {
      const patientsInRoom = this.filterPatientsByRoom(room.name);        
      return patientsInRoom.length > 0;
    });
  }

  async ngOnInit() {
    this.updateTime();
    await this.getOperatingRoomsFromStorageOrLoadFromServer();
    await this.getTodaysPatientsFromLocal()
    this.requestsService.getTodaysPatients();
    this.requestsService.initDropdowns().then((response: any) => {})
    Preferences.get({ key: 'config' }).then((response: any) => {
      if (response.value) {
        this.config = (JSON.parse(response.value));        
      }
    })
  }

   // Filtra los pacientes por sala
   filterPatientsByRoom(roomName: string): any[] {
    return this.patients.filter(patient => 
      patient.operating_room_name === roomName && 
      this.config.statuses.includes(patient.status_Id) // Filtra por los estados permitidos
    );
  }

  // Obtiene el grupo actual de pacientes para la sala
  getPatientsGroup(roomName: string): any[] {
    const patientsInRoom = this.filterPatientsByRoom(roomName);     
    const currentGroup = this.currentGroups[roomName] || 0;    
    const start = currentGroup * this.pageSize;    
    const end = start + this.pageSize;        
    if (patientsInRoom.length <= this.pageSize) {      
      return patientsInRoom;
    }
    return patientsInRoom.slice(start, end);
  }

  ngAfterViewInit(): void {
        (<any>window).Pusher = Pusher;
        this.laravelEcho = new Echo({
          broadcaster: 'pusher',
          key: environment.pusher.key,
          cluster: environment.pusher.cluster,
          forceTLS: environment.pusher.forceTLS,
          disableStats: true
        });
        const channel = `branch.${this.requestsService.config.branch.id}.room.${this.requestsService.config.waitingRoom.id}`;
        this.laravelEcho.channel(channel).listen('.patient.updated', (e: any) => {
          console.log(e);
          
          if (this.networkStatus === "ONLINE") {
            this.updatePatientList('updated', e.patient);
          }
        });

        this.laravelEcho.channel(channel).listen('.patient.created', (e: any) => {
          if (this.networkStatus === "ONLINE") {             
            this.updatePatientList('created', e.patient);
          }
        });

        this.laravelEcho.channel(channel).listen('.patient.deleted', (e: any) => {
          if (this.networkStatus === "ONLINE") {
            this.updatePatientList('deleted', e.patient);
          }
        });
  }

  private updatePatientList(eventType: string, patient: any) {    
    const index = this.patients.findIndex((p: any) => p.id === patient.id);
    switch(eventType) {
      case 'created':
        if (index === -1) {
          this.patients.push(patient);
        }
        break;
      case 'updated':
        if (index > -1) {
          this.patients[index] = patient;
        }
        break;
      case 'deleted':
        if (index > -1) {
          this.patients.splice(index, 1);
        }
        break;
    }
    this.patientsCopy = [...this.patients];
    this.LocaldataService.setPatients(this.patients);
    this.requestsService.lastSync = new Date().toLocaleString();
    this.lastsync = new Date().toLocaleString();
    this.cdr.detectChanges();
  }


  ngOnDestroy() {
    if (this.laravelEcho) {
      this.laravelEcho.disconnect();  // Desconectar Laravel Echo al destruir el componente
    }
  }


  getCompletedRoomPatientsCount(roomName: string): number {
    return this.patients.filter(patient => 
      patient.operating_room_name === roomName && (patient.status_Id === 4 || patient.status_Id === 5 || patient.status_Id === 6) // Ajusta este valor si "complete" tiene otro status_Id
    ).length;
  }


  getTotalPatientsInRoom(roomName: string): number {
    return this.patients.filter(patient => 
      patient.operating_room_name === roomName
    ).length;
  }


  getHoldingPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 2).length;
  }

  getSurgeryPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 3).length;
  }

  getRecoveryPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 4).length;
  }

  getCompletedPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 4 || patient.status_Id === 5 || patient.status_Id === 6).length;
  }

  getPatientsByRoom(roomName: string): any[] {
    return this.patients.filter(patient => patient.operating_room_name === roomName);
  }

  updateTime() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('es-ES', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).replace(' ', ' ').toUpperCase(); // Quita el espacio entre la hora y AM/PM
  }

  getOperatingRoomsFromStorageOrLoadFromServer() {
    this.LocaldataService.getOperatingRooms().then((response: any) => {      
        this.operatingRooms = response;        
        this.requestsService.getOperatingRooms().then((response: any) => {
          this.operatingRooms = response.data.data;
          this.getRandomColor(this.operatingRooms);
          this.LocaldataService.setOperatingRooms(this.operatingRooms);
        });      
      });
  }

  getUserNames(role: any): string {
    if (role.persons.length > 0) {
      return role.persons.map((person:any) => person.full_name).join(', ');
    }
    return 'No asignado';
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
        this.patients = response;        
        this.patientsCopy = response;
        this.updating = false;
        this.getTodaysPatientsFromServer(event);
      } else {
        this.getTodaysPatientsFromServer();
      }
    })
  }

  async getTodaysPatientsFromServer(event?: any, yesterday: boolean = false) {
    this.updating = true;
    this.requestsService.getTodaysPatients(yesterday).then(async (response: any) => {
      if (event) {
        event.target.complete();
      }
      if (response.status === 200) {
        this.lastsync = new Date().toLocaleString();
        this.patients = response.data;
        this.patientsCopy = response.data;
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

  clicks = 0;

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

  async presentAlert() {
    // Presentar alerta con opciones para ir a login o configuración
    const alert = await this.alertController.create({
      header: 'Admin Options',
      message: 'Select an option to proceed',
      buttons: [
        {
          text: 'Login',
          handler: () => {
            Preferences.clear();
            this.router.navigate(['/login'], { replaceUrl: true });
          }
        },
        {
          text: 'Configuration',
          handler: () => {
            const options: RemoveOptions = { key: 'config' };
            Preferences.remove(options);
            this.router.navigate(['/configuration'], { replaceUrl: true });
          }
        },
        {
          text: 'Close App',
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
  

}
