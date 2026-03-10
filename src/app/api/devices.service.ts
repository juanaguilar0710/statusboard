import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { from } from 'rxjs';
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



    registerDevice(payload: any) {
        const options = {
            url: urlMonitor + environment.api + environment.deviceRegistration,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: payload,
        };

        return from(CapacitorHttp.post(options));
    }

    recoverDevice(deviceId: string) {
        const options = {
            url: urlMonitor + environment.api + '/recover',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            data: `device_id=${encodeURIComponent(deviceId)}`,
        };

        return from(CapacitorHttp.post(options));
    }

    async requestDeviceToken(IdDevice: string | number, payload: { temp_token: string; client_id: string; client_secret: string; user_pin?: string }): Promise<any> {
        // Clonamos el payload para no mutar el objeto original
        const payloadToSend = { ...payload };

        // Si user_pin no viene o está vacío, lo eliminamos con seguridad para que no viaje en la petición
        if (!payloadToSend.user_pin) {
            delete payloadToSend.user_pin;
        }

        const options = {
            url: `${urlMonitor}${environment.api}/${IdDevice}/tokens`,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: payloadToSend,
        };

        return CapacitorHttp.post(options);
    }

    async deleteMonitor(id: string | number, token: string): Promise<HttpResponse> {
        const options = {
            url: `${environment.url}${environment.api}/monitors/${id}`,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        return CapacitorHttp.delete(options);
    }

    async deleteMonitorlog(id: string | number, token: string): Promise<HttpResponse> {
        const options = {
            url: `${environment.url}/monitors/${id}`,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        return CapacitorHttp.delete(options);
    }

    async getMonitorData(token: string): Promise<HttpResponse> {
        const options = {
            url: `${urlMonitor}${environment.api}/monitor`,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        return CapacitorHttp.get(options);
    }


}
