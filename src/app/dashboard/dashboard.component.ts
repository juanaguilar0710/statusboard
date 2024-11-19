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
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent  implements AfterViewInit, OnInit {
  operatingRooms: any[] = []; // Array de todas las salas
  patients: any[] = []; // Array de todos los pacientes
  pageSize: number = environment.pageSizeWhitPatients; // Tamaño de cada grupo de pacientes (4 por cada grupo)
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
  timeRoomsPerPage = environment.timeRoomsPerPageWhitPatients;
  totalPagesWhitPatients:any;
  totalPages:any;
  totalPagesWithPatients: number = 0;
  currentPageWithPatients: number = 0;
  countdown: number = 0;
  intervalIdForPages: any;
  totalGroups = 0;
  roomsWithPatients:any[] = []


  constructor(private LocaldataService: LocaldataService,
              public requestsService: RequestsService,
              private router: Router,
              private cdr: ChangeDetectorRef,
              private alertController: AlertController,
              private networkService: NetworkService
  ) { 

    setTimeout(() => {
      setInterval(() => {
        this.updateTime();
      }, 1000);
  
      setInterval(() => {
        this.changePageRooms();
        const event = new MouseEvent('mousemove');
        document.dispatchEvent(event); 
      }, environment.timeRoomsPerPage);  
      
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

    }, 3000);

    // setInterval(() => {
    //   this.changePageRoomsWhitPatients();
    // }, environment.timeRoomsPerPageWhitPatients);

   

  }

  changePageRooms() {
    const totalPages = this.operatingRooms && this.operatingRooms.length > 0 ? Math.ceil(this.operatingRooms.length / environment.roomsPerPage) : 0;
    environment.currentPage = (environment.currentPage + 1) % totalPages;     
  }
  totalPagesCurrentPatients:any
  changePageRoomsWhitPatients() {
    this.totalPagesWhitPatients = Math.ceil(this.getRoomsWithPatients().length / environment.roomsPerPageWhitPatients);
    environment.currentPageWhitPatients = (environment.currentPageWhitPatients + 1) % this.totalPagesWhitPatients;
    this.totalPagesCurrentPatients = environment.currentPageWhitPatients;
  }

  // Método para obtener las salas de la página actual
  getRoomsForCurrentPage() {
    const start = environment.currentPage * environment.roomsPerPage;
    const end = start + environment.roomsPerPage;
    return this.operatingRooms.slice(start, end);
  }

  async ngOnInit() {
    Preferences.get({ key: 'config' }).then((response: any) => {
      if (response.value) {
        this.config = (JSON.parse(response.value)); 
        this.requestsService.setToken(this.config.token);
        this.requestsService.setAdminToken(this.config.token);               
      }
    })
    
    this.updateTime();
    await this.getOperatingRoomsFromStorageOrLoadFromServer();
    await this.getTodaysPatientsFromLocal()
    this.requestsService.getTodaysPatients();
    this.requestsService.initDropdowns().then((response: any) => {})    
    this.startCarousel();
    this.startCountdown();
  }

  startCountdown() {
    this.countdown = environment.timeRoomsPerPageWhitPatients / 1000; // Inicializar con el tiempo configurado en segundos
    this.intervalIdForPages = setInterval(() => {
      if (this.countdown > 1) {
        this.countdown--; // Decrementar cada segundo
        
      } else {
        this.changePageRoomsWhitPatients(); // Cambiar de página
        this.updatePaginationDetails();
        this.countdown = environment.timeRoomsPerPageWhitPatients / 1000; // Reiniciar el temporizador
      }
    }, 1000);
  }
  
  getRoomsForCurrentPagewhitpatients() {
    const start = environment.currentPageWhitPatients * environment.roomsPerPageWhitPatients;    
    const end = start + environment.roomsPerPageWhitPatients;    
    this.totalPages = end    
    return this.getRoomsWithPatients().slice(start, end);
  }  

  getRoomsWithPatients(): any[] {
    // Si el array no existe, inicializarlo
    if (!this.roomsWithPatients) {
        this.roomsWithPatients = [];
    }

    // Procesar salas con pacientes asignados
    this.operatingRooms.forEach(room => {
        const patientsInRoom = this.filterPatientsByRoom(room.name);

        // Buscar si la sala ya existe en roomsWithPatients
        const existingRoom = this.roomsWithPatients.find(r => r.name === room.name);

        if (existingRoom) {
            // Actualizar los pacientes si la sala ya existe
            existingRoom.patients = patientsInRoom;
        } else if (patientsInRoom.length > 0) {
            // Agregar la sala si tiene pacientes
            this.roomsWithPatients.push({
                name: room.name,
                id: room.id,
                totalpage: Math.ceil(patientsInRoom.length / this.pageSize),
                actualPage: 1,
                patients: patientsInRoom,
            });
        }
    });

    // Manejar pacientes sin sala asignada
    const patientsWithoutRoom = this.patients.filter(patient => 
        !this.operatingRooms.some(room => room.name === patient.operating_room_name)
    );

    const existingUnassignedRoom = this.roomsWithPatients.find(room => room.name === 'TO FOLLOW');

    if (patientsWithoutRoom.length > 0) {
        // Crear o actualizar la sala 'TO FOLLOW' si hay pacientes sin sala asignada
        if (existingUnassignedRoom) {
            existingUnassignedRoom.patients = patientsWithoutRoom;
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
        // Eliminar la sala 'TO FOLLOW' si ya no tiene pacientes
        this.roomsWithPatients = this.roomsWithPatients.filter(room => room.name !== 'TO FOLLOW');
    }

    // Eliminar salas que no tengan pacientes
    this.roomsWithPatients = this.roomsWithPatients.filter(room => room.patients && room.patients.length > 0);

    return this.roomsWithPatients;
}


  filterPatientsByRoom(roomName: string): any[] {
    if (roomName === 'TO FOLLOW') {
      // Devolver pacientes sin sala asignada
      return this.patients.filter(patient =>
        !this.operatingRooms.some(room => room.name === patient.operating_room_name)
      );
    }
  
    // Filtrar pacientes asociados a una sala
    return this.patients.filter(patient => 
      patient.operating_room_name === roomName && 
      this.config.statuses.includes(patient.status_Id)
    );
  }

  // Obtiene el grupo actual de pacientes para la sala
  getPatientsGroup(roomName: string): any[] {    
    const patientsInRoom = this.filterPatientsByRoom(roomName);
    
    if (!patientsInRoom.length) return []; 
    const currentGroup = this.currentGroups[roomName] || 0;
     
    const start = currentGroup * this.pageSize;
    const end = start + this.pageSize; 

    const room = this.roomsWithPatients.find(r => r.name === roomName);
    if (room) {
        room.actualPage = currentGroup + 1; // `+1` porque las páginas empiezan desde 1
    }

    if (patientsInRoom.length <= this.pageSize) {
      return patientsInRoom;
    }    
    return patientsInRoom.slice(start, end);
  }
    
  // Inicia el cambio de grupos de pacientes cada x segundos solo para salas con más de x pacientes configurado en enviroment
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
    this.totalPagesWithPatients = Math.ceil(this.getRoomsWithPatients().length / environment.roomsPerPageWhitPatients);        
    this.currentPageWithPatients = environment.currentPageWhitPatients + 1;
  }

  stopCarousel() {
    clearInterval(this.intervalId); // Detener el intervalo
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

        // Escuchar eventos de pacientes
        this.listenToPatientEvents(channel);

        // Manejar eventos de conexión/desconexión
        this.handlePusherConnection();

        // Iniciar monitoreo de la conexión
        this.monitorConnection();
  }

  private listenToPatientEvents(channel: string): void {
    this.laravelEcho?.channel(channel).listen('.patient.updated', (e: any) => {
        console.log(e);
        if (this.networkStatus === "ONLINE") {            
            this.updatePatientList('updated', e.patient);
            this.getRoomsWithPatients();
        }
    });

    this.laravelEcho?.channel(channel).listen('.patient.created', (e: any) => {  
        console.log(e);        
        if (this.networkStatus === "ONLINE") {             
            this.updatePatientList('created', e.patient);
            this.getRoomsWithPatients();
        }
    });

    this.laravelEcho?.channel(channel).listen('.patient.deleted', (e: any) => {
        console.log(e);
        if (this.networkStatus === "ONLINE") {
            this.updatePatientList('deleted', e.patient);
            this.getRoomsWithPatients();
        }
    });
}

private handlePusherConnection(): void {
  const pusherInstance = (<any>this.laravelEcho).connector.pusher;

  // Escuchar cuando Pusher se conecta
  pusherInstance.connection.bind('connected', () => {
      console.log('Pusher connected');
  });

  // Escuchar cuando Pusher se desconecta
  pusherInstance.connection.bind('disconnected', () => {
      console.error('Pusher disconnected');
      this.retryConnection();
  });

  // Escuchar errores
  pusherInstance.connection.bind('error', (err: any) => {
      console.error('Pusher error', err);
  });
}


private retryConnection(): void {
  let retries = 0;
  const maxRetries = 5;

  const interval = setInterval(() => {
      if (retries >= maxRetries) {
          clearInterval(interval);
          console.error('Max retries reached. Unable to reconnect to Pusher.');
          return;
      }

      try {
          console.log(`Reconnecting to Pusher (attempt ${retries + 1})...`);
          (<any>this.laravelEcho).connector.pusher.connect();
          retries++;
      } catch (error) {
          console.error('Reconnection failed', error);
      }
  }, 3000); // Intentar reconectar cada 3 segundos
}

private monitorConnection(): void {
  const pusherInstance = (<any>this.laravelEcho).connector.pusher;

  setInterval(() => {
      if (pusherInstance.connection.state !== 'connected') {
          console.warn('Pusher is not connected, attempting to reconnect...');
          this.retryConnection();
      }
  }, 10000); // Verificar cada 10 segundos
}

  private updatePatientList(eventType: string, patient: any) {   
    console.log(eventType);
    console.log(patient);
     
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
    this.stopCarousel();  // Detener el carousel cuando el componente se destruya
    if (this.intervalIdForPages) {
      clearInterval(this.intervalIdForPages);
    }
    if (this.laravelEcho) {
      this.laravelEcho.disconnect();
    }
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
    return this.patients.filter(patient => patient.status.type === 'holding').length;
  }

  getSurgeryPatientsCount(): number {
    return this.patients.filter(patient => patient.status.type === 'surgery').length;
  }

  getRecoveryPatientsCount(): number {
    return this.patients.filter(patient => patient.status.type === 'recovery').length;
  }
  
  getCompletedPatientsCount(): number {
    return this.patients.filter(patient => patient.status.type === 'completed').length;
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
        console.log(this.patients);
              
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
