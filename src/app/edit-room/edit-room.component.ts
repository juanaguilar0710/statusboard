import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, NavController } from '@ionic/angular';
import { LocaldataService } from '../api/localdata.service';
import { RequestsService } from '../api/requests.service';
import { Toast } from '@capacitor/toast';
import { Storage } from '@ionic/storage-angular';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '../services/translate.service';
import { AddMemberModalComponent } from '../add-member-modal/add-member-modal.component';


@Component({
  selector: 'app-edit-room',
  templateUrl: './edit-room.component.html',
  styleUrls: ['./edit-room.component.scss'],
})


export class EditRoomComponent implements OnInit {
  room: any;
  patients: any[] = [];
  color: string = '#007AFF';
  assignedPatients: any[] = [];
  availablePatients: any[] = [];
  patientsToUpdate: any[] = [];
  loading: boolean = false;

  roleForm!: FormGroup;

  allUsers:any;
  selectedRoles: any[] = [];
  filteredUsers: any[] = [];

  userSearchTexts: string[] = [];
  userSearchLoading: boolean[] = [];
  showUserDropdown: boolean[] = [];
  private userSearchTimers: { [index: number]: any } = {};
  private readonly USER_SEARCH_DEBOUNCE_MS = 350;

  constructor(private router: Router,
    private navController: NavController,
    private LocaldataService: LocaldataService,
    private storage: Storage,
    private fb: FormBuilder,
    public requestsService: RequestsService,
    public translate: TranslateService,
    private modalController: ModalController,
    private cdr: ChangeDetectorRef
  ) {
    const navParams = this.router.getCurrentNavigation()?.extras?.state;
    if (navParams) {
      this.room = (navParams as any)?.room;
      this.assignedPatients = (navParams as any)?.assignedPatients;
      this.availablePatients = (navParams as any)?.availablePatients;
    }

  }
    ngOnInit(): void {
      this.getrolesDinamico();
  }

  getrolesDinamico(){
    setTimeout(() => {
      this.getAllUsersSelectsRolRoom();
      this.roleForm = this.fb.group({
        roles: this.fb.array([])  // Array dinámico de roles
      });

      this.originalRoom = JSON.parse(JSON.stringify(this.room));
      this.originalAssignedPatients = JSON.parse(JSON.stringify(this.assignedPatients));
    }, 300);

  }


  // Obtener el FormArray de roles
  get roles(): FormArray {
    return this.roleForm.get('roles') as FormArray;
  }

  // Compara roles de la sala (array pequeño, stringify es aceptable)
rolesChanged(originalRoom: any, newRoom: any): boolean {
  return JSON.stringify(originalRoom.roles) !== JSON.stringify(newRoom.roles);
}

// Detecta pacientes agregados y removidos por ID
getPatientChanges(originalList: any[], newList: any[]) {
  const originalIds = originalList.map(p => p.id);
  const newIds = newList.map(p => p.id);

  const added = newIds.filter(id => !originalIds.includes(id));
  const removed = originalIds.filter(id => !newIds.includes(id));

  return { added, removed };
}

// Detecta pacientes con cambio en operating_room_id
getUpdatedPatients(original: any[], current: any[]) {
  return current.filter(p => {
    const old = original.find(o => o.id === p.id);
    return old && old.operating_room_id !== p.operating_room_id;
  });
}

  // Añadir una nueva fila de selección de rol y usuario
  addRole() {
    const roleGroup = this.fb.group({
      roleType: ['', Validators.required],  // FormControl para el tipo de rol
      selectedUser: ['', Validators.required]  // FormControl para el usuario seleccionado
    });
    this.roles.push(roleGroup);  // Añadir el grupo al FormArray

    const index = this.roles.length - 1;
    this.filteredUsers[index] = [];
    this.userSearchTexts[index] = '';
    this.userSearchLoading[index] = false;
    this.showUserDropdown[index] = false;
  }

  // Eliminar una fila específica
  removeRole(index: number) {
    this.roles.removeAt(index);  // Remover el grupo del FormArray
    this.filteredUsers.splice(index, 1);
    this.userSearchTexts.splice(index, 1);
    this.userSearchLoading.splice(index, 1);
    this.showUserDropdown.splice(index, 1);
    if (this.userSearchTimers[index]) {
      clearTimeout(this.userSearchTimers[index]);
      delete this.userSearchTimers[index];
    }
  }

  openUserDropdown(index: number) {
    this.showUserDropdown[index] = true;
  }

  closeUserDropdown(index: number) {
    this.showUserDropdown[index] = false;
  }

  closeUserDropdownDelayed(index: number) {
    // Permite que el click sobre una opción ocurra antes de cerrar.
    setTimeout(() => this.closeUserDropdown(index), 150);
  }

  selectUser(index: number, person: any) {
    this.roles.at(index).get('selectedUser')?.setValue(person?.id ?? '');
    this.userSearchTexts[index] = person?.full_name ?? '';
    this.closeUserDropdown(index);
  }

