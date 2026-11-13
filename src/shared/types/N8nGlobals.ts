// Declarações de runtime do n8n — disponíveis no sandbox do Code node
declare function $(nodeName: string): { first(): { json: any }; all(): Array<{ json: any }> };
declare const $json: any;
declare const $node: any;
// 'this' context é injetado pelo n8n — usar (this as any).helpers.httpRequest(...)
