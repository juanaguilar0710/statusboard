import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dtouchmedia.statusboard2',
  appName: 'status-board',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    LiveUpdates: {
      appId: 'e6702712',
      channel: 'Production',
      autoUpdateMethod: 'background',
      maxVersions: 2
    }
  },
};

export default config;
