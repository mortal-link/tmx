import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseTmx } from './tmxParser';
import { TmxEditorProvider } from './tmxEditorProvider';

let previewPanel: vscode.WebviewPanel | undefined;
let currentFsPath: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(TmxEditorProvider.register(context));

  // Side-by-side preview command
  context.subscriptions.push(
    vscode.commands.registerCommand('tmxPreview.open', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.uri.fsPath.endsWith('.tmx')) {
        vscode.window.showWarningMessage('Please open a .tmx file first.');
        return;
      }
      openOrUpdateSidePreview(editor.document, context);
    })
  );

  // Follow active editor: when switching to a different .tmx file, update preview
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!previewPanel || !editor) { return; }
      const fsPath = editor.document.uri.fsPath;
      if (fsPath.endsWith('.tmx') && fsPath !== currentFsPath) {
        openOrUpdateSidePreview(editor.document, context);
      }
    })
  );

  // Live update preview when editing
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const fsPath = e.document.uri.fsPath;
      if (previewPanel && fsPath === currentFsPath) {
        sendUpdate(e.document, previewPanel, context);
      }
    })
  );
}

async function openOrUpdateSidePreview(
  document: vscode.TextDocument,
  context: vscode.ExtensionContext
) {
  const fsPath = document.uri.fsPath;

  if (previewPanel) {
    // Reuse existing panel, just update content
    currentFsPath = fsPath;
    previewPanel.title = 'Preview: ' + path.basename(fsPath);
    // Full reload since it may be a different file with different tilesets
    previewPanel.webview.html = '';
    await sendUpdate(document, previewPanel, context, true);
    previewPanel.reveal(vscode.ViewColumn.Beside, true);
  } else {
    // Create new panel
    previewPanel = vscode.window.createWebviewPanel(
      'tmxPreview.side',
      'Preview: ' + path.basename(fsPath),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    currentFsPath = fsPath;

    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
      currentFsPath = undefined;
    });

    await sendUpdate(document, previewPanel, context, true);
  }
}

async function sendUpdate(
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  forceFullReload = false
) {
  const fsPath = document.uri.fsPath;
  const tmxDir = path.dirname(fsPath);

  const resourceRoots = [
    vscode.Uri.file(tmxDir),
    vscode.Uri.joinPath(context.extensionUri, 'media'),
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

  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: resourceRoots,
  };

  try {
    const tmxContent = document.getText();
    const tmxMap = parseTmx(tmxContent);

    const tilesetImages: Record<string, string> = {};
    for (const tileset of tmxMap.tilesets) {
      const source = tileset.imageSource;
      if (!source) { continue; }
      const resolved = await findTilesetImage(source, tmxDir, extraPaths);
      if (resolved) {
        tilesetImages[source] = panel.webview.asWebviewUri(
          vscode.Uri.file(resolved)
        ).toString();
      }
    }

    if (forceFullReload || !panel.webview.html) {
      panel.webview.html = TmxEditorProvider.getHtmlStatic(
        panel.webview, context, tmxMap, tilesetImages
      );
    } else {
      panel.webview.postMessage({
        type: 'update',
        map: tmxMap,
        tilesetImages,
      });
    }
  } catch {
    // Ignore parse errors during editing
  }
}

async function findTilesetImage(
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

export function deactivate() {}
