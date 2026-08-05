window.onerror = function(){ return true; };
window.onunhandledrejection = function(event){ event.preventDefault(); return true; };
window.addEventListener('error', function(event){ event.preventDefault(); }, true);
window.addEventListener('unhandledrejection', function(event){ event.preventDefault(); }, true);

// Escapes any untrusted text (customer names, addresses, notes, etc.)
// before it is inserted into innerHTML, so a malicious checkout
// submission can never execute as HTML/script in the admin dashboard.
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   SCROLL REVEAL ANIMATION -- "reveal" on scroll (Intersection Observer)
   ------------------------------------------------------------
   Any element with the "reveal" class starts hidden/translated
   (see CSS) and smoothly rises into place the first time it enters
   the viewport. Uses IntersectionObserver instead of a scroll event
   listener for performance -- no work happens on every scroll tick,
   the browser only notifies us when an element crosses the threshold.

   - threshold: 0.12  -> element reveals once ~12% of it is visible
   - unobserve()      -> stop watching once revealed, so it never
                          re-triggers/repeats on subsequent scrolls
   - refreshScrollReveal() is exposed globally so any code that
     injects new markup (product grid re-render, featured products,
     admin panel, etc.) can call it to pick up newly added .reveal
     elements without creating duplicate observers.
   ============================================================ */
let scrollRevealObserver = null;
function refreshScrollReveal(root){
  const scope = root || document;
  if(!('IntersectionObserver' in window)){
    // Very old browsers: just show everything, no scroll dependency.
    scope.querySelectorAll('.reveal:not(.active)').forEach(el => el.classList.add('active'));
    return;
  }
  if(!scrollRevealObserver){
    scrollRevealObserver = new IntersectionObserver((entries) => {
      // When many elements are already on screen at the moment they start
      // being observed (e.g. switching Femme/Homme doesn't scroll the
      // page, so every card in the new grid is already visible), they'd
      // all fire in the same callback batch and reveal in the same
      // instant. A tiny incremental delay per entry in that batch turns
      // that into a proper cascading reveal instead.
      entries.forEach((entry, i) => {
        if(entry.isIntersecting){
          setTimeout(() => entry.target.classList.add('active'), i * 55);
          // Reveal once, then stop watching. Previously this kept observing
          // and removed "active" again the moment the element scrolled back
          // out of view -- so scrolling up and down rapidly toggled the
          // animation on/off mid-transition, which is what caused the
          // stutter/"stuck" feeling. Unobserving here makes every element
          // reveal exactly once and then leaves it alone for good.
          scrollRevealObserver.unobserve(entry.target);
        }
      });
    }, {
      // threshold 0.15 + a -12% bottom rootMargin: trigger once the
      // element is meaningfully on screen, without waiting so long
      // (the previous -25%) that on shorter viewports / smaller items
      // like FAQ rows the element could already be scrolled fully past
      // the trigger zone before ever intersecting it.
      threshold: 0.15,
      rootMargin: '0px 0px -12% 0px'
    });
  }
  scope.querySelectorAll('.reveal:not(.active)').forEach(el => scrollRevealObserver.observe(el));
}
document.addEventListener('DOMContentLoaded', () => refreshScrollReveal());
// In case this script runs after DOMContentLoaded already fired (e.g. deferred load timing).
if(document.readyState === 'interactive' || document.readyState === 'complete'){
  refreshScrollReveal();
}

// ---------- Sequential, page-order image loading ----------
// The high-priority images (first product row, hero banner, pack4 card)
// already load immediately/in parallel via loading="eager" -- that's
// intentional, they're few and small, and the user should see something
// right away. Every other image on the site ("seq-lazy") is deliberately
// held back and fed into a strict one-at-a-time queue instead: image #2
// doesn't start downloading until image #1 has finished, and so on, in
// the exact order those images appear in the page. Without this, a fast
// scroll (or several sections rendering at once) can fire off a dozen
// lazy images in parallel, and they all fight over the same limited
// mobile bandwidth -- so ironically the one a visitor is actually
// looking at can end up slower, not faster. Feeding them through one at
// a time in page order means whichever image comes first always finishes
// first, instead of an unpredictable free-for-all.
//
// How an image opts in: instead of `src="url"`, give it
// `class="seq-lazy" data-src="url"` (no `loading="lazy"` needed --  this
// queue replaces that). A MutationObserver picks up every seq-lazy image
// as soon as it's added to the page (covers dynamically-rendered content
// like product cards, reviews, banners...) and an initial scan on load
// covers anything already in the HTML (like the footer logo).
const seqImageQueue = [];
let seqImageLoading = false;

function seqProcessQueue(){
  if(seqImageLoading) return;
  const next = seqImageQueue.shift();
  if(!next) return;
  const src = next.dataset.src;
  if(!src){ seqProcessQueue(); return; }
  seqImageLoading = true;
  const finish = () => { seqImageLoading = false; seqProcessQueue(); };
  next.addEventListener('load', finish, { once: true });
  next.addEventListener('error', finish, { once: true });
  next.removeAttribute('data-src');
  next.src = src;
}

function seqEnqueueImages(root){
  (root || document).querySelectorAll('img.seq-lazy[data-src]:not([data-seq-queued])').forEach(img => {
    img.setAttribute('data-seq-queued', '1');
    seqImageQueue.push(img);
  });
  seqProcessQueue();
}

new MutationObserver((mutations) => {
  for(const m of mutations){
    for(const node of m.addedNodes){
      if(node.nodeType !== 1) continue;
      if(node.matches && node.matches('img.seq-lazy[data-src]')) seqEnqueueImages(node.parentNode || document);
      else if(node.querySelector && node.querySelector('img.seq-lazy[data-src]')) seqEnqueueImages(node);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener('DOMContentLoaded', () => seqEnqueueImages());
if(document.readyState === 'interactive' || document.readyState === 'complete'){
  seqEnqueueImages();
}


let wishlist = [];
let cart = [];
let checkoutOverrideItems = null; // when set, checkout uses only these items instead of the full cart (e.g. "Order Now" from a single product page)
function getCheckoutItems(){ return checkoutOverrideItems || cart; }
try{
  const savedWishlist = localStorage.getItem('aura-wishlist');
  if(savedWishlist) wishlist = JSON.parse(savedWishlist);
}catch(e){}
try{
  const savedCart = localStorage.getItem('aura-cart');
  if(savedCart) cart = JSON.parse(savedCart);
}catch(e){}
let isAdmin = false;
let currentLang = 'fr';

const translations = {
  fr: {
    cartEmpty: "Votre panier est vide.",
    cartTitle: "Panier",
    checkoutBtn: "Commander",
    addToCartBtn: "Ajouter au panier",
    orderNowBtn: "Commander maintenant",
    backToShopBtn: "Retour",
    sideMenuTitle: "Menu",
    familyLabel: "Ligne catégorie (ex. Homme · Aromatique)",
    sizeLabel: "Ligne contenance (ex. 100ml · EDP)",
    sideMenuTrackOrder: "Suivre ma commande",
    sideMenuAboutUs: "À propos de nous",
    aboutUsTitle: "À propos de nous",
    aboutUsBody: "HISTOIRE Parfum Collection propose une sélection exclusive de parfums de qualité, inspirés des plus grandes maisons, à des prix accessibles. Chaque flacon est choisi avec soin pour offrir une expérience olfactive raffinée et durable. Nous livrons partout au Maroc, avec un paiement à la livraison et un service client à votre écoute.",
    quantityLabel: "Quantité",
    trustDeliveryTitle: "Livraison 1-4j",
    trustDeliverySub: "Partout au Maroc",
    trustCertifiedTitle: "Qualité certifiée",
    trustCertifiedSub: "Parfums de qualité",
    trustPaymentTitle: "Paiement",
    trustPaymentSub: "À la livraison",
    trustSupportTitle: "Service client",
    trustSupportSub: "À votre écoute",
    descriptionAccordionTitle: "Description",
    coverImageBadge: "Couverture",
    setCoverBtn: "Définir comme couverture",
    addProductImagesBtn: "Ajouter des images",
    removeProductImageConfirm: "Supprimer cette image ?",
    checkoutError: "Veuillez remplir votre nom, téléphone et adresse.",
    addressLabel: "Adresse du domicile",
    addressPh: "Adresse",
    phonePh: "Numero",
    checkoutSub: "Entrez vos coordonnées pour confirmer votre commande.",
    checkoutTitle: "Finaliser votre commande",
    pack4BannerTag: "Offre pack de 3 parfums",
    pack4BannerHeadingTop: "Pack de",
    pack4BannerLabel: "Choisissez votre pack de 3 parfums",
    pack4BannerLabelPre: "Choisissez vos 3 parfums préférés",
    pack4BannerLabelHighlight: "3 parfums",
    pack4BannerShipping: "Livraison gratuite",
    pack4ShippingPlain: "Livraison",
    pack4ShippingBold: "Offerte",
    pack4SavingsPlain: "Économisez",
    pack4Feat1a: "3 parfums",
    pack4Feat1b: "au choix",
    pack4Feat2a: "Coffret",
    pack4Feat2b: "offert",
    pack4Feat3a: "Livraison",
    pack4Feat3b: "rapide",
    pack4BannerCta: "Composer mon pack",
    pack4ModalTitle: "Composez votre Pack de 3 Parfums",
    pack4ModalSub: "Choisissez votre sélection de 3 parfums selon vos goûts, parmi toute notre collection.",
    pack4CardHeading: "Composez votre pack",
    pack4CardShipping: "Livraison gratuite.",
    pack4AddCartBtn: "Ajouter au panier",
    pack4AddedToCartToast: "Pack ajouté au panier !",
    cartToastTitle: "Ajouté au panier",
    pack4ChooseLabel: "Choisir un parfum",
    pack4Progress: "sélectionnés",
    pack4PriceLabel: "Prix du pack",
    pack4Savings: "Vous économisez 51 DH par rapport à l'achat séparé",
    pack4AddBtn: "Acheter maintenant",
    pack4PickerTitle: "Choisissez un parfum",
    pack4FilterAll: "Tous",
    pack4CartFamily: "Pack Découverte · 3\u00A0Parfums",
    closeBtn: "Fermer",
    confirmOrder: "Confirmer la commande",
    copyright: "© 2026 HISTOIRE Parfum Collection. Tous droits réservés.",
    filterMen: "Homme",
    filterWomen: "Femme",
    fullName: "Nom complet",
    phoneNumber: "Numéro de téléphone",
    searchTitle: "Rechercher un parfum",
    subtotal: "Sous-total",
    whatsappLabel: "Cliquez ici pour discuter",
    wishlistEmpty: "Votre liste de souhaits est vide.",
    wishlistTitle: "Liste de souhaits",
    adminLoginTitle: "Connexion Admin",
    adminLoginSub: "Entrez le mot de passe administrateur pour gérer les produits.",
    passwordLabel: "Mot de passe",
    incorrectPassword: "Mot de passe incorrect.",
    loginBtn: "Connexion",
    exitAdminBtn: "Quitter le mode Admin",
    productNameLabel: "Nom du produit",
    descriptionLabel: "Description",
    priceLabel: "Prix (DH)",
    categoryLabel: "Catégorie",
    productImageLabel: "Image du produit",
    pinnedPackLabel: "Toujours afficher en dernier (Pack)",
    saveProductBtn: "Enregistrer le parfum",
    cancelBtn: "Annuler",
    deleteBtn: "Supprimer",
    fullNamePh: "Nom complet",
    searchPh: "Rechercher par nom ou notes...",
    menEdit: "Sélection Homme",
    womenEdit: "Sélection Femme",
    menCollection: "Collection Homme",
    womenCollection: "Collection Femme",
    addNewPerfume: "Ajouter un nouveau parfum",
    noResultsFound: "Aucun parfum trouvé.",
    orderSuccess: "Commande confirmée ! Nous vous contacterons bientôt.",
    editPerfumeTitle: "Modifier le parfum",
    addNewPerfumeTitle: "Ajouter un nouveau parfum",
    accountTitle: "Mon compte",
    accountSub: "Enregistrez vos informations pour un paiement plus rapide.",
    accountError: "Veuillez remplir les deux champs.",
    saveProfileBtn: "Enregistrer le profil",
    editProfileBtn: "Modifier le profil",
    signOutBtn: "Se déconnecter",
    deleteConfirmTemplate: 'Supprimer "{name}" ? Cette action est irréversible.',
    toastTooLarge: "Catalogue trop volumineux à enregistrer (image trop grande) — le changement ne s'applique qu'à cette session.",
    toastStorageUnavailable: "Stockage partagé indisponible — les changements ne s'appliquent qu'à cette session.",
    customersBtn: "Clients",
    ordersBtn: "Tableau de bord",
    ordersTitle: "Commandes",
    statTotalOrders: "Total des commandes",
    statRevenue: "Revenu total",
    statToday: "Commandes du jour",
    customersSearchPh: "Rechercher par nom ou téléphone...",
    noCustomersFound: "Aucun client trouvé.",
    noOrdersFound: "Aucune commande trouvée.",
    loadingText: "Chargement...",
    toastImageUploadFailed: "Échec de l'envoi de l'image — une version compressée sera utilisée à la place.",
    qtyLabel: "Qté",
    orderSummaryTitle: "Résumé de la commande",
    deliveryFee: "Frais de livraison",
    discountLabel: "Réduction",
    totalLabel: "Total",
    promoCodeTitle: "Code promo",
    couponPh: "Entrez votre code",
    applyBtn: "Appliquer",
    couponInvalid: "Code promo invalide ou expiré.",
    couponAppliedMsg: "Code promo appliqué avec succès",
    deliveryInfoTitle: "Informations de livraison",
    cityLabel: "Ville",
    cityPh: "ex. Casablanca",
    notesLabel: "Remarques (optionnel)",
    notesPh: "Quelque chose à préciser ?",
    paymentMethodTitle: "Mode de paiement",
    codLabel: "Paiement à la livraison",
    codNote: "Vous ne payez qu'à la réception de votre commande. Aucun paiement en ligne requis.",
    shippingInfoTitle: "Informations d'expédition",
    shippingFeeLabel: "Frais de livraison",
    freeShippingLabel: "Gratuite",
    estimatedDeliveryLabel: "Livraison estimée",
    estimatedDeliveryValue: "1 à 3 jours ouvrables",
    shippingCompanyLabel: "Transporteur",
    shippingCompanyValue: "Livraison locale",
    trustCod: "Paiement à la livraison",
    trustSecure: "Commande sécurisée",
    trustPackaging: "Emballage premium",
    trustShipping: "Livraison rapide",
    trustSupport: "Service client",
    orderSuccessTitle: "Votre commande a été passée avec succès !",
    orderSuccessMsg: "Merci d'avoir choisi HISTOIRE. Votre commande est reçue et en cours de traitement.",
    orderNumberLabel: "Numéro de commande",
    dateLabel: "Date",
    orderStatusLabel: "Statut de la commande",
    trackOrderBtn: "Suivre ma commande",
    menuTitle: "Menu",
    aboutUsBtn: "À propos de nous",
    aboutUsText: "HISTOIRE Parfum Collection propose des eaux de parfum d'inspiration haut de gamme, sélectionnées avec soin pour leur tenue, leur sillage et leur raffinement. Notre mission est de rendre le luxe olfactif accessible, avec un service rapide et attentionné partout au Maroc.",
    continueShoppingBtn: "Continuer mes achats",
    trackingTitle: "Suivi de commande",
    statusPending: "En attente",
    statusConfirmed: "Confirmée",
    statusPreparing: "En préparation",
    statusShipped: "Expédiée",
    statusDelivered: "Livrée",
    statusCancelled: "Annulée",
    trackingLookupSub: "Entrez votre numéro de commande pour voir son statut.",
    trackingLookupPh: "ex. HISTOIRE-XXXXXXX",
    trackingLookupBtn: "Suivre",
    trackingNotFound: "Aucune commande trouvée avec ce numéro.",
    trackingMineLabel: "Mes commandes précédentes",
    editBannerBtn: "Modifier",
    freeShippingBar: "Livraison gratuite à partir de 195 DH",
    removeBannerBtn: "Supprimer",
    addBannerBtn: "Ajouter une bannière",
    bannerCategoryBadge: "Bannière {cat}",
    bannerUploading: "Envoi de la bannière en cours...",
    removeBannerConfirm: "Supprimer la bannière ? Cette action est irréversible.",
    deleteCustomerTemplate: 'Supprimer le client "{name}" ? Cette action est irréversible.',
    deleteOrderTemplate: 'Supprimer la commande de "{name}" ? Cette action est irréversible.',
    orderItemsLabel: "Articles"
  },
};

function t(key){
  return (translations.fr && translations.fr[key]) || key;
}

function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}

const bottleColors = {
  royal: 'linear-gradient(155deg, rgba(255,255,255,.18), rgba(212,175,55,.12) 30%, var(--royal) 60%, var(--royal-deep))',
  plum:  'linear-gradient(155deg, rgba(255,255,255,.18), rgba(212,175,55,.12) 30%, #4a2f63 60%, #241b3a)',
  onyx:  'linear-gradient(155deg, rgba(255,255,255,.18), rgba(212,175,55,.12) 30%, #12182b 60%, #05070f)',
  ivory: 'linear-gradient(155deg, rgba(255,255,255,.4), rgba(212,175,55,.18) 30%, #cfc7ae 60%, #a89c78)'
};

let men = [
  {name:'Aura Sovereign', family:"Homme · Boisé", desc:'Vétiver, cuir, cèdre fumé.', price:50, reviews:512, tone:'onyx', label:'SOVEREIGN', size:'100ml · EDP'},
  {name:'Aura Cedar Royale', family:"Homme · Aromatique", desc:'Bois de cèdre, thé noir, ambre boisé.', price:50, reviews:340, tone:'royal', label:'CEDAR', size:'100ml · EDP'},
  {name:'Aura Midnight', family:"Homme · Oriental", desc:'Feuille de tabac, rhum ambré, oud.', price:50, reviews:288, tone:'plum', label:'MIDNIGHT', size:'100ml · EDP'},
  {name:'Aura Homme Noir', family:"Homme · Cuir", desc:'Cuir noir, encens, musc.', price:50, reviews:265, tone:'onyx', label:'HOMME', size:'100ml · EDP'},
  {name:'Aura Noir', family:'Boisé · Ambré', desc:'Oud fumé, poivre noir, ambre chaud.', price:50, reviews:482, tone:'onyx', label:'NOIR', size:'100ml · EDP'},
  {name:'Aura Éclat', family:'Agrumes · Frais', desc:'Bergamote, embruns marins, cèdre.', price:50, reviews:410, tone:'royal', label:'ÉCLAT', size:'75ml · EDT'}
];
let women = [
  {name:'Aura Rose Gold', family:"Femme · Floral", desc:'Rose de Bulgarie, ambre doré, musc.', price:50, reviews:470, tone:'ivory', label:'ROSE GOLD', size:'100ml · EDP'},
  {name:'Aura Belle', family:"Femme · Floral fruité", desc:'Pivoine, framboise, musc blanc.', price:50, reviews:389, tone:'plum', label:'BELLE', size:'75ml · EDT'},
  {name:'Aura Iris Nocturne', family:"Femme · Poudré", desc:'Iris, violette, suède doux.', price:50, reviews:224, tone:'royal', label:'IRIS', size:'100ml · EDP'},
  {name:'Aura Silk', family:"Femme · Musqué", desc:'Musc soyeux, jasmin, bois de santal.', price:50, reviews:312, tone:'ivory', label:'SILK', size:'100ml · EDT'},
  {name:'Aura Élan', family:'Floral · Musqué', desc:'Rose blanche, musc soyeux, vanille douce.', price:50, reviews:361, tone:'ivory', label:'ÉLAN', size:'100ml · EDP'},
  {name:'Aura Velour', family:'Oriental', desc:'Safran, bois de cachemire, fève tonka.', price:50, reviews:298, tone:'plum', label:'VELOUR', size:'100ml · EDP'}
];

function localizedProduct(p){
  return p;
}

function productImages(p){
  if(Array.isArray(p.images) && p.images.length) return p.images;
  if(p.image) return [p.image];
  return [];
}
function productCoverImage(p){
  const imgs = productImages(p);
  if(!imgs.length) return null;
  const idx = (typeof p.cover === 'number' && p.cover >= 0 && p.cover < imgs.length) ? p.cover : 0;
  return imgs[idx];
}
function productMedia(p, idx){
  const cover = productCoverImage(p);
  const fallback = `<div class="bottle mini-bottle" style="display:none;">
        <div class="cap"></div><div class="neck"></div>
        <div class="body" style="background:${bottleColors[p.tone]}"><div class="label">${p.label}</div></div>
      </div>`;
  // The first row of cards is always on-screen the instant the shop grid
  // renders -- "lazy" loading was giving them the same low network
  // priority as images far down the page the visitor may never scroll
  // to, which is exactly backwards for cards that are never actually
  // off-screen. Loading them eagerly with high priority lets the browser
  // fetch them immediately instead of queuing them behind lower-priority
  // work, so the real photo has the best chance of being ready by the
  // time the welcome screen is dismissed.
  const eager = typeof idx === 'number' && idx < 4;
  const srcAttrs = eager
    ? `src="${cover}" loading="eager" fetchpriority="high"`
    : `class="seq-lazy" data-src="${cover}"`;
  return cover
    ? `<img ${srcAttrs} alt="${p.name}" decoding="async" style="width:100%;height:100%;object-fit:contain;border-radius:0;" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='block';">${fallback}`
    : `<div class="bottle mini-bottle">
        <div class="cap"></div><div class="neck"></div>
        <div class="body" style="background:${bottleColors[p.tone]}"><div class="label">${p.label}</div></div>
      </div>`;
}

function productCard(pRaw, category, idx){
  const p = localizedProduct(pRaw);
  const media = productMedia(p, idx);
  const adminControls = isAdmin ? `
    <div class="admin-controls">
      <button class="admin-edit-btn" data-category="${category}" data-idx="${idx}" aria-label="Edit product">✎</button>
      <button class="admin-del-btn" data-category="${category}" data-idx="${idx}" aria-label="Delete product">🗑</button>
    </div>` : '';
  const pinBadge = p.pinned ? `<div class="pc-pin-badge">PACK</div>` : '';
  const delay = Math.min(idx, 8) * 0.05;
  const revealDelayClass = `d${(idx % 4) + 1}`;
  // Premium sale layout: fixed "was" price shown on every card, per request.
  const oldPrice = 75;
  return `<div class="product-card reveal ${revealDelayClass} ${p.pinned ? 'product-card-pinned' : ''}" data-name="${p.name}" style="animation-delay:${delay}s;">
    ${adminControls}
    ${pinBadge}
    <div class="pc-stage">
      ${media}
    </div>
    <div class="pc-body">
      <div class="pc-fam">${p.family} · ${p.size}</div>
      <h3>${p.name}</h3>
      <div class="pc-rating">
        <span class="pc-stars">★★★★★</span>
        <span class="pc-rating-value">(4.9)</span>
      </div>
      <div class="desc">${p.desc}</div>
      <div class="pc-bottom">
        <div class="pc-price-wrap">
          <div class="pc-price-row">
            <span class="pc-price-old">${oldPrice} DH</span>
            <span class="price">${p.price} DH</span>
          </div>
        </div>
      </div>
      <div class="pc-actions">
        <button class="add-cart pc-action-btn pc-action-cart" data-name="${p.name}" data-price="${p.price}" data-family="${p.family}">${t('addToCartBtn')}</button>
      </div>
    </div>
  </div>`;
}

const meta = {
  men:   { list: men },
  women: { list: women }
};

let currentFilter = 'women';
let shopRenderTimer = null;
function renderShop(filter, skipScroll){
  const m = meta[filter] || meta.men;
  currentFilter = filter;
  if(typeof setBannerCategory === 'function') setBannerCategory(filter);
  if(typeof renderPack4BadgeImage === 'function') renderPack4BadgeImage();
  document.getElementById('shop-heading').textContent = filter === 'women' ? t('womenCollection') : t('menCollection');
  const grid = document.getElementById('shop-grid');
  grid.style.opacity = '0';
  // If the user is switching tabs very fast, cancel whatever render was
  // previously queued instead of letting it also run. Without this, every
  // rapid click stacks up its own full grid rebuild, and they all fire back
  // to back a moment later — which is what was freezing the page.
  clearTimeout(shopRenderTimer);
  shopRenderTimer = setTimeout(() => {
    const indexed = m.list.map((p, idx) => ({ p, idx }));
    indexed.sort((a, b) => (a.p.pinned ? 1 : 0) - (b.p.pinned ? 1 : 0));
    grid.innerHTML = indexed.map(({ p, idx }) => productCard(p, filter, idx)).join('')
      + (isAdmin ? `<button class="add-new-card" id="add-new-card">
          <span class="anc-plus">+</span>
          <span>${t('addNewPerfume')}</span>
        </button>` : '');
    grid.style.opacity = '1';
    refreshScrollReveal(grid);
    // The first two product cards should welcome the visitor immediately —
    // rise into view as soon as the shop loads, instead of waiting for the
    // visitor to scroll/touch the screen and cross the IntersectionObserver
    // threshold. A short delay keeps the CSS transition visible (adding the
    // class in the very same tick as the initial paint can make browsers
    // skip straight to the end state instead of animating).
    requestAnimationFrame(() => {
      setTimeout(() => {
        grid.querySelectorAll('.product-card.reveal:not(.active)').forEach((card, i) => {
          if(i < 2) card.classList.add('active');
        });
      }, 60);
    });
  }, 100);
  document.querySelectorAll('.sf-btn').forEach(b=>b.classList.toggle('active', b.dataset.f === filter));
  if(!skipScroll) window.scrollTo({top:0, behavior:'smooth'});
}
applyTranslations();
updateWishlistBadge();
updateCartBadge();
renderCartDrawer();
document.getElementById('shop-grid').innerHTML = `<p class="wishlist-empty">${t('loadingText')}</p>`;



document.querySelectorAll('.sf-btn, .nav-filter').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    if(btn.classList.contains('sf-btn') && btn.dataset.f === currentFilter) return;
    renderShop(btn.dataset.f, true);
  });
});

