package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class TestReceiver extends BroadcastReceiver {
    private static final String TAG = "StatusBoardTest";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.e(TAG, "🧪🧪🧪 TEST RECEIVER ACTIVADO! 🧪🧪🧪");

        // Simular el boot receiver
        BootReceiver bootReceiver = new BootReceiver();
        Intent bootIntent = new Intent(Intent.ACTION_BOOT_COMPLETED);
        bootReceiver.onReceive(context, bootIntent);
    }
}
