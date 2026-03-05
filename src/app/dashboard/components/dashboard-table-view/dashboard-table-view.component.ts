import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { TranslateService } from 'src/app/services/translate.service';

@Component({
  selector: 'app-dashboard-table-view',
  templateUrl: './dashboard-table-view.component.html',
  styleUrls: [
    './dashboard-table-view.component.scss',
    '../../dashboard.component.scss',
  ],
})
export class DashboardTableViewComponent {
  @ViewChild('audio') miBoton!: ElementRef<HTMLButtonElement>;

  @Input() config: any;
  @Input() patients: any[] = [];
  @Input() currentPagePatients = 0;
  @Input() patientsPerPage = 18;
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

  getPatientDisplayName(patient: any): string {
    if (this.config?.privacy_mode) {
      const initials = this.getPatientInitials(patient.fullName);
      const externalId = this.formatExternalIdSuffix(patient.external_id);

      return `${initials} ${externalId}`;
    }
    return patient.fullName;
  }

  getPatientsForCurrentPage(): any[] {
    const visiblePatients = this.patients || [];
    const sortedPatients = [...visiblePatients].sort((a, b) => {
      const surgeonA = (a?.surgeon_name || '').toLowerCase();
      const surgeonB = (b?.surgeon_name || '').toLowerCase();
      return surgeonA.localeCompare(surgeonB);
    });

    const start = this.currentPagePatients * this.patientsPerPage;
    const end = start + this.patientsPerPage;
    return sortedPatients.slice(start, end);
  }
}
