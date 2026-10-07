// CanvasFlow <-> Photoshop 互传面板 - host ExtendScript (ES3, ASCII only).
// Every public function returns "ok|..." or "err|<english message>"; the panel parses it.
// Ruler units are forced to pixels inside each call and restored afterwards.

function CF_roundUnit(value) {
    var n = (value && typeof value.as === "function") ? value.as("px") : parseFloat(value);
    return Math.round(n);
}

function CF_prepareForPng(doc) {
    if (doc.mode !== DocumentMode.RGB) doc.changeMode(ChangeMode.TORGB);
    if (doc.bitsPerChannel !== BitsPerChannelType.EIGHT) doc.bitsPerChannel = BitsPerChannelType.EIGHT;
}

function CF_savePng(doc, path) {
    var options = new PNGSaveOptions();
    options.matte = MatteType.NONE;
    doc.saveAs(new File(path), options, true, Extension.LOWERCASE);
}

function CF_ensureFolder(path) {
    var folder = new Folder(path);
    if (!folder.exists && !folder.create()) throw new Error("Cannot create temp folder: " + path);
    return folder.fsName;
}

function CF_ping() {
    return "ok|pong|" + app.version;
}

function CF_docInfo() {
    var ruler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        if (app.documents.length === 0) return "err|No document is open";
        var doc = app.activeDocument;
        return "ok|" + doc.name + "|" + CF_roundUnit(doc.width) + "x" + CF_roundUnit(doc.height);
    } catch (e) {
        return "err|" + e.message;
    } finally {
        app.preferences.rulerUnits = ruler;
    }
}

// Flatten a copy of the active document and save it as a PNG for canvas return.
// The original document is never touched.
function CF_exportMerged(dir, baseName) {
    var ruler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        if (app.documents.length === 0) return "err|No document is open";
        var doc = app.activeDocument;
        app.activeDocument = doc;
        var folder = CF_ensureFolder(dir);
        var dup = doc.duplicate();
        dup.flatten();
        CF_prepareForPng(dup);
        var path = folder + "/" + baseName + ".png";
        CF_savePng(dup, path);
        var size = CF_roundUnit(dup.width) + "x" + CF_roundUnit(dup.height);
        dup.close(SaveOptions.DONOTSAVECHANGES);
        return "ok|" + path + "|" + size;
    } catch (e) {
        return "err|Export failed: " + e.message;
    } finally {
        app.preferences.rulerUnits = ruler;
    }
}

// Export ONLY the active layer: copy it into a fresh transparent document of
// the same size and save as PNG (keeps the layer's own pixels, no compositing).
function CF_exportLayer(dir, baseName) {
    var ruler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        if (app.documents.length === 0) return "err|No document is open";
        var doc = app.activeDocument;
        app.activeDocument = doc;
        var layer = doc.activeLayer;
        if (layer.typename === "LayerSet") return "err|The active layer is a group; select a single layer";
        if (layer.typename === "ArtLayer" && layer.isBackgroundLayer) {
            // background layers cannot leave transparency, still exportable
        }
        var folder = CF_ensureFolder(dir);
        var newDoc = app.documents.add(CF_roundUnit(doc.width), CF_roundUnit(doc.height), doc.resolution, "cf-layer", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
        app.activeDocument = doc;
        layer.duplicate(newDoc, ElementPlacement.PLACEATBEGINNING);
        app.activeDocument = newDoc;
        CF_prepareForPng(newDoc);
        var path = folder + "/" + baseName + "-layer.png";
        CF_savePng(newDoc, path);
        var size = CF_roundUnit(newDoc.width) + "x" + CF_roundUnit(newDoc.height);
        newDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = doc;
        return "ok|" + path + "|" + size + "|" + layer.name;
    } catch (e) {
        return "err|Export layer failed: " + e.message;
    } finally {
        app.preferences.rulerUnits = ruler;
    }
}
