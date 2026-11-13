import { createSign, sign as cryptoSign } from 'node:crypto';
import http2 from 'node:http2';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Push notifications to the Farm Fresh Direct phone app.
//
// Phones register in push_devices (db/push_devices.sql) through
// /api/push/register. Android phones are reached through Google's Firebase
// Cloud Messaging, iPhones straight through Apple's push service. Each needs
// its keys in the server's environment; without them that platform is simply
// skipped, so the site works the same with or without notifications.
//
//   Android: FIREBASE_SERVICE_ACCOUNT  (the service account JSON from Firebase,
//            as it is, or base64-encoded)
//   iPhone:  APNS_KEY (the .p8 key's text), APNS_KEY_ID, APNS_TEAM_ID,
//            APNS_SANDBOX=true only for builds run straight from Xcode
//            (TestFlight and the App Store use the live service)
//
// A notification is a courtesy on top of the email, never instead of it:
// sending never throws, and a failure is only logged.

export type PushMessage = {
  title: string;
  body: string;
  // The page to open when the notification is tapped, e.g. "/orders".
  url?: string;
};

const APP_ID = 'online.farmfreshdirect.app';

export function pushConfigured() {
  return { android: Boolean(firebaseAccount()), ios: Boolean(apnsSettings()) };
}

export async function sendPush(userIds: (string | null | undefined)[], message: PushMessage) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const configured = pushConfigured();
  if (!configured.android && !configured.ios) return;

  try {
    const { data: devices, error } = await supabaseAdmin
      .from('push_devices')
      .select('token, platform')
      .in('user_id', ids);
    if (error) throw error;

    const dead: string[] = [];
    await Promise.all(
      (devices || []).map(async (device) => {
        const result =
          device.platform === 'android'
            ? configured.android
              ? await sendToAndroid(device.token, message)
              : 'skipped'
            : configured.ios
              ? await sendToIphone(device.token, message)
              : 'skipped';
        if (result === 'gone') dead.push(device.token);
      })
    );
    // Phones that uninstalled the app or turned notifications off.
    if (dead.length) await supabaseAdmin.from('push_devices').delete().in('token', dead);
  } catch (err: any) {
    console.error('push: could not send', err?.message || err);
  }
}

type SendResult = 'sent' | 'gone' | 'failed' | 'skipped';

const trimText = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// ---------- Android: Firebase Cloud Messaging ----------

function firebaseAccount(): { project_id: string; client_email: string; private_key: string; token_uri?: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const account = JSON.parse(text);
    return account.project_id && account.client_email && account.private_key ? account : null;
  } catch {
    return null;
  }
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

let googleToken: { value: string; expires: number } | null = null;

async function googleAccessToken() {
  if (googleToken && googleToken.expires > Date.now() + 60_000) return googleToken.value;
  const account = firebaseAccount()!;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  )}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in for push failed: ${json.error || res.status}`);
  googleToken = { value: json.access_token, expires: Date.now() + Number(json.expires_in || 3600) * 1000 };
  return googleToken.value;
}

async function sendToAndroid(token: string, message: PushMessage): Promise<SendResult> {
  try {
    const account = firebaseAccount()!;
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await googleAccessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: trimText(message.title, 100), body: trimText(message.body, 240) },
          data: message.url ? { url: message.url } : {},
          android: { priority: 'high', notification: { color: '#047857' } },
        },
      }),
    });
    if (res.ok) return 'sent';
    const text = await res.text();
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(text)) {
      return 'gone';
    }
    console.error('push: Android send failed', res.status, text.slice(0, 300));
    return 'failed';
  } catch (err: any) {
    console.error('push: Android send failed', err?.message || err);
    return 'failed';
  }
}

// ---------- iPhone: Apple Push Notification service ----------

function apnsSettings() {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  return {
    // Keys pasted into an environment variable often lose their line breaks.
    key: key.includes('\\n') ? key.replace(/\\n/g, '\n') : key,
    keyId,
    teamId,
    host: process.env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  };
}

let appleToken: { value: string; made: number } | null = null;

// Apple's sign-in for sending, renewed every 50 minutes (it lasts an hour).
function appleProviderToken() {
  if (appleToken && Date.now() - appleToken.made < 50 * 60_000) return appleToken.value;
  const settings = apnsSettings()!;
  const unsigned = `${base64url(JSON.stringify({ alg: 'ES256', kid: settings.keyId }))}.${base64url(
    JSON.stringify({ iss: settings.teamId, iat: Math.floor(Date.now() / 1000) })
  )}`;
  const signature = cryptoSign('sha256', Buffer.from(unsigned), { key: settings.key, dsaEncoding: 'ieee-p1363' });
  appleToken = { value: `${unsigned}.${base64url(signature)}`, made: Date.now() };
  return appleToken.value;
}

function sendToIphone(token: string, message: PushMessage): Promise<SendResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SendResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const settings = apnsSettings()!;
      const client = http2.connect(settings.host);
      client.on('error', (err) => {
        console.error('push: iPhone connection failed', err.message);
        finish('failed');
      });
      const body = JSON.stringify({
        aps: { alert: { title: trimText(message.title, 100), body: trimText(message.body, 240) }, sound: 'default' },
        url: message.url || '/',
      });
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${appleProviderToken()}`,
        'apns-topic': APP_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let reply = '';
      req.setEncoding('utf8');
      req.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      req.on('data', (chunk) => {
        reply += chunk;
      });
      req.on('end', () => {
        client.close();
        if (status === 200) return finish('sent');
        if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(reply)) return finish('gone');
        console.error('push: iPhone send failed', status, reply.slice(0, 300));
        finish('failed');
      });
      req.on('error', (err) => {
        client.close();
        console.error('push: iPhone send failed', err.message);
        finish('failed');
      });
      req.setTimeout(10_000, () => {
        req.close();
        client.close();
        finish('failed');
      });
      req.end(body);
    } catch (err: any) {
      console.error('push: iPhone send failed', err?.message || err);
      finish('failed');
    }
  });
}
