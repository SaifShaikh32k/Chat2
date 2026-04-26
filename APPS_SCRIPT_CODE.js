// ================================================================
//  TeamChat — Google Apps Script Backend
//  1. Go to script.google.com → New project
//  2. Delete everything, paste THIS entire file
//  3. Deploy → New deployment → Web App → Execute as Me → Anyone
//  4. Copy the Web App URL → paste into js/config.js as APPS_SCRIPT_URL
// ================================================================

const SHEET_ID   = '1KjAof_mQ0mWblQ68o4PjMLDK4TuyYdBFbXm-YJco_9A';
const PROJECT_ID = 'chatting2-13dfb';
const SA_EMAIL   = 'firebase-adminsdk-fbsvc@chatting2-13dfb.iam.gserviceaccount.com';
const SA_KEY     = '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDMcD1dBg/nI0/j\nJ29/3aobBsu+aBnxGnz1VdcCakiN7x0cdhyw8WruB9MrYvx/3w5E7t9eJW5NBcgx\nSO0PVhnRnbQEFlTfXLdG/N9tzqC0xaiwLbl05TX6h8MdwXYVn/17xDdBFlUu8gGM\ns+fQl9sfz3NeKaVXsnWO1uDxWploH/hJHq5tnLXktLJGxyEmwFxfxoXJboxoqzkq\nMCuRy+hZC0FW/cR+hW6tBtuDvlXosfWKvNYHa5n/NTSFy7bs1mQ8LA5B328yng90\ncy5GVOuaE28Jk/bimlg+HxKxDgT1UPjedpw3R7wt5XOQS+b0YR9OmaQBtSVbzQcf\nzgQhDtq7AgMBAAECggEAC2svej0m8T2PLjxbJXSvlh/cjG+LF2Tn2tonDrr5/3d+\nFENimd16H/5u5Ir8WHYQeXgwILWNgh7TDjGpEAS6n3MkBWBr8CfhEsV4A02Zu08Y\n+3IqXCWbTLl9g/F004NiqKGOhoOlUWByBrZbudJpik7PflBsLEhK+aX13XU2gVLC\nKqZNmyNIhbUm9OcYyhEsqdXXAzmEwYU4aOd73czggPw+wWZSz+AeGihyUbDrD04f\n3kh2spz93KEu8S+01R5UijgQzM1qOfYML3PNblrUJnqqRn8HBVCoiXO/cyuJzCz1\na3e1VmlJCDoPktNZeUhprW9Ia7gD8ogBg9JSDoCogQKBgQD4TVGZ0uUA9kY5lE9v\nDAMfQhPwtoVAzc0U2Ad6Dk02rzGu8th/tORUXyovSy+CG751U2W3HtNxNrAq6I8k\nx2CP7CFuKuNrMt1h0z6ARELezSHFTwQ8zk+goqON+vQEohWFV1onggPAoDBVuAdl\nwo974E4r1b9hNgGkoY/kYNxGgQKBgQDSxsq4Qh3fLFj0aOQwDCAKugD9sX0SL1fV\nxjmQYRHIXgWmRx3gK8oESkHEO/fadr4OyWm5medCKVe20b99SGG/J1TcYjhnNi2y\nqkNoy61ghvN/nboJbrTR9yX+Z8Y4bwOH61H4bH0fx4mzTjg+thxDPqvZ3zW+7ySV\nqcoKA1sbOwKBgFMi2DqPwTtEOhkXTk1ZEUaLAlArXIxpG8xp1H8KgNHZcOIpz1Fb\nCMQzJNW27845adiwtrLMcHFMpUmImjzvQKaPolXXqFOBMVyKtTePI3Cj8DW3Ei0l\nysV3Dxn/t2pBtsDxkW7++jCpseVRe7CXpyEL5kCJDc4Hnh84NQx7XeWBAoGATAhr\n7kXjcrMTr676yZ5GHLh2TQ2umVW8sJ/d+ggaGxZXoWC8FTaWnC+RQ9GCGiuFad4c\nJlivRH2XZ5qIIhBvOj5c7Vb9E7ZGi9HBmVcHxu9HfTyPdIGb9rXZ3cjfh1H8ixZH\nLn8sL7+SG71WqsCUt2kvItvTDnpDzz09ZZlKTysCgYBUIns9wfPXwUFls0gwqhh4\nog2yhD+F1OzUraJpenFZrFaClODIfdtqFB4xThk++OMtc1ZXvVv3cpWsG1OkelrZ\nEUfbgXzQJPal6GA0RWCQGQiCIvkGtGLMD+Nk0suqLIAD00mfqUXBpoTWnLswy2kW\n1MLFuACAQTUeHD+bz2GtCg==\n-----END PRIVATE KEY-----\n';


// ── doGet: handles direct browser/GET requests ───────────────────
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "TeamChat backend is running OK!" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Entry point (POST) ──────────────────────────────────────────
function doPost(e) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    const req = JSON.parse(e.postData.contents);
    let res;
    switch (req.action) {
      case 'login':    res = handleLogin(req.userId, req.password);                  break;
      case 'getUsers': res = handleGetUsers(req.userId);                             break;
      case 'notify':   res = handleNotify(req.token, req.title, req.body, req.data); break;
      default:         res = { success: false, message: 'Unknown action' };
    }
    out.setContent(JSON.stringify(res));
  } catch (err) {
    out.setContent(JSON.stringify({ success: false, message: err.toString() }));
  }
  return out;
}

// ── Login: check UserID + Password against Google Sheet ──────────
function handleLogin(userId, password) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Users');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [id, pass, name] = rows[i];
    if (String(id).trim() === String(userId).trim() &&
        String(pass).trim() === String(password).trim()) {
      return { success: true, user: { userId: String(id).trim(), displayName: String(name).trim() } };
    }
  }
  return { success: false, message: 'Invalid ID or password.' };
}

// ── Get all users except the one currently logged in ─────────────
function handleGetUsers(excludeId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Users');
  const rows  = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, , name] = rows[i];
    const uid = String(id).trim();
    if (uid && uid !== excludeId) {
      users.push({ userId: uid, displayName: String(name).trim() });
    }
  }
  return { success: true, users };
}

// ── Send push notification via FCM v1 ────────────────────────────
function handleNotify(token, title, body, data) {
  try {
    const accessToken = getFCMAccessToken();
    UrlFetchApp.fetch(
      'https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type':  'application/json'
        },
        payload: JSON.stringify({
          message: {
            token: token,
            notification: { title: title, body: body },
            data: data || {}
          }
        }),
        muteHttpExceptions: true
      }
    );
    return { success: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ── Generate OAuth2 access token from service account JWT ────────
function getFCMAccessToken() {
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  };
  const header  = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify(claim));
  const toSign  = header + '.' + payload;
  const sig     = b64u(Utilities.computeRsaSha256Signature(toSign, SA_KEY));
  const jwt     = toSign + '.' + sig;

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt
    }
  });
  return JSON.parse(resp.getContentText()).access_token;
}

function b64u(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}
