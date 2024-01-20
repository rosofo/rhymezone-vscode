import * as vscode from "vscode";
import { xhr, XHRResponse } from "request-light";
import { Config, JsonDB } from "node-json-db";
import * as cheerio from "cheerio";
import * as jsdom from "jsdom";
import { setTimeout } from "timers/promises";
import { Results } from "./resultsView";
import { createStore } from "zustand/vanilla";

export const store = createStore<{
  word?: string;
  rhymes: string[];
  definition: string | null;
  synonyms: string[];
  setRhymes: (word: string, rhymes: string[]) => void;
  setDefinition: (word: string, definition: string | null) => void;
  setSynonyms: (word: string, synonyms: string[]) => void;
}>((set, get) => ({
  rhymes: [] as string[],
  definition: null as string | null,
  synonyms: [] as string[],
  setRhymes: (word: string, rhymes: string[]) => {
    if (word === get().word) {
      set({ rhymes });
    }
  },
  setDefinition: (word: string, definition: string | null) => {
    if (word === get().word) {
      set({ definition });
    }
  },
  setSynonyms: (word: string, synonyms: string[]) => {
    if (word === get().word) {
      set({ synonyms });
    }
  },
}));

export async function fetchRhymes(
  word: string,
  token?: vscode.CancellationToken
): Promise<string[]> {
  const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=perfect&org1=syl&org2=l&org3=y`;
  const response: XHRResponse = await xhr({ url, token });
  const $ = cheerio.load(response.responseText);
  const rhymes = $(".r")
    .map((i, el) => $(el).text())
    .get();
  return rhymes;
}
export async function fetchCached(path: string, callback: () => Promise<any>) {
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

export async function fetchAll(word: string, token?: vscode.CancellationToken) {
  store.setState({ word });
  const promises = [
    fetchCached(`/rhymes/${word}`, async () => {
      const rhymes = await fetchRhymes(word, token);
      await setCachedRhymes(word, rhymes);
      return rhymes;
    }).then((result) => store.getState().setRhymes(word, result)),
    fetchCachedDefinition(word, token).then((result) =>
      store.getState().setDefinition(word, result)
    ),
    fetchCachedSynonyms(word, token).then((result) =>
      store.getState().setSynonyms(word, result)
    ),
  ];
  await Promise.all(promises);
}

export async function getCachedRhymes(word: string): Promise<string[] | null> {
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
export async function setCachedRhymes(word: string, rhymes: string[]) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const db = await getDb(workspace);
  await db.push(`/rhymes/${word}`, rhymes, true);
}

export function fetchCachedDefinition(
  word: string,
  token?: vscode.CancellationToken
) {
  return fetchCached(`/definition/${word}`, async () => {
    const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=def&org1=syl&org2=l&org3=y`;
    const response: XHRResponse = await xhr({ url, token });
    const $ = cheerio.load(response.responseText);
    const definition: string | null = $("#rz-def-list").html();
    return definition;
  });
}

export function fetchCachedSynonyms(
  word: string,
  token?: vscode.CancellationToken
) {
  return fetchCached(`/synonyms/${word}`, async () => {
    const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=syn&org1=syl&org2=l&org3=y`;
    const response: XHRResponse = await xhr({ url, token });
    const dom = new jsdom.JSDOM(response.body.toString());

    let results;
    for (const script of dom.window.document.body.querySelectorAll("script")) {
      if (script.text?.includes("THESAURUS_RESULTS")) {
        results = JSON.parse(script.text.match(/\[.+\]/)![0]);
      }
    }
    console.debug(results);
    return results.map((syn: any) => syn.word);
  });
}
export function lookupAtCursor(
  editor: vscode.TextEditor,
  tokenSource: vscode.CancellationTokenSource
) {
  const word = editor.document.getText(
    editor.document.getWordRangeAtPosition(editor.selection.active)
  );
  vscode.window.withProgress({ location: { viewId: "lookup" } }, () =>
    fetchAll(word, tokenSource.token)
  );
}
