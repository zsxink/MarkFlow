import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { showTableContextMenu } from '../components/tableContextMenu';

/**
 * 表格编辑插件（task 2.2 / D3）。
 *
 * `props.handleDOMEvents.contextmenu`：命中 `td/th` 时 `preventDefault + stopPropagation`
 * 并弹出表格专用右键菜单——与 `imageBubblePlugin`（`editor.image.bubble.ts`）的模式一致。
 * 该插件在 editor DOM 内先于 document 级 contextmenu 处理，因此浏览器默认菜单
 * 与通用文本菜单均不会出现（`main.ts` document 级 preventDefault 在表格菜单之后
 * 才收到事件）。
 *
 * 非表格（普通文本）右键不拦截，交给通用 contextmenu 流程。
 */
export function tablePlugin(): Extension {
  return Extension.create({
    name: 'tableEditor',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('table-context-menu'),
          props: {
            handleDOMEvents: {
              contextmenu(_view, event) {
                const target = event.target as HTMLElement | null;
                if (!target) return false;
                const cell = target.closest('td, th');
                if (!cell) return false;
                event.preventDefault();
                event.stopPropagation();
                showTableContextMenu(event.clientX, event.clientY, { cell: cell as HTMLElement });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}