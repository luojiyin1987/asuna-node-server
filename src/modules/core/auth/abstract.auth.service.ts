import { oneLine } from 'common-tags';
import { differenceInCalendarDays } from 'date-fns';
import * as jwt from 'jsonwebtoken';
import { Secret, SignOptions } from 'jsonwebtoken';
import { Cryptor } from 'node-buffs';
import { FindOneOptions, Repository, UpdateResult } from 'typeorm';
import { PrimaryKey } from '../../common';
import { formatTime, r } from '../../common/helpers';
import { LoggerFactory } from '../../common/logger';
import { ConfigKeys, configLoader } from '../../config';
import { JwtPayload } from './auth.interfaces';
import { AuthUser } from './base.entities';
import { UserProfile } from './user.entities';

const logger = LoggerFactory.getLogger('AbstractAuthService');

export class PasswordHelper {
  static readonly cryptor = new Cryptor();

  static encrypt(password: string): { hash: string; salt: string } {
    return this.cryptor.passwordEncrypt(password);
  }

  static passwordVerify(password: string, user: AuthUser): boolean {
    return this.cryptor.passwordCompare(password, user.password, user.salt);
  }
}

export class TokenHelper {
  static async createToken(
    user: AuthUser,
    extra?: { uid: PrimaryKey },
  ): Promise<{ expiresIn: number; accessToken: string }> {
    logger.log(`createToken >> ${r(user)}`);
    const expiresIn = 60 * 60 * 24 * 30; // one month
    const secretOrKey = configLoader.loadConfig(ConfigKeys.SECRET_KEY, 'secret');
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      id: user.id as string,
      ...extra,
      username: user.username,
      email: user.email,
      channel: user.channel,
    };
    const token = jwt.sign(payload, secretOrKey, { expiresIn });
    return {
      expiresIn,
      accessToken: token,
    };
  }

  static createCustomToken(
    payload: string | Buffer | object,
    secretOrPrivateKey: Secret,
    options?: SignOptions,
  ): string {
    logger.log(`createCustomToken >> ${r(payload)}`);
    return jwt.sign(payload, secretOrPrivateKey, options);
  }
}

export abstract class AbstractAuthService<U extends AuthUser> {
  // eslint-disable-next-line @typescript-eslint/no-parameter-properties
  protected constructor(protected readonly userRepository: Repository<U>) {}

  /**
   * TODO using db repo instead
   * @param jwtPayload
   * @returns {Promise<boolean>}
   */
  async validateUser(jwtPayload: JwtPayload): Promise<boolean> {
    const identifier = { email: jwtPayload.email, username: jwtPayload.username };
    const user = await this.getUser(identifier, true);

    const left = Math.floor(jwtPayload.exp - Date.now() / 1000);
    const validated = user != null && user.id === jwtPayload.id;
    if (!validated) {
      logger.verbose(oneLine`
        validated(${validated}) >> identifier: ${r(identifier)} exists: ${!!user}.
        left: ${formatTime(left)}
      `);
    }
    return validated;
  }

  createToken(profile: UserProfile, extra?: { uid: PrimaryKey }) {
    // eslint-disable-next-line no-param-reassign
    profile.lastSignedAt = new Date();
    profile.save().catch(reason => logger.error(reason));
    return TokenHelper.createToken(profile, extra);
  }

  async updateLastLoginDate(profileId: string | number): Promise<{ sameDay?: boolean; lastLoginAt?: Date }> {
    const profile = await this.userRepository.findOne(profileId);
    if (profile) {
      const currentDate = new Date();
      const calendarDays = differenceInCalendarDays(profile.lastLoginAt, currentDate);
      if (profile.lastLoginAt && calendarDays < 1) {
        return { sameDay: true, lastLoginAt: profile.lastLoginAt };
      }
      profile.lastLoginAt = currentDate;
      await profile.save();
      return { sameDay: false, lastLoginAt: currentDate };
    }
    return {};
  }

  async getUser(
    identifier: { email?: string; username?: string },
    isActive = true,
    options?: FindOneOptions<U>,
  ): Promise<U> {
    return this.userRepository.findOne(
      {
        ...(identifier.email ? { email: identifier.email } : null),
        ...(identifier.username ? { username: identifier.username } : null),
        isActive,
      } as any,
      options as any,
    );
  }

  public getUserWithPassword(identifier: { email?: string; username?: string }, isActive = true): Promise<U> {
    return this.userRepository.findOne(
      {
        ...(identifier.email ? { email: identifier.email } : null),
        ...(identifier.username ? { username: identifier.username } : null),
        isActive,
      } as any,
      { select: ['id', 'username', 'email', 'channel', 'password', 'salt'] },
    );
  }

  public updatePassword(id: PrimaryKey, password: string, salt: string): Promise<UpdateResult> {
    return this.userRepository.update(id, { password, salt } as any);
  }
}
