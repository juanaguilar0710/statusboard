import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-status-buttons',
  templateUrl: './status-buttons.component.html',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./status-buttons.component.scss'],
})
export class StatusButtonsComponent  implements OnInit {
  @Input() statusList: any[] = [];
  @Input() patient: any;
  @Output() selectedStatus = new EventEmitter<any>();
  public selectedIndex = 0;

  ngOnInit(): void {
    this.updateStatus();
  }

  updateStatus() {
    console.log(this.patient);
    console.log(this.statusList);
    
    
    if (this.patient.status_Id > 0) {
      const index = this.indexFrom(this.patient.status_Id);
      if (index != -1) {
        this.selectedIndex = index;
      }
    }
  }

  updateStatusBy(status_Id:any) {
    if (status_Id > 0) {
      const index = this.indexFrom(status_Id);
      if (index != -1) {
        this.selectedIndex = index;
      }
    }
  }

  valid(index:any): boolean {
    return 0 <= index && index < this.statusList.length;
  }

  indexFrom(statusId:any): number {
    const count = this.statusList.length;
    for (var i = 0; i < count; i++) {
      if (this.statusList[i].id == statusId) {
        return i;
      }
    }
    return -1;
  }

  handle(index:any): void {
    const status = this.statusList[index];
    // this.patient.status_Id = status.id;
    this.selectedIndex = index;
    this.selectedStatus.emit(status);
  }

  getButtonClass(index: number): string {
    if (index < this.selectedIndex) {
      return 'btn-past'; // Color gris claro
    } else if (index === this.selectedIndex) {
      return 'btn-current'; // Verde oscuro
    } else {
      return 'btn-future'; // Verde claro
    }
  }

  getHtmlName(name:any): string {
    const words = name.split(" ");
    const count = words.length;
    let text = "";
    for (let i = 0; i < count; i++) {
      if (i == 0) {
        text += words[i] + " ";
      } else {
        text += words[i] + " ";
      }
    }
    return text.trim();
  }

}