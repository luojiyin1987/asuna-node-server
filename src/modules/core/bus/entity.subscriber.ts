import * as _ from 'lodash';
import { BaseEntity, EntitySubscriberInterface, EventSubscriber, InsertEvent, RemoveEvent, UpdateEvent } from 'typeorm';
import { LoadEvent } from 'typeorm/subscriber/event/LoadEvent';
import { CacheHelper, CleanCacheType } from '../../cache';
import { r, validateObjectSync } from '../../common/helpers';
import { LoggerFactory } from '../../common/logger';
import { PubSubChannels, PubSubHelper } from '../../pub-sub/pub-sub.helper';
import { ColumnType, safeReloadJSON } from '../helpers';

const logger = LoggerFactory.getLogger('EntitySubscriber');

@EventSubscriber()
export class EntitySubscriber implements EntitySubscriberInterface {
  constructor() {
    logger.log('init ...');

    PubSubHelper.subscribe<CleanCacheType>(PubSubChannels.dataloader).subscribe(({ action, payload }) => {
      logger.verbose(`sub ${r({ action, payload })}`);
      CacheHelper.clear(payload);
    });
  }

  afterInsert(event: InsertEvent<BaseEntity>): Promise<any> | void {
    CacheHelper.clear({ key: event.metadata.name });
  }

  afterLoad(entity: BaseEntity, event?: LoadEvent<BaseEntity>): Promise<any> | void {
    event.metadata.columns.forEach(column => {
      if (column.type === ColumnType.JSON) {
        safeReloadJSON(entity as any, column.propertyName);
      }
    });
  }

  afterRemove(event: RemoveEvent<BaseEntity>): Promise<any> | void {}

  afterUpdate(event: UpdateEvent<BaseEntity>): Promise<any> | void {
    if (!event.entity) {
      return;
    }

    const id = _.get(event.entity, 'id') ?? _.get(event.entity, 'uuid');
    CacheHelper.pubClear({ key: event.metadata.name, id });
  }

  beforeInsert(event: InsertEvent<BaseEntity>): Promise<any> | void {
    event.metadata.columns.forEach(column => {
      if (column.type === ColumnType.JSON) safeReloadJSON(event.entity as any, column.propertyName);
    });
    validateObjectSync(event.entity);
  }

  beforeRemove(event: RemoveEvent<BaseEntity>): Promise<any> | void {}

  beforeUpdate(event: UpdateEvent<BaseEntity>): Promise<any> | void {
    event.metadata.columns.forEach(column => {
      if (column.type === ColumnType.JSON) safeReloadJSON(event.entity as any, column.propertyName);
    });
    validateObjectSync(event.entity);
  }
}
