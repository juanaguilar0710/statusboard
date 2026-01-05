import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TranslateService {
  private currentLang: string = 'es'; // Idioma por defecto
  private translations: any = {};
  private langChange$ = new BehaviorSubject<string>(this.currentLang);

  constructor() {
    this.loadLanguage();
  }

  /**
   * Carga el idioma guardado en Preferences
   */
  async loadLanguage(): Promise<void> {
    try {
      const response = await Preferences.get({ key: 'language' });
      if (response.value) {
        this.currentLang = response.value;
      } else {
        // Si no hay idioma guardado, usar español por defecto
        this.currentLang = 'es';
        await this.setLanguage('es');
      }
      await this.loadTranslations(this.currentLang);
      this.langChange$.next(this.currentLang);
    } catch (error) {
      console.error('Error loading language:', error);
      this.currentLang = 'es';
      await this.loadTranslations('es');
    }
  }

  /**
   * Carga las traducciones del idioma especificado
   */
  private async loadTranslations(lang: string): Promise<void> {
    try {
      const response = await fetch(`assets/i18n/${lang}.json`);
      this.translations = await response.json();
    } catch (error) {
      console.error(`Error loading translations for ${lang}:`, error);
      this.translations = {};
    }
  }

  /**
   * Cambia el idioma actual
   */
  async setLanguage(lang: string): Promise<void> {
    this.currentLang = lang;
    await Preferences.set({ key: 'language', value: lang });
    await this.loadTranslations(lang);
    this.langChange$.next(lang);
  }

  /**
   * Obtiene el idioma actual
   */
  getCurrentLanguage(): string {
    return this.currentLang;
  }

  /**
   * Observable para detectar cambios de idioma
   */
  onLangChange(): Observable<string> {
    return this.langChange$.asObservable();
  }

  /**
   * Obtiene una traducción por su clave
   * Soporta navegación por puntos: 'configuration.title'
   */
  instant(key: string): string {
    if (!key) return '';

    const keys = key.split('.');
    let value = this.translations;

    for (const k of keys) {
      if (value && value[k]) {
        value = value[k];
      } else {
        // Si no encuentra la traducción, devuelve la clave
        return key;
      }
    }

    return typeof value === 'string' ? value : key;
  }

  /**
   * Obtiene una traducción con parámetros
   * Ejemplo: translate.get('welcome.message', { name: 'Juan' })
   */
  get(key: string, params?: any): string {
    let translation = this.instant(key);

    if (params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(`{{${param}}}`, params[param]);
      });
    }

    return translation;
  }

  /**
   * Verifica si existe una traducción para la clave
   */
  hasTranslation(key: string): boolean {
    return this.instant(key) !== key;
  }
}
