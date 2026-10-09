import { DURATION, DEFAULT_REGION, frameAt, entryProgress, eventAt, safeProgress, normalizeDemoQuery } from './demo-model.mjs';
import { mountChrome, demoBand } from '/scenarios/shared.mjs';

mountChrome('product');
document.querySelector('#conversion').innerHTML = demoBand();
document.querySelectorAll('.brand').forEach(link => { link.href = '/experience/'; });
document.querySelectorAll('a[href="/#capabilities"]').forEach(link => { link.href = '#capabilities'; });
document.querySelector('#main-nav a[href="#capabilities"]').setAttribute('aria-current', 'page');

const $ = selector => document.querySelector(selector);
const stage = $('#scene-stage');
const sprite = $('#demo-vehicle');
const targetBox = $('#target-box');
const regionLayer = $('#attention-region');
const handle = $('#region-handle');
const scrubber = $('#playback-position');
const playButton = $('#play-pause');
const evidenceDialog = $('#evidence-dialog');
const state = { progress: 0, playing: false, mode: 'industry', ruleEnabled: true, selectedNode: 'condition', region: DEFAULT_REGION.map(point => ({ ...point })) };
let animation;
let lastTimestamp;
let entry = entryProgress(state.region);
let lastResultKey;
let currentEvent;
let lastAnnouncement;
let lastPhase;
const names = ['input', 'frames', 'detection', 'tracking', 'condition', 'output'];
const nodeCopy = {
  input: ['视频输入', '固定视角的影像是分析素材。本样片用预设画面与模拟车辆展示处理过程。'],
  frames: ['抽帧处理', '从连续影像中提取分析画面，后续节点处理相应帧的数据。'],
  detection: ['车辆检测', '识别车辆及画面位置。本演示仅展示预设的白色车辆，不运行真实识别模型。'],
  tracking: ['目标跟踪', '关联连续画面中的同一目标。本样片始终使用同一辆模拟车辆。'],
  condition: ['进入条件判断', '示例条件：车辆中心由关注区域外进入区域内。拖动区域可改变判断。'],
  output: ['事件输出', '整理事件线索、来源与关联画面。示例证据可回看，也可预约了解实际产品。'],
};

