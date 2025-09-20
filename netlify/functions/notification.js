const admin = require('firebase-admin');
const webpush = require('web-push');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // 중요: 본인의 Firebase Realtime Database URL로 변경하세요!
    databaseURL: "https://eco-vision-db-default-rtdb.firebaseio.com"
  });
}

const db = admin.database();

exports.handler = async () => {
  try {
    webpush.setVapidDetails(
      'mailto:your-email@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const snapshot = await db.ref('subscriptions').once('value');
    const subscriptionsObject = snapshot.val();
    if (!subscriptionsObject) {
      return { statusCode: 200, body: 'No subscriptions to send.' };
    }

    const subscriptions = Object.values(subscriptionsObject);
    const notificationPayload = {
      title: '나의 탄소 오름 🌱',
      body: '오늘 하루, 지구를 위해 어떤 멋진 일을 하셨나요?',
    };

    const promises = subscriptions.map(sub =>
      webpush.sendNotification(sub, JSON.stringify(notificationPayload))
    );
    await Promise.all(promises);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notifications sent successfully.' })
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Failed to send notifications.' };
  }
};