function updateWishlistBadge(){
  const badge = document.getElementById('wishlist-badge');
  if(badge){
    badge.textContent = wishlist.length;
    badge.style.display = wishlist.length ? 'flex' : 'none';
  }
  const countLabel = document.getElementById('wishlist-count-label');
  if(countLabel) countLabel.textContent = wishlist.length;
  try{ localStorage.setItem('aura-wishlist', JSON.stringify(wishlist)); }catch(e){}
}

function familyFor(name){
  const p = men.find(x => x.name === name) || women.find(x => x.name === name);
  return p ? localizedProduct(p).family : '';
}

function renderWishlistDrawer(){
  const container = document.getElementById('wishlist-items');
  if(wishlist.length === 0){
    container.innerHTML = `<p class="wishlist-empty">${t('wishlistEmpty')}</p>`;
    return;
  }
  container.innerHTML = wishlist.map(w => `
    <div class="wishlist-item" data-name="${w.name}">
      <div class="wi-info">
        <div class="wi-name">${w.name}</div>
        <div class="wi-meta">${familyFor(w.name)}</div>
        <div class="wi-price">${w.price} DH</div>
      </div>
      <button class="wi-remove" data-name="${w.name}" aria-label="Remove from wishlist">✕</button>
    </div>`).join('');
}

function toggleWishlist(name, price, family){
  const idx = wishlist.findIndex(w => w.name === name);
  const adding = idx === -1;
  if(idx > -1){
    wishlist.splice(idx, 1);
  } else {
    wishlist.push({name, price, family});
  }
  document.querySelectorAll(`.fav[data-name="${CSS.escape(name)}"]`).forEach(b => {
    b.classList.toggle('active');
    if(adding){
      b.classList.remove('pop-anim');
      void b.offsetWidth;
      b.classList.add('pop-anim');
    }
  });
  updateWishlistBadge();
  renderWishlistDrawer();
}

function goToProduct(name){
  closeWishlistDrawer();
  if(typeof closeCartDrawer === 'function') closeCartDrawer();
  if(typeof closeSearchModal === 'function') closeSearchModal();
  openProductPage(name);
}

document.addEventListener('click', e => {
  const fav = e.target.closest('.fav');
  if(fav){
    toggleWishlist(fav.dataset.name, fav.dataset.price, fav.dataset.family);
    return;
  }
  if(e.target.closest('#cart-items')) return;
  const rm = e.target.closest('.wi-remove');
  if(rm){
    toggleWishlist(rm.dataset.name);
    return;
  }
  const item = e.target.closest('.wishlist-item');
  if(item){
    goToProduct(item.dataset.name);
  }
});

function openWishlistDrawer(){
  document.getElementById('wishlist-drawer').classList.add('open');
  document.getElementById('wishlist-overlay').classList.add('open');
}
function closeWishlistDrawer(){
  document.getElementById('wishlist-drawer').classList.remove('open');
  document.getElementById('wishlist-overlay').classList.remove('open');
}
document.getElementById('wishlist-close').addEventListener('click', closeWishlistDrawer);
document.getElementById('wishlist-overlay').addEventListener('click', closeWishlistDrawer);

/* ---------- cart ---------- */
function updateCartBadge(){
  const count = cart.reduce((sum, c) => sum + c.qty, 0);
  const badge = document.getElementById('cart-badge-count');
  badge.textContent = count;
  badge.style.display = count ? 'flex' : 'none';
  document.getElementById('cart-count-label').textContent = count;
  try{ localStorage.setItem('aura-cart', JSON.stringify(cart)); }catch(e){}
}

function renderCartDrawer(){
  const container = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  if(cart.length === 0){
    container.innerHTML = `<p class="wishlist-empty">${t('cartEmpty')}</p>`;
    footer.style.display = 'none';
    return;
  }
  container.innerHTML = cart.map(c => {
    const ref = findProductRef(c.name);
    const p = ref ? (ref.category === 'men' ? men : women)[ref.idx] : null;
    const cover = c.image || (p ? productCoverImage(p) : null);
    const thumb = cover
      ? `<img class="seq-lazy" data-src="${cover}" alt="${c.displayName || c.name}" decoding="async">`
      : `<div class="bottle mini-bottle" style="transform:scale(.5);"><div class="cap"></div><div class="neck"></div><div class="body" style="background:${p ? bottleColors[p.tone] : bottleColors.royal}"><div class="label">${p ? p.label : ''}</div></div></div>`;
    return `
    <div class="wishlist-item" data-name="${c.name}">
      <div class="wi-thumb">${thumb}</div>
      <div class="wi-info">
        <div class="wi-name">${c.displayName || c.name}</div>
        <div class="wi-meta">${familyFor(c.name)}</div>
        <div class="wi-price">${c.price} DH</div>
      </div>
      <div class="ci-actions">
        <button class="wi-remove" data-name="${c.name}" aria-label="Remove from cart">✕</button>
        <div class="qty-stepper">
          <button class="qty-btn" data-act="dec" data-name="${c.name}">−</button>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="qty-num" data-name="${c.name}" value="${c.qty}" aria-label="Quantité">
          <button class="qty-btn" data-act="inc" data-name="${c.name}">+</button>
        </div>
      </div>
    </div>`;
  }).join('');
  footer.style.display = 'block';
  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  document.getElementById('cart-subtotal').textContent = subtotal + ' DH';
}

function addToCart(name, price, family, qty, extra){
  qty = qty && qty > 0 ? qty : 1;
  const displayName = extra && extra.displayName ? extra.displayName : null;
  const image = extra && extra.image ? extra.image : null;
  const item = cart.find(c => c.name === name);
  if(item){ item.qty += qty; }
  else { cart.push({name, price:Number(price), family, qty, displayName, image}); }
  updateCartBadge();
  renderCartDrawer();
}

function changeQty(name, delta){
  const item = cart.find(c => c.name === name);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0){ cart = cart.filter(c => c.name !== name); }
  updateCartBadge();
  renderCartDrawer();
}

function setQty(name, qty){
  const item = cart.find(c => c.name === name);
  if(!item) return;
  item.qty = qty;
  if(item.qty <= 0){ cart = cart.filter(c => c.name !== name); }
  updateCartBadge();
  renderCartDrawer();
}

document.addEventListener('input', e => {
  const qtyInput = e.target.closest('#cart-items .qty-num');
  if(qtyInput){ qtyInput.value = qtyInput.value.replace(/[^0-9]/g, ''); }
});
document.addEventListener('focusout', e => {
  const qtyInput = e.target.closest('#cart-items .qty-num');
  if(qtyInput){
    let v = parseInt(qtyInput.value, 10);
    if(!v || v < 1) v = 1;
    setQty(qtyInput.dataset.name, v);
  }
});
document.addEventListener('keydown', e => {
  if(e.key === 'Enter' && e.target.closest('#cart-items .qty-num')){ e.target.blur(); }
});

function removeFromCart(name){
  cart = cart.filter(c => c.name !== name);
  updateCartBadge();
  renderCartDrawer();
}

function openCartDrawer(){
  renderCartDrawer();
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
}
function closeCartDrawer(){
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
}
document.getElementById('cart-btn').addEventListener('click', openCartDrawer);
document.getElementById('cart-close').addEventListener('click', closeCartDrawer);
document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
document.getElementById('checkout-btn').addEventListener('click', () => {
  if(cart.length === 0) return;
  checkoutOverrideItems = null;
  checkoutOrigin = null;
  closeCartDrawer();
  openCheckoutPage();
});

let appliedCoupon = null; // {code, discount_type, discount_value}
let lastOrder = null;

function computeOrderTotals(){
  const items = getCheckoutItems();
  const subtotal = items.reduce((sum, c) => sum + c.price * c.qty, 0);
  let discount = 0;
  if(appliedCoupon){
    discount = appliedCoupon.discount_type === 'percent'
      ? Math.round(subtotal * (appliedCoupon.discount_value / 100))
      : appliedCoupon.discount_value;
    discount = Math.min(discount, subtotal);
  }
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = Math.max(subtotal + shipping - discount, 0);
  return { subtotal, discount, shipping, total };
}

function renderOrderSummary(){
  const { subtotal, discount, shipping, total } = computeOrderTotals();
  document.getElementById('co-subtotal').textContent = subtotal + ' DH';
  document.getElementById('co-shipping').textContent = shipping === 0 ? t('freeShippingLabel') : shipping + ' DH';
  const discountRow = document.getElementById('co-discount-row');
  if(discount > 0){
    discountRow.style.display = 'flex';
    document.getElementById('co-discount').textContent = '-' + discount + ' DH';
  } else {
    discountRow.style.display = 'none';
  }
  document.getElementById('co-total').textContent = total + ' DH';
  const btnTotal = document.getElementById('checkout-btn-total');
  if(btnTotal) btnTotal.textContent = total + ' DH';
}

function openCheckoutPage(pushHistory){
  appliedCoupon = null;
  document.getElementById('coupon-input').value = '';
  document.getElementById('coupon-success').style.display = 'none';
  document.getElementById('coupon-error').style.display = 'none';
  document.getElementById('checkout-error').style.display = 'none';
  document.getElementById('checkout-form-view').style.display = 'block';
  document.getElementById('checkout-success-view').style.display = 'none';
  renderOrderSummary();
  document.getElementById('shop-view').style.display = 'none';
  const ppEl = document.getElementById('product-page');
  if(ppEl) ppEl.style.display = 'none';
  document.getElementById('checkout-page').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'auto' });
  if(pushHistory !== false){
    try{ history.pushState({ checkout: true }, '', '/checkout'); }catch(err){}
  }
}
function closeCheckoutPage(fromPopstate){
  document.getElementById('checkout-page').style.display = 'none';
  document.getElementById('shop-view').style.display = '';
  window.scrollTo({ top: 0, behavior: 'auto' });
  checkoutOverrideItems = null;
  if(!fromPopstate){
    try{ history.pushState({}, '', '/'); }catch(err){}
  }
}
document.getElementById('checkout-modal-close').addEventListener('click', () => {
  if(checkoutOrigin === 'pack4'){
    checkoutOrigin = null;
    closeCheckoutPage(true);
    openPack4Modal(true, true);
    return;
  }
  if(checkoutOrigin && checkoutOrigin.type === 'product' && checkoutOrigin.name){
    const name = checkoutOrigin.name;
    checkoutOrigin = null;
    closeCheckoutPage(true);
    openProductPage(name, true, true);
    return;
  }
  closeCheckoutPage();
});

document.getElementById('coupon-apply-btn').addEventListener('click', async () => {
  const code = document.getElementById('coupon-input').value.trim();
  const successEl = document.getElementById('coupon-success');
  const errorEl = document.getElementById('coupon-error');
  successEl.style.display = 'none';
  errorEl.style.display = 'none';
  if(!code) return;
  const coupon = await checkCoupon(code);
  if(coupon){
    appliedCoupon = coupon;
    const { discount } = computeOrderTotals();
    successEl.textContent = '✓ ' + t('couponAppliedMsg') + ' (-' + discount + ' DH)';
    successEl.style.display = 'block';
  } else {
    appliedCoupon = null;
    errorEl.style.display = 'block';
  }
  renderOrderSummary();
});

function isValidMoroccanPhone(phone){
  const digits = phone.replace(/\s+/g, '');
  return /^(\+212|0)([5-7]\d{8})$/.test(digits);
}

document.getElementById('checkout-giftwrap').addEventListener('change', (e) => {
  document.getElementById('checkout-giftwrap-message-wrap').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('checkout-error');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const name = document.getElementById('checkout-name').value.trim();
  const phone = document.getElementById('checkout-phone').value.trim();
  const city = document.getElementById('checkout-city').value.trim();
  const address = document.getElementById('checkout-address').value.trim();
  const isGiftWrap = document.getElementById('checkout-giftwrap').checked;
  const giftMessage = document.getElementById('checkout-giftwrap-message').value.trim();
  const baseNotes = document.getElementById('checkout-notes').value.trim();
  const notesParts = [];
  if(baseNotes) notesParts.push(baseNotes);
  if(isGiftWrap){
    notesParts.push('🎁 Emballage cadeau demandé.' + (giftMessage ? ' Message: ' + giftMessage : ''));
  }
  const notes = notesParts.join(' | ');
  if(!name || !address || !isValidMoroccanPhone(phone)){
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';
  submitBtn.disabled = true;

  const { subtotal, discount, shipping, total } = computeOrderTotals();
  const order = await createOrder({
    name, phone, city, address, notes,
    items: getCheckoutItems().map(c => ({name:c.name, price:c.price, qty:c.qty})),
    subtotal, shipping, discount, couponCode: appliedCoupon ? appliedCoupon.code : null, total
  });
  lastOrder = order;
  saveMyOrder(order.orderNumber, total);

  if(!checkoutOverrideItems){
    cart = [];
    updateCartBadge();
    renderCartDrawer();
  }
  checkoutOverrideItems = null;
  checkoutOrigin = null;
  e.target.reset();
  document.getElementById('checkout-phone').value = '';
  submitBtn.disabled = false;

  const eta = estimateDeliveryDate();
  document.getElementById('cd-order-number').textContent = order.orderNumber;
  document.getElementById('cd-date').textContent = new Date().toLocaleDateString('fr-FR');
  document.getElementById('cd-total').textContent = total + ' DH';
  const etaEl = document.getElementById('cd-eta');
  if(etaEl) etaEl.textContent = eta.toLocaleDateString('fr-FR');
  const badge = document.getElementById('cd-status-badge');
  badge.className = 'status-badge status-pending';
  badge.textContent = t('statusPending');

  document.getElementById('checkout-form-view').style.display = 'none';
  document.getElementById('checkout-success-view').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'auto' });
});

document.getElementById('continue-shopping-btn').addEventListener('click', () => closeCheckoutPage());
document.getElementById('track-order-btn').addEventListener('click', () => {
  closeCheckoutPage();
  if(lastOrder) openTrackingModal(lastOrder.orderNumber);
});

document.addEventListener('click', e => {
  const addBtn = e.target.closest('.add-cart');
  if(addBtn){
    addToCart(addBtn.dataset.name, addBtn.dataset.price, addBtn.dataset.family);
    addBtn.classList.remove('pop-anim');
    void addBtn.offsetWidth;
    addBtn.classList.add('pop-anim');
    showCartToast(addBtn.dataset.name);
    return;
  }
  const orderNowBtn = e.target.closest('.order-now-btn');
  if(orderNowBtn){
    addToCart(orderNowBtn.dataset.name, orderNowBtn.dataset.price, orderNowBtn.dataset.family);
    checkoutOrigin = null;
    closeCartDrawer();
    closeWishlistDrawer();
    openCheckoutPage();
    return;
  }
  const qtyBtn = e.target.closest('.qty-btn');
  if(qtyBtn){
    changeQty(qtyBtn.dataset.name, qtyBtn.dataset.act === 'inc' ? 1 : -1);
    return;
  }
  if(e.target.closest('#cart-items .qty-num')){
    return;
  }
  const cartRemove = e.target.closest('#cart-items .wi-remove');
  if(cartRemove){
    removeFromCart(cartRemove.dataset.name);
    return;
  }
  const cartItem = e.target.closest('#cart-items .wishlist-item');
  if(cartItem){
    goToProduct(cartItem.dataset.name);
  }
});

/* ---------- Supabase connection ---------- */
/* 1. Create a free project at https://supabase.com
   2. Run the SQL setup script (provided separately) to create the kv_store table
   3. Paste your Project URL and anon public key below (Settings → API in Supabase) */
const SUPABASE_URL = 'https://kydrxvfarubaazemxqhw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZHJ4dmZhcnViYWF6ZW14cWh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3ODk1ODMsImV4cCI6MjA5OTM2NTU4M30.eYbHXtBVY8knbZtzX1BLaKWKlRznBYl9II2EcZKQG8M';

const supabaseClient = (window.supabase && SUPABASE_URL !== 'YOUR_SUPABASE_URL')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

async function kvSet(key, value){
  if(!supabaseClient) throw new Error('Supabase not configured');
  const { error } = await supabaseClient
    .from('kv_store')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if(error) throw error;
}

// Deletes the underlying file from a Supabase Storage bucket given its public
// URL (as returned by getPublicUrl). Safe to call with base64 data URLs or
// non-Supabase URLs — it silently no-ops on anything it doesn't recognize,
// so a storage cleanup failure never blocks the primary delete/save action.
async function deleteStorageFile(bucket, publicUrl){
  if(!supabaseClient || !publicUrl || typeof publicUrl !== 'string') return;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = publicUrl.indexOf(marker);
  if(i === -1) return; // not a Supabase Storage URL for this bucket (e.g. base64 fallback)
  const path = publicUrl.slice(i + marker.length).split('?')[0];
  if(!path) return;
  try{
    await supabaseClient.storage.from(bucket).remove([path]);
  }catch(err){
    // Non-critical: the DB/catalog record is already gone, which is what
    // matters most to the shopper-facing site. Leftover file, if any, can
    // be cleaned up later — we don't want this to interrupt the admin flow.
  }
}

async function kvGet(key){
  if(!supabaseClient) throw new Error('Supabase not configured');
  const { data, error } = await supabaseClient
    .from('kv_store')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if(error) throw error;
  return data ? data.value : null;
}

/* ---------- admin mode ---------- */
const CATALOG_KEY = 'aura-catalog-v1';

let storageAvailable = true;

// A browser-local mirror of the last successfully loaded catalog (real
// product photos included). Reading this is synchronous and instant --
// no network round trip -- so on repeat visits we can paint real photos
// immediately instead of the placeholder bottle shapes while Supabase is
// still being contacted. Supabase remains the source of truth; this is
// only ever used to avoid a blank/placeholder flash, and gets silently
// refreshed every time a real fetch succeeds.
const CATALOG_LOCAL_CACHE_KEY = 'histoire-catalog-cache-v1';

function readCatalogLocalCache(){
  try{
    const raw = localStorage.getItem(CATALOG_LOCAL_CACHE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(data && Array.isArray(data.men) && Array.isArray(data.women)) return data;
  }catch(err){}
  return null;
}

function writeCatalogLocalCache(data){
  try{
    localStorage.setItem(CATALOG_LOCAL_CACHE_KEY, JSON.stringify({ men: data.men, women: data.women }));
  }catch(err){
    // Storage full/unavailable (e.g. private browsing) -- non-critical,
    // just means the next visit won't have an instant-paint cache.
  }
}

function showToast(message){
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function showCartToast(subtitle){
  const el = document.getElementById('cart-toast');
  document.getElementById('cart-toast-sub').textContent = subtitle || '';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showCartToast._timer);
  showCartToast._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function saveCatalog(){
  if(!storageAvailable) return;
  const payload = JSON.stringify({men, women});
  if(payload.length > 4500000){
    if(isAdmin) showToast(t('toastTooLarge'));
    return;
  }
  try{
    await kvSet(CATALOG_KEY, {men, women});
    writeCatalogLocalCache({ men, women });
  }catch(err){
    storageAvailable = false;
    if(isAdmin) showToast(t('toastStorageUnavailable'));
  }
}

async function normalizeProductRatingsOnce(){
  try{
    const flag = await kvGet('reviews-normalized-v1');
    if(flag) return;
  }catch(err){ return; } // if kv is unreachable, skip rather than risk looping every load
  men.forEach(p => { p.reviews = 360; p.rating = 4.9; });
  women.forEach(p => { p.reviews = 360; p.rating = 4.9; });
  try{
    await kvSet(CATALOG_KEY, {men, women});
    writeCatalogLocalCache({ men, women });
    await kvSet('reviews-normalized-v1', { done: true });
  }catch(err){}
}

async function loadCatalog(){
  // Instant paint from last visit's real data (if any), synchronously,
  // before Supabase has even been contacted -- this is what removes the
  // placeholder-bottle flash on repeat visits.
  const cached = readCatalogLocalCache();
  if(cached){
    men.length = 0; men.push(...cached.men);
    women.length = 0; women.push(...cached.women);
    renderShop(currentFilter, true);
  }

  const fetchTask = (async () => {
    try{
      const data = await kvGet(CATALOG_KEY);
      if(data){
        if(Array.isArray(data.men)){ men.length = 0; men.push(...data.men); }
        if(Array.isArray(data.women)){ women.length = 0; women.push(...data.women); }
        writeCatalogLocalCache({ men, women });
      } else if(storageAvailable){
        await kvSet(CATALOG_KEY, {men, women});
      }
      await normalizeProductRatingsOnce();
    }catch(err){
      storageAvailable = false;
    }
  })();

  const timeoutTask = new Promise((resolve) => setTimeout(resolve, 1200, 'timeout'));
  const result = await Promise.race([fetchTask, timeoutTask]);

  renderShop(currentFilter, true);

  if(result === 'timeout'){
    // Supabase is slow — we've already shown something so the page feels fast.
    // once the real data arrives, quietly refresh the view to match it.
    fetchTask.then(() => renderShop(currentFilter, true));
  }
}
/* ---------- top banners load FIRST ----------
   Moved above loadCatalog() on purpose: the hero banner (top banner
   shown on the femme/homme pages) and the "offre pack" image are the
   first visuals people see, so their fetch + <img> render must kick
   off before the product catalog/grid images so they win the
   network priority race and appear first on screen. */
/* ---------- pack4 banner product image (admin-editable) ---------- */
const PACK4_IMAGE_KEYS = { women: 'aura-pack4-badge-image-women', men: 'aura-pack4-badge-image-men' };
const LEGACY_PACK4_IMAGE_KEY = 'aura-pack4-badge-image';
let pack4BadgeImageUrls = { women: null, men: null };

function renderPack4BadgeImage(){
  const img = document.getElementById('pack4-banner-img');
  const placeholder = document.getElementById('pack4-banner-image-placeholder');
  const editBtn = document.getElementById('pack4-banner-image-edit');
  const bannerEl = document.getElementById('pack4-banner-btn');
  if(bannerEl) bannerEl.classList.toggle('pack4-men', currentFilter === 'men');
  if(!img) return;
  const url = pack4BadgeImageUrls[currentFilter];
  if(url){
    img.src = url;
    img.style.display = 'block';
    if(placeholder) placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    if(placeholder) placeholder.style.display = 'flex';
  }
  if(editBtn) editBtn.style.display = isAdmin ? 'flex' : 'none';
}

function preloadImage(url){
  if(!url) return;
  const img = new Image();
  img.src = url; // fire-and-forget: just gets the bytes into the browser's HTTP cache
}

async function loadPack4BadgeImage(){
  // Paint instantly from the last-known-good image while the real fetch runs.
  try{
    const cached = JSON.parse(localStorage.getItem('cache-pack4-badge-images') || 'null');
    if(cached && (cached.women || cached.men)){
      if(cached.women) pack4BadgeImageUrls.women = cached.women;
      if(cached.men) pack4BadgeImageUrls.men = cached.men;
      renderPack4BadgeImage();
      // Warm the browser cache for BOTH genders right away — this is what
      // makes switching femme/homme instant instead of freezing for ~2s
      // while the other gender's image downloads for the first time.
      preloadImage(cached.women);
      preloadImage(cached.men);
    }
  }catch(err){ /* ignore */ }

  const currentCat = currentFilter === 'men' ? 'men' : 'women';
  const otherCat = currentCat === 'men' ? 'women' : 'men';

  function persistCache(){
    try{
      localStorage.setItem('cache-pack4-badge-images', JSON.stringify({
        women: pack4BadgeImageUrls.women, men: pack4BadgeImageUrls.men
      }));
    }catch(err){ /* private browsing / storage full — ignore */ }
  }

  // Fetch + paint the image for the category the visitor is actually
  // looking at FIRST, on its own, so it isn't stuck waiting behind the
  // other category's request — this is the "offre pack" image, and it
  // should appear right after the top hero banner, not after everything
  // else on the page.
  try{
    const data = await kvGet(PACK4_IMAGE_KEYS[currentCat]).catch(() => null);
    if(data && data.url){
      pack4BadgeImageUrls[currentCat] = data.url;
      persistCache();
      renderPack4BadgeImage();
    }
  }catch(err){ /* not configured yet */ }

  // Now quietly fetch the other category (and the legacy fallback, if
  // still needed) in the background — no rush, it's not on screen yet.
  // Crucially, we also PRELOAD its actual image bytes here (not just the
  // URL), so the moment the visitor taps the other gender tab, the image
  // is already sitting in the browser cache instead of downloading fresh.
  try{
    const otherData = await kvGet(PACK4_IMAGE_KEYS[otherCat]).catch(() => null);
    if(otherData && otherData.url) pack4BadgeImageUrls[otherCat] = otherData.url;
    if(!pack4BadgeImageUrls.women || !pack4BadgeImageUrls.men){
      const legacy = await kvGet(LEGACY_PACK4_IMAGE_KEY).catch(() => null);
      if(legacy && legacy.url){
        if(!pack4BadgeImageUrls.women) pack4BadgeImageUrls.women = legacy.url;
        if(!pack4BadgeImageUrls.men) pack4BadgeImageUrls.men = legacy.url;
      }
    }
    preloadImage(pack4BadgeImageUrls[otherCat]);
    persistCache();
  }catch(err){ /* not configured yet */ }
  renderPack4BadgeImage();
}

document.getElementById('pack4-banner-image').addEventListener('click', (e) => {
  if(!isAdmin) return;
  if(e.target.closest('.pack4-banner-image-edit') || e.target.closest('.pack4-banner-image-placeholder')){
    e.stopPropagation();
    document.getElementById('pack4-banner-image-input').click();
  }
});

document.getElementById('pack4-banner-image-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  showToast(t('bannerUploading'));
  const url = await uploadProductImage(file, { transparent: true });
  if(url){
    const gender = currentFilter === 'men' ? 'men' : 'women';
    const oldUrl = pack4BadgeImageUrls[gender];
    pack4BadgeImageUrls[gender] = url;
    try{ await kvSet(PACK4_IMAGE_KEYS[gender], { url }); }
    catch(err){ if(isAdmin) showToast(t('toastStorageUnavailable')); }
    if(oldUrl && oldUrl !== url) deleteStorageFile('product-images', oldUrl);
    renderPack4BadgeImage();
  }
});

const heroBannerCtrl = createBannerController({
  sectionId: 'hero-banner',
  contentId: 'hero-banner-content',
  inputId: 'hero-banner-input',
  storageKey: 'aura-hero-banner',
  autoplay: true,
  autoplayDelay: 6000,
  priority: true
});
const bottomBannerCtrl = createBannerController({
  sectionId: 'bottom-banner',
  contentId: 'bottom-banner-content',
  inputId: 'bottom-banner-input',
  storageKey: 'aura-bottom-banner'
});
const bottomBannerCtrl2 = createBannerController({
  sectionId: 'bottom-banner-2',
  contentId: 'bottom-banner-2-content',
  inputId: 'bottom-banner-2-input',
  storageKey: 'aura-bottom-banner-2'
});
// Banner shown at the bottom of the order-tracking view (below "Livré"),
// using the exact same banner system (upload/carousel/admin controls) as
// the homepage banners above. It isn't tied to the men/women filter, so
// it's loaded once, directly, right after being created.
const trackingBannerCtrl = createBannerController({
  sectionId: 'tracking-banner',
  contentId: 'tracking-banner-content',
  inputId: 'tracking-banner-input',
  storageKey: 'aura-tracking-banner'
});
trackingBannerCtrl.load();
heroBannerCtrl.load();
bottomBannerCtrl.load();
bottomBannerCtrl2.load();
// "offre pack" image loads right after the hero banner kicks off its own
// fetch — second priority on the page, ahead of the product grid.
loadPack4BadgeImage();
function renderHeroBanner(){ heroBannerCtrl.render(); bottomBannerCtrl.render(); bottomBannerCtrl2.render(); }
// The top (hero) banner is shared/unified across Femme and Homme on
// purpose — it never switches when the gender filter changes. The bottom
// banners are the opposite: each gender keeps its own separate banner,
// so switching the filter needs to actually swap their content back in.
function setBannerCategory(cat){
  bottomBannerCtrl.setCategory(cat);
  bottomBannerCtrl2.setCategory(cat);
}

const catalogReady = loadCatalog();
loadReviewsSection();

/* ---------- featured full-width products (separate showcase below the grid) ---------- */
const FEATURED_KEY = 'aura-featured-products-v1';
let featuredProducts = [];
let featuredStorageAvailable = true;

async function saveFeaturedProducts(){
  if(!featuredStorageAvailable) return;
  try{
    await kvSet(FEATURED_KEY, featuredProducts);
  }catch(err){
    featuredStorageAvailable = false;
    if(isAdmin) showToast(t('toastStorageUnavailable'));
  }
}

async function loadFeaturedProducts(){
  try{
    const data = await kvGet(FEATURED_KEY);
    if(Array.isArray(data)) featuredProducts = data;
  }catch(err){
    featuredStorageAvailable = false;
  }
  renderFeaturedProducts();
}

function featuredProductCard(p, idx){
  const adminControls = isAdmin ? `
    <div class="admin-controls">
      <button class="featured-edit-btn" data-idx="${idx}" aria-label="Edit product">✎</button>
      <button class="featured-del-btn" data-idx="${idx}" aria-label="Delete product">🗑</button>
    </div>` : '';
  const revealDelayClass = `d${(idx % 4) + 1}`;
  return `<div class="featured-product-card reveal ${revealDelayClass}" data-idx="${idx}">
    <div class="featured-product-media">
      ${adminControls}
      <img class="seq-lazy" data-src="${p.image || ''}" alt="${p.name}" decoding="async">
    </div>
    <div class="featured-product-name">${p.name}</div>
    <div class="featured-product-price">${p.price} DH</div>
  </div>`;
}

function renderFeaturedProducts(){
  const container = document.getElementById('featured-products-list');
  if(!container) return;
  container.innerHTML = featuredProducts.map((p, idx) => featuredProductCard(p, idx)).join('')
    + (isAdmin ? `<button type="button" class="featured-add-card" id="featured-add-card">
        <span class="fac-plus">+</span>
        <span>Ajouter un produit en vedette</span>
      </button>` : '');
  refreshScrollReveal(container);
}
loadFeaturedProducts();

function openFeaturedModal(mode, idx){
  const form = document.getElementById('featured-form');
  form.reset();
  document.getElementById('featured-image-preview').style.display = 'none';
  document.getElementById('featured-idx').value = (idx === undefined || idx === null) ? '' : idx;

  if(mode === 'edit'){
    const p = featuredProducts[idx];
    document.getElementById('featured-modal-title').textContent = 'Modifier le produit';
    document.getElementById('featured-name').value = p.name;
    document.getElementById('featured-price').value = p.price;
    document.getElementById('featured-gender').value = p.gender || 'women';
    if(p.image){
      document.getElementById('featured-image-preview').style.display = 'block';
      document.getElementById('featured-image-preview-img').src = p.image;
    }
  } else {
    document.getElementById('featured-modal-title').textContent = 'Ajouter un produit en vedette';
    document.getElementById('featured-gender').value = 'women';
  }
  document.getElementById('featured-modal').classList.add('open');
  document.getElementById('featured-overlay').classList.add('open');
}
function closeFeaturedModal(){
  document.getElementById('featured-modal').classList.remove('open');
  document.getElementById('featured-overlay').classList.remove('open');
}
document.getElementById('featured-modal-close').addEventListener('click', closeFeaturedModal);
document.getElementById('featured-overlay').addEventListener('click', closeFeaturedModal);

document.getElementById('featured-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  document.getElementById('featured-image-preview').style.display = 'block';
  document.getElementById('featured-image-preview-img').src = URL.createObjectURL(file);
});

