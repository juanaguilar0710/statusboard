
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PatientChatComponent } from './patient-chat.component';
import { VisibilityChangeDirective } from '../directives/visibility-change.directive';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [PatientChatComponent, VisibilityChangeDirective],
  imports: [CommonModule, FormsModule, IonicModule, SharedModule],
  exports: [PatientChatComponent]
})
export class PatientChatModule {}
