package com.smsdashboard.bridge;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

public class WhatsAppNotificationListener
        extends NotificationListenerService {

    private static final String TAG = "WhatsAppListener";

    private static final String WHATSAPP_PACKAGE = "com.whatsapp";
    private static final String WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b";

    private static final String PREFS_NAME = "bridge";
    private static final String DEFAULT_SERVER = "https://sms-dashboard-gamma.vercel.app";

    private static final long DUPLICATE_WINDOW_MS = 2 * 60 * 1000L;

    // =====================================================
    // WORD LISTS
    // =====================================================

    private static final String[] BUSINESS_NAMES = {
            "amazon", "myntra", "flipkart", "shoprocket", "policybazaar", "policy bazaar",
            "razorpay", "swiggy", "zomato", "uber", "ola", "blinkit", "zepto", "meesho",
            "ajio", "nykaa", "paytm", "phonepe", "phone pe", "gpay", "google pay", "cred",
            "airtel", "jio", "vi", "irctc", "makemytrip", "make my trip", "goibibo",
            "cleartrip", "booking.com", "airbnb", "dominos", "domino's", "mcdonald",
            "tata", "hdfc", "icici", "axis bank", "sbi", "state bank", "kotak", "idfc",
            "indusind", "cars24", "cars 24", "sellright", "hero fincorp", "h&m",
            "hm india", "meatigo", "spinny", "urban company", "pronto", "kimirica"
    };

    private static final String[] SENDER_PATTERNS = {
            "official", "support", "customer support", "customer care", "service",
            "services", "no-reply", "noreply", "notification", "notifications", "alert",
            "alerts", "team", "helpdesk", "help desk", "sales", "billing", "payments",
            "payment", "verification", "pharmacy"
    };

    private static final String[] SERVICE_KEYWORDS = {
            "order", "delivery", "delivered", "shipment", "shipped", "tracking",
            "tracking id", "tracking number", "invoice", "refund", "return", "payment",
            "payment received", "payment failed", "transaction", "purchase", "booking",
            "ticket", "reservation", "insurance", "policy", "premium", "claim", "loan",
            "emi", "bank", "account update", "account verification", "verification code",
            "verification", "otp", "one-time password", "one time password", "passcode",
            "login code", "security code", "support request", "service request",
            "request received", "request confirmed", "confirmation", "confirmed",
            "reminder", "renewal", "renew", "subscription", "application",
            "application status", "complaint", "grievance", "inspection", "schedule",
            "scheduling", "pickup", "delivery agent", "your package", "your order",
            "your account", "your request", "your booking", "your payment",
            "your policy", "your loan", "your inspection"
    };

    // =====================================================
    // REGEX
    // =====================================================

    private static final Pattern OTP_KEYWORD = Pattern.compile(
            "\\b(otp|one[- ]?time|verification code|passcode|login code|security code)\\b");

    private static final Pattern CODE = Pattern.compile("(?<!\\d)\\d{4,8}(?!\\d)");

    private static final Map<String, Pattern> WORD_PATTERNS = new HashMap<>();

    // =====================================================
    // DUPLICATES (in memory, time window)
    // =====================================================

    private final Map<String, Long> recent = new LinkedHashMap<>();

    // =====================================================
    // MAIN
    // =====================================================

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {

        if (sbn == null) return;

        String packageName = sbn.getPackageName();

        if (!WHATSAPP_PACKAGE.equals(packageName)
                && !WHATSAPP_BUSINESS_PACKAGE.equals(packageName)) {
            return;
        }

        try {

            Notification notification = sbn.getNotification();
            if (notification == null) return;

            // Group summary ("34 messages from 10 chats")
            if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
                return;
            }

            Bundle extras = notification.extras;
            if (extras == null) return;

            String title = extras.getString(Notification.EXTRA_TITLE, "");
            String message = extractFullMessage(extras);

            Log.d(TAG, "WhatsApp notification | Title: " + title + " | Message: " + message);

            if (message == null || message.trim().isEmpty()) return;

            if (isWhatsAppSystemNotification(title, message)) {
                Log.d(TAG, "Ignoring WhatsApp system notification");
                return;
            }

            if (isWhatsAppGroupNotification(title, message)) {
                Log.d(TAG, "Ignoring WhatsApp group notification");
                return;
            }

            if (isDuplicate(packageName + "|" + title + "|" + message)) {
                Log.d(TAG, "Ignoring duplicate WhatsApp notification");
                return;
            }

            if (shouldForward(title, message)) {
                Log.d(TAG, "Business/service WhatsApp message detected");
                sendToDashboard(title, message);
                return;
            }

            Log.d(TAG, "Ignoring likely personal WhatsApp message");

        } catch (Exception e) {
            Log.e(TAG, "Error processing WhatsApp notification", e);
        }
    }

    // =====================================================
    // MESSAGE EXTRACTION
    // =====================================================

    private String extractFullMessage(Bundle extras) {

        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (big != null && !big.toString().trim().isEmpty()) {
            return big.toString().trim();
        }

        CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
        if (text != null && !text.toString().trim().isEmpty()) {
            return text.toString().trim();
        }

        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);

        if (lines != null && lines.length > 0) {

            StringBuilder builder = new StringBuilder();

            for (CharSequence line : lines) {

                if (line == null) continue;

                String s = line.toString().trim();
                if (s.isEmpty()) continue;

                if (builder.length() > 0) builder.append("\n");
                builder.append(s);
            }

            if (builder.length() > 0) return builder.toString().trim();
        }

        return "";
    }

    // =====================================================
    // SYSTEM / GROUP FILTERS
    // =====================================================

    private boolean isWhatsAppSystemNotification(String title, String message) {

        String t = normalize(title);
        String m = normalize(message);

        boolean whatsappTitle = t.equals("whatsapp") || t.equals("whatsapp business");

        if (!whatsappTitle) return false;

        if (m.equals("new messages")) return true;
        if (m.matches(".*\\b\\d+\\s+messages?\\s+from\\s+\\d+\\s+chats?.*")) return true;
        if (m.matches(".*\\b\\d+\\s+messages?.*") && m.contains("chats")) return true;

        String combined = t + " " + m;

        String[] phrases = {
                "checking for new messages", "messages from chats", "message from chats",
                "chat backup", "backup completed", "backup is complete",
                "restoring messages", "restoring chats", "restoring media",
                "connected to whatsapp", "whatsapp web is active", "whatsapp web",
                "whatsapp is running", "syncing messages", "syncing chats"
        };

        for (String phrase : phrases) {
            if (combined.contains(phrase)) return true;
        }

        return false;
    }

    private boolean isWhatsAppGroupNotification(String title, String message) {

        String cleanTitle = title == null ? "" : title.trim();
        String combined = (cleanTitle + " " + (message == null ? "" : message.trim()))
                .toLowerCase(Locale.ROOT);

        // "[faff] Tech Bug reporting (44 messages): Jervin"
        if (cleanTitle.matches(".*\\(\\d+\\s+messages?\\).*")) return true;

        if (combined.matches(".*\\b\\d+\\s+messages?\\s+from\\s+\\d+\\s+chats?.*")) return true;

        return combined.contains("messages from")
                && (cleanTitle.equalsIgnoreCase("whatsapp")
                || cleanTitle.equalsIgnoreCase("whatsapp business"));
    }

    // =====================================================
    // FORWARD DECISION
    //
    // Needs at least ONE strong signal (OTP / business name /
    // business sender word) before the score is even considered.
    // Unsaved phone-number chats are forwarded only if they are OTPs.
    // =====================================================

    private boolean shouldForward(String title, String message) {

        String t = normalize(title);
        String m = normalize(message);

        boolean otp = isOtpMessage(m);

        if (looksLikePhoneNumber(title)) {
            return otp;
        }

        boolean businessTitle = false;
        for (String b : BUSINESS_NAMES) {
            if (hasWord(t, b)) {
                businessTitle = true;
                break;
            }
        }

        boolean senderPattern = false;
        for (String p : SENDER_PATTERNS) {
            if (hasWord(t, p)) {
                senderPattern = true;
                break;
            }
        }

        if (!(otp || businessTitle || senderPattern)) {
            return false;
        }

        int score = calculateBusinessScore(t, m, otp, businessTitle);

        Log.d(TAG, "Business score: " + score + " | Title: " + title);

        return score >= 3;
    }

    // OTP = keyword AND a 4-8 digit code, in the MESSAGE only (never the title)
    private boolean isOtpMessage(String normalizedMessage) {
        return OTP_KEYWORD.matcher(normalizedMessage).find()
                && CODE.matcher(normalizedMessage).find();
    }

    private boolean looksLikePhoneNumber(String title) {

        if (title == null) return false;

        String t = title.trim();

        return t.matches("^[+\\d\\s\\-()]+$")
                && t.replaceAll("\\D", "").length() >= 10;
    }

    // =====================================================
    // SCORE
    // =====================================================

    private int calculateBusinessScore(
            String title,
            String message,
            boolean otp,
            boolean businessTitle
    ) {

        String combined = title + " " + message;

        int score = 0;

        for (String business : BUSINESS_NAMES) {
            if (hasWord(title, business)) {
                score += 5;
            } else if (hasWord(message, business)) {
                score += 3;
            }
        }

        for (String pattern : SENDER_PATTERNS) {
            if (hasWord(title, pattern)) score += 2;
        }

        for (String keyword : SERVICE_KEYWORDS) {
            if (hasWord(combined, keyword)) score += 1;
        }

        if (otp) score += 5;

        if (message.contains("dear customer")
                || message.contains("hi customer")
                || message.contains("hello customer")) {
            score += 2;
        }

        if (message.contains("click below")
                || message.contains("click here")
                || message.contains("please confirm")
                || message.contains("please share")) {
            score += 1;
        }

        if (!businessTitle) {

            String[] personal = {
                    "hii", "hi", "hello", "hey", "good morning", "good night",
                    "good evening", "how are you", "where are you",
                    "what are you doing", "call me", "come here", "okay", "ok",
                    "bro", "dude", "machan", "da", "chetta", "edi", "eda"
            };

            for (String p : personal) {
                if (message.equals(p)) score -= 5;
            }
        }

        return score;
    }

    // =====================================================
    // HELPERS
    // =====================================================

    // Whole-word match: "vi" does not match "video", "ola" does not match "cola"
    private boolean hasWord(String text, String word) {

        if (text == null || text.isEmpty()) return false;

        Pattern pattern;

        synchronized (WORD_PATTERNS) {

            pattern = WORD_PATTERNS.get(word);

            if (pattern == null) {
                pattern = Pattern.compile(
                        "(?<![a-z0-9])" + Pattern.quote(word) + "(?![a-z0-9])");
                WORD_PATTERNS.put(word, pattern);
            }
        }

        return pattern.matcher(text).find();
    }

    private String normalize(String value) {

        if (value == null) return "";

        return value
                .toLowerCase(Locale.ROOT)
                .replace("\n", " ")
                .replace("\r", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private boolean isDuplicate(String key) {

        synchronized (recent) {

            long now = System.currentTimeMillis();

            Iterator<Map.Entry<String, Long>> it = recent.entrySet().iterator();

            while (it.hasNext()) {
                if (now - it.next().getValue() > DUPLICATE_WINDOW_MS) {
                    it.remove();
                }
            }

            if (recent.containsKey(key)) return true;

            recent.put(key, now);

            return false;
        }
    }

    // =====================================================
    // SEND
    // =====================================================

    private void sendToDashboard(String sender, String message) {

        SharedPreferences preferences =
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        final String server = preferences.getString("server", DEFAULT_SERVER);
        final String token = preferences.getString("token", "");

        if (server == null || server.trim().isEmpty()) {
            Log.e(TAG, "Server URL is empty");
            return;
        }

        if (token == null || token.trim().isEmpty()) {
            Log.e(TAG, "API token is empty");
            return;
        }

        new Thread(() -> {

            try {

                String result = Api.sendWhatsApp(
                        server,
                        token,
                        Api.getDeviceId(),
                        sender,
                        message
                );

                Log.d(TAG, "WhatsApp API result: " + result);

            } catch (Exception e) {
                Log.e(TAG, "Failed to send WhatsApp notification", e);
            }

        }).start();
    }
}