import { Logger } from '@nestjs/common';
import { createConfigLoader } from 'node-buffs';

const logger = new Logger('ConfigLoader');

export const ConfigKeys = {
  ADMIN_SECRET_KEY: 'ADMIN_SECRET_KEY',
  SECRET_KEY: 'SECRET_KEY',
  DEBUG: 'DEBUG',
  PORT: 'PORT',
  TRACING: 'TRACING',
  DB_TYPE: 'DB_TYPE',

  VIDEO_STORAGE: 'VIDEO_STORAGE',
  VIDEO_QINIU_ACCESS_KEY: 'VIDEO_QINIU_ACCESS_KEY',
  VIDEO_QINIU_SECRET_KEY: 'VIDEO_QINIU_SECRET_KEY',
  VIDEO_QINIU_BUCKET_NAME: 'VIDEO_QINIU_BUCKET_NAME',
  VIDEO_QINIU_PREFIX: 'VIDEO_QINIU_PREFIX',
  VIDEO_QINIU_DOMAIN: 'VIDEO_QINIU_DOMAIN',

  IMAGE_STORAGE: 'IMAGE_STORAGE',
  IMAGE_QINIU_ACCESS_KEY: 'IMAGE_QINIU_ACCESS_KEY',
  IMAGE_QINIU_SECRET_KEY: 'IMAGE_QINIU_SECRET_KEY',
  IMAGE_QINIU_BUCKET_NAME: 'IMAGE_QINIU_BUCKET_NAME',
  IMAGE_QINIU_PREFIX: 'IMAGE_QINIU_PREFIX',
  IMAGE_QINIU_DOMAIN: 'IMAGE_QINIU_DOMAIN',

  MAIL_HOST: 'MAIL_HOST',
  MAIL_PORT: 'MAIL_PORT',
  MAIL_SSL: 'MAIL_SSL',
  MAIL_USERNAME: 'MAIL_USERNAME',
  MAIL_PASSWORD: 'MAIL_PASSWORD',
  MAIL_FROM: 'MAIL_FROM',

  WS_REDIS_HOST: 'WS_REDIS_HOST',
  WS_REDIS_PORT: 'WS_REDIS_PORT',
  WS_REDIS_PASSWORD: 'WS_REDIS_PASSWORD',
  WS_REDIS_DB: 'WS_REDIS_DB',

  ACTION_CACHE_HOST: 'ACTION_CACHE_HOST',
  ACTION_CACHE_PORT: 'ACTION_CACHE_PORT',
  ACTION_CACHE_PASSWORD: 'ACTION_CACHE_PASSWORD',
  ACTION_CACHE_DB: 'ACTION_CACHE_DB',
  ACTION_CACHE_DURATION: 'ACTION_CACHE_DURATION',
};

export const configLoader = createConfigLoader({
  requiredVariables: [ConfigKeys.DB_TYPE],
});

// logger.log(`NODE_ENV: ${util.inspect(configLoader.loadConfigs())}`);
logger.log(`NODE_ENV: ${process.env.NODE_ENV}`);
logger.log(`ENV: ${process.env.ENV}`);
