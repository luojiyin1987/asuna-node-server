import { Logger, Module, OnModuleInit } from '@nestjs/common';

import { ClientModule } from './client/client.module';
import { ApiController } from './core/api.controller';
import { AuthModule } from './core/auth/auth.module';
import { UploaderController } from './core/uploader/uploader.controller';
import { UploadsController } from './core/uploads.controller';
import { WSModule } from './ws/ws.module';
import { AdminRestController, AppRestController, WwwRestController } from './rest';
import { SearchController } from './search/search.controller';
import { SchemaModules } from './graphql/schema.modules';
import { KvModule } from './kv';
import { DBModule } from './db';

const logger = new Logger('AdminModule');

@Module({
  imports: [SchemaModules, AuthModule, WSModule, ClientModule, KvModule, DBModule],
  controllers: [
    ApiController,
    WwwRestController,
    AdminRestController,
    AppRestController,
    SearchController,
    UploadsController,
    UploaderController,
  ],
  exports: [AuthModule, KvModule, DBModule],
})
export class AdminModule implements OnModuleInit {
  static uploadPath = `${process.cwd()}/uploads`;

  onModuleInit(): any {
    logger.log('init...');
  }
}
