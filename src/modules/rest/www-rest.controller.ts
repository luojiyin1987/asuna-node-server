import { Controller } from '@nestjs/common';
import { AsunaContext } from '../core';
import { RestCrudController } from './base.controllers';

@Controller('rest')
export class WwwRestController extends RestCrudController {
  constructor() {
    super(AsunaContext.instance.defaultModulePrefix);
  }
}
