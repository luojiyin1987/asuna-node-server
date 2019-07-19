import { Module, OnModuleInit } from '@nestjs/common';
import { LoggerFactory } from '../logger';
import { AppQueryResolver } from './app.resolver';

const logger = LoggerFactory.getLogger('AppModule');

@Module({
  providers: [AppQueryResolver],
})
export class AppModule implements OnModuleInit {
  onModuleInit(): any {
    logger.log('init...');
  }
}
