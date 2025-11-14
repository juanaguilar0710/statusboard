import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  constructor(private toastr: ToastrService) {}

  private showToast(message: string, duration: number, toastClass: string, toastType: 'success' | 'info' | 'warning' | 'error') {
    this.toastr[toastType](message, '', {
      timeOut: duration,
      positionClass: 'toast-top-right',
      closeButton: false,
      progressBar: true,
      tapToDismiss: true,
      progressAnimation: 'increasing',
      toastClass: toastClass,
      enableHtml: true
    });
  }

  showSuccess(message: string, duration: number) {
    this.showToast(message, duration, 'custom-SuccessToast', 'success');
  }

  showSuccessEvent(message: string, duration: number) {
    this.showToast(message, duration, 'custom-SuccessToastEvent', 'success');
  }

  showInfo(message: string, duration: number) {
    this.showToast(message, duration, 'custom-InfoToast', 'info');
  }

  showWarning(message: string, duration: number) {
    this.showToast(message, duration, 'custom-WarningToast', 'warning');
  }

  showError(message: string, duration: number) {
    this.showToast(message, duration, 'custom-ErrorToast', 'error');
  }
    
}