import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UpdatePatientPageRoutingModule } from './update-patient-routing.module';

import { UpdatePatientPage } from './update-patient.page';
import { StatusButtonsComponent } from '../status-buttons/status-buttons.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UpdatePatientPageRoutingModule,
    ReactiveFormsModule,
    StatusButtonsComponent
  ],
  declarations: [UpdatePatientPage]
})
export class UpdatePatientPageModule {}
