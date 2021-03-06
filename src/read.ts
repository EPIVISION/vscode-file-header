/*
					 ,___ ,__  , .  . ,  __  ,  __  .  .
					 |__  |__) | \  / | /__` | /  \ |\ |
					 |___ |    |  \/  | .__/ | \__/ | \|

https://github.com/EPIVISION/vscode-file-header

read.ts (c) 2020

Desc: read header template from string, local file or remote

Created:  2020-03-28T16:10:35.685Z
Modified: !date!

Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International Public License
*/

import * as vscode from 'vscode';
import { URL } from 'url';
import log from './logger';
import interpolate from './interpolate';

async function file(url: URL) {
	const { readFileSync } = await import('fs'); // defer import for performance reasons
	return readFileSync(url, 'utf8');
}

// partially from https://stackoverflow.com/questions/6968448/where-is-body-in-a-nodejs-http-get-response/50244236#50244236
async function remote(url: URL) {
	const { get } = await import(url.protocol.slice(0, -1));

	return new Promise((resolve, reject) => {
		get(url, (res) => {
			let data = '';

			// A chunk of data has been received.
			res.on('data', (chunk) => { data += chunk; });

			// The whole response has been received. Print out the result.
			res.on('end', () => { resolve(data); });
		}).on('error', (err) => { reject(err); });
	});
}

export default async function getTemplate(text: string, variables:Map<string, string>) {
	log.info('check template is external by protocol');
	const regex = /(?<protocol>(?:file|https?):)\/\//i;
	const res = text.match(regex);

	if (!res) {
		log.debug('no valid protocol found. must be template text');
		return text;
	}

	log.info('check interpolation is needed');
	if (text.indexOf('$') !== -1) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			log.error('lost activeTextEditor');
			throw -1887295;
		}
		log.info('interpolate variables');
		text = interpolate(text, variables);

		log.info('interpolate remaining ${} via snippet');
		const snippet = new vscode.SnippetString(text);
		log.debug('ensure cursor placed at snippet end');
		snippet.appendTabstop(0);

		const start = editor.selection.active;
		await editor.insertSnippet(snippet, start, { undoStopBefore: false, undoStopAfter: false });
		const end = editor.selection.active;
		const range = new vscode.Range(start, end);
		log.debug('grab interpolated text');
		text = editor.document.getText(range);

		log.debug('delete temporary text');
		await editor.edit((editBuilder) => { editBuilder.delete(range); },
			{ undoStopBefore: false, undoStopAfter: false });
	}

	log.info(`fetch template from url ´${text}´`);
	let url;
	try {
		url = new URL(text);
	} catch (error) {
		log.error(`´${error.message}´, must be template text`);
		return text;
	}

	try {
		switch (url.protocol) {
		case 'file:':
			return await file(url);
		case 'http:':
		case 'https:':
			return await remote(url);
		default:
			log.error(`unrecognized protocol ´${url.protocol}´, guess this is template text`);
			return text;
		}
	} catch (error) {
		log.error('header template fetch failed ultimately 😔 ' + error);
		return error.message;
	}
}
