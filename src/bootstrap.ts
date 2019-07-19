import { ValidationPipe } from '@nestjs/common';
import { NestApplication, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'body-parser';
import * as compression from 'compression';
import * as rateLimit from 'express-rate-limit';
import * as helmet from 'helmet';
import * as morgan from 'morgan';
import { dirname, resolve } from 'path';
import * as responseTime from 'response-time';
import { AnyExceptionFilter, r } from './modules/common';
import { ConfigKeys, configLoader } from './modules/config';
import { AsunaContext, IAsunaContextOpts } from './modules/core';
import { LoggerFactory, LoggerService } from './modules/logger';

const startAt = Date.now();

// if (process.env.NODE_ENV === 'production') {
//   logger.log(`[X] run as production mode at ${__dirname}`);
//   const moduleAlias = require('module-alias');
//   moduleAlias.addPath(__dirname as any);
// } else {
//   logger.log(`[X] run as non-production mode at ${__dirname}`);
// }

const pkg = require('../package.json');
const isProduction = process.env.NODE_ENV === 'production';

export interface IBootstrapOptions {
  // server folder
  root?: string;
  // package folder
  // dirname?: string;
  version?: string;
  /**
   * io     - socket.io
   * redis  - 基于 redis 共享 websocket 信息
   * ws     - websocket
   */
  redisMode?: 'io' | 'redis' | 'ws';
  context?: IAsunaContextOpts;
}

export async function bootstrap(appModule, options: IBootstrapOptions = {}): Promise<any> {
  const loggerService = new LoggerService();
  const logger = LoggerFactory.getLogger('bootstrap');
  logger.log(`options: ${r(options)}`);

  AsunaContext.instance.setup(options.context);
  // AsunaContext.instance.setup(options.context || { root: options.root });

  // --------------------------------------------------------------
  // Setup app
  // --------------------------------------------------------------
  resolveTypeormPaths(options);

  logger.log('create app ...');
  /*
  const fastifyInstance = fastify();
  const fastifyAdapter = new FastifyAdapter(fastifyInstance);
  fastifyAdapter.register(require('fastify-multipart'));

  fastifyAdapter.use(require('cors')());
  fastifyAdapter.use(require('dns-prefetch-control')());
  fastifyAdapter.use(require('frameguard')());
  fastifyAdapter.use(require('hide-powered-by')());
  fastifyAdapter.use(require('hsts')());
  fastifyAdapter.use(require('ienoopen')());
  fastifyAdapter.use(require('x-xss-protection')());*/

  const app = await NestFactory.create<NestApplication>(appModule, {
    logger: loggerService,
  });
  /*
  app.register(require('fastify-multipart'));

  app.use(require('cors')());
  app.use(require('dns-prefetch-control')());
  app.use(require('frameguard')());
  app.use(require('hide-powered-by')());
  app.use(require('hsts')());
  app.use(require('ienoopen')());
  app.use(require('x-xss-protection')());*/

  app.use(helmet()); // use fastify-helmet
  app.use(compression());
  app.use(responseTime());
  app.use(
    rateLimit({
      windowMs: 60 * 1e3, // 1 minute(s)
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many accounts created from this IP, please try again after 1474560 minutes.',
    }),
  );
  app.use(morgan('combined'));
  app.use(json({ limit: configLoader.loadConfig(ConfigKeys.PAYLOAD_LIMIT, '1mb') }));

  // fastifyInstance.addHook('onError', (req, reply, error, done) => {
  //   logger.log(`error is ${r(error)}`);
  //   done();
  // });
  app.useGlobalFilters(new AnyExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  if (options.redisMode === 'redis') {
    app.useWebSocketAdapter(new (require('./modules/ws/redis.adapter')).RedisIoAdapter(app));
  } else if (options.redisMode === 'ws') {
    app.useWebSocketAdapter(new (require('@nestjs/platform-ws')).WsAdapter(app));
  }

  // app.use(csurf());
  app.enableCors();
  app.enableShutdownHooks();

  if (AsunaContext.isDebugMode) {
    logger.log('[X] debug mode is enabled');
  }

  // --------------------------------------------------------------
  // Setup Swagger
  // --------------------------------------------------------------
  if (configLoader.loadBoolConfig(ConfigKeys.SWAGGER)) {
    logger.log('[X] init swagger at /swagger');
    const swaggerOptions = new DocumentBuilder()
      .setTitle('API Server')
      .setVersion(`${options.version}, Core: ${pkg.version}`)
      .build();
    const document = SwaggerModule.createDocument(app, swaggerOptions);
    SwaggerModule.setup('/swagger', app, document);
  }

  const port = configLoader.loadNumericConfig(ConfigKeys.PORT, 5000);

  return app.listen(port).then(opts => {
    logger.log(`started in ${Date.now() - startAt}ms, listening on ${port}`);

    // --------------------------------------------------------------
    // preload data
    // --------------------------------------------------------------

    // dataLoaderProxy()
    //   .preload()
    //   .catch(reason => logger.warn(r(reason)));

    return app;
  });
}

/**
 * 根据环境变量调整要拉取的实体
 * @param options
 */
export function resolveTypeormPaths(options: IBootstrapOptions = {}) {
  const logger = LoggerFactory.getLogger('resolveTypeormPaths');
  // const wasBuilt = __filename.endsWith('js');
  const rootDir = dirname(process.mainModule.filename);
  const packageDir = global.packageDir;
  // const suffix = isProduction ? 'js' : 'ts'; // used to detect files for caller
  const entities = [
    `${resolve(packageDir)}/**/*entities.ts`,
    `${resolve(rootDir)}/**/*entities.ts`,
  ];
  const subscribers = [
    `${resolve(packageDir)}/**/*subscriber.ts`,
    `${resolve(rootDir)}/**/*subscriber.ts`,
  ];
  logger.log(
    `options is ${r({
      options,
      isProduction,
      dirname,
      rootDir,
      // suffix,
      entities,
      subscribers,
    })}`,
  );

  logger.log(`resolve typeorm entities: ${r(entities)}`);
  logger.log(`resolve typeorm subscribers: ${r(subscribers)}`);

  process.env.TYPEORM_ENTITIES = entities.join();
  process.env.TYPEORM_SUBSCRIBERS = subscribers.join();
}
