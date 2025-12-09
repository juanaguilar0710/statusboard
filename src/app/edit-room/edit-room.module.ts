import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EditRoomComponent } from './edit-room.component';
// Si PanelFactoryService existe, importar aquí
// import { PanelFactoryService } from 'ruta/del/panel-factory.service';
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
  // providers: [PanelFactoryService] // Descomenta si el servicio existe
})
export class EditRoomPageModule {}
