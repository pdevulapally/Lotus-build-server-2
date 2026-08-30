import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { FirestoreMirrorService } from './firestore-mirror.service';

@Global()
@Module({
  providers: [FirebaseService, FirestoreMirrorService],
  exports: [FirebaseService, FirestoreMirrorService],
})
export class FirebaseModule {}
