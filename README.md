# Prestige Forum | 專業論壇系統

這是一個基於 **GitHub Pages** (前端託管) 與 **Firebase** (後端服務) 的專業論壇系統。採用單頁應用 (SPA) 架構，無需伺服器即可運行，並具備完整的會員系統與權限管理。

## ✨ 特色功能

- **專業設計**：黑、白、灰極簡風格，適合專業社群。
- **角色權限**：
  - **訪客**：瀏覽文章、查看留言。
  - **會員**：發布文章、發表留言。
  - **壇主 (Moderator)**：置頂文章、管理文章。
  - **系統管理員 (Admin)**：管理用戶角色、所有文章權限。
- **即時互動**：文章與留言即時更新 (Firestore)。
- **專屬網址**：每篇文章擁有獨立連結 (如 `index.html#post/123`)，方便分享。

## 🚀 快速開始

### 1. 設定 Firebase (後端)

本系統需要連接您的 Firebase 專案才能運作。

1.  前往 [Firebase Console](https://console.firebase.google.com/) 並建立新專案。
2.  **啟用 Authentication (身份驗證)**：
    -   點擊左側選單的 "Authentication" > "Get started"。
    -   在 "Sign-in method" 標籤頁中，啟用 **Email/Password** 提供者。
3.  **建立 Firestore Database (資料庫)**：
    -   點擊左側選單的 "Firestore Database" > "Create database"。
    -   選擇 "Start in **test mode**" (測試模式方便初期開發，之後請參考下方規則設定安全權限)。
    -   選擇伺服器位置 (建議選擇離您最近的地區)。
4.  **獲取設定檔**：
    -   點擊專案設定 (Project Settings) > "General"。
    -   在 "Your apps" 區域，點擊 `</>` 圖示新增 Web App。
    -   複製 `firebaseConfig` 物件的內容。
5.  **填入設定**：
    -   打開本專案中的 `js/firebase-config.js` 檔案。
    -   將複製的內容貼上取代 `const firebaseConfig = { ... }` 中的預設值。

### 2. 設定資料庫規則 (安全性)

為了確保權限管理正常運作，請在 Firebase Console 的 Firestore Database > Rules 標籤頁中，貼上以下規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 用戶資料：任何人可讀取，僅本人可修改
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 文章：任何人可讀取，會員可發布
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      // 修改/刪除：僅作者本人、管理員或壇主可執行
      allow update, delete: if request.auth != null && (
        resource.data.authorId == request.auth.uid || 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'moderator']
      );
      
      // 留言子集合
      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null;
      }
    }
  }
}
```

### 3. 設定管理員權限

系統預設註冊的用戶皆為 `user` (一般會員)。要設定第一位管理員：

1.  在論壇註冊一個帳號。
2.  前往 Firebase Console > Firestore Database。
3.  找到 `users` 集合，找到您剛註冊的用戶 ID 文件。
4.  將 `role` 欄位的值從 `"user"` 修改為 `"admin"`。
5.  重新整理網頁，您將看到「管理後台」選項。

## 📦 部署到 GitHub Pages

1.  將此專案上傳到您的 GitHub Repository。
2.  進入 Repository Settings > **Pages**。
3.  在 "Build and deployment" 下的 Source 選擇 "Deploy from a branch"。
4.  Branch 選擇 `main` (或 master) 並選擇 `/ (root)` 資料夾。
5.  點擊 Save。幾分鐘後，您的論壇就會上線了！

## 🛠 技術棧

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Backend**: Firebase (Authentication, Firestore)
- **Hosting**: GitHub Pages

---
© 2026 Prestige Forum
