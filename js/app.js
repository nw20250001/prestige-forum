// ------------------------------------------------------------------
// APP 邏輯核心
// ------------------------------------------------------------------

// State Management
const appState = {
    user: null,
    userProfile: null,
    role: 'guest', // guest, user, moderator, admin
    currentRoute: '',
    params: {},
    openTabs: JSON.parse(localStorage.getItem('openTabs')) || [], // { name: 'tagName', route: '#tag/tagName' }
    initialRouteProcessed: false,
};

// Ensure "技術論壇" and "產品論壇" are restored if missing
if (!appState.openTabs.some(t => t.name === '技術論壇')) {
    appState.openTabs.push({ name: '技術論壇', route: '#tag/技術論壇' });
}
if (!appState.openTabs.some(t => t.name === '產品論壇')) {
    appState.openTabs.push({ name: '產品論壇', route: '#tag/產品論壇' });
}
localStorage.setItem('openTabs', JSON.stringify(appState.openTabs));

// DOM Elements
const appContainer = document.getElementById('app');
const navLinksContainer = document.getElementById('nav-links');
const authButtonsContainer = document.getElementById('auth-buttons');

// ------------------------------------------------------------------
// 1. 初始化與路由
// ------------------------------------------------------------------

function init() {
    if (!window.isConfigured) {
        renderConfigError();
        return;
    }

    // 監聽 Auth 狀態
    firebase.auth().onAuthStateChanged(async (user) => {
        appState.user = user;
        try {
            if (user) {
                const db = firebase.firestore();
                const userRef = db.collection('users').doc(user.uid);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    appState.role = userDoc.data().role || 'user';
                    appState.userProfile = userDoc.data();
                } else {
                    const role = user.email === 'istage.eason@gmail.com' ? 'admin' : 'user';
                    const profile = {
                        email: user.email,
                        role,
                        canPost: true,
                        canComment: true,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (user.displayName) profile.nickname = user.displayName;
                    await userRef.set(profile, { merge: true });
                    appState.role = role;
                    appState.userProfile = profile;
                }
            } else {
                appState.role = 'guest';
                appState.userProfile = null;
            }
        } catch (error) {
            console.error(error);
            if (user) {
                appState.role = 'user';
                appState.userProfile = {
                    email: user.email,
                    nickname: user.displayName || null
                };
            } else {
                appState.role = 'guest';
                appState.userProfile = null;
            }
        } finally {
            renderNav();
            handleRoute(); // 重新渲染當前頁面
        }
    });

    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // 初始加載
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const [route, ...args] = hash.split('/');
    
    appState.currentRoute = route;
    appState.params = args;
    const isFirst = !appState.initialRouteProcessed;
    appState.initialRouteProcessed = true;
    if (isFirst && (route === 'login' || route === 'register')) {
        window.location.hash = '/';
        return;
    }

    renderNav(); // Update navigation active state

    // 清空容器
    appContainer.innerHTML = '';
    appContainer.className = "flex-grow mx-auto py-8 w-[94%] fade-in";

    switch (route) {
        case '':
        case '/':
            renderHome();
            break;
        case 'tag':
            const tagName = decodeURIComponent(args[0] || '');
            if (tagName) renderHome(tagName);
            else window.location.hash = '/';
            break;
        case 'post':
            const postId = args[0];
            if (postId) renderPost(postId);
            else window.location.hash = '/';
            break;
        case 'my-posts':
            if (!appState.user) {
                if (isFirst) {
                    window.location.hash = '/';
                    return;
                } else {
                    window.location.hash = '#login';
                    return;
                }
            }
            renderHome(null, appState.user.uid);
            break;
        case 'login':
            renderLogin();
            break;
        case 'register':
            renderRegister(); // 這裡我們共用 Login 頁面，只是 UI 不同
            break;
        case 'create':
            if (!appState.user) {
                if (isFirst) {
                    window.location.hash = '/';
                    return;
                } else {
                    window.location.hash = '#login';
                    return;
                }
            }
            renderCreatePost();
            break;
        case 'edit':
            const editPostId = args[0];
            if (editPostId) renderEditPost(editPostId);
            else window.location.hash = '/';
            break;
        case 'admin':
            if (appState.role !== 'admin') {
                window.location.hash = '/';
                alert('權限不足');
                return;
            }
            renderAdminDashboard();
            break;
        default:
            render404();
    }
}

// ------------------------------------------------------------------
// 2. 視圖渲染 (Views)
// ------------------------------------------------------------------

// --- 導航欄 ---
function renderNav() {
    const current = appState.currentRoute || '';
    // Home route can be '' or '/' depending on how hash is parsed
    const isHome = current === '' || current === '/' || current === '#/';
    const isCreate = current === 'create';
    const isMyPosts = current === 'my-posts';
    const isAdmin = current === 'admin';

    // Styles
    const baseClass = "inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border transition-colors duration-200";
    // Active: Bold text, rectangular dark gray border
    const activeClass = "border-gray-600 text-gray-900 font-bold bg-gray-50"; 
    // Inactive: Transparent border, gray text
    const inactiveClass = "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50";
    const adminInactiveClass = "border-transparent text-red-500 hover:text-red-700 hover:bg-red-50";

    let linksHtml = `
        <a href="#/" class="${baseClass} ${isHome ? activeClass : inactiveClass}">首頁</a>
    `;

    appState.openTabs?.forEach(tab => {
        const isActive = current === 'tag' && decodeURIComponent(appState.params[0] || '') === tab.name;
        linksHtml += `<a href="#tag/${encodeURIComponent(tab.name)}" ondblclick="editTagTab('${tab.name}')" class="${baseClass} ${isActive ? activeClass : inactiveClass}">${tab.name}</a>`;
    });

    if (appState.user && (appState.role === 'admin' || appState.role === 'moderator')) {
        linksHtml += `
            <button onclick="addNewTagTab()" class="${baseClass} ${inactiveClass} font-bold text-lg" title="新增標籤分頁">+</button>
        `;
    }

    if (appState.user) {
        linksHtml += `
            <a href="#my-posts" class="${baseClass} ${isMyPosts ? activeClass : inactiveClass}">歷史文章</a>
        `;
        if (appState.role === 'admin') {
            linksHtml += `
                <a href="#admin" class="${baseClass} ${isAdmin ? activeClass : adminInactiveClass}">管理後台</a>
            `;
        }
    }

    navLinksContainer.innerHTML = linksHtml;

    if (appState.user) {
        ensureProfileModal();
        const nickname = getCurrentNickname();
        const avatarSrc = getCurrentAvatarSrc();
        const avatarInner = avatarSrc
            ? `<img src="${avatarSrc}" alt="avatar" class="h-9 w-9 rounded-full object-cover">`
            : `<div class="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">${nickname ? nickname[0].toUpperCase() : 'U'}</div>`;
        authButtonsContainer.innerHTML = `
            <span class="text-sm text-gray-500 mr-1">嗨, ${nickname}</span>
            <button onclick="openProfileModal()" class="flex items-center" aria-label="大頭照">${avatarInner}</button>
            <button onclick="logout()" class="text-sm text-gray-700 hover:text-black font-medium">登出</button>
        `;
    } else {
        authButtonsContainer.innerHTML = `
            <a href="#login" class="text-sm text-gray-700 hover:text-black font-medium mr-4">登入</a>
            <a href="#register" class="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition">註冊</a>
        `;
    }
}

function openCreatePostPopup() {
    const w = Math.floor((window.screen?.availWidth || window.innerWidth || 1200) * 0.8);
    const h = Math.floor((window.screen?.availHeight || window.innerHeight || 800) * 0.8);
    const left = Math.floor(((window.screen?.availWidth || window.innerWidth || 1200) - w) / 2);
    const top = Math.floor(((window.screen?.availHeight || window.innerHeight || 800) - h) / 2);
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#create`;
    const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    const win = window.open(url, 'create-post', features);
    if (win) {
        win.focus();
        return;
    }
    window.location.hash = '#create';
}

function addNewTagTab() {
    openTagModal();
}

