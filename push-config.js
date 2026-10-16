/* ALPHAYANTRA push notifications — fill these in once (see README "NOTIFICATIONS"). No Firebase.
   vapidKey = the publicKey shown by https://<your-worker>.workers.dev/keygen (same value as the Worker's VAPID_PUBLIC variable).
   pushApi  = the /exec URL of the deployed push-backend.gs web app (Google Apps Script). */
window.AY_PUSH_CFG={
  vapidKey:"PASTE_VAPID_PUBLIC_KEY",
  pushApi:"PASTE_APPS_SCRIPT_EXEC_URL",
  statesUrl:"trend-states.json"
};
