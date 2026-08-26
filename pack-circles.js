
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
    }).catch(function () {  });
  }

  
  
  
  
  if (typeof setAdminUI === 'function') {
    var originalSetAdminUI = setAdminUI;
    setAdminUI = function () {
      originalSetAdminUI();
      render();
    };
  }

  if (wrap) {
    wrap.addEventListener('click', function (e) {
      
      
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
