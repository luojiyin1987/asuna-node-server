import { ArgumentMetadata, Injectable, Logger, PipeTransform } from '@nestjs/common';
import * as _ from 'lodash';
import * as fp from 'lodash/fp';
import * as util from 'util';

const logger = new Logger('JpegPipe');

export interface JpegParam {
  quality?: number;
  progressive?: boolean;
}

@Injectable()
export class JpegPipe implements PipeTransform<any> {
  async transform(value, { metatype }: ArgumentMetadata) {
    const param = _.find(_.keys(value), fp.startsWith('jpeg/'));
    if (!param) {
      return {};
    }
    const jpegParam: JpegParam = { progressive: true, quality: 75 };
    try {
      if (param.includes('/')) {
        const params = param.split('/')[1].split('_');
        [jpegParam.quality, jpegParam.progressive] = [
          +params[0] || 75,
          !(params[1] === 'baseline'),
        ];
        logger.log(util.inspect({ value, metatype, param, params, jpegParam }, { colors: true }));
        return { opts: jpegParam, param };
      }
    } catch (e) {
      logger.warn(e.message);
      return { opts: jpegParam, param };
    }
    return {}; // for default
  }
}
