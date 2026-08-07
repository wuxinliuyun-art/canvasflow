"use strict";

const desktop = window.canvasflowDesktop;
const image = document.getElementById("frozenScreen");
const selection = document.getElementById("selection");
const sizeLabel = document.getElementById("sizeLabel");
let start = null;
let crop = null;

desktop.onCaptureInit(payload => { image.src = payload.dataUrl; });

function point(event) { return { x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) }; }
function update(current) {
  const x = Math.min(start.x, current.x), y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x), height = Math.abs(current.y - start.y);
  selection.classList.remove("hidden");
  Object.assign(selection.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;
  crop = { x: x / innerWidth * 100, y: y / innerHeight * 100, w: width / innerWidth * 100, h: height / innerHeight * 100 };
}
function confirm() {
  if (!crop || crop.w * innerWidth / 100 < 12 || crop.h * innerHeight / 100 < 12) return;
  desktop.submitSelection(crop);
}

addEventListener("mousedown", event => { if (event.button !== 0) return; start = point(event); crop = null; selection.classList.add("hidden"); });
addEventListener("mousemove", event => { if (start) update(point(event)); });
addEventListener("mouseup", event => { if (!start) return; update(point(event)); start = null; });
addEventListener("dblclick", confirm);
addEventListener("keydown", event => { if (event.key === "Escape") desktop.cancelSelection(); if (event.key === "Enter") confirm(); });
