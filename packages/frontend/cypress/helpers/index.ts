export const generateUnexpectedResponse = () => ({
  statusCode: 500,
  body: {
    status: 'error',
    response: {
      message: 'Unexpected error',
      code: 'UNEXPECTED_ERROR',
    },
  },
});
