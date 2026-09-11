import { resolveFormLocation } from './resolve-form-location';

describe('resolveFormLocation', () => {
  it('returns undefined when both coordinates are untouched', () => {
    expect(resolveFormLocation({})).toBeUndefined();
  });

  it('returns null when either coordinate is cleared', () => {
    expect(resolveFormLocation({ latitude: null, longitude: null })).toBeNull();
    expect(resolveFormLocation({ latitude: 50.45, longitude: null })).toBeNull();
    expect(resolveFormLocation({ latitude: undefined, longitude: 30.52 })).toBeNull();
  });

  it('returns the pair when both are set, including zero', () => {
    expect(resolveFormLocation({ latitude: 0, longitude: 0 })).toEqual({ latitude: 0, longitude: 0 });
    expect(resolveFormLocation({ latitude: 50.45, longitude: 30.52 })).toEqual({ latitude: 50.45, longitude: 30.52 });
  });
});