document.getElementById('featured-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if(!form.checkValidity()){ form.reportValidity(); return; }

  const idxVal = document.getElementById('featured-idx').value;
  const idx = idxVal === '' ? null : Number(idxVal);
  const name = document.getElementById('featured-name').value.trim();
  const price = Number(document.getElementById('featured-price').value);
  const gender = document.getElementById('featured-gender').value === 'men' ? 'men' : 'women';
  const file = document.getElementById('featured-image').files[0];
  const newImage = await uploadProductImage(file);

  if(idx === null){
    featuredProducts.push({ name, price, gender, image: newImage || '' });
  } else {
    const p = featuredProducts[idx];
    p.name = name;
    p.price = price;
    p.gender = gender;
    if(newImage) p.image = newImage;
  }

  await saveFeaturedProducts();
  closeFeaturedModal();
  renderFeaturedProducts();
});

document.addEventListener('click', (e) => {
  const addNew = e.target.closest('#featured-add-card');
  if(addNew){
    openFeaturedModal('create');
    return;
  }
  const editBtn = e.target.closest('.featured-edit-btn');
  if(editBtn){
    openFeaturedModal('edit', Number(editBtn.dataset.idx));
    return;
  }
  const delBtn = e.target.closest('.featured-del-btn');
  if(delBtn){
    const idx = Number(delBtn.dataset.idx);
    askConfirm(t('deleteConfirmTemplate').replace('{name}', featuredProducts[idx].name), () => {
      featuredProducts.splice(idx, 1);
      saveFeaturedProducts();
      renderFeaturedProducts();
    });
    return;
  }
  // Clicking the featured product card itself (not its admin edit/delete
  // buttons) opens the same "pack of 3 perfumes" picker as the offre-pack
  // banner, locked to the gender the admin chose when creating/editing
  // this card (not asked to the buyer).
  const featuredCard = e.target.closest('.featured-product-card');
  if(featuredCard){
    const idx = Number(featuredCard.dataset.idx);
    const p = featuredProducts[idx];
    openPack4Modal(true, false, (p && p.gender === 'men') ? 'men' : 'women');
  }
});

/* ---------- orders (Supabase relational tables) ---------- */
const SHIPPING_FEE = 20;
const FREE_SHIPPING_THRESHOLD = 195;
const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered'];
let customers = []; // cached list of orders for the admin dashboard

function genOrderNumber(){
  return 'HISTOIRE-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
}

/* ---------- customer's own order history (kept on this device) ----------
   Purely local (localStorage) — no login/account system exists on this
   storefront, so "my orders" means "orders placed from this browser".
   This lets a customer close the site after checkout and, next time they
   open the tracking screen, immediately see their past order(s) and tap
   one to see its status instead of having to remember/retype the code. */
const MY_ORDERS_KEY = 'histoire-my-orders';
function getMyOrders(){
  try{
    const list = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  }catch(e){ return []; }
}
function saveMyOrder(orderNumber, total){
  try{
    let list = getMyOrders().filter(o => o.orderNumber !== orderNumber);
    list.unshift({ orderNumber, total: total || null, date: new Date().toISOString() });
    list = list.slice(0, 10); // keep the 10 most recent
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list));
  }catch(e){}
}

async function createOrder({name, phone, city, address, notes, items, subtotal, shipping, discount, couponCode, total}){
  const orderNumber = genOrderNumber();
  const nowIso = new Date().toISOString();
  if(supabaseClient){
    try{
      // Generate the row's id client-side and insert it explicitly.
      // Reason: after the "orders" SELECT policy was locked to admin-only
      // (security-fix-phase1.sql), a guest can still INSERT a new order,
      // but can no longer read it back via .select().single() afterwards
      // (that read is a SELECT under the hood and gets blocked by RLS,
      // which made every checkout silently fail into the local fallback).
      // Knowing the id in advance means we never need to read it back.
      const orderId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      const orderPayload = {
        id: orderId,
        order_number: orderNumber,
        customer_name: name, customer_phone: phone, customer_city: city,
        customer_address: address, customer_notes: notes || null,
        subtotal, shipping_fee: shipping, discount, coupon_code: couponCode || null,
        total
      };
      const itemsPayload = (items || []).map(i => ({
        product_name: i.name, unit_price: i.price, quantity: i.qty, subtotal: i.price * i.qty
      }));
      const { error: orderErr } = await supabaseClient.rpc('create_order_with_items', {
        p_order: orderPayload,
        p_items: itemsPayload
      });
      if(orderErr) throw orderErr;

      return { orderNumber, id: orderId, createdAt: nowIso };
    }catch(err){
      if(isAdmin) showToast(t('toastStorageUnavailable'));
    }
  }
  // fallback if Supabase isn't configured/reachable — keep the order locally for this session only
  return { orderNumber, id: null, createdAt: nowIso, items, name, phone, city, address, notes, subtotal, discount, couponCode, total, status:'pending', local:true };
}

async function fetchOrders(){
  if(!supabaseClient) return [];
  try{
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  }catch(err){
    return [];
  }
}

async function updateOrderStatus(orderId, status){
  if(!supabaseClient) return false;
  try{
    await supabaseClient.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
    await supabaseClient.from('order_status_history').insert({ order_id: orderId, status });
    return true;
  }catch(err){
    showToast(t('toastStorageUnavailable'));
    return false;
  }
}

async function deleteOrder(orderId){
  if(!supabaseClient) return false;
  try{
    const { error } = await supabaseClient.from('orders').delete().eq('id', orderId);
    if(error){
      console.error('deleteOrder failed:', error);
      showToast(t('toastStorageUnavailable'));
      return false;
    }
    return true;
  }catch(err){
    console.error('deleteOrder failed:', err);
    showToast(t('toastStorageUnavailable'));
    return false;
  }
}

async function fetchStatusHistory(orderId){
  if(!supabaseClient) return [];
  try{
    const { data, error } = await supabaseClient
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('changed_at', { ascending: true });
    if(error) throw error;
    return data || [];
  }catch(err){
    return [];
  }
}

async function fetchOrderByNumber(orderNumber){
  if(!supabaseClient) return null;
  try{
    // Uses a security-definer RPC instead of a direct table select, so a
    // guest can look up their own order by its exact number without the
    // "orders" table needing to be publicly readable (see security-fix-phase1.sql).
    const { data, error } = await supabaseClient
      .rpc('get_order_by_number', { p_order_number: orderNumber });
    if(error) throw error;
    return data;
  }catch(err){
    return null;
  }
}

/* ---------- customer reviews (Supabase table + storage) ---------- */
let publicReviews = [];   // cached approved reviews shown on the storefront
let testimonialIndex = 0;
let testimonialTimer = null;
let adminReviews = [];    // cached full list (pending + approved) for the admin dashboard

async function fetchApprovedReviews(){
  if(!supabaseClient) return [];
  try{
    const { data, error } = await supabaseClient
      .from('reviews')
      .select('*')
      .eq('approved', true)
      .order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  }catch(err){
    return [];
  }
}

async function fetchApprovedReviewsForProduct(productName){
  if(!supabaseClient || !productName) return [];
  try{
    const { data, error } = await supabaseClient
      .from('reviews')
      .select('*')
      .eq('approved', true)
      .eq('product_name', productName)
      .order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  }catch(err){
    return [];
  }
}

async function fetchAllReviewsAdmin(){
  if(!supabaseClient) return [];
  try{
    const { data, error } = await supabaseClient
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  }catch(err){
    return [];
  }
}

