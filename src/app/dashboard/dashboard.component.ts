import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { LocaldataService } from '../api/localdata.service';
import { RequestsService } from '../api/requests.service';
import { RoomColors } from 'colors';
import { Preferences } from '@capacitor/preferences';
import { Router } from '@angular/router';
import { Toast } from '@capacitor/toast';
import Pusher from 'pusher-js';
import Echo from 'laravel-echo';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../api/network.service';

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
  laravelEcho: Echo | undefined;
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
              private networkService: NetworkService
  ) { 
    setInterval(() => {
      this.updateTime();
    }, 1000);

    setInterval(() => {
      this.changePageRooms();
      const event = new MouseEvent('mousemove');
      document.dispatchEvent(event); 
    }, 4000);

    setInterval(() => {
      this.changePageRoomsWhitPatients();
    }, 8000);

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
    const totalPagesWhitPatients = Math.ceil(this.operatingRooms.length / environment.roomsPerPageWhitPatients);
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
    //get rooms
    this.updateTime();
    await this.getOperatingRoomsFromStorageOrLoadFromServer();
    await this.getTodaysPatientsFromLocal()

    this.requestsService.getTodaysPatients();    

    this.requestsService.initDropdowns().then((response: any) => {
      console.log('init dropdowna', response);      
    })

    Preferences.get({ key: 'config' }).then((response: any) => {
      if (response.value) {
        this.config = (JSON.parse(response.value));
        console.log('config', this.config);
        
      }
    })
    this.startCarousel();
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

  // Inicia el cambio de grupos de pacientes cada 5 segundos solo para salas con más de 4 pacientes
  startCarousel() {
    this.intervalId = setInterval(() => {
      this.getRoomsWithPatients().forEach(room => {
        const patientsInRoom = this.filterPatientsByRoom(room.name);

        if (patientsInRoom.length > this.pageSize) {
          const currentGroup = this.currentGroups[room.name] || 0;
          const totalGroups = Math.ceil(patientsInRoom.length / this.pageSize);
          
          // Cambia el grupo actual para la sala, volviendo al primer grupo si es necesario
          this.currentGroups[room.name] = (currentGroup + 1) % totalGroups;
        }
      });
    }, 5000); // Cambia de grupo cada 5 segundos
  }

  stopCarousel() {
    clearInterval(this.intervalId); // Detener el intervalo
  }


  ngAfterViewInit(): void {

    // this.requestsService.init().then(async () => {
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
          console.log('actualizado');
          console.log(e);
          if (this.networkStatus === "ONLINE") {
            this.updatePatientList('updated', e.patient);
          }
        });

    // });

  }

  // Método para actualizar la lista de pacientes basado en los eventos en tiempo real
  private updatePatientList(eventType: string, patient: any) {    
    console.log('update', patient);

    
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
    this.patientsCopy = [...this.patients]; // Clonamos el array para asegurar la detección del cambio
    this.LocaldataService.setPatients(this.patients);
    this.requestsService.lastSync = new Date().toLocaleString();
    this.lastsync = new Date().toLocaleString();

    // Forzar la detección de cambios
    this.cdr.detectChanges();
  }


  ngOnDestroy() {
    this.stopCarousel();  // Detener el carousel cuando el componente se destruya
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


  // Contar pacientes en espera (status_Id = 1)
  getHoldingPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 1).length;
  }

  // Contar pacientes en cirugía (status_Id = 3)
  getSurgeryPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 3).length;
  }

  // Contar pacientes en recuperación (status_Id = 4)
  getRecoveryPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 4).length;
  }

  getCompletedPatientsCount(): number {
    return this.patients.filter(patient => patient.status_Id === 4 || patient.status_Id === 5 || patient.status_Id === 6).length;
  }









  getPatientsByRoom(roomName: string): any[] {
    // Aquí colocas la lógica para obtener los pacientes de cada sala
    // Por ejemplo:
    return this.patients.filter(patient => patient.operating_room_name === roomName);
  }

  updateTime() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('es-ES', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).replace(' ', ' '); // Quita el espacio entre la hora y AM/PM
  }

  getOperatingRoomsFromStorageOrLoadFromServer() {
    // load from local
    this.LocaldataService.getOperatingRooms().then((response: any) => {
      if (response) {
        this.operatingRooms = response;
        console.log('this.operatingRooms',this.operatingRooms);
        
        // load from server
        this.requestsService.getOperatingRooms().then((response: any) => {
          this.operatingRooms = response.data.data;
          console.log(this.operatingRooms);
          
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

  async getTodaysPatientsFromLocal(event?: any) {
    this.updating = true;
    this.LocaldataService.getPatients().then(response => {      
      if (response) {
        console.log('patient',response);
        
        this.patients = response;        
        this.patientsCopy = response;
        this.updating = false;
        //this.letters = this.getFirstLetterFromNames();
        this.getTodaysPatientsFromServer(event);
      } else {
        this.getTodaysPatientsFromServer();
      }
    })
  }

  async getTodaysPatientsFromServer(event?: any, yesterday: boolean = false) {
    this.updating = true;
    //this.disableYesterdaysToggle.emit(true);
    this.requestsService.getTodaysPatients(yesterday).then(async (response: any) => {
      if (event) {
        event.target.complete();
      }
      if (response.status === 200) {
        this.lastsync = new Date().toLocaleString();
        this.patients = response.data;
        this.patientsCopy = response.data;
        //this.letters = this.getFirstLetterFromNames();
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

}
