
(function () {
  var wrap = document.getElementById('splash-circle-wrap');
  var img = document.getElementById('splash-circle-img');
  var placeholder = document.getElementById('splash-circle-placeholder');
  var editBtn = document.getElementById('splash-circle-edit');
  var input = document.getElementById('splash-circle-input');

  // Shows the exact same photo as the "offre pack" card on the shop page.
  // pack4BadgeImageUrl / PACK4_IMAGE_KEY are declared in script.js, which
  // (being loaded first, see the <script defer> order in index.html) has
  // already run by the time this file executes. Uploading from either
  // place updates both, since they share this one variable and one
  // storage key -- no separate image for the circle anymore.
  function render() {
    if (!img) return;
    var url = (typeof pack4BadgeImageUrl !== 'undefined') ? pack4BadgeImageUrl : null;
    if (url) {
      img.src = url;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else {
      img.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    }
    if (editBtn) editBtn.style.display = (typeof isAdmin !== 'undefined' && isAdmin) ? 'flex' : 'none';
  }
  // Lets renderPack4BadgeImage() in script.js call back into this circle
  // whenever the shared image changes (initial load, cache paint, a fresh
  // upload from the offre-pack card itself, etc).
  window.renderSplashCircle = render;

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
        var oldUrl = (typeof pack4BadgeImageUrl !== 'undefined') ? pack4BadgeImageUrl : null;
        pack4BadgeImageUrl = url;
        try { await kvSet(PACK4_IMAGE_KEY, { url: url }); }
        catch (err) {
          if (typeof isAdmin !== 'undefined' && isAdmin && typeof showToast === 'function' && typeof t === 'function') {
            showToast(t('toastStorageUnavailable'));
          }
        }
        try { localStorage.setItem('cache-pack4-badge-image', JSON.stringify({ url: url })); } catch (e2) {}
        if (oldUrl && oldUrl !== url && typeof deleteStorageFile === 'function') deleteStorageFile('product-images', oldUrl);
        // Refresh the offre-pack card too, not just this circle.
        if (typeof renderPack4BadgeImage === 'function') renderPack4BadgeImage();
        else render();
      }
    });
  }

  
  
  
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
      var gender = btn.dataset.gender; 
      closeSplashGenderPrompt();
      
      
      
      
      if (typeof window.wsDismiss === 'function') window.wsDismiss();
      if (typeof openPack4Modal === 'function') {
        openPack4Modal(true, false, gender === 'mixte' ? null : gender);
      }
    });
  });

  render();
})();
