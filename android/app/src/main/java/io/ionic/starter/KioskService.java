package io.ionic.starter;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

public class KioskService extends Service {
    private static final String TAG = "StatusBoardService";

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Status Board Service iniciado");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Status Board Service comando recibido");
        return START_STICKY; // Reiniciar el servicio si el sistema lo mata
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // No necesitamos binding
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Status Board Service destruido");

        // Reiniciar el servicio
        Intent restartIntent = new Intent(this, KioskService.class);
        startService(restartIntent);
    }
}
