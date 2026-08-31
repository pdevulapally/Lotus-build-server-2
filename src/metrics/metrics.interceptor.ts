import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const end = this.metrics.httpRequestDuration.startTimer();
    return next.handle().pipe(
      tap({
        finalize: () => {
          end({
            method: request.method,
            route: request.route?.path ?? request.path,
            status: String(response.statusCode),
          });
        },
      }),
    );
  }
}
