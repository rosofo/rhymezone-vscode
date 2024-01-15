import * as vscode from "vscode";
import * as cheerio from "cheerio";
import { xhr, XHRResponse, getErrorStatusDescription } from "request-light";
import { Config, JsonDB } from "node-json-db";

async function fetchRhymes(word: string): Promise<string[]> {
  const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=perfect&org1=syl&org2=l&org3=y`;
  const response: XHRResponse = await xhr({ url });
  const $ = cheerio.load(response.responseText);
  const rhymes = $(".r")
    .map((i, el) => $(el).text())
    .get();
  return rhymes;
}

async function getCachedRhymes(word: string): Promise<string[] | null> {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const db = await getDb(workspace);
  const cache = await db.getObjectDefault<Record<string, string[]>>(
    "/rhymes",
    {}
  );
  return cache[word] || null;
}
async function getDb(workspace: string | undefined) {
  const vscodeDir = vscode.Uri.joinPath(
    vscode.Uri.parse(workspace!),
    ".vscode"
  );
  const dbPath = vscode.Uri.joinPath(vscodeDir, "rhymeCache.json");
  await vscode.workspace.fs.createDirectory(vscodeDir);
  try {
    await vscode.workspace.fs.stat(dbPath);
  } catch (e) {
    await vscode.workspace.fs.writeFile(dbPath, Buffer.from("{}"));
  }

  return new JsonDB(
    new Config(dbPath.toString().replace(/(\.json|file:\/\/)/, ""))
  );
}

async function setCachedRhymes(word: string, rhymes: string[]) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const db = await getDb(workspace);
  await db.push(`/rhymes/${word}`, rhymes, true);
}

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCompletionItemProvider(
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

  context.subscriptions.push(provider);
}
