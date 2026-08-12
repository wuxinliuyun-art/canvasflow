(function registerMindmapModule(global) {
  "use strict";

  const modules = global.CanvasFlowModules || (global.CanvasFlowModules = {});
  modules.mindmap = Object.freeze({
    id: "mindmap",
    version: 1,
    enabled: false,
    label: "思维导图 / 关系图",
    description: "文字、图片、图片文件夹、关系线与编组子画布。",
  });
})(window);
