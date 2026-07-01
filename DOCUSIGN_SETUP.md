# DocuSign Setup — NSR Window Catalog

The signing backend is **deployed and wired**. To go live you create a DocuSign
**Integration Key (JWT)** and set **two secrets**. Everything else is already
configured from the connected DocuSign account.

- **Backend:** Supabase Edge Function `docusign-sign`
  → `https://qpjswujpidkirshwirfw.supabase.co/functions/v1/docusign-sign`
- **Account (already detected):** Mathew Kennington · production · `na4.docusign.net`
  - Account ID `6f617c2a-b6fb-435d-ad70-79c433b2447f`
  - User ID `283c379e-3ab9-40b8-9285-da658d14cd6a`
  (Both are baked in as defaults — no need to set them.)

How it works: the app builds a branded proposal PDF (server-side) with invisible
DocuSign anchor tags (`/sig_nsr/`, `/date_nsr/`), creates an envelope, and either
**emails** the client a signing link or opens an **embedded** in-person signing
window. Status is read live from DocuSign, so a signed proposal auto-locks and
moves to **Won**.

---

## Step 1 — Create the Integration Key + RSA keypair

1. Go to **DocuSign Admin → Apps and Keys**: https://apps.docusign.com/admin/api-integrations
   (sign in as `mattk@newstandardrestoration.com`).
2. **Add App and Integration Key** → name it `NSR Window Catalog`.
3. Copy the **Integration Key** (a GUID). → secret `DOCUSIGN_INTEGRATION_KEY`.
4. Under **Authentication**, select **JWT**. Under **Service Integration**,
   click **Generate RSA** and copy the **private key** — the entire block
   including `-----BEGIN RSA PRIVATE KEY-----` … `-----END RSA PRIVATE KEY-----`.
   → secret `DOCUSIGN_PRIVATE_KEY`. (Store it now; DocuSign won't show it again.)
5. Add any **Redirect URI** (required to save), e.g.
   `https://www.docusign.com` — it's only used for the one-time consent in Step 2.
6. **Save.**

## Step 2 — Grant one-time JWT consent

JWT impersonation needs the user to consent once. Open this URL in a browser
(replace `INTEGRATION_KEY` and use the same redirect URI from Step 1):

```
https://account.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=INTEGRATION_KEY&redirect_uri=https://www.docusign.com
```

Sign in as Mathew and click **Allow**. (The redirect landing page doesn't matter —
consent is recorded on click.)

## Step 3 — Set the two Supabase secrets

**Supabase Dashboard → Project → Edge Functions → Manage secrets**, add:

| Secret | Value |
| --- | --- |
| `DOCUSIGN_INTEGRATION_KEY` | the GUID from Step 1 |
| `DOCUSIGN_PRIVATE_KEY` | the full PEM private key from Step 1 |

Optional hardening:
- `APP_SHARED_SECRET` — any random string; if set, the app must send the same
  value as `VITE_SIGN_APP_SECRET` (below).
- `DOCUSIGN_CONNECT_HMAC_KEY` — enables webhook signature verification (Step 5).

> Defaults already applied: `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`,
> `DOCUSIGN_BASE_URI=https://na4.docusign.net`,
> `DOCUSIGN_OAUTH_BASE=account.docusign.com`. Override only if they change.

## Step 4 — Point the app at the backend (Vercel)

Set these env vars on the Vercel project and redeploy (values in `.env.example`):

```
VITE_SIGN_API_URL=https://qpjswujpidkirshwirfw.supabase.co/functions/v1/docusign-sign
VITE_SUPABASE_ANON_KEY=sb_publishable_qIVoBbkgL9YO7MYnDjH5cQ_BaRtg7tD
# VITE_SIGN_APP_SECRET=<same as APP_SHARED_SECRET, only if you set it>
```

Once `VITE_SIGN_API_URL` is present, the **Send for signature** button switches
from the built-in pad to DocuSign automatically.

## Step 5 — (Optional) Push notifications via DocuSign Connect

Status already works without this (the app reads DocuSign live). Add Connect only
if you want instant push updates:

- **DocuSign Admin → Connect → Add configuration (Custom)**
- URL: `https://qpjswujpidkirshwirfw.supabase.co/functions/v1/docusign-sign/webhook`
- Trigger: **Envelope Completed** (and Delivered/Declined/Voided if desired)
- Data format: **JSON**, include recipients
- If you enable **HMAC**, set the same key as `DOCUSIGN_CONNECT_HMAC_KEY`.

---

## Quick test

1. Open an estimate → **Send for signature**.
2. Enter signer name/email, pick **Email** or **Sign in person**, click **Send via DocuSign**.
3. Sign (via the email link or the embedded window), then **Check signature status** —
   the estimate locks and moves to **Won**.

## Troubleshooting

- **`consent_required`** in the error toast → redo Step 2 (consent not granted for this key).
- **`DocuSign auth failed (400)`** → wrong Integration Key, malformed private key
  (must include the BEGIN/END lines), or demo vs production mismatch
  (this account is **production**; keep `DOCUSIGN_OAUTH_BASE=account.docusign.com`).
- **Signature tab misplaced** → adjust `anchorYOffset` on the `signHereTabs` in
  `supabase/functions/docusign-sign/index.ts` and redeploy.
