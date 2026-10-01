import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ServerClockService } from '../services/server-clock.service';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private storageInitialized = false;
  private readonly LOG_STORAGE_KEY = 'app_logs';
  private readonly TOKEN_KEY_Admin = 'auth_token_admin';
  private readonly TOKEN_EXPIRATION_KEY_Admin = 'auth_token_expiration_admin';  
  private readonly TOKEN_KEY_Pin = 'auth_token_pin';

  private readonly MAX_LOG_ENTRIES = 200;

  constructor(private storage: Storage, private serverClock: ServerClockService) {
    this.initialize();
  }

  private async initialize() {
    await this.storage.create();
    this.storageInitialized = true;
  }

  /**
   * Agrega un nuevo registro de log
   * @param action Descripción de la acción
   * @param details Objeto con detalles (opcional)
   * @param level Nivel del log (info, success, warning, error)
   */
  async addLog(action: string, details: any = {}, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    if (!this.storageInitialized) await this.initialize();
    
    const timestamp = this.serverClock.now().toISOString();
    const logEntry = {
      id: this.generateId(),
      timestamp,
      action,
      details,
      level
    };

    const currentLogs = await this.getLogs();
    currentLogs.unshift(logEntry); // Agrega al inicio

    // Mantener sólo los registros más recientes
    if (currentLogs.length > this.MAX_LOG_ENTRIES) {
      currentLogs.length = this.MAX_LOG_ENTRIES;
    }

    if(level === 'error'){
      await this.storage.set(this.LOG_STORAGE_KEY, currentLogs);
    }
  }

  /**
   * Obtiene todos los logs almacenados
   */
  async getLogs(): Promise<any[]> {
    if (!this.storageInitialized) await this.initialize();
    return (await this.storage.get(this.LOG_STORAGE_KEY)) || [];
  }

  /**
   * Limpia todos los registros de logs
   */
  async clearLogs(): Promise<void> {
    if (!this.storageInitialized) await this.initialize();
    await this.storage.set(this.LOG_STORAGE_KEY, []);
  }

  /**
   * Filtra logs por nivel
   * @param level Nivel a filtrar
   */
  async getLogsByLevel(level: string): Promise<any[]> {
    const logs = await this.getLogs();
    return logs.filter(log => log.level === level);
  }

  // Métodos auxiliares privados
  private generateId(): string {
    return this.serverClock.nowMs().toString(36) + Math.random().toString(36).substring(2);
  }

  async setTokenAdmin(token: string, expiresIn: number): Promise<void> {
    if (!this.storageInitialized) await this.initialize();
  
    await this.storage.set(this.TOKEN_KEY_Admin, token);
    
    const expiresAt = this.serverClock.nowMs() + (expiresIn * 1000);
    await this.storage.set(this.TOKEN_EXPIRATION_KEY_Admin, expiresAt);
  }

  async isAdminTokenValid(): Promise<boolean> {
    const expiresAt = await this.storage.get(this.TOKEN_EXPIRATION_KEY_Admin);
    if (!expiresAt) return false;
    const currentTime = this.serverClock.nowMs();
    const timeLeft = expiresAt - currentTime;
    return timeLeft > 60000;
  }

  async getTokenAdmin(): Promise<string | null> {
    if (!this.storageInitialized) await this.initialize();
    return await this.storage.get(this.TOKEN_KEY_Admin);
  }

  async setTokenPin(token: string): Promise<void> {
    if (!this.storageInitialized) await this.initialize();
    await this.storage.set(this.TOKEN_KEY_Pin, token);
  }

  async getTokenPin(): Promise<string | null> {
    if (!this.storageInitialized) await this.initialize();
    return await this.storage.get(this.TOKEN_KEY_Pin);
  }

  async clearAdminAuthData(): Promise<void> {
  await this.storage.remove(this.TOKEN_KEY_Admin);
  await this.storage.remove(this.TOKEN_KEY_Pin);
  await this.storage.remove(this.TOKEN_EXPIRATION_KEY_Admin);
}

  /**
   * Métodos específicos para cada nivel
   */
  async info(action: string, details: any = {}) {
    //await this.addLog(action, details, 'info');
  }

  async success(action: string, details: any = {}) {
    //await this.addLog(action, details, 'success');
  }

  async warning(action: string, details: any = {}) {
    //await this.addLog(action, details, 'warning');
  }

  async error(action: string, details: any = {}) {
    await this.addLog(action, details, 'error');
  }
}
