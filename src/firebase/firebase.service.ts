import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { Env } from '../config/env.validation';

@Injectable()
export class FirebaseService implements OnModuleDestroy {
  private readonly app: App;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly projectId: string;

  constructor(configService: ConfigService<Env, true>) {
    const serviceAccount = configService.get('FIREBASE_SERVICE_ACCOUNT_JSON', {
      infer: true,
    });
    this.projectId = serviceAccount.project_id;
    this.app = initializeApp(
      {
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
        projectId: serviceAccount.project_id,
      },
      `lotus-backend-${process.pid}`,
    );
    this.auth = getAuth(this.app);
    this.firestore = getFirestore(this.app);
  }

  async onModuleDestroy(): Promise<void> {
    await deleteApp(this.app);
  }
}
