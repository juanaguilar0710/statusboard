import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { LocaldataService } from '../api/localdata.service';
import { RequestsService } from '../api/requests.service';
import { Toast } from '@capacitor/toast';
import { Storage } from '@ionic/storage-angular';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';


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
    public requestsService: RequestsService
  ) {
    const navParams = this.router.getCurrentNavigation()?.extras?.state;
    if (navParams) {
      this.room = (navParams as any)?.room;
      this.assignedPatients = (navParams as any)?.assignedPatients;
      this.availablePatients = (navParams as any)?.availablePatients;
    }

  }
  ngOnInit(): void { 
    this.getAllUsersSelectsRolRoom();
    this.roleForm = this.fb.group({
      roles: this.fb.array([])  // Array dinámico de roles
    });
  }

  // Obtener el FormArray de roles
  get roles(): FormArray {
    return this.roleForm.get('roles') as FormArray;
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
  
      this.loading = false;
    }, error => {
      console.log(error);
      this.loading = false;
    });
  }

  cancel() {
    this.navController.navigateForward(['/home'], { replaceUrl: true });
  }

  async update() {
    this.loading = true;   
    const rolesMap:any = {};
    this.roles.controls.forEach((roleControl, index) => {
      const roleType = roleControl.get('roleType')?.value;
      const selectedUser = roleControl.get('selectedUser')?.value;
      const role = this.allUsers.find((r:any) => r.code === roleType);  
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
    this.room.roles = rolesToUpdate;    
    const room = this.room;
    await this.requestsService.updateWaitingRoom(room).then(async (response: any) => {
      if (response.status === 200) {
        this.LocaldataService.getOperatingRooms().then((rooms: any) => {
          const index = rooms.findIndex((r: any) => r.id === room.id);
          rooms[index] = room;
        });
      }
    });
    let assignedIds: any = [];
    let toBeRemovedIds: any = [];
    this.assignedPatients.forEach((p: any) => {
      assignedIds.push({ id: p.id });
    });
    this.availablePatients.forEach((p: any) => {
      toBeRemovedIds.push({ id: p.id });
    });
    await this.requestsService.assignPatients(room.id, assignedIds, toBeRemovedIds).then(async (response: any) => {
      if (response.status === 200) {
        this.patients = [...this.assignedPatients, ...this.availablePatients];
        this.patientsToUpdate.forEach((p: any) => {
          const index = this.patients.findIndex((pt: any) => pt.id === p.id);
          this.patients[index].operating_room_id = p.operating_room_id;
          this.patients[index].operating_room_name = p.operating_room_name;
        });
        this.LocaldataService.setPatients(this.patients);
        this.LocaldataService.getOperatingRooms().then((rooms: any) => {
          const index = rooms.findIndex((r: any) => r.id === room.id);
          rooms[index] = room;
          this.navController.navigateForward(['/home'], { replaceUrl: true });
          this.showToast('Patients assigned successfully');
          this.loading = false;
        });
      } else {
        this.showToast('Failed to update patients');
        this.loading = false;
      }
    }, (error: any) => {
      this.showToast('Failed to update patients');
      this.loading = false;
    });
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
