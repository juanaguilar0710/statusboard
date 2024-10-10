import { NgModule } from '@angular/core';
import { DynamicTextColorDirective } from './directives/dynamicTextColor.directive';

@NgModule({
  imports: [],
  declarations: [DynamicTextColorDirective],
  exports: [DynamicTextColorDirective]
})
export class DirectivesModule { }