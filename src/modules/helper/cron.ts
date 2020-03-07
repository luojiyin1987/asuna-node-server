import { CronJob, CronJobParameters } from 'cron';
import * as cronParser from 'cron-parser';
import * as dayjs from 'dayjs';
import * as calendar from 'dayjs/plugin/calendar';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import * as _ from 'lodash';
import { r } from '../common/helpers';
import { LoggerFactory } from '../common/logger';
import { ConfigKeys, configLoader } from '../config';
import { RedisLockProvider } from '../providers';

dayjs.extend(calendar);
dayjs.extend(relativeTime);

const logger = LoggerFactory.getLogger('CronHelper');

export class CronHelper {
  private static readonly redis = RedisLockProvider.instance;

  static nextTime(cronTime: string) {
    const next = cronParser
      .parseExpression(cronTime)
      .next()
      .toDate();
    return { next, fromNow: dayjs(next).fromNow(), calendar: dayjs(next).calendar() };
  }

  static reg(
    operation: string,
    cronTime: string,
    handler: () => Promise<any>,
    opts: Omit<CronJobParameters, 'cronTime' | 'onTick'> & {
      // ttl in seconds
      ttl?: number;
    } = {},
  ): CronJob {
    if (!configLoader.loadBoolConfig(ConfigKeys.CRON_ENABLE, true)) {
      logger.warn(`skip ${operation} cron not enabled.`);
      return null;
    }

    const ttl = opts.ttl ?? 10;
    const enabled = this.redis.isEnabled();
    logger.verbose(`init cron ${r({ operation, cronTime, ...this.nextTime(cronTime), opts, enabled })}`);
    const callPromise = () =>
      enabled
        ? this.redis.lockProcess(operation, handler, { ttl: ttl * 1000 }).catch(reason => logger.error(reason))
        : handler().catch(reason => logger.error(reason));
    return new CronJob({
      cronTime,
      onTick: () =>
        callPromise().finally(() =>
          logger.verbose(`${operation} done. next: ${r({ cronTime, ...this.nextTime(cronTime) })}`),
        ),
      onComplete: () => {
        logger.verbose(`${operation} completed.`);
        if (_.isFunction(opts.onComplete)) opts.onComplete();
      },
      runOnInit: false,
      ..._.omit(opts, 'ttl'),
    });
  }
}
