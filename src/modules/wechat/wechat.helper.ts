import { Promise } from 'bluebird';
import { classToPlain } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import * as crypto from 'crypto';
import { Request } from 'express';
import * as _ from 'lodash';
import * as fp from 'lodash/fp';
import * as rawBody from 'raw-body';
import * as shortid from 'shortid';
import * as xml2js from 'xml2js';
import { CacheManager } from '../cache';
import { AsunaErrorCode, AsunaException } from '../common/exceptions';
import { deserializeSafely, r } from '../common/helpers';
import { LoggerFactory } from '../common/logger';
import { ConfigKeys, configLoader } from '../config';
import { AdminUser, AuthUserChannel, TokenHelper } from '../core/auth';
import { UserProfile } from '../core/auth/user.entities';
import { Hermes } from '../core/bus';
import { AsunaCollections, KvDef, KvHelper } from '../core/kv/kv.helper';
import { RedisLockProvider, RedisProvider } from '../providers';
import { Store } from '../store';
import { WsHelper } from '../ws';
import { WXJwtPayload } from './interfaces';
import { WeChatUser, WXMiniAppUserInfo } from './wechat.entities';
// eslint-disable-next-line import/no-cycle
import { WxApi } from './wx.api';
import {
  MiniSubscribeData,
  SubscribeMessageInfo,
  TemplateData,
  WxQrTicketInfo,
  WxSendTemplateInfo,
  WxUserInfo,
} from './wx.interfaces';

const logger = LoggerFactory.getLogger('WeChatHelper');

/*
https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html
文本消息事件
{
  "ToUserName": "gh_3db19eb0a9ca",
  "FromUserName": "oQymst8zONL11MVsG7Jxi3Dj8bLk",
  "CreateTime": "1575959470",
  "MsgType": "text",
  "Content": "12",
  "MsgId": "22562314523842199"
}
 */
export interface WXTextMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: 'text';
  Content: string;
  MsgId: string;
}

/*
https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_event_pushes.html
关注/取消关注事件
{
  "ToUserName": "gh_3db19eb0a9ca",
  "FromUserName": "oQymst8zONL11MVsG7Jxi3Dj8bLk",
  "CreateTime": "1575959377",
  "MsgType": "event",
  "Event": "subscribe",
  "EventKey": ""
}
 */
export interface WXSubscribeMessage {
  // 开发者微信号
  ToUserName: string;
  // 发送方帐号（一个OpenID）
  FromUserName: string;
  // 消息创建时间 （整型）
  CreateTime: number;
  // 消息类型，event
  MsgType: 'event';
  // 事件类型，subscribe(订阅)、unsubscribe(取消订阅)
  Event: 'subscribe' | 'unsubscribe';
  EventKey: string;
}

/*
扫描带参数二维码事件
1. 用户未关注时，进行关注后的事件推送
 */
export interface WXQrSceneMessage {
  // 开发者微信号
  ToUserName: string;
  // 发送方帐号（一个OpenID）
  FromUserName: string;
  // 消息创建时间 （整型）
  CreateTime: number;
  // 消息类型，event
  MsgType: 'event';
  // 事件类型，subscribe
  Event: 'subscribe';
  // 事件KEY值，qrscene_为前缀，后面为二维码的参数值
  EventKey: string;
  // 二维码的ticket，可用来换取二维码图片
  Ticket: string;
}

export interface UserInfo {
  nickName: string;
  gender: number;
  language: string;
  city: string;
  province: string;
  country: string;
  avatarUrl: string;
  encryptedData: string;
  iv: string;
}

export enum WxTicketType {
  'admin-login' = 'admin-login',
}

/*
扫描带参数二维码事件
2. 用户已关注时的事件推送
 */
export interface WXSubscribedQrSceneMessage {
  // 开发者微信号
  ToUserName: string;
  // 发送方帐号（一个OpenID）
  FromUserName: string;
  // 消息创建时间 （整型）
  CreateTime: number;
  // 消息类型，event
  MsgType: 'event';
  // 事件类型，SCAN
  Event: 'SCAN';
  // 事件KEY值，是一个32位无符号整数，即创建二维码时的二维码scene_id
  EventKey: keyof typeof WxTicketType | string;
  // 二维码的ticket，可用来换取二维码图片
  Ticket: string;
}

export type WXEventMessage = WXSubscribeMessage | WXTextMessage | WXQrSceneMessage | WXSubscribedQrSceneMessage;

enum WxKeys {
  accessToken = 'wx-access-token',
}

