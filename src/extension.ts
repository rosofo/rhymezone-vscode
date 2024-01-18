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
  const resultsViewProvider = resultsView();

  vscode.commands.registerCommand("rhymezone.lookup", async () => {
    vscode.commands.executeCommand(
      "setContext",
      "rhymezoneResultsEnabled",
      true
    );

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const word = editor.document.getText(
      editor.document.getWordRangeAtPosition(editor.selection.active)
    );
    fetchAll(word);
    store.subscribe((state) => {
      resultsViewProvider.results = { word, results: state };
    });
  });

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    "markdown",
    {
      async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
      ) {
        const wordRange = document.getWordRangeAtPosition(position);
        let word = document.getText(wordRange);
        word = word.slice(0, word.length - 1);

        console.log("word:", word);
        console.log("wordRange:", wordRange);

        let rhymes = await getCachedRhymes(word);
        if (!rhymes) {
          rhymes = await fetchRhymes(word);
          await setCachedRhymes(word, rhymes);
        }
        console.log("rhymes:", rhymes);

        return rhymes.slice(0, 20).map((rhyme) =>
          // a simple completion item which inserts `Hello World!`
          {
            /* a simple completion item which inserts `Hello World!`*/
            const completion = new vscode.CompletionItem(rhyme);
            completion.filterText = word;
            return completion;
          }
        );
      },
    },
    "]"
  );

  const hoverProvider = vscode.languages.registerHoverProvider("markdown", {
    async provideHover(document, position, token) {
      const word = document.getText(document.getWordRangeAtPosition(position));
      const definition = await fetchCachedDefinition(word);
      const synonyms = await fetchCachedSynonyms(word);

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.supportHtml = true;
      markdown.appendMarkdown(`### ${word}\n`);
      for (const synonym of synonyms) {
        const command = `command:rhymezone.replace?${encodeURIComponent(
          JSON.stringify([position, synonym])
        )}`;
        markdown.appendMarkdown(`- [${synonym}](${command})\n`);
      }
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

  context.subscriptions.push(completionProvider, replaceCommand, hoverProvider);
}
