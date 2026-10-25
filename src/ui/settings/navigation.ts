import { logException } from '../../infra/logger';
import { SETTINGS_CATEGORIES } from './markup';

export function initSettingsNavigation(root: HTMLElement): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.settings-tab'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('.settings-panel'));
  const search = root.querySelector<HTMLInputElement>('#settings-search')!;
  function activate(id: string) {
    tabs.forEach(tab => {
      const active = tab.dataset.panel === id;
      tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== `panel-${id}`; });
    root.querySelector('#settings-current-category')!.textContent = SETTINGS_CATEGORIES.find(category => category[0] === id)?.[1] ?? '';
    root.querySelector('.settings-panels')!.scrollTop = 0;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.panel!));
    tab.addEventListener('keydown', event => {
      const available = tabs.filter(item => !item.hidden);
      const visibleIndex = available.indexOf(tab);
      let next: HTMLButtonElement | undefined;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = available[(visibleIndex + 1) % available.length];
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = available[(visibleIndex + available.length - 1) % available.length];
      else if (event.key === 'Home') next = available[0];
      else if (event.key === 'End') next = available[available.length - 1];
      if (next) { event.preventDefault(); activate(next.dataset.panel!); next.focus(); }
    });
    if (index === 0) tab.tabIndex = 0;
  });
  search.addEventListener('input', () => {
    root.querySelectorAll('mark').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent ?? '')));
    const query = search.value.trim().toLocaleLowerCase();
    for (const panel of panels) {
      let matches = !query;
      for (const group of panel.querySelectorAll<HTMLElement>('.settings-group')) {
        const title = group.querySelector('.settings-group-title')?.textContent ?? '';
        const rows = group.querySelectorAll<HTMLElement>('.settings-row, .settings-field, .shortcut-row');
        let groupMatch = !query || title.toLocaleLowerCase().includes(query);
        rows.forEach(row => {
          const labels = row.classList.contains('shortcut-row') ? row.textContent ?? '' : Array.from(row.querySelectorAll('.settings-label, .settings-desc, .settings-warning')).map(el => el.textContent).join(' ');
          const storage = root.querySelector<HTMLSelectElement>('#setting-image-storage');
          row.hidden = (row.id === 'setting-image-custom-row' && storage?.value !== 'custom') || (Boolean(query) && !title.toLocaleLowerCase().includes(query) && !labels.toLocaleLowerCase().includes(query));
          if (!row.hidden) groupMatch = true;
        });
        group.hidden = !groupMatch;
        matches ||= groupMatch;
      }
      if (!panel.querySelector('.settings-group')) matches ||= (panel.textContent ?? '').toLocaleLowerCase().includes(query);
      const tab = tabs.find(item => `panel-${item.dataset.panel}` === panel.id)!;
      tab.hidden = !matches;
    }
    root.querySelector('#settings-search-empty')!.toggleAttribute('hidden', tabs.some(tab => !tab.hidden));
    const target = tabs.find(tab => !tab.hidden && tab.classList.contains('active')) ?? tabs.find(tab => !tab.hidden);
    if (target) activate(target.dataset.panel!); else panels.forEach(panel => { panel.hidden = true; });
    if (query) root.querySelectorAll<HTMLElement>('.settings-label, .settings-desc, .settings-group-title').forEach(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) {
        const text = node.data; const index = text.toLocaleLowerCase().indexOf(query);
        if (index < 0) continue;
        const mark = document.createElement('mark'); mark.textContent = text.slice(index, index + query.length);
        node.replaceWith(document.createTextNode(text.slice(0,index)), mark, document.createTextNode(text.slice(index + query.length)));
      }
    });
  });
  const copy = root.querySelector<HTMLButtonElement>('#setting-copy-plantuml')!;
  const original = copy.innerHTML;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('https://www.plantuml.com/plantuml');
      if (!root.isConnected) return;
      copy.textContent = '✓'; copy.setAttribute('aria-label', '已复制');
      setTimeout(() => { if (copy.isConnected) { copy.innerHTML = original; copy.setAttribute('aria-label', '复制公共服务器地址'); } }, 1500);
    } catch (error) { logException('settings.copy', 'Failed to copy public server URL', error); }
  });
}
