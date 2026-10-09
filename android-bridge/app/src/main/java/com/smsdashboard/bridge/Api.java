package com.smsdashboard.bridge;

import android.os.Build;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class Api {

    // =====================================================
    // DEVICE
    // =====================================================

    public static String getDeviceId() {

        String manufacturer =
                Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();

        String model =
                Build.MODEL == null ? "" : Build.MODEL.toLowerCase();

        if (manufacturer.contains("samsung") || model.contains("samsung")) {
            return "samsung";
        }

        if (manufacturer.contains("xiaomi")
                || manufacturer.contains("poco")
                || manufacturer.contains("redmi")
                || model.contains("xiaomi")
                || model.contains("poco")
                || model.contains("redmi")) {
            return "poco";
        }

        return "samsung";
    }

    public static String getDeviceName() {
        return getDeviceId().equals("poco") ? "Poco" : "Samsung";
    }

    private static String normalizeDevice(String deviceId) {

        if (deviceId == null || deviceId.trim().isEmpty()) {
            return getDeviceId();
        }

        deviceId = deviceId.toLowerCase().trim();

        if (!deviceId.equals("samsung") && !deviceId.equals("poco")) {
            return getDeviceId();
        }

        return deviceId;
    }

    // =====================================================
    // SMS (returns HTTP status code, -1 on network failure)
    //
    // Used by SmsInboxMonitor.
    // =====================================================

    public static int sendSmsStatus(
            String server,
            String token,
            String deviceId,
            String sender,
            String body,
            long smsId,
            long smsDateMillis
    ) {

        try {

            if (server == null || server.trim().isEmpty()) return -1;
            if (token == null || token.trim().isEmpty()) return -1;

            deviceId = normalizeDevice(deviceId);

            JSONObject json = new JSONObject();
            json.put("sender", sender == null ? "" : sender);
            json.put("body", body == null ? "" : body);
            json.put("device_id", deviceId);

            // Extra fields. Your backend can ignore them or use them to dedupe.
            json.put("external_id", deviceId + ":inbox:" + smsId);
            json.put("sms_timestamp", smsDateMillis);

            return postJson(server, "/api/sms", token, json);

        } catch (Exception e) {
            return -1;
        }
    }

    // =====================================================
    // SMS (string result, kept for older callers)
    // =====================================================

    public static String send(
            String server,
            String token,
            String sender,
            String body
    ) {
        return send(server, token, getDeviceId(), sender, body);
    }

    public static String send(
            String server,
            String token,
            String deviceId,
            String sender,
            String body
    ) {

        try {

            if (server == null || server.trim().isEmpty()) return "Server URL is empty";
            if (token == null || token.trim().isEmpty()) return "API token is empty";

            deviceId = normalizeDevice(deviceId);

            JSONObject json = new JSONObject();
            json.put("sender", sender == null ? "" : sender);
            json.put("body", body == null ? "" : body);
            json.put("device_id", deviceId);

            int code = postJson(server, "/api/sms", token, json);

            if (code >= 200 && code < 300) {
                return "Message sent successfully | Device: " + deviceId;
            }

            return "Server returned HTTP " + code;

        } catch (Exception e) {
            return "Connection failed: " + e.getMessage();
        }
    }

    // =====================================================
    // WHATSAPP
    // =====================================================

    public static String sendWhatsApp(
            String server,
            String token,
            String deviceId,
            String sender,
            String body
    ) {

        try {

            if (server == null || server.trim().isEmpty()) return "Server URL is empty";
            if (token == null || token.trim().isEmpty()) return "API token is empty";

            deviceId = normalizeDevice(deviceId);

            JSONObject json = new JSONObject();
            json.put("sender", sender == null ? "" : sender);
            json.put("body", body == null ? "" : body);
            json.put("device_id", deviceId);

            int code = postJson(server, "/api/whatsapp", token, json);

            if (code >= 200 && code < 300) {
                return "WhatsApp message sent successfully | Device: " + deviceId;
            }

            return "WhatsApp server returned HTTP " + code;

        } catch (Exception e) {
            return "WhatsApp connection failed: " + e.getMessage();
        }
    }

    // =====================================================
    // HTTP
    // =====================================================

    private static int postJson(
            String server,
            String path,
            String token,
            JSONObject json
    ) throws Exception {

        HttpURLConnection connection = null;

        try {

            URL url = new URL(cleanServer(server) + path);

            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setUseCaches(false);

            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token.trim());
            connection.setRequestProperty("Connection", "close");

            try (OutputStream output = connection.getOutputStream()) {
                output.write(json.toString().getBytes(StandardCharsets.UTF_8));
                output.flush();
            }

            int code = connection.getResponseCode();

            // Drain the response so the connection closes cleanly
            InputStream in = code >= 400
                    ? connection.getErrorStream()
                    : connection.getInputStream();

            if (in != null) {
                byte[] buffer = new byte[1024];
                while (in.read(buffer) != -1) {
                    // discard
                }
                in.close();
            }

            return code;

        } finally {

            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String cleanServer(String server) {

        server = server.trim();

        while (server.endsWith("/") && server.length() > 0) {
            server = server.substring(0, server.length() - 1);
        }

        return server;
    }
}