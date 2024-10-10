import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UpdatePatientPageRoutingModule } from './update-patient-routing.module';

import { UpdatePatientPage } from './update-patient.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UpdatePatientPageRoutingModule,
    ReactiveFormsModule
  ],
  declarations: [UpdatePatientPage]
})
export class UpdatePatientPageModule {}
