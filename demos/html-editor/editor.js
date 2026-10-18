(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const frame = $('preview');
  const presets = window.CanvasFlowHtmlPresets;
  const store = 'canvasflow-html-editor-demo-v1';
  let html = '<!doctype html>\n' + presets.example().documentElement.outerHTML, history = [], future = [], selected = null, textRange = null, geometry = null, mode = 'edit', channel;
  try { html = localStorage.getItem(store) || html; } catch (_) {}
  const notify = message => { $('status').textContent = message; };
  const parse = () => new DOMParser().parseFromString(html, 'text/html');
  const serialize = doc => '<!doctype html>\n' + doc.documentElement.outerHTML;
  const resolve = (doc, path) => path.reduce((el, index) => el?.children[index], doc.documentElement);
  function save() {
    $('source').value = html;
    $('export').disabled = false; $('handoff').disabled = false;
    $('undo').disabled = !history.length; $('redo').disabled = !future.length;
    try { localStorage.setItem(store, html); notify('已保存到本地 · ' + new Date().toLocaleTimeString()); }
    catch (_) { notify('本地保存失败，请导出 HTML 保存'); }
  }
  function commit(next, redraw = true) {
    if (next === html) return;
    history.push(html); if (history.length > 60) history.shift(); future = []; html = next;
    save(); if (redraw) render();
  }
  function bridge(token, editing) {
    let current;
    const pathOf = el => { const p = []; while (el && el !== document.documentElement) { p.unshift(Array.prototype.indexOf.call(el.parentElement.children, el)); el = el.parentElement; } return p; };
    const send = (el, range = null) => {
      if (!el) return;
      current?.removeAttribute('data-cf-selected'); current = el;
      current.setAttribute('data-cf-selected', '');
      const cs = getComputedStyle(el);
      const styles = {}; for (const key of ['fontSize','fontWeight','color','backgroundColor','textAlign','lineHeight','padding','margin','borderRadius']) styles[key] = cs[key];
      const rect = el.getBoundingClientRect(), bodyStyle = getComputedStyle(document.body);
      parent.postMessage({channel:token, path:pathOf(el), tag:el.tagName, text:el.textContent, leaf:!el.children.length, styles, range,
        geometry:{left:rect.left,width:rect.width,pageWidth:document.documentElement.clientWidth,padLeft:parseFloat(bodyStyle.paddingLeft)||0,padRight:parseFloat(bodyStyle.paddingRight)||0,offset:parseFloat(cs.left)||0,position:cs.position}}, '*');
    };
    if (!editing) return;
    const css = document.createElement('style'); css.textContent = '[data-cf-selected]{outline:2px solid Highlight!important;outline-offset:2px!important}html [data-animate]{animation:none!important}'; document.head.append(css);
    document.addEventListener('click', e => {
      if (e.target.closest('[data-cf-controls]')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const selection = getSelection();
      if (selection && !selection.isCollapsed && selection.rangeCount) {
        const r = selection.getRangeAt(0);
        const el = r.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
        const prefix = document.createRange(); prefix.selectNodeContents(el); prefix.setEnd(r.startContainer, r.startOffset);
        const start = prefix.toString().length;
        send(el, {start,end:start+r.toString().length,text:r.toString()});
      } else send(e.target);
    }, true);
    document.addEventListener('submit', e => e.preventDefault(), true);
    addEventListener('message', e => {
      if (e.source !== parent || e.data?.channel !== token) return;
      if (e.data.type === 'parent') send(current?.parentElement);
      if (e.data.type === 'restore') { const el = e.data.path.reduce((n, i) => n?.children[i], document.documentElement); if (el && !['HEAD','HTML','BODY'].includes(el.tagName)) { const slide = el.closest('[data-slide]'); if (slide) document.dispatchEvent(new CustomEvent('cf-show-page',{detail:slide})); send(el); } }
    });
  }
  function render() {
    channel = crypto.randomUUID();
    const doc = parse();
    $('presetTheme').value = doc.documentElement.dataset.cfTheme || 'business';
    $('presetAnimation').value = doc.documentElement.dataset.cfAnimation || 'fade';
    $('presetMode').value = doc.documentElement.dataset.cfMode || 'slides';
    // Append only: source child paths stay stable; editor artifacts never enter html.
    const script = doc.createElement('script');
    script.textContent = '(' + bridge.toString() + ')(' + JSON.stringify(channel) + ',' + (mode === 'edit') + ')';
    doc.body.append(script);
    frame.srcdoc = serialize(doc);
    $('edit').setAttribute('aria-pressed', String(mode === 'edit'));
    $('play').setAttribute('aria-pressed', String(mode === 'play'));
  }
  function resetSelection() { selected = null; textRange = null; geometry = null; $('selection').textContent = '点击预览中的文字、图片或容器'; $('text').disabled = true; $('image').disabled = true; }
  function rgbHex(value) { const numbers = value.match(/[\d.]+/g); return numbers?.length >= 3 ? '#' + numbers.slice(0,3).map(x => Number(x).toString(16).padStart(2,'0')).join('') : '#ffffff'; }
  addEventListener('message', e => {
    if (e.source !== frame.contentWindow || e.data?.channel !== channel || mode !== 'edit' || !Array.isArray(e.data.path)) return;
    const data = e.data, el = resolve(parse(), data.path);
    if (!el || el.tagName !== data.tag || ['HTML','HEAD','BODY','SCRIPT','STYLE','LINK','META'].includes(data.tag)) { resetSelection(); notify('此元素由脚本生成或不支持编辑'); return; }
    selected = data.path;
    textRange = data.range || null; geometry = data.geometry;
    $('selection').textContent = textRange ? '文字选区：“' + textRange.text + '”' : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' · ' + (el.className || '无 class');
    $('text').disabled = !data.leaf || data.tag === 'IMG'; $('text').value = data.leaf && data.tag !== 'IMG' ? data.text : '';
    $('image').disabled = data.tag !== 'IMG';
    for (const key of ['fontSize','fontWeight','color','backgroundColor','textAlign','padding','margin','borderRadius']) {
      $(key).value = key.includes('Color') || key === 'color' ? rgbHex(data.styles[key]) : ['fontWeight','textAlign'].includes(key) ? data.styles[key] : parseFloat(data.styles[key]) || 0;
    }
    $('lineHeight').value = (parseFloat(data.styles.lineHeight) / parseFloat(data.styles.fontSize) || 1.5).toFixed(1);
  });
  frame.addEventListener('load', () => { if (selected) frame.contentWindow.postMessage({channel, type:'restore', path:selected}, '*'); });
  function mutate(fn) { if (!selected) return notify('请先选择元素'); const doc = parse(), el = resolve(doc, selected); if (!el) return; fn(el); commit(serialize(doc)); }
  $('text').onchange = () => mutate(el => { if (!el.children.length) el.textContent = $('text').value; });
  function alignOnPage(alignment) {
    if (!alignment || !selected || !geometry) return notify('请先选择需要对齐的文字块');
    const g = geometry;
    if (['absolute','fixed','sticky'].includes(g.position)) return notify('此元素使用特殊定位，Demo 暂不自动移动');
    const available = g.pageWidth-g.padLeft-g.padRight;
    const target = alignment === 'left' ? g.padLeft : alignment === 'center' ? g.padLeft+(available-g.width)/2 : g.pageWidth-g.padRight-g.width;
    mutate(el => {
      el.style.setProperty('text-align',alignment,'important');
      el.style.setProperty('position','relative','important');
      el.style.setProperty('left',(g.offset+target-g.left)+'px','important');
    });
  }
  for (const key of ['fontSize','fontWeight','color','backgroundColor','textAlign','lineHeight','padding','margin','borderRadius']) $(key).onchange = () => {
    if (!$(key).checkValidity()) return notify('请填写有效数值');
    if (key === 'textAlign' && $('alignScope').value === 'page') return alignOnPage($('textAlign').value);
    if (textRange && ['fontSize','fontWeight','color'].includes(key)) {
      const doc = parse(), el = resolve(doc, selected);
      if (!el) return;
      const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = []; let node;
      while ((node = walker.nextNode())) nodes.push(node);
      let total = 0, start, end;
      for (const n of nodes) {
        const next = total + n.length;
        if (!start && textRange.start < next) start = [n,textRange.start-total];
        if (!end && textRange.end <= next) end = [n,textRange.end-total];
        total = next;
      }
      if (!start || !end) return notify('文字选区已失效，请重新拖选');
      const r = doc.createRange(); r.setStart(...start); r.setEnd(...end);
      if (r.toString() !== textRange.text) return notify('文字内容已变化，请重新拖选');
      const span = doc.createElement('span'); span.append(r.extractContents()); r.insertNode(span);
      span.style.setProperty(key.replace(/[A-Z]/g,c => '-'+c.toLowerCase()), $(key).value + (key === 'fontSize' ? 'px' : ''), 'important');
      selected = []; let current = span;
      while (current !== doc.documentElement) { selected.unshift(Array.prototype.indexOf.call(current.parentElement.children,current)); current = current.parentElement; }
      textRange = null; commit(serialize(doc));
    } else mutate(el => el.style.setProperty(key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), $(key).value + (['fontSize','padding','margin','borderRadius'].includes(key) ? 'px' : ''), 'important'));
  };
  $('applyAlign').onclick = () => {
    if ($('alignScope').value === 'page') alignOnPage($('textAlign').value);
    else mutate(el => el.style.setProperty('text-align',$('textAlign').value,'important'));
  };
  $('parent').onclick = () => frame.contentWindow.postMessage({channel,type:'parent'}, '*');
  $('edit').onclick = () => { mode = 'edit'; render(); };
  $('play').onclick = () => { mode = 'play'; resetSelection(); render(); notify('演示模式 · 页面交互已启用'); };
  $('theme').onclick = () => document.documentElement.classList.toggle('theme-dark');
  $('applyPresets').onclick = () => {
    if ($('source').value !== html) return notify('请先应用源码修改，再切换预设');
    try {
      const doc = presets.apply(parse(),{theme:$('presetTheme').value,animation:$('presetAnimation').value,mode:$('presetMode').value});
      resetSelection(); commit(serialize(doc));
      notify('预设已写入 HTML · 点击“交互演示”体验效果');
    } catch (error) { notify(error.message); }
  };
  $('matchPresets').onclick = () => {
    const words = $('presetKeywords').value.trim();
    if (!words) return notify('先输入风格、动画或浏览方式关键词');
    let count = 0;
    for (const [id, rules] of [
      ['presetTheme', [['paper',/纸张|贴纸|手账/],['tech',/科技|暗色|赛博/],['business',/商务|极简|简洁/]]],
      ['presetAnimation', [['stagger',/逐条|依次|逐项/],['zoom',/缩放|放大/],['rise',/上滑|上移|浮入/],['fade',/淡入|渐显/]]],
      ['presetMode', [['scroll',/滚动|长页|长图/],['slides',/翻页|幻灯|演示/]]]
    ]) { const match = rules.find(([,re]) => re.test(words)); if (match) { $(id).value = match[0]; count++; } }
    notify(count ? '已匹配 '+count+' 类预设，点击“应用预设”确认' : '未匹配到常用关键词，请用下拉框选择');
  };
  $('loadPresetExample').onclick = () => {
    if ($('source').value !== html) return notify('请先应用源码修改，再加载示例');
    resetSelection(); commit(serialize(presets.example())); notify('已加载三页示例，原内容可通过撤销恢复');
  };
  $('copyContract').onclick = async () => {
    const config = '当前选择：'+presets.themes[$('presetTheme').value]+' / '+presets.animations[$('presetAnimation').value]+' / '+presets.modes[$('presetMode').value];
    const content = config+'\n\n'+presets.contract;
    try { await navigator.clipboard.writeText(content); notify('已复制 AI 生成规范'); }
    catch (_) { $('contractCopy').hidden = false; $('contractCopy').value = content; $('contractCopy').focus(); $('contractCopy').select(); notify('请按 Ctrl+C 复制生成规范'); }
  };
  $('apply').onclick = () => { resetSelection(); commit($('source').value); };
  $('source').addEventListener('input', () => {
    const pending = $('source').value !== html;
    $('export').disabled = pending; $('handoff').disabled = pending;
    if (pending) notify('源码有未应用的修改，请先点击“应用源码到预览”');
  });
  $('apply').addEventListener('click', () => { $('export').disabled = false; $('handoff').disabled = false; });
  $('undo').onclick = () => { if (!history.length) return; future.push(html); html = history.pop(); resetSelection(); save(); render(); };
  $('redo').onclick = () => { if (!future.length) return; history.push(html); html = future.pop(); resetSelection(); save(); render(); };
  $('import').onclick = () => $('file').click();
  $('file').onchange = async () => { const f = $('file').files[0]; if (!f) return; try { const next = await f.text(); resetSelection(); commit(next); notify('已导入 ' + f.name); } catch (_) { notify('导入失败'); } $('file').value = ''; };
  $('image').onclick = () => $('imageFile').click();
  $('imageFile').onchange = () => { const f = $('imageFile').files[0]; if (!f || !f.type.startsWith('image/')) return; const path = selected?.slice(); const reader = new FileReader(); reader.onload = () => { if (JSON.stringify(path) !== JSON.stringify(selected)) return notify('选中元素已改变，请重新选择图片'); mutate(el => { if (el.tagName === 'IMG') { el.src = reader.result; el.removeAttribute('srcset'); el.removeAttribute('sizes'); el.closest('picture')?.querySelectorAll('source').forEach(s => s.remove()); } }); }; reader.onerror = () => notify('图片读取失败'); reader.readAsDataURL(f); $('imageFile').value = ''; };
  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = (parse().title || 'CanvasFlow作品').replace(/[<>:"/\\|?*]/g,'_') + '.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); notify('已导出最新 HTML');
  };
  $('handoff').onclick = async () => {
    const prompt = '请基于以下最新 HTML 修改，保留未涉及的内容、手动样式和交互，返回完整 HTML。\n修改要求：' + $('request').value + '\n\n```html\n' + html + '\n```';
    try { await navigator.clipboard.writeText(prompt); notify('已复制最新 HTML 和修改要求'); } catch (_) { $('source').value = prompt; $('source').focus(); $('source').select(); notify('请按 Ctrl+C 复制，复制后刷新源码框再编辑'); }
  };
  resetSelection(); save(); render();
})();
