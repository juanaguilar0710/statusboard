import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ModalSelectComponent } from './modal-select.component';

const routes: Routes = [
  {
    path: '',
    component: ModalSelectComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ModalSelectComponentRoutingModule {}
