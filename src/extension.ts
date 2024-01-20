import * as vscode from "vscode";
import { getErrorStatusDescription } from "request-light";
import { resultsView } from "./resultsView";
import {
  getCachedRhymes,
  fetchRhymes,
  setCachedRhymes,
  fetchAll,
  store,
} from "./rhymezone";
import { fetchCachedDefinition, fetchCachedSynonyms } from "./rhymezone";

export function activate(context: vscode.ExtensionContext) {
  const [view, resultsViewProvider] = resultsView();
  store.subscribe((state) => {
    resultsViewProvider.results = { word: state.word, results: state };
  });
  let tokenSource = new vscode.CancellationTokenSource();

  vscode.commands.registerCommand("rhymezone.lookup", async () => {
    tokenSource.cancel();
    tokenSource = new vscode.CancellationTokenSource();

    vscode.commands.executeCommand(
      "setContext",
      "rhymezoneResultsEnabled",
      true
    );
    vscode.commands.executeCommand("lookup.focus");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const word = editor.document.getText(
      editor.document.getWordRangeAtPosition(editor.selection.active)
    );

    vscode.window.withProgress({ location: { viewId: "lookup" } }, () =>
      fetchAll(word, tokenSource.token)
    );

    vscode.window.onDidChangeTextEditorSelection((e) => {
      tokenSource.cancel();
      tokenSource = new vscode.CancellationTokenSource();

      const word = editor.document.getText(
        editor.document.getWordRangeAtPosition(editor.selection.active)
      );
      vscode.window.withProgress({ location: { viewId: "lookup" } }, () =>
        fetchAll(word, tokenSource.token)
      );
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
