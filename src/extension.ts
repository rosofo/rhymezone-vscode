import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';

async function fetchRhymes(word: string): Promise<string[]> {
	const url = `https://www.rhymezone.com/r/rhyme.cgi?Word=${word}&typeofrhyme=perfect&org1=syl&org2=l&org3=y`;
	const response: XHRResponse = await xhr({ url });
	const $ = cheerio.load(response.responseText);
	const rhymes = $('.r')
		.map((i, el) => $(el).text())
		.get();
	return rhymes;
}

export function activate(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerCompletionItemProvider('markdown', {
		async provideCompletionItems(
			document: vscode.TextDocument,
			position: vscode.Position,
			token: vscode.CancellationToken,
			context: vscode.CompletionContext
		) {
			const wordRange = document.getWordRangeAtPosition(position);
			const word = document.getText(wordRange);

			console.log('word:', word);
			console.log('wordRange:', wordRange);

			const rhymes = await fetchRhymes(word);
			console.log('rhymes:', rhymes);

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
	});

	context.subscriptions.push(provider);
}
