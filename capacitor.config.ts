import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dtouchmedia.statusboard2',
  appName: 'status-board',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    LiveUpdates: {
      appId: 'e6702712', //development
      //appId: 'e3c5f7bf', // production
      channel: 'Production',
      autoUpdateMethod: 'background',  // Mantenemos 'none' para control manual
      maxVersions: 2
    }
  },
};

export default config;
