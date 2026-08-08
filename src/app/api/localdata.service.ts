import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ServerClockService } from '../services/server-clock.service';

@Injectable({
  providedIn: 'root'
})
export class LocaldataService {

  user: any = null;
  isTokenExpired = (token: string) => this.serverClock.nowMs() >= (JSON.parse(atob(token.split('.')[1]))).exp * 1000;

  constructor(private serverClock: ServerClockService) {
    void this.serverClock.ensureSynchronized();
    this.getUser().then((user: any) => {
      this.user = user;
    });
  }

  setPatients(patients: any) {
    if (this.user) {
      const username = this.user.user?.username ?? "";
      Preferences.set({
        key: username + `_patients_${this.today}`,
        value: JSON.stringify(patients)
      });
    }
  }

  private get today(): string {
    const date = this.serverClock.now();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  deletePreviousPatients() {
    if (this.user) {
      const username = this.user.user?.username ?? "";
      Preferences.keys().then((keys: any) => {
        keys.keys.forEach((key: string) => {
          if (key.includes(username + "_patients_") && key !== username + `_patients_${this.today}`) {
            Preferences.remove({ key: key });
          }
        });
      });
    }
  }

  async getPatients(): Promise<any> {    
    if (!this.user) {
      return null;
    }  
    try {
      const username = this.user.user?.username ?? "";
      const response = await Preferences.get({ key: `${username}_patients_${this.today}` });
  
      if (response.value) {
        const patients = JSON.parse(response.value);
        return patients.length > 0 ? patients : null;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error al obtener pacientes:', error);
      throw error;
    }
  }

  getUser(): Promise<any> {
    return new Promise((resolve, reject) => {
      Preferences.get({ key: 'user' }).then((response: any) => {
        if (response.value) {
          const user = JSON.parse(response.value);
          resolve(user);
        } else {
          resolve(null);
        }
      });
    });
  }

  getConfiguration(): Promise<any> {
    return new Promise((resolve, reject) => {
      Preferences.get({ key: 'config' }).then((response: any) => {
        if (response.value) {
          const config = JSON.parse(response.value);
          resolve(config);
        } else {
          resolve(null);
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  getOperatingRooms(): Promise<any> {
    return new Promise((resolve, reject) => {
      Preferences.get({ key: 'operatingRooms' }).then((response: any) => {
        if (response.value) {
          const config = JSON.parse(response.value);
          resolve(config);
        } else {
          resolve(null);
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  setOperatingRooms(operatingRooms: any) {
    Preferences.set({
      key: 'operatingRooms',
      value: JSON.stringify(operatingRooms)
    });
  }

  setTokenBasedOnPin(pin: string, token: string) {
    Preferences.set({
      key: pin,
      value: token
    });
  }

  getTokenBasedOnPin(pin: string): Promise<any> {
    return new Promise((resolve, reject) => {
      Preferences.get({ key: pin }).then((response: any) => {
        if (response.value) {
          if(this.isTokenExpired(response.value)){
            Preferences.remove({ key: pin });
            resolve(null);
            return;
          }
          resolve(response.value);
        } else {
          resolve(null);
        }
      });
    });
  }
}
