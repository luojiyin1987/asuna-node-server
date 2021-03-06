import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsDefined, IsObject, IsOptional, IsString } from 'class-validator';
import * as _ from 'lodash';
import * as fp from 'lodash/fp';
import { AsunaErrorCode, AsunaException, LoggerFactory, PrimaryKey, r } from '../common';
import { JsonMap } from '../common/decorators';
import { AccessControlHelper, AnyAuthGuard } from '../core/auth';
import { DBHelper } from '../core/db/db.helper';
import { RestHelper } from '../core/rest/rest.helper';
import { AnyAuthRequest } from '../helper/interfaces';
import { TenantHelper } from '../tenant';
import { Draft } from './draft.entities';

class CreateDraftDto {
  @IsObject()
  content: JsonMap;
  @IsString()
  type: string;
  @IsOptional()
  refId?: PrimaryKey;
}

class GetDraftsQuery {
  @IsString()
  type: string;
  @IsDefined()
  refId: PrimaryKey;
}

const logger = LoggerFactory.getLogger('ContentAdminController');

@Controller('admin/v1/content')
export class ContentAdminController {
  @UseGuards(AnyAuthGuard)
  @Post('draft')
  async createDraft(@Body() body: CreateDraftDto, @Req() req: AnyAuthRequest): Promise<Draft | JsonMap> {
    const { roles, tenant } = req;
    const rolesStr = _.map(roles, fp.get('name'));
    logger.log(`createDraft ${r({ body, roles, rolesStr })}`);
    const permission = AccessControlHelper.ac.can(rolesStr).create(body.type);
    const permissionAny = AccessControlHelper.ac.can(rolesStr).createAny(body.type);
    const permissionOwn = AccessControlHelper.ac.can(rolesStr).createOwn(body.type);
    const granted = permission.granted;
    const anyGranted = permissionAny.granted;
    const ownGranted = permissionOwn.granted;
    logger.verbose(`permission ${r({ permission, permissionAny, permissionOwn, granted, anyGranted, ownGranted })}`);

    if (!(granted || anyGranted || ownGranted)) {
      throw new AsunaException(AsunaErrorCode.InsufficientPermissions, 'not granted');
    }

    const modelNameObject = DBHelper.getModelNameObject(body.type);
    logger.log(`get model ${r(modelNameObject)}`);
    const isTenantEntity = await TenantHelper.isTenantEntity(modelNameObject.entityName);
    const hasTenantRoles = await TenantHelper.hasTenantRole(roles);
    logger.log(`tenant detect ${r({ isTenantEntity, hasTenantRoles })}`);
    if (isTenantEntity && hasTenantRoles) {
      let { refId } = body;
      // 如果不存在原型，先创建未发布的原型
      if (!refId) {
        const primaryKey = DBHelper.getPrimaryKeyByModel(modelNameObject);
        const ref = await RestHelper.save<{}>({ model: modelNameObject, body: { ...body.content, tenant } }, req);
        refId = ref[primaryKey];
        logger.log(`save ref ${r(ref)}, ref id is ${r({ primaryKey, refId })}`);
      }

      // const entity = await DBHelper.repo(modelNameObject.entityName).findOne({ where: { id: body.refId, tenant } });
      // if (!entity) {
      //   throw new AsunaException(AsunaErrorCode.Unprocessable, `entity not found for ${body.type}: ${body.refId}`);
      // }
      const draft = await Draft.findOne({ where: { type: body.type, refId } });
      if (draft) {
        draft.content = _.omit(body.content, 'isPublished');
        return draft.save();
      }
      return Draft.save({ ...body, refId });
    }

    throw new AsunaException(AsunaErrorCode.Unprocessable, 'not implemented');
  }

  @UseGuards(AnyAuthGuard)
  @Get('draft')
  async getDrafts(@Query() query: GetDraftsQuery, @Req() req: AnyAuthRequest): Promise<Draft[]> {
    const { roles, tenant } = req;
    const rolesStr = _.map(roles, fp.get('name'));
    const drafts = await Draft.find(query);
    if (!drafts) {
      throw new AsunaException(AsunaErrorCode.Unprocessable, `invalid operation`);
    }
    logger.log(`get drafts ${r({ query, roles, rolesStr })}`);
    const permission = AccessControlHelper.ac.can(rolesStr).create(query.type);
    const permissionAny = AccessControlHelper.ac.can(rolesStr).createAny(query.type);
    const permissionOwn = AccessControlHelper.ac.can(rolesStr).createOwn(query.type);
    const granted = permission.granted;
    const anyGranted = permissionAny.granted;
    const ownGranted = permissionOwn.granted;
    logger.verbose(`permission ${r({ permission, permissionAny, permissionOwn, granted, anyGranted, ownGranted })}`);

    if (!(granted || anyGranted || ownGranted)) {
      throw new AsunaException(AsunaErrorCode.InsufficientPermissions, 'not granted');
    }

    return drafts;
  }

  @Post('draft/:id/publish')
  async publishDraft(@Param('id') id: string, @Req() req: AnyAuthRequest): Promise<void> {
    const { roles, tenant } = req;
    const rolesStr = _.map(roles, fp.get('name'));
    const draft = await Draft.findOneOrFail(id);
    if (!draft) {
      throw new AsunaException(AsunaErrorCode.Unprocessable, `invalid operation`);
    }
    logger.log(`get drafts ${r({ id, roles, rolesStr })}`);
    const permission = AccessControlHelper.ac.can(rolesStr).create(draft.type);
    const permissionAny = AccessControlHelper.ac.can(rolesStr).createAny(draft.type);
    const permissionOwn = AccessControlHelper.ac.can(rolesStr).createOwn(draft.type);
    const granted = permission.granted;
    const anyGranted = permissionAny.granted;
    const ownGranted = permissionOwn.granted;
    logger.verbose(`permission ${r({ permission, permissionAny, permissionOwn, granted, anyGranted, ownGranted })}`);

    if (!(granted || anyGranted || ownGranted)) {
      throw new AsunaException(AsunaErrorCode.InsufficientPermissions, 'not granted');
    }

    const modelNameObject = DBHelper.getModelNameObject(draft.type);
    const primaryKey = DBHelper.getPrimaryKey(DBHelper.repo(modelNameObject.entityName));
    const isTenantEntity = await TenantHelper.isTenantEntity(modelNameObject.entityName);
    // const entity = await DBHelper.repo(modelNameObject.entityName).findOne({ where: { id: draft.refId, tenant } });
    logger.log(`update ${r({ modelNameObject, primaryKey, isTenantEntity })}`);
    await DBHelper.repo(modelNameObject.entityName).update(draft.refId, { ...draft.content, isPublished: true });
    await Draft.delete(draft.id);
  }
}
