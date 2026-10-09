package com.smsdashboard.bridge;
import android.app.Notification; import android.content.*; import android.os.Bundle; import android.service.notification.*;
import java.util.*;
public class SmsNotificationListener extends NotificationListenerService{
 static final Set<String> SMS=new HashSet<>(Arrays.asList("com.samsung.android.messaging","com.google.android.apps.messaging"));
 public void onNotificationPosted(StatusBarNotification sbn){
  if(!SMS.contains(sbn.getPackageName()))return;
  Notification n=sbn.getNotification(); if(n==null||n.extras==null)return;
  Bundle e=n.extras; String sender=e.getString(Notification.EXTRA_TITLE); CharSequence cs=e.getCharSequence(Notification.EXTRA_TEXT);
  if(sender==null||cs==null)return; String body=cs.toString().trim(); if(body.isEmpty())return;
  SharedPreferences p=getSharedPreferences("bridge",0); String server=p.getString("server","https://sms-dashboard-gamma.vercel.app"); String token=p.getString("token","");
  if(token.isEmpty())return;
  new Thread(()->Api.send(server,token,sender,body)).start();
 }
}