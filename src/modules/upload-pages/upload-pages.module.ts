import { Module } from '@nestjs/common';
import { UploadPagesService } from './upload-pages.service';

@Module({
  providers: [UploadPagesService],
})
export class UploadPagesModule {}
