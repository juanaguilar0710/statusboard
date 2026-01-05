import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PinPageRoutingModule } from './pin-routing.module';

import { PinPage } from './pin.page';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PinPageRoutingModule,
    SharedModule
  ],
  declarations: [PinPage]
})
export class PinPageModule {}
