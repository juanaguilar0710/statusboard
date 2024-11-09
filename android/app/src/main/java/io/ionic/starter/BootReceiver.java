package io.ionic.starter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    // Verifica si la acción es "BOOT_COMPLETED" (el dispositivo ha terminado de encender)
    if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
      Log.d("BootReceiver", "Dispositivo encendido, iniciando la app...");

      // Crear un intento para iniciar la actividad principal de la aplicación
      Intent i = new Intent(context, MainActivity.class);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);  // Necesario para lanzar la actividad desde el background
      context.startActivity(i);  // Inicia la actividad principal
    }
  }
}
