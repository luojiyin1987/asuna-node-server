import { Expose, plainToClass, Transform } from 'class-transformer';
import * as Redis from 'redis';
import { LoggerFactory } from '../common/logger';
import { configLoader } from '../config';

const logger = LoggerFactory.getLogger('RedisConfig');

export const RedisConfigKeys = {
  REDIS_ENABLE: 'REDIS_ENABLE',
  REDIS_HOST: 'REDIS_HOST',
  REDIS_PORT: 'REDIS_PORT',
  REDIS_PASSWORD: 'REDIS_PASSWORD',
  REDIS_DB: 'REDIS_DB',
};

export class RedisConfigObject {
  host?: string;
  port?: number;
  db?: number;
  enable?: boolean;

  @Expose({ name: 'with-password', toPlainOnly: true })
  @Transform(value => !!value, { toPlainOnly: true })
  password?: string;

  constructor(o: Partial<RedisConfigObject>) {
    Object.assign(this, plainToClass(RedisConfigObject, o, { enableImplicitConversion: true }));
  }

  static load(prefix = ''): RedisConfigObject {
    const appendPrefix = prefix ? `${prefix}_`.toUpperCase() : '';
    logger.debug(`try load env: ${appendPrefix}${RedisConfigKeys.REDIS_ENABLE}`);
    return new RedisConfigObject({
      enable: configLoader.loadBoolConfig(`${appendPrefix}${RedisConfigKeys.REDIS_ENABLE}`, false),
      host: configLoader.loadConfig(`${appendPrefix}${RedisConfigKeys.REDIS_HOST}`, 'localhost'),
      port: configLoader.loadNumericConfig(`${appendPrefix}${RedisConfigKeys.REDIS_PORT}`, 6379),
      password: configLoader.loadConfig(`${appendPrefix}${RedisConfigKeys.REDIS_PASSWORD}`),
      db: configLoader.loadNumericConfig(`${appendPrefix}${RedisConfigKeys.REDIS_DB}`) || 0,
    });
  }

  static loadOr(prefix = ''): RedisConfigObject | null {
    const appendPrefix = (prefix.length > 0 ? `${prefix}_` : '').toUpperCase();
    logger.debug(`try load env: ${appendPrefix}${RedisConfigKeys.REDIS_ENABLE}`);
    const enable = configLoader.loadBoolConfig(`${appendPrefix}${RedisConfigKeys.REDIS_ENABLE}`);
    if (enable === true) {
      return RedisConfigObject.load(prefix);
    }
    if (enable === false) {
      return null;
    }
    return RedisConfigObject.load();
  }

  get options(): Redis.ClientOpts {
    return {
      host: this.host,
      port: this.port,
      ...(this.password ? { password: this.password } : null),
      db: this.db,
    };
  }

  getOptions(db?: number): Redis.ClientOpts {
    return { ...this.options, db: db || this.db };
  }
}
