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

  updating: boolean = true;
  patientsCopy: any[] = [];
  lastsync: string = new Date().toLocaleString();
  viewYesterdaysPatients: boolean = false;
  currentDate: Date = new Date();
  currentTime: string = '';
  totalPatients = 44;
  holdingPatients = 20;
  surgeryPatients = 8;
  recoveryPatients = 16;
  feedbackCount = 18;

  config:any;

  currentPage = 0;  // Página inicial
  roomsPerPage = 4; // Cuántas salas mostrar por página
  

  constructor(private LocaldataService: LocaldataService,
              public requestsService: RequestsService,
              private router: Router,
              private cdr: ChangeDetectorRef
  ) { 
    setInterval(() => {
      this.updateTime();
    }, 1000);

    setInterval(() => {
      this.changePage();
    }, 4000);
  }

  changePage() {
    const totalPages = Math.ceil(this.operatingRooms.length / this.roomsPerPage);
    this.currentPage = (this.currentPage + 1) % totalPages; // Cambiar página cíclicamente

    const event = new MouseEvent('mousemove');
    document.dispatchEvent(event);
    console.log(event);
    
  }

  // Método para obtener las salas de la página actual
  getRoomsForCurrentPage() {
    const start = this.currentPage * this.roomsPerPage;
    const end = start + this.roomsPerPage;
    return this.operatingRooms.slice(start, end);
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
      this.config.statuses.includes(patient.status.id) // Filtra por los estados permitidos
    );
  }

   // Obtiene solo las salas que tienen pacientes
  getRoomsWithPatients(): any[] {
    return this.operatingRooms.filter(room => {
      const patientsInRoom = this.filterPatientsByRoom(room.name);
      console.log('patientsInRoom',patientsInRoom);
      
      return patientsInRoom.length > 0;
    });
  }

    // Obtiene el grupo actual de pacientes para la sala
  getPatientsGroup(roomName: string): any[] {
    const patientsInRoom = this.filterPatientsByRoom(roomName);
    const currentGroup = this.currentGroups[roomName] || 0;

    const start = currentGroup * this.pageSize;
    const end = start + this.pageSize;

    // Si la cantidad de pacientes es menor o igual a pageSize, no se hace paginación
    if (patientsInRoom.length <= this.pageSize) {
      return patientsInRoom;
    }

    return patientsInRoom.slice(start, end); // Retorna solo los pacientes del grupo actual (máximo 4)
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

  // Método para actualizar la lista de pacientes basado en los eventos en tiempo real
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
    this.patientsCopy = [...this.patients]; // Clonamos el array para asegurar la detección del cambio
    this.LocaldataService.setPatients(this.patients);
    this.requestsService.lastSync = new Date().toLocaleString();

    // Forzar la detección de cambios
    this.cdr.detectChanges();
  }


  ngOnDestroy() {
    this.stopCarousel();  // Detener el carousel cuando el componente se destruya
    if (this.laravelEcho) {
      this.laravelEcho.disconnect();  // Desconectar Laravel Echo al destruir el componente
    }
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
    }).replace(' ', ''); // Quita el espacio entre la hora y AM/PM
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
