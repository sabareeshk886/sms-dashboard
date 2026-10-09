package com.smsdashboard.bridge;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Telephony;
import android.util.Log;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Reads content://sms/inbox directly and uploads every message whose
 * _id is higher than the last successfully uploaded _id (the "watermark").
 *
 * - No date filter, no LIMIT.
 * - Identical OTP bodies are separate messages because _id is unique.
 * - Watermark advances only after the backend confirms delivery.
 * - Old messages are never uploaded again.
 * - First run ever: watermark = current highest _id (existing SMS are NOT uploaded).
 */
public class SmsInboxMonitor {

    private static final String TAG = "SmsInboxMonitor";

    private static final String PREFS_NAME = "bridge";
    private static final String KEY_LAST_ID = "inbox_last_uploaded_id";

    private static final String DEFAULT_SERVER = "https://sms-dashboard-gamma.vercel.app";

    private static final long POLL_MS = 10_000L;
    private static final int MAX_ATTEMPTS = 5;

    private static SmsInboxMonitor instance;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean scanning = new AtomicBoolean(false);
    private final Map<Long, Integer> attempts = new HashMap<>();

    private boolean running = false;
    private ContentObserver observer;

    public static synchronized SmsInboxMonitor getInstance(Context context) {

        if (instance == null) {
            instance = new SmsInboxMonitor(context);
        }

        return instance;
    }

    private SmsInboxMonitor(Context context) {
        this.context = context.getApplicationContext();
    }

    // =====================================================
    // START / STOP
    // =====================================================

    public synchronized void start() {

        if (running) {
            Log.d(TAG, "Monitor already running");
            return;
        }

        if (!hasReadSms()) {
            Log.e(TAG, "READ_SMS permission is not granted");
            return;
        }

        running = true;

        Log.d(TAG, "Starting SMS inbox monitor");

        // Single-thread executor: this always finishes before the first scan
        io.execute(this::initWatermarkOnce);

        observer = new ContentObserver(handler) {
            @Override
            public void onChange(boolean selfChange) {
                scanAsync();
            }
        };

        context.getContentResolver().registerContentObserver(
                Uri.parse("content://sms"),
                true,
                observer
        );

        handler.post(pollRunnable);
    }

    public synchronized void stop() {

        running = false;

        handler.removeCallbacks(pollRunnable);

        if (observer != null) {
            context.getContentResolver().unregisterContentObserver(observer);
            observer = null;
        }

        Log.d(TAG, "SMS inbox monitor stopped");
    }