  // Filtrar los usuarios cuando se selecciona un rol
  onRoleChange(index: number) {
    const selectedRole = this.roles.at(index).get('roleType')?.value;
    const role = this.allUsers.find((r:any) => r.code === selectedRole);

    // Reset de selección/criterio cuando cambia el rol
    this.roles.at(index).get('selectedUser')?.setValue('');
    this.userSearchTexts[index] = '';
    this.showUserDropdown[index] = false;

    if (!role) {
      this.filteredUsers[index] = [];
      return;
    }

    // Cargar primeros resultados (sin búsqueda) para el rol
    this.fetchUsersForRole(index, role.id, '');
  }

  onUserSearchTextChange(index: number, text: string) {
    this.userSearchTexts[index] = text;

    // Si el usuario escribe, invalidar selección anterior.
    this.roles.at(index).get('selectedUser')?.setValue('');

    const selectedRoleCode = this.roles.at(index).get('roleType')?.value;
    const role = this.allUsers?.find((r: any) => r.code === selectedRoleCode);
    if (!role) {
      this.filteredUsers[index] = [];
      return;
    }

    if (this.userSearchTimers[index]) {
      clearTimeout(this.userSearchTimers[index]);
    }

    const searchText = (text || '').trim();
    this.userSearchTimers[index] = setTimeout(() => {
      this.fetchUsersForRole(index, role.id, searchText);
    }, this.USER_SEARCH_DEBOUNCE_MS);
  }

  private getWaitingRoomIdForSearch(): number {
    const id = this.requestsService?.config?.waitingRoom?.id ?? this.room?.waiting_room_id;
    return Number(id);
  }

  private fetchUsersForRole(index: number, roleId: number, searchText: string) {
    const waitingRoomId = this.getWaitingRoomIdForSearch();
    this.userSearchLoading[index] = true;

    const existing = Array.isArray(this.filteredUsers[index]) ? this.filteredUsers[index] : [];
    const selectedUserId = this.roles.at(index).get('selectedUser')?.value;
    const selectedUserObj = selectedUserId ? existing.find((u: any) => String(u?.id) === String(selectedUserId)) : null;

    this.requestsService.searchOperatingRoomUsers({
      roleId,
      waitingRoomId,
      search: searchText,
      perPage: 20,
      orderBy: 'name',
      direction: 'asc'
    }).subscribe((resp: any) => {
      const raw = resp?.data;
      let users: any[] = [];

      if (Array.isArray(raw)) {
        users = raw;
      } else if (Array.isArray(raw?.data)) {
        users = raw.data;
      } else if (Array.isArray(raw?.items)) {
        users = raw.items;
      }

      // Asegurar que el seleccionado actual esté en el listado (si no viene en el top 20)
      if (selectedUserObj && !users.some((u: any) => String(u?.id) === String(selectedUserId))) {
        users = [selectedUserObj, ...users];
      }

      this.filteredUsers[index] = users;
      this.userSearchLoading[index] = false;
      this.cdr.detectChanges();
    }, _error => {
      this.filteredUsers[index] = selectedUserObj ? [selectedUserObj] : [];
      this.userSearchLoading[index] = false;
      this.cdr.detectChanges();
    });
  }

  initializeRoles() {
    if (this.allUsers && this.allUsers.length > 0) {
      this.allUsers.forEach((role:any, index:any) => {
        this.roles.push(
          this.fb.group({
            roleType: [role.code, Validators.required],  // Preseleccionar el rol
            selectedUser: ['', Validators.required]  // Dejar el usuario vacío
          })
        );
        this.filteredUsers.push([]);  // Inicializar el array para los usuarios filtrados vacío

        // Llamar a onRoleChange para cada fila recién creada
        this.onRoleChange(index);
      });
    } else {
      console.error('allUsers no está definido o no tiene roles disponibles.');
    }
  }

  getAllUsersSelectsRolRoom() {
    this.loading = true;
    this.requestsService.getOperatingRoomWithUsers(this.room.id).subscribe(resp => {
      this.allUsers = resp.data.data;
      this.getUsersAsociatedAtRolSelect();
      this.loading = false;
    }, error => {
      console.log(error);
      this.loading = false;
    });
  }

  getUsersAsociatedAtRolSelect() {
    this.loading = true;
    this.requestsService.getOperatingRoomWithRolesUsers(this.room.id).subscribe(resp => {
      this.roles.clear();
      this.filteredUsers = [];
      this.userSearchTexts = [];
      this.userSearchLoading = [];
      this.showUserDropdown = [];

      resp.data.data.roles.forEach((role:any) => {
        const availableUsers = this.allUsers.find((item: any) => item.id === role.id)?.persons || [];
        if (role.persons.length > 0) {
          role.persons.forEach((person:any) => {
            this.roles.push(
              this.fb.group({
                roleType: [role.code, Validators.required],  // Preseleccionar el rol
                selectedUser: [person.id, Validators.required]  // Preseleccionar el usuario
              })
            );
            // Inicialmente incluir el usuario seleccionado para que el select lo muestre.
            this.filteredUsers.push([person]);
            this.userSearchTexts.push(person?.full_name ?? '');
            this.userSearchLoading.push(false);
            this.showUserDropdown.push(false);

            const rowIndex = this.roles.length - 1;
            this.fetchUsersForRole(rowIndex, role.id, '');
          });
        } else {
          this.roles.push(
            this.fb.group({
              roleType: [role.code, Validators.required],  // Preseleccionar el rol
              selectedUser: ['', Validators.required]  // Sin usuario seleccionado
            })
          );
          this.filteredUsers.push([]);
          this.userSearchTexts.push('');
          this.userSearchLoading.push(false);
          this.showUserDropdown.push(false);

          const rowIndex = this.roles.length - 1;
          this.fetchUsersForRole(rowIndex, role.id, '');
        }
      });

      this.loading = false;
    }, error => {
      console.log(error);
      this.loading = false;
    });
  }

