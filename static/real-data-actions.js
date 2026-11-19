const value = document.querySelector('#hashValue');
const button = document.querySelector('#copyHash');
const status = document.querySelector('#copyStatus');
if (value && button) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value.textContent.trim());
      button.textContent = '已复制';
      status.textContent = 'SHA256 已复制到剪贴板';
      setTimeout(() => { button.textContent = '复制'; status.textContent = ''; }, 1800);
    } catch {
      status.textContent = '复制失败，请手动选择哈希值';
    }
  });
}
