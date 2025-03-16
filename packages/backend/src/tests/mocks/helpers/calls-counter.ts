import { SetupServerApi } from 'msw/node';

export const createCallsCounter = (mockServerInstance: SetupServerApi, url: RegExp | string) => {
  const counter = {
    count: 0,
    reset: () => {
      counter.count = 0;
    },
  };

  mockServerInstance.events.on('request:start', ({ request }) => {
    if (typeof url === 'string') {
      if (request.url === url) {
        counter.count++;
      }
    } else if (url instanceof RegExp)
      if (request.url.match(url)) {
        counter.count++;
      }
  });

  return counter;
};
