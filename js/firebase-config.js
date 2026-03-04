// ------------------------------------------------------------------
// FIREBASE 配置檔案
// 請將此檔案中的內容替換為您從 Firebase 控制台獲得的配置
// ------------------------------------------------------------------

// 1. 前往 https://console.firebase.google.com/
// 2. 建立新專案
// 3. 在專案設定中，選擇 "Web" 應用程式 (</>)
// 4. 複製 firebaseConfig 物件並貼上到下方

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// 為了方便除錯，如果使用者尚未設定，我們會給予提示
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn("Firebase 尚未設定！請編輯 js/firebase-config.js");
    window.isConfigured = false;
} else {
    window.isConfigured = true;
    // 初始化 Firebase
    firebase.initializeApp(firebaseConfig);
    // 初始化 Firestore
    const db = firebase.firestore();
    const auth = firebase.auth();
}
