import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {

  networkStatus$ = new BehaviorSubject<string>("ONLINE");

  constructor() {
    Network.getStatus().then(status => {
      this.networkStatus$.next(status.connected ? "ONLINE" : "OFFLINE");
    });
    Network.addListener('networkStatusChange', status => {
      this.networkStatus$.next(status.connected ? "ONLINE" : "OFFLINE");
    });

    Network.getStatus().then(status => {
      this.networkStatus$.next(status.connected ? "ONLINE" : "OFFLINE");
    });
   }
}
