import { db, messaging } from '../../../../lib/firebase-admin';

export default async function handler(req, res) {
  // Verificación de seguridad
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const now = new Date();
    console.log(`🔍 Iniciando búsqueda de eventos - ${now.toISOString()}`);

    // Busca eventos que necesitan notificación
    const eventsSnapshot = await db.collectionGroup('events')
      .where('notificationSent', '==', false)
      .get();

    if (eventsSnapshot.empty) {
      console.log('No hay eventos pendientes de notificación');
      return res.status(200).json({ success: true, message: 'No hay eventos pendientes' });
    }

    const batch = db.batch();
    const notifications = [];

    for (const doc of eventsSnapshot.docs) {
      const event = doc.data();
      const eventDate = event.date.toDate();
      const daysBefore = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));

      if (daysBefore === event.advanceDays) {
        console.log(`📌 Evento encontrado para notificar: ${event.title}`);

        // Obtener tokens FCM del usuario
        const userRef = db.doc(`users/${event.userId}`);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
          console.warn(`Usuario ${event.userId} no encontrado`);
          continue;
        }

        const tokens = userDoc.data().fcmTokens || [];
        
        if (tokens.length === 0) {
          console.warn(`No hay tokens FCM para el usuario ${event.userId}`);
          continue;
        }

        // Preparar notificaciones
        for (const token of tokens) {
          notifications.push(
            messaging.sendToDevice(token, {
              notification: {
                title: `⏰ Recordatorio: ${event.title}`,
                body: event.message,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
              },
              data: {
                eventId: doc.id,
                type: 'event_reminder'
              }
            })
          );
        }

        // Marcar evento como notificado
        batch.update(doc.ref, { notificationSent: true });
      }
    }

    // Enviar todas las notificaciones
    const results = await Promise.allSettled(notifications);
    await batch.commit();

    const summary = {
      totalEvents: eventsSnapshot.size,
      notificationsSent: results.filter(r => r.status === 'fulfilled').length,
      failures: results.filter(r => r.status === 'rejected').length
    };

    console.log('✅ Proceso completado:', summary);
    res.status(200).json({ success: true, summary });
    
  } catch (error) {
    console.error('❌ Error en el proceso de notificación:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
}