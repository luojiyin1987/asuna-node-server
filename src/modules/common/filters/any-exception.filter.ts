import { ArgumentsHost, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common/exceptions/http.exception';
import * as Sentry from '@sentry/node';
import { Response } from 'express';
import * as _ from 'lodash';
import * as R from 'ramda';
import { getRepository, QueryFailedError } from 'typeorm';
import { EntityNotFoundError } from 'typeorm/error/EntityNotFoundError';
import { StatsHelper } from '../../stats/stats.helper';

import { AsunaErrorCode, AsunaException, ValidationException } from '../exceptions';
import { r } from '../helpers/utils';
import { LoggerFactory } from '../logger/factory';

const logger = LoggerFactory.getLogger('AnyExceptionFilter');

type QueryFailedErrorType = QueryFailedError & {
  message: string;
  code: string;
  errno: number;
  sqlMessage: string;
  sqlState: string;
  index: number;
  sql: string;
  name: string;
  query: string;
  parameters: string[];
};

export class AnyExceptionFilter implements ExceptionFilter {
  static handleSqlExceptions(exception: QueryFailedErrorType): ValidationException | QueryFailedErrorType {
    // 包装唯一性约束，用于前端检测
    if (exception.code === 'ER_DUP_ENTRY') {
      const [, value, key] = exception.sqlMessage.match(/Duplicate entry '(.+)' for key '(.+)'/);
      const [, model] = exception.sql.match(/`(\w+)`.+/);
      const { metadata } = getRepository(model);
      const [index] = metadata.indices.filter((i) => i.name === key);
      return new ValidationException(
        index.name,
        (index.givenColumnNames as string[]).map((name) => ({
          constraints: { isUnique: `${name} must be unique` },
          property: name,
          target: { [name]: value },
          value,
        })),
      );
    }

    // 未找到默认值
    if (exception.code === 'ER_NO_DEFAULT_FOR_FIELD') {
      const [, name] = exception.sqlMessage.match(/Field '(.+)' doesn't have a default value/);
      const value = null;
      return new ValidationException('ER_NO_DEFAULT_FOR_FIELD', [
        {
          constraints: { notNull: `${name} must not be empty` },
          property: name,
          target: { [name]: value },
          value,
        },
      ]);
    }

    if (exception.code === 'ER_PARSE_ERROR') {
      return new AsunaException(AsunaErrorCode.Unprocessable, 'parse error');
    }

    logger.error(`unresolved QueryFailedError: ${r(exception)}`);
    return exception;
  }

  catch(exception: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let processed = exception;

    if (R.is(QueryFailedError, exception)) {
      processed = AnyExceptionFilter.handleSqlExceptions(exception);
    } else if (R.is(EntityNotFoundError, exception)) {
      processed.status = HttpStatus.NOT_FOUND;
    } else if (exception.name === 'ArgumentError') {
      processed.status = HttpStatus.UNPROCESSABLE_ENTITY;
      logger.warn(`[ArgumentError] found ${r(processed)}, need to convert to 400 error body`);
    } else if (processed.code) {
      if (processed.code === 'ERR_ASSERTION') {
        // TODO wrap with AsunaException
        processed.status = HttpStatus.BAD_REQUEST;
      }
    }

    const httpStatus: number = processed.status || processed.httpStatus || HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = processed.response;

    // logger.log(`check status ${r({ httpStatus, processed })}`);

    if (httpStatus && httpStatus === HttpStatus.BAD_REQUEST) {
      // logger.warn(`[bad_request] ${r(processed)}`);
      logger.warn(`[bad_request] ${r(processed.message)}`);
    } else if (httpStatus && httpStatus === HttpStatus.NOT_FOUND) {
      logger.warn(`[not_found] ${r(processed.message)}`);
    } else if (/40[13]/.test(`${httpStatus}`)) {
      // logger.warn(`[unauthorized] ${r(processed)}`);
    } else if (/4\d+/.test(`${httpStatus}`)) {
      logger.warn(`[client_error] ${r(processed)}`);
    } else {
      logger.error(`[unhandled exception] ${r(processed)}`);
      Sentry.captureException(processed);
    }

    if (res.finished) return;

    let body;
    let message;

    if (R.is(HttpException, processed)) {
      const key = _.isString(exceptionResponse.message) ? 'message' : 'errors';
      message = exceptionResponse.message;
      body = {
        error: {
          httpStatus,
          name: exceptionResponse.error,
          code: exceptionResponse.code,
          [key]: message,
          // raw: processed,
        } as AsunaException,
      };
    } else if (R.is(Error, processed) && !R.is(AsunaException, processed)) {
      message = processed.message;
      body = {
        error: {
          httpStatus,
          name: AsunaErrorCode.Unexpected__do_not_use_it.name,
          code: processed.status || AsunaErrorCode.Unexpected__do_not_use_it.value,
          message,
          // raw: processed,
        } as AsunaException,
      };
    } else {
      message = processed.message;
      body = {
        error: {
          ...(processed as AsunaException),
          message,
          // code: processed.code || processed.status || AsunaErrorCode.Unexpected__do_not_use_it.value,
        },
      };
    }

    const isGraphqlRes = !res.status;
    const errorInfo = {
      httpStatus,
      isGraphqlRes,
      message,
      body: _.omit(body, 'error.message'),
      type: typeof exception,
      name: exception.constructor.name,
      isHttpException: exception instanceof HttpException,
      isError: exception instanceof Error,
      isAsunaException: exception instanceof AsunaException,
    };
    logger.error(`error: ${r(errorInfo)}`);
    StatsHelper.addErrorInfo(String(httpStatus), errorInfo).catch(console.error);
    /*
    if (exception instanceof Error && httpStatus !== 500) {
      logger.error(exception);
    }
*/

    // res.status 不存在时可能是 graphql 的请求，不予处理，直接抛出异常r
    if (isGraphqlRes) {
      throw new Error(JSON.stringify(body));
    }

    // logger.error(`send ${r(body)} status: ${httpStatus}`);
    res.status(httpStatus).send(body);
  }
}
