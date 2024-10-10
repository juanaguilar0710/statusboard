import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { RequestsService } from 'src/app/api/requests.service';

@Component({
  selector: 'app-toggle',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss'],
})
export class ToggleComponent {

  @Output() toggleEmitter = new EventEmitter();
  @Input() disableYesterday: boolean = false;
  viewYesterdaysPatients: boolean = false;

  form: FormGroup = this._formbuilder.group({
    value: [{value: this.viewYesterdaysPatients, disabled: this.disableYesterday}]
  });

  constructor(private requestService: RequestsService, private _formbuilder: FormBuilder) {
    this.requestService.loadingPatients$.subscribe((loading: boolean) => {
      this.disableYesterday = loading;
    });
  }

  toggle(){
    this.viewYesterdaysPatients = !this.viewYesterdaysPatients;
    this.form.get('value')?.setValue(this.viewYesterdaysPatients);
    this.toggleEmitter.emit({target: {checked: this.viewYesterdaysPatients}});
  }
}
