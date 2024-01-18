import * as vscode from "vscode";

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

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element: Result): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(element?: Result | undefined): vscode.ProviderResult<Result[]> {
    if (!element) {
      const synonyms = new Result("synonyms");
      synonyms.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      return [];
    } else if (element.label === "synonyms") {
      return [new Result("synonym1"), new Result("synonym2")];
    }
  }
}

export function resultsView() {
  vscode.commands.executeCommand("setContext", "rhymezoneResultsEnabled", true);
  vscode.window.registerTreeDataProvider("synonyms", new ResultsViewProvider());
}