function ensureTagModal() {
    if (document.getElementById('tag-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'tag-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-lg shadow-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">新增標籤分頁</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-700 mb-1">標籤名稱</label>
                    <input id="new-tag-name" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="輸入標籤名稱" onkeydown="if(event.key === 'Enter') submitNewTag()">
                </div>
                <div class="flex justify-end space-x-2">
                    <button onclick="closeTagModal()" class="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100">取消</button>
                    <button onclick="submitNewTag()" class="px-4 py-2 rounded bg-black text-white hover:bg-gray-800">新增</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openTagModal() {
    ensureTagModal();
    const modal = document.getElementById('tag-modal');
    const input = document.getElementById('new-tag-name');
    input.value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => input.focus(), 100);
}

function closeTagModal() {
    const modal = document.getElementById('tag-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function submitNewTag() {
    const input = document.getElementById('new-tag-name');
    const tagName = input.value;
    
    if (tagName && tagName.trim()) {
        const cleanName = tagName.trim();
        // Check if tab already exists
        const exists = appState.openTabs.find(t => t.name === cleanName);
        if (!exists) {
            appState.openTabs.push({ 
                name: cleanName, 
                route: `#tag/${encodeURIComponent(cleanName)}` 
            });
            localStorage.setItem('openTabs', JSON.stringify(appState.openTabs));
        }
        window.location.hash = `#tag/${encodeURIComponent(cleanName)}`;
        renderNav(); 
        closeTagModal();
    } else {
        alert('請輸入標籤名稱');
    }
}

// --- Edit Tag Modal ---
let currentEditingTagName = null;

function editTagTab(tagName) {
    if (!appState.user) return;
    currentEditingTagName = tagName;
    ensureEditTagModal();
    const modal = document.getElementById('edit-tag-modal');
    const input = document.getElementById('edit-tag-name');
    input.value = tagName;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => input.focus(), 100);
}

function ensureEditTagModal() {
    if (document.getElementById('edit-tag-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'edit-tag-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-lg shadow-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">編輯標籤名稱</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-700 mb-1">新的標籤名稱</label>
                    <input id="edit-tag-name" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="輸入標籤名稱" onkeydown="if(event.key === 'Enter') submitEditTag()">
                </div>
                <div class="flex justify-end space-x-2">
                    <button onclick="closeEditTagModal()" class="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100">取消</button>
                    <button onclick="submitEditTag()" class="px-4 py-2 rounded bg-black text-white hover:bg-gray-800">儲存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeEditTagModal() {
    const modal = document.getElementById('edit-tag-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentEditingTagName = null;
}

async function submitEditTag() {
    const input = document.getElementById('edit-tag-name');
    const newName = input.value.trim();
    
    if (!newName) {
        alert('請輸入標籤名稱');
        return;
    }
    
    if (newName === currentEditingTagName) {
        closeEditTagModal();
        return;
    }

    // Check if new name already exists
    if (appState.openTabs.some(t => t.name === newName)) {
        alert('此標籤名稱已存在');
        return;
    }

    try {
        // 1. Update appState
        const tabIndex = appState.openTabs.findIndex(t => t.name === currentEditingTagName);
        if (tabIndex !== -1) {
            appState.openTabs[tabIndex].name = newName;
            appState.openTabs[tabIndex].route = `#tag/${encodeURIComponent(newName)}`;
            localStorage.setItem('openTabs', JSON.stringify(appState.openTabs));
        }

        // 2. Update Firestore posts (Batch update)
        // Note: This is a heavy operation if there are many posts. 
        // For a prototype, we'll do a client-side query and batch write.
        const db = firebase.firestore();
        const batch = db.batch();
        const snapshot = await db.collection('posts').where('tag', '==', currentEditingTagName).get();
        
        let count = 0;
        snapshot.forEach(doc => {
            batch.update(doc.ref, { tag: newName });
            count++;
        });

        if (count > 0) {
            await batch.commit();
        }

        // 3. Update UI
        closeEditTagModal();
        
        // If we are currently on the old tag page, redirect to new one
        if (appState.currentRoute === 'tag' && decodeURIComponent(appState.params[0]) === currentEditingTagName) {
             window.location.hash = `#tag/${encodeURIComponent(newName)}`;
        } else {
             renderNav();
        }
        
        // If we are on home page or other list pages, we might need to refresh if the list shows tags
        if (appState.currentRoute === '' || appState.currentRoute === '/') {
            renderHome();
        }

    } catch (error) {
        console.error('Error renaming tag:', error);
        alert('更新標籤失敗: ' + error.message);
    }
}


// --- 首頁 (文章列表) ---
async function renderHome(tagName = null, userId = null) {
    let title = '最新文章';
    if (tagName) title = `${tagName}`;
    if (userId) title = '歷史文章';

    appContainer.innerHTML = `
        <div class="sticky top-0 z-30 bg-white flex justify-between items-center py-3 mb-2 border-b border-gray-100">
            <h1 class="text-3xl font-bold text-gray-900">${title}</h1>
            ${(appState.user && appState.userProfile?.canPost !== false) ? `<button onclick="openCreatePostModal()" class="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">撰寫新文章</button>` : ''}
        </div>
        <div class="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-100">
            <div class="overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table class="min-w-[1100px] w-full text-xs">
                    <thead class="bg-gray-50 text-gray-600 text-xs sticky top-0 z-20">
                        <tr>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">序號</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">暱稱</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">標題圖片</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">日期時間</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">標籤</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">標題</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">說明</th>
                            <th class="text-right font-medium px-4 py-3 whitespace-nowrap">點擊數</th>
                            <th class="text-right font-medium px-4 py-3 whitespace-nowrap">留言數</th>
                            <th class="text-right font-medium px-4 py-3 whitespace-nowrap">評分</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">連結</th>
                        </tr>
                    </thead>
                    <tbody id="posts-list" class="divide-y divide-gray-100">
                        <tr>
                            <td class="px-4 py-8 text-center text-gray-500" colspan="11">
                                <div class="flex items-center justify-center space-x-3">
                                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                                    <span>載入文章中...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    try {
        const snapshot = await firebase.firestore().collection('posts').orderBy('createdAt', 'desc').get();
        const listContainer = document.getElementById('posts-list');
        
        listContainer.innerHTML = '';
        const posts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            let match = true;
            if (tagName && data.tag !== tagName) match = false;
            if (userId && data.authorId !== userId) match = false;
            
            if (match) {
                posts.push({ id: doc.id, ...data });
            }
        });

        if (posts.length === 0) {
            listContainer.innerHTML = `<tr><td class="px-4 py-10 text-center text-gray-500" colspan="11">目前沒有文章。</td></tr>`;
            return;
        }

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const dateTime = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : '剛剛';
            const summaryRaw = post.contentFormat === 'html'
                ? htmlToText((post.content || '').toString())
                : (post.content || '').toString();
            const summary = summaryRaw.length > 60 ? summaryRaw.substring(0, 60) + '...' : summaryRaw;
            const viewCount = Number.isFinite(post.viewCount) ? post.viewCount : 0;
            const ratingAvgStr = Number.isFinite(post.ratingAvg) && post.ratingAvg > 0 ? post.ratingAvg.toFixed(1) : '-';
            const ratingCountNum = Number.isFinite(post.ratingCount) && post.ratingCount > 0 ? post.ratingCount : 0;
            const ratingDisplay = `${ratingAvgStr}/${ratingCountNum}`;
            
            // Author Avatar Logic
            const authorName = (post.authorName || '未知').toString();
            const authorAvatarRaw = (post.authorAvatarDataUrl || '').toString();
            const authorInitial = authorName[0] ? authorName[0].toUpperCase() : 'U';
            const authorAvatarHtml = authorAvatarRaw
                ? `<img src="${authorAvatarRaw}" alt="${authorName}" class="h-8 w-8 rounded-full object-cover border border-gray-200 mr-2 flex-shrink-0">`
                : `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 mr-2 flex-shrink-0">${authorInitial}</div>`;

            const authorLabel = (post.authorName || post.authorEmail || 'U').toString();
            const fallback = authorLabel[0] ? authorLabel[0].toUpperCase() : 'U';
            const imgSrc = (post.imageDataUrl || post.authorAvatarDataUrl || '').toString();
            const imgContent = imgSrc
                ? `<img src="${imgSrc}" alt="img" class="h-10 w-[60px] rounded object-cover border border-gray-200">`
                : `<div class="h-10 w-[60px] rounded bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">${fallback}</div>`;
            const imgHtml = `<a href="#post/${post.id}" class="block hover:opacity-80 transition">${imgContent}</a>`;
            listContainer.innerHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-gray-700">${i + 1}</td>
                    <td class="px-4 py-3">
                        <div class="flex items-center">
                            ${authorAvatarHtml}
                            <span class="text-gray-900 font-medium truncate max-w-[120px]" title="${authorName}">${authorName}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3">${imgHtml}</td>
                    <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${dateTime}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            ${post.tag || '無'}
                        </span>
                    </td>
                    <td class="px-4 py-3">
                        <a href="#post/${post.id}" class="block hover:underline">
                            <div class="font-medium text-gray-900 truncate max-w-[220px]">${post.title || ''}</div>
                        </a>
                    </td>
                    <td class="px-4 py-3 text-gray-600">
                        <div class="truncate max-w-[420px]">${summary}</div>
                    </td>
                    <td class="px-4 py-3 text-right text-gray-700 tabular-nums">${viewCount}</td>
                    <td class="px-4 py-3 text-right text-gray-700 tabular-nums" id="post-comment-count-${post.id}">-</td>
                    <td class="px-4 py-3 text-right text-gray-700 tabular-nums">${ratingDisplay}</td>
                    <td class="px-4 py-3">
                        <div class="flex items-center space-x-3">
                            <a class="text-indigo-600 hover:text-indigo-500 font-medium" href="#post/${post.id}">開啟</a>
                            ${(appState.role === 'admin' || appState.role === 'moderator' || (appState.user && appState.user.uid === post.authorId)) ? 
                                `<a href="#edit/${post.id}" class="text-blue-600 hover:text-blue-800 font-medium text-xs">編輯</a>
                                 <button onclick="deletePost('${post.id}')" class="text-red-600 hover:text-red-800 font-medium text-xs">刪除</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }
        loadPostCommentCounts(posts.map(p => p.id));
    } catch (error) {
        console.error("Error fetching posts:", error);
        document.getElementById('posts-list').innerHTML = `<tr><td class="px-4 py-10 text-center text-red-500" colspan="11">載入失敗: ${error.message}</td></tr>`;
    }
}

async function loadPostCommentCounts(ids) {
    try {
        const db = firebase.firestore();
        for (const postId of ids) {
            const snap = await db.collection('posts').doc(postId).collection('comments').get();
            let count = 0;
            snap.forEach(d => {
                const c = d.data();
                const deletedByRole = c.deletedByRole || null;
                const excluded = c.deletedAt && (deletedByRole === 'admin' || deletedByRole === 'moderator');
                if (!excluded) count += 1;
            });
            const cell = document.getElementById(`post-comment-count-${postId}`);
            if (cell) cell.textContent = String(count);
        }
    } catch (e) {
        // ignore
    }
}

async function incrementPostViewCount(postId) {
    try {
        const now = Date.now();
        if (appState.lastViewedPostId === postId && now - (appState.lastViewedPostAt || 0) < 30000) return;
        appState.lastViewedPostId = postId;
        appState.lastViewedPostAt = now;
        const db = firebase.firestore();
        await db.runTransaction(async (tx) => {
            const ref = db.collection('posts').doc(postId);
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const data = snap.data() || {};
            const current = Number.isFinite(data.viewCount) ? data.viewCount : 0;
            tx.update(ref, { viewCount: current + 1 });
        });
    } catch (e) {
        // ignore
    }
}

// --- 文章詳情 ---
async function renderPost(postId) {
    appContainer.innerHTML = `
        <div class="w-full">
            <div id="post-content" class="bg-white shadow overflow-hidden sm:rounded-lg mb-8 p-6 min-h-[300px]">
                <div class="animate-pulse space-y-4">
                    <div class="h-8 bg-gray-200 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div class="space-y-2 mt-8">
                        <div class="h-4 bg-gray-200 rounded"></div>
                        <div class="h-4 bg-gray-200 rounded"></div>
                        <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
            
            <div class="border-t border-gray-200 pt-8">
                <!-- Rating Section -->
                <div class="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-100">
                    <h3 class="text-lg font-medium text-gray-900 mb-2">文章評分</h3>
                    <div class="flex items-center space-x-2">
                        <div id="post-rating-stars" class="flex space-x-1 cursor-pointer">
                            <!-- Stars injected by JS -->
                        </div>
                        <span id="post-rating-text" class="text-sm text-gray-500 ml-2"></span>
                    </div>
                    <p id="post-rating-msg" class="text-xs text-gray-400 mt-2"></p>
                </div>

                <h3 class="text-lg font-medium text-gray-900 mb-4">留言區</h3>
                ${appState.user 
                    ? (appState.userProfile?.canComment !== false
                        ? `<div class="mb-6">
                            <textarea id="comment-input" rows="3" class="shadow-sm focus:ring-black focus:border-black block w-full sm:text-sm border-gray-300 rounded-md p-2 border" placeholder="分享你的想法..."></textarea>
                            <div class="mt-2 flex justify-end">
                                <button onclick="submitComment('${postId}')" class="bg-black text-white px-4 py-2 rounded text-sm hover:bg-gray-800">發送留言</button>
                            </div>
                           </div>`
                        : `<div class="bg-gray-50 p-4 rounded text-center text-gray-500 mb-6">您沒有留言權限</div>`)
                    : `<div class="bg-gray-50 p-4 rounded text-center text-gray-500 mb-6">請 <a href="#login" class="text-black underline">登入</a> 以參與討論</div>`
                }
                <div id="comments-list" class="space-y-4">
                    <!-- Comments injected here -->
                </div>
            </div>
        </div>
    `;

    try {
        const postRef = firebase.firestore().collection('posts').doc(postId);
        const doc = await postRef.get();
        if (!doc.exists) {
            appContainer.innerHTML = `<div class="text-center py-12"><h2 class="text-2xl font-bold">文章不存在</h2><a href="#/" class="text-blue-500 mt-4 block">返回首頁</a></div>`;
            return;
        }

        const post = doc.data();
        incrementPostViewCount(postId);
        const date = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : '未知時間';
        
        const contentHtml = post.contentFormat === 'html'
            ? sanitizeHtml((post.content || '').toString())
            : escapeHtml((post.content || '').toString()).replace(/\n/g, '<br>');
        const shareUrl = window.location.origin + '/#post/' + postId;
        const safeTitle = (post.title || '').replace(/["']/g, '');
        const encUrl = encodeURIComponent(shareUrl);
        const encTitle = encodeURIComponent(post.title || '');
        const encText = encodeURIComponent((post.title || '') + ' ' + shareUrl);
        
        // Action buttons for author/admin
        let actionButtons = '';
        if (appState.user && (appState.user.uid === post.authorId || appState.role === 'admin' || appState.role === 'moderator')) {
            actionButtons = `
                <div class="flex space-x-2 mt-4 pt-4 border-t border-gray-100">
                    ${(appState.role === 'admin' || appState.role === 'moderator') ? `<button onclick="togglePin('${postId}', ${!post.pinned})" class="text-xs text-blue-600 hover:text-blue-800">${post.pinned ? '取消置頂' : '置頂文章'}</button>` : ''}
                    <button onclick="deletePost('${postId}')" class="text-xs text-red-600 hover:text-red-800">刪除文章</button>
                </div>
            `;
        }

        // Store post context for comments avatar fallback
        appState.postContext = {
            uid: post.authorId,
            avatarUrl: post.authorAvatarDataUrl || post.authorPhotoURL
        };

        const authorAvatarUrl = post.authorAvatarDataUrl || post.authorPhotoURL;

        document.getElementById('post-content').innerHTML = `
            <div class="mb-6">
                <h1 class="text-3xl font-bold text-gray-900 mb-2">${post.title}</h1>
                <div class="flex items-center justify-between text-sm text-gray-500">
                    <div class="flex items-center">
                        ${authorAvatarUrl 
                            ? `<img src="${authorAvatarUrl}" class="h-8 w-8 rounded-full object-cover mr-2">`
                            : `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 mr-2">${(post.authorName || post.authorEmail || 'U')[0].toUpperCase()}</div>`
                        }
                        <span class="font-medium text-gray-900 mr-2">${post.authorName || post.authorEmail.split('@')[0]}</span>
                        <span>• ${date}</span>
                    </div>
                    <div class="relative">
                        <button onclick="shareNative('${postId}','${safeTitle}')" class="px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">分享</button>
                        <div id="share-menu-${postId}" class="hidden absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg p-2 z-10">
                            <a class="block px-3 py-2 hover:bg-gray-50 rounded" target="_blank" rel="noopener" href="https://social-plugins.line.me/lineit/share?url=${encUrl}">LINE</a>
                            <a class="block px-3 py-2 hover:bg-gray-50 rounded" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encUrl}">Facebook</a>
                            <a class="block px-3 py-2 hover:bg-gray-50 rounded" target="_blank" rel="noopener" href="https://www.threads.net/intent/post?text=${encText}">Threads</a>
                            <a class="block px-3 py-2 hover:bg-gray-50 rounded" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}">Twitter</a>
                            <a class="block px-3 py-2 hover:bg-gray-50 rounded" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&su=${encTitle}&body=${encUrl}">Gmail</a>
                            <button class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded" onclick="copyShareLink('${shareUrl}')">複製連結</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="prose max-w-none text-gray-800 leading-relaxed">
                ${contentHtml}
            </div>
            ${actionButtons}
        `;

        // Load Comments
        loadComments(postId);
        
        // Load Rating
        loadRating(postId, post.authorId);

    } catch (error) {
        console.error(error);
        appContainer.innerHTML = `<div class="text-center text-red-500 py-12">載入錯誤</div>`;
    }
}

async function loadComments(postId) {
    const commentsList = document.getElementById('comments-list');
    const snapshot = await firebase.firestore().collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
        commentsList.innerHTML = `<p class="text-gray-400 text-sm text-center">暫無留言，成為第一個留言的人吧！</p>`;
        return;
    }

    commentsList.innerHTML = '';
    
    appState.avatarCache = appState.avatarCache || {};
    appState.userDisplayNameCache = appState.userDisplayNameCache || {};
    let commentsHtml = '';

    const getDisplayNameForUid = async (uid) => {
        if (!uid) return '';
        if (appState.userDisplayNameCache[uid]) return appState.userDisplayNameCache[uid];
        if (appState.user && uid === appState.user.uid) {
            const me = getCurrentNickname();
            if (me) {
                appState.userDisplayNameCache[uid] = me;
                return me;
            }
        }
        try {
            const userDoc = await firebase.firestore().collection('users').doc(uid).get();
            if (!userDoc.exists) return uid.slice(0, 6);
            const userData = userDoc.data() || {};
            const name = userData.nickname || (userData.email ? userData.email.split('@')[0] : '') || uid.slice(0, 6);
            appState.userDisplayNameCache[uid] = name;
            if (userData.email) appState.userDisplayNameCache[userData.email] = name;
            return name;
        } catch {
            return uid.slice(0, 6);
        }
    };

    for (const doc of snapshot.docs) {
        const comment = doc.data();
        const date = comment.createdAt ? new Date(comment.createdAt.seconds * 1000).toLocaleString() : '剛剛';
        const canDelete = appState.user && !comment.deletedAt && (appState.user.uid === comment.authorId || appState.role === 'admin' || appState.role === 'moderator');
        const deletedLabel = comment.deletedAt ? '此留言已被刪除' : '';
        const likeCount = comment.likeCount || 0;
        const isLiked = appState.user && (comment.likedBy || []).includes(appState.user.uid);
        const likedBy = Array.isArray(comment.likedBy) ? comment.likedBy : [];
        
        let avatarUrl = comment.authorAvatarDataUrl || comment.authorPhotoURL;
        if (!avatarUrl && appState.user && comment.authorId === appState.user.uid) {
             avatarUrl = appState.userProfile?.avatarDataUrl || appState.user.photoURL;
        }
        if (!avatarUrl && appState.postContext && comment.authorId === appState.postContext.uid) {
            avatarUrl = appState.postContext.avatarUrl;
        }
        
        // Fetch missing avatar
        if (!avatarUrl) {
            // 1. Check ID Cache
            if (comment.authorId && appState.avatarCache[comment.authorId]) {
                avatarUrl = appState.avatarCache[comment.authorId];
            }
            // 2. Check Email Cache
            else if (comment.authorEmail && appState.avatarCache[comment.authorEmail]) {
                 avatarUrl = appState.avatarCache[comment.authorEmail];
            }
            
            // 3. Fetch by ID
            if (!avatarUrl && comment.authorId) {
                try {
                    const userDoc = await firebase.firestore().collection('users').doc(comment.authorId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        const fetchedUrl = userData.avatarDataUrl || userData.photoURL;
                        if (fetchedUrl) {
                            appState.avatarCache[comment.authorId] = fetchedUrl;
                            if (comment.authorEmail) appState.avatarCache[comment.authorEmail] = fetchedUrl;
                            avatarUrl = fetchedUrl;
                        }
                    }
                } catch (e) { console.error('Error fetching avatar by ID:', e); }
            }
            
            // 4. Fetch by Email (fallback if ID fetch failed or returned nothing)
            if (!avatarUrl && comment.authorEmail) {
                 try {
                    const userSnapshot = await firebase.firestore().collection('users').where('email', '==', comment.authorEmail).limit(1).get();
                    if (!userSnapshot.empty) {
                        const userData = userSnapshot.docs[0].data();
                        const fetchedUrl = userData.avatarDataUrl || userData.photoURL;
                        if (fetchedUrl) {
                            appState.avatarCache[comment.authorEmail] = fetchedUrl;
                            if (comment.authorId) appState.avatarCache[comment.authorId] = fetchedUrl;
                            avatarUrl = fetchedUrl;
                        }
                    }
                 } catch (e) { console.error('Error fetching avatar by Email:', e); }
            }
        }

        let likeTooltip = '';
        if (likedBy.length > 0) {
            const maxNames = 20;
            const shownUids = likedBy.slice(0, maxNames);
            const names = (await Promise.all(shownUids.map(getDisplayNameForUid))).filter(Boolean);
            const more = likedBy.length > maxNames ? ` …等${likedBy.length}人` : '';
            likeTooltip = `點讚：${names.join('、')}${more}`;
        } else {
            likeTooltip = '尚無點讚';
        }
        
        commentsHtml += `
            <div class="bg-gray-50 p-4 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center">
                        <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 mr-2 overflow-hidden">
                             ${avatarUrl ? `<img src="${avatarUrl}" class="h-full w-full object-cover">` : (comment.authorName || 'U')[0].toUpperCase()}
                        </div>
                        <span class="font-medium text-sm text-gray-900 mr-2">${comment.authorName || comment.authorEmail.split('@')[0]}</span>
                        <span class="text-xs text-gray-500">${date}</span>
                    </div>
                    <div class="flex items-center space-x-3">
                         <button onclick="toggleCommentLike('${postId}', '${doc.id}')" title="${escapeHtml(likeTooltip)}" class="flex items-center space-x-1 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'} transition-colors">
                            <svg class="w-4 h-4" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                            <span class="text-xs font-medium">${likeCount > 0 ? likeCount : '讚'}</span>
                        </button>
                        ${canDelete ? `<button onclick="deleteComment('${postId}', '${doc.id}')" class="text-xs text-red-600 hover:text-red-800">刪除</button>` : ''}
                    </div>
                </div>
                ${comment.deletedAt ? `<p class="text-gray-400 mt-1 text-sm pl-10">${deletedLabel}</p>` : `<p class="text-gray-700 mt-1 text-sm pl-10">${comment.content}</p>`}
            </div>
        `;
    }
    
    commentsList.innerHTML = commentsHtml;
}

// --- 評分系統 ---
async function loadRating(postId, authorId) {
    const starsContainer = document.getElementById('post-rating-stars');
    const ratingText = document.getElementById('post-rating-text');
    const ratingMsg = document.getElementById('post-rating-msg');
    
    if (!starsContainer) return;

    let userRating = 0;
    
    // Check if user has rated
    if (appState.user) {
        try {
            const ratingDoc = await firebase.firestore().collection('posts').doc(postId).collection('ratings').doc(appState.user.uid).get();
            if (ratingDoc.exists) {
                userRating = ratingDoc.data().rating;
            }
        } catch (e) {
            console.error('Error fetching rating:', e);
        }
    }

    renderStars(userRating, postId, authorId);
    
    // Update text
    if (userRating > 0) {
        ratingText.textContent = `您已評分: ${userRating} 星`;
    } else {
        ratingText.textContent = '尚未評分';
    }
    
    if (appState.user && appState.user.uid === authorId) {
        ratingMsg.textContent = '提示: 您無法評分自己的文章';
    } else if (!appState.user) {
        ratingMsg.textContent = '提示: 請先登入以評分';
    }
}

function renderStars(currentRating, postId, authorId) {
    const container = document.getElementById('post-rating-stars');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 1; i <= 5; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        star.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        star.setAttribute('viewBox', '0 0 24 24');
        star.setAttribute('fill', i <= currentRating ? 'currentColor' : 'none');
        star.setAttribute('stroke', 'currentColor');
        star.setAttribute('stroke-width', '2');
        star.setAttribute('class', `w-6 h-6 ${i <= currentRating ? 'text-yellow-400' : 'text-gray-300'} transition-colors duration-200`);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('d', 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.8.77.397 1.18l-4.25 4.353a.563.563 0 00-.152.481l1.325 5.424a.563.563 0 01-.82.818l-4.88-2.92a.563.563 0 00-.58 0l-4.88 2.92a.563.563 0 01-.82-.818l1.325-5.424a.563.563 0 00-.152-.481L.901 10.577c-.402-.41-.166-1.135.397-1.18l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z');
        star.appendChild(path);

        // Interaction logic
        if (appState.user && appState.user.uid !== authorId) {
            star.onclick = () => submitRating(postId, i, authorId);
            star.onmouseenter = () => highlightStars(i);
            container.onmouseleave = () => highlightStars(currentRating); // Reset on leave
        }
        
        container.appendChild(star);
    }
}

function highlightStars(count) {
    const container = document.getElementById('post-rating-stars');
    if (!container) return;
    const stars = container.children;
    for (let i = 0; i < stars.length; i++) {
        if (i < count) {
            stars[i].setAttribute('fill', 'currentColor');
            stars[i].classList.remove('text-gray-300');
            stars[i].classList.add('text-yellow-400');
        } else {
            stars[i].setAttribute('fill', 'none');
            stars[i].classList.remove('text-yellow-400');
            stars[i].classList.add('text-gray-300');
        }
    }
}

async function submitRating(postId, rating, authorId) {
    if (!appState.user) {
        alert('請先登入');
        return;
    }
    
    // Optimistic UI update
    renderStars(rating, postId, authorId || ''); 
    document.getElementById('post-rating-text').textContent = `您已評分: ${rating} 星`;
    
    try {
        const db = firebase.firestore();
        const postRef = db.collection('posts').doc(postId);
        const ratingRef = postRef.collection('ratings').doc(appState.user.uid);
        
        await db.runTransaction(async (transaction) => {
            const postDoc = await transaction.get(postRef);
            const ratingDoc = await transaction.get(ratingRef);
            
            if (!postDoc.exists) throw "Post does not exist!";
            
            let newRatingCount = postDoc.data().ratingCount || 0;
            let newRatingAvg = postDoc.data().ratingAvg || 0;
            let oldRating = 0;
            
            if (ratingDoc.exists) {
                oldRating = ratingDoc.data().rating;
                // Update average: (avg * count - old + new) / count
                // Note: count doesn't change
                if (newRatingCount > 0) {
                     let totalScore = (newRatingAvg * newRatingCount) - oldRating + rating;
                     newRatingAvg = totalScore / newRatingCount;
                } else {
                     // Should not happen if doc exists but count is 0, fix it
                     newRatingCount = 1;
                     newRatingAvg = rating;
                }
            } else {
                // New rating
                // Update average: (avg * count + new) / (count + 1)
                let totalScore = (newRatingAvg * newRatingCount) + rating;
                newRatingCount += 1;
                newRatingAvg = totalScore / newRatingCount;
            }
            
            transaction.set(ratingRef, {
                rating: rating,
                userId: appState.user.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            transaction.update(postRef, {
                ratingAvg: newRatingAvg,
                ratingCount: newRatingCount
            });
        });
                  
              } catch (error) {
                  console.error("Rating failed: ", error);
                  if (error.code === 'permission-denied') {
                      alert('評分失敗: 權限不足。請確認 Firestore Rules 設定是否已更新 (允許非作者更新 ratingAvg/ratingCount)。');
                  } else {
                      alert('評分失敗: ' + (error.message || '請稍後再試'));
                  }
                  // Revert UI
                  loadRating(postId, authorId);
              }
}

// --- 登入/註冊 ---
function renderLogin() {
    appContainer.innerHTML = `
        <div class="min-h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md border border-gray-100">
                <div>
                    <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">登入帳戶</h2>
                    <p class="mt-2 text-center text-sm text-gray-600">
                        或 <a href="#" onclick="toggleAuthMode('register')" class="font-medium text-black hover:text-gray-700">註冊新帳號</a>
                    </p>
                </div>
                <form class="mt-8 space-y-6" id="auth-form" onsubmit="handleAuth(event, 'login')">
                    <div class="rounded-md shadow-sm -space-y-px">
                        <div id="nickname-field" class="hidden">
                            <label for="nickname" class="sr-only">暱稱</label>
                            <input id="nickname" name="nickname" type="text" class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm" placeholder="暱稱 (不可重複)">
                        </div>
                        <div>
                            <label for="email-address" class="sr-only">Email address</label>
                            <input id="email-address" name="email" type="email" autocomplete="email" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm" placeholder="電子郵件地址">
                        </div>
                        <div class="relative">
                            <label for="password" class="sr-only">Password</label>
                            <input id="password" name="password" type="password" autocomplete="current-password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm pr-16" placeholder="密碼">
                            <button type="button" id="toggle-password" onclick="togglePasswordVisibility()" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">顯示</button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <label class="flex items-center space-x-2 text-sm text-gray-700">
                            <input id="remember" name="remember" type="checkbox" class="h-4 w-4 text-black border-gray-300 rounded">
                            <span>記住我</span>
                        </label>
                        <span></span>
                    </div>

                    <div>
                        <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black">
                            登入
                        </button>
                    </div>
                </form>
                <div id="auth-message" class="text-center text-sm text-red-500 mt-2"></div>
            </div>
        </div>
    `;
}

function renderRegister() {
    renderLogin();
    toggleAuthMode('register');
}

function toggleAuthMode(mode) {
    if (mode === 'register') {
        const title = document.querySelector('h2');
        const link = document.querySelector('p a');
        const btn = document.querySelector('button[type="submit"]');
        const form = document.getElementById('auth-form');
        const nicknameField = document.getElementById('nickname-field');
        const emailInput = document.getElementById('email-address');
        const passwordInput = document.getElementById('password');
        
        title.textContent = '註冊新帳戶';
        link.textContent = '已有帳號？登入';
        link.onclick = () => toggleAuthMode('login');
        btn.textContent = '註冊';
        form.onsubmit = (e) => handleAuth(e, 'register');
        
        // 顯示暱稱欄位並調整樣式
        nicknameField.classList.remove('hidden');
        nicknameField.querySelector('input').required = true;
        emailInput.classList.remove('rounded-t-md');
        passwordInput.classList.add('rounded-b-md');
    } else {
        renderLogin(); // Reset to login
    }
}

// --- 發布文章 ---
function compressImage(file, maxWidth, maxHeight, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function previewPostImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    compressImage(file, 360, 240, 0.8, (dataUrl) => {
        const preview = document.getElementById('image-preview');
        preview.src = dataUrl;
        preview.classList.remove('hidden');
        document.getElementById('post-image-data').value = dataUrl;
        document.getElementById('preview-placeholder').classList.add('hidden');
    });
}

let richUrlAction = null;

function escapeHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = (html || '').toString();
    return (div.textContent || '').trim();
}

function isSafeLinkHref(href) {
    try {
        const u = new URL(href, window.location.origin);
        return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
    } catch {
        return false;
    }
}

function isSafeImageSrc(src) {
    if (!src) return false;
    if (src.startsWith('data:image/')) return true;
    try {
        const u = new URL(src, window.location.origin);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function extractYouTubeId(url) {
    try {
        const u = new URL(url);
        if (u.hostname === 'youtu.be') return (u.pathname || '').replace('/', '') || null;
        if (u.hostname.endsWith('youtube.com') || u.hostname.endsWith('youtube-nocookie.com')) {
            const v = u.searchParams.get('v');
            if (v) return v;
            const parts = (u.pathname || '').split('/').filter(Boolean);
            const idx = parts.indexOf('embed');
            if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
            const sIdx = parts.indexOf('shorts');
            if (sIdx !== -1 && parts[sIdx + 1]) return parts[sIdx + 1];
        }
        return null;
    } catch {
        return null;
    }
}

function isSafeYouTubeEmbedSrc(src) {
    try {
        const u = new URL(src, window.location.origin);
        if (u.protocol !== 'https:') return false;
        const hostOk = u.hostname === 'www.youtube.com' || u.hostname === 'www.youtube-nocookie.com';
        if (!hostOk) return false;
        if (!u.pathname.startsWith('/embed/')) return false;
        const id = u.pathname.replace('/embed/', '').split('/')[0];
        return Boolean(id);
    } catch {
        return false;
    }
}

function sanitizeHtml(inputHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${(inputHtml || '').toString()}</div>`, 'text/html');
    const root = doc.body.firstChild;
    const outDoc = document.implementation.createHTMLDocument('');
    const outRoot = outDoc.createElement('div');

    const allowedTags = new Set([
        'p', 'br', 'div', 'span',
        'b', 'strong', 'i', 'em', 'u', 's', 'strike',
        'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4',
        'blockquote',
        'a', 'img', 'iframe'
    ]);

    const allowedAttrsByTag = {
        a: new Set(['href', 'target', 'rel', 'title', 'class']),
        img: new Set(['src', 'alt', 'title', 'width', 'height', 'class']),
        iframe: new Set(['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'class', 'title']),
        '*': new Set(['class'])
    };

    function appendSanitizedChildren(inNode, outParent) {
        for (const child of Array.from(inNode.childNodes || [])) {
            if (child.nodeType === Node.TEXT_NODE) {
                outParent.appendChild(outDoc.createTextNode(child.nodeValue || ''));
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) continue;

            const tag = (child.tagName || '').toLowerCase();
            if (!allowedTags.has(tag)) {
                appendSanitizedChildren(child, outParent);
                continue;
            }

            if (tag === 'iframe') {
                const src = child.getAttribute('src') || '';
                if (!isSafeYouTubeEmbedSrc(src)) {
                    const text = child.textContent || '';
                    if (text.trim()) outParent.appendChild(outDoc.createTextNode(text));
                    continue;
                }
            }

            if (tag === 'img') {
                const src = child.getAttribute('src') || '';
                if (!isSafeImageSrc(src)) continue;
            }

            if (tag === 'a') {
                const href = child.getAttribute('href') || '';
                if (!isSafeLinkHref(href)) {
                    appendSanitizedChildren(child, outParent);
                    continue;
                }
            }

            const outEl = outDoc.createElement(tag);
            const allowed = new Set([...(allowedAttrsByTag['*'] || []), ...(allowedAttrsByTag[tag] || [])]);
            for (const attr of Array.from(child.attributes || [])) {
                const name = (attr.name || '').toLowerCase();
                if (name.startsWith('on')) continue;
                if (name === 'style') continue;
                if (!allowed.has(name)) continue;
                let value = attr.value || '';
                if (tag === 'a' && name === 'href' && !isSafeLinkHref(value)) continue;
                if (tag === 'img' && name === 'src' && !isSafeImageSrc(value)) continue;
                if (tag === 'iframe' && name === 'src' && !isSafeYouTubeEmbedSrc(value)) continue;
                outEl.setAttribute(name, value);
            }

            if (tag === 'a') {
                outEl.setAttribute('target', '_blank');
                outEl.setAttribute('rel', 'noopener noreferrer');
            }

            appendSanitizedChildren(child, outEl);
            outParent.appendChild(outEl);
        }
    }

    appendSanitizedChildren(root, outRoot);
    return outRoot.innerHTML;
}

function plainTextToHtml(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function getRichEditorHtml() {
    const el = document.getElementById('rich-editor-content');
    if (!el) return '';
    return sanitizeHtml(el.innerHTML);
}

function initRichEditor(initialHtml) {
    const el = document.getElementById('rich-editor-content');
    if (!el) return;
    el.innerHTML = sanitizeHtml(initialHtml || '') || '<p><br></p>';
    el.focus();
}

function richHandlePaste(e) {
    try {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
    } catch {
    }
}

function richCmd(cmd, value) {
    const el = document.getElementById('rich-editor-content');
    if (!el) return;
    el.focus();
    if (typeof value === 'undefined') document.execCommand(cmd, false, null);
    else document.execCommand(cmd, false, value);
}

function richInsertImageFromFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    
    // Compress image to avoid Firestore 1MB limit
    compressImage(file, 800, 800, 0.7, (dataUrl) => {
        richCmd('insertImage', dataUrl);
        event.target.value = '';
    });
}

function ensureRichUrlModal() {
    if (document.getElementById('rich-url-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'rich-url-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-lg shadow-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4" id="rich-url-title">插入</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-700 mb-1">網址</label>
                    <input id="rich-url-input" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="https://..." onkeydown="if(event.key === 'Enter') submitRichUrl()">
                </div>
                <div class="flex justify-end space-x-2">
                    <button onclick="closeRichUrlModal()" class="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100">取消</button>
                    <button onclick="submitRichUrl()" class="px-4 py-2 rounded bg-black text-white hover:bg-gray-800">插入</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openRichUrlModal(action) {
    richUrlAction = action;
    ensureRichUrlModal();
    const modal = document.getElementById('rich-url-modal');
    const title = document.getElementById('rich-url-title');
    const input = document.getElementById('rich-url-input');
    title.textContent = action === 'video' ? '插入影片' : '插入連結';
    input.value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => input.focus(), 50);
}

function closeRichUrlModal() {
    const modal = document.getElementById('rich-url-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    richUrlAction = null;
}

function submitRichUrl() {
    const input = document.getElementById('rich-url-input');
    const url = (input?.value || '').trim();
    if (!url) return;

    if (richUrlAction === 'link') {
        if (!isSafeLinkHref(url)) {
            alert('連結格式不正確');
            return;
        }
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            richCmd('createLink', url);
        } else {
            richCmd('insertHTML', `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
        }
        closeRichUrlModal();
        return;
    }

    if (richUrlAction === 'video') {
        const id = extractYouTubeId(url);
        if (!id) {
            alert('目前僅支援 YouTube 連結');
            return;
        }
        const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
        const html = `<div class="w-full"><iframe src="${src}" width="100%" height="360" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><p><br></p>`;
        richCmd('insertHTML', html);
        closeRichUrlModal();
        return;
    }
}

function openCreatePostModal() {
    if (appState.userProfile?.canPost === false) {
        alert('您已被禁止發文');
        return;
    }
    
    let modal = document.getElementById('create-post-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-post-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
        document.body.appendChild(modal);
    }

    const tagOptions = appState.openTabs.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    modal.innerHTML = `
        <div class="bg-white w-[94%] h-[80%] rounded-lg shadow-lg p-8 overflow-y-auto relative">
            <button onclick="closeCreatePostModal()" class="absolute top-4 right-4 text-gray-500 hover:text-black">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <div class="w-full mx-auto">
                <div class="flex items-baseline space-x-6 mb-6">
                    <h1 class="text-2xl font-bold text-gray-900">發布新文章</h1>
                </div>
                <form onsubmit="submitPost(event)">
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2" for="post-tag">主題標籤</label>
                        <select class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-black bg-white" id="post-tag" required>
                            <option value="" disabled selected>請選擇主題標籤</option>
                            ${tagOptions}
                        </select>
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">標題圖片 (建議 360x240)</label>
                        <div class="flex flex-col sm:flex-row gap-4 items-start">
                            <div class="w-[360px] h-[240px] bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden relative shrink-0">
                                <span id="preview-placeholder" class="text-gray-400 text-sm pointer-events-none">圖片預覽</span>
                                <img id="image-preview" class="absolute inset-0 w-full h-full object-contain hidden bg-white">
                            </div>
                            <div class="flex-1 space-y-2">
                                <input type="file" accept="image/*" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer" onchange="previewPostImage(event)">
                                <p class="text-xs text-gray-500">支援 JPG, PNG 格式。圖片將自動調整為適合大小。</p>
                                <input type="hidden" id="post-image-data">
                            </div>
                        </div>
                    </div>
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2" for="title">標題</label>
                        <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-black" id="title" type="text" placeholder="輸入文章標題" required>
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">內容</label>
                        <div class="border rounded shadow-sm">
                            <div class="flex flex-wrap gap-2 p-2 border-b bg-gray-50">
                                <button type="button" onclick="richCmd('undo')" class="px-2 py-1 text-xs border rounded hover:bg-white">復原</button>
                                <button type="button" onclick="richCmd('redo')" class="px-2 py-1 text-xs border rounded hover:bg-white">重做</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="richCmd('bold')" class="px-2 py-1 text-xs border rounded hover:bg-white font-bold">B</button>
                                <button type="button" onclick="richCmd('italic')" class="px-2 py-1 text-xs border rounded hover:bg-white italic">I</button>
                                <button type="button" onclick="richCmd('underline')" class="px-2 py-1 text-xs border rounded hover:bg-white underline">U</button>
                                <button type="button" onclick="richCmd('strikeThrough')" class="px-2 py-1 text-xs border rounded hover:bg-white line-through">S</button>
                                <button type="button" onclick="richCmd('removeFormat')" class="px-2 py-1 text-xs border rounded hover:bg-white">清除</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="richCmd('justifyLeft')" class="px-2 py-1 text-xs border rounded hover:bg-white">靠左</button>
                                <button type="button" onclick="richCmd('justifyCenter')" class="px-2 py-1 text-xs border rounded hover:bg-white">置中</button>
                                <button type="button" onclick="richCmd('justifyRight')" class="px-2 py-1 text-xs border rounded hover:bg-white">靠右</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="richCmd('insertUnorderedList')" class="px-2 py-1 text-xs border rounded hover:bg-white">項目</button>
                                <button type="button" onclick="richCmd('insertOrderedList')" class="px-2 py-1 text-xs border rounded hover:bg-white">編號</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="openRichUrlModal('link')" class="px-2 py-1 text-xs border rounded hover:bg-white">連結</button>
                                <button type="button" onclick="document.getElementById('rich-image-input').click()" class="px-2 py-1 text-xs border rounded hover:bg-white">圖片</button>
                                <button type="button" onclick="openRichUrlModal('video')" class="px-2 py-1 text-xs border rounded hover:bg-white">影片</button>
                            </div>
                            <div id="rich-editor-content" class="p-3 min-h-[240px] outline-none" contenteditable="true" onpaste="richHandlePaste(event)"></div>
                        </div>
                        <input id="rich-image-input" type="file" accept="image/*" class="hidden" onchange="richInsertImageFromFile(event)">
                    </div>
                    <div class="flex items-center justify-between">
                        <button class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="button" onclick="closeCreatePostModal()">
                            取消
                        </button>
                        <button class="bg-black hover:bg-gray-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
                            發布
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    initRichEditor('');
}

function closeCreatePostModal() {
    const modal = document.getElementById('create-post-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function renderCreatePost() {
    window.location.hash = '/';
    setTimeout(openCreatePostModal, 100);
}

async function renderEditPost(postId) {
    if (!appState.user) {
        window.location.hash = '#login';
        return;
    }

    try {
        const doc = await firebase.firestore().collection('posts').doc(postId).get();
        if (!doc.exists) {
            alert('文章不存在');
            window.location.hash = '/';
            return;
        }
        const data = doc.data();

        if (data.authorId !== appState.user.uid && appState.role !== 'admin' && appState.role !== 'moderator') {
            alert('您沒有權限編輯此文章');
            window.location.hash = '/';
            return;
        }

        const tagOptions = appState.openTabs.map(t => 
            `<option value="${t.name}" ${t.name === data.tag ? 'selected' : ''}>${t.name}</option>`
        ).join('');

        appContainer.innerHTML = `
            <div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow border border-gray-100">
                <div class="flex items-baseline space-x-6 mb-6">
                    <h1 class="text-2xl font-bold text-gray-900">編輯文章</h1>
                </div>
                <form onsubmit="updatePost(event, '${postId}')">
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2" for="post-tag">主題標籤</label>
                        <select class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-black bg-white" id="post-tag" required>
                            <option value="" disabled>請選擇主題標籤</option>
                            ${tagOptions}
                        </select>
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">標題圖片 (建議 360x240)</label>
                        <div class="flex flex-col sm:flex-row gap-4 items-start">
                            <div class="w-[360px] h-[240px] bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden relative shrink-0">
                                <span id="preview-placeholder" class="${data.imageDataUrl ? 'hidden' : ''} text-gray-400 text-sm pointer-events-none">圖片預覽</span>
                                <img id="image-preview" src="${data.imageDataUrl || ''}" class="${data.imageDataUrl ? '' : 'hidden'} absolute inset-0 w-full h-full object-contain bg-white">
                            </div>
                            <div class="flex-1 space-y-2">
                                <input type="file" accept="image/*" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer" onchange="previewPostImage(event)">
                                <p class="text-xs text-gray-500">支援 JPG, PNG 格式。圖片將自動調整為適合大小。</p>
                                <input type="hidden" id="post-image-data" value="${data.imageDataUrl || ''}">
                            </div>
                        </div>
                    </div>
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2" for="title">標題</label>
                        <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-black" id="title" type="text" placeholder="輸入文章標題" value="${data.title}" required>
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">內容</label>
                        <div class="border rounded shadow-sm">
                            <div class="flex flex-wrap gap-2 p-2 border-b bg-gray-50">
                                <button type="button" onclick="richCmd('undo')" class="px-2 py-1 text-xs border rounded hover:bg-white">復原</button>
                                <button type="button" onclick="richCmd('redo')" class="px-2 py-1 text-xs border rounded hover:bg-white">重做</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="richCmd('bold')" class="px-2 py-1 text-xs border rounded hover:bg-white font-bold">B</button>
                                <button type="button" onclick="richCmd('italic')" class="px-2 py-1 text-xs border rounded hover:bg-white italic">I</button>
                                <button type="button" onclick="richCmd('underline')" class="px-2 py-1 text-xs border rounded hover:bg-white underline">U</button>
                                <button type="button" onclick="richCmd('strikeThrough')" class="px-2 py-1 text-xs border rounded hover:bg-white line-through">S</button>
                                <button type="button" onclick="richCmd('removeFormat')" class="px-2 py-1 text-xs border rounded hover:bg-white">清除</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="richCmd('justifyLeft')" class="px-2 py-1 text-xs border rounded hover:bg-white">靠左</button>
                                <button type="button" onclick="richCmd('justifyCenter')" class="px-2 py-1 text-xs border rounded hover:bg-white">置中</button>
                                <button type="button" onclick="richCmd('justifyRight')" class="px-2 py-1 text-xs border rounded hover:bg-white">靠右</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="richCmd('insertUnorderedList')" class="px-2 py-1 text-xs border rounded hover:bg-white">項目</button>
                                <button type="button" onclick="richCmd('insertOrderedList')" class="px-2 py-1 text-xs border rounded hover:bg-white">編號</button>
                                <span class="mx-1"></span>
                                <button type="button" onclick="openRichUrlModal('link')" class="px-2 py-1 text-xs border rounded hover:bg-white">連結</button>
                                <button type="button" onclick="document.getElementById('rich-image-input').click()" class="px-2 py-1 text-xs border rounded hover:bg-white">圖片</button>
                                <button type="button" onclick="openRichUrlModal('video')" class="px-2 py-1 text-xs border rounded hover:bg-white">影片</button>
                            </div>
                            <div id="rich-editor-content" class="p-3 min-h-[240px] outline-none" contenteditable="true" onpaste="richHandlePaste(event)"></div>
                        </div>
                        <input id="rich-image-input" type="file" accept="image/*" class="hidden" onchange="richInsertImageFromFile(event)">
                    </div>
                    <div class="flex items-center justify-between">
                        <button class="bg-black hover:bg-gray-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="button" onclick="window.history.back()">
                            取消
                        </button>
                        <button class="bg-black hover:bg-gray-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
                            儲存修改
                        </button>
                    </div>
                </form>
            </div>
        `;
        const initialHtml = data.contentFormat === 'html'
            ? (data.content || '')
            : plainTextToHtml((data.content || '').toString());
        initRichEditor(initialHtml);
    } catch (error) {
        console.error(error);
        alert('載入失敗: ' + error.message);
        window.location.hash = '/';
    }
}

// --- 管理後台 ---
async function renderAdminDashboard() {
    appContainer.innerHTML = `
        <h1 class="text-2xl font-bold mb-6">管理後台</h1>
        <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
            <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
                <h3 class="text-lg leading-6 font-medium text-gray-900">用戶管理</h3>
                ${appState.role === 'admin' ? '' : '<p class="mt-1 text-sm text-gray-500">只有系統管理員可以修改角色</p>'}
            </div>
            <ul id="user-list" class="divide-y divide-gray-200">
                <li class="px-4 py-4 text-center text-gray-500">載入中...</li>
            </ul>
        </div>
        <div id="user-edit-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white w-full max-w-sm rounded-lg shadow-lg p-6">
                <h3 class="text-lg font-medium text-gray-900 mb-4">編輯用戶</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">大頭照</label>
                        <div class="flex items-center space-x-3">
                            <div class="h-12 w-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center" id="user-edit-avatar-preview-wrap">
                                <img id="user-edit-avatar-preview" class="h-full w-full object-cover hidden">
                                <span id="user-edit-avatar-fallback" class="text-sm text-gray-600">?</span>
                            </div>
                            <input id="user-edit-avatar" type="file" accept="image/*" onchange="onUserAvatarChange(event)">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">暱稱</label>
                        <input id="user-edit-nickname" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="輸入暱稱">
                    </div>
                    <div class="flex justify-end space-x-2">
                        <button onclick="closeUserEditModal()" class="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100">取消</button>
                        <button onclick="saveUserEdit()" class="px-4 py-2 rounded bg-black text-white hover:bg-gray-800">儲存</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    try {
        const snapshot = await firebase.firestore().collection('users').get();
        const list = document.getElementById('user-list');
        const roleOrder = { admin: 0, moderator: 1, user: 2 };
        const users = [];
        snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        users.sort((a, b) => {
            const ra = roleOrder[a.role] ?? 99;
            const rb = roleOrder[b.role] ?? 99;
            if (ra !== rb) return ra - rb;
            const na = (a.nickname || a.email || '').toLowerCase();
            const nb = (b.nickname || b.email || '').toLowerCase();
            return na.localeCompare(nb);
        });
        list.innerHTML = '';
        for (const user of users) {
            const isAdmin = user.role === 'admin';
            const canPost = user.canPost !== false;
            const canComment = user.canComment !== false;
            
            list.innerHTML += `
                <li class="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div class="flex items-center space-x-3">
                        <div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                            ${(user.avatarDataUrl || user.photoURL) ? `<img src="${user.avatarDataUrl || user.photoURL}" alt="avatar" class="h-full w-full object-cover rounded-full">` : (user.nickname || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                            <p class="text-sm font-medium text-black truncate">${user.nickname || '未設定暱稱'}</p>
                            <p class="text-xs text-gray-500 truncate max-w-[220px]">${user.email || ''}</p>
                            <p class="text-xs text-gray-400">ID: ${user.id}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${!isAdmin ? `
                            <label class="inline-flex items-center space-x-1 mr-2 text-xs text-gray-700">
                                <input type="checkbox" ${canPost ? 'checked' : ''} onchange="updateUserPermission('${user.id}', 'canPost', this.checked)" class="rounded border-gray-300 text-black focus:ring-black">
                                <span>發表文章</span>
                            </label>
                            <label class="inline-flex items-center space-x-1 mr-2 text-xs text-gray-700">
                                <input type="checkbox" ${canComment ? 'checked' : ''} onchange="updateUserPermission('${user.id}', 'canComment', this.checked)" class="rounded border-gray-300 text-black focus:ring-black">
                                <span>文章留言</span>
                            </label>
                        ` : ''}
                        <select onchange="updateRole('${user.id}', this.value)" class="text-sm border-gray-300 rounded shadow-sm focus:ring-black focus:border-black p-1 ${appState.role === 'admin' ? '' : 'opacity-60 cursor-not-allowed'}" ${appState.role === 'admin' ? '' : 'disabled'}>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>系統管理員</option>
                            <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>壇主</option>
                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>訪客</option>
                        </select>
                        <button onclick="editUser('${user.id}')" class="text-sm px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 ${appState.role === 'admin' ? '' : 'opacity-60 cursor-not-allowed'}" ${appState.role === 'admin' ? '' : 'disabled'}>編輯</button>
                        ${user.role === 'admin' ? '' : `<button onclick="deleteUser('${user.id}')" class="text-sm px-2 py-1 rounded border border-gray-300 text-red-600 hover:bg-red-50 ${appState.role === 'admin' ? '' : 'opacity-60 cursor-not-allowed'}" ${appState.role === 'admin' ? '' : 'disabled'}>刪除</button>`}
                    </div>
                </li>
            `;
        }
    } catch (error) {
        console.error(error);
        document.getElementById('user-list').innerHTML = `<li class="px-4 py-4 text-red-500">無法載入用戶列表 (權限不足或錯誤)</li>`;
    }
}

// --- 配置錯誤提示 ---
function renderConfigError() {
    appContainer.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg border-l-4 border-yellow-400">
            <h1 class="text-2xl font-bold mb-4 text-gray-900">尚未設定 Firebase</h1>
            <p class="mb-4 text-gray-700">請按照以下步驟完成設定：</p>
            <ol class="list-decimal list-inside space-y-2 text-gray-600 mb-6">
                <li>前往 <a href="https://console.firebase.google.com/" target="_blank" class="text-blue-600 underline">Firebase Console</a></li>
                <li>建立一個新專案</li>
                <li>啟用 <strong>Authentication</strong> (Email/Password)</li>
                <li>啟用 <strong>Firestore Database</strong> (以測試模式開始)</li>
                <li>新增 Web 應用程式，複製設定內容</li>
                <li>開啟專案目錄下的 <code class="bg-gray-100 p-1 rounded">js/firebase-config.js</code></li>
                <li>貼上您的 Firebase Config</li>
            </ol>
            <div class="bg-gray-50 p-4 rounded text-sm text-gray-500">
                完成後重新整理此頁面即可開始使用。
            </div>
        </div>
    `;
}

function render404() {
    appContainer.innerHTML = `<div class="text-center py-20"><h1 class="text-4xl font-bold text-gray-900">404</h1><p class="text-gray-500 mt-2">找不到此頁面</p></div>`;
}

// ------------------------------------------------------------------
// 3. 動作處理 (Actions)
// ------------------------------------------------------------------

async function handleAuth(e, mode) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const msg = document.getElementById('auth-message');
    const remember = !!(e.target.remember && e.target.remember.checked);
    
    try {
        await firebase.auth().setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        if (mode === 'login') {
            await firebase.auth().signInWithEmailAndPassword(email, password);
        } else {
            // 註冊邏輯
            const nickname = document.getElementById('nickname').value.trim();
            if (!nickname) {
                throw new Error('請輸入暱稱');
            }
            if (/(管理員|壇主)/i.test(nickname)) {
                throw new Error('暱稱不可包含「管理員」或「壇主」');
            }
            
            // 檢查暱稱唯一性
            const db = firebase.firestore();
            const nicknameSnapshot = await db.collection('users').where('nickname', '==', nickname).get();
            if (!nicknameSnapshot.empty) {
                throw new Error('此暱稱已被使用，請更換一個');
            }

            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // 更新 Auth Profile
            await user.updateProfile({
                displayName: nickname
            });

            // 建立用戶資料
            try {
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    nickname: nickname,
                    role: 'user',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error(error);
            }
        }
        window.location.hash = '/'; // Redirect home
    } catch (error) {
        msg.textContent = formatAuthError(error, mode);
    }
}

function formatAuthError(error, mode) {
    const code = error?.code || '';
    if (code === 'permission-denied') return '權限不足：請確認 Firestore 規則已發布。';
    if (code === 'auth/invalid-login-credentials') {
        return mode === 'login'
            ? '帳號或密碼錯誤，或該帳號尚未註冊。'
            : '註冊失敗：請確認 Email 格式正確，且此 Email 尚未被註冊。';
    }
    if (code === 'auth/email-already-in-use') return '此 Email 已被註冊，請改用登入。';
    if (code === 'auth/weak-password') return '密碼強度不足，請使用至少 6 個字元。';
    if (code === 'auth/invalid-email') return 'Email 格式不正確。';
    if (code === 'auth/operation-not-allowed') return 'Firebase 尚未啟用 Email/Password 登入，請至 Firebase Console 開啟。';
    if (code === 'auth/network-request-failed') return '網路連線失敗，請檢查網路或防火牆設定。';
    return error?.message || '發生未知錯誤，請稍後再試。';
}

async function logout() {
    await firebase.auth().signOut();
    window.location.reload();
}

async function ensureUserCanPost() {
    if (!appState.user) throw new Error('請先登入');
    const db = firebase.firestore();
    const ref = db.collection('users').doc(appState.user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        await ref.set({
            email: appState.user.email,
            role: 'user',
            canPost: true,
            canComment: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        appState.role = 'user';
        appState.userProfile = { email: appState.user.email, role: 'user', canPost: true, canComment: true };
        return;
    }
    const data = snap.data() || {};
    if (data.canPost === false) {
        throw new Error('您的帳號目前無法發文');
    }
    if (typeof data.canPost === 'undefined') {
        await ref.set({ canPost: true }, { merge: true });
        appState.userProfile = { ...(appState.userProfile || {}), canPost: true };
    }
}

async function ensureUserCanComment() {
    if (!appState.user) throw new Error('請先登入');
    const db = firebase.firestore();
    const ref = db.collection('users').doc(appState.user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        await ref.set({
            email: appState.user.email,
            role: 'user',
            canPost: true,
            canComment: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        appState.role = 'user';
        appState.userProfile = { email: appState.user.email, role: 'user', canPost: true, canComment: true };
        return;
    }
    const data = snap.data() || {};
    if (data.canComment === false) {
        throw new Error('您的帳號目前無法留言');
    }
    if (typeof data.canComment === 'undefined') {
        await ref.set({ canComment: true }, { merge: true });
        appState.userProfile = { ...(appState.userProfile || {}), canComment: true };
    }
}

async function submitPost(e) {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const content = getRichEditorHtml();
    const tag = document.getElementById('post-tag').value.trim();
    const imageDataUrl = document.getElementById('post-image-data').value || null;
    const contentText = htmlToText(content);

    if (!contentText && !content.includes('<img') && !content.includes('<iframe')) {
        alert('請輸入文章內容或插入圖片/影片');
        return;
    }

    // Check size limit (Firestore 1MB limit)
    const estimatedSize = new Blob([content]).size + (imageDataUrl ? new Blob([imageDataUrl]).size : 0) + 5000;
    if (estimatedSize > 1040000) {
        alert('發布失敗：文章內容過大（圖片過多）。\n預估大小: ' + (estimatedSize/1024/1024).toFixed(2) + ' MB (上限 1MB)\n請減少圖片數量。');
        return;
    }

    try {
        await ensureUserCanPost();
        await firebase.firestore().collection('posts').add({
            title,
            content,
            contentFormat: 'html',
            tag,
            imageDataUrl,
            authorId: appState.user.uid,
            authorEmail: appState.user.email,
            authorName: appState.userProfile?.nickname || appState.user.displayName || appState.user.email.split('@')[0],
            authorAvatarDataUrl: appState.userProfile?.avatarDataUrl || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            pinned: false,
            viewCount: 0,
            ratingAvg: 0,
            ratingCount: 0
        });
        closeCreatePostModal();
        if (appState.currentRoute === '' || appState.currentRoute === '/') {
            renderHome(); // 當前就在首頁時，直接重新渲染列表
        } else {
            window.location.hash = '/'; // 其他頁面則導回首頁
        }
    } catch (error) {
        if (error.code === 'permission-denied') {
            alert('發布失敗: 權限不足，請確認您已登入，且帳號具備發文權限。');
        } else {
            alert('發布失敗: ' + (error.message || '請稍後再試'));
        }
    }
}

async function updatePost(e, postId) {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const content = getRichEditorHtml();
    const tag = document.getElementById('post-tag').value;
    const imageDataUrl = document.getElementById('post-image-data').value || null;
    const contentText = htmlToText(content);

    if (!contentText && !content.includes('<img') && !content.includes('<iframe')) {
        alert('請輸入文章內容或插入圖片/影片');
        return;
    }

    // Check size limit
    const estimatedSize = new Blob([content]).size + (imageDataUrl ? new Blob([imageDataUrl]).size : 0) + 5000;
    if (estimatedSize > 1040000) {
        alert('更新失敗：文章內容過大（圖片過多）。\n預估大小: ' + (estimatedSize/1024/1024).toFixed(2) + ' MB (上限 1MB)\n請減少圖片數量。');
        return;
    }

    try {
        await firebase.firestore().collection('posts').doc(postId).update({
            title,
            content,
            contentFormat: 'html',
            tag,
            imageDataUrl,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('更新成功！');
        window.location.hash = '#post/' + postId;
    } catch (error) {
        alert('更新失敗: ' + error.message);
    }
}

async function submitComment(postId) {
    const input = document.getElementById('comment-input');
    const content = input.value.trim();
    if (!content) return;

    try {
        await ensureUserCanComment();
        await firebase.firestore().collection('posts').doc(postId).collection('comments').add({
            content,
            authorId: appState.user.uid,
            authorEmail: appState.user.email,
            authorName: appState.userProfile?.nickname || appState.user.displayName || appState.user.email.split('@')[0],
            authorAvatarDataUrl: appState.userProfile?.avatarDataUrl || appState.user.photoURL || null,
            likedBy: [],
            likeCount: 0,
            deletedAt: null,
            deletedByRole: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        loadComments(postId); // Refresh comments
    } catch (error) {
        if (error.code === 'permission-denied') {
            alert('留言失敗: 權限不足，請確認帳號具備留言權限，且 Firestore 規則已更新。');
        } else {
            alert('留言失敗: ' + (error.message || '請稍後再試'));
        }
    }
}

async function toggleCommentLike(postId, commentId) {
    console.log('toggleCommentLike called', postId, commentId);
    if (!appState.user) {
        alert('請先登入以點讚');
        return;
    }
    const uid = appState.user.uid;
    const ref = firebase.firestore().collection('posts').doc(postId).collection('comments').doc(commentId);
    
    try {
        await firebase.firestore().runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            if (!doc.exists) throw "Document does not exist!";
            
            const data = doc.data();
            const likedBy = data.likedBy || [];
            let newLikedBy;
            let increment = 0;
            
            if (likedBy.includes(uid)) {
                newLikedBy = likedBy.filter(id => id !== uid);
                increment = -1;
            } else {
                newLikedBy = [...likedBy, uid];
                increment = 1;
            }
            
            const newLikeCount = Math.max(0, (data.likeCount || 0) + increment);

            transaction.update(ref, { 
                likedBy: newLikedBy,
                likeCount: newLikeCount
            });
        });
        console.log('Transaction success');
        loadComments(postId);
    } catch (error) {
        console.error('Like error:', error);
        alert('點讚失敗: ' + error.message);
    }
}

async function deleteComment(postId, commentId) {
    try {
        if (!appState.user) return;
        const ref = firebase.firestore().collection('posts').doc(postId).collection('comments').doc(commentId);
        const snap = await ref.get();
        if (!snap.exists) return;
        const data = snap.data();
        const isStaff = appState.role === 'admin' || appState.role === 'moderator';
        const isAuthor = data.authorId === appState.user.uid;
        if (!isStaff && !isAuthor) {
            alert('權限不足');
            return;
        }
        if (!confirm('確定要刪除這則留言嗎？')) return;
        const deletedByRole = isStaff ? appState.role : 'self';
        await ref.set({
            content: '',
            deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deletedById: appState.user.uid,
            deletedByRole
        }, { merge: true });
        loadComments(postId);
    } catch (error) {
        alert('刪除失敗: ' + error.message);
    }
}

async function deletePost(postId) {
    if (!confirm('確定要刪除這篇文章嗎？')) return;
    try {
        await firebase.firestore().collection('posts').doc(postId).delete();
        // 如果是在文章詳情頁，刪除後跳轉回首頁；如果在列表頁，重新渲染列表
        if (appState.currentRoute === 'post') {
            window.location.hash = '/';
        } else {
            renderHome(); // 重新渲染列表以移除已刪除的文章
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('刪除失敗: ' + error.message);
    }
}

function getPostShareUrl(postId) {
    return window.location.origin + '/#post/' + postId;
}

function toggleShareMenu(postId) {
    const el = document.getElementById('share-menu-' + postId);
    if (!el) return;
    el.classList.toggle('hidden');
}

function copyShareLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            alert('連結已複製');
        }).catch(() => {
            alert('請手動複製：' + url);
        });
    } else {
        alert('請手動複製：' + url);
    }
}

function shareNative(postId, title) {
    const url = getPostShareUrl(postId);
    if (navigator.share) {
        navigator.share({ title, url }).catch(() => {
            toggleShareMenu(postId);
        });
    } else {
        toggleShareMenu(postId);
    }
}

async function togglePin(postId, status) {
    try {
        await firebase.firestore().collection('posts').doc(postId).update({
            pinned: status
        });
        renderPost(postId); // Refresh view
    } catch (error) {
        alert('操作失敗');
    }
}

async function updateRole(userId, newRole) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以修改角色');
            return;
        }
        await firebase.firestore().collection('users').doc(userId).set({ role: newRole }, { merge: true });
        // Refresh admin dashboard to update checkboxes visibility (if role changes to/from admin)
        renderAdminDashboard();
        alert('角色已更新');
    } catch (error) {
        alert('更新失敗: ' + error.message);
    }
}

async function updateUserPermission(userId, field, value) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以修改權限');
            // Revert checkbox state
            renderAdminDashboard();
            return;
        }
        await firebase.firestore().collection('users').doc(userId).set({ [field]: value }, { merge: true });
    } catch (error) {
        alert('權限更新失敗: ' + error.message);
        renderAdminDashboard(); // Revert on error
    }
}

async function editUser(userId) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以編輯用戶');
            return;
        }
        const db = firebase.firestore();
        const ref = db.collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) {
            alert('找不到用戶資料');
            return;
        }
        const modal = document.getElementById('user-edit-modal');
        modal.dataset.userId = userId;
        const data = snap.data();
        document.getElementById('user-edit-nickname').value = data.nickname || '';
        const img = document.getElementById('user-edit-avatar-preview');
        const fb = document.getElementById('user-edit-avatar-fallback');
        const avatar = data.avatarDataUrl || data.photoURL || '';
        if (avatar) {
            img.src = avatar;
            img.classList.remove('hidden');
            fb.classList.add('hidden');
        } else {
            img.src = '';
            img.classList.add('hidden');
            fb.textContent = (data.nickname || data.email || 'U')[0].toUpperCase();
            fb.classList.remove('hidden');
        }
        const fileInput = document.getElementById('user-edit-avatar');
        if (fileInput) fileInput.value = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        alert('編輯失敗: ' + error.message);
    }
}

function closeUserEditModal() {
    const modal = document.getElementById('user-edit-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    delete modal.dataset.userId;
}

function onUserAvatarChange(e) {
    const file = e.target.files && e.target.files[0];
    const img = document.getElementById('user-edit-avatar-preview');
    const fb = document.getElementById('user-edit-avatar-fallback');
    if (file) {
        img.src = URL.createObjectURL(file);
        img.classList.remove('hidden');
        fb.classList.add('hidden');
    }
}

async function fileToAvatarDataUrl(file) {
    const raw = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('讀取圖片失敗'));
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('載入圖片失敗'));
        image.src = raw;
    });

    const maxSize = 128;
    const scale = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
}

async function saveUserEdit() {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以編輯用戶');
            return;
        }
        const modal = document.getElementById('user-edit-modal');
        const userId = modal.dataset.userId;
        const nickname = document.getElementById('user-edit-nickname').value.trim();
        if (!nickname) {
            alert('暱稱不可為空');
            return;
        }
        if (/(管理員|壇主)/i.test(nickname)) {
            alert('暱稱不可包含「管理員」或「壇主」');
            return;
        }
        const db = firebase.firestore();
        const dup = await db.collection('users').where('nickname', '==', nickname).get();
        let occupied = false;
        dup.forEach(d => {
            if (d.id !== userId) occupied = true;
        });
        if (occupied) {
            alert('此暱稱已被使用，請更換');
            return;
        }
        let avatarDataUrl;
        const fileInput = document.getElementById('user-edit-avatar');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (file) {
            avatarDataUrl = await fileToAvatarDataUrl(file);
            if (avatarDataUrl && avatarDataUrl.length > 900000) {
                alert('圖片過大，請換小一點的圖片');
                return;
            }
        }
        const payload = avatarDataUrl ? { nickname, avatarDataUrl } : { nickname };
        await db.collection('users').doc(userId).set(payload, { merge: true });
        if (userId === appState.user?.uid) {
            try { await appState.user.updateProfile({ displayName: nickname }); } catch (e) {}
        }
        closeUserEditModal();
        renderAdminDashboard();
    } catch (error) {
        alert('儲存失敗: ' + error.message);
    }
}
async function deleteUser(userId) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以刪除用戶');
            return;
        }
        if (userId === appState.user?.uid) {
            alert('不能刪除自己');
            return;
        }
        if (!confirm('確定刪除此用戶資料？此操作無法復原')) return;
        const ref = firebase.firestore().collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) {
            alert('找不到用戶資料');
            return;
        }
        const data = snap.data();
        if (data.role === 'admin') {
            alert('無法刪除系統管理員');
            return;
        }
        await ref.delete();
        renderAdminDashboard();
    } catch (error) {
        alert('刪除失敗: ' + error.message);
    }
}