export class WeChatServiceConfig {
  @IsBoolean() @IsOptional() login?: boolean;
  @IsBoolean() @IsOptional() saveToAdmin?: boolean;

  @IsBoolean() @IsOptional() enabled?: boolean;
  @IsString() @IsOptional() token?: string;
  @IsString() @IsOptional() appId?: string;
  @IsString() @IsOptional() appSecret?: string;

  @IsBoolean() @IsOptional() miniEnabled?: boolean;
  @IsString() @IsOptional() miniAppId?: string;
  @IsString() @IsOptional() miniAppSecret?: string;

  constructor(o: WeChatServiceConfig) {
    Object.assign(this, deserializeSafely(WeChatServiceConfig, o));
  }
}
export class NoticeConfig {
  // Server收到活动报名通知
  @IsBoolean() @IsOptional() registrationEnabled?: boolean;
  @IsString() @IsOptional() registrationTemplateId?: string;

  // 企业审核
  // @IsBoolean() @IsOptional() companyAuditEnabled?: boolean;
  // @IsString() @IsOptional() companyAuditTemplateId?: string;

  @IsBoolean() @IsOptional() jobApplicationEnabled?: boolean;
  @IsString() @IsOptional() jobApplicationTemplateId?: string;
  //
  // @IsBoolean() @IsOptional() newResumeEnabled?: boolean;
  // @IsString() @IsOptional() newResumeTemplateId?: string;

  // 关注未读消息通知
  @IsBoolean() @IsOptional() unReadMsgEnabled?: boolean;
  @IsString() @IsOptional() unReadMsgSubscribeId?: string;

  // 简历审核通知
  @IsBoolean() @IsOptional() resumeAuditEnabled?: boolean;
  @IsString() @IsOptional() resumeAuditSubscribeId?: string;

  // 报名确认结果通知
  @IsBoolean() @IsOptional() registrationAuditEnabled?: boolean;
  @IsString() @IsOptional() registrationAuditSubscribeId?: string;

  // @IsBoolean() @IsOptional()activityMsgEnabled?:boolean;
  // @IsString() @IsOptional()activityMsgSubscribeId?:string;

  constructor(o: NoticeConfig) {
    Object.assign(this, deserializeSafely(NoticeConfig, o));
  }
}

export enum WeChatFieldKeys {
  login = 'wechat.login',
  saveToAdmin = 'wechat.save-to-admin',

  enabled = 'service.enabled',
  token = 'service.token',
  appId = 'service.appid',
  appSecret = 'service.appsecret',

  miniEnabled = 'mini.enabled',
  miniAppId = 'mini.appid',
  miniAppSecret = 'mini.appsecret',
}

export enum NoticeFieldKeys {
  registrationEnabled = 'registration.enabled',
  registrationTemplateId = 'registration.templateId',
  jobApplicationEnabled = 'jobApplication.enabled',
  jobApplicationTemplateId = 'jobApplication.templateId',
  // companyAuditEnabled = 'companyAudit.enabled',
  // companyAuditTemplateId = 'companyAudit.templateId',
  // newResumeEnabled = 'newResume.enabled',
  // newResumeTemplateId = 'newResume.templateId',
  unReadMsgEnabled = 'unReadMsg.enabled',
  unReadMsgSubscribeId = 'unReadMsg.subscribeId',
  resumeAuditEnabled = 'resumeAudit.enabled',
  resumeAuditSubscribeId = 'resumeAudit.subscribeId',
  registrationAuditEnabled = 'registrationAudit.enabled',
  registrationAuditSubscribeId = 'registrationAudit.subscribeId',
  // activityMsgEnabled = 'activityMsg.enabled',
  // activityMsgSubscribeId = 'unReadMsg.subscribeId',
}

export class WXEventMessageHelper {
  static isWXSubscribeMessage = (message: WXEventMessage): boolean =>
    message.MsgType === 'event' && ['subscribe', 'unsubscribe'].includes(message.Event);
  static isWXTextMessage = (message: WXEventMessage): boolean => message.MsgType === 'text';
  static isWXSubscribedQrSceneMessage = (message: WXEventMessage): boolean =>
    message.MsgType === 'event' && message.Event === 'SCAN';
}

export class WeChatHelper {
  static kvDef: KvDef = { collection: AsunaCollections.SYSTEM_WECHAT, key: 'config' };
  static noticeKvDef: KvDef = { collection: AsunaCollections.SYSTEM_WECHAT, key: 'notice' };

  static async getServiceConfig(): Promise<WeChatServiceConfig> {
    return new WeChatServiceConfig(await KvHelper.getConfigsByEnumKeys(this.kvDef, WeChatFieldKeys));
  }

