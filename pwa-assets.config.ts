import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// public/icon.svg から favicon・PWA アイコン・マスカブルアイコン・apple-touch-icon を生成する
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // 背景ごと塗りつぶした図柄なので、透過アイコンにも余白を付けない
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // 円形に切り抜かれても硬貨が欠けないよう、背景色で余白を足す
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.1,
      resizeOptions: { background: '#15803d' },
    },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#15803d' } },
  },
  images: ['public/icon.svg'],
});
