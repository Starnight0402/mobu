package com.mobu.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins have to be registered before the bridge starts.
        registerPlugin(MobuHapticsPlugin.class);
        registerPlugin(MobuHealthConnectPlugin.class);
        registerPlugin(MobuSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
