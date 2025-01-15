import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RequestsService } from '../api/requests.service';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-configuration',
  templateUrl: './configuration.page.html',
  styleUrls: ['./configuration.page.scss'],
})
export class ConfigurationPage implements OnInit {

  branches: any;
  waiting_rooms: any[] = [];
  stationTypes = [{
    id: 1,
    name: 'OR Controller'
  }, {
    id: 2,
    name: 'OR Dashboard'
  }]

  selectedApplication: string = '';
  selectedStatus: any;

  turnOnTime: string = '';
  turnOffTime: string = '';
  formattedTime: string = '';

  statuses: any;

  form: FormGroup = this._formbuilder.group({
    branch: [null, [Validators.required]],
    waitingRoom: [null, [Validators.required]],
    stationName: [null, [Validators.required]],
    stationType: ["OR Controller"],
    aplication: [null, [Validators.required]],
    statuses: [null],
    turnOnTime: [null],
    turnOffTime: [null],
  });

 constructor(private _formbuilder: FormBuilder,
    private alertController: AlertController,
    private requestsService: RequestsService,
    private cdr: ChangeDetectorRef,
    private router: Router) {
    this.form.get('branch')?.valueChanges.subscribe((value) => {
      if (value) {
        Preferences.get({ key: 'waiting_rooms' }).then((response: any) => {
          const waitingRooms = response.value ? JSON.parse(response.value) : [];
          const filteredWaitingRooms = waitingRooms.filter((room: any) => room.program === "status_board");
          filteredWaitingRooms.sort((a: any, b: any) => a.name.localeCompare(b.name));
          this.waiting_rooms = filteredWaitingRooms;
        });
      }
    });
  }

  async ngOnInit() {
    const configResponse = await Preferences.get({ key: 'config' });
    if (configResponse.value) {
      const objResponse = JSON.parse(configResponse.value);
      this.form.patchValue(objResponse);
  
      if (objResponse.aplication === "2" || objResponse.aplication === "3") {
        objResponse.token = this.requestsService.getToken();
        this.router.navigate(['/dashboard'], { replaceUrl: true });
        return;
      }
    }
  
    const waitingRoomsResponse = await Preferences.get({ key: 'waiting_rooms' });
    if (waitingRoomsResponse.value) {
      const waitingRooms = JSON.parse(waitingRoomsResponse.value);
      this.waiting_rooms = waitingRooms
        .filter((room: any) => room.program === "status_board")
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    }
  
    const tempConfigString = localStorage.getItem('tempConfig');
    if (tempConfigString) {
      const tempConfig = JSON.parse(tempConfigString);
      this.requestsService.setToken(tempConfig.token);
  
      await this.getBranch();
  
      const branchObj = this.branches.find((branch: any) => branch.id === tempConfig.branch.id);
      const waitingRoomObj = this.waiting_rooms.find((room: any) => room.id === tempConfig.waitingRoom.id);
  
      this.form.patchValue({
        branch: branchObj,
        stationName: tempConfig.stationName,
        aplication: tempConfig.aplication,
        statuses: tempConfig.statuses,
        waitingRoom: waitingRoomObj
      });
  
      this.selectedApplication = tempConfig.aplication;
      this.cdr.detectChanges();

    }else{
      await this.getBranch();
    }
  }

  async getBranch() {
    await Preferences.get({ key: 'branch' }).then(async (response: any) => {      
      if (response.value) {
        this.branches = [JSON.parse(response.value)];            
        this.requestsService.getBranchStatuses(this.branches[0].id).subscribe(resp => {
          if(resp.status != 500){
            this.statuses = resp.data 
          }else{
            console.log(resp);
          }
          
        },error => {
          console.log(error);
          
        });
      }
    });
  }

  async save() {
    await Preferences.set({
      key: 'config',
      value: JSON.stringify(this.form.value)
    });
    this.requestsService.setConfig(this.form.value);
    const configResponse = await Preferences.get({ key: 'config' });
    const configObject = JSON.parse(configResponse.value || '{}');
    if(configObject.aplication === "2" || configObject.aplication === "3"){
      configObject.token = this.requestsService.getToken();      
      await Preferences.set({
        key: 'config',
        value: JSON.stringify(configObject)
      });
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }else{
      this.router.navigate(['/pin'], { replaceUrl: true });
    }
  }

  async openTimeRangePicker() {
    const alert = await this.alertController.create({
      header: 'Seleccionar horas',
      inputs: [
        {
          name: 'turnOnTime',
          type: 'time',
          label: 'Encendido',
          value: this.turnOnTime,
        },
        {
          name: 'turnOffTime',
          type: 'time',
          label: 'Apagado',
          value: this.turnOffTime,
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Aceptar',
          handler: (data) => {
            this.turnOnTime = data.turnOnTime;
            this.turnOffTime = data.turnOffTime;
            this.form.get('turnOnTime')?.setValue(this.turnOnTime);
            this.form.get('turnOffTime')?.setValue(this.turnOffTime);
            this.formattedTime = `${this.convertTo12HourFormat(this.turnOnTime)}     ${this.convertTo12HourFormat(this.turnOffTime)}`;
          }
        }
      ]
    });
    alert.present();
  }

  convertTo12HourFormat(time: string): string {
    let [hour, minute] = time.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    const formattedHour = hour < 10 ? `0${hour}` : hour;
    return `${formattedHour}:${minute < 10 ? `0${minute}` : minute} ${ampm}`;
  }

  onApplicationChange(event: any) {
    this.selectedApplication = event.detail.value;
  }

  onStatusChange(event: any) {
    this.selectedStatus = event.detail.value;
  }

}
