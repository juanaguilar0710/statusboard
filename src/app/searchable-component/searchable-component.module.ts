import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { SearchableComponentComponent } from "./searchable-component.component";
import { SearchableComponentRoutingModule } from "./searchable-component-routing.module";
import { SharedModule } from "../shared/shared.module";

//generate module searchable-component
@NgModule({
    imports: [
      CommonModule,
      FormsModule,
      IonicModule,
      SearchableComponentRoutingModule,
      ReactiveFormsModule,
      SharedModule
    ],
    declarations: [SearchableComponentComponent]
  })
  export class SearchableComponentComponentModule {}
