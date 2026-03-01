// 这个脚本用于在浏览器控制台中执行来测试登录
// 在浏览器控制台中粘贴运行

// 获取表单输入框
const usernameInput = document.querySelector('input[name="username"]');
const passwordInput = document.querySelector('input[name="password"]');

// 设置值并触发事件
function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

setInputValue(usernameInput, 'admin');
setInputValue(passwordInput, '<YOUR_ADMIN_PASSWORD>');

// 点击登录按钮
setTimeout(() => {
  document.querySelector('button[type="submit"]').click();
}, 100);
