/** Keep native fields as the persisted value; project one accessible visual control. */
export function syncSettingsControls(root: ParentNode = document): void {
  root.querySelectorAll<HTMLSelectElement>('.settings-select').forEach(select => {
    const wrapper = select.closest('.settings-select-control');
    if (!wrapper) return;
    const button = wrapper.querySelector<HTMLButtonElement>('.settings-select-trigger')!;
    button.firstChild!.textContent = Array.from(select.options).find(option => option.value === select.value)?.textContent ?? '';
    wrapper.querySelectorAll<HTMLElement>('[role="option"]').forEach(option => {
      option.setAttribute('aria-selected', String(option.dataset.value === select.value));
    });
  });
  root.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(input => {
    input.closest('.settings-number-shell')?.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = input.disabled; });
  });
}
export function initSettingsControls(root: HTMLElement): void {
  root.querySelectorAll<HTMLSelectElement>('.settings-select').forEach(select => {
    const wrapper = document.createElement('div');
    wrapper.className = `settings-select-control${select.classList.contains('settings-control-full') ? ' settings-control-full' : ''}${select.id.endsWith('-unit') ? ' settings-size-unit' : ''}`;
    select.before(wrapper);
    wrapper.append(select);
    select.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-select-trigger';
    button.id = `${select.id}-trigger`;
    button.setAttribute('aria-label', select.getAttribute('aria-label') ?? '选择选项');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const chevron = document.createElement('span');
    chevron.className = 'settings-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg viewBox="0 0 12 8"><path d="m2 3 4 4 4-4"/></svg>';
    button.append(document.createTextNode(''), chevron);
    const list = document.createElement('div');
    list.className = 'settings-options';
    list.id = `${select.id}-options`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', button.id);
    list.hidden = true;
    button.setAttribute('aria-controls', list.id);
    const close = () => { list.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    const open = () => {
      root.querySelectorAll<HTMLElement>('.settings-options').forEach(other => {
        if (other === list) return;
        other.hidden = true;
        other.parentElement?.querySelector('button')?.setAttribute('aria-expanded', 'false');
      });
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      (list.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
    };
    Array.from(select.options).forEach(option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.tabIndex = -1;
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSettingsControls(root);
        close(); button.focus();
      });
      list.append(item);
    });
    button.addEventListener('click', () => { if (list.hidden) open(); else close(); });
    wrapper.addEventListener('keydown', event => {
      const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); button.focus(); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) { open(); return; }
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[target]?.focus();
      }
    });
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget as Node | null)) close(); });
    select.addEventListener('change', () => syncSettingsControls(root));
    wrapper.append(button, list);
  });
  root.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(input => {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-number-shell';
    input.before(wrapper); wrapper.append(input);
    const steppers = document.createElement('span');
    steppers.className = 'settings-steppers';
    for (const direction of [1, -1]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.innerHTML = `<svg viewBox="0 0 12 8" aria-hidden="true"><path d="${direction === 1 ? 'M2 6l4-4 4 4' : 'M2 2l4 4 4-4'}"/></svg>`;
      button.setAttribute('aria-label', direction === 1 ? '增加' : '减少');
      button.addEventListener('click', () => {
        if (input.disabled) return;
        const step = input.step === 'any' ? 1 : Number(input.step) || 1;
        input.value = String(Math.min(Number(input.max) || Infinity, Math.max(Number(input.min) || 1, Number(input.value) + direction * step)));
        input.dispatchEvent(new Event('change', { bubbles: true })); input.focus();
      });
      steppers.append(button);
    }
    wrapper.append(steppers);
  });
  syncSettingsControls(root);
}
