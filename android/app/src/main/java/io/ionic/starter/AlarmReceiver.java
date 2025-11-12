package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.os.SystemClock;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "StatusBoardAlarm";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.e(TAG, "⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰");
        Log.e(TAG, "⏰ ALARM RECEIVER ACTIVADO! ⏰");
        Log.e(TAG, "⏰ Iniciando Status Board... ⏰");
        Log.e(TAG, "⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰⏰");

        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            launchIntent.putExtra("ALARM_STARTED", true);

            context.startActivity(launchIntent);
            Log.e(TAG, "✅ STATUS BOARD INICIADO POR ALARM!");

        } catch (Exception e) {
            Log.e(TAG, "❌ ERROR EN ALARM RECEIVER: " + e.getMessage());
        }
    }

    public static void setAlarm(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, AlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Configurar alarma para 30 segundos después del boot como respaldo
        long triggerTime = SystemClock.elapsedRealtime() + 30000;
        alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerTime, pendingIntent);

        Log.e(TAG, "⏰ ALARMA DE RESPALDO CONFIGURADA PARA 30 SEGUNDOS!");
    }
}
