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
    AppCenter.start(getApplication(), "51319bcf-52e4-4942-89e8-47e19529806e", Analytics.class, Crashes.class, Distribute.class);
    super.onCreate(savedInstanceState);
  }

}
