import { HttpResponse, http } from 'msw';
import { SetupServerApi } from 'msw/node';

type OverrideOptions = {
  status?: number;
  body?: object | string;
};

export const createOverride = (mockServerInstance: SetupServerApi, url: RegExp | string) => {
  const createHandler = (options: OverrideOptions) => {
    return http.all(url, () => {
      return HttpResponse.json(options.body || {}, {
        status: options.status || 200,
      });
    });
  };

  return {
    setOverride: (options: OverrideOptions) => {
      mockServerInstance.use(createHandler(options));
    },
    setOneTimeOverride: (options: OverrideOptions) => {
      mockServerInstance.use(
        http.all(
          url,
          () => {
            return HttpResponse.json(options.body || {}, {
              status: options.status || 200,
            });
          },
          { once: true },
        ),
      );
    },
  };
};
