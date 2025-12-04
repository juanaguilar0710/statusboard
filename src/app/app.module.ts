import { NgModule } from '@angular/core';
import { BrowserModule, HAMMER_GESTURE_CONFIG, HammerModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { NextToSurgeryComponent } from './next-to-surgery/next-to-surgery.component';
import { IonicStorageModule } from '@ionic/storage-angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PatientChatModule } from './patient-chat/patient-chat.module';
import { NgxMaskDirective, NgxMaskPipe, provideNgxMask } from 'ngx-mask';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { IonicGestureConfig } from './ionicGestureConfig';
import { LocationStrategy, PathLocationStrategy } from '@angular/common';
import { ToastrModule } from 'ngx-toastr';

import { HttpClientModule } from '@angular/common/http';

import { Drivers } from '@ionic/storage';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { LoggingInterceptor } from './interceptor/logging.interceptor';


@NgModule({
  declarations: [AppComponent, NextToSurgeryComponent],
  imports: [
    BrowserModule,
    HttpClientModule,  // <-- Asegúrate que está antes de IonicModule
    IonicModule.forRoot({ animated: false }),
    IonicStorageModule.forRoot({
      driverOrder: [Drivers.IndexedDB, Drivers.LocalStorage],
      name: '__mydb',
      storeName: 'logs',
      dbKey: 'key',
      version: 1
    }),
    AppRoutingModule,
    HammerModule,
    FormsModule,
    ReactiveFormsModule,
    PatientChatModule,
    NgxMaskDirective,
    NgxMaskPipe,
    BrowserAnimationsModule,
    ToastrModule.forRoot({
      disableTimeOut: false,
      tapToDismiss: true,
      newestOnTop: true,
      preventDuplicates: false,
    })
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoggingInterceptor,
      multi: true
    },
    { provide: LocationStrategy, useClass: PathLocationStrategy },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideNgxMask(),
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: IonicGestureConfig
    }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
