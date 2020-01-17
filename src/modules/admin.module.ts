import { Module, OnModuleInit } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientModule } from './client/client.module';
import { LoggerFactory } from './common/logger';
import { CommandController, GetUploadsModule, KvHelper, UserController } from './core';
import { ApiController } from './core/api.controller';
import { AuthModule } from './core/auth/auth.module';
import { DBModule } from './core/db';
import { FinderModule } from './core/finder';
import { KvModule } from './core/kv';
import { TokenModule } from './core/token';
import { UploaderController, UploaderModule } from './core/uploader';
import { SexEnumValue } from './enum-values';
import { GraphqlQueryModule } from './graphql/graphql-query.module';
import { ImportExportModule } from './import-export/import-export.module';
import {
  AdminAppRestController,
  AdminContentRestController,
  AdminRestController,
  AdminSysRestController,
  AdminWxRestController,
  WwwRestController,
} from './rest';
import { SearchController } from './search/search.controller';
import { TaskController } from './task/task.controller';
import { TenantModule } from './tenant';

const logger = LoggerFactory.getLogger('AdminInternalModule');

@Module({
  imports: [
    GraphqlQueryModule,
    AuthModule,
    ClientModule,
    KvModule,
    DBModule,
    TokenModule,
    GetUploadsModule,
    FinderModule,
    CqrsModule,
    UploaderModule,
    ImportExportModule,
    TenantModule,
  ],
  controllers: [
    ApiController,
    AdminRestController,
    AdminAppRestController,
    AdminContentRestController,
    AdminSysRestController,
    AdminWxRestController,
    WwwRestController,
    CommandController,
    UserController,
    SearchController,
    TaskController,
    UploaderController,
  ],
  exports: [AuthModule, KvModule, DBModule, TokenModule],
})
export class AdminInternalModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    logger.log('init...');
    this.initConstants();
  }

  async initConstants(): Promise<void> {
    await KvHelper.mergeConstantMapsForEnumValue(SexEnumValue);
  }
}
