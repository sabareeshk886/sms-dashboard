package com.smsdashboard.bridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

/**
 * SMS_RECEIVED only TRIGGERS a scan.
 *
 * SmsInboxMonitor is the single uploader. This avoids duplicates
 * between the broadcast path and the inbox path, and means a failed
 * upload is retried instead of being lost.
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {

        if (intent == null
                || !"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            return;
        }

        Log.d(TAG, "SMS_RECEIVED broadcast received");

        // Logging only, so you can see what the broadcast carried
        try {

            Bundle bundle = intent.getExtras();

            if (bundle != null) {

                Object[] pdus = (Object[]) bundle.get("pdus");
                String format = bundle.getString("format");

                if (pdus != null && pdus.length > 0) {

                    SmsMessage sms = format != null
                            ? SmsMessage.createFromPdu((byte[]) pdus[0], format)
                            : SmsMessage.createFromPdu((byte[]) pdus[0]);

                    if (sms != null) {
                        Log.d(TAG, "Broadcast SMS from " + sms.getDisplayOriginatingAddress());
                    }
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Failed to parse SMS PDU", e);
        }

        // The default SMS app writes the row to the inbox right after the
        // broadcast, so wait a moment and scan a couple of times.
        SmsInboxMonitor monitor = SmsInboxMonitor.getInstance(context);

        monitor.start(); // no-op if already running
        monitor.scanSoon(2500);
        monitor.scanSoon(8000);
    }
}