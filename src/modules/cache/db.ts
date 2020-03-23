import { Promise } from 'bluebird';
import * as _ from 'lodash';
import { parseJSONIfCould, promisify, r } from '../common/helpers';
import { LoggerFactory } from '../common/logger';
import { RedisProvider } from '../providers';
import { CacheManager } from './cache';
import { CacheTTL } from './constants';
import { CacheWrapper } from './wrapper';

const isPrefixObject = (key): key is { prefix?: string; key: string | object } => _.isObject(key);

const logger = LoggerFactory.getLogger('InMemoryDB');

export class InMemoryDB {
  static async get<Key extends string | { prefix?: string; key: string | object }>(key: Key) {
    const cacheKey = isPrefixObject(key) ? CacheWrapper.calcKey(key) : (key as string);
    const prefix = isPrefixObject(key) ? key.prefix : 'cache-db';

    const redis = RedisProvider.instance.getRedisClient(prefix);
    if (!redis.isEnabled) {
      return CacheManager.get(cacheKey);
    }
    return Promise.promisify(redis.client.get).bind(redis.client)(cacheKey);
  }

  static async save<Key extends string | { prefix?: string; key: string | object }, Value extends any>(
    key: Key,
    resolver: () => Promise<Value>,
    options?: { expiresInSeconds?: number; strategy?: 'default' | 'cache-first' },
  ): Promise<Value> {
    const cacheKey = isPrefixObject(key) ? CacheWrapper.calcKey(key) : (key as string);
    const prefix = isPrefixObject(key) ? key.prefix : 'cache-db';

    const redis = RedisProvider.instance.getRedisClient(prefix);
    // redis 未启用时使用 CacheManager
    if (!redis.isEnabled) {
      logger.verbose(`redis is not enabled, using inner cache ${r({ key, cacheKey, prefix, options })}.`);
      return CacheManager.cacheable(cacheKey, resolver, options?.expiresInSeconds);
    }

    const primeToRedis = async (): Promise<Value> => {
      value = await resolver();
      if (value) {
        // update
        await promisify(redis.client.setex, redis.client)(
          cacheKey,
          options?.expiresInSeconds ?? CacheTTL.SHORT,
          _.isString(value) ? value : JSON.stringify(value),
        );
      } else {
        // remove null just in case
        await promisify(redis.client.del, redis.client)(cacheKey);
      }
      return value;
    };

    // redis 存在未过期的值时直接返回
    let value = await Promise.promisify(redis.client.get).bind(redis.client)(cacheKey);
    if (value) {
      // when in cache-first mode will populate data to store later and return value in cache at first time
      if (options?.strategy === 'cache-first') setTimeout(() => primeToRedis(), 0);
      return parseJSONIfCould(value);
    }

    value = await primeToRedis();

    logger.debug(`value is ${r(value)}`);
    return value;
  }

  static async clear(opts: { prefix?: string; key: string | object }): Promise<void> {
    const { key, prefix } = opts;
    const cacheKey = `${prefix ? `${prefix}#` : ''}${_.isString(key) ? (key as string) : JSON.stringify(key)}`;
    logger.verbose(`remove ${cacheKey}`);
    const redis = RedisProvider.instance.getRedisClient(prefix);
    if (!redis.isEnabled) {
      return CacheManager.clear(cacheKey);
    }
    return Promise.promisify(redis.client.del).bind(redis.client)(cacheKey);
  }
}