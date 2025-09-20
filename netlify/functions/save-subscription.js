const admin = require('firebase-admin');

// Netlify 환경 변수에서 Firebase 설정 정보 가져오기
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // 중요: 본인의 Firebase Realtime Database URL로 변경하세요!
    databaseURL: "https://eco-vision-db-default-rtdb.firebaseio.com"
  });
}

const db = admin.database();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const subscription = JSON.parse(event.body);
    await db.ref('subscriptions').push(subscription);
    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Subscription saved.' })
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Failed to save subscription.' };
  }
};
