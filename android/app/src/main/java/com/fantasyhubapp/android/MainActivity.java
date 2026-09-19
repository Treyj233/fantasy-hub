package com.fantasyhubapp.android;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FantasyHubGoogleAuth.class);
        super.onCreate(savedInstanceState);
    }
}
