//src/app/admin/users/page.jsx
import { db } from '@/lib/firebase-admin';
import UsersClient from './UsersClient';

function formatDate(field) {
  if (field?.toDate) {
    return field.toDate().toISOString().split('T')[0];
  }
  if (typeof field === 'string') {
    return field;
  }
  return '';
}

export default async function UsersPage() {
  const snapshot = await db.collection('users').get();

  const users = snapshot.docs.map(doc => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      fechaSuscripcion: formatDate(data.fechaSuscripcion),
      fechaVencimiento: formatDate(data.fechaVencimiento),
      createdAt: formatDate(data.createdAt),
    };
  });

  return <UsersClient users={users} />;
}
