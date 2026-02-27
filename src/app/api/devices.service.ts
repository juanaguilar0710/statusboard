import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { environment } from 'src/environments/environment';

const urlMonitor = environment.url.replace('api', 'monitor');

@Injectable({
    providedIn: 'root'
})

export class DevicesService {

    async login(loginData: any) {
        const options = {
            url: urlMonitor + environment.auth + environment.login,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: loginData,
        };
        const response: HttpResponse = await CapacitorHttp.post(options);
        return response;
    }



    async registerDevice(payload: any): Promise<any> {
        const options = {
            url: urlMonitor + environment.api + environment.deviceRegistration,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: payload,
        };

        return CapacitorHttp.post(options);
    }

    async requestDeviceToken(IdDevice: string | number, payload: { temp_token: string; client_id: string; client_secret: string }): Promise<any> {
        const options = {
            url: `${urlMonitor}${environment.api}/${IdDevice}/tokens`,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: payload,
        };

        return CapacitorHttp.post(options);
    }


    // getBranches = async (): Promise<any> => {
    //     return new Promise(async (resolve, reject) => {
    //         const options = {
    //             url: environment.url + environment.api + environment.public + environment.branchesrooms,
    //             headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + this.token },
    //         };
    //         try {
    //             resolve(await CapacitorHttp.get(options));
    //         } catch (error) {
    //             reject(error);
    //         }
    //     });
    // }

}