  static async getNoticeConfig(): Promise<NoticeConfig> {
    return new NoticeConfig(await KvHelper.getConfigsByEnumKeys(this.kvDef, NoticeFieldKeys));
  }

  static async checkSignature(opts: { signature: string; timestamp: string; nonce: string }): Promise<boolean> {
    const config = await WeChatHelper.getServiceConfig();
    const validation = [config.token, opts.timestamp, opts.nonce].sort().join('');
    const hashCode = crypto.createHash('sha1');
    const result = hashCode.update(validation, 'utf8').digest('hex');
    logger.log(`validate ${r({ config, opts, validation, result, validated: result === opts.signature })}`);
    return result === opts.signature;
  }

  static async parseXmlToJson<T = any>(req: Request): Promise<T> {
    const value = await rawBody(req);
    const json = (await Promise.promisify(xml2js.parseString)(value)) as { xml: { [key: string]: any[] } };
    logger.verbose(`parsed json is ${r(json)}`);
    return _.mapValues(json.xml, values => (values.length === 1 ? values[0] : values)) as T;
  }

  static async getTicketByType(type: WxTicketType, value: string): Promise<WxQrTicketInfo> {
    return WxApi.createQrTicket({
      action_name: 'QR_STR_SCENE',
      action_info: { scene: { scene_str: `${WxTicketType['admin-login']}:${value}` } },
    });
  }

  static async handleEvent(
    message: WXSubscribeMessage | WXTextMessage | WXQrSceneMessage | WXSubscribedQrSceneMessage,
  ): Promise<string> {
    const config = await this.getServiceConfig();
    logger.log(`handle message ${r(message)}`);

    if (message.MsgType === 'event' && message.Event === 'subscribe') {
      const event = message as WXSubscribeMessage;
      const user = await this.updateWeChatUser(event.FromUserName);

      if (config.saveToAdmin) {
        logger.log(`save user '${user.openId}' to admin`);
        await this.updateAdmin(user);
      }
    } else if (message.MsgType === 'event' && message.Event === 'unsubscribe') {
      const event = message as WXSubscribeMessage;
      const user = await this.updateWeChatUser(event.FromUserName);
      await this.updateAdmin(user);
    } else if (message.MsgType === 'text') {
      const event = message as WXTextMessage;
    } else if (message.MsgType === 'event' && message.Event === 'SCAN') {
      const event = message as WXSubscribedQrSceneMessage;
      const [type] = event.EventKey.split(':');
      logger.log(`handle message type: ${type}`);
      if (type === WxTicketType['admin-login']) {
        this.handleAdminLogin(event);
      } else {
        logger.warn(`unhandled message type ${type} for event ${r(event)}`);
      }
    } else {
      logger.warn(`unhandled message ${r(message)}`);
    }
    Hermes.emit('WeChatHelper', 'wx', message);
    return 'success';
  }

  static async handleAdminLogin(message: WXSubscribedQrSceneMessage): Promise<void> {
    const [type, sid] = message.EventKey.split(':');
    const user = await WeChatUser.findOne({ openId: message.FromUserName });
    const admin = await AdminUser.findOne({ email: `${message.FromUserName}@wx.openid` });
    logger.log(`handle type ${type} with sid ${sid} ... ${r({ user, admin })}`);
    if (admin) {
      if (admin.isActive) {
        const token = await TokenHelper.createToken(admin);
        WsHelper.ws.to(sid).emit(type, JSON.stringify({ type: 'activated', token, username: user.nickname }));
      } else {
        WsHelper.ws.to(sid).emit(type, JSON.stringify({ type: 'unactivated' }));
      }
    } else {
      WsHelper.ws.to(sid).emit(type, JSON.stringify({ type: 'invalid' }));
    }
  }

  static async updateAdmin(user: WeChatUser): Promise<void> {
    const isActive = user.subscribe !== 0;
    logger.log(`admin is ${r(user.admin)}`);
    if (!user.admin) {
      logger.log(`admin for user '${user.openId}' is not exists, create one with status '${isActive}' ...`);
      await AdminUser.delete({ username: user.openId });
      const admin = await AdminUser.create({
        username: `${user.nickname}#${user.openId}`,
        email: `${user.openId}@wx.openid`,
        isActive,
        channel: AuthUserChannel.wechat,
      }).save();
      await WeChatUser.update(user.openId, { admin });
    } else {
      logger.log(`update admin user '${user.openId}' status '${isActive}' ...`);
      await AdminUser.update(
        { email: `${user.openId}@wx.openid` },
        { username: `${user.nickname}#${user.openId}`, isActive },
      );
    }
  }

