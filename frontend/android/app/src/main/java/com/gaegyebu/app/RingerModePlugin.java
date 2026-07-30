package com.gaegyebu.app;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RingerMode")
public class RingerModePlugin extends Plugin {
    @PluginMethod
    public void getRingerMode(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int mode = am.getRingerMode();
        // 2 = RINGER_MODE_NORMAL, 1 = VIBRATE, 0 = SILENT
        JSObject result = new JSObject();
        result.put("mode", mode);
        result.put("isSoundOn", mode == AudioManager.RINGER_MODE_NORMAL);
        call.resolve(result);
    }
}
