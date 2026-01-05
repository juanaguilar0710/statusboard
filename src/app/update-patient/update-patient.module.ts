import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UpdatePatientPageRoutingModule } from './update-patient-routing.module';

import { UpdatePatientPage } from './update-patient.page';
import { StatusButtonsComponent } from '../status-buttons/status-buttons.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UpdatePatientPageRoutingModule,
    ReactiveFormsModule,
    StatusButtonsComponent,
    SharedModule
  ],
  declarations: [UpdatePatientPage]
})
export class UpdatePatientPageModule {}
