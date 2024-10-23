import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, from, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root'
})
export class RequestsService {

    config: any = null;
    private token: string | null = null;
    private adminToken: string | null = null;
    timeRemaining$ = new BehaviorSubject<number>(20);
    startTimer$ = new BehaviorSubject<boolean>(false);
    logout$ = new BehaviorSubject<boolean>(false);
    loadingPatients$ = new BehaviorSubject<boolean>(false);
    comments: any = [];
    operatingRooms: any = [];
    surgeons: any = [];
    procedures: any = [];
    recoveryRooms: any = [];
    statuses: any = [];
    operatingRoomsSchedules: any = [];
    lastSync: string = '';

    isTokenExpired = (token: string) => Date.now() >= (JSON.parse(atob(token.split('.')[1]))).exp * 1000;
    constructor(private router: Router,private platform: Platform) {
        this.init();
    }

    //set the time remaining
    setTimeRemaining = (time: number) => {
        this.timeRemaining$.next(time);
    }

    async init(): Promise<any> {
        try {
          const adminResponse = await Preferences.get({ key: 'admin' });
          if (adminResponse.value) {
            this.setAdminToken(JSON.parse(adminResponse.value).jwt.access_token);
          }
      
          const configResponse = await Preferences.get({ key: 'config' });
          if (configResponse.value) {
            this.setConfig(JSON.parse(configResponse.value));
          }
      
          const userResponse = await Preferences.get({ key: 'user' });
          if (userResponse.value) {
            this.setToken(JSON.parse(userResponse.value).jwt.access_token);
          }
      
          const lastSyncResponse = await Preferences.get({ key: 'lastSync' });
          if (lastSyncResponse.value) {
            this.lastSync = lastSyncResponse.value;
          }
      
          return true;
        } catch (error) {
          console.error('Error en init:', error);
          throw error;
        }
      }

    setToken(token: string | null) {
        this.token = token;
    }

    setAdminToken(token: string | null) {
        this.adminToken = token;
    }

    setConfig(config: any) {
        this.config = config;
    }

