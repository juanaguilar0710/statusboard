import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SearchableComponentComponent } from './searchable-component.component';

const routes: Routes = [
  {
    path: '',
    component: SearchableComponentComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SearchableComponentRoutingModule {}
