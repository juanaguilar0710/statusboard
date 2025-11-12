package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;
import android.app.ActivityManager;
import java.util.List;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "StatusBoardBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.e(TAG, "████████████████████████████████████████");
        Log.e(TAG, "████ BOOT RECEIVER ACTIVADO! ████");
        Log.e(TAG, "████ Acción: " + action + " ████");
        Log.e(TAG, "████████████████████████████████████████");

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            Intent.ACTION_REBOOT.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            Intent.ACTION_PACKAGE_REPLACED.equals(action)) {

            Log.e(TAG, "🚀 DISPOSITIVO INICIADO - Preparando Status Board...");

            // Configurar alarma de respaldo
            AlarmReceiver.setAlarm(context);

            // Usar Handler en el main looper para asegurar que funciona
            Handler mainHandler = new Handler(Looper.getMainLooper());

            // Esperar más tiempo para que el sistema termine de cargar completamente
            mainHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    Log.e(TAG, "⏰ TIMER ACTIVADO - Iniciando aplicación...");
                    startApp(context);

                    // Intentar de nuevo en caso de que falle la primera vez
                    mainHandler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (!isAppRunning(context)) {
                                Log.e(TAG, "🔄 SEGUNDO INTENTO - Reintentando inicio...");
                                startApp(context);
                            } else {
                                Log.e(TAG, "✅ APP YA ESTÁ EJECUTÁNDOSE!");
                            }
                        }
                    }, 5000);
                }
            }, 8000); // Esperar 8 segundos para asegurar que el sistema esté listo
        }
    }

    private void startApp(Context context) {
        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launchIntent.putExtra("AUTO_STARTED", true);

            context.startActivity(launchIntent);
            Log.e(TAG, "✅✅✅ STATUS BOARD INICIADO CORRECTAMENTE! ✅✅✅");

        } catch (Exception e) {
            Log.e(TAG, "❌❌❌ ERROR AL INICIAR STATUS BOARD: " + e.getMessage());
            Log.e(TAG, "❌ Stack trace completo:");
            e.printStackTrace();
        }
    }

    private boolean isAppRunning(Context context) {
        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningAppProcessInfo> processes = activityManager.getRunningAppProcesses();

        for (ActivityManager.RunningAppProcessInfo process : processes) {
            if (process.processName.equals(context.getPackageName())) {
                Log.d(TAG, "App ya está ejecutándose");
                return true;
            }
        }
        return false;
    }
}
