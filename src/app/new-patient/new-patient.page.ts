import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RequestsService } from '../api/requests.service';
import { PatientModel } from '../models/patient.model';
import { ModalController, NavController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import { NotificationService } from '../api/notification.service';
import { TranslateService } from '../services/translate.service';

@Component({
  selector: 'app-new-patient',
  templateUrl: './new-patient.page.html',
  styleUrls: ['./new-patient.page.scss'],
})
export class NewPatientPage implements AfterViewInit {

  @ViewChild('fullName') fullName: any;
  loading: boolean = false;
  creating: boolean = false;

  constructor(private _formbuilder: FormBuilder,
    private navController: NavController,
    private notificationService: NotificationService,
    private modalController: ModalController,
    private requestsService: RequestsService,
    public translate: TranslateService) {
      Preferences.get({ key: 'config' }).then((config: any) => {
        const waitingroom = JSON.parse(config.value).waitingRoom;
        this.form.get('waiting_area_Id')?.setValue(waitingroom.id);
        this.form.get('branch_Id')?.setValue(waitingroom.branch_Id);
      });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.fullName.setFocus();
    }, 300);
  }

  form: FormGroup = this._formbuilder.group({
    fullName: [null, [Validators.required, Validators.minLength(3)]],
    age: [null, [Validators.required]],
    gender: [null, [Validators.required]],
    companion_name: [null, [Validators.minLength(3)]],
    phone: [null, [Validators.pattern('^[0-9]*$'), Validators.minLength(10), Validators.maxLength(10)]],
    operating_room_id: [null],
    waiting_area_Id: [null],
    branch_Id: [null],
    status_Id: [0],
    status: [null],
    prefers_sms: [true]
  });

  createPatient() {
    this.loading = true;
    this.creating = true;
    this.form.get('status_Id')?.setValue(this.requestsService.statuses[0]?.id);
    this.form.get('status')?.setValue(this.requestsService.statuses[0]);

    this.requestsService.createPatient(this.form.value).subscribe(
      (response: any) => {
        console.log(response);

        this.loading = false;
        if (response.status === 200) {
          this.form.reset();
          this.loading = false;
          this.creating = false;
          this.notificationService.showSuccess(this.translate.instant('newPatient.createSuccess'), 5000);
          // this.navController.navigateForward(['/home'], { replaceUrl: true, animated: false });
          this.modalController.dismiss({ response: response.data } );
        }

        if (response.status === 500) {
          this.loading = false;
          this.creating = false;
          this.notificationService.showError(response.data.error.detail,5000);
          this.modalController.dismiss();
        }

      },(error: any) => {
        this.loading = false;
        this.creating = false;
        console.log('Error al crear paciente:', error);
        // alert(JSON.parse(error));
        this.notificationService.showError(this.translate.instant('newPatient.createError') + ' ' + JSON.parse(error), 5000);
        this.modalController.dismiss();
      }
    );
  }

  cancel() {
    this.modalController.dismiss();
    // this.navController.navigateBack(['/home'], { replaceUrl: true, animated: false });
  }

}
