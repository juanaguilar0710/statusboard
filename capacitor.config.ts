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
      appId: '111111',
      channel: 'Production',
      autoUpdateMethod: 'background',  // Mantenemos 'none' para control manual
      maxVersions: 2
    }
  },
};

export default config;
