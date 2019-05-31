import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, Repository } from 'typeorm';
import * as _ from 'lodash';
import { DBHelper } from '../db';
import { getModelName } from '../helper';

const logger = new Logger('SortService');

/**
 * const SortServiceProvider: Provider = {
 *   provide: 'SortService',
 *   useFactory: (connection: Connection) => {
 *     return new SortService(connection, Sort);
 *   },
 *   inject: [Connection],
 * };
 */
@Injectable()
export class SortService {
  private sortRepository: Repository<any>;

  constructor(@InjectConnection() private readonly connection: Connection, Sort) {
    this.sortRepository = this.connection.getRepository(Sort);
  }

  async findItems(sort): Promise<any[]> {
    let items = [];
    const positions = sort.positions;
    if (sort && sort.id && sort.type) {
      const relation = sort.type.toLowerCase();
      logger.log(`resolve ${relation} for sorts.`);
      const withRelation = await this.sortRepository.findOne({
        where: { id: sort.id },
        relations: [relation],
        cache: true,
      });
      items = withRelation[relation];
      logger.log(`load ${items.length} items.`);

      const primaryKey = _.first(DBHelper.getPrimaryKeys(DBHelper.repo(relation)));
      items.sort(
        (a: any, b: any) => positions.indexOf(a[primaryKey]) - positions.indexOf(b[primaryKey]),
      );
    } else {
      logger.warn(`sort not available: ${JSON.stringify(sort)}`);
    }

    return items;
  }
}