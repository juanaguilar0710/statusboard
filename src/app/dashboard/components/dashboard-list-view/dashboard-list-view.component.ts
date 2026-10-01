import { Component, Input } from '@angular/core';
import { TranslateService } from 'src/app/services/translate.service';

@Component({
  standalone: false,
selector: 'app-dashboard-list-view',
  templateUrl: './dashboard-list-view.component.html',
  styleUrls: [
    './dashboard-list-view.component.scss',
    '../../dashboard.component.scss',
  ],
})
export class DashboardListViewComponent {
  @Input() config: any;
  @Input() rooms: any[] = [];
  @Input() pageSize = 0;
  @Input() currentGroups: { [key: string]: number } = {};
  @Input() isPatientUpdated: (patientId: number) => boolean = () => false;

  constructor(public translate: TranslateService) {}

  private formatExternalIdSuffix(externalId: any): string {
    if (externalId === null || externalId === undefined || externalId === '') return '';
    const raw = String(externalId);
    const digits = raw.replace(/\D/g, '');
    const base = digits.length > 0 ? digits : raw;
    const last6 = base.slice(-6);
    return last6 ? ` (${last6})` : '';
  }

  getAgeSuffix(): string {
    return this.translate.getCurrentLanguage() === 'en' ? 'y' : 'a';
  }

  getPatientInitials(fullName: string): string {
    if (!fullName) return '';
    return fullName
      .split(' ')
      .filter((word: string) => word.length > 0)
      .map((word: string) => word.charAt(0).toUpperCase())
      .join('');
  }

  getPatientDisplayNameWithAge(patient: any): string {
    let age = `(${patient.age}${this.getAgeSuffix()}) `;
    age = patient.age ? age : '';
    if (this.config?.privacy_mode) {
      const initials = this.getPatientInitials(patient.fullName);
      const externalId = this.formatExternalIdSuffix(patient.external_id);

      return `${age}${initials}${externalId}`;
    }
    return `${age}${patient.fullName}`;
  }

  getPatientsGroup(room: any): any[] {
    const patientsInRoom = room?.patients || [];
    if (!patientsInRoom.length || !this.pageSize) return patientsInRoom;

    const currentGroup = this.currentGroups[room.name] || 0;
    const start = currentGroup * this.pageSize;
    const end = start + this.pageSize;

    if (patientsInRoom.length <= this.pageSize) {
      return patientsInRoom;
    }

    return patientsInRoom.slice(start, end);
  }

  getRoomPageLabel(room: any): string {
    if (!room?.patients?.length || !this.pageSize) return '';

    const totalPages = Math.ceil(room.patients.length / this.pageSize);
    if (totalPages <= 1) return '';

    const currentGroup = this.currentGroups[room.name] || 0;
    return `${currentGroup + 1}/${totalPages}`;
  }
}
