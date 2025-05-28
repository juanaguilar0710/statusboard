import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from '../api/logger.service';

@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  constructor(private logger: LoggerService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 9);

    // Log de la petición saliente
    this.logger.addLog(`HTTP Request: ${req.method} ${req.url}`, {
      requestId,
      headers: this.sanitizeHeaders(req.headers),
      body: this.sanitizeData(req.body)
    },'info');

    return next.handle(req).pipe(
      tap(
        (event: HttpEvent<any>) => {
          if (event instanceof HttpResponse) {
            const duration = Date.now() - startTime;
            this.logger.addLog(`HTTP Response: ${req.method} ${req.url}`, {
              requestId,
              status: event.status,
              duration: `${duration}ms`,
              response: this.sanitizeData(event.body)
            },'success');
          }
        },
        (error: HttpErrorResponse) => {
          const duration = Date.now() - startTime;
          this.logger.addLog(`HTTP Error: ${req.method} ${req.url}`, {
            requestId,
            status: error.status,
            error: error.message,
            duration: `${duration}ms`,
            ...(error.error && { errorDetails: this.sanitizeData(error.error) })
          },'error');
        }
      )
    );
  }

  private sanitizeData(data: any): any {
    // Elimina datos sensibles antes de loguear
    if (!data) return null;
    const sanitized = { ...data };
    // Eliminar campos sensibles
    if (sanitized.headers?.authorization) {
      sanitized.headers.authorization = '***REDACTED***';
    }
    if (sanitized.password) {
      sanitized.password = '***REDACTED***';
    }
    if (sanitized.token) {
      sanitized.token = '***REDACTED***';
    }
    return sanitized;
  }

  private sanitizeHeaders(headers: any): any {
    const headersObj:any = {};
    headers.keys().forEach((key:any) => {
      headersObj[key] = key.toLowerCase().includes('auth') 
        ? '***REDACTED***' 
        : headers.get(key);
    });
    return headersObj;
  }
}