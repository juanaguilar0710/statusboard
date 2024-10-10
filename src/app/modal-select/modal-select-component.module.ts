import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { ModalSelectComponent } from "./modal-select.component";
import { ModalSelectComponentRoutingModule } from "./modal-select-routing.module";

//generate module searchable-component
@NgModule({
    imports: [
      CommonModule,
      FormsModule,
      IonicModule,
      ModalSelectComponentRoutingModule,
      ReactiveFormsModule
    ],
    declarations: [ModalSelectComponent]
  })
  export class ModalSelectComponentModule {}