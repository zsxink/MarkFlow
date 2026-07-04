import { saveActiveDocument } from './sidebar';

let currentDestroyFn: (() => Promise<void>) | null = null;

export function showUnsavedDialog(destroyFn: () => Promise<void>) {
  const overlay = document.getElementById('unsaved-modal');
  if (!overlay) return;

  currentDestroyFn = destroyFn;

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>未保存的更改</span>
        <button class="modal-close" id="unsaved-close">✕</button>
      </div>
      <div style="padding:16px 24px;">
        <p style="margin:0 0 16px;font-size:14px;color:var(--fg);line-height:1.5;">当前文件有未保存的更改。</p>
        <div class="modal-footer" style="padding-top:0;">
          <button class="btn-secondary" id="unsaved-cancel">取消</button>
          <button class="btn-secondary" id="unsaved-discard">不保存</button>
          <button class="btn-primary" id="unsaved-save">保存</button>
        </div>
      </div>
    </div>
  `;
  overlay.hidden = false;

  const close = () => {
    overlay.hidden = true;
    currentDestroyFn = null;
  };

  const handleSave = async () => {
    const saved = await saveActiveDocument({ interactive: true });
    if (!saved) return;
    const fn = currentDestroyFn;
    if (!fn) return;
    currentDestroyFn = null;
    overlay.hidden = true;
    await fn();
  };

  const handleDiscard = async () => {
    const fn = currentDestroyFn;
    if (!fn) return;
    currentDestroyFn = null;
    overlay.hidden = true;
    await fn();
  };

  document.getElementById('unsaved-close')!.addEventListener('click', close);
  document.getElementById('unsaved-cancel')!.addEventListener('click', close);
  document.getElementById('unsaved-discard')!.addEventListener('click', handleDiscard);
  document.getElementById('unsaved-save')!.addEventListener('click', handleSave);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter') {
      handleSave();
    }
  });

  // Focus the save button by default — but setTimeout to come after the event
  // that triggered the dialog so focus works reliably
  setTimeout(() => {
    const saveBtn = document.getElementById('unsaved-save');
    if (saveBtn) saveBtn.focus();
  }, 0);
}
