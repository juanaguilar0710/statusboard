import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { RequestsService } from '../api/requests.service';
import { AlertController, IonModal, ModalController, PopoverController } from '@ionic/angular';

@Component({
  selector: 'app-next-to-surgery',
  templateUrl: './next-to-surgery.component.html',
  styleUrls: ['./next-to-surgery.component.scss'],
})
export class NextToSurgeryComponent  implements OnInit {
  @ViewChild('confirmNextRoom') confirmNextRoom: IonModal | undefined;
  @Input("patient") patient:any;

  selectedRoomId: number = 0;
  selectedRoomName: string = '';
  constructor(public requestsService: RequestsService,
    public modalController: ModalController, 
    private alertController: AlertController) { }

  ngOnInit() {
  }

  async selectedRoom(room: any){
    this.selectedRoomId = room.id;
    this.selectedRoomName = room.name;
    const alert:any = await this.alertController.create({
      header: 'Please Confirm',
      cssClass: 'confirm-room',
      message: room.name + '?',
      buttons: [
        {
          text: 'No',
          role: 'cancel',
          cssClass: 'alert-button-cancel'
        }, {
          text: 'Yes',
          cssClass: 'alert-button-confirm',
          handler: () => {
            this.confirm();
          }
        }
      ]
    });
    await alert.present();
  }

  cancel(){
    this.confirmNextRoom?.dismiss();
  }

  confirm(){
    this.confirmNextRoom?.dismiss();
    this.modalController.dismiss({room_id: this.selectedRoomId, room_name: this.selectedRoomName});
  }

}
