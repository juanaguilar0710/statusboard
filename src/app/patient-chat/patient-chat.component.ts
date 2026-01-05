import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { RequestsService } from '../api/requests.service';
import { ChatService } from '../api/chat.service';
import Pusher from 'pusher-js';
import Echo from 'laravel-echo';
import { environment } from 'src/environments/environment';
import { ModalController } from '@ionic/angular';
import * as _ from "lodash";
import { AudioService } from '../services/audio.service';
import * as moment from "moment";
import { TranslateService } from '../services/translate.service';

@Component({
  selector: 'app-patient-chat',
  templateUrl: './patient-chat.component.html',
  styleUrls: ['./patient-chat.component.scss']
})
export class PatientChatComponent implements OnInit{
  @Input() patient: any;
  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  @Output() onMessageRead = new EventEmitter<any>();

  messages: any[] = [];
  newMessage: string = '';
  authUser: any = '';
  loading: boolean = false;
  chatRoom: any;
  laravelEcho: Echo<any> | undefined;

  constructor(private chatservice: ChatService,
           private modalController: ModalController,
           public requestsService: RequestsService,
           private audioService: AudioService,
           public translate: TranslateService
  ) {}

  async ngOnInit() {
    this.messages = [];
    this.authUser = await JSON.parse(localStorage.getItem('user')!);
    this.fetchChatSms();
  }

   fetchChatSms() {
    this.loading = true;
    this.chatservice.getChatSms(this.patient.id).subscribe((response:any) => {
      this.loading = false;
      this.chatRoom = response.data;
      this.initListeners();
      this.fetchChatMessages();
    }, (error:any) => {
      this.loading = false;
    });
  }

  initListeners() {
    (<any>window).Pusher = Pusher;
    this.laravelEcho = new Echo({
      broadcaster: 'pusher',
      key: environment.pusher.key,
      cluster: environment.pusher.cluster,
      forceTLS: environment.pusher.forceTLS,
      disableStats: true,

      authorizer: (channel: any, options: any) => {
        return {
          authorize: (socketId: any, callback: any) => {
            localStorage.setItem('socketId', socketId);
            this.requestsService.authorizeBroadcasting(socketId, channel.name).subscribe( response => {
              callback(false, response);
            }, error => {
              callback(true, error);
            });
          }
        };
      },
    });

    const channelForChat = `branch.${this.requestsService.config.branch.id}.room.${this.requestsService.config.waitingRoom.id}`;

    console.log('this.laravelEcho desde el chat', this.laravelEcho);

    this.laravelEcho.channel(channelForChat).listen('.chat.message.created', (e: any) => {
      console.log(e);
      console.log('Received chat message event:', e);
      if (e.message.sender_type == "App\\Models\\Patients") {
        console.log(e);
        this.messages.push(e.message);
        this.playAudio();
      }
    });
  }

    fetchChatMessages() {
    let self = this;
    let params: any = {
      'perPage': '100'
    };
    this.loading = true;
    this.chatservice.getMessages(this.chatRoom, params).subscribe((response:any) => {
      this.loading = false
      for (var i = 0; i < response.data.length; i++) {
        this.addMessage(response.data[i]);
      }
      setTimeout(() => {
        self.scrollToBottom();
      }, 200);
    }, (error:any) => {
      this.loading = false;
    });
  }

  scrollToBottom(): void {
    try {
      this.myScrollContainer.nativeElement.scrollTop = this.myScrollContainer.nativeElement.scrollHeight;
    } catch(err) { }
  }

  onNoClick(): void {
    this.modalController.dismiss({ chat_unread_count: this.patient?.chat_unread_count ?? 0 });
  }

  isChatOwner(senderID: number) {
    return this.chatRoom.owner_id == senderID;
  }

  onVisibilityChange(message: any) {
    if (_.isEmpty(message.read_at)) {
      this.chatservice.markAsRead(message).subscribe((response: any) => {
        message.read_at = response.read_at;
        if (this.patient && typeof this.patient.chat_unread_count === 'number') {
          this.patient.chat_unread_count = Math.max(0, this.patient.chat_unread_count - 1);
        }
      }, (error:any) => {
        // Manejar error si es necesario
      });
    }
  }

  sendMessage() {
    if (!_.isEmpty(this.newMessage)) {
      this.newMessage = this.capitalizeFirstLetter(this.newMessage);
      this.chatservice.addMessage(this.chatRoom, this.newMessage).subscribe((response: any) => {
        this.addMessage(response);
        this.newMessage = '';
      }, (error:any) => {
        this.newMessage = this.translate.instant('patientChat.errorSending');
      });
    }

  }
  capitalizeFirstLetter(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  async playAudio(){
    await this.audioService.playSound('notification', '');
  }

  addMessage(message: any) {
    let self = this;
    this.messages.push(message);
    setTimeout(() => {
      self.scrollToBottom();
    }, 500);
  }

  getSenderName(message: any) {
    if (this.authUser.id === message.sender_id) {
      return "You";
    }
    return message.sender_name;
  }

    stringAsHour(date: any) {
    if (_.isEmpty(date)) {
      return "";
    }
    return moment(date).format("h:mm A");
  }



}
