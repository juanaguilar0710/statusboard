import { NgModule } from '@angular/core';
import { BrowserModule, HAMMER_GESTURE_CONFIG, HammerModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { NextToSurgeryComponent } from './next-to-surgery/next-to-surgery.component';
import { IonicStorageModule } from '@ionic/storage-angular';
import { ReactiveFormsModule } from '@angular/forms';
import { NgxMaskDirective, NgxMaskPipe, provideNgxMask } from 'ngx-mask';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { IonicGestureConfig } from './ionicGestureConfig';
import { LocationStrategy, PathLocationStrategy } from '@angular/common';
import { ToastrModule } from 'ngx-toastr';

@NgModule({
  declarations: [AppComponent, NextToSurgeryComponent],
  imports: [ToastrModule.forRoot(),BrowserAnimationsModule, BrowserModule, IonicModule.forRoot({animated: false}), AppRoutingModule, IonicStorageModule.forRoot(), HammerModule, ReactiveFormsModule, NgxMaskDirective, NgxMaskPipe],
  providers: [{ provide: LocationStrategy, useClass: PathLocationStrategy },{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }, provideNgxMask(), 
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: IonicGestureConfig
  }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
