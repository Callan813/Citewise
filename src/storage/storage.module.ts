import { Module } from '@nestjs/common';
import { LocalStorageService, StorageService } from './storage.service.js';

@Module({
  providers: [{ provide: StorageService, useClass: LocalStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
