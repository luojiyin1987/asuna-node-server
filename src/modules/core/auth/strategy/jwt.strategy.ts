import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import * as passport from 'passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigKeys, configLoader } from '../../../helpers';
import { IJwtPayload } from '../auth.interfaces';
import { AuthService } from '../auth.service';

const logger = new Logger('JwtStrategy');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        // passReqToCallback: true,
        secretOrKey: configLoader.loadConfig(ConfigKeys.SECRET_KEY, 'secret'),
      },
      // async (req, payload, next) => await this.verify(req, payload, next),
    );
    passport.use(this);
  }

  async validate(payload: IJwtPayload) {
    logger.log(`validate ${JSON.stringify(payload)}`);
    const isValid = await this.authService.validateUser(payload);
    if (!isValid) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
