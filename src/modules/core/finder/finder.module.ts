import { Module, OnModuleInit } from '@nestjs/common';
import { LoggerFactory } from '../../common/logger';
import { ConfigKeys, configLoader } from '../../config';
import {
  KeyValuePair,
  KeyValueType,
  KvDefIdentifierHelper,
  KVGroupFieldsValue,
  KvHelper,
  KVModelFormatType,
  KvModule,
} from '../kv';
import { FinderController, ShortFinderController } from './finder.controller';
import { FinderFieldKeys, FinderHelper } from './finder.helper';

const logger = LoggerFactory.getLogger('FinderModule');

@Module({
  imports: [KvModule],
  providers: [],
  controllers: [FinderController, ShortFinderController],
  exports: [],
})
export class FinderModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    logger.log('init...');
    this.initKV();
  }

  async initKV(): Promise<void> {
    const assetsEndpoint = configLoader.loadConfig(ConfigKeys.ASSETS_ENDPOINT);
    const assetsInternalEndpoint = configLoader.loadConfig(ConfigKeys.ASSETS_INTERNAL_ENDPOINT);

    const identifier = KvDefIdentifierHelper.stringify(FinderHelper.kvDef);
    KvHelper.initializers[identifier] = (): Promise<KeyValuePair> =>
      KvHelper.set<KVGroupFieldsValue>(
        {
          ...FinderHelper.kvDef,
          name: '资源位置配置',
          type: KeyValueType.json,
          value: {
            form: {
              default: {
                name: '公网资源',
                fields: [
                  {
                    name: '端点',
                    field: { name: FinderFieldKeys.endpoint, type: 'string', defaultValue: assetsEndpoint },
                  },
                ],
              },
              'internal-default': {
                name: '内网资源',
                fields: [
                  {
                    name: '端点',
                    field: {
                      name: FinderFieldKeys.internalEndpoint,
                      type: 'string',
                      defaultValue: assetsInternalEndpoint,
                    },
                  },
                ],
              },
              exchanges: {
                name: '地址转换',
                fields: [{ name: 'json', field: { name: FinderFieldKeys.hostExchanges, type: 'text' } }],
              },
            },
            values: {},
          },
        },
        { merge: true, formatType: KVModelFormatType.KVGroupFieldsValue },
      );

    // initialize
    await KvHelper.initializers[identifier]();
  }
}
