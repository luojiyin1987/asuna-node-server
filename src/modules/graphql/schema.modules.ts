import { Logger, Module, OnModuleInit } from '@nestjs/common';

import { DBService } from '../base/db.service';
import { SchemaQueryResolver } from './schema.resolver';

const logger = new Logger('SchemaModules');

@Module({
  providers: [SchemaQueryResolver, DBService],
})
export class SchemaModules implements OnModuleInit {
  onModuleInit(): any {
    logger.log('init...');
  }
}
