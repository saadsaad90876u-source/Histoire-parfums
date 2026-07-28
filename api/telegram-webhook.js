// api/telegram-webhook.js
// Server-side بالكامل. لا يعتمد على المتصفح، لا JavaScript فالواجهة، لا Session،
// لا Realtime. كل معالجة الزر (تحقق + تحديث DB + تعديل الرسالة + الرد على
// تيليجرام) تتم هنا بالكامل قبل ما نرسل أي HTTP response.

import {
  getSupabaseAdmin,
  statusIndex,
  buildOrderMessage,
  buildOrderKeyboard,
  answerCallback,
  editMessage,
} from '../lib/telegram.js';

export const config = { api: { bodyParser: true }, maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // تحقق سريع من المصدر — هذا رد مبكّر مقبول لأنه لا يوجد أي عمل معلّق بعده
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }

  const update = req.body;
  const cq = update && update.callback_query;

  // ما فيه callback_query (تحديث تيليجرام آخر لا يهمّنا) => لا عمل معلّق
  if (!cq) return res.status(200).json({ ok: true });

  // ---- من هنا: كل الخطوات تُنفَّذ وتُنتظر (await) بالكامل قبل أي رد ----
  let handled = false; // نضمن answerCallback مرة وحدة فقط
  const safeAnswer = async (text, alert = false) => {
    if (handled) return;
    handled = true;
    try {
      await withTimeout(answerCallback(cq.id, text, alert), 8000, 'answerCallback');
    } catch (e) {
      console.error('answerCallback failed:', e);
    }
  };

  try {
    // أمان: فقط صاحب المتجر يتحكم بالأزرار
    if (String(cq.from.id) !== String(process.env.TELEGRAM_CHAT_ID)) {
      await safeAnswer('Non autorisé.', true);
      return res.status(200).json({ ok: true });
    }

    const parts = String(cq.data || '').split(':');
    const action = parts[0];
    const orderId = parts[1];
    const extra = parts[2];

    if (!orderId) {
      await safeAnswer('Requête invalide.', true);
      return res.status(200).json({ ok: true });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: order, error: fetchErr } = await withTimeout(
      supabaseAdmin.from('orders').select('*').eq('id', orderId).single(),
      8000,
      'fetch order'
    );

    if (fetchErr || !order) {
      console.error('order fetch error:', fetchErr);
      await safeAnswer('Commande introuvable.', true);
      return res.status(200).json({ ok: true });
    }

    // قفل نهائي: طلب Livrée أو Annulée لا يقبل أي تعديل
    if (order.status === 'delivered' || order.status === 'cancelled') {
      await safeAnswer('Cette commande est clôturée.', true);
      return res.status(200).json({ ok: true });
    }

    let updatedOrder = order;
    let toastText = '';

    if (action === 'st') {
      const newStatus = extra;
      if (statusIndex(newStatus) <= statusIndex(order.status)) {
        await safeAnswer('Transition non valide.', true);
        return res.status(200).json({ ok: true });
      }
      const { data, error } = await withTimeout(
        supabaseAdmin
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .select()
          .single(),
        8000,
        'update status'
      );
      if (error) throw error;
      updatedOrder = data;
      await withTimeout(
        supabaseAdmin.from('order_status_history').insert({ order_id: orderId, status: newStatus }),
        8000,
        'insert history'
      ).catch((e) => console.error('history insert failed (non-blocking):', e));
      toastText = 'Statut mis à jour ✅';
    } else if (action === 'pay') {
      if (order.is_paid) {
        await safeAnswer('Déjà marqué comme payé.', true);
        return res.status(200).json({ ok: true });
      }
      const { data, error } = await withTimeout(
        supabaseAdmin
          .from('orders')
          .update({ is_paid: true, paid_at: new Date().toISOString() })
          .eq('id', orderId)
          .select()
          .single(),
        8000,
        'update payment'
      );
      if (error) throw error;
      updatedOrder = data;
      toastText = 'Paiement confirmé 💰';
    } else if (action === 'cnl') {
      const { data, error } = await withTimeout(
        supabaseAdmin
          .from('orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .select()
          .single(),
        8000,
        'cancel order'
      );
      if (error) throw error;
      updatedOrder = data;
      await withTimeout(
        supabaseAdmin.from('order_status_history').insert({ order_id: orderId, status: 'cancelled' }),
        8000,
        'insert history'
      ).catch((e) => console.error('history insert failed (non-blocking):', e));
      toastText = 'Commande annulée ❌';
    } else {
      await safeAnswer('Action inconnue.', true);
      return res.status(200).json({ ok: true });
    }

    // قاعدة البيانات تحدّثت بنجاح هنا. دابا نرد على تيليجرام (يوقف Loading)
    // ونعدّل الرسالة — كل واحدة مستقلة، فشل واحدة ما يفشلش الأخرى.
    await safeAnswer(toastText);

    if (updatedOrder.tg_chat_id && updatedOrder.tg_message_id) {
      try {
        const { data: items } = await withTimeout(
          supabaseAdmin.from('order_items').select('*').eq('order_id', orderId),
          8000,
          'fetch items'
        );
        const text = buildOrderMessage(updatedOrder, items || []);
        const keyboard = buildOrderKeyboard(updatedOrder);
        await withTimeout(
          editMessage(updatedOrder.tg_chat_id, updatedOrder.tg_message_id, text, keyboard),
          8000,
          'edit message'
        );
      } catch (e) {
        // تحديث DB نجح أصلاً؛ فشل تعديل الرسالة لا يُعتبر فشل العملية
        console.error('editMessage failed after successful DB update:', e);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('telegram-webhook.js fatal error:', err);
    await safeAnswer('Erreur serveur, réessayez.', true);
    // نرجع 200 دائمًا لتيليجرام حتى لا يعيد المحاولة بلا نهاية على خطأ منطقي
    return res.status(200).json({ ok: false });
  }
}

// يمنع أي استدعاء (Supabase/Telegram) من البقاء معلّقًا للأبد
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
