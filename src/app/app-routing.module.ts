import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { PinEntryGuard } from './pin-entry.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'pin',
    pathMatch: 'full'
  },{
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'configuration',
    loadChildren: () => import('./configuration/configuration.module').then( m => m.ConfigurationPageModule)
  },
  {
    path: 'pin',
    canActivate: [PinEntryGuard],
    canLoad: [PinEntryGuard],
    loadChildren: () => import('./pin/pin.module').then( m => m.PinPageModule)
  },
  {
    path: 'update-patient',
    loadChildren: () => import('./update-patient/update-patient.module').then( m => m.UpdatePatientPageModule)
  },
  {
    path: 'new-patient',
    loadChildren: () => import('./new-patient/new-patient.module').then( m => m.NewPatientPageModule)
  },
  {
    path: 'searchable-component',
    loadChildren: () => import('./searchable-component/searchable-component.module').then( m => m.SearchableComponentComponentModule)
  },
  {
    path: 'modal-component',
    loadChildren: () => import('./modal-select/modal-select-component.module').then( m => m.ModalSelectComponentModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard/dashboard-component.module').then( m => m.DashboardComponentModule)
  },
  {
    path: 'edit-room',
    loadChildren: () => import('./edit-room/edit-room.module').then( m => m.EditRoomPageModule)
  }

];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
