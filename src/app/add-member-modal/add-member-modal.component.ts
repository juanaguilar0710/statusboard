import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalController, IonicModule } from '@ionic/angular';
import { RequestsService } from '../api/requests.service';
import { TranslateService } from '../services/translate.service';
import { Toast } from '@capacitor/toast';
import { CommonModule } from '@angular/common';
import { NgxColorsModule } from 'ngx-colors';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-add-member-modal',
  templateUrl: './add-member-modal.component.html',
  styleUrls: ['./add-member-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule, NgxColorsModule, SharedModule]
})
export class AddMemberModalComponent implements OnInit {
  @Input() roomId!: number;
  memberForm!: FormGroup;
  roles: any[] = [];
  loading: boolean = false;

  constructor(
    private modalController: ModalController,
    private fb: FormBuilder,
    private requestsService: RequestsService,
    public translate: TranslateService
  ) {}

  ngOnInit() {
    console.log('AddMemberModal ngOnInit - roomId:', this.roomId);

    this.memberForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      role: ['', Validators.required],
      color: ['#4caf50', Validators.required]
    });

    console.log('Form created:', this.memberForm);

    // Cargar roles disponibles
    this.loadRoles();
  }

  loadRoles() {
    console.log('loadRoles called with roomId:', this.roomId);
    this.loading = true;
    this.requestsService.getOperatingRoomWithUsers(this.roomId).subscribe(resp => {
      console.log('Roles loaded:', resp.data.data);
      this.roles = resp.data.data || [];
      this.loading = false;
    }, error => {
      console.log('Error cargando roles:', error);
      // Usar roles de ejemplo si falla
      this.roles = [
        { id: 1, code: 'ANEST', name: 'Anestesiólogo' },
        { id: 2, code: 'CIR', name: 'Cirujano' },
        { id: 3, code: 'ENF', name: 'Enfermera' },
        { id: 4, code: 'AUX', name: 'Auxiliar' }
      ];
      this.loading = false;
    });
  }

  async cancel() {
    await this.modalController.dismiss();
  }

  async save() {
    if (this.memberForm.valid) {
      this.loading = true;

      const memberData = {
        first_name: this.memberForm.value.firstName,
        last_name: this.memberForm.value.lastName,
        roles_array: [this.memberForm.value.role],
        rooms_array: [this.roomId],
        color: this.memberForm.value.color
      };

      try {
        const response = await this.requestsService.createOperatingRoomUser(memberData);

        if (response.status === 200 || response.status === 201) {
          await this.showToast(this.translate.instant('addMember.successMessage'));
          await this.modalController.dismiss({
            saved: true,
            member: response.data
          });
        } else {
          await this.showToast(this.translate.instant('addMember.errorMessage'));
          this.loading = false;
        }
      } catch (error) {
        await this.showToast(this.translate.instant('addMember.errorMessage'));
        console.error('Error al crear miembro:', error);
        this.loading = false;
      }
    } else {
      await this.showToast(this.translate.instant('addMember.completeFields'));
    }
  }

  async showToast(message: string) {
    await Toast.show({
      text: message,
      duration: 'long'
    });
  }
}