async function uploadReviewImage(file){
  if(!file) return null;
  const blob = await compressImageToBlob(file, 640, 0.78, false, 'image/webp');
  if(!blob) return null;
  const ext = blob.type === 'image/webp' ? 'webp' : (blob.type === 'image/png' ? 'png' : 'jpg');
  if(supabaseClient){
    try{
      const filename = `reviews/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabaseClient.storage
        .from('review-images')
        .upload(filename, blob, { contentType: blob.type || 'image/webp', upsert: true, cacheControl: '31536000' });
      if(error) throw error;
      const { data } = supabaseClient.storage.from('review-images').getPublicUrl(filename);
      return data.publicUrl;
    }catch(err){
      // fall through to base64 fallback below
    }
  }
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

async function submitReview({ name, rating, comment, imageFile, productName }){
  if(!supabaseClient) return { ok: false };
  try{
    let imageUrl = null;
    if(imageFile) imageUrl = await uploadReviewImage(imageFile);
    const { error } = await supabaseClient.from('reviews').insert({
      customer_name: name,
      rating,
      comment,
      image_url: imageUrl,
      product_name: productName || null,
      approved: false
    });
    if(error) throw error;
    return { ok: true };
  }catch(err){
    return { ok: false };
  }
}

async function approveReview(id){
  if(!supabaseClient) return false;
  try{
    const { error } = await supabaseClient.from('reviews').update({ approved: true }).eq('id', id);
    if(error) throw error;
    return true;
  }catch(err){
    showToast(t('toastStorageUnavailable'));
    return false;
  }
}

async function deleteReview(id){
  if(!supabaseClient) return false;
  try{
    // Look up the image_url first so we can also remove the photo file from
    // Storage — deleting only the row would leave it orphaned in the bucket.
    const { data: reviewRow } = await supabaseClient.from('reviews').select('image_url').eq('id', id).maybeSingle();
    const { error } = await supabaseClient.from('reviews').delete().eq('id', id);
    if(error) throw error;
    if(reviewRow && reviewRow.image_url) deleteStorageFile('review-images', reviewRow.image_url);
    return true;
  }catch(err){
    showToast(t('toastStorageUnavailable'));
    return false;
  }
}

function reviewStarsHtml(rating){
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  let html = '';
  for(let i = 1; i <= 5; i++) html += `<span class="review-star${i <= r ? ' filled' : ''}">★</span>`;
  return html;
}

function reviewInitial(name){
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function reviewFormatDate(iso){
  try{
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }catch(err){ return ''; }
}

function testimonialCardHtml(r){
  const img = r.image_url ? `<div class="testimonial-photo"><img class="seq-lazy" data-src="${r.image_url}" alt="Photo de ${(r.customer_name || '').replace(/</g, '&lt;')}"></div>` : '';
  return `
    <div class="testimonial-card">
      <div class="testimonial-quote-mark" aria-hidden="true">&ldquo;</div>
      <div class="testimonial-stars">${reviewStarsHtml(r.rating)}</div>
      <p class="testimonial-text">${(r.comment || '').replace(/</g, '&lt;')}</p>
      ${img}
      <div class="testimonial-divider"></div>
      <div class="testimonial-name">${(r.customer_name || '').replace(/</g, '&lt;')}</div>
      <div class="testimonial-date">${reviewFormatDate(r.created_at)}</div>
    </div>`;
}

/* ---------- per-product reviews (product page) ---------- */
function ppReviewCardHtml(r){
  const img = r.image_url ? `<div class="pp-review-photo"><img class="seq-lazy" data-src="${r.image_url}" alt=""></div>` : '';
  return `
    <div class="pp-review-card">
      <div class="ad-review-head">
        <div class="review-card-avatar">${reviewInitial(r.customer_name)}</div>
        <div class="ad-review-head-info">
          <div class="review-card-name">${(r.customer_name || '').replace(/</g, '&lt;')}</div>
          <div class="review-card-date">${reviewFormatDate(r.created_at)}</div>
        </div>
        <div class="review-card-stars">${reviewStarsHtml(r.rating)}</div>
      </div>
      <p class="review-card-text">${(r.comment || '').replace(/</g, '&lt;')}</p>
      ${img}
    </div>`;
}

async function renderProductReviews(productName){
  const listEl = document.getElementById('pp-reviews-list');
  const summaryEl = document.getElementById('pp-reviews-summary');
  if(!listEl) return;
  listEl.innerHTML = `<div class="testimonial-skel"></div>`;
  const reviews = await fetchApprovedReviewsForProduct(productName);
  // Bail out silently if the visitor has already navigated to a different
  // product page while this fetch was in flight — avoids painting stale
  // reviews for the wrong perfume.
  if(!currentProductPage) return;
  const list = currentProductPage.category === 'men' ? men : women;
  const activeName = list[currentProductPage.idx] ? list[currentProductPage.idx].name : null;
  if(activeName !== productName) return;

  if(!reviews.length){
    listEl.innerHTML = `<p class="ad-empty-note">Soyez le premier à donner votre avis sur ce parfum.</p>`;
    if(summaryEl) summaryEl.style.display = 'none';
    return;
  }
  const avg = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length;
  if(summaryEl){
    summaryEl.style.display = 'flex';
    const starsEl = document.getElementById('pp-reviews-summary-stars');
    const textEl = document.getElementById('pp-reviews-summary-text');
    if(starsEl) starsEl.innerHTML = reviewStarsHtml(Math.round(avg));
    if(textEl) textEl.textContent = `${avg.toFixed(1)} sur 5 (${reviews.length} avis)`;
  }
  listEl.innerHTML = reviews.map(ppReviewCardHtml).join('');
}

let ppReviewSelectedRating = 0;



function renderTestimonialDots(){
  const dotsEl = document.getElementById('testimonial-dots');
  if(!dotsEl) return;
  const total = publicReviews.length;
  // With a handful of reviews, individual dots are a nice touch. With
  // hundreds of reviews, hundreds of dots would break the layout — fall
  // back to a simple "3 / 240" counter instead, still fully working with
  // the same rotation/swipe logic underneath.
  if(total > 12){
    dotsEl.classList.add('is-counter');
    dotsEl.innerHTML = `<span class="testimonial-counter" id="testimonial-counter">${testimonialIndex + 1} / ${total}</span>`;
    return;
  }
  dotsEl.classList.remove('is-counter');
  dotsEl.innerHTML = publicReviews.map((_, i) =>
    `<button type="button" class="testimonial-dot${i === testimonialIndex ? ' active' : ''}" data-i="${i}" aria-label="Avis ${i + 1}"></button>`
  ).join('');
  dotsEl.querySelectorAll('.testimonial-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      stopTestimonialAutoplay();
      showTestimonial(parseInt(btn.dataset.i, 10));
      startTestimonialAutoplay();
    });
  });
}

function updateTestimonialIndicator(){
  const dotsEl = document.getElementById('testimonial-dots');
  if(!dotsEl) return;
  if(dotsEl.classList.contains('is-counter')){
    const counter = document.getElementById('testimonial-counter');
    if(counter) counter.textContent = `${testimonialIndex + 1} / ${publicReviews.length}`;
    return;
  }
  dotsEl.querySelectorAll('.testimonial-dot').forEach((d, idx) => d.classList.toggle('active', idx === testimonialIndex));
}

function showTestimonial(i){
  if(!publicReviews.length) return;
  testimonialIndex = (i + publicReviews.length) % publicReviews.length;
  const track = document.getElementById('reviews-grid');
  if(!track) return;
  track.classList.add('is-fading');
  setTimeout(() => {
    track.innerHTML = testimonialCardHtml(publicReviews[testimonialIndex]);
    track.classList.remove('is-fading');
  }, 220);
  updateTestimonialIndicator();
}

function startTestimonialAutoplay(){
  stopTestimonialAutoplay();
  if(publicReviews.length < 2) return;
  testimonialTimer = setInterval(() => showTestimonial(testimonialIndex + 1), 4000);
}
function stopTestimonialAutoplay(){
  if(testimonialTimer) clearInterval(testimonialTimer);
  testimonialTimer = null;
}

/* ---------- swipe to browse testimonials (works for any number of reviews) ---------- */
function setupTestimonialSwipe(carousel){
  if(!carousel || carousel.dataset.swipeBound) return;
  carousel.dataset.swipeBound = '1';
  let startX = 0, startY = 0, tracking = false;
  const threshold = 40; // min horizontal drag distance (px) to count as a swipe
  carousel.addEventListener('touchstart', (e) => {
    if(!e.touches || !e.touches.length) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  carousel.addEventListener('touchend', (e) => {
    if(!tracking) return;
    tracking = false;
    const touch = e.changedTouches && e.changedTouches[0];
    if(!touch || publicReviews.length < 2) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if(Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return; // ignore taps / vertical scrolls
    stopTestimonialAutoplay();
    if(dx < 0) showTestimonial(testimonialIndex + 1); // swiped left -> next
    else showTestimonial(testimonialIndex - 1);        // swiped right -> previous
    startTestimonialAutoplay();
  }, { passive: true });
}

async function loadReviewsSection(){
  const track = document.getElementById('reviews-grid');
  const emptyNote = document.getElementById('reviews-empty-note');
  const carousel = document.getElementById('testimonial-carousel');
  const ratingLine = document.getElementById('reviews-summary');
  if(!track) return;
  publicReviews = await fetchApprovedReviews();
  if(!publicReviews.length){
    if(carousel) carousel.style.display = 'none';
    if(ratingLine) ratingLine.style.display = 'none';
    emptyNote.style.display = 'block';
    if(typeof refreshScrollReveal === 'function') refreshScrollReveal();
    return;
  }
  emptyNote.style.display = 'none';
  if(carousel) carousel.style.display = 'block';
  testimonialIndex = 0;
  track.innerHTML = testimonialCardHtml(publicReviews[0]);
  renderTestimonialDots();
  const avg = publicReviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / publicReviews.length;
  const summaryStarsEl = document.getElementById('reviews-summary-stars');
  const summaryTextEl = document.getElementById('reviews-summary-text');
  if(summaryStarsEl) summaryStarsEl.innerHTML = reviewStarsHtml(Math.round(avg));
  if(summaryTextEl) summaryTextEl.textContent = `${avg.toFixed(1)} sur 5 — basé sur ${publicReviews.length} avis`;
  if(ratingLine) ratingLine.style.display = 'flex';
  if(carousel && !carousel.dataset.tBound){
    carousel.dataset.tBound = '1';
    // Pause-on-hover is a desktop-only nicety. On touch devices, some mobile
    // browsers fire a synthetic "mouseenter" on tap with no matching
    // "mouseleave" afterwards — which would silently freeze the rotation
    // forever after the very first tap. Guard it to real hover-capable
    // pointers only, exactly like the rest of the site's hover effects.
    if(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches){
      carousel.addEventListener('mouseenter', stopTestimonialAutoplay);
      carousel.addEventListener('mouseleave', startTestimonialAutoplay);
    }
    setupTestimonialSwipe(carousel);
  }
  startTestimonialAutoplay();
  if(typeof refreshScrollReveal === 'function') refreshScrollReveal();
}

/* ---------- review submission modal ---------- */
let reviewSelectedRating = 0;
let reviewSelectedImageFile = null;

function openReviewModal(){
  document.getElementById('review-form').style.display = 'block';
  document.getElementById('review-thanks').style.display = 'none';
  document.getElementById('review-modal').classList.add('open');
  document.getElementById('review-overlay').classList.add('open');
}
function closeReviewModal(){
  document.getElementById('review-modal').classList.remove('open');
  document.getElementById('review-overlay').classList.remove('open');
}
document.getElementById('reviews-write-btn').addEventListener('click', openReviewModal);
document.getElementById('review-modal-close').addEventListener('click', closeReviewModal);
document.getElementById('review-overlay').addEventListener('click', closeReviewModal);
document.getElementById('review-thanks-close').addEventListener('click', closeReviewModal);

document.getElementById('review-star-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('.review-star-btn');
  if(!btn) return;
  reviewSelectedRating = Number(btn.dataset.star);
  document.getElementById('review-rating').value = reviewSelectedRating;
  document.querySelectorAll('.review-star-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.star) <= reviewSelectedRating);
  });
});

async function convertHeicIfNeeded(file){
  if(!file) return file;
  const looksHeic = /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if(!looksHeic) return file;
  try{
    if(typeof heic2any !== 'function') return file;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(result) ? result[0] : result;
    return new File([blob], (file.name || 'photo').replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  }catch(err){
    return file;
  }
}

document.getElementById('review-image-placeholder').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('review-image-input').click();
});
document.getElementById('review-image-input').addEventListener('change', async (e) => {
  let file = e.target.files && e.target.files[0];
  if(!file) return;
  const placeholderText = document.querySelector('#review-image-placeholder span');
  const originalText = placeholderText ? placeholderText.textContent : '';
  if(placeholderText) placeholderText.textContent = 'Traitement de la photo...';
  file = await convertHeicIfNeeded(file);
  reviewSelectedImageFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    if(placeholderText) placeholderText.textContent = originalText;
    const preview = document.getElementById('review-image-preview');
    preview.src = reader.result;
    preview.style.display = 'block';
    document.getElementById('review-image-placeholder').style.display = 'none';
    document.getElementById('review-image-remove').style.display = 'flex';
  };
  reader.onerror = () => {
    if(placeholderText) placeholderText.textContent = originalText;
    showToast('Impossible de lire cette photo, essayez une autre image.');
  };
  reader.readAsDataURL(file);
});
document.getElementById('review-image-remove').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  reviewSelectedImageFile = null;
  document.getElementById('review-image-input').value = '';
  document.getElementById('review-image-preview').style.display = 'none';
  document.getElementById('review-image-placeholder').style.display = 'flex';
  document.getElementById('review-image-remove').style.display = 'none';
});

function resetReviewForm(){
  document.getElementById('review-form').reset();
  reviewSelectedRating = 0;
  reviewSelectedImageFile = null;
  document.getElementById('review-rating').value = 0;
  document.querySelectorAll('.review-star-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('review-image-preview').style.display = 'none';
  document.getElementById('review-image-placeholder').style.display = 'flex';
  document.getElementById('review-image-remove').style.display = 'none';
  document.getElementById('review-form-error').style.display = 'none';
}

document.getElementById('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('review-name').value.trim();
  const comment = document.getElementById('review-comment').value.trim();
  const errorEl = document.getElementById('review-form-error');
  if(!name || !comment || reviewSelectedRating < 1){
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';
  const submitBtn = document.getElementById('review-submit-btn');
  submitBtn.disabled = true;
  const prevLabel = submitBtn.textContent;
  submitBtn.textContent = 'Envoi en cours...';
  const result = await submitReview({ name, rating: reviewSelectedRating, comment, imageFile: reviewSelectedImageFile });
  submitBtn.disabled = false;
  submitBtn.textContent = prevLabel;
  if(result.ok){
    document.getElementById('review-form').style.display = 'none';
    document.getElementById('review-thanks').style.display = 'block';
    resetReviewForm();
  }else{
    showToast(t('toastStorageUnavailable'));
  }
});

/* ---------- admin: reviews moderation ---------- */
let adReviewsStatusFilter = 'pending';

function adReviewCardHtml(r){
  const img = r.image_url ? `<div class="ad-review-photo"><img src="${r.image_url}" alt="" loading="lazy"></div>` : '';
  const productTag = r.product_name ? `<div class="ad-review-product-tag">${(r.product_name || '').replace(/</g, '&lt;')}</div>` : '';
  const actionBtn = r.approved
    ? `<button type="button" class="ad-review-del-btn" data-id="${r.id}">Retirer</button>`
    : `<button type="button" class="ad-review-approve-btn" data-id="${r.id}">Approuver</button><button type="button" class="ad-review-del-btn" data-id="${r.id}">Refuser</button>`;
  return `
    <div class="ad-review-card">
      <div class="ad-review-head">
        <div class="review-card-avatar">${reviewInitial(r.customer_name)}</div>
        <div class="ad-review-head-info">
          <div class="review-card-name">${(r.customer_name || '').replace(/</g, '&lt;')}</div>
          <div class="review-card-date">${reviewFormatDate(r.created_at)}</div>
        </div>
        <div class="review-card-stars">${reviewStarsHtml(r.rating)}</div>
      </div>
      ${productTag}
      <p class="review-card-text">${(r.comment || '').replace(/</g, '&lt;')}</p>
      ${img}
      <div class="ad-review-actions">${actionBtn}</div>
    </div>`;
}

function adUpdateReviewsTabCounts(){
  const pending = adminReviews.filter(r => !r.approved).length;
  const approved = adminReviews.filter(r => r.approved).length;
  const pendingEl = document.getElementById('ad-tab-count-review-pending');
  const approvedEl = document.getElementById('ad-tab-count-review-approved');
  if(pendingEl) pendingEl.textContent = pending;
  if(approvedEl) approvedEl.textContent = approved;
  const navBadge = document.getElementById('ad-nav-reviews-count');
  if(navBadge) navBadge.textContent = pending;
}

async function adRenderReviewsPage(){
  const container = document.getElementById('ad-reviews-list');
  container.innerHTML = `<div class="ad-skel-row"></div><div class="ad-skel-row"></div>`;
  adminReviews = await fetchAllReviewsAdmin();
  adUpdateReviewsTabCounts();
  const list = adminReviews.filter(r => adReviewsStatusFilter === 'approved' ? r.approved : !r.approved);
  if(!list.length){
    container.innerHTML = `<p class="ad-empty-note">${adReviewsStatusFilter === 'approved' ? 'Aucun avis publié.' : 'Aucun avis en attente.'}</p>`;
    return;
  }
  container.innerHTML = list.map(adReviewCardHtml).join('');
}

const adReviewsFilterTabsEl = document.getElementById('ad-reviews-filter-tabs');
if(adReviewsFilterTabsEl){
  adReviewsFilterTabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.ad-tab');
    if(!tab) return;
    adReviewsStatusFilter = tab.dataset.reviewStatus;
    document.querySelectorAll('#ad-reviews-filter-tabs .ad-tab').forEach(b => b.classList.toggle('active', b === tab));
    adRenderReviewsPage();
  });
}

const adReviewsListEl = document.getElementById('ad-reviews-list');
if(adReviewsListEl){
  adReviewsListEl.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.ad-review-approve-btn');
    const delBtn = e.target.closest('.ad-review-del-btn');
    if(approveBtn){
      approveBtn.disabled = true;
      const ok = await approveReview(approveBtn.dataset.id);
      if(ok){ showToast('Avis approuvé et publié.'); loadReviewsSection(); }
      adRenderReviewsPage();
    }else if(delBtn){
      delBtn.disabled = true;
      const ok = await deleteReview(delBtn.dataset.id);
      if(ok){ showToast('Avis supprimé.'); loadReviewsSection(); }
      adRenderReviewsPage();
    }
  });
}

async function checkCoupon(code){
  if(!supabaseClient || !code) return null;
  try{
    const { data, error } = await supabaseClient
      .from('coupons')
      .select('*')
      .ilike('code', code)
      .maybeSingle();
    if(error) throw error;
    if(!data || !data.active) return null;
    if(data.expires_at && new Date(data.expires_at) < new Date()) return null;
    return data;
  }catch(err){
    return null;
  }
}

function estimateDeliveryDate(){
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d;
}

function setAdminUI(){
  document.getElementById('exit-admin-btn').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('customers-btn').style.display = isAdmin ? 'block' : 'none';
  renderShop(currentFilter, true);
  renderHeroBanner();
  trackingBannerCtrl.render();
  renderPack4BadgeImage();
  renderFeaturedProducts();
  if(currentProductPage) renderProductPage();
}

// Logo now behaves like a normal store logo (goes home). Admin entry is
// gated server-side (see middleware.js) — the real URL is never present
// in this file, so it can't be found by reading the site's source.
document.getElementById('logo-link').addEventListener('click', (e) => {
  e.preventDefault();
  if(isAdmin) return;
  // Previously this only scrolled to top -- it never actually closed
  // whatever sub-page/modal was open (product page, checkout, the pack4
  // modal, ...), so the URL was left pointing at e.g. /product/xxx even
  // after the visitor was back looking at the home page. That stale URL
  // is exactly what a refresh (or routeInitialLoad() below) then reads
  // and reopens. Explicitly closing everything here keeps the URL and
  // what's actually on screen in sync, the same way the browser's own
  // back button already does via the popstate handler above.
  closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true);
  closeSideMenu(true); closeProductPage(true); closeCheckoutPage(true);
  closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true);
  try{ history.pushState({}, '', '/'); }catch(err){}
  try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(err){}
});

function openAdminLoginModal(pushHistory){
  document.getElementById('admin-login-error').style.display = 'none';
  document.getElementById('admin-login-form').reset();
  document.getElementById('admin-login-modal').classList.add('open');
  document.getElementById('admin-login-overlay').classList.add('open');
  setTimeout(() => document.getElementById('admin-login-password').focus(), 250);
  if(pushHistory !== false){
    try{ history.pushState({ admin: 'login' }, '', '/panel'); }catch(err){}
  }
}
function closeAdminLoginModal(fromPopstate){
  document.getElementById('admin-login-modal').classList.remove('open');
  document.getElementById('admin-login-overlay').classList.remove('open');
  if(!fromPopstate){
    try{ history.pushState({}, '', '/'); }catch(err){}
  }
}
document.getElementById('admin-login-close').addEventListener('click', () => closeAdminLoginModal());
document.getElementById('admin-login-overlay').addEventListener('click', () => closeAdminLoginModal());
async function checkAdminPassword(email, pass){
  try{
    if(!supabaseClient) return false;
    // Real Supabase Auth sign-in — the email is now typed at login time
    // (not stored in the page's code), so it's no longer visible to
    // anyone just viewing the page source.
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: pass
    });
    if(error) throw error;
    return !!(data && data.session);
  }catch(err){
    // Wrong password / Supabase unreachable — deny login, no fallback
  }
  return false;
}

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = document.getElementById('admin-login-email').value.trim();
  const pass = document.getElementById('admin-login-password').value;
  submitBtn.disabled = true;
  const ok = await checkAdminPassword(email, pass);
  submitBtn.disabled = false;
  if(ok){
    isAdmin = true;
    closeAdminLoginModal();
    setAdminUI();
    if(pendingAdminOrderNumber){
      const target = pendingAdminOrderNumber;
      pendingAdminOrderNumber = null;
      await openAdminDashboardPage();
      jumpToAdminOrder(target);
    }
  } else {
    document.getElementById('admin-login-error').style.display = 'block';
  }
});

document.getElementById('exit-admin-btn').addEventListener('click', async () => {
  isAdmin = false;
  try{ if(supabaseClient) await supabaseClient.auth.signOut(); }catch(err){}
  setAdminUI();
});

// Admin mode should ONLY ever be active right after an explicit password
// login — never automatically restored from a saved browser session. Any
// leftover Supabase session from a previous login (on this device) is
// signed out immediately on page load, so every visit starts as a guest.
(async function clearAnyLingeringAdminSession(){
  try{
    if(!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    if(data && data.session){
      await supabaseClient.auth.signOut();
    }
  }catch(err){}
  isAdmin = false;
})();

(function checkForOrderDeepLink(){
  try{
    const orderParam = new URLSearchParams(location.search).get('order');
    if(orderParam){
      pendingAdminOrderNumber = orderParam;
      openAdminLoginModal(false);
    }
  }catch(err){}
})();

/* ---------- search ---------- */
function scoreProduct(p, terms){
  const name = p.name.toLowerCase();
  const family = p.family.toLowerCase();
  const desc = p.desc.toLowerCase();
  let score = 0;
  for(const t of terms){
    if(name === t) score += 100;
    else if(name.startsWith(t)) score += 60;
    else if(name.includes(t)) score += 40;
    else if(family.includes(t)) score += 15;
    else if(desc.includes(t)) score += 5;
    else return -1; // this term matched nothing — exclude the product
  }
  return score;
}

function renderSearchResults(query){
  const q = query.trim().toLowerCase();
  const all = meta[currentFilter] ? meta[currentFilter].list : men;
  let results;
  if(!q){
    results = all;
  } else {
    const terms = q.split(/\s+/).filter(Boolean);
    results = all
      .map(p => ({ p, score: scoreProduct(p, terms) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.p);
  }
  const container = document.getElementById('search-results');
  if(results.length === 0){
    container.innerHTML = `<p class="wishlist-empty">${t('noResultsFound')}</p>`;
    return;
  }
  container.innerHTML = results.map(pRaw => {
    const p = localizedProduct(pRaw);
    return `
    <div class="wishlist-item" data-name="${p.name}">
      <div class="wi-info">
        <div class="wi-name">${p.name}</div>
        <div class="wi-meta">${p.family}</div>
        <div class="wi-price">${p.price} DH</div>
      </div>
    </div>`;
  }).join('');
}

function openSearchModal(){
  document.getElementById('search-modal').classList.add('open');
  document.getElementById('search-overlay').classList.add('open');
  const input = document.getElementById('search-input');
  input.value = '';
  renderSearchResults('');
  setTimeout(() => input.focus(), 250);
}
function closeSearchModal(){
  document.getElementById('search-modal').classList.remove('open');
  document.getElementById('search-overlay').classList.remove('open');
}
document.getElementById('search-btn').addEventListener('click', openSearchModal);
document.getElementById('search-modal-close').addEventListener('click', closeSearchModal);
document.getElementById('search-overlay').addEventListener('click', closeSearchModal);
document.getElementById('search-input').addEventListener('input', (e) => renderSearchResults(e.target.value));

/* ---------- Pack of 4 Perfumes ---------- */

const PACK4_PRICE = 195;
let pack4Selection = [null, null, null];
let pack4Qty = 1;
let pack4ActiveSlot = null;
let pack4PickerFilter = 'all';
let checkoutOrigin = null; // 'pack4' when checkout was reached from the 3-perfume pack builder, so "Retour" can send the user back to their in-progress pack instead of the home screen
// When set to 'men' or 'women', the pack builder is restricted to that
// gender only (used when opening the pack picker from the big featured
// product card, after the visitor answers "Femme ou Homme ?"). Left null
// for the normal "offre pack" banner, which still offers everything.
let pack4LockedGender = null;

function pack4AllProducts(){
  if(pack4LockedGender === 'men') return men;
  if(pack4LockedGender === 'women') return women;
  return currentFilter === 'men' ? [...men, ...women] : [...women, ...men];
}
function pack4FindProduct(name){
  return pack4AllProducts().find(p => p.name === name);
}

function renderPack4Slots(){
  const container = document.getElementById('pack4-slots');
  container.innerHTML = pack4Selection.map((sel, i) => {
    if(sel){
      const p = localizedProduct(pack4FindProduct(sel));
      return `<div class="pack4-slot filled" data-slot="${i}">
        <button type="button" class="pack4-slot-remove" data-slot="${i}" aria-label="Remove">✕</button>
        <div class="co-item-thumb">${productMedia(p)}</div>
        <div class="pack4-slot-name">${p.name}</div>
      </div>`;
    }
    return `<div class="pack4-slot" data-slot="${i}">
      <div class="pack4-slot-plus">+</div>
      <div class="pack4-slot-label">${t('pack4ChooseLabel')}</div>
    </div>`;
  }).join('<div class="pack4-plus-sep">+</div>');
  const filled = pack4Selection.filter(Boolean).length;
  document.getElementById('pack4-progress').textContent = `${filled}/3`;
  document.getElementById('pack4-add-btn').disabled = filled < 3;
  document.getElementById('pack4-cart-btn').disabled = filled < 3;
  document.getElementById('pack4-price-value').textContent = `${PACK4_PRICE * pack4Qty} DH`;
}

function renderPack4Qty(){
  document.getElementById('pack4-qty-num').value = pack4Qty;
  document.getElementById('pack4-price-value').textContent = `${PACK4_PRICE * pack4Qty} DH`;
}
document.getElementById('pack4-qty-dec').addEventListener('click', () => {
  if(pack4Qty <= 1) return;
  pack4Qty -= 1;
  renderPack4Qty();
});
document.getElementById('pack4-qty-inc').addEventListener('click', () => {
  pack4Qty += 1;
  renderPack4Qty();
});
const pack4QtyInput = document.getElementById('pack4-qty-num');
if(pack4QtyInput){
  pack4QtyInput.addEventListener('input', () => { pack4QtyInput.value = pack4QtyInput.value.replace(/[^0-9]/g, ''); });
  pack4QtyInput.addEventListener('blur', () => {
    let v = parseInt(pack4QtyInput.value, 10);
    if(!v || v < 1) v = 1;
    pack4Qty = v;
    renderPack4Qty();
  });
  pack4QtyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ pack4QtyInput.blur(); } });
}

function openPack4Modal(pushHistory, preserveSelection, lockedGender){
  if(!preserveSelection){
    pack4Selection = [null, null, null];
    pack4Qty = 1;
  }
  pack4ActiveSlot = null;
  pack4LockedGender = lockedGender || null;
  pack4PickerFilter = pack4LockedGender || (currentFilter === 'men' ? 'men' : 'women');
  // When locked to a single gender, hide the "Tous / Homme / Femme" filter
  // buttons in the picker so the visitor can't switch to the other gender —
  // only the matching filter button stays, already marked active.
  document.querySelectorAll('.pack4-pf-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pf === pack4PickerFilter);
    b.style.display = pack4LockedGender && b.dataset.pf !== pack4LockedGender ? 'none' : '';
    // Lead with whichever gender matches the shop's active tab (Femme/Homme),
    // followed by the other gender, then "Tous" last.
    const order = currentFilter === 'men'
      ? { men: 0, women: 1, all: 2 }
      : { women: 0, men: 1, all: 2 };
    b.style.order = order[b.dataset.pf];
  });
  renderPack4Slots();
  renderPack4Qty();
  document.getElementById('pack4-modal').classList.add('open');
  document.getElementById('pack4-overlay').classList.add('open');
  if(pushHistory !== false){
    try{ history.pushState({ pack4: true }, '', '/offre'); }catch(err){}
  }
}
function closePack4Modal(fromPopstate){
  document.getElementById('pack4-modal').classList.remove('open');
  document.getElementById('pack4-overlay').classList.remove('open');
  if(!fromPopstate){
    try{ history.pushState({}, '', '/'); }catch(err){}
  }
}
document.getElementById('pack4-banner-btn').addEventListener('click', () => openPack4Modal());
document.getElementById('pack4-modal-close').addEventListener('click', () => closePack4Modal());
document.getElementById('pack4-overlay').addEventListener('click', () => closePack4Modal());

// The rotating gold border around the pack4 banner is now pure CSS: the
// border's paint source is a spinning conic-gradient (see .pack4-banner's
// background/@property --pack4-angle/@keyframes pack4-border-spin in
// style.css) instead of a solid color, so it's the actual border itself
// that appears to rotate -- no overlay element and no JS needed here.

document.getElementById('pack4-slots').addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.pack4-slot-remove');
  if(removeBtn){
    pack4Selection[Number(removeBtn.dataset.slot)] = null;
    renderPack4Slots();
    return;
  }
  const slot = e.target.closest('.pack4-slot');
  if(slot){
    pack4ActiveSlot = Number(slot.dataset.slot);
    openPack4Picker();
  }
});

function renderPack4Picker(){
  const container = document.getElementById('pack4-picker-list');
  let list = pack4PickerFilter === 'men' ? men : pack4PickerFilter === 'women' ? women : pack4AllProducts();
  const term = (document.getElementById('pack4-picker-search').value || '').trim().toLowerCase();
  if(term){
    list = list.filter(pRaw => {
      const p = localizedProduct(pRaw);
      return p.name.toLowerCase().includes(term) || (p.family || '').toLowerCase().includes(term);
    });
  }
  if(!list.length){
    container.innerHTML = `<p class="wishlist-empty">${t('noResultsFound') || 'Aucun parfum trouvé'}</p>`;
    return;
  }
  container.innerHTML = list.map(pRaw => {
    const p = localizedProduct(pRaw);
    const selected = pack4Selection.includes(pRaw.name);
    return `<div class="pack4-picker-item${selected ? ' is-selected' : ''}" data-name="${pRaw.name}">
      <div class="co-item-thumb">${productMedia(p)}</div>
      <div class="pack4-picker-info">
        <div class="pack4-picker-name">${p.name}</div>
        <div class="pack4-picker-meta">${p.family}</div>
      </div>
      ${selected ? '<span class="pack4-picker-check">✓</span>' : ''}
    </div>`;
  }).join('');
}

document.getElementById('pack4-picker-search').addEventListener('input', renderPack4Picker);

document.getElementById('pack4-picker-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.pack4-pf-btn');
  if(!btn) return;
  pack4PickerFilter = btn.dataset.pf;
  document.querySelectorAll('.pack4-pf-btn').forEach(b => b.classList.toggle('active', b.dataset.pf === pack4PickerFilter));
  renderPack4Picker();
});

function openPack4Picker(){
  document.getElementById('pack4-picker-search').value = '';
  renderPack4Picker();
  document.getElementById('pack4-picker-modal').classList.add('open');
  document.getElementById('pack4-picker-overlay').classList.add('open');
}
function closePack4Picker(){
  document.getElementById('pack4-picker-modal').classList.remove('open');
  document.getElementById('pack4-picker-overlay').classList.remove('open');
  pack4ActiveSlot = null;
}
document.getElementById('pack4-picker-close').addEventListener('click', closePack4Picker);
document.getElementById('pack4-picker-overlay').addEventListener('click', closePack4Picker);
document.getElementById('pack4-picker-list').addEventListener('click', (e) => {
  const item = e.target.closest('.pack4-picker-item');
  if(!item || pack4ActiveSlot === null) return;
  pack4Selection[pack4ActiveSlot] = item.dataset.name;
  closePack4Picker();
  renderPack4Slots();
});

function pack4CurrentBadgeImage(){
  const gender = pack4LockedGender || currentFilter || 'women';
  return pack4BadgeImageUrls[gender] || pack4BadgeImageUrls.women || pack4BadgeImageUrls.men || null;
}

document.getElementById('pack4-add-btn').addEventListener('click', () => {
  const names = pack4Selection.filter(Boolean);
  if(names.length < 3) return;
  checkoutOverrideItems = [{
    name: `${t('pack4CartFamily')} — ${names.join(', ')}`,
    displayName: t('pack4CartFamily'),
    image: pack4CurrentBadgeImage(),
    price: PACK4_PRICE,
    family: t('pack4CartFamily'),
    qty: pack4Qty
  }];
  checkoutOrigin = 'pack4';
  closePack4Modal(true);
  closeCartDrawer();
  closeWishlistDrawer();
  openCheckoutPage();
});

document.getElementById('pack4-cart-btn').addEventListener('click', () => {
  const names = pack4Selection.filter(Boolean);
  if(names.length < 3) return;
  addToCart(`${t('pack4CartFamily')} — ${names.join(', ')}`, PACK4_PRICE, t('pack4CartFamily'), pack4Qty, {
    displayName: t('pack4CartFamily'),
    image: pack4CurrentBadgeImage()
  });
  closePack4Modal(true);
  showCartToast(t('pack4CartFamily'));
});

/* ---------- product page (full page, not a modal) ---------- */
let currentProductPage = null; // { category, idx }
let ppQty = 1;

function slugify(str){
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findProductRef(name){
  let idx = men.findIndex(x => x.name === name);
  if(idx !== -1) return { category: 'men', idx };
  idx = women.findIndex(x => x.name === name);
  if(idx !== -1) return { category: 'women', idx };
  return null;
}

function findProductBySlug(slug){
  let idx = men.findIndex(x => slugify(x.name) === slug);
  if(idx !== -1) return { category: 'men', idx, name: men[idx].name };
  idx = women.findIndex(x => slugify(x.name) === slug);
  if(idx !== -1) return { category: 'women', idx, name: women[idx].name };
  return null;
}

function attachProductPageEvents(){
  const track = document.getElementById('pp-track');
  if(track){
    let startX = 0, deltaX = 0, dragging = false;
    const threshold = 40;
    track.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX; deltaX = 0; dragging = true;
    }, { passive: true });
    track.addEventListener('touchmove', (e) => {
      if(!dragging) return;
      deltaX = e.touches[0].clientX - startX;
    }, { passive: true });
    track.addEventListener('touchend', () => {
      if(!dragging) return;
      dragging = false;
      if(deltaX > threshold) goToPpSlide(ppActiveIndex - 1);
      else if(deltaX < -threshold) goToPpSlide(ppActiveIndex + 1);
    });
  }
  document.querySelectorAll('.pp-dot').forEach(dot => {
    dot.addEventListener('click', () => goToPpSlide(parseInt(dot.dataset.i, 10)));
  });
  document.querySelectorAll('.pp-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => goToPpSlide(parseInt(thumb.dataset.i, 10)));
  });
  const prevBtn = document.getElementById('pp-prev');
  const nextBtn = document.getElementById('pp-next');
  if(prevBtn) prevBtn.addEventListener('click', () => goToPpSlide(ppActiveIndex - 1));
  if(nextBtn) nextBtn.addEventListener('click', () => goToPpSlide(ppActiveIndex + 1));

  const decBtn = document.getElementById('pp-qty-dec');
  const incBtn = document.getElementById('pp-qty-inc');
  if(decBtn) decBtn.addEventListener('click', () => { if(ppQty > 1){ ppQty--; document.getElementById('pp-qty-num').value = ppQty; } });
  if(incBtn) incBtn.addEventListener('click', () => { ppQty++; document.getElementById('pp-qty-num').value = ppQty; });
  const ppQtyInput = document.getElementById('pp-qty-num');
  if(ppQtyInput){
    ppQtyInput.addEventListener('input', () => { ppQtyInput.value = ppQtyInput.value.replace(/[^0-9]/g, ''); });
    ppQtyInput.addEventListener('blur', () => {
      let v = parseInt(ppQtyInput.value, 10);
      if(!v || v < 1) v = 1;
      ppQty = v;
      ppQtyInput.value = ppQty;
    });
    ppQtyInput.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ ppQtyInput.blur(); } });
  }

  const backBtn = document.getElementById('pp-back');
  if(backBtn) backBtn.addEventListener('click', () => closeProductPage());

  const addCartBtn = document.getElementById('pp-add-cart');
  if(addCartBtn) addCartBtn.addEventListener('click', () => {
    const ref = currentProductPage; if(!ref) return;
    const list = ref.category === 'men' ? men : women;
    const p = localizedProduct(list[ref.idx]);
    addToCart(p.name, p.price, p.family, ppQty);
    addCartBtn.classList.remove('pop-anim');
    void addCartBtn.offsetWidth;
    addCartBtn.classList.add('pop-anim');
    showCartToast(p.name);
  });
  const orderNowBtn = document.getElementById('pp-order-now');
  if(orderNowBtn) orderNowBtn.addEventListener('click', () => {
    const ref = currentProductPage; if(!ref) return;
    const list = ref.category === 'men' ? men : women;
    const p = localizedProduct(list[ref.idx]);
    checkoutOverrideItems = [{ name: p.name, price: Number(p.price), family: p.family, qty: ppQty }];
    checkoutOrigin = { type: 'product', name: p.name };
    closeCartDrawer();
    closeWishlistDrawer();
    openCheckoutPage();
  });

  document.querySelectorAll('.pp-set-cover').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ref = currentProductPage; if(!ref) return;
      const list = ref.category === 'men' ? men : women;
      const p = list[ref.idx];
      p.cover = parseInt(btn.dataset.i, 10);
      await saveCatalog();
      renderProductPage();
      renderShop(currentFilter, true);
    });
  });
  document.querySelectorAll('.pp-remove-img').forEach(btn => {
    btn.addEventListener('click', () => {
      const ref = currentProductPage; if(!ref) return;
      const list = ref.category === 'men' ? men : women;
      const p = list[ref.idx];
      askConfirm(t('removeProductImageConfirm'), async () => {
        const i = parseInt(btn.dataset.i, 10);
        const imgs = productImages(p).slice();
        const [removedUrl] = imgs.splice(i, 1);
        p.images = imgs;
        if(removedUrl) deleteStorageFile('product-images', removedUrl);
        delete p.image;
        let cover = typeof p.cover === 'number' ? p.cover : 0;
        if(i < cover) cover--;
        else if(i === cover) cover = 0;
        p.cover = Math.max(0, Math.min(cover, imgs.length - 1));
        await saveCatalog();
        renderProductPage();
        renderShop(currentFilter, true);
      });
    });
  });
  const addImgBtn = document.getElementById('pp-add-images-btn');
  const addImgInput = document.getElementById('pp-admin-add-input');
  if(addImgBtn && addImgInput){
    addImgBtn.addEventListener('click', () => addImgInput.click());
  }

  // ---- product reviews (5-star rating + comment, pending admin approval) ----
  ppReviewSelectedRating = 0;
  const ref = currentProductPage;
  if(ref){
    const list = ref.category === 'men' ? men : women;
    const p = list[ref.idx];
    if(p) renderProductReviews(p.name);
  }
  const starPicker = document.getElementById('pp-review-star-picker');
  if(starPicker){
    starPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.review-star-btn');
      if(!btn) return;
      ppReviewSelectedRating = Number(btn.dataset.star);
      document.getElementById('pp-review-rating').value = ppReviewSelectedRating;
      starPicker.querySelectorAll('.review-star-btn').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.star) <= ppReviewSelectedRating);
      });
    });
  }
  const ppReviewForm = document.getElementById('pp-review-form');
  if(ppReviewForm){
    ppReviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const activeRef = currentProductPage;
      if(!activeRef) return;
      const list = activeRef.category === 'men' ? men : women;
      const p = list[activeRef.idx];
      if(!p) return;
      const name = document.getElementById('pp-review-name').value.trim();
      const comment = document.getElementById('pp-review-comment').value.trim();
      const errorEl = document.getElementById('pp-review-form-error');
      if(!name || !comment || ppReviewSelectedRating < 1){
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      const submitBtn = document.getElementById('pp-review-submit-btn');
      submitBtn.disabled = true;
      const prevLabel = submitBtn.textContent;
      submitBtn.textContent = 'Envoi en cours...';
      const result = await submitReview({ name, rating: ppReviewSelectedRating, comment, productName: p.name });
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
      if(result.ok){
        ppReviewForm.style.display = 'none';
        document.getElementById('pp-review-thanks').style.display = 'block';
      }else{
        showToast(t('toastStorageUnavailable'));
      }
    });
  }
}

let ppActiveIndex = 0;
function goToPpSlide(i){
  const track = document.getElementById('pp-track');
  if(!track) return;
  const slides = track.querySelectorAll('.pp-slide');
  if(!slides.length) return;
  ppActiveIndex = (i + slides.length) % slides.length;
  track.style.transform = `translateX(${-ppActiveIndex * 100}%)`;
  document.querySelectorAll('.pp-dot').forEach((d, idx) => d.classList.toggle('active', idx === ppActiveIndex));
  document.querySelectorAll('.pp-thumb').forEach((th, idx) => th.classList.toggle('active', idx === ppActiveIndex));
}

function productPageTemplate(pRaw, category, idx){
  const p = localizedProduct(pRaw);
  const images = productImages(p);
  const coverIdx = (typeof pRaw.cover === 'number') ? pRaw.cover : 0;

  const backBtnHtml = `<button type="button" class="pp-back-float" id="pp-back" aria-label="${t('backToShopBtn')}">←</button>`;

  const gallery = images.length ? `
    <div class="pp-gallery">
      ${backBtnHtml}
      <div class="pp-track" id="pp-track">
        ${images.map((url, i) => `<div class="pp-slide"><img class="seq-lazy" data-src="${url}" alt="${p.name}"></div>`).join('')}
      </div>
      ${images.length > 1 ? `<div class="pp-dots">${images.map((_, i) => `<button type="button" class="pp-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}
      ${images.length > 1 ? `<button type="button" class="pp-arrow prev" id="pp-prev" aria-label="Previous">‹</button><button type="button" class="pp-arrow next" id="pp-next" aria-label="Next">›</button>` : ''}
    </div>
    ${images.length > 1 ? `<div class="pp-thumbs">${images.map((url, i) => `<button type="button" class="pp-thumb${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Voir image ${i + 1}"><img class="seq-lazy" data-src="${url}" alt="${p.name} miniature ${i + 1}"></button>`).join('')}</div>` : ''}` : `
    <div class="pp-gallery pp-gallery-placeholder">
      ${backBtnHtml}
      <div class="bottle mini-bottle" style="transform:scale(1.5);">
        <div class="cap"></div><div class="neck"></div>
        <div class="body" style="background:${bottleColors[p.tone]}"><div class="label">${p.label}</div></div>
      </div>
    </div>`;

  const adminGallery = isAdmin ? `
    <div class="pp-admin-gallery">
      <div class="pp-admin-thumbs">
        ${images.map((url, i) => `
          <div class="pp-admin-thumb${i === coverIdx ? ' is-cover' : ''}">
            <img src="${url}" alt="">
            ${i === coverIdx
              ? `<span class="pp-cover-badge">${t('coverImageBadge')}</span>`
              : `<button type="button" class="pp-set-cover" data-i="${i}">${t('setCoverBtn')}</button>`}
            <button type="button" class="pp-remove-img" data-i="${i}" aria-label="Remove image">✕</button>
          </div>`).join('')}
        <button type="button" class="pp-admin-add-thumb" id="pp-add-images-btn">
          <span>+</span>
          <span>${t('addProductImagesBtn')}</span>
        </button>
      </div>
    </div>` : '';

  return `
    <div class="pp-layout">
      <div class="pp-media">
        ${gallery}
        ${adminGallery}
      </div>
      <div class="pp-info">
        <div class="pc-fam reveal">${p.family} · ${p.size}</div>
        <h1 class="pp-title reveal">${p.name}</h1>
        <div class="pp-rating-badge reveal">
          <span class="pp-rating-stars">${reviewStarsHtml(Math.round(p.rating || 5))}</span>
          <span class="pp-rating-text">${(p.rating || 5).toFixed(1)} · ${p.reviews || 0} avis</span>
        </div>
        <div class="pp-price-row reveal">
          <span class="pp-price-old">75 DH</span>
          <span class="pp-price">${p.price} DH</span>
        </div>
        <p class="pp-desc reveal">${p.desc}</p>
        <div class="pp-qty-cart-row reveal">
          <div class="qty-stepper pp-qty-stepper">
            <button type="button" class="qty-btn" id="pp-qty-dec">−</button>
            <input type="text" inputmode="numeric" pattern="[0-9]*" class="qty-num" id="pp-qty-num" value="1" aria-label="Quantité">
            <button type="button" class="qty-btn" id="pp-qty-inc">+</button>
          </div>
          <button type="button" class="pp-cart-btn" id="pp-add-cart">
            <svg class="icon"><use href="#i-bag"></use></svg>
            ${t('addToCartBtn')}
          </button>
        </div>
        <button type="button" class="pp-order-btn reveal" id="pp-order-now">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:19px;height:19px;"><path d="M6 8h12l1 12.2a1 1 0 0 1-1 .8H6a1 1 0 0 1-1-.8L6 8z"/><path d="M9 8V6.3a3 3 0 0 1 6 0V8"/></svg>
          ${t('orderNowBtn')}
        </button>

        <div class="pp-trust-grid">
          <div class="pp-trust-item reveal d1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="7" width="13" height="9"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>
            <div><strong>${t('trustDeliveryTitle')}</strong><span>${t('trustDeliverySub')}</span></div>
          </div>
          <div class="pp-trust-item reveal d2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z"/></svg>
            <div><strong>${t('trustCertifiedTitle')}</strong><span>${t('trustCertifiedSub')}</span></div>
          </div>
          <div class="pp-trust-item reveal d3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            <div><strong>${t('trustPaymentTitle')}</strong><span>${t('trustPaymentSub')}</span></div>
          </div>
          <div class="pp-trust-item reveal d4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.2C.5 7.8 2.5 4 6.5 4c2.3 0 4 1.3 5.5 3.3C13.5 5.3 15.2 4 17.5 4c4 0 6 3.8 4.5 7.3-2.5 4.6-10 9.2-10 9.2z"/></svg>
            <div><strong>${t('trustSupportTitle')}</strong><span>${t('trustSupportSub')}</span></div>
          </div>
        </div>

        ${fragrancePyramidHtml(p)}

        <details class="pp-accordion reveal" open>
          <summary>${t('descriptionAccordionTitle')}</summary>
          <p>${p.desc}</p>
        </details>
        </div>
      </div>

      <div class="pp-reviews-section reveal">
        <h3 class="pp-reviews-title">Avis clients</h3>
        <div class="pp-reviews-summary" id="pp-reviews-summary" style="display:none;">
          <span class="pp-reviews-summary-stars" id="pp-reviews-summary-stars"></span>
          <span class="pp-reviews-summary-text" id="pp-reviews-summary-text"></span>
        </div>
        <div class="pp-reviews-list" id="pp-reviews-list">
          <div class="testimonial-skel"></div>
        </div>

        <form class="pp-review-form" id="pp-review-form">
          <p class="pp-review-form-label">Donnez votre avis sur ce parfum</p>
          <div class="review-star-picker" id="pp-review-star-picker">
            <button type="button" class="review-star-btn" data-star="1" aria-label="1 étoile">★</button>
            <button type="button" class="review-star-btn" data-star="2" aria-label="2 étoiles">★</button>
            <button type="button" class="review-star-btn" data-star="3" aria-label="3 étoiles">★</button>
            <button type="button" class="review-star-btn" data-star="4" aria-label="4 étoiles">★</button>
            <button type="button" class="review-star-btn" data-star="5" aria-label="5 étoiles">★</button>
          </div>
          <input type="hidden" id="pp-review-rating" value="0">
          <input type="text" id="pp-review-name" class="cf-input" placeholder="Votre nom" maxlength="60" required>
          <textarea id="pp-review-comment" class="cf-input review-textarea" placeholder="Votre commentaire..." maxlength="400" rows="3" required></textarea>
          <p id="pp-review-form-error" style="display:none; color:#c0392b; font-size:13px; margin:2px 0 0;">Veuillez renseigner votre nom, une note et un commentaire.</p>
          <button type="submit" class="checkout-btn" id="pp-review-submit-btn">Envoyer mon avis</button>
          <p class="pp-review-thanks" id="pp-review-thanks" style="display:none;">Merci ! Votre avis sera visible après validation par notre équipe.</p>
        </form>
      </div>
    </div>`;
}

function renderProductPage(){
  if(!currentProductPage) return;
  const list = currentProductPage.category === 'men' ? men : women;
  const p = list[currentProductPage.idx];
  if(!p){ closeProductPage(); return; }
  ppActiveIndex = 0;
  const ppContent = document.getElementById('product-page-content');
  ppContent.innerHTML = productPageTemplate(p, currentProductPage.category, currentProductPage.idx);
  attachProductPageEvents();
  refreshScrollReveal(ppContent);
  // Restart the fade-in animation every time the page (re)renders — e.g.
  // opening a new product while already on a product page. Removing and
  // re-adding the class on the next frame forces the CSS animation to
  // play again instead of being a no-op the second time.
  ppContent.classList.remove('pp-fade-in');
  void ppContent.offsetWidth; // force reflow so the class removal registers
  ppContent.classList.add('pp-fade-in');
}

let ppSavedScrollY = 0;
function fragrancePyramidHtml(p){
  const rows = [
    { label: 'Notes de tête', value: p.notesTop },
    { label: 'Notes de cœur', value: p.notesHeart },
    { label: 'Notes de fond', value: p.notesBase }
  ].filter(r => r.value);
  if(!rows.length) return '';
  return `
    <div class="pp-notes reveal">
      <div class="pp-notes-title">Pyramide Olfactive</div>
      ${rows.map(r => `
        <div class="pp-notes-row">
          <span class="pp-notes-label">${r.label}</span>
          <div class="pp-notes-text">${r.value.split(',').map(n => n.trim()).filter(Boolean).join(', ')}</div>
        </div>`).join('')}
    </div>`;
}

function openProductPage(name, pushHistory, preserveQty){
  const ref = findProductRef(name);
  if(!ref) return;
  closeSearchModal();
  closeWishlistDrawer();
  if(typeof closeCartDrawer === 'function') closeCartDrawer();
  // Remember where the visitor was on the home page so "Retour" can
  // bring them back to the same spot instead of jumping to the top.
  if(document.getElementById('product-page').style.display !== 'block'){
    ppSavedScrollY = window.scrollY;
  }
  currentProductPage = ref;
  if(!preserveQty) ppQty = 1;
  renderProductPage();
  document.getElementById('shop-view').style.display = 'none';
  const coEl = document.getElementById('checkout-page');
  if(coEl) coEl.style.display = 'none';
  document.getElementById('product-page').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'auto' });
  if(pushHistory !== false){
    try{ history.pushState({ ppName: name }, '', '/product/' + slugify(name)); }catch(err){}
  }
}
function closeProductPage(fromPopstate){
  currentProductPage = null;
  document.getElementById('product-page').style.display = 'none';
  document.getElementById('shop-view').style.display = '';
  window.scrollTo({ top: ppSavedScrollY, behavior: 'auto' });
  if(!fromPopstate){
    try{ history.pushState({}, '', '/'); }catch(err){}
  }
}
window.addEventListener('popstate', (e) => {
  if(e.state && e.state.ppName) { closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeSideMenu(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openProductPage(e.state.ppName, false); }
  else if(e.state && e.state.checkout) { closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeSideMenu(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openCheckoutPage(false); }
  else if(e.state && e.state.pack4) { closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeSideMenu(true); closeProductPage(true); closeCheckoutPage(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openPack4Modal(false, checkoutOrigin === 'pack4'); checkoutOrigin = null; }
  else if(e.state && e.state.admin === 'login') { closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeSideMenu(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminDashboardPage(true); openAdminLoginModal(false); }
  else if(e.state && e.state.admin === 'dashboard') {
    closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeSideMenu(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminLoginModal(true);
    if(isAdmin) openAdminDashboardPage(false); else openAdminLoginModal(false);
  }
  else if(e.state && e.state.tracking) { closeAboutModal(true); closeFounderModal(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openTrackingModal(undefined, false); }
  else if(e.state && e.state.about) { closeTrackingModal(true); closeFounderModal(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openAboutModal(false); }
  else if(e.state && e.state.founder) { closeTrackingModal(true); closeAboutModal(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openFounderModal(false); }
  else if(e.state && e.state.sideMenu) { closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); openSideMenu(false); }
  else { closeTrackingModal(true); closeAboutModal(true); closeFounderModal(true); closeSideMenu(true); closeProductPage(true); closeCheckoutPage(true); closePack4Modal(true); closeAdminLoginModal(true); closeAdminDashboardPage(true); }
});

// Initial routing: open the right view based on the URL the page was loaded
// with (deep link / shared link / browser refresh), e.g. /product/opium,
// /offre, /checkout, /panel (admin dashboard label — entry itself is gated in middleware.js).
(function routeInitialLoad(){
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if(path.startsWith('/product/')){
    const slug = decodeURIComponent(path.slice('/product/'.length));
    // The product catalog loads asynchronously from Supabase (see
    // loadCatalog() above). On a hard refresh, this route check used to run
    // immediately, before that fetch finished, so it often couldn't find
    // the product yet and silently fell back to the home page. Waiting for
    // catalogReady first fixes refreshing/sharing a direct product link.
    catalogReady.then(() => {
      const ref = findProductBySlug(slug);
      if(ref){
        history.replaceState({ ppName: ref.name }, '', path);
        openProductPage(ref.name, false);
      }
      // If the product genuinely doesn't exist (deleted, wrong slug), we
      // simply stay on the home page — nothing to open.
    });
    return;
  } else if(path === '/offre'){
    history.replaceState({ pack4: true }, '', path);
    window.addEventListener('DOMContentLoaded', () => openPack4Modal(false));
    return;
  } else if(path === '/checkout'){
    history.replaceState({ checkout: true }, '', path);
    window.addEventListener('DOMContentLoaded', () => openCheckoutPage(false));
    return;
  }
})();

// Admin entry point: no path or string here reveals the real URL — that
// check now happens server-side in middleware.js (never sent to the
// browser). Middleware sets a short-lived cookie after verifying login;
// this just looks for that cookie and opens the login modal.
(function checkAdminGateCookie(){
  const match = document.cookie.match(/(?:^|; )adminGateOK=([^;]*)/);
  if(match){
    document.cookie = 'adminGateOK=; Path=/; Max-Age=0';
    window.addEventListener('DOMContentLoaded', () => openAdminLoginModal(false));
  }
})();

document.getElementById('pp-admin-add-input').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if(!files.length || !currentProductPage) return;
  const list = currentProductPage.category === 'men' ? men : women;
  const p = list[currentProductPage.idx];
  showToast(t('bannerUploading'));
  const existing = productImages(p);
  const newImages = existing.slice();
  for(const file of files){
    const url = await uploadProductImage(file);
    if(url) newImages.push(url);
  }
  p.images = newImages;
  delete p.image;
  if(typeof p.cover !== 'number' || p.cover >= newImages.length) p.cover = 0;
  await saveCatalog();
  renderProductPage();
  renderShop(currentFilter, true);
});

document.addEventListener('click', (e) => {
  if(e.target.closest('.fav') || e.target.closest('.add-cart') || e.target.closest('.order-now-btn') || e.target.closest('.admin-edit-btn') || e.target.closest('.admin-del-btn')) return;
  const card = e.target.closest('.product-card');
  if(card && card.dataset.name){
    openProductPage(card.dataset.name);
  }
});

// Desktop shows the product-photo shine on :hover (see .pc-stage::after in
// style.css), but a finger has no hover state -- without this, mobile
// visitors (the majority here) would never see it at all. This mirrors
// the same effect for touch: touching anywhere on the product card plays
// the shine on that card's photo once via the .pc-shine-active class,
// which is removed again once the sweep finishes so it's ready to replay
// on the next touch.
document.addEventListener('touchstart', (e) => {
  const card = e.target.closest('.product-card');
  const stage = card && card.querySelector('.pc-stage');
  if(!stage) return;
  stage.classList.remove('pc-shine-active');
  // Force a reflow so re-adding the class restarts the CSS animation
  // even if the previous sweep hadn't finished yet.
  void stage.offsetWidth;
  stage.classList.add('pc-shine-active');
}, { passive: true });

document.addEventListener('animationend', (e) => {
  if(e.animationName === 'pcStageShine'){
    e.target.closest('.pc-stage')?.classList.remove('pc-shine-active');
  }
});

function compressImageToBlob(file, maxDim, quality, preserveTransparency, forceFormat){
  maxDim = maxDim || 640;
  quality = quality || 0.72;
  // PNG/GIF/WebP source files can carry an alpha channel. If we always
  // re-encode to JPEG (which has no alpha channel), any transparent area
  // gets flattened onto a solid black background by the canvas — that's
  // the "black square behind transparent PNGs" bug. When preserveTransparency
  // is requested, keep the output as PNG instead so transparency survives.
  const mayHaveAlpha = /image\/(png|gif|webp)/i.test(file.type || '');
  const outputType = forceFormat || ((preserveTransparency && mayHaveAlpha) ? 'image/png' : 'image/jpeg');
  return new Promise((resolve, reject) => {
    if(!file){ resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          if(w > h){ h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if(outputType === 'image/jpeg'){
          // JPEG has no alpha channel — fill white first so any transparent
          // pixels come out white instead of the canvas default (black).
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob), outputType, quality);
      };
      img.onerror = () => reject(new Error('Could not read image file.'));
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadProductImage(file, opts){
  if(!file) return null;
  const preserveTransparency = !!(opts && opts.transparent);
  // Some OS file pickers report a generic/blank MIME type for .avif, so
  // fall back to checking the filename extension too (same detection used
  // for the banner uploads).
  const isAvif = file.type === 'image/avif' || /\.avif$/i.test(file.name || '');
  // Wrap AVIF files so the Blob/File carries the correct MIME type even
  // when the source File's reported type was blank/wrong -- otherwise the
  // data URL built below would be mistagged and fail to decode even
  // though the underlying bytes are a perfectly valid image.
  const sourceFile = (isAvif && file.type !== 'image/avif')
    ? new File([file], file.name || 'photo.avif', { type: 'image/avif' })
    : file;
  let blob = null;
  let avifRaw = false;
  if(isAvif){
    // Still resize AVIF uploads like every other format -- an admin photo
    // can be several megapixels while the card only ever displays it at a
    // few hundred px, so shipping it untouched wastes a lot of bandwidth.
    // Canvas can decode AVIF in every current browser, it just can't
    // *encode* it back out, so the resized result is re-saved as WebP
    // instead (keeps most of AVIF's size benefit). If decode fails for
    // any reason (older browser), fall back to uploading the original
    // file untouched so the upload still succeeds.
    //
    // AVIF's codec is more efficient than WebP, so a small/already-
    // optimized AVIF can end up *larger* after this WebP re-encode
    // (e.g. a 4KB AVIF turning into a 95KB WebP). Only use the WebP
    // result if it's actually smaller than the original file.
    try{ blob = await compressImageToBlob(sourceFile, 640, 0.8, true, 'image/webp'); }
    catch(err){ blob = null; }
    if(!blob || blob.size >= sourceFile.size){ blob = sourceFile; avifRaw = true; }
  } else {
    blob = await compressImageToBlob(file, 640, 0.72, preserveTransparency);
  }
  if(!blob) return null;
  let ext, contentType;
  if(avifRaw){ ext = 'avif'; contentType = 'image/avif'; }
  else if(blob.type === 'image/webp'){ ext = 'webp'; contentType = 'image/webp'; }
  else if(blob.type === 'image/png'){ ext = 'png'; contentType = 'image/png'; }
  else { ext = 'jpg'; contentType = 'image/jpeg'; }
  if(supabaseClient){
    try{
      const filename = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabaseClient.storage
        .from('product-images')
        .upload(filename, blob, { contentType, upsert: true, cacheControl: '31536000' });
      if(error) throw error;
      const { data } = supabaseClient.storage.from('product-images').getPublicUrl(filename);
      return data.publicUrl;
    }catch(err){
      if(isAdmin) showToast(t('toastImageUploadFailed'));
      // fall through to base64 fallback below
    }
  }
  // fallback: no Supabase Storage configured/available — embed a compressed base64 image instead
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

// Measure an image/GIF's natural size once, up front (from the raw File),
// so the banner frame can be sized correctly on the very first render —
// instead of waiting for the <img> to (re)load and firing a visible
// resize/jump every time the page loads.
function getImageFileDimensions(file){
  return new Promise((resolve) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objUrl);
    };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(objUrl); };
    img.src = objUrl;
  });
}

// Same idea for videos: read metadata once at upload time instead of
// re-measuring (and re-flashing the frame) on every page load.
function getVideoFileDimensions(file){
  return new Promise((resolve) => {
    const objUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(objUrl);
    };
    video.onerror = () => { resolve(null); URL.revokeObjectURL(objUrl); };
    video.src = objUrl;
  });
}

// A static WebP and an animated WebP share the exact same MIME type
// (image/webp), so file.type alone can't tell them apart. Animated WebP
// files contain an "ANIM" chunk in their RIFF container; a plain static
// WebP never does. We scan the raw bytes for that marker to tell them
// apart, so animated WebPs get uploaded as-is (like GIFs) instead of being
// run through the canvas compressor, which would flatten them to one frame.
async function isAnimatedWebp(file){
  if(file.type !== 'image/webp') return false;
  try{
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const marker = [0x41, 0x4E, 0x49, 0x4D]; // "ANIM"
    for(let i = 0; i <= bytes.length - marker.length; i++){
      if(bytes[i] === marker[0] && bytes[i+1] === marker[1] && bytes[i+2] === marker[2] && bytes[i+3] === marker[3]){
        return true;
      }
    }
    return false;
  }catch(e){
    return false;
  }
}

/* ---------- banner (admin-editable, multi-slide carousel) ---------- */
/* Factory so the same carousel/upload/admin logic can power multiple
   independent banners on the page (top hero banner, bottom banner, ...). */
function createBannerController(cfg){
  const state = {
    keyBase: cfg.storageKey,
    category: currentFilter, // 'men' or 'women' — each category keeps its own banners
    bannersByCat: { men: [], women: [] },
    loadedCat: { men: false, women: false },
    activeIndex: 0,
    inputMode: 'add',
    sectionId: cfg.sectionId,
    contentId: cfg.contentId,
    inputId: cfg.inputId,
    autoplay: !!cfg.autoplay,
    autoplayDelay: cfg.autoplayDelay || 5000,
    autoplayTimer: null,
    priority: !!cfg.priority
  };
  // state.banners always reads/writes the array for the CURRENT category,
  // so all the existing logic below (push/splice/map/length) keeps working
  // untouched — it just now operates on a per-category list.
  Object.defineProperty(state, 'banners', {
    get(){ return state.bannersByCat[state.category]; },
    set(arr){ state.bannersByCat[state.category] = arr; }
  });

  function keyFor(cat){ return `${state.keyBase}-${cat}`; }

  function readLocalCache(cat){
    try{
      const raw = localStorage.getItem(`cache-${keyFor(cat)}`);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    }catch(err){ return null; }
  }

  function writeLocalCache(cat, items){
    try{ localStorage.setItem(`cache-${keyFor(cat)}`, JSON.stringify(items)); }
    catch(err){ /* private browsing / storage full — ignore */ }
  }

  async function loadCategory(cat){
    // Paint instantly from last-known-good cache while the real fetch is in flight.
    const cached = readLocalCache(cat);
    if(cached && cached.length) state.bannersByCat[cat] = cached;
    try{
      const data = await kvGet(keyFor(cat));
      if(data){
        if(Array.isArray(data.items)) state.bannersByCat[cat] = data.items.filter(it => it && it.url);
        else if(data.url) state.bannersByCat[cat] = [{ url: data.url, type: data.type || 'image' }]; // legacy single-banner format
        writeLocalCache(cat, state.bannersByCat[cat]);
      }
    }catch(err){
      // no banner set yet for this category, or storage unavailable
    }
    state.loadedCat[cat] = true;
  }

  async function load(){
    const cached = readLocalCache(state.category);
    if(cached && cached.length){ state.bannersByCat[state.category] = cached; render(); }
    await loadCategory(state.category);
    render();
  }

  async function setCategory(cat){
    if(state.category === cat) return;
    state.category = cat;
    state.activeIndex = 0;
    if(!state.loadedCat[cat]){
      const cached = readLocalCache(cat);
      if(cached && cached.length){ state.bannersByCat[cat] = cached; render(); }
      await loadCategory(cat);
    }
    render();
  }

  async function save(){
    try{ await kvSet(keyFor(state.category), { items: state.banners }); }
    catch(err){ if(isAdmin) showToast(t('toastStorageUnavailable')); }
  }

  function goToSlide(i){
    const len = state.banners.length;
    if(!len) return;
    const nextIndex = (i + len) % len;
    const content = document.getElementById(state.contentId);
    const track = content && content.querySelector('.hb-track');
    const prevIndex = state.activeIndex;

    state.activeIndex = nextIndex;

    if(!track){
      render();
      return;
    }

    // Crossfade + Ken Burns: swap which slide carries the "active"
    // (opacity:1, resting scale) class. Both the outgoing and incoming
    // slide are absolutely stacked on top of each other and transition
    // simultaneously via CSS (see .hb-slide / .hb-slide.hb-active), with
    // zero horizontal/vertical movement of the slides themselves — only
    // the incoming slide's own image/video eases from a subtle 103% zoom
    // down to 100% (see below), while the outgoing one stays pinned.
    track.querySelectorAll('.hb-slide').forEach((slideEl) => {
      const isActive = parseInt(slideEl.dataset.i, 10) === nextIndex;
      slideEl.classList.toggle('hb-active', isActive);
    });

    if(prevIndex !== nextIndex){
      const outgoingSlide = content.querySelector(`.hb-slide[data-i="${prevIndex}"]`);
      if(outgoingSlide){
        // Pin the outgoing slide's media at its resting scale/position
        // while it fades out, so the Ken Burns zoom only ever plays on
        // the slide that's coming in — the outgoing image simply
        // dissolves without any movement of its own.
        outgoingSlide.classList.add('hb-outgoing');
        const cleanup = () => outgoingSlide.classList.remove('hb-outgoing');
        outgoingSlide.addEventListener('transitionend', cleanup, { once: true });
        // Safety net in case transitionend never fires (e.g. tab
        // backgrounded mid-transition), so the class doesn't get stuck.
        setTimeout(cleanup, 1800);
      }
    }

    applyActiveSlideEffects(content);
  }

  // Keeps the frame's aspect ratio in sync with the newly-active slide and
  // makes sure only the active slide's video is playing. Shared between the
  // full render() (first paint / banner set changes) and the lightweight
  // goToSlide() transform-only path (slide-to-slide navigation).
  function applyActiveSlideEffects(content){
    const frameEl = document.getElementById(`${state.sectionId}-frame`);
    const activeSlide = content.querySelector(`.hb-slide[data-i="${state.activeIndex}"]`);
    const activeBanner = state.banners[state.activeIndex];
    if(frameEl && activeSlide){
      const media = activeSlide.querySelector('img, video');
      const refreshScrollTrigger = () => {
        requestAnimationFrame(() => {
          if(typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
        });
      };
      if(activeBanner && activeBanner.width && activeBanner.height){
        frameEl.style.aspectRatio = `${activeBanner.width} / ${activeBanner.height}`;
        refreshScrollTrigger();
      } else if(media){
        const applyRatio = () => {
          const w = media.tagName === 'VIDEO' ? media.videoWidth : media.naturalWidth;
          const h = media.tagName === 'VIDEO' ? media.videoHeight : media.naturalHeight;
          if(w && h){
            frameEl.style.aspectRatio = `${w} / ${h}`;
            refreshScrollTrigger();
          }
        };
        if(media.tagName === 'VIDEO'){
          if(media.readyState >= 1) applyRatio();
          else media.addEventListener('loadedmetadata', applyRatio, { once: true });
        } else if(media.complete && media.naturalWidth){
          applyRatio();
        } else {
          media.addEventListener('load', applyRatio, { once: true });
        }
      }
    }

    // Index each video by its own slide's data-i (not NodeList position),
    // since the clone slides bookending the track would otherwise throw
    // off a simple positional index.
    content.querySelectorAll('.hb-slide video').forEach((v) => {
      const slideEl = v.closest('.hb-slide');
      const i = slideEl ? parseInt(slideEl.dataset.i, 10) : -1;
      v.muted = true;
      v.defaultMuted = true;
      v.loop = true;
      v.playsInline = true;
      v.removeAttribute('controls');
      if(i === state.activeIndex){
        const tryPlay = () => { v.play().catch(() => {}); };
        if(v.readyState >= 2) tryPlay();
        else v.addEventListener('loadeddata', tryPlay, { once: true });
      } else {
        v.pause();
      }
    });
  }

  function stopAutoplay(){
    if(state.autoplayTimer){ clearInterval(state.autoplayTimer); state.autoplayTimer = null; }
  }

  function startAutoplay(){
    stopAutoplay();
    if(!state.autoplay || state.banners.length <= 1) return;
    state.autoplayTimer = setInterval(() => {
      goToSlide(state.activeIndex + 1);
    }, state.autoplayDelay);
  }

  // Any manual interaction (swipe, dot, arrow) restarts the countdown so the
  // banner doesn't jump to the next slide right after the user just picked one.
  function restartAutoplay(){
    startAutoplay();
  }

  function attachEvents(content){
    const track = content.querySelector('.hb-track');
    if(track){
      // Swipe is detected (for manual navigation) but never visually
      // "dragged" — the slide never follows the finger and there is no
      // horizontal movement at all. On release, a swipe past the
      // threshold simply triggers the same opacity crossfade used by the
      // arrows/autoplay.
      let startX = 0, startY = 0, deltaX = 0, dragging = false;
      const threshold = 40;
      track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; deltaX = 0; dragging = true;
      }, { passive: true });
      track.addEventListener('touchmove', (e) => {
        if(!dragging) return;
        deltaX = e.touches[0].clientX - startX;
      }, { passive: true });
      track.addEventListener('touchend', () => {
        if(!dragging) return;
        dragging = false;
        if(deltaX > threshold){ goToSlide(state.activeIndex - 1); restartAutoplay(); }
        else if(deltaX < -threshold){ goToSlide(state.activeIndex + 1); restartAutoplay(); }
      });
    }
    const prevBtn = content.querySelector('.hb-prev');
    const nextBtn = content.querySelector('.hb-next');
    if(prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goToSlide(state.activeIndex - 1); restartAutoplay(); });
    if(nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goToSlide(state.activeIndex + 1); restartAutoplay(); });
  }

  function render(){
    const section = document.getElementById(state.sectionId);
    const content = document.getElementById(state.contentId);

    if(state.activeIndex >= state.banners.length) state.activeIndex = Math.max(0, state.banners.length - 1);

    if(state.banners.length){
      section.style.display = 'block';

      const buildSlide = (b, i) => `
        <div class="hb-slide${i === state.activeIndex ? ' hb-active' : ''}" data-i="${i}">
          ${b.type === 'video'
            ? `<video src="${b.url}" muted loop playsinline webkit-playsinline preload="auto"${i === state.activeIndex ? ' autoplay' : ''}></video>`
            : (() => {
                const isGifBanner = /\.(gif|webp)(\?|$)/i.test(b.url);
                // High fetch priority is only safe for the small, compressed
                // static banner image. A GIF is typically many times larger,
                // so marking it "high" tells the browser to pour bandwidth
                // into it first — starving/delaying every product-card image
                // on the page until the GIF finishes downloading.
                // Also only the hero banner (state.priority) gets this at
                // all -- banners further down the page and the tracking-page
                // banner are never the first thing visible, so they should
                // never compete with the top banner / first product row for
                // bandwidth. They stay lazy regardless of slide index.
                const isPriorityEligible = state.priority && i === 0;
                if(isPriorityEligible && !isGifBanner){
                  return `<img src="${b.url}" alt="HISTOIRE" loading="eager" fetchpriority="high">`;
                }
                return `<img class="seq-lazy" data-src="${b.url}" alt="HISTOIRE">`;
              })()}
        </div>`;

      // All slides are stacked directly on top of each other (see .hb-slide
      // in style.css) and cross-fade purely via opacity — no clones, no
      // horizontal track, no transform of any kind.
      const slides = state.banners.map((b, i) => buildSlide(b, i)).join('');

      const arrows = state.banners.length > 1 ? `
        <button type="button" class="hb-arrow prev hb-prev" aria-label="Previous">‹</button>
        <button type="button" class="hb-arrow next hb-next" aria-label="Next">›</button>` : '';

      const catLabel = state.category === 'women' ? t('filterWomen') : t('filterMen');
      const adminControls = isAdmin ? `
        <div class="hero-banner-admin-controls">
          <span class="hb-cat-badge">${t('bannerCategoryBadge').replace('{cat}', catLabel)}</span>
          <button class="hb-admin-btn hb-add-btn" type="button">${t('addBannerBtn')}</button>
          <button class="hb-admin-btn hb-edit-btn" type="button">${t('editBannerBtn')}</button>
          <button class="hb-admin-btn remove hb-remove-btn" type="button">${t('removeBannerBtn')}</button>
        </div>` : '';

      content.innerHTML = `<div class="hb-track">${slides}</div>${arrows}${adminControls}`;

      // Auto-size the frame's height to match the active slide's natural
      // dimensions (image, GIF or video) instead of forcing a fixed square —
      // this stops smaller/differently-shaped media from leaving empty space.
      // Also makes sure only the active slide's video is playing.
      applyActiveSlideEffects(content);

      attachEvents(content);
      startAutoplay();
    } else if(isAdmin){
      stopAutoplay();
      section.style.display = 'block';
      const frameElEmpty = document.getElementById(`${state.sectionId}-frame`);
      if(frameElEmpty) frameElEmpty.style.aspectRatio = '';
      const emptyCatLabel = state.category === 'women' ? t('filterWomen') : t('filterMen');
      content.innerHTML = `
        <div class="hero-banner-placeholder hb-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 16l-5-5-4 4-3-3-5 5"/></svg>
          <span>${t('addBannerBtn')}</span>
          <span class="hb-cat-badge hb-cat-badge-empty">${t('bannerCategoryBadge').replace('{cat}', emptyCatLabel)}</span>
        </div>`;
    } else {
      stopAutoplay();
      section.style.display = 'none';
      content.innerHTML = '';
    }
    // The section can start as display:none until banner data finishes
    // loading from Supabase (after the page's initial reveal scan already
    // ran), so re-scan it here to make sure it still gets picked up once
    // it becomes visible, instead of staying invisible forever.
    refreshScrollReveal(section);
    // Any of the branches above can change this section's height (a full
    // banner collapsing to the small empty placeholder, or disappearing
    // entirely). Every other scroll-linked animation further down the page
    // (GSAP ScrollTrigger) still has its OLD start/end positions cached from
    // before this change, so without a refresh they end up misaligned with
    // the new, shorter layout — visually this looks like nearby elements
    // (e.g. the FEMME/HOMME toggle) are stuck half-animated/half-hidden.
    requestAnimationFrame(() => {
      if(typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
    });
  }

  async function processFile(file){
    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif';
    const isAnimWebp = !isVideo && !isGif && await isAnimatedWebp(file);
    const isAnimated = isGif || isAnimWebp;
    // Some OS file pickers report a generic/blank MIME type for .avif, so
    // fall back to checking the filename extension too.
    const isAvif = !isVideo && (file.type === 'image/avif' || /\.avif$/i.test(file.name || ''));
    let url = null;
    // Measure dimensions from the original file up front so the frame can
    // be sized correctly on the very first paint (see render() below).
    const dims = isVideo ? await getVideoFileDimensions(file) : await getImageFileDimensions(file);

    if(isVideo){
      if(supabaseClient){
        try{
          const filename = `banner/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
          const { error } = await supabaseClient.storage
            .from('product-images')
            .upload(filename, file, { contentType: 'video/mp4', upsert: true, cacheControl: '31536000' });
          if(error) throw error;
          const { data } = supabaseClient.storage.from('product-images').getPublicUrl(filename);
          url = data.publicUrl;
        }catch(err){
          showToast(t('toastImageUploadFailed'));
        }
      }
    } else if(isAnimated){
      // GIFs and animated WebPs must be uploaded as-is: running them
      // through the canvas compressor below (which re-encodes to a
      // single frame) would flatten the animation to a still image.
      const ext = isGif ? 'gif' : 'webp';
      const contentType = isGif ? 'image/gif' : 'image/webp';
      if(supabaseClient){
        try{
          const filename = `banner/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error } = await supabaseClient.storage
            .from('product-images')
            .upload(filename, file, { contentType, upsert: true, cacheControl: '31536000' });
          if(error) throw error;
          const { data } = supabaseClient.storage.from('product-images').getPublicUrl(filename);
          url = data.publicUrl;
        }catch(err){
          showToast(t('toastImageUploadFailed'));
        }
      }
      if(!url){
        url = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(file);
        });
      }
    } else if(isAvif){
      // Still resize AVIF banners like every other image format -- an
      // admin photo can be several megapixels while the banner frame is
      // much smaller, so shipping it untouched wastes a lot of bandwidth.
      // Canvas can decode AVIF in every current browser, it just can't
      // *encode* it back out, so the resized result is re-saved as WebP
      // instead (keeps most of AVIF's size benefit). If decode fails for
      // any reason (older browser), fall back to uploading the original
      // file untouched so the upload still succeeds.
      const sourceFile = file.type === 'image/avif' ? file : new File([file], file.name || 'banner.avif', { type: 'image/avif' });
      let blob = null;
      try{ blob = await compressImageToBlob(sourceFile, 1600, 0.8, true, 'image/webp'); }
      catch(err){ blob = null; }
      // AVIF compresses better than WebP, so a small/already-optimized
      // AVIF can end up larger after this re-encode. Keep whichever is
      // actually smaller instead of always taking the WebP result.
      const avifRaw = !blob || blob.size >= sourceFile.size;
      if(avifRaw) blob = sourceFile;
      const ext = avifRaw ? 'avif' : 'webp';
      const contentType = avifRaw ? 'image/avif' : 'image/webp';
      if(supabaseClient){
        try{
          const filename = `banner/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error } = await supabaseClient.storage
            .from('product-images')
            .upload(filename, blob, { contentType, upsert: true, cacheControl: '31536000' });
          if(error) throw error;
          const { data } = supabaseClient.storage.from('product-images').getPublicUrl(filename);
          url = data.publicUrl;
        }catch(err){
          showToast(t('toastImageUploadFailed'));
        }
      }
      if(!url){
        url = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(blob);
        });
      }
    } else {
      const blob = await compressImageToBlob(file, 1600, 0.78);
      if(blob && supabaseClient){
        try{
          const filename = `banner/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const { error } = await supabaseClient.storage
            .from('product-images')
            .upload(filename, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
          if(error) throw error;
          const { data } = supabaseClient.storage.from('product-images').getPublicUrl(filename);
          url = data.publicUrl;
        }catch(err){
          showToast(t('toastImageUploadFailed'));
        }
      }
      if(!url && blob){
        url = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(blob);
        });
      }
    }

    if(!url) return null;
    const item = { url, type: isVideo ? 'video' : 'image' };
    if(dims && dims.width && dims.height){ item.width = dims.width; item.height = dims.height; }
    return item;
  }

  async function handleFiles(fileList){
    const files = Array.from(fileList || []);
    if(!files.length) return;
    showToast(t('bannerUploading'));

    if(state.inputMode === 'edit' && state.banners.length){
      const oldItem = state.banners[state.activeIndex];
      const item = await processFile(files[0]);
      if(item){
        state.banners[state.activeIndex] = item;
        if(oldItem && oldItem.url && oldItem.url !== item.url) deleteStorageFile('product-images', oldItem.url);
      }
    } else {
      for(const file of files){
        const item = await processFile(file);
        if(item) state.banners.push(item);
      }
      state.activeIndex = state.banners.length - 1;
    }

    await save();
    render();
  }

  const inputEl = document.getElementById(state.inputId);
  inputEl.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  document.getElementById(state.contentId).addEventListener('click', (e) => {
    if(e.target.closest('.hb-placeholder') || e.target.closest('.hb-add-btn')){
      state.inputMode = 'add';
      inputEl.setAttribute('multiple', 'multiple');
      inputEl.click();
      return;
    }
    if(e.target.closest('.hb-edit-btn')){
      state.inputMode = 'edit';
      inputEl.removeAttribute('multiple');
      inputEl.click();
      return;
    }
    if(e.target.closest('.hb-remove-btn')){
      askConfirm(t('removeBannerConfirm'), async () => {
        const [removed] = state.banners.splice(state.activeIndex, 1);
        if(removed && removed.url) deleteStorageFile('product-images', removed.url);
        if(state.activeIndex >= state.banners.length) state.activeIndex = Math.max(0, state.banners.length - 1);
        await save();
        render();
      });
    }
  });

  load();

  return { render, setCategory, load };
}


function openAdminModal(mode, category, idx){
  const form = document.getElementById('admin-form');
  form.reset();
  document.getElementById('admin-image-preview').style.display = 'none';
  document.getElementById('admin-category').value = category || 'men';
  document.getElementById('admin-idx').value = (idx === undefined || idx === null) ? '' : idx;
  document.getElementById('admin-cat-select').value = category || 'men';
  document.getElementById('admin-pinned').checked = false;

  if(mode === 'edit'){
    const list = category === 'men' ? men : women;
    const p = list[idx];
    document.getElementById('admin-modal-title').textContent = t('editPerfumeTitle');
    document.getElementById('admin-name').value = p.name;
    document.getElementById('admin-desc').value = p.desc;
    document.getElementById('admin-price').value = p.price;
    document.getElementById('admin-family').value = p.family || '';
    document.getElementById('admin-size').value = p.size || '';
    document.getElementById('admin-notes-top').value = p.notesTop || '';
    document.getElementById('admin-notes-heart').value = p.notesHeart || '';
    document.getElementById('admin-notes-base').value = p.notesBase || '';
    document.getElementById('admin-pinned').checked = !!p.pinned;
    const cover = productCoverImage(p);
    if(cover){
      document.getElementById('admin-image-preview').style.display = 'block';
      document.getElementById('admin-image-preview-img').src = cover;
    }
  } else {
    document.getElementById('admin-modal-title').textContent = t('addNewPerfumeTitle');
  }
  document.getElementById('admin-modal').classList.add('open');
  document.getElementById('admin-overlay').classList.add('open');
}
function closeAdminModal(){
  document.getElementById('admin-modal').classList.remove('open');
  document.getElementById('admin-overlay').classList.remove('open');
}
document.getElementById('admin-modal-close').addEventListener('click', closeAdminModal);
document.getElementById('admin-overlay').addEventListener('click', closeAdminModal);

/* ---------- customers modal (admin) ---------- */
/* ---------- order tracking ---------- */
function renderTrackingTimeline(status){
  const idx = ORDER_STATUSES.indexOf(status);
  const cancelled = status === 'cancelled';
  const labels = {
    pending: t('statusPending'), confirmed: t('statusConfirmed'), preparing: t('statusPreparing'),
    shipped: t('statusShipped'), delivered: t('statusDelivered')
  };
  const container = document.getElementById('tracking-timeline');
  if(cancelled){
    container.innerHTML = `<div class="tt-step active"><div class="tt-dot" style="background:#c0392b;color:#fff;">✕</div><div class="tt-content"><div class="tt-label">${t('statusCancelled')}</div></div></div>`;
    return;
  }
  container.innerHTML = ORDER_STATUSES.map((s, i) => {
    const state = i < idx ? 'done' : (i === idx ? 'active' : '');
    const icon = i < idx ? '✓' : (i + 1);
    return `
    <div class="tt-step ${state}" data-status="${s}">
      <div class="tt-dot">${icon}</div>
      ${i < ORDER_STATUSES.length - 1 ? '<div class="tt-line"></div>' : ''}
      <div class="tt-content"><div class="tt-label">${labels[s]}</div></div>
    </div>`;
  }).join('');
}

async function lookupAndRenderOrder(orderNumber){
  const errorEl = document.getElementById('tracking-lookup-error');
  errorEl.style.display = 'none';
  document.getElementById('tracking-timeline').innerHTML = `<div class="skeleton" style="height:180px;"></div>`;
  const order = await fetchOrderByNumber(orderNumber);
  if(!order){
    document.getElementById('tracking-timeline').innerHTML = '';
    document.getElementById('tracking-order-number').textContent = '';
    errorEl.style.display = 'block';
    return;
  }
  document.getElementById('tracking-order-number').textContent = 'Order #' + orderNumber;
  renderTrackingTimeline(order.status);
}

function renderMyOrdersList(myOrders, activeOrderNumber){
  const wrap = document.getElementById('tracking-my-orders');
  const list = document.getElementById('tracking-my-orders-list');
  if(!wrap || !list) return;
  if(!myOrders.length){ wrap.style.display = 'none'; list.innerHTML = ''; return; }
  wrap.style.display = 'block';
  list.innerHTML = myOrders.map(o => {
    const d = new Date(o.date);
    const dateStr = isNaN(d) ? '' : d.toLocaleDateString('fr-FR');
    const active = o.orderNumber === activeOrderNumber ? 'active' : '';
    return `<button type="button" class="tk-mine-item ${active}" data-order="${o.orderNumber}">
      <span class="tk-mine-item-code">${o.orderNumber}</span>
      <span class="tk-mine-item-date">${dateStr}${o.total ? ' · ' + o.total + ' DH' : ''}</span>
    </button>`;
  }).join('');
  list.querySelectorAll('.tk-mine-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.order;
      document.getElementById('tracking-lookup-input').value = code;
      list.querySelectorAll('.tk-mine-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lookupAndRenderOrder(code);
    });
  });
}

function openTrackingModal(orderNumber, pushHistory){
  document.getElementById('tracking-lookup-error').style.display = 'none';
  document.getElementById('tracking-order-number').textContent = '';
  document.getElementById('tracking-timeline').innerHTML = '';
  document.getElementById('tracking-modal').classList.add('open');
  document.getElementById('tracking-overlay').classList.add('open');
  if(typeof trackingBannerCtrl !== 'undefined') trackingBannerCtrl.render();

  // If no specific order number was requested, fall back to this device's
  // saved order history (most recent order shown automatically) so the
  // customer doesn't need to remember/retype their tracking code.
  const myOrders = getMyOrders();
  const target = orderNumber || (myOrders.length ? myOrders[0].orderNumber : '');
  renderMyOrdersList(myOrders, target);
  document.getElementById('tracking-lookup-input').value = target;
  if(target) lookupAndRenderOrder(target);

  if(pushHistory !== false){
    try{ history.pushState({ tracking: true }, '', ''); }catch(err){}
  }
}
document.getElementById('tracking-lookup-btn').addEventListener('click', () => {
  const val = document.getElementById('tracking-lookup-input').value.trim();
  if(val) lookupAndRenderOrder(val);
});
/* ---------- hamburger side menu ---------- */
function openSideMenu(pushHistory){
  document.getElementById('side-menu-drawer').classList.add('open');
  document.getElementById('side-menu-overlay').classList.add('open');
  if(pushHistory !== false){
    try{ history.pushState({ sideMenu: true }, '', ''); }catch(err){}
  }
}
function closeSideMenu(fromPopstate){
  document.getElementById('side-menu-drawer').classList.remove('open');
  document.getElementById('side-menu-overlay').classList.remove('open');
  if(!fromPopstate && history.state && history.state.sideMenu){
    try{ history.back(); }catch(err){}
  }
}
document.getElementById('menu-toggle-btn').addEventListener('click', () => openSideMenu());
document.getElementById('side-menu-close').addEventListener('click', () => closeSideMenu());
document.getElementById('side-menu-overlay').addEventListener('click', () => closeSideMenu());
document.getElementById('side-menu-track-order').addEventListener('click', () => {
  closeSideMenu(true);
  openTrackingModal(undefined, true);
});
document.getElementById('side-menu-about').addEventListener('click', () => {
  closeSideMenu(true);
  openAboutModal(true);
});
document.getElementById('about-modal-close').addEventListener('click', () => closeAboutModal());
document.getElementById('about-overlay').addEventListener('click', () => closeAboutModal());
function openAboutModal(pushHistory){
  document.getElementById('about-modal').classList.add('open');
  document.getElementById('about-overlay').classList.add('open');
  if(pushHistory !== false){
    try{ history.pushState({ about: true }, '', ''); }catch(err){}
  }
}
function closeAboutModal(fromPopstate){
  document.getElementById('about-modal').classList.remove('open');
  document.getElementById('about-overlay').classList.remove('open');
  if(!fromPopstate && history.state && history.state.about){
    try{ history.back(); }catch(err){}
  }
}

/* ---------- "Derrière la Marque" (brand owner) — admin-editable ---------- */
const FOUNDER_KEY = 'histoire-founder-info';
let founderInfo = { photoUrl: null, bio: '' };

function renderFounderInfo(){
  const img = document.getElementById('founder-photo-img');
  const placeholder = document.getElementById('founder-photo-placeholder');
  const editBtn = document.getElementById('founder-photo-edit');
  const bioText = document.getElementById('founder-bio-text');
  const bioEditWrap = document.getElementById('founder-bio-edit-wrap');
  const bioInput = document.getElementById('founder-bio-input');

  if(founderInfo.photoUrl){
    img.src = founderInfo.photoUrl;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }
  if(editBtn) editBtn.style.display = isAdmin ? 'flex' : 'none';

  if(isAdmin){
    bioText.style.display = 'none';
    bioEditWrap.style.display = 'block';
    if(document.activeElement !== bioInput) bioInput.value = founderInfo.bio || '';
  } else {
    bioEditWrap.style.display = 'none';
    bioText.style.display = founderInfo.bio ? 'block' : 'none';
    bioText.textContent = founderInfo.bio || '';
  }
}

async function loadFounderInfo(){
  try{
    const data = await kvGet(FOUNDER_KEY);
    if(data){
      founderInfo.photoUrl = data.photoUrl || null;
      founderInfo.bio = data.bio || '';
    }
  }catch(err){ /* not configured yet */ }
  renderFounderInfo();
}

async function saveFounderInfo(){
  try{
    await kvSet(FOUNDER_KEY, founderInfo);
  }catch(err){
    showToast(t('toastStorageUnavailable'));
  }
}

document.getElementById('founder-photo-edit').addEventListener('click', () => {
  document.getElementById('founder-photo-input').click();
});
document.getElementById('founder-photo-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const url = await uploadProductImage(file);
  if(url){
    founderInfo.photoUrl = url;
    renderFounderInfo();
    await saveFounderInfo();
    showToast('Photo mise à jour.');
  }
});
document.getElementById('founder-bio-save').addEventListener('click', async () => {
  founderInfo.bio = document.getElementById('founder-bio-input').value.trim();
  await saveFounderInfo();
  showToast('Informations enregistrées.');
});

document.getElementById('side-menu-founder').addEventListener('click', () => {
  closeSideMenu(true);
  openFounderModal(true);
});
document.getElementById('founder-modal-close').addEventListener('click', () => closeFounderModal());
document.getElementById('founder-overlay').addEventListener('click', () => closeFounderModal());
function openFounderModal(pushHistory){
  document.getElementById('founder-modal').classList.add('open');
  document.getElementById('founder-overlay').classList.add('open');
  loadFounderInfo();
  if(pushHistory !== false){
    try{ history.pushState({ founder: true }, '', ''); }catch(err){}
  }
}
function closeFounderModal(fromPopstate){
  document.getElementById('founder-modal').classList.remove('open');
  document.getElementById('founder-overlay').classList.remove('open');
  if(!fromPopstate && history.state && history.state.founder){
    try{ history.back(); }catch(err){}
  }
}
function closeTrackingModal(fromPopstate){
  document.getElementById('tracking-modal').classList.remove('open');
  document.getElementById('tracking-overlay').classList.remove('open');
  if(!fromPopstate && history.state && history.state.tracking){
    try{ history.back(); }catch(err){}
  }
}
document.getElementById('tracking-modal-close').addEventListener('click', () => closeTrackingModal());
document.getElementById('tracking-overlay').addEventListener('click', closeTrackingModal);

/* ============================================================
   ADMIN DASHBOARD — full-page (Dashboard / Orders / Products / Customers / Analytics / Settings)
   ============================================================ */

let adCurrentStatusFilter = 'all';
let adExpandedOrderId = null;
let adSelectedOrderIds = new Set();
let pendingAdminOrderNumber = null;

function jumpToAdminOrder(orderNumber){
  if(!orderNumber) return;
  adCurrentStatusFilter = 'all';
  document.querySelectorAll('.ad-tab').forEach(b => b.classList.toggle('active', b.dataset.status === 'all'));
  document.getElementById('ad-orders-search').value = orderNumber;
  adSwitchPage('orders');
  const match = customers.find(o => o.order_number === orderNumber);
  adExpandedOrderId = match ? match.id : null;
  adRenderOrdersPage();
  setTimeout(() => {
    const card = document.querySelector('.ad-order-card.expanded') || document.querySelector('.ad-order-card');
    if(card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}
let adNotifCount = 0;
let adNotifList = [];
let adRealtimeChannel = null;

const AD_ALL_STATUSES = ['pending','confirmed','preparing','shipped','delivered','cancelled'];

function adStatusLabel(s){
  return t('status' + s.charAt(0).toUpperCase() + s.slice(1));
}

function adFormatMoney(n){
  return (Number(n) || 0).toLocaleString('fr-FR') + ' DH';
}

function adOrderMatchesQuery(o, q){
  if(!q) return true;
  const hay = [o.customer_name, o.customer_phone, o.order_number, o.customer_city, o.customer_address]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function adStatusIcon(s){
  const icons = {
    pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    confirmed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
    preparing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="M12 11v10"/></svg>',
    shipped: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>',
    delivered: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };
  return icons[s] || '';
}

function adStatusSelectorHtml(order){
  const s = order.status;
  return `
  <div class="ad-status-select" data-id="${order.id}">
    <button type="button" class="ad-status-trigger ads-${s}">
      ${adStatusIcon(s)}<span>${adStatusLabel(s)}</span>
      <svg class="ad-status-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <div class="ad-status-menu">
      ${AD_ALL_STATUSES.map(opt => `
        <button type="button" class="ad-status-option ${opt === s ? 'current' : ''}" data-status="${opt}">
          <span class="ad-status-dot adsd-${opt}"></span>${adStatusLabel(opt)}
        </button>`).join('')}
    </div>
  </div>`;
}

function adFindProductImage(name){
  const all = men.concat(women);
  const p = all.find(pp => pp.name === name);
  if(!p) return null;
  return productCoverImage(p);
}

function adTimelineHtml(status){
  if(status === 'cancelled'){
    return `<div class="tt-step active"><div class="tt-dot" style="background:#c0392b;color:#fff;">✕</div><div class="tt-content"><div class="tt-label">${t('statusCancelled')}</div></div></div>`;
  }
  const idx = ORDER_STATUSES.indexOf(status);
  const labels = {
    pending: t('statusPending'), confirmed: t('statusConfirmed'), preparing: t('statusPreparing'),
    shipped: t('statusShipped'), delivered: t('statusDelivered')
  };
  return ORDER_STATUSES.map((s, i) => {
    const state = i < idx ? 'done' : (i === idx ? 'active' : '');
    const icon = i < idx ? '✓' : (i + 1);
    return `
    <div class="tt-step ${state}">
      <div class="tt-dot">${icon}</div>
      ${i < ORDER_STATUSES.length - 1 ? '<div class="tt-line"></div>' : ''}
      <div class="tt-content"><div class="tt-label">${labels[s]}</div></div>
    </div>`;
  }).join('');
}

function adOrderCardHtml(o){
  const dateStr = o.created_at ? new Date(o.created_at).toLocaleString('fr-FR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '';
  const itemsCount = (o.order_items || []).reduce((s, i) => s + (i.quantity || 0), 0);
  const expanded = adExpandedOrderId === o.id;
  const itemsHtml = (o.order_items || []).map(i => {
    const img = adFindProductImage(i.product_name);
    return `
    <div class="ad-product-line">
      ${img ? `<img class="ad-product-thumb" src="${img}" alt="">` : `<div class="ad-product-thumb-empty"></div>`}
      <div class="ad-product-info">
        <div class="ad-product-name">${escapeHtml(i.product_name)}</div>
        <div class="ad-product-meta">Qté ${i.quantity} × ${i.unit_price} DH</div>
      </div>
      <div class="ad-product-line-total">${i.subtotal} DH</div>
    </div>`;
  }).join('') || `<p class="ad-empty-note">Aucun article</p>`;

  const phoneDigits = (o.customer_phone || '').replace(/[^0-9+]/g, '');
  const waPhone = phoneDigits.replace(/^0/, '212').replace('+', '');
  const mapsQuery = encodeURIComponent(`${o.customer_address || ''} ${o.customer_city || ''}`.trim());

  return `
  <div class="ad-order-card ${expanded ? 'expanded' : ''}" data-id="${o.id}">
    <div class="ad-order-summary" data-toggle="${o.id}">
      <input type="checkbox" class="ad-order-select" data-id="${o.id}" ${adSelectedOrderIds.has(o.id) ? 'checked' : ''} onclick="event.stopPropagation()">
      <div class="ad-order-id">#${o.order_number}</div>
      <div class="ad-order-customer-cell">
        <div class="ad-oc-name">${escapeHtml(o.customer_name)}</div>
        <div class="ad-oc-sub">${escapeHtml(o.customer_phone)}</div>
      </div>
      <div class="ad-order-cell-city">
        <div class="ad-order-cell-label">Ville</div>
        <div class="ad-order-cell-value">${escapeHtml(o.customer_city) || '—'}</div>
      </div>
      <div class="ad-order-cell-items">
        <div class="ad-order-cell-label">Articles</div>
        <div class="ad-order-cell-value">${itemsCount}</div>
      </div>
      <div class="ad-order-cell-total">
        <div class="ad-order-cell-label">Total</div>
        <div class="ad-order-total">${o.total || 0} DH</div>
      </div>
      <div class="ad-order-cell-date">
        <div class="ad-order-cell-label">Date</div>
        <div class="ad-order-cell-value">${dateStr}</div>
      </div>
      ${adStatusSelectorHtml(o)}
      <button type="button" class="ad-order-expand-btn" aria-label="Expand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
    </div>
    <div class="ad-order-detail">
      <div class="ad-order-detail-inner">
        <div class="ad-detail-block">
          <h4>Informations client</h4>
          <div class="ad-detail-row"><span>Nom</span><span>${escapeHtml(o.customer_name)}</span></div>
          <div class="ad-detail-row"><span>Téléphone</span><span>${escapeHtml(o.customer_phone)}</span></div>
          <div class="ad-detail-row"><span>Ville</span><span>${escapeHtml(o.customer_city) || '—'}</span></div>
          <div class="ad-detail-row"><span>Adresse</span><span>${escapeHtml(o.customer_address) || '—'}</span></div>
          <div class="ad-detail-row"><span>Paiement</span><span>${o.payment_method === 'cod' ? 'Paiement à la livraison' : (o.payment_method || '—')}</span></div>
          <div class="ad-detail-row"><span>Frais de livraison</span><span>${o.shipping_fee || 0} DH</span></div>
          ${o.customer_notes ? `<div class="ad-notes-box">${escapeHtml(o.customer_notes)}</div>` : ''}
          <h4 style="margin-top:18px;">Suivi de commande</h4>
          <div class="ad-timeline tracking-timeline">${adTimelineHtml(o.status)}</div>
        </div>
        <div class="ad-detail-block">
          <h4>Produits commandés</h4>
          ${itemsHtml}
          <div class="ad-detail-row" style="margin-top:8px;"><span>Sous-total</span><span>${o.subtotal || 0} DH</span></div>
          ${o.discount ? `<div class="ad-detail-row"><span>Réduction</span><span>-${o.discount} DH</span></div>` : ''}
          <div class="ad-detail-row" style="font-weight:700;"><span>Total</span><span>${o.total || 0} DH</span></div>
        </div>
        <div class="ad-quick-actions">
          <a class="ad-qa-btn ad-qa-btn-call" href="tel:${phoneDigits}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2z"/></svg>Appeler</a>
          <a class="ad-qa-btn ad-qa-btn-wa" target="_blank" rel="noopener" href="https://wa.me/${waPhone}?text=${encodeURIComponent('Bonjour ' + o.customer_name + ', concernant votre commande ' + o.order_number + ' chez HISTOIRE...')}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.1c-5.5 0-10 4.5-10 10 0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.4.8 3.1 1.2 4.9 1.2 5.5 0 10-4.5 10-10s-4.5-9.8-10-9.8z"/></svg>WhatsApp</a>
          <a class="ad-qa-btn ad-qa-btn-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Google Maps</a>
          <button type="button" class="ad-qa-btn ad-qa-btn-print" data-print-invoice="${o.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>Facture</button>
          <button type="button" class="ad-qa-btn ad-qa-btn-note" data-print-note="${o.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>Étiquette colis</button>
          <button type="button" class="ad-qa-btn ad-qa-btn-del" data-del-order="${o.id}" style="margin-left:auto;color:#a31f1f;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>Supprimer</button>
        </div>
      </div>
    </div>
  </div>`;
}

function adFilteredOrders(){
  const q = (document.getElementById('ad-orders-search').value || '').trim().toLowerCase();
  let list = [...customers].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if(adCurrentStatusFilter !== 'all') list = list.filter(o => o.status === adCurrentStatusFilter);
  if(q) list = list.filter(o => adOrderMatchesQuery(o, q));
  return list;
}

function adUpdateTabCounts(){
  const counts = { all: customers.length, pending: 0, confirmed: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  customers.forEach(o => { if(counts[o.status] !== undefined) counts[o.status]++; });
  Object.keys(counts).forEach(k => {
    const el = document.getElementById('ad-tab-count-' + k);
    if(el) el.textContent = counts[k];
  });
  const navBadge = document.getElementById('ad-nav-orders-count');
  if(navBadge) navBadge.textContent = counts.pending;
}

function adRenderOrdersPage(){
  adUpdateTabCounts();
  const list = adFilteredOrders();
  const container = document.getElementById('ad-orders-list');
  if(!list.length){
    container.innerHTML = `<p class="ad-empty-note">Aucune commande trouvée.</p>`;
    adUpdatePrintSelectedUI();
    return;
  }
  container.innerHTML = list.map(adOrderCardHtml).join('');
  adUpdatePrintSelectedUI();
}

/* ---------- dashboard stats & charts ---------- */
function adRenderDashboardStats(){
  const total = customers.length;
  const revenue = customers.reduce((s, o) => s + (o.status !== 'cancelled' ? (Number(o.total) || 0) : 0), 0);
  const pending = customers.filter(o => o.status === 'pending').length;
  const delivered = customers.filter(o => o.status === 'delivered').length;
  document.getElementById('ad-stat-revenue').textContent = adFormatMoney(revenue);
  document.getElementById('ad-stat-total').textContent = total;
  document.getElementById('ad-stat-pending').textContent = pending;
  document.getElementById('ad-stat-delivered').textContent = delivered;
}

function adBuildLast30DaysBars(valueFn, targetId){
  const days = [];
  for(let i = 29; i >= 0; i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    days.push(d);
  }
  const values = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return valueFn(d, next);
  });
  const max = Math.max(1, ...values);
  const peakIndex = values.lastIndexOf(max);
  const el = document.getElementById(targetId);
  if(!el) return;
  el.innerHTML = days.map((d, i) => {
    const h = Math.max(3, Math.round((values[i] / max) * 120));
    const label = i % 6 === 0 ? (d.getDate() + '/' + (d.getMonth() + 1)) : '';
    const isPeak = i === peakIndex && values[i] > 0;
    const peakTag = isPeak ? `<div class="ad-bar-peak">${values[i]}</div>` : '';
    return `<div class="ad-bar-col" title="${d.toLocaleDateString('fr-FR')} — ${values[i]}"><div class="ad-bar${isPeak ? ' is-peak' : ''}" style="height:${h}px;">${peakTag}</div><div class="ad-bar-label">${label}</div></div>`;
  }).join('');
}

function adRenderRevenueChart(targetId){
  adBuildLast30DaysBars((start, end) => {
    return customers.filter(o => {
      const c = new Date(o.created_at || 0);
      return c >= start && c < end && o.status !== 'cancelled';
    }).reduce((s, o) => s + (Number(o.total) || 0), 0);
  }, targetId);
}

function adRenderDailyOrdersChart(targetId){
  adBuildLast30DaysBars((start, end) => {
    return customers.filter(o => {
      const c = new Date(o.created_at || 0);
      return c >= start && c < end;
    }).length;
  }, targetId);
}

function adRenderBestSellers(targetId){
  const counts = {};
  customers.forEach(o => (o.order_items || []).forEach(i => {
    counts[i.product_name] = (counts[i.product_name] || 0) + (i.quantity || 0);
  }));
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const el = document.getElementById(targetId);
  if(!el) return;
  if(!rows.length){ el.innerHTML = `<p class="ad-empty-note">Pas encore de ventes.</p>`; return; }
  const max = rows[0][1];
  el.innerHTML = rows.map(([name, count]) => `
    <div class="ad-best-row">
      <div class="ad-best-name">${name}</div>
      <div class="ad-best-track"><div class="ad-best-fill" style="width:${Math.round(count / max * 100)}%;"></div></div>
      <div class="ad-best-count">${count}</div>
    </div>`).join('');
}

function adRenderMonthlyRevenue(targetId){
  const months = [];
  for(let i = 5; i >= 0; i--){
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(d);
  }
  const values = months.map(d => {
    return customers.filter(o => {
      const c = new Date(o.created_at || 0);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth() && o.status !== 'cancelled';
    }).reduce((s, o) => s + (Number(o.total) || 0), 0);
  });
  const max = Math.max(1, ...values);
  const el = document.getElementById(targetId);
  if(!el) return;
  el.innerHTML = months.map((d, i) => {
    const h = Math.max(3, Math.round((values[i] / max) * 120));
    return `<div class="ad-bar-col" title="${values[i]} DH"><div class="ad-bar" style="height:${h}px;"></div><div class="ad-bar-label">${d.toLocaleDateString('fr-FR', {month:'short'})}</div></div>`;
  }).join('');
}

function adRenderAnalyticsKpis(){
  const now = new Date();
  const start30 = new Date(now); start30.setHours(0,0,0,0); start30.setDate(start30.getDate() - 29);
  const last30 = customers.filter(o => new Date(o.created_at || 0) >= start30);
  const last30Valid = last30.filter(o => o.status !== 'cancelled');
  const revenue30 = last30Valid.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const orders30 = last30.length;
  const aov = last30Valid.length ? Math.round(revenue30 / last30Valid.length) : 0;
  const deliveredTotal = customers.filter(o => o.status === 'delivered').length;
  const deliveryRate = customers.length ? Math.round((deliveredTotal / customers.length) * 100) : 0;

  const revEl = document.getElementById('ad-kpi-revenue-30');
  const ordEl = document.getElementById('ad-kpi-orders-30');
  const aovEl = document.getElementById('ad-kpi-aov');
  const rateEl = document.getElementById('ad-kpi-delivery-rate');
  if(revEl) revEl.textContent = adFormatMoney(revenue30);
  if(ordEl) ordEl.textContent = orders30;
  if(aovEl) aovEl.textContent = adFormatMoney(aov);
  if(rateEl) rateEl.textContent = deliveryRate + '%';

  const revSummary = document.getElementById('ad-analytics-revenue-summary');
  if(revSummary) revSummary.textContent = 'Total : ' + adFormatMoney(revenue30);
  const dailySummary = document.getElementById('ad-analytics-daily-summary');
  if(dailySummary) dailySummary.textContent = orders30 + ' commande' + (orders30 > 1 ? 's' : '');
}

function adRenderStatusBreakdown(targetId){
  const el = document.getElementById(targetId);
  if(!el) return;
  const total = customers.length;
  if(!total){ el.innerHTML = `<p class="ad-empty-note">Pas encore de commandes.</p>`; return; }
  const counts = {};
  AD_ALL_STATUSES.forEach(s => counts[s] = 0);
  customers.forEach(o => { if(counts[o.status] !== undefined) counts[o.status]++; });
  const rows = AD_ALL_STATUSES.map(s => [s, counts[s]]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(r => r[1]));
  el.innerHTML = rows.map(([s, count]) => `
    <div class="ad-best-row">
      <span class="ad-best-dot adsd-${s}"></span>
      <div class="ad-best-name" style="width:80px;">${adStatusLabel(s)}</div>
      <div class="ad-best-track"><div class="ad-best-fill" style="width:${Math.round(count / max * 100)}%;"></div></div>
      <div class="ad-best-count">${count} · ${Math.round(count / total * 100)}%</div>
    </div>`).join('');
}

function adRenderCityBreakdown(targetId){
  const el = document.getElementById(targetId);
  if(!el) return;
  const counts = {};
  customers.forEach(o => {
    const city = (o.customer_city || '').trim();
    if(!city) return;
    counts[city] = (counts[city] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if(!rows.length){ el.innerHTML = `<p class="ad-empty-note">Pas encore de données de ville.</p>`; return; }
  const max = rows[0][1];
  el.innerHTML = rows.map(([city, count]) => `
    <div class="ad-best-row">
      <div class="ad-best-name">${escapeHtml(city)}</div>
      <div class="ad-best-track"><div class="ad-best-fill" style="width:${Math.round(count / max * 100)}%;"></div></div>
      <div class="ad-best-count">${count}</div>
    </div>`).join('');
}

function adRenderAllCharts(){
  adRenderRevenueChart('ad-chart-revenue');
  adRenderDailyOrdersChart('ad-chart-daily-orders');
  adRenderBestSellers('ad-best-sellers');
  adRenderMonthlyRevenue('ad-chart-monthly');
  adRenderRevenueChart('ad-analytics-revenue');
  adRenderDailyOrdersChart('ad-analytics-daily');
  adRenderBestSellers('ad-analytics-best-sellers');
  adRenderMonthlyRevenue('ad-analytics-monthly');
  adRenderAnalyticsKpis();
  adRenderStatusBreakdown('ad-analytics-status-breakdown');
  adRenderCityBreakdown('ad-analytics-city-breakdown');
}

function adRenderDashboardPage(){
  adRenderDashboardStats();
  adRenderAllCharts();
}

/* ---------- products page ---------- */
function adRenderProductsPage(){
  const all = [
    ...men.map((p, i) => ({ p, category: 'men', idx: i })),
    ...women.map((p, i) => ({ p, category: 'women', idx: i }))
  ];
  const container = document.getElementById('ad-products-list');
  if(!all.length){ container.innerHTML = `<p class="ad-empty-note">Aucun produit.</p>`; return; }
  container.innerHTML = all.map(({ p, category, idx }) => {
    const cover = productCoverImage(p);
    return `
    <div class="ad-product-row-card">
      ${cover ? `<img class="ad-product-row-thumb" src="${cover}" alt="">` : `<div class="ad-product-row-thumb"></div>`}
      <div class="ad-product-row-info">
        <div class="ad-product-row-name">${p.name}${p.pinned ? ' <span style="color:var(--gold-deep);font-size:10px;font-weight:700;letter-spacing:.06em;">· PACK</span>' : ''}</div>
        <div class="ad-product-row-meta">${category === 'men' ? 'Homme' : 'Femme'} · ${p.family || ''}</div>
      </div>
      <div class="ad-product-row-price">${p.price} DH</div>
      <div class="ad-product-row-actions">
        <button class="admin-edit-btn" data-category="${category}" data-idx="${idx}" aria-label="Edit product">✎</button>
        <button class="admin-del-btn" data-category="${category}" data-idx="${idx}" aria-label="Delete product">🗑</button>
      </div>
    </div>`;
  }).join('');
}

/* ---------- customers page ---------- */
function adAggregateCustomers(){
  const map = new Map();
  customers.forEach(o => {
    const key = (o.customer_phone || o.customer_name || '').trim();
    if(!key) return;
    if(!map.has(key)){
      map.set(key, { name: o.customer_name, phone: o.customer_phone, city: o.customer_city, orders: 0, spent: 0, lastDate: o.created_at });
    }
    const c = map.get(key);
    c.orders++;
    if(o.status !== 'cancelled') c.spent += (Number(o.total) || 0);
    if(new Date(o.created_at || 0) > new Date(c.lastDate || 0)) c.lastDate = o.created_at;
  });
  return [...map.values()].sort((a, b) => new Date(b.lastDate || 0) - new Date(a.lastDate || 0));
}

function adRenderCustomersPage(){
  const q = (document.getElementById('ad-customers-search').value || '').trim().toLowerCase();
  let list = adAggregateCustomers();
  if(q) list = list.filter(c => [c.name, c.phone, c.city].filter(Boolean).join(' ').toLowerCase().includes(q));
  const container = document.getElementById('ad-customers-list');
  if(!list.length){ container.innerHTML = `<p class="ad-empty-note">Aucun client trouvé.</p>`; return; }
  container.innerHTML = list.map(c => `
    <div class="ad-customer-row">
      <div class="ad-customer-avatar">${(c.name || '?').charAt(0).toUpperCase()}</div>
      <div class="ad-customer-info">
        <div class="ad-customer-name">${escapeHtml(c.name) || '—'}</div>
        <div class="ad-customer-meta">${escapeHtml(c.phone)}${c.city ? ' · ' + escapeHtml(c.city) : ''}</div>
      </div>
      <div class="ad-customer-stats">
        <div>
          <div class="ad-customer-stat-label">Commandes</div>
          <div class="ad-customer-stat-value">${c.orders}</div>
        </div>
        <div>
          <div class="ad-customer-stat-label">Total dépensé</div>
          <div class="ad-customer-stat-value">${adFormatMoney(c.spent)}</div>
        </div>
      </div>
    </div>`).join('');
}

/* ---------- print: invoice & shipping label ---------- */
function adPrintInvoice(order){
  const area = document.getElementById('ad-print-area');
  const itemsRows = (order.order_items || []).map(i => `
    <tr><td>${escapeHtml(i.product_name)}</td><td style="text-align:center;">${i.quantity}</td><td style="text-align:right;">${i.unit_price} DH</td><td style="text-align:right;">${i.subtotal} DH</td></tr>
  `).join('');
  document.body.classList.remove('printing-label');
  area.innerHTML = `
    <div style="max-width:700px;margin:40px auto;font-family:'Jost',sans-serif;color:#16181d;padding:30px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16181d;padding-bottom:18px;margin-bottom:24px;">
        <div>
          <div style="font-family:'Jost',sans-serif;font-weight:700;font-size:22px;letter-spacing:.08em;">HISTOIRE</div>
          <div style="font-size:11px;color:#6b7280;letter-spacing:.1em;text-transform:uppercase;">Parfum Collection</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:700;letter-spacing:.06em;">FACTURE</div>
          <div style="font-size:12px;color:#6b7280;">#${order.order_number}</div>
          <div style="font-size:12px;color:#6b7280;">${order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : ''}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:24px;font-size:13px;">
        <div>
          <div style="color:#6b7280;font-size:10.5px;text-transform:uppercase;margin-bottom:4px;">Client</div>
          <div>${escapeHtml(order.customer_name)}</div>
          <div>${escapeHtml(order.customer_phone)}</div>
          <div>${escapeHtml(order.customer_address) || ''}</div>
          <div>${escapeHtml(order.customer_city) || ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#6b7280;font-size:10.5px;text-transform:uppercase;margin-bottom:4px;">Paiement</div>
          <div>${order.payment_method === 'cod' ? 'Paiement à la livraison' : (order.payment_method || '—')}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <thead><tr style="border-bottom:1px solid #ddd;text-align:left;">
          <th style="padding:8px 0;">Produit</th><th style="text-align:center;">Qté</th><th style="text-align:right;">Prix</th><th style="text-align:right;">Total</th>
        </tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;">
        <table style="font-size:13px;width:260px;">
          <tr><td style="color:#6b7280;padding:4px 0;">Sous-total</td><td style="text-align:right;">${order.subtotal || 0} DH</td></tr>
          <tr><td style="color:#6b7280;padding:4px 0;">Livraison</td><td style="text-align:right;">${order.shipping_fee || 0} DH</td></tr>
          ${order.discount ? `<tr><td style="color:#6b7280;padding:4px 0;">Réduction</td><td style="text-align:right;">-${order.discount} DH</td></tr>` : ''}
          <tr style="font-weight:700;font-size:15px;border-top:1px solid #ddd;"><td style="padding:8px 0;">Total</td><td style="text-align:right;">${order.total} DH</td></tr>
        </table>
      </div>
      <div style="margin-top:40px;font-size:11px;color:#9ca3af;text-align:center;">Merci pour votre confiance — HISTOIRE Parfum Collection</div>
    </div>`;
  window.print();
  setTimeout(() => { area.innerHTML = ''; }, 300);
}

/* ==========================================================
   SHIPPING LABEL SYSTEM
   100mm x 150mm thermal-printer-ready label, with barcode +
   QR code (deep link back to this order in the admin panel),
   a preview screen before anything is sent to the printer,
   and batch printing for several orders at once.
   ========================================================== */
function adFindProductSize(name){
  const all = men.concat(women);
  const p = all.find(pp => pp.name === name);
  return p ? (p.size || '') : '';
}

function adLabelBoxHtml(order, uid){
  const rows = (order.order_items || []).map(i => `
    <tr>
      <td>
        <div class="lp-name">${escapeHtml(i.product_name)}</div>
        <div class="lp-size">${escapeHtml(adFindProductSize(i.product_name))}</div>
      </td>
      <td class="lp-num">×${i.quantity}</td>
      <td class="lp-num">${i.subtotal} DH</td>
    </tr>`).join('') || `<tr><td colspan="3">—</td></tr>`;
  const codAmount = order.payment_method === 'cod' ? (order.total || 0) : 0;
  const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : '';
  return `
    <div class="ad-label-box" id="ad-label-${uid}">
      <div class="ad-label-head">
        <div class="ad-label-brand">HISTOIRE<small>Parfum Collection</small></div>
        <div class="ad-label-order-no">
          <div class="ad-label-order-id">#${escapeHtml(order.order_number || '')}</div>
          <div class="ad-label-order-date">${dateStr}</div>
        </div>
      </div>

      <div class="ad-label-section">
        <div class="ad-label-section-title">Destinataire</div>
        <div class="ad-label-value">${escapeHtml(order.customer_name) || '—'}</div>
        <div class="ad-label-value">${escapeHtml(order.customer_phone) || '—'}</div>
      </div>

      <div class="ad-label-section">
        <div class="ad-label-section-title">Adresse de livraison</div>
        <div class="ad-label-value">${escapeHtml(order.customer_address) || '—'}</div>
        <div class="ad-label-value">${escapeHtml(order.customer_city) || '—'}</div>
        ${order.customer_notes ? `<div class="ad-label-notes">Note: ${escapeHtml(order.customer_notes)}</div>` : ''}
      </div>

      <div class="ad-label-section">
        <div class="ad-label-section-title">Produits</div>
        <table class="ad-label-products">
          <thead><tr><th>Article</th><th></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="ad-label-cod">
        <span class="ad-label-cod-title">${order.payment_method === 'cod' ? 'À encaisser (COD)' : 'Payé en ligne'}</span>
        <span class="ad-label-cod-amount">${order.total || 0} DH</span>
      </div>

      <div class="ad-label-codes">
        <div class="ad-label-barcode"><svg id="ad-label-barcode-${uid}"></svg></div>
        <div class="ad-label-qr" id="ad-label-qr-${uid}"></div>
      </div>
      <div class="ad-label-footer">histoire.ma</div>
    </div>`;
}

function adRenderLabelCodes(order, uid){
  if(window.JsBarcode){
    try{
      JsBarcode('#ad-label-barcode-' + uid, order.order_number || String(order.id || ''), {
        format: 'CODE128', height: 34, width: 1.4, fontSize: 10, margin: 0, displayValue: true
      });
    }catch(err){}
  }
  const qrEl = document.getElementById('ad-label-qr-' + uid);
  if(qrEl && window.QRCode){
    try{
      const orderUrl = `${location.origin}${location.pathname}?order=${encodeURIComponent(order.order_number || '')}`;
      new QRCode(qrEl, { text: orderUrl, width: 76, height: 76, correctLevel: QRCode.CorrectLevel.M });
    }catch(err){}
  }
}

// Sets a temporary @page size (Chrome/Edge/most thermal-printer print
// dialogs respect this) — 100x150mm for labels, back to normal for
// anything else — so labels don't get forced onto an A4 sheet.
function adSetPrintPageSize(sizeCss){
  let styleEl = document.getElementById('ad-dynamic-page-size');
  if(!styleEl){
    styleEl = document.createElement('style');
    styleEl.id = 'ad-dynamic-page-size';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = sizeCss ? `@page { size: ${sizeCss}; margin: 0; }` : '';
}

let adPreviewOrders = [];

function openLabelPreview(orders){
  adPreviewOrders = orders;
  const body = document.getElementById('label-preview-body');
  body.innerHTML = orders.map((o, i) => adLabelBoxHtml(o, 'pv' + i)).join('');
  orders.forEach((o, i) => adRenderLabelCodes(o, 'pv' + i));
  document.getElementById('label-preview-modal').classList.add('open');
  document.getElementById('label-preview-overlay').classList.add('open');
}
function closeLabelPreview(){
  document.getElementById('label-preview-modal').classList.remove('open');
  document.getElementById('label-preview-overlay').classList.remove('open');
}
document.getElementById('label-preview-close').addEventListener('click', closeLabelPreview);
document.getElementById('label-preview-overlay').addEventListener('click', closeLabelPreview);
document.getElementById('label-preview-print-btn').addEventListener('click', () => {
  const area = document.getElementById('ad-print-area');
  area.innerHTML = adPreviewOrders.map((o, i) => adLabelBoxHtml(o, 'pr' + i)).join('');
  adPreviewOrders.forEach((o, i) => adRenderLabelCodes(o, 'pr' + i));
  document.body.classList.add('printing-label');
  adSetPrintPageSize('100mm 150mm');
  window.print();
  setTimeout(() => {
    area.innerHTML = '';
    document.body.classList.remove('printing-label');
    adSetPrintPageSize(null);
  }, 300);
});

function adPrintShippingLabel(order){
  openLabelPreview([order]);
}

function adPrintSelectedLabels(){
  const orders = customers.filter(o => adSelectedOrderIds.has(o.id));
  if(!orders.length) return;
  openLabelPreview(orders);
}

function adUpdatePrintSelectedUI(){
  const btn = document.getElementById('ad-print-selected-btn');
  const countEl = document.getElementById('ad-print-selected-count');
  countEl.textContent = adSelectedOrderIds.size;
  btn.disabled = adSelectedOrderIds.size === 0;
  const visibleIds = adFilteredOrders().map(o => o.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => adSelectedOrderIds.has(id));
  document.getElementById('ad-orders-select-all').checked = allChecked;
}

document.getElementById('ad-orders-list').addEventListener('change', (e) => {
  const cb = e.target.closest('.ad-order-select');
  if(!cb) return;
  const id = cb.dataset.id;
  if(cb.checked) adSelectedOrderIds.add(id); else adSelectedOrderIds.delete(id);
  adUpdatePrintSelectedUI();
});
document.getElementById('ad-orders-select-all').addEventListener('change', (e) => {
  const visible = adFilteredOrders();
  if(e.target.checked) visible.forEach(o => adSelectedOrderIds.add(o.id));
  else visible.forEach(o => adSelectedOrderIds.delete(o.id));
  adRenderOrdersPage();
  adUpdatePrintSelectedUI();
});
document.getElementById('ad-print-selected-btn').addEventListener('click', adPrintSelectedLabels);

/* ---------- notification sound ---------- */
function adPlayNotifSound(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  }catch(e){}
}

function adSubscribeRealtime(){
  if(adRealtimeChannel || !supabaseClient) return;
  try{
    adRealtimeChannel = supabaseClient
      .channel('admin-orders-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        adNotifCount++;
        document.getElementById('ad-notif-dot').style.display = 'block';
        adNotifList.unshift({
          name: (payload.new && payload.new.customer_name) ? payload.new.customer_name : 'Client',
          orderId: payload.new ? payload.new.id : null,
          time: new Date()
        });
        if(adNotifList.length > 20) adNotifList.length = 20;
        adRenderNotifPanel();
        adPlayNotifSound();
        showToast('Nouvelle commande reçue — ' + (payload.new && payload.new.customer_name ? payload.new.customer_name : ''));
        customers = await fetchOrders();
        adRefreshCurrentPage();
      })
      .subscribe();
  }catch(e){}
}

/* ---------- page navigation ---------- */
function adRefreshCurrentPage(){
  const activePage = document.querySelector('.ad-page.active');
  if(!activePage) return;
  const page = activePage.dataset.adPage;
  if(page === 'dashboard') adRenderDashboardPage();
  else if(page === 'orders') adRenderOrdersPage();
  else if(page === 'products') adRenderProductsPage();
  else if(page === 'customers') adRenderCustomersPage();
  else if(page === 'analytics') adRenderAllCharts();
  else if(page === 'reviews') adRenderReviewsPage();
  adUpdateTabCounts();
}

function adSwitchPage(pageName){
  document.querySelectorAll('.ad-nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.adPage === pageName));
  document.querySelectorAll('.ad-page').forEach(sec => sec.classList.toggle('active', sec.dataset.adPage === pageName));
  document.getElementById('admin-dashboard-page').classList.remove('sidebar-open');
  if(pageName === 'dashboard') adRenderDashboardPage();
  else if(pageName === 'orders') adRenderOrdersPage();
  else if(pageName === 'products') adRenderProductsPage();
  else if(pageName === 'customers') adRenderCustomersPage();
  else if(pageName === 'analytics') adRenderAllCharts();
  else if(pageName === 'reviews') adRenderReviewsPage();
}

document.querySelectorAll('.ad-nav-item').forEach(btn => {
  btn.addEventListener('click', () => adSwitchPage(btn.dataset.adPage));
});

document.getElementById('ad-sidebar-toggle').addEventListener('click', () => {
  document.getElementById('admin-dashboard-page').classList.toggle('sidebar-open');
});

document.getElementById('ad-sidebar-backdrop').addEventListener('click', () => {
  document.getElementById('admin-dashboard-page').classList.remove('sidebar-open');
});

/* ---------- notifications dropdown ---------- */
function adFormatNotifTime(date){
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if(diffMin < 1) return "à l'instant";
  if(diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if(diffH < 24) return `il y a ${diffH} h`;
  return date.toLocaleDateString('fr-FR');
}

function adRenderNotifPanel(){
  const list = document.getElementById('ad-notif-panel-list');
  if(!list) return;
  if(!adNotifList.length){
    list.innerHTML = `<div class="ad-notif-empty">Aucune nouvelle notification pour l'instant.</div>`;
    return;
  }
  list.innerHTML = adNotifList.map((n, i) => `
    <div class="ad-notif-item" data-notif-index="${i}">
      <span class="ad-notif-item-title">Nouvelle commande — ${n.name}</span>
      <span class="ad-notif-item-sub">${adFormatNotifTime(n.time)}</span>
    </div>
  `).join('');
  list.querySelectorAll('.ad-notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const n = adNotifList[Number(item.dataset.notifIndex)];
      adCloseNotifPanel();
      adSwitchPage('orders');
      if(n && n.name){
        const searchInput = document.getElementById('ad-global-search');
        if(searchInput){
          searchInput.value = n.name;
          searchInput.dispatchEvent(new Event('input'));
        }
      }
    });
  });
}

