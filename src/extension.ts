import * as vscode from 'vscode';
import { TmxEditorProvider } from './tmxEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(TmxEditorProvider.register(context));
}

export function deactivate() {}
