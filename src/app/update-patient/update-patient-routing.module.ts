import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { UpdatePatientPage } from './update-patient.page';

const routes: Routes = [
  {
    path: '',
    component: UpdatePatientPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UpdatePatientPageRoutingModule {}
