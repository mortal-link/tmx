import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseTmx, TmxMap } from './tmxParser';

export class TmxEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'tmxPreview.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TmxEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      TmxEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const tmxDir = path.dirname(document.uri.fsPath);

    const resourceRoots = [
      vscode.Uri.file(tmxDir),
      vscode.Uri.joinPath(this.context.extensionUri, 'media'),
    ];

    const config = vscode.workspace.getConfiguration('tmxPreview');
    const extraPaths: string[] = config.get('tilesetSearchPaths', []);
    for (const p of extraPaths) {
      const resolved = path.isAbsolute(p) ? p : path.join(tmxDir, p);
      resourceRoots.push(vscode.Uri.file(resolved));
    }

    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        resourceRoots.push(folder.uri);
      }
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: resourceRoots,
    };

    let tmxMap: TmxMap;
    let tilesetImages: Record<string, string> = {};
    try {
      const tmxContent = await fs.promises.readFile(document.uri.fsPath, 'utf-8');
      tmxMap = parseTmx(tmxContent);
      tilesetImages = await this.resolveTilesetImages(
        tmxMap, tmxDir, extraPaths, webviewPanel.webview
      );
    } catch (err) {
      webviewPanel.webview.html = `<!DOCTYPE html>
<html><body style="background:#1e1e1e;color:#f44;padding:20px;font-family:monospace;">
<h2>TMX Preview Error</h2><pre>${TmxEditorProvider.escapeHtml(String(err))}</pre></body></html>`;
      return;
    }

    webviewPanel.webview.html = TmxEditorProvider.getHtmlStatic(
      webviewPanel.webview, this.context, tmxMap, tilesetImages
    );

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'viewSource') {
        vscode.commands.executeCommand(
          'vscode.openWith', document.uri, 'default'
        );
      }
    });

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(tmxDir, path.basename(document.uri.fsPath))
    );
    watcher.onDidChange(async () => {
      try {
        const newContent = await fs.promises.readFile(document.uri.fsPath, 'utf-8');
        const newMap = parseTmx(newContent);
        const newImages = await this.resolveTilesetImages(
          newMap, tmxDir, extraPaths, webviewPanel.webview
        );
        webviewPanel.webview.postMessage({
          type: 'update',
          map: newMap,
          tilesetImages: newImages,
        });
      } catch {
        // Ignore parse errors during editing
      }
    });
    webviewPanel.onDidDispose(() => watcher.dispose());
  }

  private async resolveTilesetImages(
    map: TmxMap,
    tmxDir: string,
    extraPaths: string[],
    webview: vscode.Webview
  ): Promise<Record<string, string>> {
    const images: Record<string, string> = {};

    for (const tileset of map.tilesets) {
      const source = tileset.imageSource;
      if (!source) { continue; }

      const resolved = await this.findTilesetImage(source, tmxDir, extraPaths);
      if (resolved) {
        images[source] = webview.asWebviewUri(vscode.Uri.file(resolved)).toString();
      }
    }

    return images;
  }

  private async findTilesetImage(
    source: string,
    tmxDir: string,
    extraPaths: string[]
  ): Promise<string | null> {
    const extensions = ['', '.png', '.jpg', '.bmp'];
    const dirs = [tmxDir, ...extraPaths.map(p => path.isAbsolute(p) ? p : path.join(tmxDir, p))];

    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        dirs.push(folder.uri.fsPath);
      }
    }

    for (const dir of dirs) {
      for (const ext of extensions) {
        const candidate = path.resolve(dir, source + ext);
        try {
          await fs.promises.access(candidate, fs.constants.R_OK);
          return candidate;
        } catch {
          // Try next
        }
      }
    }

    return null;
  }

  public static escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private static escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  public static getHtmlStatic(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
    map: TmxMap,
    tilesetImages: Record<string, string>
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'webview.js')
    );
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${cspSource} data:; script-src ${cspSource}; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TMX Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      overflow: hidden;
      background: #1e1e1e;
      color: #ccc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      user-select: none;
    }
    #toolbar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 36px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      display: flex; align-items: center;
      padding: 0 12px; gap: 8px;
      z-index: 100;
    }
    #toolbar button {
      background: #3c3c3c; color: #ccc;
      border: 1px solid #555; border-radius: 3px;
      padding: 3px 10px; cursor: pointer; font-size: 12px;
    }
    #toolbar button:hover { background: #505050; }
    #toolbar button.active { background: #094771; border-color: #007acc; color: #fff; }
    #toolbar .sep { width: 1px; height: 20px; background: #3c3c3c; }
    #toolbar .label { color: #888; font-size: 11px; }
    #info {
      position: fixed; bottom: 0; left: 0; right: 0;
      height: 24px;
      background: #007acc; color: #fff;
      display: flex; align-items: center;
      padding: 0 12px; font-size: 11px; gap: 16px;
      z-index: 100;
    }
    #canvas-container {
      position: fixed; top: 36px; bottom: 24px; left: 0; right: 0;
      overflow: hidden; cursor: grab;
    }
    #canvas-container.dragging { cursor: grabbing; }
    canvas { position: absolute; image-rendering: pixelated; image-rendering: crisp-edges; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span class="label">Layers:</span>
    <div id="layer-buttons"></div>
    <div class="sep"></div>
    <button id="btn-grid" title="Toggle grid (G)">Grid</button>
    <button id="btn-fit" title="Fit to window (0)">Fit</button>
    <div class="sep"></div>
    <span class="label" id="zoom-label">100%</span>
    <div style="flex:1"></div>
    <button id="btn-source" title="View XML source">&lt;/&gt; Source</button>
  </div>
  <div id="canvas-container">
    <canvas id="map-canvas"></canvas>
  </div>
  <div id="info">
    <span id="info-size"></span>
    <span id="info-tile"></span>
    <span id="info-gid"></span>
  </div>
  <div id="map-data" style="display:none;" data-map="${TmxEditorProvider.escapeAttr(JSON.stringify(map))}" data-images="${TmxEditorProvider.escapeAttr(JSON.stringify(tilesetImages))}"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
