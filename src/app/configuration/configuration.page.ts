import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { RequestsService } from '../api/requests.service';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { AlertController } from '@ionic/angular';
import { LoggerService } from '../api/logger.service';
import { TranslateService } from '../services/translate.service';

@Component({
  selector: 'app-configuration',
  templateUrl: './configuration.page.html',
  styleUrls: ['./configuration.page.scss'],
})
export class ConfigurationPage implements OnInit {

  branches: any;
  waiting_rooms: any[] = [];
  selectedBranchName: string = '';
  selectedWaitingRoomName: string = '';
  stationTypes = [{
    id: 1,
    name: 'OR Controller'
  }, {
    id: 2,
    name: 'OR Dashboard'
  }]

  selectedApplication: string = '';
  selectedStatus: any;
  selectedLanguage: string = 'es';
  translations: any = {};

  turnOnTime: string = '';
  turnOffTime: string = '';
  formattedTime: string = '';

  statuses: any;

  form: FormGroup = this._formbuilder.group({
    branch: [null], // Ya no es requerido, se toma de la autenticación
    waitingRoom: [null, [Validators.required]],
    stationName: [null, [Validators.required]],
    stationType: ["OR Controller"],
    aplication: [null, [Validators.required]],
    statuses: [null],
    turnOnTime: [null],
    turnOffTime: [null],
  }, { validators: this.statusRequiredValidator.bind(this) });

  // Validador personalizado para requerir al menos un estado cuando no es Tablet
  statusRequiredValidator(control: AbstractControl): ValidationErrors | null {
    const aplication = control.get('aplication')?.value;
    const statuses = control.get('statuses')?.value;

    // Si la aplicación no es "1" (Tablet) y no hay estados seleccionados
    if (aplication !== '1' && aplication !== null && (!statuses || statuses.length === 0)) {
      return { statusRequired: true };
    }

    return null;
  }

 constructor(private _formbuilder: FormBuilder,
    private alertController: AlertController,
    private requestsService: RequestsService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private router: Router,
    public translate: TranslateService) {
    // Ya no necesitamos listener del branch - se lee de la autenticación
  }

  async ngOnInit() {
    // Cargar idioma guardado
    await this.translate.loadLanguage();
    this.selectedLanguage = this.translate.getCurrentLanguage();

    // Suscribirse a cambios de idioma
    this.translate.onLangChange().subscribe(lang => {
      this.selectedLanguage = lang;
      this.cdr.detectChanges();
    });

    const configResponse = await Preferences.get({ key: 'config' });
    if (configResponse.value) {
      const objResponse = JSON.parse(configResponse.value);
      this.form.patchValue(objResponse);

      // if (objResponse.aplication === "2" || objResponse.aplication === "3") {
      //   objResponse.token = this.requestsService.getToken();
      //   this.router.navigate(['/dashboard'], { replaceUrl: true });
      //   return;
      // }
    }

    const waitingRoomsResponse = await Preferences.get({ key: 'waiting_rooms' });
    if (waitingRoomsResponse.value) {
      const waitingRooms = JSON.parse(waitingRoomsResponse.value);
      this.waiting_rooms = waitingRooms
        .filter((room: any) => room.program === "status_board")
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      // Auto-seleccionar waiting room si solo hay una
      if (this.waiting_rooms.length === 1) {
        this.selectedWaitingRoomName = this.waiting_rooms[0].name;
        this.form.patchValue({
          waitingRoom: this.waiting_rooms[0]
        });
      }
    }

    const tempConfigString = localStorage.getItem('tempConfig');
    console.log(tempConfigString);

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
      console.log('entro sin temp config');

      await this.getBranch();
    }
  }

  async getBranch() {
    Preferences.get({ key: 'branch' }).then(async (response: any) => {
        if (response.value) {
          this.branches = [JSON.parse(response.value)];
          this.selectedBranchName = this.branches[0].name;
        }

      const authToken = this.requestsService.getToken();
      if(authToken == null){
         await this.logger.getTokenAdmin().then(token => {
            this.requestsService.setToken(token);
          });
        }

        this.requestsService.getBranchStatuses(this.branches[0].id).subscribe(resp => {
          if(resp.status != 500){
            this.statuses = resp
          }else{
            console.log(resp);
          }
      },error => {
        console.log(error);
      });
    });
  }

  async save() {
    // Agregar el branch desde la autenticación al formulario antes de guardar
    const formValue = {
      ...this.form.value,
      branch: this.branches[0] // Tomar el branch de la autenticación
    };

    await Preferences.set({
      key: 'config',
      value: JSON.stringify(formValue)
    });
    this.requestsService.setConfig(formValue);
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
    // Si cambia a Tablet (valor 1), limpiar los estados seleccionados
    if (this.selectedApplication === '1') {
      this.form.get('statuses')?.setValue(null);
    }
    // Actualizar validación del formulario
    this.form.updateValueAndValidity();
  }

  onStatusChange(event: any) {
    this.selectedStatus = event.detail.value;
    // Actualizar validación del formulario cuando cambian los estados
    this.form.updateValueAndValidity();
  }

  async onLanguageChange(event: any) {
    const lang = event.detail.value;
    await this.translate.setLanguage(lang);
    this.selectedLanguage = lang;
  }

}
