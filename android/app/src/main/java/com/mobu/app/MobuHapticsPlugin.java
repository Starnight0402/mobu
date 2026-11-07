package com.mobu.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native haptics for the web app (src/lib/haptics.ts).
 *
 * navigator.vibrate can only buzz the motor on and off. Phones like the Galaxy
 * S series have a much better actuator, and apps like Gemini reach it through
 * two Android APIs, which this plugin exposes by name:
 *
 *  - View.performHapticFeedback: the system's own tuned effects (key taps,
 *    ticks, toggles, confirm/reject). One UI maps these to Samsung's haptic
 *    engine, and they follow the phone's own touch-feedback setting.
 *  - VibrationEffect.Composition primitives (API 30+): crisp clicks, ticks,
 *    thuds and rises, combined into small expressive effects (send, heart).
 *
 * Every effect falls back step by step on phones without those APIs.
 */
@CapacitorPlugin(name = "MobuHaptics")
public class MobuHapticsPlugin extends Plugin {

    private Vibrator vibrator;

    @Override
    public void load() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    @PluginMethod
    public void perform(PluginCall call) {
        String type = call.getString("type", "tap");
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            try {
                ret.put("via", play(type));
            } catch (Exception e) {
                ret.put("via", "failed");
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("hasVibrator", vibrator != null && vibrator.hasVibrator());
        ret.put("amplitudeControl", vibrator != null && Build.VERSION.SDK_INT >= 26 && vibrator.hasAmplitudeControl());
        ret.put("primitives", Build.VERSION.SDK_INT >= 30 && supports(
                VibrationEffect.Composition.PRIMITIVE_CLICK,
                VibrationEffect.Composition.PRIMITIVE_TICK,
                VibrationEffect.Composition.PRIMITIVE_THUD,
                VibrationEffect.Composition.PRIMITIVE_QUICK_RISE,
                VibrationEffect.Composition.PRIMITIVE_QUICK_FALL));
        call.resolve(ret);
    }

    // -------------------------------------------------------------------------

    private static final int SDK = Build.VERSION.SDK_INT;

    private String play(String type) {
        switch (type) {
            // Everyday touches: the system's own feedback.
            case "tap":
                return feedback(HapticFeedbackConstants.VIRTUAL_KEY);
            case "select":
                return feedback(SDK >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK);
            case "tick":
                return feedback(SDK >= 34 ? HapticFeedbackConstants.SEGMENT_FREQUENT_TICK : HapticFeedbackConstants.CLOCK_TICK);
            case "toggleOn":
                return feedback(SDK >= 34 ? HapticFeedbackConstants.TOGGLE_ON : HapticFeedbackConstants.CONTEXT_CLICK);
            case "toggleOff":
                return feedback(SDK >= 34 ? HapticFeedbackConstants.TOGGLE_OFF : HapticFeedbackConstants.CLOCK_TICK);
            case "threshold":
                return feedback(SDK >= 34 ? HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE : HapticFeedbackConstants.CONTEXT_CLICK);
            case "longPress":
                return feedback(HapticFeedbackConstants.LONG_PRESS);
            case "success":
                if (SDK >= 30) return feedback(HapticFeedbackConstants.CONFIRM);
                return predefined(VibrationEffect.EFFECT_DOUBLE_CLICK, 20);
            case "warning":
            case "error":
                if (SDK >= 30) return feedback(HapticFeedbackConstants.REJECT);
                return predefined(VibrationEffect.EFFECT_HEAVY_CLICK, 40);

            // Expressive moments: composed from primitives.
            case "send":
                // A short swell into a crisp click: the message leaving.
                return compose(
                        new int[] {primRise(), primClick()},
                        new float[] {0.35f, 0.8f},
                        new int[] {0, 25},
                        VibrationEffect.EFFECT_CLICK);
            case "receive":
                return compose(
                        new int[] {primTick(), primTick()},
                        new float[] {0.55f, 0.3f},
                        new int[] {0, 70},
                        VibrationEffect.EFFECT_TICK);
            case "message":
                return compose(
                        new int[] {primClick(), primClick()},
                        new float[] {0.6f, 0.4f},
                        new int[] {0, 120},
                        VibrationEffect.EFFECT_DOUBLE_CLICK);
            case "heart":
                // Lub-dub.
                return compose(
                        new int[] {primClick(), primClick()},
                        new float[] {1.0f, 0.55f},
                        new int[] {0, 110},
                        VibrationEffect.EFFECT_DOUBLE_CLICK);
            case "recordStart":
                return compose(
                        new int[] {primRise()},
                        new float[] {0.7f},
                        new int[] {0},
                        VibrationEffect.EFFECT_HEAVY_CLICK);
            case "recordStop":
                return compose(
                        new int[] {primFall(), primTick()},
                        new float[] {0.6f, 0.5f},
                        new int[] {0, 15},
                        VibrationEffect.EFFECT_CLICK);
            case "delete":
                return compose(
                        new int[] {primThud()},
                        new float[] {0.75f},
                        new int[] {0},
                        VibrationEffect.EFFECT_HEAVY_CLICK);
            case "reveal":
                return compose(
                        new int[] {SDK >= 31 ? VibrationEffect.Composition.PRIMITIVE_LOW_TICK : primTick()},
                        new float[] {0.8f},
                        new int[] {0},
                        VibrationEffect.EFFECT_TICK);
            default:
                return feedback(HapticFeedbackConstants.VIRTUAL_KEY);
        }
    }

    private static int primClick() { return VibrationEffect.Composition.PRIMITIVE_CLICK; }
    private static int primTick() { return VibrationEffect.Composition.PRIMITIVE_TICK; }
    private static int primThud() { return VibrationEffect.Composition.PRIMITIVE_THUD; }
    private static int primRise() { return VibrationEffect.Composition.PRIMITIVE_QUICK_RISE; }
    private static int primFall() { return VibrationEffect.Composition.PRIMITIVE_QUICK_FALL; }

    /** The system's tuned effect. Returns false (and plays nothing) when the
     *  user has turned touch feedback off, which is respected on purpose. */
    private String feedback(int constant) {
        View view = getBridge() != null ? getBridge().getWebView() : null;
        if (view == null) return "none";
        return view.performHapticFeedback(constant) ? "feedback" : "feedback-off";
    }

    private boolean supports(int... primitives) {
        if (vibrator == null || SDK < 30) return false;
        try {
            return vibrator.areAllPrimitivesSupported(primitives);
        } catch (Exception e) {
            return false;
        }
    }

    private String compose(int[] primitives, float[] scales, int[] delays, int fallbackEffect) {
        if (vibrator == null || !vibrator.hasVibrator()) return "none";
        if (SDK >= 30 && supports(primitives)) {
            VibrationEffect.Composition c = VibrationEffect.startComposition();
            for (int i = 0; i < primitives.length; i++) c.addPrimitive(primitives[i], scales[i], delays[i]);
            vibrate(c.compose());
            return "composition";
        }
        return predefined(fallbackEffect, 18);
    }

    private String predefined(int effect, int fallbackMs) {
        if (vibrator == null || !vibrator.hasVibrator()) return "none";
        if (SDK >= 29) {
            vibrate(VibrationEffect.createPredefined(effect));
            return "predefined";
        }
        if (SDK >= 26) {
            vibrate(VibrationEffect.createOneShot(fallbackMs, VibrationEffect.DEFAULT_AMPLITUDE));
            return "oneshot";
        }
        vibrator.vibrate(fallbackMs);
        return "legacy";
    }

    /** Tagged as touch feedback, so the phone's touch-intensity setting applies. */
    private void vibrate(VibrationEffect effect) {
        if (SDK >= 33) {
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH));
        } else {
            vibrator.vibrate(effect, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
        }
    }
}
