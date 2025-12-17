import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { NavigationBehaviorOptions, Router } from '@angular/router';
import { RequestsService } from '../api/requests.service';
import { environment } from 'src/environments/environment';
import { Preferences } from '@capacitor/preferences';
import { PopoverController, IonModal, ModalController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { SearchableComponentComponent } from '../searchable-component/searchable-component.component';
import { NotificationService } from '../api/notification.service';

@Component({
  selector: 'app-update-patient',
  templateUrl: './update-patient.page.html',
  styleUrls: ['./update-patient.page.scss'],
})
export class UpdatePatientPage implements OnInit, OnDestroy {

  @ViewChild('commentsPopover') commentsPopover: any | undefined;
  @ViewChild('modalCancelSurgery') modalCancelSurgery: IonModal | undefined;

  loading: boolean = false;
  patient: any = null;
  comments: any[] = [];
  operatingRooms: any[] = [];
  surgeons: any[] = [];
  procedures: any[] = [];
  procedureTime: any[] = [];
  statuses: any[] = [];
  recoveryRooms: any[] = [];
  modal: any;
  disabledToggle: boolean = true;
  updating: boolean = false;

  timeList: any[] = environment.timeList;

  maxLength = 70;
  remainingChars = this.maxLength;

  form = this._formbuilder.group({
    fullName: [null],
    status_Id: [null],
    comment_id: [null],
    comment_custom: [null],
    operating_room_id: [null],
    operating_room_name: [null],
    surgeon_id: [null],
    surgeon_name: [null],
    procedure_id: [null],
    procedure_name: [null],
    procedure_time: [''],
    recovery_room: [null],
    recovery_room_id: [null],
    companion_name: [null],
    time_id: [''],
    phone: [null],
    note: [null],
    next_to_surgery_id: [null]
  });


  constructor(private requestsService: RequestsService,
    private router: Router,
    private _formbuilder: FormBuilder,
    public popoverController: PopoverController,
    private notificationService: NotificationService,
    private storage: Storage,
    private modalController: ModalController) {
    const navParams = this.router.getCurrentNavigation()?.extras?.state;
    if (navParams) {
      this.patient = (navParams as any)?.patient;
      console.log('this.patient',this.patient);

    }

    this.form.get('comment_custom')?.valueChanges.subscribe((value:any) => {
      this.remainingChars = (value ? value.length : 0);
    });
  }

  ngOnDestroy(): void {
    this.modalCancelSurgery?.dismiss();
    this.modal?.dismiss();
  }



  async ngOnInit() {
    this.loading = true;
    this.storage.remove('patient');
    this.comments = this.requestsService.comments?.sort((a: any, b: any) => { return a.short_description.localeCompare(b.short_description) });
    await this.requestsService.getOperatingRooms().subscribe(resp => {
      if (resp.status === 500) {
        Preferences.remove({ key: 'user' });
        this.router.navigate(['/pin'], { replaceUrl: true });
      }
      this.operatingRooms = resp.data.data?.sort((a: any, b: any) => { return a.name.localeCompare(b.name) });
    },error => {
      console.log('error getOperatingRooms: ', error);

    });
    await this.requestsService.getBranchSurgeonsByWaitingRoom().then(resp => {
      if (resp.status === 500) {
        Preferences.remove({ key: 'user' });
        this.router.navigate(['/pin'], { replaceUrl: true });
      }
      this.surgeons = resp.data?.sort((a: any, b: any) => { return a.name.localeCompare(b.name) });
    },error => {
      console.log('error getBranchSurgeonsByWaitingRoom: ', error);
    });
    this.procedures = this.requestsService.procedures?.sort((a: any, b: any) => { return a.name.localeCompare(b.name) });
    await this.requestsService.getRecoveryRooms().then(resp => {
      if (resp.status === 500) {
        Preferences.remove({ key: 'user' });
        this.router.navigate(['/pin'], { replaceUrl: true });
      }
      this.recoveryRooms = resp.data.data
    },error => {
      console.log('error getRecoveryRooms: ', error);

    });
    this.form.patchValue(this.patient);
    this.form.get('comment_id')?.setValue(this.patient?.comment_Id);
    this.form.get('recovery_room_id')?.setValue(this.patient?.recovery_room);
    this.form.get('time_id')?.setValue(this.patient?.procedure_time);
    this.form.get('next_to_surgery_id')?.setValue(this.patient?.operating_room_id);

    setTimeout(async () => {
      await this.getBranch();
    }, 250);

    if (!this.patient.surgeon_id) {
      //search for the surgeon by name
      const surgeon = this.surgeons.find((surgeon: any) => { return surgeon.name == this.patient.surgeon_name });
      if (surgeon) {
        this.form.get('surgeon_id')?.setValue(surgeon.id);
        this.patient.surgeon_id = surgeon.id;
      }
    }

    if (!this.patient.procedure_id) {
      //search for the procedure by name
      const procedure = this.procedures.find((procedure: any) => { return procedure.name == this.patient.procedure_name });
      if (procedure) {
        this.form.get('procedure_id')?.setValue(procedure.id);
        this.patient.procedure_id = procedure.id;
      }
    }
    if(this.form.get('phone')?.value != null){
      // this.patient.prefers_sms = true;
      this.disabledToggle = false;
    }else{
      this.disabledToggle = true;
    }

  }

  toggleSMSNotifications(tel: any) {
        if (tel.detail.value != "") {
          this.patient.prefers_sms = true;
          this.disabledToggle = false;
        } else {
          this.patient.prefers_sms = false;
          this.disabledToggle = true;
        }
  }

  getBranch() {
    Preferences.get({ key: 'branch' }).then(async (response: any) => {
      if (response.value) {
        const branches = [JSON.parse(response.value)];
        this.requestsService.getBranchStatuses(branches[0].id).subscribe(resp => {
          this.statuses = resp
          this.patientStatusUIUpdate();
        },error => {
          console.log('error getBranch: ', error);

        });
      }
    });
  }

  async openSearchableComponentOnModal(type: string) {
    const data = (type == 'operating_room' || type == 'next_to_surgery') ? this.operatingRooms : type == 'surgeon' ? this.surgeons : type == 'procedure' ? this.procedures : type == 'time' ? this.timeList : type == 'recovery_room' ? this.recoveryRooms : this.comments;
    this.modal = await this.modalController.create({
      cssClass: 'searchable-component-modal',
      component: SearchableComponentComponent,
      componentProps: {
        data: data,
        type: type,
        selectedValue: this.getObjectByValue(this.form.get(type + '_id')?.value, type),
        customValue: this.getCustomValue(type)
      }
    });

    this.modal.present();

    await this.modal.onDidDismiss().then((data: any) => {
      const dataSelected = data.data?.value?.value;
      if (data.data?.textFromInput) {
        if (type == 'operating_room') {
          this.form.get('operating_room_id')?.setValue(null);
          this.form.get('operating_room_name')?.setValue(data.data?.textFromInput);
        } else if (type == 'surgeon') {
          this.form.get('surgeon_id')?.setValue(null);
          this.form.get('surgeon_name')?.setValue(data.data?.textFromInput);
        } else if (type == 'procedure') {
          this.form.get('procedure_id')?.setValue(null);
          this.form.get('procedure_name')?.setValue(data.data?.textFromInput);
        } else if (type == 'recovery_room') {
          this.form.get('recovery_room')?.setValue(data.data?.textFromInput);
        } else {
          this.form.get('comment_id')?.setValue(null);
          this.form.get('comment_custom')?.setValue(data.data?.textFromInput);
        }
      }
      else if (dataSelected) {
        if (type == 'operating_room') {
          this.form.get('operating_room_id')?.setValue(dataSelected.id);
          this.form.get('operating_room_name')?.setValue(dataSelected.name);
        } else if (type == 'surgeon') {
          this.form.get('surgeon_id')?.setValue(dataSelected.id);
          this.form.get('surgeon_name')?.setValue(dataSelected.name);
        } else if (type == 'procedure') {
          this.form.get('procedure_id')?.setValue(dataSelected.id);
          this.form.get('procedure_name')?.setValue(dataSelected.name);
        } else if (type == 'time') {
          this.form.get('procedure_time')?.setValue(dataSelected);
          this.form.get('time_id')?.setValue(dataSelected);
        } else if (type == 'recovery_room') {
          this.form.get('recovery_room')?.setValue(dataSelected);
        } else if (type == 'next_to_surgery') {
          const nextToSurgerySelected = dataSelected.detail.value;
          this.form.get('next_to_surgery_id')?.setValue(nextToSurgerySelected.id);
          this.form.get('operating_room_id')?.setValue(nextToSurgerySelected.id);
          this.form.get('operating_room_name')?.setValue(nextToSurgerySelected.name);
          this.patient.operating_room_id = nextToSurgerySelected.id;
          this.storage.set('patient', this.patient);
          const navigationBehaviorOptions: NavigationBehaviorOptions = { state: { update: true, patient: this.patient }, replaceUrl: true };
          this.router.navigate(['/home'], navigationBehaviorOptions);
        } else {
          this.form.get('comment_id')?.setValue(dataSelected.id);
          this.form.get('comment_custom')?.setValue(dataSelected.full_description);
        }
      }
    });
  }


  getCustomValue(type: string) {
    if (type == 'operating_room') {
      return this.form.get('operating_room_name')?.value;
    } else if (type == 'surgeon') {
      return this.form.get('surgeon_name')?.value;
    } else if (type == 'procedure') {
      return this.form.get('procedure_name')?.value;
    } else if (type == 'recovery_room') {
      return this.form.get('recovery_room')?.value;
    } else {
      return this.form.get('comment_custom')?.value;
    }
  }

  getObjectByValue(value: any, type: string) {
    if (type == 'operating_room') {
      return this.operatingRooms.find((room: any) => { return room.id == value });
    } else if (type == 'surgeon') {
      return this.surgeons.find((surgeon: any) => { return surgeon.id == value });
    } else if (type == 'procedure') {
      return this.procedures.find((procedure: any) => { return procedure.id == value });
    } else if (type == 'recovery_room') {
      return this.recoveryRooms.find((room: any) => { return room == value });
    } else if (type == 'next_to_surgery') {
      return this.operatingRooms.find((room: any) => { return room.id == value });
    }
    else if (type == 'time') {
      return this.timeList.find((time: any) => { return time.value == value })?.value;
    } else {
      return this.comments.find((comment: any) => { return comment.id == value });
    }
  }

  scrollToElement(element: string) {
    setTimeout(() => {
      const elementToScroll = document.getElementById(element);
      if (elementToScroll != null) {
        elementToScroll?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 150)
  }

  updateStatus(status: any) {
    // this.loading = true;
    if (status.id != 0) {
      this.patient.status_Id = status.id;
      this.form.get('status_Id')?.setValue(status.id);
      this.patientStatusUIUpdate();
    }
  }

  formatTime(time: string): void {
    if (!time) {
      return;
    }
    //return time in 12 hour format
    var hour = Number(time.split(':')[0]);
    const minutes = time.split(':')[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour > 12) {
      hour = hour - 12;
    }
    var formated = `${hour}:${minutes} ${ampm}`;
    if (formated) {
      this.form.get('procedure_time')?.setValue(formated!);
      this.form.get('time_id')?.setValue(formated);
    }
  }

  patientStatusUIUpdate() {
    var statusLength = this.statuses.length;
    let statusIndex = this.statuses.findIndex((status: any) => { return status.id == this.patient.status_Id });
    if (statusIndex > -1) {
      const selectedStatusSequence = this.statuses[statusIndex].sequence;
      this.statuses.forEach((status: any, index: number) => {
        if (index < statusIndex) {
          this.statuses[index].colorHex = '#e8e8e8';
          this.statuses[index].textColor = '#b5b5b5';
        }
        if (statusIndex == index) {
          this.statuses[index].colorHex = '#00bf63';
        }
        if (index > statusIndex) {
          this.statuses[index].colorHex = '#d6ffa3';
        }

      });
      // if (selectedStatusSequence == 1 || selectedStatusSequence == 2) {
      //   for (let index = 0; index < 2; index++) {
      //     this.statuses.unshift({
      //       id: 0,
      //       name: '',
      //       colorHex: ''
      //     });
      //   }
      // }
      // if (selectedStatusSequence == statusLength || selectedStatusSequence == statusLength - 1 || selectedStatusSequence == statusLength - 2) {
      //   const times = selectedStatusSequence != statusLength ? selectedStatusSequence == statusLength - 2 ? 0 : selectedStatusSequence == statusLength - 1 ? 1 : 2 : 2;
      //   for (let index = 0; index < times; index++) {
      //     this.statuses.push({
      //       id: 0,
      //       name: '',
      //       colorHex: ''
      //     });
      //   }
      // }
      setTimeout(() => {
        const element = document.getElementById('status' + this.patient.status_Id);
        if (element != null) {
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
        this.loading = false;
      }, 150);
    }
  }

  onChangeSMSToggle(e: any) {
    console.log(e);

    if (e.detail.checked == true) {
      this.patient.prefers_sms = true;
    } else {
      this.patient.prefers_sms = false;
    }
  }

  async updatePatient() {
    console.log(this.form.value);

    this.updating = true;
    this.loading = true;
    this.patient.status = this.form.value.status_Id ? this.statuses.find((status: any) => { return status.id == this.form.value.status_Id }) : null;
    this.patient.status_name = this.form.value.status_Id ? this.statuses.find((status: any) => { return status.id == this.form.value.status_Id })?.name : null;
    this.patient.status_Id = this.form.value.status_Id;
    this.patient.comment_Id = this.form.value.comment_id;
    this.patient.comment_custom = this.form.value.comment_id ? this.comments.find((comment: any) => { return comment.id == this.form.value.comment_id })?.full_description : this.form.get('comment_custom')?.value ? this.form.get('comment_custom')?.value : null;
    this.patient.operating_room_id = this.form.value.operating_room_id ? this.form.value.operating_room_id : null;
    this.patient.operating_room_name = this.form.value.operating_room_id ? this.operatingRooms.find((room: any) => { return room.id == this.form.value.operating_room_id })?.name : this.form.get('operating_room_name')?.value ? this.form.get('operating_room_name')?.value : null;
    this.patient.surgeon_id = this.form.value.surgeon_id;
    this.patient.surgeon_name = this.form.value.surgeon_id ? this.surgeons.find((surgeon: any) => { return surgeon.id == this.form.value.surgeon_id })?.full_name : this.form.get('surgeon_name')?.value ? this.form.get('surgeon_name')?.value : null;
    this.patient.surgeon = this.form.value.surgeon_id ? this.surgeons.find((surgeon: any) => { return surgeon.id == this.form.value.surgeon_id }) : null;
    this.patient.procedure_id = this.form.value.procedure_id;
    this.patient.procedure_name = this.form.value.procedure_id ? this.procedures.find((procedure: any) => { return procedure.id == this.form.value.procedure_id })?.name : this.form.get('procedure_name')?.value ? this.form.get('procedure_name')?.value : null;
    this.patient.procedure_time = this.form.value.procedure_time?.split(':').slice(0, 2).join(':');;
    this.patient.recovery_room = this.form.value.recovery_room;
    this.patient.companion_name = this.form.value.companion_name;
    this.patient.phone = this.form.value.phone;
    this.patient.phone_formatted = null
    this.patient.phone_national_format = null

    this.patient.note = this.form.value.note;
    this.patient.has_note = this.form.value.note ? true : false;
    this.patient.fullName = this.form.value.fullName;
    this.storage.set('patient', this.patient).then(() => {
      // const navigationBehaviorOptions: NavigationBehaviorOptions = { state: { update: true, patient: this.patient }, replaceUrl: true };
      // this.router.navigate(['/home'], navigationBehaviorOptions);
      this.requestsService.updatePatient(this.patient).then(async (response: any) => {
        this.storage.set('patient', null);
        if (response.status === 200) {
          this.updating = false;
          this.loading = false;
          this.notificationService.showInfo(response.data.message, 5000);
          this.modalController.dismiss({ patient: this.patient });
        }else{
          this.updating = false;
          this.loading = false;
          this.notificationService.showError(response.data.error.detail, 5000);
          this.modalController.dismiss({ patient: this.patient });
        }
      }, error =>{
        this.updating = false;
        this.loading = false;
        this.notificationService.showError('Error updating users.', 5000);
        this.modalController.dismiss({ patient: this.patient });
      });
    });
  }

  addRequest() {
    setTimeout(() => {
      const element = document.getElementById('commnets-container');
      if (element != null) {
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
      }
    }, 150);
  }

  clearRequest() {
    this.form.get('comment_id')?.setValue(null);
    this.form.get('comment_custom')?.setValue(null);
  }

  noCancel() {
    this.modalCancelSurgery?.dismiss();
  }

  yesCancel() {
     this.updating = true;
    this.loading = true;
    if (!this.patient.visit_canceled_at) {
      const date = new Date();
      var year = date.toLocaleString("default", { year: "numeric" });
      var month = date.toLocaleString("default", { month: "2-digit" });
      var day = date.toLocaleString("default", { day: "2-digit" });
      const formatedDate = `${year}-${month}-${day}`;
      this.patient.visit_canceled_at = formatedDate;
    } else {
      this.patient.visit_canceled_at = null;
    }
    this.modalCancelSurgery?.dismiss();
    this.storage.set('patient', this.patient);
    // const navigationBehaviorOptions: NavigationBehaviorOptions = { state: { update: true, patient: this.patient }, replaceUrl: true };
    // this.router.navigate(['/home'], navigationBehaviorOptions);
      this.requestsService.updatePatient(this.patient).then(async (response: any) => {
        this.storage.set('patient', null);
        if (response.status === 200) {
          this.updating = false;
          this.loading = false;
          this.notificationService.showInfo(response.data.message, 5000);
          this.modalController.dismiss({ patient: this.patient });
        }else{
          this.updating = false;
          this.loading = false;
          this.notificationService.showError(response.data.error.detail, 5000);
          this.modalController.dismiss({ patient: this.patient });
        }
      }, error =>{
        this.updating = false;
        this.loading = false;
        this.notificationService.showError('Error updating users.', 5000);
        this.modalController.dismiss({ patient: this.patient });
      });
  }

  cancel() {
    // this.router.navigate(['/home'], { replaceUrl: true });
    this.modalController.dismiss({ patient: this.patient });
  }

}
