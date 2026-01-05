import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { LocaldataService } from '../api/localdata.service';
import { RequestsService } from '../api/requests.service';
import { Toast } from '@capacitor/toast';
import { Storage } from '@ionic/storage-angular';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '../services/translate.service';


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

  constructor(private router: Router,
    private navController: NavController,
    private LocaldataService: LocaldataService,
    private storage: Storage,
    private fb: FormBuilder,
    public requestsService: RequestsService,
    public translate: TranslateService
  ) {
    const navParams = this.router.getCurrentNavigation()?.extras?.state;
    if (navParams) {
      this.room = (navParams as any)?.room;
      this.assignedPatients = (navParams as any)?.assignedPatients;
      this.availablePatients = (navParams as any)?.availablePatients;
    }

  }
    ngOnInit(): void {
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
  }

  // Eliminar una fila específica
  removeRole(index: number) {
    this.roles.removeAt(index);  // Remover el grupo del FormArray
  }

  // Filtrar los usuarios cuando se selecciona un rol
  onRoleChange(index: number) {
    const selectedRole = this.roles.at(index).get('roleType')?.value;
    const role = this.allUsers.find((r:any) => r.code === selectedRole);
    if (role) {
      this.filteredUsers[index] = role.persons;  // Filtrar los usuarios
    } else {
      this.filteredUsers[index] = [];
    }
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
            this.filteredUsers.push(availableUsers);
          });
        } else {
          this.roles.push(
            this.fb.group({
              roleType: [role.code, Validators.required],  // Preseleccionar el rol
              selectedUser: ['', Validators.required]  // Sin usuario seleccionado
            })
          );
          this.filteredUsers.push(availableUsers);
        }
      });
      this.filteredUsers = this.filteredUsers.map(group => group.sort((a:any, b:any) => a.full_name.localeCompare(b.full_name)));
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

  // Construir roles nuevos desde formulario
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

  // Verificamos si roles cambiaron
  const roomChanged = this.rolesChanged(this.originalRoom, { ...(this.originalRoom || {}), roles: rolesToUpdate });

  // Detectamos cambios en pacientes asignados
  const patientDiff = this.getPatientChanges(this.originalAssignedPatients, this.assignedPatients);
  const updatedPatients = this.getUpdatedPatients(this.originalAssignedPatients, this.assignedPatients);

  // Si no hay cambios, salir rápido
  if (!roomChanged && patientDiff.added.length === 0 && patientDiff.removed.length === 0 && updatedPatients.length === 0) {
    this.showToast(this.translate.instant('editRoom.noChanges'));
    this.loading = false;
    return;
  }

  // Actualizar sala solo si cambió
  if (roomChanged) {
    this.room.roles = rolesToUpdate;
    const response = await this.requestsService.updateWaitingRoom(this.room);
    if (response.status !== 200) {
      this.showToast(this.translate.instant('editRoom.updateRoomFailed'));
      this.loading = false;
      return;
    }
    // Actualizar copia original
    this.originalRoom = JSON.parse(JSON.stringify(this.room));
  }

  // Actualizar pacientes solo si hubo cambios
  if (patientDiff.added.length || patientDiff.removed.length || updatedPatients.length) {
    // 🔄 Crear estructura correcta para la API
    const addPatientsPayload = patientDiff.added.map((id: any) => ({ id: Number(id) }));
    const removePatientsPayload = patientDiff.removed.map((id: any) => ({ id: Number(id) }));

    console.log('📤 Enviando datos de pacientes:', {
      add_patients: addPatientsPayload,
      remove_patients: removePatientsPayload
    });

    const response = await this.requestsService.assignPatients(this.room.id, addPatientsPayload, removePatientsPayload);
    if (response.status === 200) {
      // Actualizar pacientes internos
      this.patients = [...this.assignedPatients, ...this.availablePatients];

      updatedPatients.forEach(p => {
        const index = this.patients.findIndex(pt => pt.id === p.id);
        if (index > -1) {
          this.patients[index].operating_room_id = p.operating_room_id;
          this.patients[index].operating_room_name = p.operating_room_name;
        }
      });

      this.LocaldataService.setPatients(this.patients);

      // Actualizar copia original de pacientes
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

}
