import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import Users from '@models/Users.model';
import passport from 'passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.APPLICATION_JWT_SECRET,
};

export default (passport) => {
  passport.use(
    new Strategy(options, async (payload, done) => {
      try {
        const user = await Users.findOne({
          where: { id: payload.userId },
          attributes: ['username', 'id'],
        });

        if (user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          done(null, (user as any).dataValues);
        } else {
          done(null, false);
        }
      } catch (e) {
        done(e);
      }
    }),
  );
};

export const authenticateJwt = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Unauthorized',
          code: API_ERROR_CODES.unauthorized,
        },
      });
    }
    req.user = user;
    next();
  })(req, res, next);
};