function adOpenNotifPanel(){
  document.getElementById('ad-notif-panel').classList.add('open');
  adNotifCount = 0;
  document.getElementById('ad-notif-dot').style.display = 'none';
  adRenderNotifPanel();
}

function adCloseNotifPanel(){
  document.getElementById('ad-notif-panel').classList.remove('open');
}

document.getElementById('ad-notif-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const panel = document.getElementById('ad-notif-panel');
  panel.classList.contains('open') ? adCloseNotifPanel() : adOpenNotifPanel();
});

document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.ad-notif-wrap');
  if(wrap && !wrap.contains(e.target)) adCloseNotifPanel();
});

/* ---------- manual "vue ordinateur" (desktop view) toggle ----------
   Some mobile browsers' built-in "request desktop site" option does not
   reliably widen the page's layout viewport, so the dashboard offers its
   own toggle: it widens the viewport meta tag itself (the same mechanism
   browsers use for desktop mode), which makes the existing desktop CSS
   layout (sidebar, multi-column grids, etc.) apply and the browser scales
   it to fit the screen. The choice is remembered for next time. */
const AD_DESKTOP_KEY = 'ad_force_desktop';
const AD_DESKTOP_WIDTH = 1280;

function adSetDesktopViewport(forceDesktop){
  const vp = document.querySelector('meta[name="viewport"]');
  if(!vp) return;
  vp.setAttribute('content', forceDesktop ? `width=${AD_DESKTOP_WIDTH}` : 'width=device-width, initial-scale=1.0');
  const btn = document.getElementById('ad-desktop-toggle');
  if(btn) btn.classList.toggle('is-active', forceDesktop);
  document.getElementById('admin-dashboard-page').classList.toggle('sidebar-open', false);
}

