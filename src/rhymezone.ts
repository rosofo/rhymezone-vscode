import * as vscode from "vscode";
import { xhr, XHRResponse } from "request-light";
import { Config, JsonDB } from "node-json-db";
import * as cheerio from "cheerio";
import * as jsdom from "jsdom";
import { setTimeout } from "timers/promises";
import { Results } from "./resultsView";
import { createStore } from "zustand/vanilla";

export const store = createStore<{
  rhymes: string[];
  definition: string | null;
  synonyms: string[];
  setRhymes: (rhymes: string[]) => void;
  setDefinition: (definition: string | null) => void;
  setSynonyms: (synonyms: string[]) => void;
}>((set) => ({
  rhymes: [] as string[],
  definition: null as string | null,
  synonyms: [] as string[],
  setRhymes: (rhymes: string[]) => set({ rhymes }),
  setDefinition: (definition: string | null) => set({ definition }),
  setSynonyms: (synonyms: string[]) => set({ synonyms }),
}));

export async function fetchRhymes(word: string): Promise<string[]> {
  const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=perfect&org1=syl&org2=l&org3=y`;
  const response: XHRResponse = await xhr({ url });
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

export async function fetchAll(word: string) {
  const promises = [
    fetchCached(`/rhymes/${word}`, async () => {
      const rhymes = await fetchRhymes(word);
      await setCachedRhymes(word, rhymes);
      return rhymes;
    }).then(store.getState().setRhymes),
    await fetchCachedDefinition(word).then(store.getState().setDefinition),
    await fetchCachedSynonyms(word).then(store.getState().setSynonyms),
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

export function fetchCachedDefinition(word: string) {
  return fetchCached(`/definition/${word}`, async () => {
    const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=def&org1=syl&org2=l&org3=y`;
    const response: XHRResponse = await xhr({ url });
    const $ = cheerio.load(response.responseText);
    const definition: string | null = $("#rz-def-list").html();
    return definition;
  });
}

export function fetchCachedSynonyms(word: string) {
  return fetchCached(`/synonyms/${word}`, async () => {
    const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=syn&org1=syl&org2=l&org3=y`;
    const dom = await jsdom.JSDOM.fromURL(url, {});

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
