import { NextResponse } from 'next/server';
import { db, messaging } from '@/lib/firebase-admin';

export async function POST(request) {
  // Verificación de seguridad
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const now = new Date();
    console.log("🕒 Iniciando proceso de notificaciones:", now.toISOString());

    // 1. Buscar eventos pendientes
    const eventsSnapshot = await db.collectionGroup('events')
    .where('notificationSent', '==', false)
    .orderBy('date')
    .get()

    if (eventsSnapshot.empty) {
      return NextResponse.json({ success: true, message: "No hay eventos pendientes" });
    }

    let notificationsSent = 0;
    const batch = db.batch();

    // 2. Procesar cada evento
    for (const eventDoc of eventsSnapshot.docs) {
      const eventData = eventDoc.data();
      const eventDate = eventData.date.toDate();
      
      // Calcular días restantes
      const diffTime = eventDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

      if (diffDays === eventData.advanceDays) {
        // 3. Obtener tokens FCM del usuario
        const userDoc = await db.doc(`users/${eventData.userId}`).get();
        const tokens = userDoc.data()?.fcmTokens || [];

        // 4. Enviar notificaciones
        const sendPromises = tokens.map(async (token) => {
          try {
            await messaging.send({
              token,
              notification: {
                title: `⏰ Recordatorio: ${eventData.title}`,
                body: eventData.message
              }
            });
            notificationsSent++;
          } catch (error) {
            console.error(`❌ Error enviando a ${token}:`, error.message);
          }
        });

        await Promise.all(sendPromises);
        
        // 5. Marcar evento como notificado
        batch.update(eventDoc.ref, { notificationSent: true });
      }
    }

    // 6. Ejecutar actualizaciones en batch
    await batch.commit();

    return NextResponse.json({
      success: true,
      totalEvents: eventsSnapshot.size,
      notificationsSent
    });

  } catch (error) {
    console.error("🔥 Error crítico:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}