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
import { NotificationService } from '../api/notification.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})

  export class DashboardComponent  implements OnInit, AfterViewInit {
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
  clicks = 0;
  totalPagesCurrentPatients:any;


  constructor(private LocaldataService: LocaldataService,
              public requestsService: RequestsService,
              private router: Router,
              private alertController: AlertController,
              private networkService: NetworkService,
              private notificationService: NotificationService
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
        console.log(status);
        
        this.networkStatus = status;
        if (status === "OFFLINE") {
          this.deviceWasOffline = true;
          // this.notificationService.showInfo('System Offline',6000);
        } else {
          if (this.deviceWasOffline) {
            //this.getTodaysPatientsFromServer();
            // this.notificationService.showInfo('System Conected',6000);
            this.ngOnInit();
            this.deviceWasOffline = false;
          }
        }
      });
    }, 3000);
  }

  async ngOnInit() {   
    await Preferences.get({ key: 'config' }).then((response: any) => {
      if (response.value) {
        this.config = (JSON.parse(response.value));         
        this.requestsService.setToken(this.config.token);
        this.requestsService.setAdminToken(this.config.token);                    
      }
    })    
     this.updateTime();
     this.startlists();
     
    

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
    await this.getOperatingRoomsFromStorageOrLoadFromServer();
    await this.getTodaysPatientsFromServer();
    this.startCarousel();
    this.startCountdown();
  }

  refreshToken(){
    this.requestsService.refreshToken(this.config.token).then(async resp =>{
      console.log(resp);              
      if (resp?.status === 200) {
        this.config.token = resp.data?.jwt.access_token 
        this.requestsService.setToken(resp.data.jwt.access_token);
        this.requestsService.setAdminToken(resp.data.jwt.access_token);               
        await Preferences.set({
          key: 'config',
          value: JSON.stringify(this.config),
        }); 
        setTimeout(() => {
          this.notificationService.showInfo('Token refresh.',3000);
        }, 3000);
        this.startlists()               
      }
    });
  }
  async getOperatingRoomsFromStorageOrLoadFromServer() {           
        await this.requestsService.getOperatingRooms().subscribe((response: any) => {
          if(response.status == 500){
            if(response.data.error.code == 1000){
              this.refreshToken();                            
          }
          }else{
            this.operatingRooms = response.data.data;
            this.LocaldataService.setOperatingRooms(this.operatingRooms);
          }                  
        },error => {
          console.log('error getOperatingRooms',error);          
        });
  } 
  async getTodaysPatientsFromServer(event?: any, yesterday: boolean = false) {
    this.updating = true;
    this.requestsService.getTodaysPatientsDashboard(yesterday).then(async (response: any) => {
      if (event) {
        event.target.complete();
      }
      if (response.status === 200) {

        const newPatients = response.data;
        const updatedPatients:any = [];

        newPatients.forEach((newPatient:any) => {
          const existingPatient = this.patients.find(p => p.id === newPatient.id);
          if (!existingPatient || this.hasPatientChanged(existingPatient, newPatient)) {
            updatedPatients.push(newPatient);
          }
        });

        this.lastsync = new Date().toLocaleString();
        this.patients = [...newPatients];
        this.patientsCopy = [...newPatients];
        this.LocaldataService.setPatients(newPatients);
        this.viewYesterdaysPatients = yesterday;
      

        updatedPatients.forEach((patient:any) => this.addUpdatedPatient(patient));

      } 
      if (response.status === 500) {
        this.refreshToken();
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

    console.log(this.currentPageWithPatients);
    
  }
  stopCarousel() {
    clearInterval(this.intervalId);
  }
  getRoomsWithPatients(): any[] {
    
    this.roomsWithPatients = this.roomsWithPatients || [];    
        this.operatingRooms.forEach(room => {
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
        this.roomsWithPatients = this.roomsWithPatients.filter(room => room.patients && room.patients.length > 0);                      
        return this.roomsWithPatients;
  }
  startCountdown() {
    if (this.intervalIdForPages) {
      clearInterval(this.intervalIdForPages); // Detiene el intervalo previo si existe
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
    const totalPages = this.operatingRooms && this.operatingRooms.length > 0 ? Math.ceil(this.operatingRooms.length / environment.roomsPerPage) : 0;
    environment.currentPage = (environment.currentPage + 1) % totalPages;     
  }  
  changePageRoomsWhitPatients() {
  const roomsWithPatients = this.getRoomsWithPatients();
  if (roomsWithPatients.length === 0) {
    this.totalPagesWhitPatients = 0;
    environment.currentPageWhitPatients = 0;
    return;
  }

  this.totalPagesWhitPatients = Math.ceil(roomsWithPatients.length / environment.roomsPerPageWhitPatients);
  environment.currentPageWhitPatients = (environment.currentPageWhitPatients + 1) % this.totalPagesWhitPatients;
  this.totalPagesCurrentPatients = environment.currentPageWhitPatients;
}
  getRoomsForCurrentPage() {
    const start = environment.currentPage * environment.roomsPerPage;
    const end = start + environment.roomsPerPage;
    return this.operatingRooms.slice(start, end);
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
      this.config.statuses.includes(patient.status_Id)
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
  ngAfterViewInit(): void {
    if(this.deviceWasOffline){
console.log('Sin conexion');

    }else{
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
  }

  hasPatientChanged(existingPatient: any, newPatient: any): boolean {
    // Compara los atributos clave del paciente
    return (
      existingPatient.status_Id !== newPatient.status_Id ||
      existingPatient.operating_room_name !== newPatient.operating_room_name
      // Agrega más comparaciones según sea necesario
    );
  }

  addUpdatedPatient(patient: any) {   
    const updatedPatients = JSON.parse(localStorage.getItem('updatedPatients') || '[]');
    const expiry = new Date().getTime() + 60000; // 60 segundos

    // Añadir el paciente con tiempo de expiración
    updatedPatients.push({ ...patient, expiry });

    // Guardar en localStorage
    localStorage.setItem('updatedPatients', JSON.stringify(updatedPatients));
}

getUpdatedPatients() {
  const updatedPatients = JSON.parse(localStorage.getItem('updatedPatients') || '[]');
  const currentTime = new Date().getTime();

  // Filtrar solo los pacientes no expirados
  const validPatients = updatedPatients.filter((patient: any) => currentTime <= patient.expiry);

  // Actualizar `localStorage` con la lista válida
  localStorage.setItem('updatedPatients', JSON.stringify(validPatients));

  return validPatients;
}

isPatientUpdated(patientId: number): boolean {
  const updatedPatients = this.getUpdatedPatients();
  return updatedPatients.some((p: any) => p.id === patientId);
}

  private listenToPatientEvents(channel: string): void {
      this.laravelEcho?.channel(channel).listen('.patient.updated', (e: any) => {
          if (this.networkStatus === "ONLINE") {               
              this.updatePatientList('updated', e.patient);
              //this.addUpdatedPatient(e.patient)
              this.getRoomsWithPatients();
              this.getOperatingRoomsFromStorageOrLoadFromServer()
          }
      });

      this.laravelEcho?.channel(channel).listen('.patient.created', (e: any) => {  
          console.log(e);        
          if (this.networkStatus === "ONLINE") {             
              this.updatePatientList('created', e.patient);
              this.getRoomsWithPatients();
              this.getOperatingRoomsFromStorageOrLoadFromServer()
          }
      });

      this.laravelEcho?.channel(channel).listen('.patient.deleted', (e: any) => {
          console.log(e);
          if (this.networkStatus === "ONLINE") {
              this.updatePatientList('deleted', e.patient);
              this.getRoomsWithPatients();
              this.getOperatingRoomsFromStorageOrLoadFromServer()
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
      console.warn('Pusher disconnected, attempting to reconnect...');
      this.retryConnection();
    });
  
    // Escuchar errores
    pusherInstance.connection.bind('error', (err: any) => {
      console.error('Pusher error:', err);
      window.location.reload();

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
    }, 3000);
  }

  private monitorConnection(): void {
    const pusherInstance = (<any>this.laravelEcho).connector.pusher;
    setInterval(() => {
        if (pusherInstance.connection.state !== 'connected') {
            console.warn('Pusher is not connected, attempting to reconnect...');
            this.retryConnection();
        }
    }, 10000);
  }
  private updatePatientList(eventType: string, patient: any) {     
    const index = this.patients.findIndex((p: any) => p.id === patient.id);
    switch(eventType) {
      case 'created':
        if (index === -1) {
          this.getTodaysPatientsFromServer();
        }
        break;
      case 'updated':
        if (index > -1) {
          this.getTodaysPatientsFromServer();               
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
  }
  ngOnDestroy() {
    this.stopCarousel();  // Detener el carousel cuando el componente se destruya
    if (this.intervalIdForPages) {
      clearInterval(this.intervalIdForPages);
      this.intervalIdForPages = null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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
            localStorage.setItem('tempConfig',JSON.stringify(this.config))
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

  currentPagePatients: number = 0; // Página actual
  patientsPerPage: number = 17;   // Número de pacientes por página
  totalPatientPages: number = 0;  // Total de páginas

  updatePatientPaginationDetails() {
    this.totalPatientPages = Math.ceil(this.patients.length / this.patientsPerPage);    
    console.log(this.totalPatientPages);
  }
  
  getPatientsForCurrentPage(): any[] {
    const sortedPatients = [...this.patients].sort((a, b) => a.status.id - b.status.id);    
    const start = this.currentPagePatients * this.patientsPerPage;
    const end = start + this.patientsPerPage;
    return sortedPatients.slice(start, end);
  }
  
  changePatientPage() {
    this.currentPagePatients = (this.currentPagePatients + 1) % (this.totalPatientPages == 0 ? 1 : this.totalPatientPages);
    console.log(this.currentPagePatients);
  }
  
}
