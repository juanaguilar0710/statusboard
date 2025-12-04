import { Injectable } from '@angular/core';
import {  Observable} from 'rxjs';
import { environment } from 'src/environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { LoggerService } from './logger.service';

@Injectable({
    providedIn: 'root'
})
export class ChatService {

    constructor(private http: HttpClient, private logger: LoggerService) { }

  getChatSms(visitorId: any): any {
    return this.http.get( environment.url + environment.visitor + "/" + visitorId + environment.chatSms);
  }

  getMessages(chatRoom: any, options?: any): any {
    let url = environment.url + "/chat/" + chatRoom.id + environment.messages;
    let params = new HttpParams();
    if (options) {
      for (let key in options) {
        params = params.append(key, options[key]);
      }
    }
    return this.http.get(url, { params: params });
  }

    markAsRead(message: any): any {
      return this.http.post(environment.url + "/chat" + "/" + message.chat_room_id + environment.messages +'/'+ message.uuid, {});
    }

  addMessage(chatRoom: any, body: string): any {
    return this.http.post(environment.url + "/chat" + "/" + chatRoom.id + environment.messages, {
      body: body
    });
  }

}


