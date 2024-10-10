import { Component, OnInit } from '@angular/core';
import { ModalController, NavParams } from '@ionic/angular';

@Component({
  selector: 'app-modal-select',
  templateUrl: './modal-select.component.html',
  styleUrls: ['./modal-select.component.scss'],
})
export class ModalSelectComponent  implements OnInit {

  tipe: any;
  constructor(private modalController: ModalController,private navParams: NavParams) { 
    this.tipe = this.navParams.get('tipe');
  }

  ngOnInit() {
    console.log(this.tipe);
    
  }

  dismiss() {
    this.modalController.dismiss();
  }

}