    async initDropdowns():Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            await this.getBranchComments().then(async (response: any) => {
                if (response.status === 200) {
                    this.comments = response.data;
                }
            });
            await this.getOperatingRooms().then(async (response: any) => {
                if (response.status === 200) {
                    this.operatingRooms = response.data.data;
                }
            });
            await this.getBranchSurgeonsByWaitingRoom().then(async (response: any) => {
                if (response.status === 200) {
                    this.surgeons = response.data;
                }
            });
            await this.getProcedures().then(async (response: any) => {
                if (response.status === 200) {
                    this.procedures = response.data;
                }
            });
            await this.getRecoveryRooms().then(async (response: any) => {
                if (response.status === 200) {
                    this.recoveryRooms = response.data.data;
                }
            });
            await this.getBranchStatuses().then(async (response: any) => {
                if (response.status === 200) {
                    const statuses = response.data.sort((a: any, b: any) => a.sequence - b.sequence);
                    for (let id = 0; id < statuses.length; id++) {
                        statuses[id]['colorHex'] = this.statusesColor[id]?.colorHex ?? null;
                    }
                    this.statuses = statuses;
                    if (this.statuses.length > 0)
                        Preferences.set({ key: 'statuses', value: JSON.stringify(this.statuses) });
                }
            });
            await this.getOperatingRooms().then(async (response: any) => {
                if (response.status === 200) {
                    this.operatingRoomsSchedules = response.data;
                }
            });
            resolve(true);
        });
    }

    async login(loginData: any) {
        const options = {
            url: environment.url + environment.auth + environment.login,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: loginData,
        };
        const response: HttpResponse = await CapacitorHttp.post(options);
        return response;
    }

    async refreshToken(token: string | null) {
        const options = {
            url: environment.url + environment.auth + environment.refresh,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
            data: {
                refresh_token: token
            },
        };
        const response: HttpResponse = await CapacitorHttp.post(options);
        if (response.status != 200) {
            Preferences.remove({ key: 'user' });
            Preferences.remove({ key: 'admin' });
            this.router.navigate(['/login'], { replaceUrl: true });
            return;
        }
        return response;
    }

    loginWithPin = async (pin: string): Promise<any> => {        
        const options = {
          url: environment.url + environment.auth + environment.pin,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.adminToken },          
          data: {
            pin: pin,
            branch_id: this.config.branch.id,
            room_id: this.config.waitingRoom.id
          },
        };
      
        try {
          const response = await CapacitorHttp.post(options);
          if (response && response.status === 200) {
            this.setToken(response.data.jwt.access_token);
            await Preferences.set({ key: 'user', value: JSON.stringify(response.data) });
            return response;  // Resuelve la promesa con la respuesta
          } else if (response.status === 500 && response.data.error.detail === "Unauthenticated.") {
            const refreshResponse = await this.refreshToken(this.adminToken);
            if (refreshResponse && refreshResponse.status === 200) {
              this.setAdminToken(refreshResponse.data.jwt.access_token);
              await Preferences.set({
                key: 'admin',
                value: JSON.stringify(refreshResponse.data)
              });
              // Intentar login nuevamente con el token actualizado
              return this.loginWithPin(pin);
            }
          }
          return Promise.reject(response);  // Rechaza la promesa con la respuesta de error
        } catch (error) {
          console.error('Error en loginWithPin:', error);
          return Promise.reject(error);  // Rechaza la promesa con el error capturado
        }
      }

    getBranches = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.api + environment.public + environment.branchesrooms,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getTodaysPatients = async (yesterday:boolean = false): Promise<any> => {
        this.loadingPatients$.next(true);
        return new Promise(async (resolve, reject) => {
            if (this.token && this.token.length > 0) {
                if (this.isTokenExpired(this.token)) {
                    reject({ status: 404, message: 'Token expired', redirectUrl: '/pin' });
                    return;
                }
            }

            if (this.config && this.config?.branch && this.config?.waitingRoom) {
                const date = new Date();
                var year = date.toLocaleString("default", { year: "numeric" });
                var month = date.toLocaleString("default", { month: "2-digit" });
                var day = date.toLocaleString("default", { day: "2-digit" });
                var formatedDate = `${year}-${month}-${day}`;
                if(yesterday){
                    //calculate yesterday date and format it to yyyy-mm-dd
                    date.setDate(date.getDate() - 1);
                    year = date.toLocaleString("default", { year: "numeric" });
                    month = date.toLocaleString("default", { month: "2-digit" });
                    day = date.toLocaleString("default", { day: "2-digit" });
                    formatedDate = `${year}-${month}-${day}`;
                }
                const options = {
                    url: environment.url + environment.visitor +`?visit_date=${formatedDate}&orderBy=fullName&direction=asc&branchID=${this.config.branch.id}&roomID=${this.config.waitingRoom.id}`,
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
                };
                try {
                    var result = await CapacitorHttp.get(options).catch((error) => {
                        this.loadingPatients$.next(false);
                        reject(error);
                        return;
                    });
                    this.loadingPatients$.next(false);
                    this.lastSync = new Date().toLocaleString();
                    Preferences.set({ key: 'lastSync', value: this.lastSync });
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            } else { 
                this.loadingPatients$.next(false);
                reject({ status: 404, message: 'Token expired', redirectUrl: '/pin' }); 
            }
        });
    }

    updatePatient = async (patient: any): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.visitor + '/' + patient.id,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
                data: patient
            };
            try {
                resolve(await CapacitorHttp.put(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    createPatient(patient: any): Observable<any> {
        const options = {
          url: environment.url + environment.visitor,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
          data: patient
        };
    
        // Convertimos la promesa en un observable usando `from`
        return from(CapacitorHttp.post(options));
      }

      getPlatformSource(): string {
        if (this.platform.is('cordova') || this.platform.is('capacitor')) {
          return 'mobile';
        } else {
          return 'web';
        }
      }

    getPatientById = async (id: number): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.visitor + '/' + id,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getBranchStatuses = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.status + '/' + this.config.branch.id + '?orderBy=sequence&direction=asc',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getBranchComments = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.comments + '/' + this.config.branch.id,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getBranchSurgeonsByWaitingRoom = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.waitingRooms + '/' + this.config.waitingRoom.id + environment.surgeons,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getOperatingRooms = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.waitingRooms + '/' + this.config.waitingRoom.id + environment.operatingrooms,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getProcedures = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.waitingRooms + '/' + this.config.waitingRoom.id + environment.procedures,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getRecoveryRooms = async (): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.branch + '/' + this.config.branch.id + environment.recoveryrooms,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
            };
            try {
                resolve(await CapacitorHttp.get(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    getOperatingRoomsSchedules = (): Observable<any> => {
        const options = {
            url: environment.url + environment.waitingRooms + '/' + this.config.branch.id + environment.operatingroomsschedules,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.adminToken },
        };
    
        return new Observable(observer => {
            CapacitorHttp.get(options)
                .then(response => {
                    observer.next(response);
                    observer.complete();
                })
                .catch(error => {
                    observer.error(error);
                });
        });
    }

    getOperatingRoomWithUsers(idRoom:any):Observable<any>{
        const options = {
            url: environment.url + environment.operatingroomusers + '?'+ environment.waiting_room_id +'='+1,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
        };
    
        return new Observable(observer => {
            CapacitorHttp.get(options)
                .then(response => {
                    observer.next(response);
                    observer.complete();
                })
                .catch(error => {
                    observer.error(error);
                });
        });
    }

    getOperatingRoomWithRolesUsers(orRoomId:any):Observable<any>{
        const options = {
            url: environment.url + environment.operatingrooms + '/'+orRoomId,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
        };
    
        return new Observable(observer => {
            CapacitorHttp.get(options)
                .then(response => {
                    observer.next(response);
                    observer.complete();
                })
                .catch(error => {
                    observer.error(error);
                });
        });
    }

    // update waiting room and assign staff members
    updateWaitingRoom = async (waitingRoom: any): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.operatingrooms + '/' + waitingRoom.id,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
                data: waitingRoom
            };
            try {
                resolve(await CapacitorHttp.put(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    //Assign and remove one or more patients from a operating room
    assignPatients = async (roomId:number, addPatients: number[] | null, removePatients:number[] | null): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.operatingrooms + '/' + roomId + environment.patients,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
                data: {
                    "add_patients": addPatients,
                    "remove_patients": removePatients
                }
            };
            try {
                resolve(await CapacitorHttp.put(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    statusesColor: any[] = [
        {
            name: 'En Turno',
            value: 'waiting',
            colorHex: '#e8e8e8'
        },
        {
            name: 'En Preparación',
            value: 'preparing',
            colorHex: '#e8e8e8'
        },
        {
            name: 'En Cirugía',
            value: 'surgery',
            colorHex: '#e8e8e8'
        },
        {
            name: 'En Recupperación',
            value: 'recovery',
            colorHex: '#e8e8e8'
        },
        {
            name: 'De Alta',
            colorHex: '#e8e8e8'
        },
    ];
}
