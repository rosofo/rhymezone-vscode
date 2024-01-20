import * as vscode from "vscode";
import { resultsView } from "./resultsView";
import { store } from "./rhymezone";
import { fetchCachedDefinition } from "./rhymezone";
import {
  cancelAndReplaceToken,
  enableLookupView,
  focusLookupView,
} from "./resultsView";
import { lookupAtCursor } from "./rhymezone";

export function activate(context: vscode.ExtensionContext) {
  const [view, resultsViewProvider] = resultsView();
  store.subscribe((state) => {
    resultsViewProvider.results = { word: state.word, results: state };
  });
  let tokenSource = new vscode.CancellationTokenSource();

  vscode.commands.registerCommand("rhymezone.lookup", async () => {
    tokenSource = cancelAndReplaceToken(tokenSource);

    enableLookupView();
    focusLookupView();

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    lookupAtCursor(editor, tokenSource);

    vscode.window.onDidChangeTextEditorSelection((e) => {
      tokenSource = cancelAndReplaceToken(tokenSource);

      lookupAtCursor(editor, tokenSource);
    });
  });

  const hoverProvider = vscode.languages.registerHoverProvider("markdown", {
    async provideHover(document, position, token) {
      const word = document.getText(document.getWordRangeAtPosition(position));
      const definition = await fetchCachedDefinition(word);

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.supportHtml = true;
      markdown.appendMarkdown(`### ${word}\n`);
      markdown.appendMarkdown(definition);
      return new vscode.Hover(markdown);
    },
  });

  const replaceCommand = vscode.commands.registerCommand(
    "rhymezone.replace",
    async (position: vscode.Position, word: string) => {
      const doc = vscode.window.activeTextEditor?.document;
      const editor = vscode.window.activeTextEditor;
      editor?.edit((builder) => {
        const range = doc?.getWordRangeAtPosition(position);
        if (range) {
          builder.replace(range, word);
        }
      });
    }
  );

  context.subscriptions.push(replaceCommand, hoverProvider);
}
