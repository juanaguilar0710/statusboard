
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PatientChatComponent } from './patient-chat.component';
import { VisibilityChangeDirective } from '../directives/visibility-change.directive';

@NgModule({
  declarations: [PatientChatComponent, VisibilityChangeDirective],
  imports: [CommonModule, FormsModule, IonicModule],
  exports: [PatientChatComponent]
})
export class PatientChatModule {}
