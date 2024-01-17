import * as vscode from "vscode";
import * as cheerio from "cheerio";
import { xhr, XHRResponse, getErrorStatusDescription } from "request-light";
import { Config, JsonDB } from "node-json-db";
import * as jsdom from "jsdom";
import { setTimeout } from "timers/promises";

async function fetchRhymes(word: string): Promise<string[]> {
  const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=perfect&org1=syl&org2=l&org3=y`;
  const response: XHRResponse = await xhr({ url });
  const $ = cheerio.load(response.responseText);
  const rhymes = $(".r")
    .map((i, el) => $(el).text())
    .get();
  return rhymes;
}

async function fetchCached(path: string, callback: () => Promise<any>) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const db = await getDb(workspace);
  try {
    const obj = await db.getObject(path);
    console.debug("cache hit", path, obj);
    return obj;
  } catch (e) {
    const result = await callback();
    await db.push(path, result, true);
    console.debug("cache miss", path, result);
    return result;
  }
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
function fetchCachedDefinition(word: string) {
  return fetchCached(`/definition/${word}`, async () => {
    const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=def&org1=syl&org2=l&org3=y`;
    const response: XHRResponse = await xhr({ url });
    const $ = cheerio.load(response.responseText);
    const definition = $("#rz-def-list").html();
    return definition;
  });
}

function fetchCachedSynonyms(word: string) {
  return fetchCached(`/synonyms/${word}`, async () => {
    const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=syn&org1=syl&org2=l&org3=y`;
    const dom = await jsdom.JSDOM.fromURL(url, {
      runScripts: "dangerously",
      resources: "usable",
    });
    await setTimeout(1000);
    const $ = cheerio.load(dom.window.document.body.innerHTML);
    const syns = $(".res")
      .map((i, el) => {
        const cloned = $(el).clone();
        cloned.children().remove();
        return cloned.text();
      })
      .get();
    console.debug(syns);
    return syns;
  });
}
