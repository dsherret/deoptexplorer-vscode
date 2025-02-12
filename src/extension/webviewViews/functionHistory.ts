// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { from } from "@esfx/iter-query";
import * as path from "path";
import { Disposable, ExtensionContext, Uri, ViewColumn, Webview, WebviewPanel, window } from "vscode";
import { assert } from "../../core/assert";
import { formatCodeKind } from "../../third-party-derived/v8/enums/codeKind";
import { formatDeoptimizeKind } from "../../third-party-derived/v8/enums/deoptimizeKind";
import { FunctionEntry } from "../../third-party-derived/deoptigate/functionEntry";
import { formatFunctionState } from "../../third-party-derived/v8/enums/functionState";
import { formatIcState } from "../../third-party-derived/v8/enums/icState";
import { formatIcType } from "../../third-party-derived/v8/enums/icType";
import { LogFile } from "../model/logFile";
import { formatAddress } from "../../core/address";
import * as constants from "../constants";
import { html } from "../../core/html";
import { formatMillisecondsHighPrecision } from "../formatting/numbers";
import { openedLog } from "../services/currentLogFile";
import { events } from "../services/events";
import { parseLocation } from "../vscode/location";
import { renderLinkToFile } from "./utils";
import { getCanonicalLocation } from "../services/canonicalPaths";

function generateFunctionViewHtml(entry: FunctionEntry, log: LogFile, webview: Webview) {
    return html`<!DOCTYPE html>
<html lang="en">
<head>
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        img-src ${webview.cspSource} https: 'self' data:;
        style-src ${webview.cspSource} 'unsafe-inline';
    ">
    <meta name="viewport" content="width=device-width, initial-scale: 1.0">
</head>
<body>
    <h1>${entry.functionName}</h1>
    <ul>
        <li>Location: ${entry.referenceLocation ? renderLinkToFile(`${path.basename(entry.referenceLocation.uri.fsPath)}:${entry.referenceLocation.range.start.line + 1}:${entry.referenceLocation.range.start.character + 1}`, entry.referenceLocation, { title: entry.referenceLocation.uri.fsPath }) : "<unknown>"}</li>
    </ul>
    <table cellpadding=0 cellspacing=5>
    <thead>
        <tr>
            <th align="right">Timestamp</th>
            <th align="left">Event</th>
            <th align="left">Description</th>
        </tr>
    </thead>
    <tbody>
    ${from(entry.timeline).select(event => html`
        <tr valign="top">
            <td align="right">${formatMillisecondsHighPrecision(event.timestamp.sinceOrigin().inMillisecondsF())}</td>
            <td>${
                event.event === "created" ? "Created" :
                event.event === "updated" ? "Updated" :
                event.event === "moved" ? "Moved" :
                event.event === "deleted" ? "Deleted" :
                event.event === "sfi-moved" ? "SFI Moved" :
                event.event === "deopt" ? renderLinkToFile(`${formatDeoptimizeKind(event.update.bailoutType)} Deopt`, event.entry.referenceLocation, { viewColumn: ViewColumn.One}) :
                event.event === "ic" ? renderLinkToFile(formatIcType(event.update.type), event.entry.referenceLocation, { viewColumn: ViewColumn.One}) :
                assert(false)
            }</td>
            <td>${
                event.event === "created" || event.event === "updated" ? html`
                    Type: ${event.type}<br>
                    Kind: ${formatCodeKind(event.codeKind, log.version)}<br>
                    Size: ${event.size}<br>
                    State: ${formatFunctionState(event.state)}<br>
                    Address: ${formatAddress(event.startAddress)}<br>
                    Shared Function: ${formatAddress(event.funcStartAddress)}` :
                event.event === "moved" ? html`
                    From: ${formatAddress(event.fromAddress)}<br>
                    To: ${formatAddress(event.toAddress)}` :
                event.event === "deleted" ? html`
                    Address: ${formatAddress(event.startAddress)}`:
                event.event === "sfi-moved" ? html`
                    From: ${formatAddress(event.fromAddress)}<br>
                    To: ${formatAddress(event.toAddress)}` :
                event.event === "deopt" ? html`
                    Reason: ${event.update.deoptReason}` :
                event.event === "ic" ? html`
                    Key: ${event.update.key}<br>
                    Old: ${formatIcState(event.update.oldState)}<br>
                    New: ${formatIcState(event.update.newState)}` :
                assert(false)
            }</td>
        </tr>
    `)}
    </tbody>
    </table>
</body>
</html>`.toString();
}

export function getUriForFunctionEntry(entry: FunctionEntry) {
    return Uri.parse(`${constants.schemes.functionHistory}:${encodeURIComponent(entry.filePosition.toString())}/${encodeURIComponent(entry.functionName)}.md`);
}

export function getFunctionEntryFromFunctionUri(uri: Uri) {
    if (uri.scheme === constants.schemes.functionHistory) {
        const positionText = decodeURIComponent(uri.toString().slice(constants.schemes.functionHistory.length + 1).split("/")[0]);
        const filePosition = positionText && getCanonicalLocation(parseLocation(positionText, /*strict*/ false));
        if (filePosition && openedLog) {
            return openedLog.findFunctionEntryByFilePosition(filePosition);
        }
    }
}

let panel: WebviewPanel | undefined;
export async function showFunctionHistory(entry: FunctionEntry) {
    if (openedLog) {
        if (!panel) {
            const view = panel = window.createWebviewPanel(
                constants.webviews.functionView,
                "Function History",
                ViewColumn.Beside,
                {
                    enableCommandUris: true
                });
            panel.onDidDispose(() => {
                if (panel === view) {
                    panel = undefined;
                }
            });
        }
        else {
            panel.reveal(ViewColumn.Beside);
        }

        panel.title = `Function History: ${entry.functionName}`;
        panel.webview.html = generateFunctionViewHtml(entry, openedLog, panel.webview);
    }
}

export function activateFunctionHistoryWebview(context: ExtensionContext) {
    return Disposable.from(
        new Disposable(() => panel?.dispose()),
        events.onDidCloseLogFile(() => panel?.dispose())
    );
}
