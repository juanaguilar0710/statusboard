import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '../services/translate.service';

@Pipe({
  name: 'translate',
  pure: false // Impuro para detectar cambios de idioma
})
export class TranslatePipe implements PipeTransform {

  constructor(private translateService: TranslateService) {}

  transform(key: string, params?: any): string {
    if (!key) return '';

    if (params) {
      return this.translateService.get(key, params);
    }

    return this.translateService.instant(key);
  }

}
