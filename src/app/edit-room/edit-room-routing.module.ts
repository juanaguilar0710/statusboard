import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EditRoomComponent } from './edit-room.component';

const routes: Routes = [
  {
    path: '',
    component: EditRoomComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EditRoomPageRoutingModule {}
