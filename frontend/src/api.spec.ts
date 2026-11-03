import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, session, setUnauthorizedHandler } from './api';

describe('browser sessions', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => {
    setUnauthorizedHandler(() => {});
    vi.unstubAllGlobals();
  });

  it('restores a saved authenticated user', () => {
    session.save({
      accessToken: 'token',
      user: { id: 'u1', email: 'a@example.com' },
    });
    expect(session.user()).toEqual({ id: 'u1', email: 'a@example.com' });
  });

  it.each(['{broken', 'null', '42', '{"id":4,"email":"a@example.com"}'])(
    'clears invalid saved user data: %s',
    (raw) => {
      sessionStorage.setItem('docintel.user', raw);
      sessionStorage.setItem('docintel.token', 'stale');
      expect(session.user()).toBeNull();
      expect(session.token()).toBeNull();
    },
  );

  it('does not restore a user without a token', () => {
    sessionStorage.setItem(
      'docintel.user',
      JSON.stringify({ id: 'u1', email: 'a@example.com' }),
    );
    expect(session.user()).toBeNull();
  });

  it('clears an expired session and notifies the app', async () => {
    session.save({
      accessToken: 'expired',
      user: { id: 'u1', email: 'a@example.com' },
    });
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
          }),
        ),
    );
    await expect(api.usage()).rejects.toThrow('Your session expired');
    expect(expired).toHaveBeenCalledOnce();
    expect(session.token()).toBeNull();
    expect(session.user()).toBeNull();
  });

  it('keeps an incorrect-password error separate from session expiry', async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: 'Invalid email or password' }),
            { status: 401 },
          ),
        ),
    );
    await expect(api.login('a@example.com', 'wrong')).rejects.toThrow(
      'Invalid email or password',
    );
    expect(expired).not.toHaveBeenCalled();
  });
});
