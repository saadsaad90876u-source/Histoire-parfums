// lib/telegram.js
// كود مشترك بين api/notify.js و api/telegram-webhook.js
// لا يوجد هنا أي شيء يُرسل للمتصفح — هذا الملف يعمل فقط على السيرفر (Vercel).

import { createClient } from '@supabase/supabase-js';

// ---------- Supabase (service role — يتجاوز RLS، يُستخدم فقط هنا) ----------
export function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// ---------- تسلسل الحالات (يطابق ORDER_STATUSES في script.js) ----------
export const STATUS_FLOW = [
  { key: 'pending',   label: 'En attente',     emoji: '🟡' },
  { key: 'confirmed', label: 'Confirmée',      emoji: '🟢' },
  { key: 'preparing', label: 'En préparation', emoji: '📦' },
  { key: 'shipped',   label: 'Expédiée',       emoji: '🚚' },
  { key: 'delivered', label: 'Livrée',         emoji: '✅' },
];

export function statusIndex(key) {
  return STATUS_FLOW.findIndex((s) => s.key === key);
}

export function statusLabel(key) {
  if (key === 'cancelled') return '❌ Annulée';
  const s = STATUS_FLOW.find((s) => s.key === key);
  return s ? `${s.emoji} ${s.label}` : key;
}

// ---------- Telegram API (fetch بسيط، بدون مكتبات خارجية) ----------
const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function tg(method, payload) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  // "message is not modified" ليس خطأ حقيقيًا — يحدث عند تعديل بنفس المحتوى
  if (!data.ok && !String(data.description || '').includes('message is not modified')) {
    console.error(`Telegram ${method} failed:`, data.description || data);
  }
  return data;
}

export const sendMessage = (chatId, text, replyMarkup) =>
  tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });

export const editMessage = (chatId, messageId, text, replyMarkup) =>
  tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup, // مرّر undefined لإزالة الأزرار نهائيًا
  });

export const answerCallback = (callbackQueryId, text, showAlert = false) =>
  tg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });

// ---------- الهروب من رموز HTML الخاصة قبل إدراجها في الرسالة ----------
export function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDateFR(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return iso || '';
  }
}

// ---------- بناء نص رسالة الطلب (تُستخدم عند الإنشاء وعند كل تعديل) ----------
export function buildOrderMessage(order, items) {
  const title =
    order.status === 'cancelled'
      ? '❌ <b>COMMANDE ANNULÉE</b>'
      : order.status === 'delivered'
      ? '✅ <b>COMMANDE LIVRÉE</b>'
      : '🆕 <b>NOUVELLE COMMANDE</b>';

  const itemsLines = (items || [])
    .map((i) => `• ${esc(i.product_name)} × ${i.quantity} — ${Number(i.subtotal).toFixed(2)} MAD`)
    .join('\n') || '—';

  const paymentLabel = order.payment_method === 'cod' ? 'Paiement à la livraison (COD)' : esc(order.payment_method || '—');
  const paidLine = order.is_paid ? '\n💰 <b>Paiement encaissé ✅</b>' : '';

  const lines = [
    title,
    '',
    `📋 N° <b>${esc(order.order_number)}</b>`,
    `👤 ${esc(order.customer_name)}`,
    `📱 ${esc(order.customer_phone)}`,
    `📍 ${esc(order.customer_address)}, ${esc(order.customer_city)}`,
    '',
    '🛍 <b>Articles :</b>',
    itemsLines,
    '',
    `💵 Sous-total : ${Number(order.subtotal).toFixed(2)} MAD`,
    `🚚 Livraison : ${Number(order.shipping_fee).toFixed(2)} MAD`,
  ];
  if (order.discount) lines.push(`🏷 Réduction : -${Number(order.discount).toFixed(2)} MAD`);
  lines.push(`💳 Paiement : ${paymentLabel}${paidLine}`);
  lines.push(`🕐 ${formatDateFR(order.created_at)}`);
  lines.push('');
  lines.push(`📊 Statut : <b>${statusLabel(order.status)}</b>`);

  return lines.join('\n');
}

// ---------- بناء لوحة الأزرار حسب الحالة الحالية (يمنع الرجوع للخلف، يقفل بعد Livrée) ----------
export function buildOrderKeyboard(order) {
  // حالة نهائية (تسليم أو إلغاء) => بدون أي أزرار = قفل نهائي
  if (order.status === 'delivered' || order.status === 'cancelled') return undefined;

  const idx = statusIndex(order.status);
  const nextStatuses = STATUS_FLOW.filter((_, i) => i > idx);

  const rows = [];
  for (let i = 0; i < nextStatuses.length; i += 2) {
    rows.push(
      nextStatuses.slice(i, i + 2).map((s) => ({
        text: `${s.emoji} ${s.label}`,
        callback_data: `st:${order.id}:${s.key}`,
      }))
    );
  }

  const actionRow = [];
  if (!order.is_paid) {
    actionRow.push({ text: '💰 Confirmer le paiement', callback_data: `pay:${order.id}` });
  }
  actionRow.push({ text: '❌ Annuler la commande', callback_data: `cnl:${order.id}` });
  rows.push(actionRow);

  return { inline_keyboard: rows };
}

// ---------- جلب عناصر الطلب مع إعادة محاولة قصيرة ----------
// (order_items تُدرج بعد orders ببضع مللي ثانية في createOrder، لذلك webhook
// الخاص بـ INSERT على orders قد يسبقها — نعيد المحاولة بدل الفشل)
export async function fetchOrderItemsWithRetry(supabaseAdmin, orderId, attempts = 4, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabaseAdmin.from('order_items').select('*').eq('order_id', orderId);
    if (data && data.length) return data;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return [];
}
