import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { r } from '../common/helpers';
import { LoggerFactory } from '../common/logger';
import { AnyAuthRequest } from '../helper/interfaces';
import { AnyAuthGuard } from './auth/auth.guard';
import { Hermes } from './bus';

const logger = LoggerFactory.getLogger('CommandController');

// TODO TDB...
export class CommandDTO {}

@ApiTags('core')
@Controller('api')
export class CommandController {
  @UseGuards(AnyAuthGuard)
  @Post('v1/commands')
  v1Commands(@Body() commandDto: CommandDTO, @Req() req: AnyAuthRequest): void {
    logger.log(`receive command ${r(commandDto)}`);
    const { identifier } = req;
    Hermes.emit('commands', 'commands', commandDto, { identifier });
  }
}
