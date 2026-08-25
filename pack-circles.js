/* ============================================================
   SPLASH CIRCLE — single "Parfums" badge shown on the welcome
   screen. Its image is independent from every other image on the
   site (not reused from the offre-pack badge) and is set by the
   admin, uploading directly onto the circle itself.
   Kept in its own file so it never has to touch script.js.
   Must be loaded with `defer`, after script.js and motion.js,
   so the globals used below (kvGet, kvSet, uploadProductImage,
   isAdmin, showToast, t, deleteStorageFile, setAdminUI) already
   exist when this file runs.
   ============================================================ */
(function () {
  var STORAGE_KEY = 'aura-splash-circle-image';
  var CACHE_KEY = 'cache-splash-circle-image';
  var imageUrl = null;

  var wrap = document.getElementById('splash-circle-wrap');
  var img = document.getElementById('splash-circle-img');
  var placeholder = document.getElementById('splash-circle-placeholder');
  var editBtn = document.getElementById('splash-circle-edit');
  var input = document.getElementById('splash-circle-input');

  function render() {
    if (!img) return;
    if (imageUrl) {
      img.src = imageUrl;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else {
      img.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    }
    if (editBtn) editBtn.style.display = (typeof isAdmin !== 'undefined' && isAdmin) ? 'flex' : 'none';
  }

  // Paint instantly from the last-known-good image while the real fetch
  // (below) is in flight, same pattern used by every other admin-editable
  // image on the site.
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.url) { imageUrl = cached.url; render(); }
  } catch (e) {}

  if (typeof kvGet === 'function') {
    kvGet(STORAGE_KEY).then(function (data) {
      if (data && data.url) {
        imageUrl = data.url;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ url: imageUrl })); } catch (e) {}
        render();
      }
    }).catch(function () { /* not configured yet */ });
  }

  // Refresh (mainly the edit-pencil's visibility) whenever admin mode is
  // entered/exited -- monkey-patching setAdminUI() the same way the old
  // version of this file wrapped renderPack4BadgeImage(), so this stays
  // self-contained instead of adding a line inside script.js.
  if (typeof setAdminUI === 'function') {
    var originalSetAdminUI = setAdminUI;
    setAdminUI = function () {
      originalSetAdminUI();
      render();
    };
  }

  if (wrap) {
    wrap.addEventListener('click', function (e) {
      // Admin tapping the pencil/placeholder to change the image takes
      // priority over the "which gender" prompt below.
      if (typeof isAdmin !== 'undefined' && isAdmin &&
          (e.target.closest('#splash-circle-edit') || e.target.closest('#splash-circle-placeholder'))) {
        e.stopPropagation();
        if (input) input.click();
        return;
      }
      openSplashGenderPrompt();
    });
  }

  if (input) {
    input.addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (typeof showToast === 'function' && typeof t === 'function') showToast(t('bannerUploading'));
      var url = await uploadProductImage(file, { transparent: true });
      if (url) {
        var oldUrl = imageUrl;
        imageUrl = url;
        try { await kvSet(STORAGE_KEY, { url: url }); }
        catch (err) {
          if (typeof isAdmin !== 'undefined' && isAdmin && typeof showToast === 'function' && typeof t === 'function') {
            showToast(t('toastStorageUnavailable'));
          }
        }
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ url: imageUrl })); } catch (e) {}
        if (oldUrl && oldUrl !== url && typeof deleteStorageFile === 'function') deleteStorageFile('product-images', oldUrl);
        render();
      }
    });
  }

  // ---------- "Vous êtes...?" prompt -> straight into the pack-of-3
  // builder, locked to the chosen gender (or unlocked for "Mixte", same
  // as the site's normal "Composer mon pack" entry point). ----------
  var genderOverlay = document.getElementById('splash-gender-overlay');
  var genderModal = document.getElementById('splash-gender-modal');
  var genderClose = document.getElementById('splash-gender-close');

  function openSplashGenderPrompt() {
    if (!genderModal || !genderOverlay) return;
    genderModal.classList.add('open');
    genderOverlay.classList.add('open');
  }
  function closeSplashGenderPrompt() {
    if (!genderModal || !genderOverlay) return;
    genderModal.classList.remove('open');
    genderOverlay.classList.remove('open');
  }
  if (genderClose) genderClose.addEventListener('click', closeSplashGenderPrompt);
  if (genderOverlay) genderOverlay.addEventListener('click', closeSplashGenderPrompt);

  document.querySelectorAll('.splash-gender-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var gender = btn.dataset.gender; // 'women' | 'men' | 'mixte'
      closeSplashGenderPrompt();
      // Leave the splash for the shop underneath first (same dismissal
      // the Enter button itself uses), then open the pack-of-3 builder
      // on top of it, locked to the chosen gender -- "mixte" passes no
      // lock at all, so both genders stay pickable in the picker.
      if (typeof window.wsDismiss === 'function') window.wsDismiss();
      if (typeof openPack4Modal === 'function') {
        openPack4Modal(true, false, gender === 'mixte' ? null : gender);
      }
    });
  });

  render();
})();
