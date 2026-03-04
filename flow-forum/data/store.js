/**
 * FLOW Forum — Data Store
 *
 * Для подключения Google OAuth:
 *  1. Зайди на https://console.cloud.google.com
 *  2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
 *  3. Тип: Web Application
 *  4. Authorized JS origins: добавь адрес своего сайта (например http://localhost или https://mysite.com)
 *  5. Скопируй Client ID и замени 'YOUR_GOOGLE_CLIENT_ID' ниже
 */

const FLOW = (function () {

  const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';

  const KEYS = {
    USERS:   'flow_users',
    SESSION: 'flow_session',
    TRACKS:  'flow_tracks',
  };

  const ADMIN = { name: 'Admin', email: 'admin@flow.ru', pass: 'admin123' };

  // ── Storage ──
  function loadUsers()    { try { return JSON.parse(localStorage.getItem(KEYS.USERS))  || []; } catch { return []; } }
  function saveUsers(l)   { localStorage.setItem(KEYS.USERS,   JSON.stringify(l)); }
  function loadTracks()   { try { return JSON.parse(localStorage.getItem(KEYS.TRACKS)) || []; } catch { return []; } }
  function saveTracks(l)  { localStorage.setItem(KEYS.TRACKS,  JSON.stringify(l)); }
  function getSession()   { return localStorage.getItem(KEYS.SESSION); }
  function setSession(n)  { localStorage.setItem(KEYS.SESSION, n); }
  function clearSession() { localStorage.removeItem(KEYS.SESSION); }

  // ── Seed admin ──
  function seedAdmin() {
    const list = loadUsers();
    if (!list.find(u => u.name === ADMIN.name)) {
      list.unshift({ name: ADMIN.name, email: ADMIN.email, pass: ADMIN.pass,
        role: 'admin', authMethod: 'local', registeredAt: new Date().toISOString() });
      saveUsers(list);
    }
  }

  // ── Session ──
  function restoreSession() {
    const name = getSession();
    if (!name) return null;
    const user = loadUsers().find(u => u.name === name);
    if (!user)       { clearSession(); return null; }
    if (user.banned) { clearSession(); return 'banned'; }
    _recordVisit(name);
    return user;
  }

  function startSession(user) { setSession(user.name); _recordVisit(user.name); }
  function endSession()       { clearSession(); }

  function _recordVisit(name) {
    const users = loadUsers();
    const u = users.find(u => u.name === name);
    if (u) { u.lastVisit = new Date().toISOString(); saveUsers(users); }
  }

  // ── Local auth ──
  function loginLocal(identifier, pass) {
    const id = identifier.trim().toLowerCase();
    const user = loadUsers().find(u =>
      (u.name.toLowerCase() === id || (u.email && u.email.toLowerCase() === id)) &&
      u.pass === pass && u.authMethod !== 'google'
    );
    if (!user) return { ok: false, error: 'Неверный логин или пароль' };
    if (user.banned) return { ok: false, error: 'Аккаунт заблокирован администратором', banned: true };
    startSession(user);
    return { ok: true, user };
  }

  function registerLocal(name, email, pass) {
    const users = loadUsers();
    if (name.toLowerCase() === ADMIN.name.toLowerCase())
      return { ok: false, field: 'name', error: 'Этот никнейм зарезервирован' };
    if (users.find(u => u.name.toLowerCase() === name.toLowerCase()))
      return { ok: false, field: 'name', error: 'Никнейм уже занят' };
    if (users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase()))
      return { ok: false, field: 'email', error: 'Email уже зарегистрирован' };
    const user = { name, email, pass, role: 'user', authMethod: 'local',
      registeredAt: new Date().toISOString(), lastVisit: new Date().toISOString() };
    users.push(user);
    saveUsers(users);
    startSession(user);
    return { ok: true, user };
  }

  // ── Google auth ──
  function isGoogleConfigured() { return GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID'; }

  function _parseJWT(token) {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    } catch { return null; }
  }

  function handleGoogleCredential(response) {
    const p = _parseJWT(response.credential);
    if (!p) return { ok: false, error: 'Ошибка чтения данных Google' };
    const { sub: googleId, email, name: gName, picture } = p;
    const users = loadUsers();
    let user = users.find(u => u.googleId === googleId) ||
               users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (user && user.banned) return { ok: false, error: 'Аккаунт заблокирован', banned: true };
    if (!user) {
      // Auto-register
      let base = (gName || email.split('@')[0]).replace(/\s+/g, '_');
      let finalName = base, n = 1;
      while (users.find(u => u.name.toLowerCase() === finalName.toLowerCase())) finalName = base + n++;
      user = { name: finalName, email, googleId, picture, role: 'user',
        authMethod: 'google', registeredAt: new Date().toISOString(), lastVisit: new Date().toISOString() };
      users.push(user);
    } else {
      // Merge Google fields
      const idx = users.indexOf(user);
      users[idx] = { ...user, googleId, picture, authMethod: 'google' };
      user = users[idx];
    }
    saveUsers(users);
    startSession(user);
    return { ok: true, user };
  }

  // ── Admin ops ──
  function banUser(name, banned) {
    const users = loadUsers();
    const u = users.find(u => u.name === name);
    if (!u) return false;
    u.banned = banned;
    saveUsers(users);
    return true;
  }

  function deleteUser(name) { saveUsers(loadUsers().filter(u => u.name !== name)); }

  return {
    ADMIN_NAME: ADMIN.name,
    GOOGLE_CLIENT_ID,
    isGoogleConfigured,
    loadUsers, saveUsers,
    loadTracks, saveTracks,
    getSession, setSession, clearSession,
    seedAdmin, restoreSession, startSession, endSession,
    loginLocal, registerLocal,
    handleGoogleCredential,
    banUser, deleteUser,
  };
})();
