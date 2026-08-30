import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface AgentEvent {
  type:
    | 'run_started'
    | 'assistant_text'
    | 'tool_call'
    | 'tool_result'
    | 'run_completed'
    | 'run_failed'
    | 'run_cancelled';
  runId: string;
  data: Record<string, unknown>;
}

@Injectable()
export class AgentEventsService {
  private readonly streams = new Map<string, Subject<AgentEvent>>();

  private streamFor(runId: string): Subject<AgentEvent> {
    let subject = this.streams.get(runId);
    if (!subject) {
      subject = new Subject<AgentEvent>();
      this.streams.set(runId, subject);
    }
    return subject;
  }

  emit(event: AgentEvent): void {
    this.streamFor(event.runId).next(event);
  }

  complete(runId: string): void {
    const subject = this.streams.get(runId);
    if (subject) {
      subject.complete();
      this.streams.delete(runId);
    }
  }

  observe(runId: string): Observable<AgentEvent> {
    return this.streamFor(runId).asObservable();
  }
}
