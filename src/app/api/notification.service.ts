import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private customSound: HTMLAudioElement | null = null;

  constructor(private toastr: ToastrService) {
    // Cargar sonido personalizado (opcional)
    this.customSound = new Audio('assets/audio/SoundNotification.mp3');
  }

  private playCustomSound() {
    if (this.customSound) {
      this.customSound.currentTime = 0; // Reiniciar
      this.customSound.play().catch(err => console.log('Error reproduciendo sonido:', err));
    }
  }

  // 🔊 Control de sonido
  enableSound() {
    if (!this.customSound) {
      this.customSound = new Audio('assets/audio/SoundNotification.mp3');
    }
  }

  disableSound() {
    this.customSound = null;
  }

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
  // Reproducir sonido personalizado si está habilitado
  this.playCustomSound();

  this.toastr.success(message, '', {
    timeOut: duration,
    positionClass: 'toast-container-event', // 👈 usar contenedor especial
    toastClass: 'custom-SuccessToastEvent',
    closeButton: false,
    progressBar: true,
    tapToDismiss: true,
    progressAnimation: 'increasing',
    enableHtml: true
  });
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