function announce(message) {
  if (message !== lastAnnouncement) { $('#demo-status').textContent = message; lastAnnouncement = message; }
}
function timeLabel(progress) {
  return `00:${String(Math.floor(safeProgress(progress) * DURATION / 1000)).padStart(2, '0')}`;
}
function preciseTime(progress) { return `${(safeProgress(progress) * DURATION / 1000).toFixed(1)} 秒`; }
function canJudge() { return state.mode === 'industry' && state.ruleEnabled; }
function configureChain() {
  const judging = canJudge();
  $('#chain-heading').textContent = judging ? '从画面到事件' : '从画面到目标';
  $('.chain-node[data-node="output"] strong').textContent = judging ? '事件输出' : '目标结果输出';
  $('#node-list').querySelectorAll('button').forEach(button => button.classList.toggle('bypassed', !judging && ['tracking', 'condition'].includes(button.dataset.node)));
}
function updateRegion() {
  regionLayer.style.clipPath = `polygon(${state.region.map(point => `${point.x * 100}% ${point.y * 100}%`).join(',')})`;
  const handleX = Math.min(.86, Math.max(.14, Math.max(...state.region.map(point => point.x)) + .08));
  const handleY = Math.min(.84, Math.max(.12, Math.max(...state.region.map(point => point.y)) + .075));
  handle.style.left = `${handleX * 100}%`;
  handle.style.top = `${handleY * 100}%`;
  entry = entryProgress(state.region);
  lastResultKey = undefined;
}
function selectNode(name, focus = false) {
  state.selectedNode = name;
  stage.dataset.inspection = name;
  const targetOutput = name === 'output' && !canJudge();
  $('#node-title').textContent = targetOutput ? '目标结果输出' : nodeCopy[name][0];
  $('#node-description').textContent = targetOutput
    ? '展示检索目标及画面位置。本示例没有启用事件规则，不产生事件证据。'
    : (name === 'condition' || name === 'tracking') && !canJudge()
      ? '当前示例仅展示目标检索，该节点未启用。行业场景中可以加入事件判断。'
      : nodeCopy[name][1];
  $('#node-list').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.node === name)));
  if (focus) $(`[data-node="${name}"]`).focus({ preventScroll: true });
}
function updateChain(timestamp = 0) {
  const available = canJudge() ? names : ['input', 'frames', 'detection', 'output'];
  const phase = state.playing ? available[Math.floor(timestamp / 420) % available.length] : null;
  if (lastPhase !== phase) {
    $('#node-list').querySelectorAll('button').forEach(button => button.classList.toggle('processing', button.dataset.node === phase));
    lastPhase = phase;
  }
}
function renderResult(frame) {
  const hasEvent = canJudge() && entry !== null && state.progress >= entry;
  const key = `${state.mode}:${canJudge()}:${entry}:${hasEvent}`;
  if (key === lastResultKey) return;
  lastResultKey = key;
  currentEvent = hasEvent ? eventAt(state.progress, { region: state.region }) : null;
  $('#result-preview').dataset.result = currentEvent ? 'event' : canJudge() ? 'waiting' : 'detection';
  $('#show-evidence').disabled = !currentEvent || !sprite.complete || !sprite.naturalWidth || !$('#road-image').complete || !$('#road-image').naturalWidth;
  if (currentEvent) {
    $('#result-eyebrow').textContent = '示例事件 · 有关联证据';
    $('#result-title').textContent = '区域进入提示';
    $('#result-description').textContent = `演示车辆 01 · ${preciseTime(currentEvent.progress)}进入指定区域`;
    announce('已产生区域进入示例事件，可以查看进入前后的关联证据。');
  } else if (!canJudge()) {
    $('#result-eyebrow').textContent = '目标检索 · 演示结果';
    $('#result-title').textContent = '白色车辆 · 目标 01';
    $('#result-description').textContent = '展示目标与位置，不进行区域进入判断。';
    announce('当前仅展示目标检索，没有区域进入事件。');
  } else {
    $('#result-eyebrow').textContent = '事件判断 · 演示结果';
    $('#result-title').textContent = entry === null ? '当前区域没有进入事件' : '等待车辆进入';
    $('#result-description').textContent = entry === null ? '可拖动区域或将关注区域复位。' : '播放或拖动时间轴，查看位置变化。';
    announce(entry === null ? '模拟车辆不会进入当前关注区域。' : '回放位置尚未到进入区域时刻。');
  }
}
function render(timestamp = 0) {
  const frame = frameAt(state.progress, state.region);
  sprite.style.left = targetBox.style.left = `${frame.x * 100}%`;
  sprite.style.top = targetBox.style.top = `${frame.y * 100}%`;
  sprite.style.transform = targetBox.style.transform = `translate(-50%, -50%) scale(${frame.scale})`;
  stage.dataset.inside = String(frame.inside && canJudge());
  stage.dataset.rule = String(canJudge());
  stage.dataset.progress = state.progress.toFixed(4);
  scrubber.value = String(Math.round(state.progress * DURATION));
  scrubber.setAttribute('aria-valuetext', `${(state.progress * DURATION / 1000).toFixed(1)}秒，共12秒`);
  $('#playback-time').textContent = `${timeLabel(state.progress)} / 00:12`;
  $('#scene-state').textContent = !canJudge() ? '目标识别 · 演示' : frame.inside ? '目标位于关注区域内' : '目标位于关注区域外';
  updateChain(timestamp);
  renderResult(frame);
}
function setProgress(progress) { state.progress = safeProgress(progress); render(); }
function setPlayIcon() {
  playButton.setAttribute('aria-label', state.playing ? '暂停巡查演示' : '播放巡查演示');
  playButton.querySelector('img').src = `/assets/scenarios/icons/player-${state.playing ? 'pause' : 'play'}.svg`;
  stage.dataset.playing = String(state.playing);
}
function pause() { state.playing = false; cancelAnimationFrame(animation); lastTimestamp = undefined; setPlayIcon(); updateChain(); }
function tick(timestamp) {
  if (!state.playing) return;
  if (lastTimestamp !== undefined) state.progress = safeProgress(state.progress + Math.min(timestamp - lastTimestamp, 100) / DURATION);
  lastTimestamp = timestamp;
  render(timestamp);
  if (state.progress >= 1) { pause(); announce('巡查示例已播放完毕，可以回放或查看事件证据。'); }
  else animation = requestAnimationFrame(tick);
}
function play() { if (state.progress >= 1) setProgress(0); state.playing = true; lastTimestamp = undefined; setPlayIcon(); animation = requestAnimationFrame(tick); }