    /** Called by SmsReceiver so a broadcast triggers a quick scan. */
    public void scanSoon(long delayMs) {
        handler.postDelayed(this::scanAsync, delayMs);
    }

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {

            if (!running) return;

            scanAsync();

            handler.postDelayed(this, POLL_MS);
        }
    };

    private boolean hasReadSms() {

        return Build.VERSION.SDK_INT < 23
                || context.checkSelfPermission(Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;
    }

    // =====================================================
    // WATERMARK (first run only)
    // =====================================================

    private void initWatermarkOnce() {

        SharedPreferences prefs =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        if (prefs.contains(KEY_LAST_ID)) {
            Log.d(TAG, "Watermark already set = " + prefs.getLong(KEY_LAST_ID, -1));
            return;
        }

        long max = 0;

        try (Cursor c = context.getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI,
                new String[]{Telephony.Sms._ID},
                null,
                null,
                null
        )) {

            while (c != null && c.moveToNext()) {
                max = Math.max(max, c.getLong(0));
            }

        } catch (Exception e) {
            Log.e(TAG, "Baseline failed, will retry on next start", e);
            return;
        }

        prefs.edit().putLong(KEY_LAST_ID, max).commit();

        Log.d(TAG, "Baseline watermark set = " + max);
    }

    // =====================================================
    // SCAN
    // =====================================================

    private void scanAsync() {

        if (!scanning.compareAndSet(false, true)) {
            return; // a scan is already running
        }

        io.execute(() -> {

            try {
                scan();
            } catch (Exception e) {
                Log.e(TAG, "SMS inbox scan failed", e);
            } finally {
                scanning.set(false);
            }
        });
    }

    private void scan() {

        if (!hasReadSms()) {
            Log.e(TAG, "READ_SMS permission missing");
            return;
        }

        SharedPreferences prefs =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        long lastId = prefs.getLong(KEY_LAST_ID, -1);

        if (lastId < 0) {
            Log.d(TAG, "Watermark not initialised yet");
            return;
        }

        String server = prefs.getString("server", DEFAULT_SERVER);
        String token = prefs.getString("token", "");

        if (token == null || token.trim().isEmpty()) {
            Log.e(TAG, "API token is empty");
            return;
        }

        String[] projection = {
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
        };

        int rows = 0;
        int uploaded = 0;
        long maxSeen = 0;

        // No selection, no limit: IDs are compared in Java
        try (Cursor c = context.getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI,
                projection,
                null,
                null,
                Telephony.Sms._ID + " ASC"
        )) {

            if (c == null) {
                Log.e(TAG, "SMS inbox query returned null cursor");
                return;
            }

            int idIdx = c.getColumnIndex(Telephony.Sms._ID);
            int addrIdx = c.getColumnIndex(Telephony.Sms.ADDRESS);
            int bodyIdx = c.getColumnIndex(Telephony.Sms.BODY);
            int dateIdx = c.getColumnIndex(Telephony.Sms.DATE);

            if (idIdx < 0 || addrIdx < 0 || bodyIdx < 0 || dateIdx < 0) {
                Log.e(TAG, "Required SMS columns are missing");
                return;
            }

            while (c.moveToNext()) {

                rows++;

                long id = c.getLong(idIdx);
                maxSeen = Math.max(maxSeen, id);

                if (id <= lastId) continue;

                String sender = c.getString(addrIdx);
                String body = c.getString(bodyIdx);
                long date = c.getLong(dateIdx);

                sender = sender == null ? "" : sender.trim();
                body = body == null ? "" : body.trim();

                if (body.isEmpty()) {
                    lastId = id;
                    prefs.edit().putLong(KEY_LAST_ID, lastId).commit();
                    continue;
                }

                Log.d(TAG, "NEW SMS FOUND | ID=" + id + " | Sender=" + sender);

                int code = Api.sendSmsStatus(
                        server,
                        token,
                        Api.getDeviceId(),
                        sender,
                        body,
                        id,
                        date
                );

                boolean delivered = (code >= 200 && code < 300) || code == 409;

                if (code == 401 || code == 403) {
                    Log.e(TAG, "Auth rejected (HTTP " + code
                            + "). Check token. Watermark unchanged.");
                    return;
                }

                boolean permanentFailure = code >= 400
                        && code < 500
                        && code != 408
                        && code != 429
                        && code != 409;

                if (!delivered && !permanentFailure) {

                    // Network error, 5xx, 408, 429: retry the same message next scan
                    int n = attempts.containsKey(id) ? attempts.get(id) + 1 : 1;
                    attempts.put(id, n);

                    Log.e(TAG, "Upload failed | ID=" + id + " | HTTP=" + code
                            + " | attempt=" + n);

                    if (n < MAX_ATTEMPTS) {
                        return; // keep order: stop here, retry later
                    }

                    Log.e(TAG, "Giving up on ID=" + id);
                }

                if (permanentFailure) {
                    Log.e(TAG, "Backend rejected ID=" + id + " (HTTP " + code + "), skipping");
                }

                attempts.remove(id);
                lastId = id;
                prefs.edit().putLong(KEY_LAST_ID, lastId).commit();

                if (delivered) {
                    uploaded++;
                    Log.d(TAG, "Uploaded | ID=" + id + " | Sender=" + sender);
                }
            }
        }

        // SMS database was reset or restored (IDs went backwards)
        if (rows > 0 && maxSeen < lastId) {
            Log.w(TAG, "Inbox IDs are lower than watermark. Resetting to " + maxSeen);
            prefs.edit().putLong(KEY_LAST_ID, maxSeen).commit();
        }

        Log.d(TAG, "Scan complete | rows=" + rows
                + " | uploaded=" + uploaded
                + " | watermark=" + lastId);
    }
}