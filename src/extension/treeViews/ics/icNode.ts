// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { from } from "@esfx/iter-query";
import { CancellationToken, ProviderResult, ThemeColor, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { markdown, MarkdownString } from "../../../core/markdown";
import { IcEntry } from "../../../third-party-derived/deoptigate/icEntry";
import { formatIcState, IcState } from "../../../third-party-derived/v8/enums/icState";
import { IcType } from "../../../third-party-derived/v8/enums/icType";
import { FunctionReference } from "../../model/functionReference";
import { formatLocation } from "../../vscode/location";
import { BaseNode } from "../common/baseNode";
import { createTreeItem } from "../createTreeItem";
import { IcTreeDataProvider } from "./icTreeDataProvider";

export class IcNode extends BaseNode {
    private _functionReference: FunctionReference | null | undefined;
    private _file: Uri | undefined;
    private _state: IcState | undefined;

    constructor(
        provider: IcTreeDataProvider,
        parent: BaseNode | undefined,
        readonly ic: IcEntry,
    ) {
        super(provider, parent);
    }

    get provider(): IcTreeDataProvider { return super.provider as IcTreeDataProvider; }
    get file() { return this._file ??= this.ic.filePosition.uri; }
    get state() { return this._state ??= this.ic.getWorstIcState(); }
    get hitCount() { return this.ic.updates.length; }
    get functionReference() {
        if (this._functionReference === undefined) {
            const functionEntry = from(this.ic.updates).maxBy(update => update.newState)?.functionEntry;
            this._functionReference = functionEntry && FunctionReference.fromFunctionEntry(functionEntry) || null;
        }
        return this._functionReference || undefined;
    }

    private formatLabelCommon() {
        // IC entries are labeled by their worst IC state
        const update = from(this.ic.updates).maxBy(update => update.newState);
        const label = update ? `${update.type}: ${formatIcState(update.newState)}` : "Unknown";
        return label;
    }

    protected formatLabel() {
        return `${this.formatLabelCommon()} (${this.ic.updates.length})`;
    }

    protected override createTreeItem() {
        const label = this.formatLabel();
        const relativeTo = this.provider.log && { log: this.provider.log, ignoreIfBasename: true };
        const description = formatLocation(this.ic.referenceLocation, { as: "file", skipEncoding: true, relativeTo, include: "position" });
        return createTreeItem(label, TreeItemCollapsibleState.None, {
            contextValue: "",
            description: description,
            iconPath: this.getIconPath(),
            command: this.ic.referenceLocation && {
                title: "Go to IC",
                command: "vscode.open",
                arguments: [
                    this.ic.referenceLocation.uri,
                    {
                        preview: true,
                        selection: this.ic.referenceLocation.range
                    }
                ]
            }
        });
    }

    override resolveTreeItem(treeItem: TreeItem, token: CancellationToken): ProviderResult<TreeItem> {
        const lines: MarkdownString[] = [];
        // TODO: function name and file
        lines.push(markdown`**hit count:** ${this.ic.updates.length}  \n`);

        treeItem.tooltip = markdown`${this.formatLabelCommon()}\n\n${lines}`;
        return treeItem;
    }

    private getIconPath() {
        switch (this.ic.getWorstUpdate()?.type) {
            case IcType.LoadGlobalIC: return new ThemeIcon("symbol-variable", new ThemeColor("symbolIcon.fieldForeground"));
            case IcType.StoreGlobalIC: return new ThemeIcon("symbol-variable", new ThemeColor("symbolIcon.methodForeground"));
            case IcType.LoadIC: return new ThemeIcon("symbol-field", new ThemeColor("symbolIcon.fieldForeground"));
            case IcType.StoreIC: return new ThemeIcon("symbol-field", new ThemeColor("symbolIcon.methodForeground"));
            case IcType.KeyedLoadIC: return new ThemeIcon("symbol-string", new ThemeColor("symbolIcon.fieldForeground"));
            case IcType.KeyedStoreIC: return new ThemeIcon("symbol-string", new ThemeColor("symbolIcon.methodForeground"));
            case IcType.StoreInArrayLiteralIC: return new ThemeIcon("symbol-array");
            case undefined: return new ThemeIcon("symbol-misc");
        }
    }
}
