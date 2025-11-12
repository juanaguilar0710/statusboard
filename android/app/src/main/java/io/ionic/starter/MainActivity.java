package io.ionic.starter;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.content.Intent;
import android.content.ComponentName;
import android.content.Context;
import android.app.ActivityManager;
import android.os.Handler;
import android.util.Log;
import android.view.KeyEvent;
import android.os.PowerManager;
import java.util.List;
import com.microsoft.appcenter.AppCenter;
import com.microsoft.appcenter.analytics.Analytics;
import com.microsoft.appcenter.crashes.Crashes;
import com.microsoft.appcenter.distribute.Distribute;
import com.microsoft.appcenter.distribute.UpdateTrack;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "KioskActivity";
    private PowerManager.WakeLock wakeLock;
    private Handler handler = new Handler();
    private Runnable checkTopAppTask;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Detectar si fue iniciado automáticamente
        boolean autoStarted = getIntent().getBooleanExtra("AUTO_STARTED", false);
        boolean alarmStarted = getIntent().getBooleanExtra("ALARM_STARTED", false);

        if (autoStarted) {
            Log.e(TAG, "🎯🎯🎯 STATUS BOARD INICIADO POR BOOT RECEIVER! 🎯🎯🎯");
        } else if (alarmStarted) {
            Log.e(TAG, "⏰⏰⏰ STATUS BOARD INICIADO POR ALARM RECEIVER! ⏰⏰⏰");
        } else {
            Log.e(TAG, "👤 STATUS BOARD INICIADO MANUALMENTE");
        }

        // App Center configuration
        Distribute.setEnabled(true);
        Distribute.setUpdateTrack(UpdateTrack.PUBLIC);
        Distribute.setEnabledForDebuggableBuild(true);
        Distribute.setListener(new MyDistributeListener());
        AppCenter.start(getApplication(), "d0c67fcb-4607-424f-9ed6-8748ec96ea0e", Analytics.class, Crashes.class, Distribute.class);

        // Kiosk mode setup
        setupKioskMode();
        acquireWakeLock();
        startAppMonitoring();
        startKioskService();

        Log.e(TAG, "🔥🔥🔥 STATUS BOARD COMPLETAMENTE CARGADO! 🔥🔥🔥");
    }

    private void setupKioskMode() {
        // Keep screen on
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    }

    private void acquireWakeLock() {
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StatusBoard:KioskWakeLock");
        wakeLock.acquire();
    }

    private void startAppMonitoring() {
        checkTopAppTask = new Runnable() {
            @Override
            public void run() {
                // Solo monitorear sin forzar
                if (!isAppInForeground()) {
                    Log.d(TAG, "App monitoring: not in foreground");
                }
                handler.postDelayed(this, 5000); // Check every 5 seconds (less aggressive)
            }
        };
        handler.post(checkTopAppTask);
    }

    private boolean isAppInForeground() {
        ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningTaskInfo> tasks = activityManager.getRunningTasks(1);
        if (!tasks.isEmpty()) {
            ComponentName topActivity = tasks.get(0).topActivity;
            return topActivity.getPackageName().equals(getPackageName());
        }
        return false;
    }

    private void bringAppToFront() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(intent);
        Log.d(TAG, "Bringing app to front");
    }

    @Override
    public void onResume() {
        super.onResume();
        setupKioskMode();
        Log.d(TAG, "App resumed");
    }

    @Override
    public void onPause() {
        super.onPause();
        Log.d(TAG, "App paused");
    }

    @Override
    public void onBackPressed() {
        // Allow normal back button behavior
        super.onBackPressed();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (handler != null && checkTopAppTask != null) {
            handler.removeCallbacks(checkTopAppTask);
        }

        // Restart the app if it's destroyed
        restartApp();
    }

    private void startKioskService() {
        Intent serviceIntent = new Intent(this, KioskService.class);
        startService(serviceIntent);
        Log.d(TAG, "Kiosk service started");
    }

    private void restartApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        Log.d(TAG, "App restarted");
    }
}
