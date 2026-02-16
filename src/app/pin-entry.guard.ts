import { Injectable } from '@angular/core';
import { CanActivate, CanLoad, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { LocaldataService } from './api/localdata.service';

@Injectable({
  providedIn: 'root'
})
export class PinEntryGuard implements CanActivate, CanLoad {
  constructor(
    private localdataService: LocaldataService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean | UrlTree> {
    return this.resolveNavigation();
  }

  async canLoad(route: Route, segments: UrlSegment[]): Promise<boolean | UrlTree> {
    return this.resolveNavigation();
  }

  private async resolveNavigation(): Promise<boolean | UrlTree> {
    try {
      const config = await this.localdataService.getConfiguration();

      if (!config) {
        return this.router.parseUrl('/login');
      }

      const appMode = String(config.aplication ?? '');
      if (appMode === '2' || appMode === '3') {
        return this.router.parseUrl('/dashboard');
      }

      return true;
    } catch {
      return this.router.parseUrl('/login');
    }
  }
}