document.getElementById('ad-desktop-toggle').addEventListener('click', () => {
  const next = localStorage.getItem(AD_DESKTOP_KEY) !== '1';
  try{ localStorage.setItem(AD_DESKTOP_KEY, next ? '1' : '0'); }catch(err){}
  adSetDesktopViewport(next);
});

/* ---------- open / close dashboard ---------- */
async function openAdminDashboardPage(pushHistory){
  document.getElementById('admin-dashboard-page').classList.add('open');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.getElementById('ad-orders-list').innerHTML = `<div class="ad-skel-row"></div><div class="ad-skel-row"></div><div class="ad-skel-row"></div>`;
  customers = await fetchOrders();
  fetchAllReviewsAdmin().then(list => { adminReviews = list; adUpdateReviewsTabCounts(); });
  adNotifCount = 0;
  document.getElementById('ad-notif-dot').style.display = 'none';
  adSwitchPage('dashboard');
  adSubscribeRealtime();
  let savedDesktop = false;
  try{ savedDesktop = localStorage.getItem(AD_DESKTOP_KEY) === '1'; }catch(err){}
  adSetDesktopViewport(savedDesktop);
  if(pushHistory !== false){
    try{ history.pushState({ admin: 'dashboard' }, '', '/panel'); }catch(err){}
  }
}
function closeAdminDashboardPage(fromPopstate){
  document.getElementById('admin-dashboard-page').classList.remove('open');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  adSetDesktopViewport(false);
  if(!fromPopstate){
    try{ history.pushState({}, '', '/'); }catch(err){}
  }
}
document.getElementById('customers-btn').addEventListener('click', () => openAdminDashboardPage());
document.getElementById('ad-exit-btn').addEventListener('click', () => closeAdminDashboardPage());
document.getElementById('ad-settings-exit-btn').addEventListener('click', () => {
  isAdmin = false;
  setAdminUI();
  closeAdminDashboardPage();
});

