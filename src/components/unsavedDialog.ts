import { showDialog } from './ui/dialog';
import { saveActiveDocument } from './sidebar';

export async function showUnsavedDialog(destroyFn: () => Promise<void>) {
  const result = await showDialog({
    title: '未保存的更改',
    body: '<p style="margin:0 0 16px;font-size:14px;color:var(--fg);line-height:1.5;">当前文件有未保存的更改。</p>',
    buttons: [
      { label: '取消', value: 'cancel' },
      { label: '不保存', value: 'discard' },
      { label: '保存', value: 'save', primary: true },
    ],
    width: '360px',
  });

  if (result === 'save') {
    const saveResult = await saveActiveDocument({ interactive: true });
    if (saveResult !== 'saved') return;
    await destroyFn();
  } else if (result === 'discard') {
    await destroyFn();
  }
  // Cancel / Escape / backdrop — do nothing, dialog stays closed
}
