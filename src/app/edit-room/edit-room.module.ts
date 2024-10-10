import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EditRoomComponent } from './edit-room.component';
import { EditRoomPageRoutingModule } from './edit-room-routing.module';
import { NgxColorsModule } from 'ngx-colors';
import { DirectivesModule } from '../directives.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReactiveFormsModule,
    EditRoomPageRoutingModule,
    NgxColorsModule,
    DirectivesModule
  ],
  declarations: [EditRoomComponent]
})
export class EditRoomPageModule {}
