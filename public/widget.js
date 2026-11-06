/* MWC Wellness Guide — website chatbot widget.
   Add to WordPress (footer / WPCode):  <script src="https://YOUR-API-HOST/widget.js" defer></script>
   Optional: <script>window.MWC_CHAT = { privacyUrl: '/privacy-policy/' }</script> before it. */
(function () {
  if (window.__mwcChat) return; window.__mwcChat = true;
  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var API = (window.MWC_CHAT && window.MWC_CHAT.api) || new URL(script.src).origin;
  var PRIVACY = (window.MWC_CHAT && window.MWC_CHAT.privacyUrl) || '/privacy-policy/';
  var KEY = 'mwc_chat_session';
  var sessionId = null; try { sessionId = localStorage.getItem(KEY); } catch (e) {}
  var consentText = 'I agree to receive wellness tips and offers from My Wellness Community by email. I can unsubscribe at any time.';
  var userTurns = 0, leadShown = false, busy = false;

  var css = '#mwc-c{position:fixed;right:18px;bottom:18px;z-index:99999;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}' +
    '#mwc-b{background:#1E6B52;color:#fff;border:0;border-radius:999px;padding:12px 18px;box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer;font-weight:600}' +
    '#mwc-p{display:none;flex-direction:column;width:min(360px,calc(100vw - 36px));height:min(520px,calc(100vh - 100px));background:#fff;color:#14201A;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden;margin-bottom:10px}' +
    '#mwc-p.o{display:flex}#mwc-h{background:#1E6B52;color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between}' +
    '#mwc-h button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}#mwc-m{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#F3F6F3}' +
    '.mwc-x{max-width:85%;padding:8px 11px;border-radius:12px;white-space:pre-wrap}.mwc-u{align-self:flex-end;background:#1E6B52;color:#fff}.mwc-a{align-self:flex-start;background:#fff;border:1px solid #D9E2DC}' +
    '#mwc-f{display:flex;gap:6px;padding:10px;border-top:1px solid #D9E2DC}#mwc-f input{flex:1;border:1px solid #D9E2DC;border-radius:8px;padding:8px}#mwc-f button,.mwc-l button{background:#1E6B52;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}' +
    '.mwc-l{background:#fff;border:1px solid #D9E2DC;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}.mwc-l input[type=text],.mwc-l input[type=email]{border:1px solid #D9E2DC;border-radius:6px;padding:7px}.mwc-l label{font-size:12.5px;display:flex;gap:6px;align-items:flex-start}' +
    '.mwc-n{font-size:11px;color:#5A6A62;text-align:center;padding:4px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var root = document.createElement('div'); root.id = 'mwc-c';
  root.innerHTML = '<div id="mwc-p" role="dialog" aria-label="MWC Wellness Guide"><div id="mwc-h"><span>MWC Wellness Guide</span><button aria-label="Close">×</button></div><div id="mwc-m"></div>' +
    '<form id="mwc-f"><input aria-label="Your message" placeholder="Ask about wellness or pet care…" maxlength="2000"><button>Send</button></form>' +
    '<div class="mwc-n">General information only, not medical or veterinary advice. <a href="' + PRIVACY + '" target="_blank">Privacy</a></div></div><button id="mwc-b">Wellness help</button>';
  document.body.appendChild(root);
  var panel = root.querySelector('#mwc-p'), msgs = root.querySelector('#mwc-m'), form = root.querySelector('#mwc-f'), input = form.querySelector('input');

  function add(role, text) { var d = document.createElement('div'); d.className = 'mwc-x ' + (role === 'user' ? 'mwc-u' : 'mwc-a'); d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
  function track(ev, p) { try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, p || {})); } catch (e) {} }
  function post(path, body) { return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Error'); return j; }); }); }

  root.querySelector('#mwc-b').onclick = function () { panel.classList.toggle('o'); if (panel.classList.contains('o')) { if (!msgs.children.length) add('assistant', 'Hi! I\'m the MWC Wellness Guide. Are you looking for something for yourself or for a pet?'); input.focus(); track('chatbot_open'); } };
  root.querySelector('#mwc-h button').onclick = function () { panel.classList.remove('o'); };

  form.onsubmit = function (e) {
    e.preventDefault(); var t = input.value.trim(); if (!t || busy) return; input.value = ''; add('user', t); busy = true; userTurns++;
    var pending = add('assistant', '…');
    post('/public/chat', { sessionId: sessionId, message: t, page: location.pathname }).then(function (r) {
      sessionId = r.sessionId; try { localStorage.setItem(KEY, sessionId); } catch (e) {}
      pending.textContent = r.reply; if (userTurns >= 2 && !leadShown) showLead();
    }).catch(function () { pending.textContent = 'Sorry, I can\'t answer right now. Please try again in a moment.'; }).then(function () { busy = false; });
  };

  function showLead() {
    leadShown = true;
    var box = document.createElement('div'); box.className = 'mwc-l';
    box.innerHTML = '<b>Get our free wellness tips by email</b><input type="text" placeholder="First name" aria-label="First name"><input type="email" placeholder="Email" aria-label="Email" required>' +
      '<label><input type="checkbox"> <span></span></label><button type="button">Send me tips</button><small></small>';
    box.querySelector('label span').textContent = consentText;
    msgs.appendChild(box); msgs.scrollTop = msgs.scrollHeight;
    box.querySelector('button').onclick = function () {
      var name = box.querySelector('input[type=text]').value.trim(), email = box.querySelector('input[type=email]').value.trim(), ok = box.querySelector('input[type=checkbox]').checked, note = box.querySelector('small');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.textContent = 'Please enter a valid email.'; return; }
      if (!ok) { note.textContent = 'Please tick the box to agree.'; return; }
      post('/public/lead', { sessionId: sessionId, name: name, email: email, consent: true, consentText: consentText, page: location.href }).then(function () {
        box.innerHTML = '<b>Thanks! Check your inbox soon.</b>'; track('chatbot_lead', { consent: true });
      }).catch(function (e) { note.textContent = e.message; });
    };
  }
  // Affiliate click tracking for GA4 (links need data-offer-id)
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[data-offer-id]'); if (a) track('affiliate_click', { offer_id: a.getAttribute('data-offer-id'), network: a.getAttribute('data-network') || '' }); });
})();