playButton.addEventListener('click', () => state.playing ? pause() : play());
$('#reset-playback').addEventListener('click', () => { pause(); setProgress(0); announce('回放已回到起点。'); });
scrubber.addEventListener('input', () => { pause(); setProgress(Number(scrubber.value) / DURATION); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function startExperience() {
  document.documentElement.classList.add('is-exploring');
  $('#return-intro').hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#experience-title').focus({ preventScroll: true });
  pause(); setProgress(0); play();
}
$('#begin-experience').addEventListener('click', startExperience);
$('#return-intro').addEventListener('click', () => {
  pause(); document.documentElement.classList.remove('is-exploring');
  $('#return-intro').hidden = true;
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#begin-experience').focus({ preventScroll: true });
});
document.querySelectorAll('a[href="#capabilities"]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); startExperience(); }));

function setMode(mode) {
  pause(); state.mode = mode; state.progress = 0; lastResultKey = undefined;
  stage.dataset.mode = mode;
  $('.task-tabs').querySelectorAll('button').forEach(button => { const selected = button.id === `task-${mode}`; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; button.querySelector('img').classList.toggle('blue-icon', selected); });
  $('#task-panel').setAttribute('aria-labelledby', `task-${mode}`);
  for (const [name, control] of [['industry', '#industry-controls'], ['language', '#language-controls'], ['image', '#image-controls']]) $(control).hidden = name !== mode;
  const descriptions = {
    industry: ['区域进入 · 演示示意', '对象：车辆　条件：由外向内', '播放演示，或拖动关注区域，查看进入条件如何影响结果。'],
    language: ['自然语言 · 目标检索示意', '示例：查找白色车辆', '运行预设示例，观察目标与位置；该入口不自动配置事件规则。'],
    image: ['以图搜图 · 目标检索示意', '参考图：白色车辆', '使用示例参考图，展示相似目标的位置；当前没有实时图像检索服务。'],
  };
  $('.scene-caption>span').textContent = descriptions[mode][0];
  $('#scene-method').textContent = descriptions[mode][1];
  $('#interaction-hint').textContent = descriptions[mode][2];
  $('#reset-region').hidden = mode !== 'industry';
  configureChain();
  selectNode(canJudge() ? 'condition' : 'detection');
  render();
}
$('.task-tabs').addEventListener('click', event => { const button = event.target.closest('[role=tab]'); if (button) setMode(button.id.replace('task-', '')); });
$('.task-tabs').addEventListener('keydown', event => {
  const buttons = [...$('.task-tabs').querySelectorAll('button')];
  let index = buttons.indexOf(document.activeElement);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = buttons.length - 1;
  else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index].click(); buttons[index].focus({ preventScroll: true });
});
function setJudgement(enabled) {
  state.ruleEnabled = enabled;
  $('#detection-only').setAttribute('aria-pressed', String(!enabled));
  $('#event-judgement').setAttribute('aria-pressed', String(enabled));
  configureChain();
  selectNode(enabled ? 'condition' : 'detection');
  lastResultKey = undefined; render();
}
$('#detection-only').addEventListener('click', () => setJudgement(false));
$('#event-judgement').addEventListener('click', () => setJudgement(true));
$('#language-controls').addEventListener('submit', event => {
  event.preventDefault();
  const supported = normalizeDemoQuery($('#demo-query').value);
  $('#demo-query').setAttribute('aria-invalid', String(!supported));
  $('#query-hint').textContent = supported ? '正在播放预设的白色车辆检索示例。' : '本样片支持“查找白色车辆”；其他目标可预约验证，当前未运行在线检索。';
  if (!supported) { pause(); $('#demo-query').focus(); announce('请输入本样片支持的预设示例。'); return; }
  pause(); setProgress(0); play();
});
$('#demo-query').addEventListener('input', () => $('#demo-query').removeAttribute('aria-invalid'));
$('#run-image-demo').addEventListener('click', () => { pause(); setProgress(0); play(); announce('正在播放示例参考图的目标检索演示。'); });
$('#node-list').addEventListener('click', event => { const button = event.target.closest('[data-node]'); if (button) selectNode(button.dataset.node); });

function offsetRegion(dx, dy, original = DEFAULT_REGION) {
  const minX = Math.min(...original.map(point => point.x)); const maxX = Math.max(...original.map(point => point.x));
  const minY = Math.min(...original.map(point => point.y)); const maxY = Math.max(...original.map(point => point.y));
  dx = Math.max(-minX, Math.min(1 - maxX, dx)); dy = Math.max(-minY, Math.min(1 - maxY, dy));
  state.region = original.map(point => ({ x: point.x + dx, y: point.y + dy }));
  updateRegion(); render();
}
let drag;
handle.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pause(); event.preventDefault();
  handle.focus({ preventScroll: true });
  const rect = stage.getBoundingClientRect();
  drag = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, region: state.region.map(point => ({ ...point })) };
  handle.setPointerCapture(event.pointerId);
});
handle.addEventListener('pointermove', event => { if (drag) offsetRegion((event.clientX - drag.x) / drag.width, (event.clientY - drag.y) / drag.height, drag.region); });
function finishDrag() { if (drag) { drag = undefined; announce('关注区域已移动，判断已按当前位置重新计算。'); } }
handle.addEventListener('pointerup', finishDrag);
handle.addEventListener('pointercancel', finishDrag);
handle.addEventListener('lostpointercapture', finishDrag);
function resetRegion() { state.region = DEFAULT_REGION.map(point => ({ ...point })); updateRegion(); render(); announce('关注区域已复位。'); }
$('#reset-region').addEventListener('click', resetRegion);
handle.addEventListener('keydown', event => {
  if (event.key === 'Home') { event.preventDefault(); pause(); resetRegion(); return; }
  const vectors = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!vectors[event.key]) return;
  event.preventDefault(); pause();
  const amount = event.shiftKey ? .04 : .012;
  offsetRegion(vectors[event.key][0] * amount, vectors[event.key][1] * amount, state.region);
});

