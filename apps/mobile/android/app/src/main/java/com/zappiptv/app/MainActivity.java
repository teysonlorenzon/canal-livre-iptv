package com.zappiptv.app;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZappPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Ao sair do app com vídeo tocando, continua em picture-in-picture. */
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (ZappPlayerPlugin.autoPip) ZappPlayerPlugin.enter(this);
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        ZappPlayerPlugin.notifyPip(isInPictureInPictureMode);
    }
}
