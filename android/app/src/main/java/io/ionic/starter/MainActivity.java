package io.ionic.starter;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.microsoft.appcenter.AppCenter;
import com.microsoft.appcenter.analytics.Analytics;
import com.microsoft.appcenter.crashes.Crashes;
import com.microsoft.appcenter.distribute.Distribute;
import com.microsoft.appcenter.distribute.UpdateTrack;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    //Adding comment for testing
    Distribute.setEnabled(true);
    Distribute.setUpdateTrack(UpdateTrack.PUBLIC);
    Distribute.setEnabledForDebuggableBuild(true);
    Distribute.setListener(new MyDistributeListener());
    AppCenter.start(getApplication(), "d0c67fcb-4607-424f-9ed6-8748ec96ea0e", Analytics.class, Crashes.class, Distribute.class);
    super.onCreate(savedInstanceState);
  }

}
