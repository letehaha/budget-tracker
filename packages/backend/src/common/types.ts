import { API_RESPONSE_STATUS } from '@bt/shared/types';
import Users from '@models/Users.model';
import * as Express from 'express';
import { InferAttributes, Model } from 'sequelize';
import { ZodIssue, z } from 'zod';

// Enforce res.json(object) to always have `status` field and optional `response`
// with ability to pass `response` type using res.json<Type>()
export type ResponseSend<T = Response> = {
  <ResBody>(body: { response?: ResBody; validationErrors?: ZodIssue[]; status: API_RESPONSE_STATUS }): T;
};
export interface CustomRequest<T extends z.ZodType> extends Express.Request {
  validated: z.infer<T>;
  user: InferAttributes<Users, { omit: keyof Model }>;
}
export interface CustomResponse extends Express.Response {
  json: ResponseSend<this>;
}

// export type ValidatedRequestHandler<T extends z.ZodType> = (
//   req: CustomRequest<T>,
//   res: CustomResponse,
//   next: Express.NextFunction,
// ) => Promise<void | CustomResponse>;

export type ValidatedRequestHandler<T extends z.ZodType> = (
  req: CustomRequest<T>,
  res: CustomResponse,
  next: Express.NextFunction,
) => Promise<void | CustomResponse> | void;

// export type ValidatedRequestHandler<T extends z.ZodType> = Express.RequestHandler<any, any, any>

// export type ValidatedRequestHandler<T extends z.ZodType> = Express.RequestHandler<
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   any,
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   any,
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   BodyPayload,
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   any,
//   {
//     validated: z.infer<T>;
//     user: InferAttributes<Users, { omit: keyof Model }>;
//     requestId?: string;
//     [SESSION_ID_KEY_NAME]?: string | null;
//   }
// >;

export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
export type UnwrapArray<T> = T extends (infer U)[] ? U : T;

export const SESSION_ID_KEY_NAME = 'sessionId';
