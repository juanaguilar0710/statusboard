import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HomePage } from './home.page';

import { HomePageRoutingModule } from './home-routing.module';
import { ToggleComponent } from '../components/toggle/toggle.component';
import { DirectivesModule } from '../directives.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomePageRoutingModule,
    ReactiveFormsModule,
    DirectivesModule
  ],
  declarations: [HomePage, ToggleComponent]
})
export class HomePageModule {}
