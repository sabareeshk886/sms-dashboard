package com.smsdashboard.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

 private static final int READ_SMS_REQUEST_CODE = 2001;

 private EditText server;
 private EditText token;
 private TextView status;
 private SharedPreferences p;

 @Override
 protected void onCreate(Bundle b) {
  super.onCreate(b);

  p = getSharedPreferences(
          "bridge",
          MODE_PRIVATE
  );

  LinearLayout l = new LinearLayout(this);
  l.setOrientation(LinearLayout.VERTICAL);
  l.setPadding(35, 45, 35, 25);

  TextView title = new TextView(this);
  title.setText("SMS Dashboard Bridge TEST");
  title.setTextSize(25);
  l.addView(title);

  TextView info = new TextView(this);
  info.setText(
          "Connect this phone to the SMS dashboard."
  );
  info.setPadding(0, 15, 0, 15);
  l.addView(info);

  server = new EditText(this);
  server.setHint("Server URL");
  server.setSingleLine(true);
  server.setText(
          p.getString(
                  "server",
                  "https://sms-dashboard-gamma.vercel.app"
          )
  );
  l.addView(server);

  token = new EditText(this);
  token.setHint("API token");
  token.setSingleLine(true);
  token.setInputType(
          InputType.TYPE_CLASS_TEXT
                  | InputType.TYPE_TEXT_VARIATION_PASSWORD
  );
  token.setText(
          p.getString(
                  "token",
                  ""
          )
  );
  l.addView(token);

  Button save = new Button(this);
  save.setText("Save connection");

  save.setOnClickListener(v -> {

   p.edit()
           .putString(
                   "server",
                   clean(
                           server
                                   .getText()
                                   .toString()
                   )
           )
           .putString(
                   "token",
                   token
                           .getText()
                           .toString()
           )
           .apply();

   status.setText(
           "Saved."
   );

   startSmsInboxMonitor();
  });

  l.addView(save);

  Button access = new Button(this);
  access.setText(
          "Open Notification Access"
  );

  access.setOnClickListener(v -> {

   Intent intent =
           new Intent(
                   Settings
                           .ACTION_NOTIFICATION_LISTENER_SETTINGS
           );

   startActivity(intent);
  });

  l.addView(access);

  Button test = new Button(this);
  test.setText(
          "Send test SMS"
  );

  test.setOnClickListener(v -> {

   new Thread(() -> {

    String r =
            Api.send(
                    clean(
                            server
                                    .getText()
                                    .toString()
                    ),
                    token
                            .getText()
                            .toString(),
                    "Phone Test",
                    "This test came from the TEST Samsung bridge."
            );

    runOnUiThread(
            () -> status.setText(r)
    );

   }).start();
  });

  l.addView(test);

  status = new TextView(this);
  status.setPadding(
          0,
          20,
          0,
          0
  );
  status.setText(
          "Not connected"
  );
  l.addView(status);

  setContentView(l);

  requestSmsPermissionIfNeeded();
 }

 private void requestSmsPermissionIfNeeded() {

  if (
          android.os.Build.VERSION.SDK_INT >= 23
                  && (checkSelfPermission(
                  Manifest.permission.READ_SMS
          )
                  != PackageManager.PERMISSION_GRANTED
                  || checkSelfPermission(
                  Manifest.permission.RECEIVE_SMS
          )
                  != PackageManager.PERMISSION_GRANTED)
  ) {

   status.setText(
           "Requesting SMS permission..."
   );

   requestPermissions(
           new String[]{
                   Manifest.permission.READ_SMS,
                   Manifest.permission.RECEIVE_SMS
           },
           READ_SMS_REQUEST_CODE
   );

  } else {

   startSmsInboxMonitor();
  }
 }

 private void startSmsInboxMonitor() {

  if (
          android.os.Build.VERSION.SDK_INT >= 23
                  && checkSelfPermission(
                  Manifest.permission.READ_SMS
          )
                  != PackageManager.PERMISSION_GRANTED
  ) {

   status.setText(
           "READ_SMS permission required."
   );

   return;
  }

  SmsInboxMonitor
          .getInstance(this)
          .start();

  status.setText(
          "SMS inbox monitor running."
  );
 }

 @Override
 public void onRequestPermissionsResult(
         int requestCode,
         String[] permissions,
         int[] grantResults
 ) {

  super.onRequestPermissionsResult(
          requestCode,
          permissions,
          grantResults
  );

  if (
          requestCode
                  == READ_SMS_REQUEST_CODE
  ) {

   if (
           grantResults.length > 0
                   && grantResults[0]
                   == PackageManager.PERMISSION_GRANTED
   ) {

    startSmsInboxMonitor();

   } else {

    status.setText(
            "READ_SMS permission denied."
    );
   }
  }
 }

 @Override
 protected void onResume() {

  super.onResume();

  if (
          android.os.Build.VERSION.SDK_INT < 23
                  || checkSelfPermission(
                  Manifest.permission.READ_SMS
          )
                  == PackageManager.PERMISSION_GRANTED
  ) {

   if (p != null) {
    startSmsInboxMonitor();
   }
  }
 }

 private String clean(String s) {

  if (s == null) {
   return "";
  }

  s = s.trim();

  while (s.endsWith("/")) {

   s =
           s.substring(
                   0,
                   s.length() - 1
           );
  }

  return s;
 }
}