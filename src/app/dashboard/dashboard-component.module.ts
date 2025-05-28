import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { DashboardComponent } from "./dashboard.component";
import { DashboardComponentRoutingModule } from "./dashboard-routing.module";

//generate module searchable-component
@NgModule({
    imports: [
      CommonModule,
      FormsModule,
      IonicModule,
      DashboardComponentRoutingModule,      
      ReactiveFormsModule
    ],
    declarations: [DashboardComponent]
  })
  export class DashboardComponentModule {}