/* ---------- orders search / filter tabs ---------- */
document.getElementById('ad-orders-search').addEventListener('input', () => adRenderOrdersPage());
document.getElementById('ad-global-search').addEventListener('input', (e) => {
  const val = e.target.value;
  if(!val) return;
  adSwitchPage('orders');
  document.getElementById('ad-orders-search').value = val;
  adRenderOrdersPage();
});
document.getElementById('ad-filter-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.ad-tab');
  if(!tab) return;
  adCurrentStatusFilter = tab.dataset.status;
  document.querySelectorAll('.ad-tab').forEach(b => b.classList.toggle('active', b === tab));
  adRenderOrdersPage();
});
document.getElementById('ad-customers-search').addEventListener('input', () => adRenderCustomersPage());
document.getElementById('ad-add-product-btn').addEventListener('click', () => openAdminModal('create', 'men'));

/* ---------- order card interactions (expand, status change, delete, print) ---------- */
document.getElementById('ad-orders-list').addEventListener('click', async (e) => {
  const statusTrigger = e.target.closest('.ad-status-trigger');
  if(statusTrigger){
    const wrap = statusTrigger.closest('.ad-status-select');
    const wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.ad-status-select.open').forEach(w => w.classList.remove('open'));
    if(!wasOpen) wrap.classList.add('open');
    return;
  }
  const statusOption = e.target.closest('.ad-status-option');
  if(statusOption){
    const wrap = statusOption.closest('.ad-status-select');
    const id = wrap.dataset.id;
    const newStatus = statusOption.dataset.status;
    wrap.classList.remove('open');
    const ok = await updateOrderStatus(id, newStatus);
    if(ok){
      const order = customers.find(c => c.id === id);
      if(order) order.status = newStatus;
      showToast('Statut mis à jour');
      adRenderOrdersPage();
      adRenderDashboardStats();
    }
    return;
  }
  const printInvoiceBtn = e.target.closest('[data-print-invoice]');
  if(printInvoiceBtn){
    const order = customers.find(c => c.id === printInvoiceBtn.dataset.printInvoice);
    if(order) adPrintInvoice(order);
    return;
  }
  const printNoteBtn = e.target.closest('[data-print-note]');
  if(printNoteBtn){
    const order = customers.find(c => c.id === printNoteBtn.dataset.printNote);
    if(order) adPrintShippingLabel(order);
    return;
  }
  const delBtn = e.target.closest('[data-del-order]');
  if(delBtn){
    const id = delBtn.dataset.delOrder;
    const order = customers.find(c => c.id === id);
    if(!order) return;
    askConfirm(t('deleteOrderTemplate').replace('{name}', order.customer_name), async () => {
      const ok = await deleteOrder(id);
      if(!ok) return;
      customers = customers.filter(c => c.id !== id);
      adRenderOrdersPage();
      adRenderDashboardStats();
    });
    return;
  }
  const summary = e.target.closest('.ad-order-summary');
  if(summary && !e.target.closest('.ad-status-select')){
    const id = summary.dataset.toggle;
    adExpandedOrderId = adExpandedOrderId === id ? null : id;
    document.querySelectorAll('.ad-order-card').forEach(card => {
      card.classList.toggle('expanded', card.dataset.id === adExpandedOrderId);
    });
  }
});

