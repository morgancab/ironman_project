// Mode test (local uniquement, voir DEV.md) : ?appareil=nom affiche la page à la taille de cet appareil et lui fait croire qu'elle tourne dessus.
// La page n'a aucune logique de test : ce fichier remplace ce qu'elle lit (navigator), avant que son code ne démarre.
(function () {
  var SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  var CHROME_AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  var IOS = { pf: 'iPhone', touch: 5, w: 390, h: 844 }, AND = { pf: 'Linux armv81', touch: 5, w: 412, h: 915 }, PC = { pf: 'Win32', touch: 0, w: 1280, h: 800 };
  function dev(base, groupe, nom, ua, extra) {
    var d = { groupe: groupe, nom: nom, ua: ua, pf: base.pf, touch: base.touch, w: base.w, h: base.h };
    for (var k in extra) d[k] = extra[k];
    return d;
  }
  // prompt : le navigateur propose l'installation directe. installee : l'app est lancée depuis l'écran d'accueil.
  var A = {
    'iphone-safari': dev(IOS, 'iPhone', 'Safari', SAFARI_IOS),
    'iphone-chrome': dev(IOS, 'iPhone', 'Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'),
    'iphone-installee': dev(IOS, 'iPhone', 'App installée', SAFARI_IOS, { installee: true }),
    'ipad-safari': dev(IOS, 'iPad', 'Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', { pf: 'MacIntel', w: 820, h: 1180 }),
    'android-chrome': dev(AND, 'Android', 'Chrome', CHROME_AND, { prompt: true }),
    'android-samsung': dev(AND, 'Android', 'Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'),
    'android-firefox': dev(AND, 'Android', 'Firefox', 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0'),
    'instagram-iphone': dev(IOS, 'Dans une appli', 'Instagram · iPhone', SAFARI_IOS + ' Instagram 350.0.0.0'),
    'facebook-android': dev(AND, 'Dans une appli', 'Facebook · Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]'),
    'ordi-chrome': dev(PC, 'Ordinateur', 'Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', { prompt: true }),
    'ordi-safari': dev(PC, 'Ordinateur', 'Safari (Mac)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', { pf: 'MacIntel', w: 1440, h: 900 }),
    'ordi-firefox': dev(PC, 'Ordinateur', 'Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'),
  };
  window.DEV_APPAREILS = A;

  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/^file:/.test(location.protocol)) return;
  var m = /[?&]appareil=([\w-]+)/.exec(location.search || ''), a = m && A[m[1]], id = a ? m[1] : '';
  var seul = window.top === window, surDev = /\/dev(\.html)?$/.test(location.pathname || '');
  var pm = /[?&]profil=([\w-]+)/.exec(location.search || ''), profil = pm ? pm[1] : '';

  // Liste déroulante des écrans, utilisée dans le bandeau du profil de test et au-dessus de l'aperçu.
  function choix() {
    var s = document.createElement('select'), g = null;
    s.setAttribute('aria-label', 'Écran à simuler');
    s.appendChild(new Option('Cet écran', ''));
    Object.keys(A).forEach(function (k) {
      if (!g || g.label !== A[k].groupe) { g = document.createElement('optgroup'); g.label = A[k].groupe; s.appendChild(g); }
      g.appendChild(new Option(A[k].groupe === 'Dans une appli' ? A[k].nom : A[k].groupe + ' · ' + A[k].nom, k));
    });
    s.value = id;
    s.addEventListener('change', function () {
      var q = location.search.replace(/([?&])(appareil=[\w-]+|reset=1)(&|$)/g, '$1').replace(/&&+/g, '&').replace(/[?&]$/, '');
      if (s.value) q += (q ? '&' : '?') + 'appareil=' + s.value;
      location.href = location.pathname + q + location.hash;
    });
    return s;
  }

  if (!a) {
    if (seul && profil && !surDev) window.addEventListener('load', function () {
      var b = document.getElementById('devbar');
      if (!b) return;
      var s = choix();
      s.setAttribute('style', 'margin-left:8px;max-width:130px;border:0;border-radius:4px;background:rgba(0,0,0,.16);color:#000;font:700 10px/1.5 system-ui,sans-serif;cursor:pointer');
      b.style.pointerEvents = 'auto';
      b.appendChild(s);
    });
    return;
  }

  // Page ouverte directement : on affiche un écran à la bonne taille, et la vraie page tourne dedans.
  // <plaintext> neutralise le reste du document, pour qu'une seule copie de l'app écrive dans le profil.
  if (seul && !surDev) {
    document.write('<body style="margin:0;background:#0b0b0c"><plaintext style="display:none">');
    document.addEventListener('DOMContentLoaded', function () {
      var src = location.href;
      history.replaceState(null, '', location.href.replace(/([?&])reset=1(&|$)/, '$1').replace(/[?&]($|#)/, '$1'));
      document.body.insertAdjacentHTML('afterbegin', '<div style="display:flex;align-items:center;justify-content:center;gap:10px;height:44px;color:#a9a8a0;font:13px system-ui,sans-serif"><b id="dc-p" style="padding:2px 9px;border-radius:99px;background:#ff9f0a;color:#000;font-size:11px"></b><span id="dc-s"></span><span id="dc-i"></span></div><div id="dc-st" style="display:flex;align-items:flex-start;justify-content:center;height:calc(100vh - 44px);overflow:hidden"><div id="dc-b" style="position:relative;flex:none;overflow:hidden"><iframe id="dc-f" title="Aperçu de l’app" style="position:absolute;left:0;top:0;border:0;background:#000;transform-origin:0 0"></iframe></div></div>');
      var $ = function (x) { return document.getElementById(x); }, f = $('dc-f'), b = $('dc-b'), s = choix();
      s.setAttribute('style', 'height:30px;padding:0 8px;border:0;border-radius:8px;background:#2c2c2e;color:#f5f4ef;font:inherit;cursor:pointer');
      $('dc-p').textContent = profil ? 'PROFIL TEST · ' + profil : 'MODE TEST';
      $('dc-s').appendChild(s);
      var bureau = a.w > 1000;
      b.style.borderRadius = bureau ? '10px' : '30px';
      b.style.boxShadow = bureau ? '0 0 0 3px #2a2a2c' : '0 0 0 6px #2a2a2c';
      function ajuste() {
        var st = $('dc-st'), k = Math.min(1, (st.clientWidth - 24) / a.w, (st.clientHeight - 16) / a.h);
        b.style.width = Math.round(a.w * k) + 'px'; b.style.height = Math.round(a.h * k) + 'px';
        f.style.width = a.w + 'px'; f.style.height = a.h + 'px'; f.style.transform = 'scale(' + k + ')';
        $('dc-i').textContent = a.w + ' × ' + a.h + ' · ' + Math.round(k * 100) + ' %';
      }
      ajuste();
      window.addEventListener('resize', ajuste);
      f.src = src;
      // L'adresse suit la navigation dans l'aperçu : recharger revient au même écran.
      setInterval(function () {
        try { var h = f.contentWindow.location.hash; if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h); } catch (x) {}
      }, 500);
    });
    return;
  }

  function fixe(nom, val) { Object.defineProperty(navigator, nom, { get: function () { return val; }, configurable: true }); }
  fixe('userAgent', a.ua);
  fixe('platform', a.pf);
  fixe('maxTouchPoints', a.touch);
  // Dans l'aperçu, le profil est déjà indiqué au-dessus de l'écran.
  if (!seul) window.addEventListener('load', function () { var b = document.getElementById('devbar'); if (b) b.style.display = 'none'; });
  if (a.installee) fixe('standalone', true);
  // Installation directe simulée : acceptée d'office, rien n'est réellement installé.
  if (a.prompt) window.addEventListener('load', function () {
    setTimeout(function () {
      var e = new Event('beforeinstallprompt');
      e.prompt = function () {};
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    }, 300);
  });
})();
