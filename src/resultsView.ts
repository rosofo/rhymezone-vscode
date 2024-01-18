import * as vscode from "vscode";

export type Results = {
  synonyms: string[];
  definition: string | null;
  rhymes: string[] | null;
};

class Result implements vscode.TreeItem {
  constructor(public readonly label: string) {}
  collapsibleState?: vscode.TreeItemCollapsibleState | undefined;
  get tooltip(): string {
    return `${this.label}`;
  }
  get description(): string {
    return `${this.label}`;
  }
  contextValue = "result";
}

class ResultsViewProvider implements vscode.TreeDataProvider<Result> {
  private _onDidChangeTreeData: vscode.EventEmitter<Result | undefined | void> =
    new vscode.EventEmitter<Result | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Result | undefined | void> =
    this._onDidChangeTreeData.event;

  private _results: { word: string; results: Results } | undefined;
  set results(results: { word: string; results: Results } | undefined) {
    this._results = results;
    this.refresh();
  }

  refresh(): void {
    console.log("fired refresh event");
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element: Result): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(element?: Result | undefined): vscode.ProviderResult<Result[]> {
    if (!element) {
      const synonyms = new Result("synonyms");
      synonyms.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      const rhymes = new Result("rhymes");
      rhymes.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      return [rhymes, synonyms];
    } else if (element.label === "synonyms") {
      return this._results?.results.synonyms?.map(
        (synonym) => new Result(synonym)
      );
    } else if (element.label === "rhymes") {
      return this._results?.results.rhymes?.map((rhyme) => new Result(rhyme));
    }
  }
}

export function resultsView() {
  const provider = new ResultsViewProvider();
  vscode.window.registerTreeDataProvider("lookup", provider);
  return provider;
}
