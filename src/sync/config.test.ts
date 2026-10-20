import { describe, expect, it } from 'vitest';
import { firebaseConfigFromEnv } from './config';

const full = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'yarikuri.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'yarikuri',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
};

describe('firebaseConfigFromEnv', () => {
  it('4つそろっていれば接続設定を返す', () => {
    expect(firebaseConfigFromEnv(full)).toEqual({
      apiKey: 'key',
      authDomain: 'yarikuri.firebaseapp.com',
      projectId: 'yarikuri',
      appId: '1:2:web:3',
    });
  });

  it('前後の空白は取り除く', () => {
    expect(firebaseConfigFromEnv({ ...full, VITE_FIREBASE_API_KEY: ' key \n' })?.apiKey).toBe(
      'key',
    );
  });

  it('1つでも欠けているか空なら null', () => {
    expect(firebaseConfigFromEnv({ ...full, VITE_FIREBASE_APP_ID: undefined })).toBeNull();
    expect(firebaseConfigFromEnv({ ...full, VITE_FIREBASE_PROJECT_ID: '  ' })).toBeNull();
    expect(firebaseConfigFromEnv({})).toBeNull();
  });
});
