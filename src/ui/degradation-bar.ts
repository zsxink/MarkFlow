import { getMode, switchToWysiwyg } from '../editor';

const BAR_ID = 'degradation-bar';
export interface DegradationInfo {
  tier: 'large' | 'huge';
  size: string;
  lines: number;
  readOnly?: boolean;
}
export function showDegradationBar(_info: DegradationInfo): void {
  hideDegradationBar();
  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.className = 'degradation-bar';
  bar.hidden = getMode() !== 'source';
  bar.title = '可在 设置 → 高级 → 文档处理 中调整文档大小和最大行数阈值';
  const icon = document.createElement('span');
  icon.className = 'degradation-icon';
  icon.textContent = 'ⓘ';
  const message = document.createElement('span');
  message.className = 'degradation-message';
  const heading = document.createElement('strong');
  heading.textContent = '已在源码模式打开';
  message.append(heading, ' 此文档超过所见即所得大小或行数阈值。你仍可切换到所见即所得。');
  const actions = document.createElement('span');
  actions.className = 'degradation-actions';
  const switchButton = document.createElement('button');
  switchButton.className = 'degradation-btn';
  switchButton.textContent = '切换到所见即所得';
  switchButton.addEventListener('click', () => switchToWysiwyg());
  const dismiss = document.createElement('button');
  dismiss.className = 'degradation-close';
  dismiss.title = '关闭提示';
  dismiss.setAttribute('aria-label', '关闭提示');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', hideDegradationBar);
  actions.append(switchButton, dismiss);
  bar.append(icon, message, actions);
  document.getElementById('editor-area')?.prepend(bar);
}
export function hideDegradationBar(): void {
  document.getElementById(BAR_ID)?.remove();
}
