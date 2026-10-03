// CanvasFlow PS bridge panel - host ExtendScript (ES3, ASCII only).
// Every public function returns "ok|..." or "err|<english message>"; the panel parses it.
// Ruler units are forced to pixels inside each call and restored afterwards,
// because translate()/resize() interpret plain numbers in ruler units.

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

function CF_saveJpeg(doc, path) {
    var options = new JPEGSaveOptions();
    options.quality = 10;
    doc.saveAs(new File(path), options, true, Extension.LOWERCASE);
}

// Cap the long edge for upload: upstream models work around 1k anyway, and a
// full-resolution PNG base64 payload can take minutes on a typical uplink.
function CF_resizeForUpload(doc, maxEdge) {
    var w = CF_roundUnit(doc.width);
    var h = CF_roundUnit(doc.height);
    var longest = Math.max(w, h);
    if (maxEdge > 0 && longest > maxEdge) {
        var nw = Math.round(w * maxEdge / longest);
        var nh = Math.round(h * maxEdge / longest);
        doc.resizeImage(UnitValue(nw, "px"), UnitValue(nh, "px"), null, ResampleMethod.BICUBIC);
    }
}

function CF_hasSelection(doc) {
    try {
        if (!doc.selection) return false;
        var bounds = doc.selection.bounds; // throws when selection is empty
        return bounds !== null;
    } catch (e) {
        return false;
    }
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

function CF_hasChannel(doc, name) {
    try {
        doc.channels.getByName(name);
        return true;
    } catch (e) {
        return false;
    }
}

// One-shot export: store the selection into a temp alpha channel, then export
// the mask PNG and the upload image (plain or red-marked) in the same call.
// The channel is located by object reference (last MASKEDAREA channel), never
// by name, because channel renames can silently fail on some PS builds.
// Returns "ok|imagePath|size|fmt|maskPath|hasSelection|appliedRed";
// the channel is KEPT for CF_placeImage's local clipping and cleaned there.
function CF_exportAll(dir, baseName, fmt, maxEdge, redMode) {
    var ruler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var channelName = "CF_mask_tmp";
    try {
        if (app.documents.length === 0) return "err|No document is open";
        var doc = app.activeDocument;
        app.activeDocument = doc;
        var folder = CF_ensureFolder(dir);
        var hasSelection = CF_hasSelection(doc);

        if (hasSelection) {
            try { doc.channels.getByName(channelName).remove(); } catch (ignored) {}
            var channel = doc.channels.add();
            doc.selection.store(channel);
            try { channel.name = channelName; } catch (ignored2) {}
        }

        // Mask PNG: duplicate, flatten, unlock background, clear selection area
        var maskPath = "";
        if (hasSelection) {
            var mdup = doc.duplicate();
            mdup.flatten();
            mdup.activeLayer.isBackgroundLayer = false;
            var maskChannel = mdup.channels[mdup.channels.length - 1];
            if (!maskChannel || maskChannel.kind !== ChannelType.MASKEDAREA) {
                try { maskChannel = mdup.channels.getByName(channelName); } catch (ignored3) {}
            }
            mdup.selection.load(maskChannel, SelectionType.REPLACE);
            mdup.selection.clear();
            mdup.selection.deselect();
            try { maskChannel.remove(); } catch (ignored4) {}
            CF_prepareForPng(mdup);
            CF_resizeForUpload(mdup, maxEdge);
            maskPath = folder + "/" + baseName + "-mask.png";
            CF_savePng(mdup, maskPath);
            mdup.close(SaveOptions.DONOTSAVECHANGES);
        }

        // Upload image: plain, or with a 50% red tint over the selection
        var dup = doc.duplicate();
        dup.flatten();
        CF_prepareForPng(dup);
        CF_resizeForUpload(dup, maxEdge);
        var appliedRed = false;
        if (hasSelection && (String(redMode) === "true" || redMode === true)) {
            var selChannel = dup.channels[dup.channels.length - 1];
            if (!selChannel || selChannel.kind !== ChannelType.MASKEDAREA) {
                try { selChannel = dup.channels.getByName(channelName); } catch (ignored5) {}
            }
            if (selChannel && selChannel.kind === ChannelType.MASKEDAREA) {
                dup.selection.load(selChannel, SelectionType.REPLACE);
                var tint = dup.artLayers.add();
                var red = new SolidColor();
                red.rgb.red = 255;
                red.rgb.green = 0;
                red.rgb.blue = 0;
                dup.selection.fill(red);
                tint.opacity = 50.0;
                dup.flatten();
                dup.selection.deselect();
                appliedRed = true;
            }
        }
        var useJpeg = String(fmt) === "jpeg";
        var imagePath = folder + "/" + baseName + (useJpeg ? ".jpg" : ".png");
        if (useJpeg) CF_saveJpeg(dup, imagePath); else CF_savePng(dup, imagePath);
        var size = CF_roundUnit(dup.width) + "x" + CF_roundUnit(dup.height);
        dup.close(SaveOptions.DONOTSAVECHANGES);
        return "ok|" + imagePath + "|" + size + "|" + (useJpeg ? "jpeg" : "png")
            + "|" + maskPath + "|" + (hasSelection ? "1" : "0") + "|" + (appliedRed ? "1" : "0");
    } catch (e) {
        return "err|Export failed: " + e.message;
    } finally {
        app.preferences.rulerUnits = ruler;
        try { app.activeDocument.activeChannel = app.activeDocument.channels[0]; } catch (ignored6) {}
    }
}

// Selection -> alpha channel -> duplicate doc -> clear selection area to transparency.
// The mask PNG has the same size as the upload image (same maxEdge resize).
// The temp alpha channel CF_mask_tmp is intentionally KEPT in the document:
// CF_placeImage reuses it to clip the result to the selection locally, and
// removes it afterwards (it is also pre-cleaned on the next export).
// Open result PNG, copy merged, paste into the original doc as a new layer.
// Scale uniformly to cover-fit and center. With clipToSelection=true the result
// is locally restricted to the selection saved at export time.
function CF_placeImage(path, clipToSelection) {
    var ruler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        if (app.documents.length === 0) return "err|No document is open";
        var file = new File(path);
        if (!file.exists) return "err|Result file is missing: " + path;
        var doc = app.activeDocument;
        app.activeDocument = doc;
        var resDoc = app.open(file);
        CF_prepareForPng(resDoc);
        var resultSize = CF_roundUnit(resDoc.width) + "x" + CF_roundUnit(resDoc.height);
        resDoc.flatten();
        resDoc.selection.selectAll();
        resDoc.selection.copy();
        resDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = doc;
        // If an alpha channel is still the editing target, paste() goes into the
        // channel instead of creating a layer - reset to the composite channel first.
        try { doc.activeChannel = doc.channels[0]; } catch (ignored0) {}
        var layersBefore = doc.layers.length;
        doc.paste();
        if (doc.layers.length === layersBefore) return "err|Paste did not create a layer (an alpha channel may be active)";
        var layer = doc.activeLayer;
        var dw = CF_roundUnit(doc.width);
        var dh = CF_roundUnit(doc.height);
        var b = layer.bounds;
        var lw = CF_roundUnit(b[2]) - CF_roundUnit(b[0]);
        var lh = CF_roundUnit(b[3]) - CF_roundUnit(b[1]);
        if (lw > 0 && lh > 0 && (Math.abs(lw - dw) > 1 || Math.abs(lh - dh) > 1)) {
            var factor = Math.min(dw / lw, dh / lh) * 100;
            layer.resize(factor, factor, AnchorPosition.MIDDLECENTER);
        }
        b = layer.bounds;
        lw = CF_roundUnit(b[2]) - CF_roundUnit(b[0]);
        lh = CF_roundUnit(b[3]) - CF_roundUnit(b[1]);
        layer.translate(dw / 2 - (CF_roundUnit(b[0]) + lw / 2), dh / 2 - (CF_roundUnit(b[1]) + lh / 2));
        // Local clipping: load the selection channel saved at export time, invert
        // it and clear those pixels on the pasted layer, so only the selected
        // area shows the generated content - the region and alignment stay exact
        // even when the upstream ignores the mask and regenerates the whole image.
        if (String(clipToSelection) === "true" || clipToSelection === true) {
            var selChannel = doc.channels[doc.channels.length - 1];
            if (!selChannel || selChannel.kind !== ChannelType.MASKEDAREA) {
                try { selChannel = doc.channels.getByName("CF_mask_tmp"); } catch (ignored1) {}
            }
            if (selChannel && selChannel.kind === ChannelType.MASKEDAREA) {
                doc.selection.load(selChannel, SelectionType.REPLACE);
                doc.selection.invert();
                doc.selection.clear(); // clear OUTSIDE the selection on the pasted layer
                doc.selection.deselect();
                // restore the user's selection so they can regenerate right away
                doc.selection.load(selChannel, SelectionType.REPLACE);
            }
        }
        return "ok|" + resultSize;
    } catch (e) {
        return "err|Place image failed: " + e.message;
    } finally {
        app.preferences.rulerUnits = ruler;
        try { app.activeDocument.channels.getByName("CF_mask_tmp").remove(); } catch (ignored2) {}
        try { app.activeDocument.activeChannel = app.activeDocument.channels[0]; } catch (ignored3) {}
    }
}
