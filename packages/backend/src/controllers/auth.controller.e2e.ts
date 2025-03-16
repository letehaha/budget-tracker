import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ErrorResponse, makeRequest } from '@tests/helpers';

describe('Auth', () => {
  describe('Login', () => {
    it('should return correct error for unexisting user', async () => {
      const res = await makeRequest<ErrorResponse>({
        method: 'post',
        url: '/auth/login',
        payload: {
          username: 'unexisting-user',
          password: 'unexisting-password',
        },
      });

      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toEqual(API_ERROR_CODES.notFound);
    });

    it('should return successful login response', async () => {
      await makeRequest({
        method: 'post',
        url: '/auth/register',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });
      const res = await makeRequest({
        method: 'post',
        url: '/auth/login',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual(API_RESPONSE_STATUS.success);
      expect(res.body.response.token).toContain('Bearer ');
    });

    it('should return error when using invalid password', async () => {
      await makeRequest({
        method: 'post',
        url: '/auth/register',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });
      const res = await makeRequest({
        method: 'post',
        url: '/auth/login',
        payload: {
          username: 'test_user',
          password: 'test_user1',
        },
      });

      expect(res.statusCode).toEqual(401);
      expect(res.body.status).toEqual(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toEqual(API_ERROR_CODES.invalidCredentials);
    });
  });

  describe('Registration', () => {
    it('should return successful registration', async () => {
      const res = await makeRequest({
        method: 'post',
        url: '/auth/register',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual(API_RESPONSE_STATUS.success);
      expect(res.body.response.user.username).toEqual('test_user');
    });

    it('should return error when register existing user', async () => {
      await makeRequest({
        method: 'post',
        url: '/auth/register',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });

      const res = await makeRequest({
        method: 'post',
        url: '/auth/register',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });

      expect(res.statusCode).toEqual(409);
      expect(res.body.status).toEqual(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toEqual(API_ERROR_CODES.userExists);
    });
  });

  describe('Validate token', () => {
    it('should validate token', async () => {
      await makeRequest({
        method: 'post',
        url: '/auth/register',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });

      await makeRequest({
        method: 'post',
        url: '/auth/login',
        payload: {
          username: 'test_user',
          password: 'test_user',
        },
      });

      const validateTokenRes = await makeRequest({
        method: 'get',
        url: '/auth/validate-token',
      });

      expect(validateTokenRes.statusCode).toEqual(200);
    });

    it('Check empty token', async () => {
      const validateTokenRes = await makeRequest({
        method: 'get',
        url: '/auth/validate-token',
        headers: {
          Authorization: '',
        },
      });

      expect(validateTokenRes.statusCode).toEqual(401);
    });

    it('Check invalid token', async () => {
      const validateTokenRes = await makeRequest({
        method: 'get',
        url: '/auth/validate-token',
        headers: {
          Authorization: 'Bearer random token',
        },
      });

      expect(validateTokenRes.statusCode).toEqual(401);
    });
  });
});