/* close status dropdown when clicking outside */
document.addEventListener('click', (e) => {
  if(!e.target.closest('.ad-status-select')){
    document.querySelectorAll('.ad-status-select.open').forEach(w => w.classList.remove('open'));
  }
});


document.getElementById('admin-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  document.getElementById('admin-image-preview').style.display = 'block';
  document.getElementById('admin-image-preview-img').src = URL.createObjectURL(file);
});

document.getElementById('admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if(!form.checkValidity()){ form.reportValidity(); return; }

  const originalCategory = document.getElementById('admin-category').value;
  const idxVal = document.getElementById('admin-idx').value;
  const idx = idxVal === '' ? null : Number(idxVal);
  const newCategory = document.getElementById('admin-cat-select').value;
  const name = document.getElementById('admin-name').value.trim();
  const desc = document.getElementById('admin-desc').value.trim();
  const price = Number(document.getElementById('admin-price').value);
  const familyInput = document.getElementById('admin-family').value.trim();
  const sizeInput = document.getElementById('admin-size').value.trim();
  const notesTop = document.getElementById('admin-notes-top').value.trim();
  const notesHeart = document.getElementById('admin-notes-heart').value.trim();
  const notesBase = document.getElementById('admin-notes-base').value.trim();
  const pinned = document.getElementById('admin-pinned').checked;
  const file = document.getElementById('admin-image').files[0];
  const newImage = await uploadProductImage(file);

  if(idx === null){
    // create new product
    const list = newCategory === 'men' ? men : women;
    list.push({
      name, desc, price,
      family: familyInput || (newCategory === 'men' ? "Homme · Nouveau" : "Femme · Nouveau"),
      reviews: 360, rating: 4.9, tone: 'royal', label: name.split(' ').slice(-1)[0].toUpperCase(),
      size: sizeInput || '100ml · EDP',
      notesTop, notesHeart, notesBase,
      images: newImage ? [newImage] : [],
      cover: 0,
      pinned
    });
  } else {
    const oldList = originalCategory === 'men' ? men : women;
    const product = oldList[idx];
    product.name = name;
    product.desc = desc;
    product.price = price;
    product.family = familyInput || product.family;
    product.size = sizeInput || product.size;
    product.notesTop = notesTop;
    product.notesHeart = notesHeart;
    product.notesBase = notesBase;
    product.pinned = pinned;
    if(newImage){
      const imgs = productImages(product);
      imgs.unshift(newImage);
      product.images = imgs;
      delete product.image;
      product.cover = 0;
    }
    if(newCategory !== originalCategory){
      oldList.splice(idx, 1);
      (newCategory === 'men' ? men : women).push(product);
    }
  }

  await saveCatalog();
  closeAdminModal();
  renderShop(currentFilter, true);
  if(typeof adRenderProductsPage === 'function' && document.getElementById('admin-dashboard-page').classList.contains('open')) adRenderProductsPage();
});

document.addEventListener('click', (e) => {
  const addNew = e.target.closest('#add-new-card');
  if(addNew){
    openAdminModal('create', currentFilter);
    return;
  }
  const editBtn = e.target.closest('.admin-edit-btn');
  if(editBtn){
    openAdminModal('edit', editBtn.dataset.category, Number(editBtn.dataset.idx));
    return;
  }
  const delBtn = e.target.closest('.admin-del-btn');
  if(delBtn){
    const category = delBtn.dataset.category;
    const idx = Number(delBtn.dataset.idx);
    const list = category === 'men' ? men : women;
    askConfirm(t('deleteConfirmTemplate').replace('{name}', list[idx].name), () => {
      const [removedProduct] = list.splice(idx, 1);
      if(removedProduct) productImages(removedProduct).forEach(url => deleteStorageFile('product-images', url));
      saveCatalog();
      renderShop(currentFilter, true);
      if(typeof adRenderProductsPage === 'function' && document.getElementById('admin-dashboard-page').classList.contains('open')) adRenderProductsPage();
    });
  }
});

function askConfirm(message, onConfirm){
  const modal = document.getElementById('confirm-modal');
  const overlay = document.getElementById('confirm-overlay');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  document.getElementById('confirm-text').textContent = message;
  modal.classList.add('open');
  overlay.classList.add('open');
  function cleanup(){
    modal.classList.remove('open');
    overlay.classList.remove('open');
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
    overlay.removeEventListener('click', onCancel);
  }
  function onOk(){ cleanup(); onConfirm(); }
  function onCancel(){ cleanup(); }
  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);
  overlay.addEventListener('click', onCancel);
}

/* ================================================================
   LUXURY MARKETING SECTIONS — additive JS layer.
   Powers: FAQ accordion, newsletter form,
   footer quick links, and the
   4 store-policy modals. Nothing above this point was modified.
   ================================================================ */

/* ---------- FAQ accordion ---------- */
document.querySelectorAll('#faq-list .faq-item').forEach((item) => {
  const question = item.querySelector('.faq-question');
  const answer = item.querySelector('.faq-answer');
  question.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('#faq-list .faq-item.open').forEach((openItem) => {
      if(openItem !== item){
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = null;
      }
    });
    if(isOpen){
      item.classList.remove('open');
      answer.style.maxHeight = null;
    } else {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  });
});

/* ---------- Newsletter ---------- */
const newsletterForm = document.getElementById('newsletter-form');
if(newsletterForm){
  newsletterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newsletter-email');
    const msg = document.getElementById('newsletter-msg');
    const email = input.value.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(!isValid){
      msg.textContent = 'Veuillez entrer une adresse email valide.';
      return;
    }
    try{
      const list = JSON.parse(localStorage.getItem('aura-newsletter-subscribers') || '[]');
      if(!list.includes(email)) list.push(email);
      localStorage.setItem('aura-newsletter-subscribers', JSON.stringify(list));
    }catch(e){}
    msg.textContent = 'Merci ! Vous êtes inscrit(e) à notre newsletter.';
    input.value = '';
  });
}

/* ---------- Footer quick links ---------- */
function scrollToSection(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const footerLinkMen = document.getElementById('footer-link-men');
if(footerLinkMen) footerLinkMen.addEventListener('click', () => {
  const btn = document.querySelector('.sf-btn[data-f="men"]');
  if(btn) btn.click();
  scrollToSection('shop-heading');
});
const footerLinkWomen = document.getElementById('footer-link-women');
if(footerLinkWomen) footerLinkWomen.addEventListener('click', () => {
  const btn = document.querySelector('.sf-btn[data-f="women"]');
  if(btn) btn.click();
  scrollToSection('shop-heading');
});
const footerLinkFaq = document.getElementById('footer-link-faq');
if(footerLinkFaq) footerLinkFaq.addEventListener('click', () => scrollToSection('faq-section'));
const footerLinkContact = document.getElementById('footer-link-contact');
if(footerLinkContact) footerLinkContact.addEventListener('click', () => scrollToSection('contact-section'));

/* ---------- Store policy modals (mirrors the About Us modal pattern) ---------- */
function setupPolicyModal(prefix){
  const modal = document.getElementById(prefix + '-modal');
  const overlay = document.getElementById(prefix + '-overlay');
  const closeBtn = document.getElementById(prefix + '-modal-close');
  const openBtn = document.getElementById('footer-link-' + (prefix === 'privacy' ? 'privacy' : prefix === 'terms' ? 'terms' : prefix === 'shipping' ? 'shipping' : 'returns'));
  if(!modal || !overlay) return;
  function open(){ modal.classList.add('open'); overlay.classList.add('open'); }
  function close(){ modal.classList.remove('open'); overlay.classList.remove('open'); }
  if(openBtn) openBtn.addEventListener('click', open);
  if(closeBtn) closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
}
['privacy', 'terms', 'shipping', 'returns'].forEach(setupPolicyModal);
