import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { LocaldataService } from '../api/localdata.service';
import { RequestsService } from '../api/requests.service';
import { Toast } from '@capacitor/toast';
import { Storage } from '@ionic/storage-angular';

export interface roles {
  id: number,
  person: {
    id: number
  }
}

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

  surgeons: any = [];
  ort: any = [];
  anesthesiologists: any[] = [];
  rn: any = [];
  rna: any = [];

  surgeon:any = 'Dr.lopez';
  surgeonid = 0;
  ortid = 0;
  rnid = 0;
  rnaid = 0;
  
  roles: roles = { id: 0, person: { id: 0 } };
  rolesObj: any[] = [];

  
  constructor(private router: Router,
    private navController: NavController,
    private LocaldataService: LocaldataService,
    private storage: Storage,
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
    this.getRoomUsers();
    this.getOperatingRoomWithRolesUsers();
  }

  async getRoomUsers(){
    this.loading = true;
    this.storage.get('OperatingRoomWithUsers').then(resp => {
      this.surgeons = resp.data.data.find((item:any) => item.id === 1);      
      this.surgeons.staff.sort((a: any, b: any) => {return a.full_name.localeCompare(b.full_name);});
      this.ort = resp.data.data.find((item:any) => item.id === 2);
      this.rn = resp.data.data.find((item:any) => item.id === 4);
      this.rna = resp.data.data.find((item:any) => item.id === 6);
      this.anesthesiologists = resp.data.data.find((item:any) => item.id === 7);   
      this.loading = false;    
    },error => {
      console.log(error); 
      this.loading = false;     
    })      
  }

  // async getRoomUsers(){
  //   this.loading = true;
  //   await this.requestsService.getOperatingRoomWithUsers(this.room.id).subscribe(resp => {      
  //     this.surgeons = resp.data.data.find((item:any) => item.id === 1);      
  //     this.surgeons.staff.sort((a: any, b: any) => {return a.full_name.localeCompare(b.full_name);});

  //     this.ort = resp.data.data.find((item:any) => item.id === 2);
  //     this.rn = resp.data.data.find((item:any) => item.id === 4);
  //     this.rna = resp.data.data.find((item:any) => item.id === 6);
  //     this.anesthesiologists = resp.data.data.find((item:any) => item.id === 7);   
  //     this.loading = false;    
  //   },error => {
  //     console.log(error); 
  //     this.loading = false;     
  //   })
  // }

  getOperatingRoomWithRolesUsers() {
    this.loading = true;
    this.requestsService.getOperatingRoomWithRolesUsers(this.room.id).subscribe(resp => {
      
      if (resp.data.data.roles.length > 0) {
        const surgeon = resp.data.data.roles.find((item: any) => item.id === 1);
        if (surgeon && surgeon.person) {
          this.surgeonid = surgeon.person.id;
          this.surgeon = surgeon.person;
        }

        const ort = resp.data.data.roles.find((item: any) => item.id === 2);
        if (ort && ort.person) {
          this.ortid = ort.person.id;
        }

        const rn = resp.data.data.roles.find((item: any) => item.id === 4);
        if (rn && rn.person) {
          this.rnid = rn.person.id;
        }

        const rna = resp.data.data.roles.find((item: any) => item.id === 6);
        if (rna && rna.person) {
          this.rnaid = rna.person.id;
        }
      }

      this.loading = false;
    }, error => {
      console.log(error);
      this.loading = false;
    });
}

  selectSurgeon() {
    this.surgeon = this.surgeons.staff.find((item: any) => item.id === +this.surgeonid);    
    const newRole = { id: 1, person: { id: this.surgeonid } };    
    const index = this.rolesObj.findIndex((role: any) => role.id === newRole.id);    
    if (index !== -1) {
        this.rolesObj[index] = { ...newRole };
    } else {
        this.rolesObj.push({ ...newRole });
    }
}

selectOrt() {
    const newRole = { id: 2, person: { id: this.ortid } };    
    const index = this.rolesObj.findIndex((role: any) => role.id === newRole.id);    
    if (index !== -1) {
        this.rolesObj[index] = { ...newRole };
    } else {
        this.rolesObj.push({ ...newRole });
    }
}

selectRn() {
    const newRole = { id: 4, person: { id: this.rnid } };    
    const index = this.rolesObj.findIndex((role: any) => role.id === newRole.id);    
    if (index !== -1) {
        this.rolesObj[index] = { ...newRole };
    } else {
        this.rolesObj.push({ ...newRole });
    }
}

selectRna() {
    const newRole = { id: 6, person: { id: this.rnaid } };    
    const index = this.rolesObj.findIndex((role: any) => role.id === newRole.id);    
    if (index !== -1) {
        this.rolesObj[index] = { ...newRole };
    } else {
        this.rolesObj.push({ ...newRole });
    }
}

  cancel() {
    this.navController.navigateForward(['/home'], { replaceUrl: true });
  }

  async update() {
    this.loading = true;
    this.room.roles = this.rolesObj;

    console.log('this.room',this.room);

    

    
    
    const room = this.room;
    await this.requestsService.updateWaitingRoom(room).then(async (response: any) => {
      if (response.status === 200) {
        this.LocaldataService.getOperatingRooms().then((rooms: any) => {
          const index = rooms.findIndex((r: any) => r.id === room.id);
          rooms[index] = room;
          this.LocaldataService.setOperatingRooms(rooms);
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
          this.LocaldataService.setOperatingRooms(rooms);
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
