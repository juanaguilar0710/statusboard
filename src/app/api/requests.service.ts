import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, catchError, from, Observable, switchMap, tap, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LoggerService } from './logger.service';

const urlMonitor = environment.url.replace('api', 'monitor');

@Injectable({
    providedIn: 'root'
})
export class RequestsService {
    config: any = null;
    private token: string | null = null;
    ExpiresIn:any
    refreshTokenKey:any
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
    constructor(private router: Router,private platform: Platform,private http: HttpClient,private logger: LoggerService) {
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
            this.setAdminToken(this.token);
          }

          const configResponse = await Preferences.get({ key: 'config' });
          if (configResponse.value) {
            this.setConfig(JSON.parse(configResponse.value));
          }

          const userResponse = await Preferences.get({ key: 'user' });
          if (userResponse.value) {
            this.setToken(this.token);
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

    setExpiresIn(expired:any) {
        this.ExpiresIn = expired;
    }
    setRefreshToken(refresh:any) {
        this.refreshTokenKey = refresh;
        localStorage.setItem('refresh_token', refresh);
    }

     user:any
    setAuthUser(json:any) {
    localStorage.setItem('user', JSON.stringify(json));
    this.user = json;
  }

    getToken() {
        return this.token;
    }

    setAdminToken(token: string | null) {
        this.adminToken = token;
        this.token = token;
    }

    setConfig(config: any) {
        this.config = config;
    }

    async initDropdowns():Promise<boolean> {

        await new Promise(resolve => setTimeout(resolve, 3000));

        return new Promise(async (resolve, reject) => {
            await this.getBranchComments().subscribe(async (response: any) => {
                if (response.status === 200) {
                    this.comments = response.data;
                }
            });
            await this.getOperatingRooms().subscribe(async (response: any) => {
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
            // await this.getBranchStatuses().then(async (response: any) => {
            //     if (response.status === 200) {
            //         const statuses = response.data.sort((a: any, b: any) => a.sequence - b.sequence);
            //         for (let id = 0; id < statuses.length; id++) {
            //             statuses[id]['colorHex'] = this.statusesColor[id]?.colorHex ?? null;
            //         }
            //         this.statuses = statuses;
            //         if (this.statuses.length > 0)
            //             Preferences.set({ key: 'statuses', value: JSON.stringify(this.statuses) });
            //     }
            // });
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
         console.log('dentro de refresh antes de enviar peticion: ' + token);
            let objRefresh = {
                grant_type: environment.oauthObj.grantTypeRefresh,
                client_id: environment.oauthObj.clientId,
                client_secret: environment.oauthObj.clientSecret,
                refresh_token: localStorage.getItem('refresh_token'),
                // scope: '',
                // username: 'jcamilo',
              };

            const options = {
                url: environment.url + environment.oauth + environment.token,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
                data: objRefresh
            };
            const response: HttpResponse = await CapacitorHttp.post(options);
            console.log(response);

            if (response.status != 200) {

                this.logger.addLog('refreshToken', {
                    url: response.url,
                    mensaje: response,
                    action: 'Refresh con errores'
                  },'error');

                // Preferences.remove({ key: 'user' });
                // Preferences.remove({ key: 'admin' });
                // this.router.navigate(['/login'], { replaceUrl: true });
                return;
            }

            this.logger.addLog('refreshToken', {
                url: response.url,
                action: 'Refresh exitoso'
              },'info');


            return response;
    }

    loginWithPin = async (pin: string): Promise<any> => {
        var token = await this.logger.getTokenAdmin()
        const options = {
          url: environment.url + environment.auth + environment.pin,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
          data: {
            pin: pin,
            branch_id: this.config.branch.id,
            room_id: this.config.waitingRoom.id
          },
        };

        try {
          const response = await CapacitorHttp.post(options);
          if (response && response.status === 200) {
            console.log('Login exitoso con PIN:', response);
            await Preferences.set({ key: 'user', value: JSON.stringify(response.data) });
            return response;
          } else if (response.status === 500 && response.data.error.detail === "Unauthenticated.") {
            const refreshResponse = await this.refreshToken(this.adminToken);
            if (refreshResponse && refreshResponse.status === 200) {
              this.setAdminToken(refreshResponse.data.access_token);
              await Preferences.set({
                key: 'admin',
                value: JSON.stringify(refreshResponse.data)
              });
              return this.loginWithPin(pin);
            }
          }
          return Promise.reject(response);
        } catch (error) {
          console.error('Error en loginWithPin:', error);
          return Promise.reject(error);
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


    getTodaysPatients(yesterday: boolean = false): Observable<any> {
        this.loadingPatients$.next(true);

        return new Observable((observer) => {
            if (!this.token || this.token.length === 0 || this.isTokenExpired(this.token)) {
                observer.error({ status: 404, message: 'Token expired', redirectUrl: '/pin' });
                console.log('status: 404, message: Token expired, redirectUrl: /pin');

                return;
            }

            if (!this.config?.branch || !this.config?.waitingRoom) {
                observer.error({ status: 404, message: 'Missing configuration', redirectUrl: '/settings' });
                console.log('status: 404, message: Missing configuration');
                return;
            }

            const date = new Date();
            if (yesterday) {
                date.setDate(date.getDate() - 1);
            }
            const formatedDate = getLocalDate(date);
            console.log(formatedDate);


            const options = {
                url: `${urlMonitor}/api${environment.visitor}?visit_date=${formatedDate}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                },
            };

            CapacitorHttp.get(options)
                .then((result) => {
                    this.adaptVisitorsResponse(result);
                    this.lastSync = new Date().toLocaleString();
                    Preferences.set({ key: 'lastSync', value: this.lastSync }).then(() => {
                        observer.next(result);
                        observer.complete();
                    });
                })
                .catch((error) => observer.error(error))
                .finally(() => {
                    this.loadingPatients$.next(false);
                });
        });
    }


    async getTodaysPatientsDashboard(yesterday: boolean = false): Promise<any> {
        this.loadingPatients$.next(true);
        const startTime = Date.now();
        const requestId = Math.random().toString(36).substring(2, 9);

        try {
            // Calcula la fecha formateada
            const date = new Date();
            if (yesterday) {
                date.setDate(date.getDate() - 1);
            }
            const formatedDate = getLocalDate(date);

            const options = {
                // url: `${environment.url}${environment.visitor}?visit_date=${formatedDate}&orderBy=fullName&direction=asc&branchID=${this.config.branch.id}&roomID=${this.config.waitingRoom.id}`,
                url: `${urlMonitor}/api${environment.visitor}?visit_date=${formatedDate}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                },
            };

            // Log de inicio de petición
            await this.logger.addLog('Inicio petición getTodaysPatientsDashboard', {
                requestId,
                url: options.url,
                date: formatedDate,
                branchID: this.config.branch.id,
                roomID: this.config.waitingRoom.id,
                headers: this.sanitizeHeaders(options.headers),
                timestamp: new Date().toISOString()
            }, 'info');

            // Realiza la llamada HTTP
            const result = await CapacitorHttp.get(options);
            this.adaptVisitorsResponse(result);
            const duration = Date.now() - startTime;

            // Log de respuesta exitosa
            await this.logger.addLog('Petición exitosa getTodaysPatientsDashboard', {
                requestId,
                status: result.status,
                duration: `${duration}ms`,
                dataSize: this.getVisitorsCountFromResult(result),
                timestamp: new Date().toISOString()
            }, 'success');

            // Actualiza el estado
            this.lastSync = new Date().toLocaleString();
            await Preferences.set({ key: 'lastSync', value: this.lastSync });
            this.loadingPatients$.next(false);

            return result;
        } catch (error:any) {
            const duration = Date.now() - startTime;

            // Log de error
            await this.logger.addLog('Error en petición getTodaysPatientsDashboard', {
                requestId,
                status: error.status || 500,
                error: error.error,
                message: error.message,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            }, 'error');

            // Manejo de errores
            this.loadingPatients$.next(false);
            throw error;
        }
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

    getBranchStatuses(id:any): Observable<any> {
        // const options = {
        //     url: environment.url + environment.status + '/' + id + '?orderBy=sequence&direction=asc',
        //     headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer '},
        // };
        // this.statuses = from(CapacitorHttp.get(options))
        // return from(CapacitorHttp.get(options));
        return this.http.get(environment.url + environment.status + '/' + id + '?orderBy=sequence&direction=asc',);
    }

    getBranchStatusesDevices(id:any): Observable<any> {
        return this.http.get(urlMonitor + '/api' +environment.status + '?orderBy=sequence&direction=asc',);
    }



    getBranchComments(): Observable<any> {
        const options = {
            url: `${environment.url}${environment.comments}/${this.config.branch.id}`,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.token}`,
            },
        };

        // Convierte la promesa en un Observable usando `from`
        return from(CapacitorHttp.get(options)).pipe(
            catchError((error) => {
                // Manejo de errores
                return throwError(error);
            })
        );
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

    getOperatingRooms(): Observable<any> {
        return from(this.getValidToken()).pipe(
          switchMap((token) => {
            if (!token) {
              return throwError(() => new Error('No se pudo obtener un token válido'));
            }

            const options = {
              url: `${environment.url}${environment.waitingRooms}/${this.config.waitingRoom.id}${environment.operatingroomsschedules}`,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            };

            return from(CapacitorHttp.get(options)).pipe(
              tap((response) => {
                this.logger.addLog(
                  'Petición exitosa getOperatingRooms',
                  {
                    url: options.url,
                    status: response.status,
                    data: response.data,
                    timestamp: new Date().toISOString(),
                  },
                  'success'
                );
              }),
              catchError((error) => {
                this.logger.addLog(
                  'Error en petición getOperatingRooms',
                  {
                    url: options.url,
                    status: error.status,
                    error: error.error,
                    message: error.message,
                    timestamp: new Date().toISOString(),
                  },
                  'error'
                );

                if (error.status === 401 || error.status === 403) {
                  return this.handleTokenError(error);
                }

                return throwError(() => new Error(error.message));
              })
            );
          })
        );
      }

    getOperatingRoomsDevices(): Observable<any> {
        return from(this.getValidToken()).pipe(
          switchMap((token) => {
            if (!token) {
              return throwError(() => new Error('No se pudo obtener un token válido'));
            }

            const options = {
              // url: `${environment.url}${environment.waitingRooms}/${this.config.waitingRoom.id}${environment.operatingroomsschedules}`,
              url: urlMonitor + '/api' + environment.operatingroomsschedules,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            };

            return from(CapacitorHttp.get(options)).pipe(
              tap((response) => {
                this.logger.addLog(
                  'Petición exitosa getOperatingRooms',
                  {
                    url: options.url,
                    status: response.status,
                    data: response.data,
                    timestamp: new Date().toISOString(),
                  },
                  'success'
                );
              }),
              catchError((error) => {
                this.logger.addLog(
                  'Error en petición getOperatingRooms',
                  {
                    url: options.url,
                    status: error.status,
                    error: error.error,
                    message: error.message,
                    timestamp: new Date().toISOString(),
                  },
                  'error'
                );

                if (error.status === 401 || error.status === 403) {
                  return this.handleTokenError(error);
                }

                return throwError(() => new Error(error.message));
              })
            );
          })
        );
      }

      private async getValidToken(): Promise<string | null> {
        try {
        //   const pinToken = await this.logger.getTokenPin();
        //   if (pinToken) return pinToken;


          const adminToken = await this.logger.getTokenAdmin();
          return adminToken;
        } catch (error) {
          console.error('Error obteniendo token:', error);
          return null;
        }
      }

      private handleTokenError(error: any): Observable<never> {
        this.logger.addLog(
          'Error de autenticación en getOperatingRooms',
          {
            status: error.status,
            message: 'Token inválido o expirado',
            timestamp: new Date().toISOString(),
          },
          'warning'
        );
        return throwError(() => new Error('Token inválido o expirado'));
      }


      private sanitizeHeaders(headers: any): any {
        const sanitized = {...headers};
        if (sanitized.Authorization) {
          sanitized.Authorization = 'Bearer ***REDACTED***';
        }
        return sanitized;
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

    getOperatingRoomWithUsers(idRoom:any):Observable<any>{
        const options = {
            url: environment.url + environment.operatingroomusers + '/by-room?'+ environment.waiting_room_id +'='+this.config.waitingRoom.id,
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

        searchOperatingRoomUsers(params: {
            roleId: number;
            waitingRoomId: number;
            search?: string;
            perPage?: number;
            orderBy?: string;
            direction?: 'asc' | 'desc';
        }): Observable<any> {
            const {
                roleId,
                waitingRoomId,
                search = '',
                perPage = 20,
                orderBy = 'name',
                direction = 'asc'
            } = params;

            const query = [
                `orderBy=${encodeURIComponent(orderBy)}`,
                `direction=${encodeURIComponent(direction)}`,
                `perPage=${encodeURIComponent(String(perPage))}`,
                `role_id=${encodeURIComponent(String(roleId))}`,
                `waiting_room_id=${encodeURIComponent(String(waitingRoomId))}`,
                `search=${encodeURIComponent(search)}`,
            ].join('&');

            const options = {
                url: `${environment.url}${environment.operatingroomusers}?${query}`,
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
    assignPatients = async (roomId:number, addPatients: {id: number}[] | null, removePatients: {id: number}[] | null): Promise<any> => {
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

    // Create a new operating room user
    createOperatingRoomUser = async (userData: any): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            const options = {
                url: environment.url + environment.operatingroomusers,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
                data: userData
            };
            try {
                resolve(await CapacitorHttp.post(options));
            } catch (error) {
                reject(error);
            }
        });
    }

    authorizeBroadcasting(socketId: string, channelName: string): Observable<any> {
        const headers = new HttpHeaders({
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          });

          return from(
            this.logger.addLog('Autorizando conexión a Pusher', {
                socketId: socketId,
                channel: channelName,
                action: 'Autorización en progreso'
            }, 'info')
        ).pipe(
            switchMap(() => this.http.post<any>(`${urlMonitor}/api/broadcasting/auth`, {
                socket_id: socketId,
                channel_name: channelName
            }, { headers }))
        );
      }

    async loginOauth(loginData: any) {
      //console.log(window.location.origin);
      const options = {
        url: environment.url + environment.oauth + environment.token,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        data: loginData,
      };
      // alert('Iniciando sesión origen...' + window.location.origin);
      // alert('url...' + options.url);
        const response: HttpResponse = await CapacitorHttp.post(options);
        return response;
    }

    getOAuthUser(): Observable<any>  {
        return this.http.get(environment.url + environment.auth + environment.profile);
    }

    sendCode(): Observable<any> {
        return this.http.post(environment.url + environment.auth + environment.sendCode,{});
    }

    verifyTwoFactorCode(code: string): Observable<any> {
        return this.http.post(environment.url + environment.auth + environment.verifyCode, { code: code });
    }

    getList(): any {
      return this.http.get(environment.url + environment.notifications);
    }

    patientsStats(idBranch:any, idRoom:any): Observable<any> {
      return this.http.get(urlMonitor +'/api'+ environment.visitors + environment.stats);
        // return this.http.get(environment.url + environment.branches +'/'+idBranch + environment.rooms +'/'+idRoom + environment.visitors + environment.stats);
    }

    private adaptVisitorsResponse(result: any): void {
        const visitors = Array.isArray(result?.data)
            ? result.data
            : Array.isArray(result?.data?.data)
                ? result.data.data
                : [];

        const mappedVisitors = visitors.map((item: any) => this.mapVisitorForUi(item));
        result.data = mappedVisitors;
    }

    private mapVisitorForUi(item: any): any {
        const status = item?.status ?? {};
        const operatingRoom = item?.operating_room ?? null;
        const surgeon = item?.surgeon ?? null;
        const procedure = item?.procedure ?? null;

        return {
            ...item,
            status_Id: status?.id ?? item?.status_Id ?? null,
            status_name: status?.name ?? item?.status_name ?? null,
            operating_room_id: operatingRoom?.id ?? item?.operating_room_id ?? null,
            operating_room_name: operatingRoom?.name ?? item?.operating_room_name ?? null,
            operating_room: operatingRoom ?? item?.operating_room ?? null,
            surgeon_name: surgeon?.name ?? item?.surgeon_name ?? null,
            surgeon_color: surgeon?.color ?? item?.surgeon_color ?? null,
            surgeon: surgeon ?? item?.surgeon ?? null,
            procedure_name: procedure?.name ?? item?.procedure_name ?? null,
            procedure_time: procedure?.time ?? item?.procedure_time ?? '',
            procedure: procedure ?? item?.procedure ?? null,
        };
    }

    private getVisitorsCountFromResult(result: any): number {
        if (Array.isArray(result?.data)) {
            return result.data.length;
        }

        if (Array.isArray(result?.data?.data)) {
            return result.data.data.length;
        }

        return 0;
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

function getLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Mes comienza en 0
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
