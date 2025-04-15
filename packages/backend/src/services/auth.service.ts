import { API_ERROR_CODES, CategoryModel, UserModel } from '@bt/shared/types';
import { DEFAULT_CATEGORIES } from '@js/const';
import { ConflictError, NotFoundError, Unauthorized, UnexpectedError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { connection } from '@models/index';
import * as categoriesService from '@services/categories.service';
import * as userService from '@services/user.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { withTransaction } from './common/with-transaction';

export const login = withTransaction(
  async ({ username, password }: { username: string; password: string }): Promise<{ token: string }> => {
    try {
      const user = await userService.getUserByCredentials({ username });

      if (user) {
        const isPasswordValid = bcrypt.compareSync(password, user.password);

        if (isPasswordValid) {
          const token = jwt.sign(
            {
              username: user.username,
              userId: user.id,
            },
            process.env.APPLICATION_JWT_SECRET as string,
            {
              expiresIn: '7d',
            },
          );

          return { token: `Bearer ${token}` };
        }

        throw new Unauthorized({
          code: API_ERROR_CODES.invalidCredentials,
          message: 'User email and/or password are invalid!',
        });
      }

      throw new NotFoundError({ message: 'User not found!' });
    } catch (err) {
      logger.error(err as Error);
      throw err;
    }
  },
);

export const register = withTransaction(
  async ({ username, password }: { username: string; password: string }): Promise<UserModel> => {
    try {
      const existingUser = await userService.getUserByCredentials({ username });
      if (existingUser) {
        throw new ConflictError({
          code: API_ERROR_CODES.userExists,
          message: 'User already exists!',
        });
      }

      const salt = bcrypt.genSaltSync(10);

      // Create user with salted password
      let user = await userService.createUser({
        username,
        password: bcrypt.hashSync(password, salt),
      });

      const defaultCategories = DEFAULT_CATEGORIES.main.map((item) => ({
        ...item,
        userId: user.id,
      }));

      // Insert default categories
      const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

      let subcats: Omit<CategoryModel, 'id' | 'imageUrl'>[] = [];

      // Loop through categories and make subcats as a raw array of categories
      // since DB expects that
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories.forEach((item) => {
        const subcategories = DEFAULT_CATEGORIES.subcategories.find((subcat) => subcat.parentName === item.name);

        if (subcategories) {
          subcats = [
            ...subcats,
            ...subcategories.values.map((subItem) => ({
              ...subItem,
              parentId: item.id,
              color: item.color,
              userId: user.id,
            })),
          ];
        }
      });

      await categoriesService.bulkCreate({ data: subcats });

      // set defaultCategoryId so the undefined mcc codes will use it
      const defaultCategory = categories.find((item) => item.name === DEFAULT_CATEGORIES.names.other);

      if (!defaultCategory) {
        // TODO: return UnexpectedError, but move descriptive message to logger, so users won't see this internal issue
        throw new UnexpectedError(
          API_ERROR_CODES.unexpected,
          "Cannot find 'defaultCategoryId' in the previously create categories.",
        );
      } else {
        try {
          const updatedUser = await userService.updateUser({
            defaultCategoryId: defaultCategory.id,
            id: user.id,
          });
          if (updatedUser) user = updatedUser;
        } catch (err) {
          logger.error(err as Error);
        }
      }

      return user;
    } catch (err) {
      logger.error(err as Error);
      throw err;
    }
  },
  {
    isolationLevel: connection.Sequelize.Transaction.ISOLATION_LEVELS.READ_UNCOMMITTED,
  },
);