function drawEvidence(canvas, frame) {
  const context = canvas.getContext('2d');
  const width = canvas.width; const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.drawImage($('#road-image'), 0, 0, width, height);
  context.beginPath();
  state.region.forEach((point, index) => { if (index === 0) context.moveTo(point.x * width, point.y * height); else context.lineTo(point.x * width, point.y * height); });
  context.closePath(); context.fillStyle = '#0866ff50'; context.fill();
  context.strokeStyle = '#66b5ff'; context.lineWidth = 2; context.stroke();
  const size = width * .084 * frame.scale;
  context.drawImage(sprite, frame.x * width - size / 2, frame.y * height - size / 2, size, size);
  const boxWidth = width * .059 * frame.scale;
  const boxHeight = boxWidth / .84;
  context.strokeStyle = frame.inside ? '#75ffd8' : '#50b7ff'; context.lineWidth = 2;
  context.strokeRect(frame.x * width - boxWidth / 2, frame.y * height - boxHeight / 2, boxWidth, boxHeight);
  context.fillStyle = '#0866ff'; context.fillRect(frame.x * width - boxWidth / 2, frame.y * height - boxHeight / 2 - 23, 65, 21);
  context.fillStyle = '#fff'; context.font = '12px Microsoft YaHei, sans-serif'; context.fillText('车辆 01', frame.x * width - boxWidth / 2 + 7, frame.y * height - boxHeight / 2 - 8);
}
$('#show-evidence').addEventListener('click', () => {
  if (!currentEvent || $('#show-evidence').disabled) return;
  pause();
  drawEvidence($('#evidence-before'), currentEvent.evidenceBefore);
  drawEvidence($('#evidence-after'), currentEvent.evidenceAfter);
  $('#before-time').textContent = preciseTime(currentEvent.evidenceBefore.progress);
  $('#after-time').textContent = preciseTime(currentEvent.evidenceAfter.progress);
  evidenceDialog.showModal(); document.body.classList.add('evidence-open');
});
$('#close-evidence').addEventListener('click', () => evidenceDialog.close());
evidenceDialog.addEventListener('close', () => document.body.classList.remove('evidence-open'));
evidenceDialog.addEventListener('click', event => { if (event.target === evidenceDialog) { const box = evidenceDialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) evidenceDialog.close(); } });
$('#replay-event').addEventListener('click', () => { if (!currentEvent) return; const start = currentEvent.evidenceBefore.progress; evidenceDialog.close(); setProgress(Math.max(0, start - .08)); playButton.focus({ preventScroll: true }); play(); });

for (const asset of [sprite, $('#road-image')]) asset.addEventListener('load', () => { lastResultKey = undefined; render(); });

updateRegion(); selectNode('condition'); setPlayIcon(); render();
