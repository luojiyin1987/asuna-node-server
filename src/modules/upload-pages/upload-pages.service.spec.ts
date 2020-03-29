import { Test, TestingModule } from '@nestjs/testing';
import { UploadPagesService } from './upload-pages.service';

describe('UploadPagesService', () => {
  let service: UploadPagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadPagesService],
    }).compile();

    service = module.get<UploadPagesService>(UploadPagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
