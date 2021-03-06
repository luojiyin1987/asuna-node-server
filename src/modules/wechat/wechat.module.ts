import { Module, OnModuleInit } from '@nestjs/common';
import { r } from '../common/helpers';
import { LoggerFactory } from '../common/logger';
import { AdminUser } from '../core/auth';
import { Hermes } from '../core/bus';
import {
  KeyValuePair,
  KvDefIdentifierHelper,
  KVGroupFieldsValue,
  KvHelper,
  KeyValueType,
  KVModelFormatType
} from "../core/kv";
import { WeChatController } from './wechat.controller';
import { WeChatFieldKeys, WeChatHelper, WXEventMessageHelper, WXSubscribedQrSceneMessage } from './wechat.helper';
import { WXJwtStrategy } from './wx-jwt.strategy';

const logger = LoggerFactory.getLogger('WeChatModule');

@Module({
  imports: [],
  providers: [WXJwtStrategy],
  exports: [],
  controllers: [WeChatController],
})
export class WeChatModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    logger.log('init...');
    this.initKV();
    this.initSubscriber();
  }

  async initKV(): Promise<void> {
    const identifier = KvDefIdentifierHelper.stringify(WeChatHelper.kvDef);
    KvHelper.initializers[identifier] = (): Promise<KeyValuePair> =>
      KvHelper.set<KVGroupFieldsValue>(
        {
          ...WeChatHelper.kvDef,
          name: '微信配置',
          type: KeyValueType.json,
          value: {
            form: {
              default: {
                name: 'Admin',
                fields: [
                  { name: '开启后台微信登录', field: { name: WeChatFieldKeys.login, type: 'boolean' } },
                  {
                    name: '服务号订阅用户自动保存至后台用户',
                    field: { name: WeChatFieldKeys.saveToAdmin, type: 'boolean' },
                  },
                ],
              },
              service: {
                name: '服务号配置',
                fields: [
                  { name: '启用', field: { name: WeChatFieldKeys.enabled, type: 'boolean' } },
                  { name: 'Token', field: { name: WeChatFieldKeys.token, type: 'string' } },
                  { name: 'AppId', field: { name: WeChatFieldKeys.appId, type: 'string' } },
                  { name: 'AppSecret', field: { name: WeChatFieldKeys.appSecret, type: 'string' } },
                ],
              },
              app: {
                name: '小程序配置',
                fields: [
                  { name: '启用', field: { name: WeChatFieldKeys.miniEnabled, type: 'boolean' } },
                  { name: 'AppId', field: { name: WeChatFieldKeys.miniAppId, type: 'string' } },
                  { name: 'AppSecret', field: { name: WeChatFieldKeys.miniAppSecret, type: 'string' } },
                ],
              },
            },
            values: {},
          },
        },
        { merge: true, formatType: KVModelFormatType.KVGroupFieldsValue },
      );

    KvHelper.initializers[identifier]();
  }

  async initSubscriber(): Promise<void> {
    Hermes.subscribe(this.constructor.name, /^wx$/, async event => {
      logger.log(`subscribe event: ${r(event)}`);
      if (WXEventMessageHelper.isWXSubscribedQrSceneMessage(event.payload)) {
        const message = event.payload as WXSubscribedQrSceneMessage;
        const admin = await AdminUser.findOne({ email: `${message.FromUserName}@wx.openid` });
        if (admin) {
          //
        }
      } else {
        logger.log(`unhandled event: ${r(event)}`);
      }
    });
  }
}
