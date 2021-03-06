import * as _ from 'lodash';
import * as fp from 'lodash/fp';
import { BaseEntity, getConnection } from 'typeorm';
import { r } from '../../common/helpers';
import { LoggerFactory } from '../../common/logger';

const logger = LoggerFactory.getLogger('DBCacheCleaner');

export class DBCacheCleaner {
  static registers: { Entity: typeof BaseEntity; trigger: string }[] = [];

  static regTrigger(Entity: typeof BaseEntity, trigger: string): void {
    this.registers.push({ Entity, trigger });
  }

  static clear(name: string): void {
    const triggers = _.flow([fp.filter(({ Entity }) => Entity.name === name), fp.map(fp.get('trigger'))])(
      this.registers,
    );
    if (!_.isEmpty(triggers)) {
      logger.verbose(`clear ${r(triggers)}`);
      getConnection()
        .queryResultCache?.remove(triggers)
        .catch(reason => logger.error(reason));
    }
  }
}