function getCurrentNickname() {
    if (!appState.user) return '';
    const raw = appState.userProfile?.nickname || appState.user.displayName || appState.user.email || '';
    return raw.includes('@') ? raw.split('@')[0] : raw;
}

function getCurrentAvatarSrc() {
    if (!appState.user) return '';
    return appState.userProfile?.avatarDataUrl || appState.userProfile?.photoURL || '';
}

function ensureProfileModal() {
    if (document.getElementById('profile-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-lg shadow-lg p-6">
            <div class="flex items-start justify-between">
                <h3 class="text-lg font-medium text-gray-900">個人資料</h3>
                <button onclick="closeProfileModal()" class="text-gray-500 hover:text-black">✕</button>
            </div>
            <div class="mt-4 space-y-4">
                <div class="flex items-center space-x-3">
                    <div class="h-14 w-14 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center" id="profile-avatar-preview-wrap">
                        <img id="profile-avatar-preview" class="h-full w-full object-cover hidden">
                        <span id="profile-avatar-fallback" class="text-sm text-gray-600">?</span>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm text-gray-700 mb-1">大頭照</div>
                        <input id="profile-avatar" type="file" accept="image/*" onchange="onProfileAvatarChange(event)">
                    </div>
                </div>

                <div>
                    <label class="block text-sm text-gray-700 mb-1">暱稱</label>
                    <input id="profile-nickname" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="輸入暱稱">
                </div>

                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-700">級別</div>
                    <div class="flex items-center space-x-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 2l2.2 4.7 5.1.7-3.7 3.6.9 5.1L12 13.9 7.5 16.1l.9-5.1L4.7 7.4l5.1-.7L12 2z" fill="#cd7f32"/>
                            <path d="M7 21h10" stroke="#cd7f32" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <span class="text-sm font-medium text-gray-900">銅牌</span>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-700">留言次數</div>
                    <div id="profile-comment-count" class="text-sm font-medium text-gray-900">載入中...</div>
                </div>

                <div class="flex items-center justify-between pt-2">
                    <button onclick="resetMyPassword()" class="text-sm px-3 py-2 rounded border border-gray-300 hover:bg-gray-100">重設密碼</button>
                    <button onclick="saveMyProfile()" class="text-sm px-4 py-2 rounded bg-black text-white hover:bg-gray-800">儲存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openProfileModal() {
    if (!appState.user) return;
    ensureProfileModal();
    const modal = document.getElementById('profile-modal');
    const nicknameInput = document.getElementById('profile-nickname');
    const fileInput = document.getElementById('profile-avatar');
    const img = document.getElementById('profile-avatar-preview');
    const fb = document.getElementById('profile-avatar-fallback');
    const avatar = getCurrentAvatarSrc();
    nicknameInput.value = appState.userProfile?.nickname || appState.user.displayName || '';
    if (fileInput) fileInput.value = '';
    if (avatar) {
        img.src = avatar;
        img.classList.remove('hidden');
        fb.classList.add('hidden');
    } else {
        img.src = '';
        img.classList.add('hidden');
        fb.textContent = (getCurrentNickname() || 'U')[0].toUpperCase();
        fb.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadMyCommentCount(appState.user.uid);
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function onProfileAvatarChange(e) {
    const file = e.target.files && e.target.files[0];
    const img = document.getElementById('profile-avatar-preview');
    const fb = document.getElementById('profile-avatar-fallback');
    if (file) {
        img.src = URL.createObjectURL(file);
        img.classList.remove('hidden');
        fb.classList.add('hidden');
    }
}

async function validateNickname(nickname, excludeUserId) {
    const trimmed = (nickname || '').trim();
    if (!trimmed) return { ok: false, message: '暱稱不可為空' };
    if (/(管理員|壇主)/i.test(trimmed)) return { ok: false, message: '暱稱不可包含「管理員」或「壇主」' };
    const snap = await firebase.firestore().collection('users').where('nickname', '==', trimmed).get();
    let occupied = false;
    snap.forEach(d => {
        if (d.id !== excludeUserId) occupied = true;
    });
    if (occupied) return { ok: false, message: '此暱稱已被使用，請更換' };
    return { ok: true, nickname: trimmed };
}

async function saveMyProfile() {
    try {
        if (!appState.user) return;
        const nicknameRaw = document.getElementById('profile-nickname').value;
        const result = await validateNickname(nicknameRaw, appState.user.uid);
        if (!result.ok) {
            alert(result.message);
            return;
        }
        let avatarDataUrl;
        const fileInput = document.getElementById('profile-avatar');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (file) {
            avatarDataUrl = await fileToAvatarDataUrl(file);
            if (avatarDataUrl && avatarDataUrl.length > 900000) {
                alert('圖片過大，請換小一點的圖片');
                return;
            }
        }
        const payload = avatarDataUrl ? { nickname: result.nickname, avatarDataUrl } : { nickname: result.nickname };
        await firebase.firestore().collection('users').doc(appState.user.uid).set(payload, { merge: true });
        try { await appState.user.updateProfile({ displayName: result.nickname }); } catch (e) {}
        appState.userProfile = { ...(appState.userProfile || {}), ...payload, email: appState.user.email };
        renderNav();
        closeProfileModal();
    } catch (error) {
        alert('儲存失敗: ' + error.message);
    }
}

async function resetMyPassword() {
    try {
        if (!appState.user?.email) return;
        await firebase.auth().sendPasswordResetEmail(appState.user.email);
        alert('已寄出重設密碼信件，請至信箱查看');
    } catch (error) {
        alert('重設密碼失敗: ' + (error?.message || '未知錯誤'));
    }
}

async function loadMyCommentCount(userId) {
    const el = document.getElementById('profile-comment-count');
    if (!el) return;
    try {
        el.textContent = '載入中...';
        const snap = await firebase.firestore().collectionGroup('comments').where('authorId', '==', userId).get();
        let count = 0;
        snap.forEach(d => {
            const c = d.data();
            const deletedByRole = c.deletedByRole || null;
            const excluded = c.deletedAt && (deletedByRole === 'admin' || deletedByRole === 'moderator');
            if (!excluded) count += 1;
        });
        el.textContent = String(count);
    } catch (error) {
        el.textContent = '-';
    }
}

// Helpers
function getRoleLabel(role) {
    switch(role) {
        case 'admin': return '系統管理員';
        case 'moderator': return '壇主';
        case 'user': return '訪客';
        default: return '訪客';
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById('password');
    const btn = document.getElementById('toggle-password');
    if (!input || !btn) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '隱藏';
    } else {
        input.type = 'password';
        btn.textContent = '顯示';
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
