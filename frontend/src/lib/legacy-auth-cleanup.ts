/**
 * Input: 浏览器 localStorage / sessionStorage
 * Output: 清理旧快捷登录资料后的认证页本地状态
 * Pos: 前端认证基础设施，隔离旧快捷登录缓存清理逻辑
 *
 * Security: 旧快捷登录曾保存过密码；认证页只清理这些本地资料，不再把它们作为登录凭据
 */

const KNOWN_LEGACY_QUICK_LOGIN_KEYS = [
  'jiesong_quick_login_profile',
  'jiesong_quick_login_enabled',
  'jiesong_quick_login_user',
  'jiesong_quick_login_username',
  'jiesong_quick_login_password',
  'jiesong_login_profile',
  'quick_login_profile',
  'quickLoginProfile',
  'quickLoginEnabled',
  'quickLoginAccount',
  'quickLoginUser',
  'quickLoginUsername',
  'quickLoginPassword',
  'remembered_login_profile',
  'rememberedLoginProfile',
  'rememberedCredentials',
  'saved_login_credentials',
  'savedLoginCredentials',
];

const LEGACY_QUICK_LOGIN_KEY_PATTERNS = [
  /quick[_-]?login/i,
  /quickLogin/,
  /quick.*(auth|credential|password|profile|user(name)?)/i,
  /(auth|credential|password|profile|user(name)?).*quick/i,
  /one[_-]?(tap|click).*(login|auth)/i,
  /(login|auth).*one[_-]?(tap|click)/i,
  /shortcut.*(login|auth)/i,
  /(login|auth).*shortcut/i,
  /remembered[_-]?login/i,
  /rememberedLogin/,
  /remembered.*(credential|password|profile)/i,
  /saved[_-]?login[_-]?profile/i,
  /savedLoginProfile/,
  /saved.*(credential|password).*login/i,
];

export const LEGACY_AUTH_CLEANUP_VERSION_KEY = 'jiesong_auth_cleanup_version';
export const LEGACY_AUTH_CLEANUP_VERSION = '2026-06-07-no-quick-login-v2';

const isLegacyQuickLoginKey = (key: string): boolean =>
  KNOWN_LEGACY_QUICK_LOGIN_KEYS.includes(key) ||
  LEGACY_QUICK_LOGIN_KEY_PATTERNS.some((pattern) => pattern.test(key));

const clearLegacyQuickLoginStorage = (storage: Storage | undefined): void => {
  if (!storage) {
    return;
  }

  for (const key of KNOWN_LEGACY_QUICK_LOGIN_KEYS) {
    storage.removeItem(key);
  }

  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => Boolean(key));

  for (const key of keys) {
    if (isLegacyQuickLoginKey(key)) {
      storage.removeItem(key);
    }
  }
};

export const LEGACY_AUTH_CLEANUP_INLINE_SCRIPT = `
(function(){
  var knownKeys=${JSON.stringify(KNOWN_LEGACY_QUICK_LOGIN_KEYS)};
  var patterns=[/quick[_-]?login/i,/quickLogin/,/quick.*(auth|credential|password|profile|user(name)?)/i,/(auth|credential|password|profile|user(name)?).*quick/i,/one[_-]?(tap|click).*(login|auth)/i,/(login|auth).*one[_-]?(tap|click)/i,/shortcut.*(login|auth)/i,/(login|auth).*shortcut/i,/remembered[_-]?login/i,/rememberedLogin/,/remembered.*(credential|password|profile)/i,/saved[_-]?login[_-]?profile/i,/savedLoginProfile/,/saved.*(credential|password).*login/i];
  function isLegacyKey(key){return knownKeys.indexOf(key)>=0||patterns.some(function(pattern){return pattern.test(key);});}
  function clean(storage){
    if(!storage){return;}
    knownKeys.forEach(function(key){storage.removeItem(key);});
    var keys=[];
    for(var index=0;index<storage.length;index+=1){var key=storage.key(index);if(key){keys.push(key);}}
    keys.forEach(function(key){if(isLegacyKey(key)){storage.removeItem(key);}});
  }
  try{
    clean(window.localStorage);
    clean(window.sessionStorage);
    window.localStorage.setItem(${JSON.stringify(LEGACY_AUTH_CLEANUP_VERSION_KEY)},${JSON.stringify(LEGACY_AUTH_CLEANUP_VERSION)});
  }catch(error){}
})();`;

export function clearLegacyQuickLoginState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  clearLegacyQuickLoginStorage(window.localStorage);
  clearLegacyQuickLoginStorage(window.sessionStorage);
  window.localStorage.setItem(LEGACY_AUTH_CLEANUP_VERSION_KEY, LEGACY_AUTH_CLEANUP_VERSION);
}
