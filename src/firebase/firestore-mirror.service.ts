import { Injectable } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

export interface MirroredRun {
  organizationId: string;
  sessionId: string;
  sessionCreatorId: string;
  creatorId: string;
  prompt: string;
  model: string;
  status: string;
  error: string | null;
  sandboxId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface MirroredStep {
  index: number;
  type: string;
  name: string | null;
  content: string;
  createdAt: Date;
}

export interface MirroredMessage {
  sessionId: string;
  organizationId: string;
  sessionCreatorId: string;
  authorId: string | null;
  role: string;
  content: string;
  createdAt: Date;
}

export interface MirroredMember {
  userId: string;
  role: string;
  createdAt: Date;
}

/**
 * Mirrors real-time documents into Firestore for client subscriptions.
 * Postgres remains the relational source of truth; every mirror write is
 * awaited and failures propagate to the caller — no silent divergence.
 */
@Injectable()
export class FirestoreMirrorService {
  constructor(private readonly firebase: FirebaseService) {}

  async setRun(runId: string, run: MirroredRun): Promise<void> {
    await this.firebase.firestore
      .collection('agentRuns')
      .doc(runId)
      .set(run, { merge: true });
  }

  async updateRun(runId: string, update: Partial<MirroredRun>): Promise<void> {
    await this.firebase.firestore
      .collection('agentRuns')
      .doc(runId)
      .set(update, { merge: true });
  }

  async addStep(runId: string, step: MirroredStep): Promise<void> {
    await this.firebase.firestore
      .collection('agentRuns')
      .doc(runId)
      .collection('steps')
      .doc(String(step.index))
      .create(step);
  }

  async addMessage(messageId: string, message: MirroredMessage): Promise<void> {
    await this.firebase.firestore
      .collection('sessions')
      .doc(message.sessionId)
      .collection('messages')
      .doc(messageId)
      .create(message);
  }

  async setMember(
    organizationId: string,
    firebaseUid: string,
    member: MirroredMember,
  ): Promise<void> {
    await this.firebase.firestore
      .collection('organizations')
      .doc(organizationId)
      .collection('members')
      .doc(firebaseUid)
      .set(member, { merge: true });
  }
}
