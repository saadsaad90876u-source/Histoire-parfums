/* ============================================================
   PACK CIRCLES — "Pack Femme / Pack Homme" quick-nav shortcuts
   Kept in its own file so it never has to touch script.js:
     - Reuses the SAME image already loaded for the "offre pack"
       card (pack4BadgeImageUrls.women / .men from script.js).
     - Reuses the SAME filter mechanism as the existing
       "Femme/Homme" tabs and footer links (click the matching
       .sf-btn, then scroll to the shop section).
   Must be loaded with `defer`, after script.js and motion.js,
   so the globals below already exist when this file runs.
   ============================================================ */
(function () {
  function paintCircleImages() {
    if (typeof pack4BadgeImageUrls === 'undefined') return;
    var femmeImg = document.getElementById('pack-circle-img-femme');
    var hommeImg = document.getElementById('pack-circle-img-homme');
    var womenUrl = pack4BadgeImageUrls.women;
    var menUrl = pack4BadgeImageUrls.men;
    if (femmeImg && womenUrl && femmeImg.getAttribute('src') !== womenUrl) {
      femmeImg.src = womenUrl;
    }
    if (hommeImg && menUrl && hommeImg.getAttribute('src') !== menUrl) {
      hommeImg.src = menUrl;
    }
  }

  // The offre-pack images load asynchronously (admin-configured, fetched
  // from storage) and script.js repaints them via renderPack4BadgeImage()
  // whenever a new URL comes in. Wrap that function so our circles stay
  // in sync with it automatically -- on first load AND on any later
  // admin edit -- without duplicating its fetch logic.
  if (typeof renderPack4BadgeImage === 'function') {
    var originalRenderPack4BadgeImage = renderPack4BadgeImage;
    renderPack4BadgeImage = function (playShine) {
      originalRenderPack4BadgeImage(playShine);
      paintCircleImages();
    };
  }
  paintCircleImages();

  function goToFilter(pf) {
    // The circles now live inside #welcome-screen (above "Explorez la
    // Collection"), so if the splash hasn't been dismissed yet, close it
    // first -- otherwise the filter/scroll below would happen behind the
    // still-visible overlay and the person would see nothing change.
    if (typeof window.wsDismiss === 'function') {
      var splash = document.getElementById('welcome-screen');
      if (splash && document.body.contains(splash)) {
        window.wsDismiss();
      }
    }
    var btn = document.querySelector('.sf-btn[data-f="' + pf + '"]');
    if (btn) btn.click();
    if (typeof scrollToSection === 'function') {
      scrollToSection('shop-heading');
    }
  }

  var femmeBtn = document.getElementById('pack-circle-femme');
  var hommeBtn = document.getElementById('pack-circle-homme');
  if (femmeBtn) femmeBtn.addEventListener('click', function () { goToFilter('women'); });
  if (hommeBtn) hommeBtn.addEventListener('click', function () { goToFilter('men'); });
})();