  static async updateWeChatUser(openId: string): Promise<WeChatUser> {
    const userInfo = await this.getUserInfo(openId);
    logger.log(`get user info ${r(userInfo)}`);
    if (await WeChatUser.findOne(openId)) {
      const weChatUser = classToPlain(userInfo.toWeChatUser());
      const updatedTo = _.omitBy(_.omit(weChatUser, 'openId'), fp.isUndefined);
      logger.log(`update user '${openId}' to ${r({ weChatUser, updatedTo })}`);
      await WeChatUser.update(userInfo.openid, updatedTo);
      return WeChatUser.findOne(openId);
    }
    return WeChatUser.save(userInfo.toWeChatUser());
  }

  static async updateUserProfile(user: Pick<UserProfile, 'id' | 'username'>, userInfo: UserInfo): Promise<void> {
    await WXMiniAppUserInfo.create({
      openId: user.username,
      nickname: userInfo.nickName,
      gender: userInfo.gender,
      language: userInfo.language,
      city: userInfo.city,
      province: userInfo.province,
      country: userInfo.country,
      avatar: userInfo.avatarUrl,
      profile: { id: user.id },
    }).save();
  }

  static async code2Session(code: string): Promise<string> {
    const codeSession = await WxApi.code2Session(code);
    logger.log(`code2session ${r({ code, codeSession })}`);
    const key = shortid.generate();
    await Store.Global.setItem(key, codeSession);
    if (codeSession.errcode) {
      throw new AsunaException(
        AsunaErrorCode.Unprocessable,
        JSON.stringify({ errcode: codeSession.errcode, errmsg: codeSession.errmsg }),
      );
    }

    const user = await UserProfile.findOne({ username: codeSession.openid });
    if (!user) {
      await UserProfile.create({
        username: codeSession.openid,
        email: `${codeSession.openid}@wx.miniapp.openid`,
        channel: AuthUserChannel.wechat,
      }).save();
    }
    return TokenHelper.createCustomToken(
      { key } as WXJwtPayload,
      configLoader.loadConfig(ConfigKeys.WX_SECRET_KEY, 'wx-secret'),
      // { expiresIn: 60 * 60 * 24 },
    );
  }

  static async getAccessToken(): Promise<string> {
    const redis = RedisProvider.instance.getRedisClient('wx');
    // redis 未启用时将 token 保存到内存中，2h 后过期
    if (!redis.isEnabled) {
      return CacheManager.cacheable(
        WxKeys.accessToken,
        async () => {
          logger.warn(`redis is not enabled, access token will store in memory and lost when app restarted.`);
          return (await WxApi.getAccessToken()).access_token;
        },
        2 * 3600,
      );
    }

    // redis 存在未过期的 token 时直接返回
    const accessToken = await Promise.promisify(redis.client.get).bind(redis.client)(WxKeys.accessToken);
    if (accessToken) return accessToken;

    const token = await RedisLockProvider.instance.lockProcess(
      WxKeys.accessToken,
      async () => {
        const result = await WxApi.getAccessToken();
        logger.verbose(`getAccessToken ${r(result)}`);
        if (result.access_token) {
          // 获取 token 的返回值包括过期时间，直接设置为在 redis 中的过期时间
          await Promise.promisify(redis.client.setex).bind(redis.client)(
            WxKeys.accessToken,
            result.expires_in,
            result.access_token,
          );
          return result.access_token;
        }
        throw new AsunaException(AsunaErrorCode.Unprocessable, 'get access token error', result);
      },
      { ttl: 60_000 },
    );
    logger.log(`access token is ${r(token)}`);
    if (!token) {
      throw new AsunaException(AsunaErrorCode.Unprocessable, 'no access token got');
    }
    return token;
  }

  static async getUserInfo(openId: string): Promise<WxUserInfo> {
    return WxApi.getUserInfo(openId);
  }

  static async sendTemplateMsg({
    openId,
    templateId,
    payload,
  }: {
    openId: string;
    templateId: string;
    payload: TemplateData;
  }): Promise<WxSendTemplateInfo> {
    return WxApi.sendTemplateMsg({ touser: openId, template_id: templateId, data: payload });
  }

  static async sendMiniSubscribeMsg({
    openId,
    subscribeId,
    payload,
  }: {
    openId: string;
    subscribeId: string;
    payload: MiniSubscribeData;
  }): Promise<SubscribeMessageInfo> {
    return WxApi.sendSubscribeMsg({ touser: openId, subscribe_id: subscribeId, data: payload });
  }
}
