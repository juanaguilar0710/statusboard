import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { DashboardComponent } from "./dashboard.component";
import { DashboardComponentRoutingModule } from "./dashboard-routing.module";
import { SharedModule } from "../shared/shared.module";
import { DashboardTableViewComponent } from "./components/dashboard-table-view/dashboard-table-view.component";
import { DashboardListViewComponent } from "./components/dashboard-list-view/dashboard-list-view.component";
import { DirectivesModule } from "../directives.module";

//generate module searchable-component
@NgModule({
    imports: [
      CommonModule,
      FormsModule,
      IonicModule,
      DashboardComponentRoutingModule,
      ReactiveFormsModule,
      SharedModule,
      DirectivesModule
    ],
    declarations: [DashboardComponent, DashboardTableViewComponent, DashboardListViewComponent]
  })
  export class DashboardComponentModule {}
