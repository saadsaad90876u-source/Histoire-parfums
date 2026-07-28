// api/notify.js
// هذا الملف يُستدعى تلقائيًا من Supabase Database Webhooks (Database → Webhooks
// في لوحة Supabase) عند أي INSERT/UPDATE على الجداول orders و reviews.
// هو المصدر الوحيد الذي يرسل/يعدّل رسائل تيليجرام لكل مايخص الطلبات،
// حتى لا تتكرر أو تتعارض الرسائل.

import {
  getSupabaseAdmin,
  buildOrderMessage,
  buildOrderKeyboard,
  fetchOrderItemsWithRetry,
  sendMessage,
  editMessage,
  esc,
} from '../lib/telegram.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // تحقق من أن الطلب قادم فعلًا من Supabase وليس من أي جهة أخرى
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = req.body; // { type, table, record, old_record }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const supabaseAdmin = getSupabaseAdmin();

  try {
    if (payload.table === 'orders') {
      await handleOrderEvent(payload, chatId, supabaseAdmin);
    } else if (payload.table === 'reviews' && payload.type === 'INSERT') {
      await handleNewReview(payload.record, chatId);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify.js error:', err);
    // نرجع 200 حتى لا يعيد Supabase محاولة الإرسال بلا نهاية على خطأ متكرر
    return res.status(200).json({ ok: false, error: String(err) });
  }
}

async function handleOrderEvent(payload, chatId, supabaseAdmin) {
  const order = payload.record;
  const oldOrder = payload.old_record;

  if (payload.type === 'INSERT') {
    // طلب جديد
    const items = await fetchOrderItemsWithRetry(supabaseAdmin, order.id);
    const text = buildOrderMessage(order, items);
    const keyboard = buildOrderKeyboard(order);
    const sent = await sendMessage(chatId, text, keyboard);
    if (sent.ok) {
      // نحفظ معرّف الرسالة حتى نقدر نعدّلها لاحقًا بدل إرسال رسالة جديدة
      await supabaseAdmin
        .from('orders')
        .update({ tg_chat_id: chatId, tg_message_id: sent.result.message_id })
        .eq('id', order.id);
    }
    return;
  }

  if (payload.type === 'UPDATE') {
    // إذا لم نعرف رسالة سابقة لهذا الطلب، لا يوجد شيء لتعديله
    if (!order.tg_chat_id || !order.tg_message_id) return;

    const statusChanged = oldOrder && oldOrder.status !== order.status;
    const paymentChanged = oldOrder && !oldOrder.is_paid && order.is_paid;

    if (!statusChanged && !paymentChanged) return; // تحديث لا يهمّنا (مثلاً تعديل ملاحظة)

    const items = await fetchOrderItemsWithRetry(supabaseAdmin, order.id, 1, 0);
    const text = buildOrderMessage(order, items);
    const keyboard = buildOrderKeyboard(order);
    await editMessage(order.tg_chat_id, order.tg_message_id, text, keyboard);
  }
}

async function handleNewReview(review, chatId) {
  const stars = '⭐'.repeat(Math.max(1, Math.min(5, Number(review.rating) || 0)));
  const text = [
    '💬 <b>NOUVEL AVIS CLIENT</b>',
    '',
    `👤 ${esc(review.customer_name)}`,
    `${stars}`,
    review.product_name ? `🧴 ${esc(review.product_name)}` : null,
    review.comment ? `\n"${esc(review.comment)}"` : null,
    '',
    '⏳ En attente d\'approbation dans le tableau de bord.',
  ]
    .filter(Boolean)
    .join('\n');

  await sendMessage(chatId, text);
}