  cancel() {
    this.navController.navigateForward(['/home'], { replaceUrl: true });
  }

  originalRoom = null;
originalAssignedPatients = [];


async update() {
  this.loading = true;
  const rolesMap: any = {};
  this.roles.controls.forEach((roleControl) => {
    const roleType = roleControl.get('roleType')?.value;
    const selectedUser = roleControl.get('selectedUser')?.value;
    const role = this.allUsers.find((r: any) => r.code === roleType);
    if (role && selectedUser) {
      if (rolesMap[role.id]) {
        rolesMap[role.id].persons.push({ id: selectedUser });
      } else {
        rolesMap[role.id] = {
          id: role.id,
          persons: [{ id: selectedUser }]
        };
      }
    }
  });

  const rolesToUpdate = Object.values(rolesMap);
  const roomChanged = this.rolesChanged(this.originalRoom, { ...(this.originalRoom || {}), roles: rolesToUpdate });
  const patientDiff = this.getPatientChanges(this.originalAssignedPatients, this.assignedPatients);
  const updatedPatients = this.getUpdatedPatients(this.originalAssignedPatients, this.assignedPatients);
  if (!roomChanged && patientDiff.added.length === 0 && patientDiff.removed.length === 0 && updatedPatients.length === 0) {
    this.showToast(this.translate.instant('editRoom.noChanges'));
    this.loading = false;
    return;
  }

  if (roomChanged) {
    this.room.roles = rolesToUpdate;
    const response = await this.requestsService.updateWaitingRoom(this.room);
    if (response.status !== 200) {
      this.showToast(this.translate.instant('editRoom.updateRoomFailed'));
      this.loading = false;
      return;
    }
    this.originalRoom = JSON.parse(JSON.stringify(this.room));
  }

  if (patientDiff.added.length || patientDiff.removed.length || updatedPatients.length) {
    const addPatientsPayload = patientDiff.added.map((id: any) => ({ id: Number(id) }));
    const removePatientsPayload = patientDiff.removed.map((id: any) => ({ id: Number(id) }));

    console.log('📤 Enviando datos de pacientes:', {
      add_patients: addPatientsPayload,
      remove_patients: removePatientsPayload
    });

    const response = await this.requestsService.assignPatients(this.room.id, addPatientsPayload, removePatientsPayload);
    if (response.status === 200) {
      this.patients = [...this.assignedPatients, ...this.availablePatients];
      updatedPatients.forEach(p => {
        const index = this.patients.findIndex(pt => pt.id === p.id);
        if (index > -1) {
          this.patients[index].operating_room_id = p.operating_room_id;
          this.patients[index].operating_room_name = p.operating_room_name;
        }
      });
      this.LocaldataService.setPatients(this.patients);
      this.originalAssignedPatients = JSON.parse(JSON.stringify(this.assignedPatients));
    } else {
      this.showToast(this.translate.instant('editRoom.updatePatientsFailed'));
      this.loading = false;
      return;
    }
  }

  this.showToast(this.translate.instant('editRoom.changesSaved'));
  this.navController.navigateForward(['/home'], { replaceUrl: true });
  this.loading = false;
}

  async showToast(message: string) {
    await Toast.show({
      text: message,
      duration: 'long'
    });
  }

  moveToAssigned(index: number) {
    let patient = this.availablePatients.splice(index, 1)[0];
    this.patientsToUpdate.push({
      id: patient.id,
      operating_room_id: this.room.id,
      operating_room_name: this.room.name
    });
    this.assignedPatients.push(patient);
  }

  moveToAvailable(index: number) {
    let patient = this.assignedPatients.splice(index, 1)[0];
    this.patientsToUpdate.push({
      id: patient.id,
      operating_room_id: null,
      operating_room_name: null
    });
    this.availablePatients.push(patient);
  }

  async openAssignMemberModal() {
    const modal = await this.modalController.create({
      component: AddMemberModalComponent,
      cssClass: 'add-member-modal',
      componentProps: {
        roomId: this.room.id
      }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data && data.saved) {
      this.getAllUsersSelectsRolRoom();
      setTimeout(() => {
        this.roles.controls.forEach((roleControl, index) => {
          this.onRoleChange(index);
        });
      }, 1000);
      this.showToast('Miembro agregado exitosamente');
    }
  }

}
