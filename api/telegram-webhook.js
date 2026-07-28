// api/telegram-webhook.js
// هذا الملف هو الـ Webhook الذي يستدعيه تيليجرام مباشرة عند ضغط أي زر تحت
// رسالة الطلب. مهمته فقط: التحقق من صحة الطلب، تحديث Supabase.
// تعديل شكل الرسالة في تيليجرام تتم من api/notify.js تلقائيًا (رد فعل على
// تحديث قاعدة البيانات) لتفادي أي تعارض أو ازدواجية.

import { getSupabaseAdmin, statusIndex } from '../lib/telegram.js';
import { answerCallback } from '../lib/telegram.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // تحقق أن الطلب قادم فعلًا من تيليجرام (secret_token تم ضبطه عند setWebhook)
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const update = req.body;
  const cq = update.callback_query;

  // نرد فورًا 200 لتيليجرام حتى لا تتكرر المحاولة، حتى لو حدث خطأ داخلي لاحقًا
  res.status(200).json({ ok: true });

  if (!cq) return;

  try {
    // أمان إضافي: فقط صاحب المتجر (Chat ID المسجّل) يمكنه التحكم بالأزرار
    if (String(cq.from.id) !== String(process.env.TELEGRAM_CHAT_ID)) {
      await answerCallback(cq.id, 'Non autorisé.', true);
      return;
    }

    const [action, orderId, extra] = cq.data.split(':');
    const supabaseAdmin = getSupabaseAdmin();

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      await answerCallback(cq.id, 'Commande introuvable.', true);
      return;
    }

    // قفل نهائي: أي طلب وصل Livrée أو Annulée لا يقبل أي تعديل آخر
    if (order.status === 'delivered' || order.status === 'cancelled') {
      await answerCallback(cq.id, 'Cette commande est clôturée.', true);
      return;
    }

    if (action === 'st') {
      const newStatus = extra;
      // يمنع الرجوع لحالة سابقة أو تكرار نفس الحالة
      if (statusIndex(newStatus) <= statusIndex(order.status)) {
        await answerCallback(cq.id, 'Transition non valide.', true);
        return;
      }
      await supabaseAdmin
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      await supabaseAdmin.from('order_status_history').insert({ order_id: orderId, status: newStatus });
      await answerCallback(cq.id, 'Statut mis à jour ✅');
      return;
    }

    if (action === 'pay') {
      if (order.is_paid) {
        await answerCallback(cq.id, 'Déjà marqué comme payé.', true);
        return;
      }
      await supabaseAdmin
        .from('orders')
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .eq('id', orderId);
      await answerCallback(cq.id, 'Paiement confirmé 💰');
      return;
    }

    if (action === 'cnl') {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderId);
      await supabaseAdmin.from('order_status_history').insert({ order_id: orderId, status: 'cancelled' });
      await answerCallback(cq.id, 'Commande annulée ❌');
      return;
    }

    await answerCallback(cq.id, 'Action inconnue.', true);
  } catch (err) {
    console.error('telegram-webhook.js error:', err);
    try { await answerCallback(cq.id, 'Erreur serveur.', true); } catch (e) {}
  }
}
