// Runtime behavior checks with a minimal DOM harness; no browser/layout assertion.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname+'/presets.js','utf8');
function element(tag='section') {
  const attrs = new Set();
  return {tag,children:[],style:{setProperty(k,v){this[k]=v;}},
    append(...children){this.children.push(...children);},
    setAttribute(k){attrs.add(k);},removeAttribute(k){attrs.delete(k);},
    toggleAttribute(k,on){if(on)attrs.add(k);else attrs.delete(k);},hasAttribute(k){return attrs.has(k);},
    querySelectorAll(){return this.animations || [];},offsetWidth:100};
}
function setup(mode='slides') {
  const slides = [element(),element(),element()];
  slides.forEach(el => {el.animations = [element('h1'),element('p')];});
  const listeners = {}, head = element('head'), body = element('body');
  const doc = {head,body,documentElement:{dataset:{}},
    querySelector(){return slides[0];},querySelectorAll(){return slides;},
    getElementById(id){return [...head.children,...body.children].find(el => el.id === id);},
    createElement:element,
    addEventListener(name,fn){listeners[name]=fn;}};
  const context = {window:{scrollTo(){}},document:doc};
  vm.createContext(context); vm.runInContext(source,context);
  const api = context.window.CanvasFlowHtmlPresets;
  api.apply(doc,{theme:'paper',animation:'stagger',mode});
  return {slides,listeners,doc,context,api};
}
test('preset catalog has three themes, four animations, two modes', () => {
  const {api} = setup();
  assert.equal(Object.keys(api.themes).length,3);
  assert.equal(Object.keys(api.animations).length,4);
  assert.equal(Object.keys(api.modes).length,2);
});
test('applying twice updates owned assets without duplicating or changing content', () => {
  const {doc,api,slides} = setup();
  api.apply(doc,{theme:'tech',animation:'zoom',mode:'scroll'});
  assert.equal(doc.head.children.length,1); assert.equal(doc.body.children.length,1);
  assert.equal(doc.documentElement.dataset.cfTheme,'tech');
  assert.equal(slides.length,3);
  assert.ok(doc.getElementById('cf-preset-style').textContent.includes('prefers-reduced-motion'));
  assert.ok(!doc.getElementById('cf-preset-runtime').textContent.includes('fetch('));
  assert.throws(() => api.apply(doc,{theme:'unknown',animation:'fade',mode:'slides'}),/未知预设/);
});
test('exported inline runtime starts on page one, supports controls and keyboard boundaries', () => {
  const {doc,context,slides,listeners} = setup();
  vm.runInContext(doc.getElementById('cf-preset-runtime').textContent,context);
  const nav = doc.body.children.at(-1), [previous,counter,next] = nav.children;
  assert.equal(counter.textContent,'1 / 3'); assert.ok(previous.disabled);
  next.onclick(); assert.equal(counter.textContent,'2 / 3'); assert.ok(slides[1].hasAttribute('data-cf-active'));
  const key = k => listeners.keydown({key:k,target:{closest(){return false;}},preventDefault(){}});
  key('ArrowRight'); assert.equal(counter.textContent,'3 / 3'); assert.ok(next.disabled);
  key('ArrowRight'); assert.equal(counter.textContent,'3 / 3');
  key('ArrowLeft'); assert.equal(counter.textContent,'2 / 3');
  listeners['cf-show-page']({detail:slides[0]}); assert.equal(counter.textContent,'1 / 3');
  assert.equal(slides[0].animations[1].style['--cf-order'],1);
});
test('scroll mode hides navigation and retains all pages', () => {
  const {doc,context,slides} = setup('scroll');
  vm.runInContext(doc.getElementById('cf-preset-runtime').textContent,context);
  assert.equal(doc.body.children.at(-1).style.display,'none');
  assert.ok(slides.every(slide => slide.hasAttribute('data-cf-enter')));
});
test('unstructured legacy HTML is rejected before changing its configuration', () => {
  const {doc,api} = setup();
  const before = JSON.stringify(doc.documentElement.dataset);
  doc.querySelector = () => null;
  assert.throws(() => api.apply(doc,{theme:'paper',animation:'rise',mode:'slides'}),/尚未采用预设规范/);
  assert.equal(JSON.stringify(doc.documentElement.dataset),before);
});
