import { IMaintenanceOperation, OperationResultType } from "../OperationAbstractions";
import { throwError } from "../../../Exceptions/index";
import { RavenCommand } from "../../../Http/RavenCommand";
import { DocumentConventions } from "../../Conventions/DocumentConventions";
import { IRaftCommand } from "../../../Http/IRaftCommand";
import { HttpRequestParameters } from "../../../Primitives/Http";
import { ServerNode } from "../../../Http/ServerNode";
import { RaftIdGenerator } from "../../../Utility/RaftIdGenerator";

export class DeleteSorterOperation implements IMaintenanceOperation<void> {
    private readonly _sorterName: string;

    public constructor(sorterName: string) {
        if (!sorterName) {
            throwError("InvalidArgumentException", "SorterName cannot be null");
        }

        this._sorterName = sorterName;
    }

    public get resultType(): OperationResultType {
        return "CommandResult";
    }

    getCommand(conventions: DocumentConventions): RavenCommand<void> {
        return new DeleteSorterCommand(this._sorterName);
    }
}

class DeleteSorterCommand extends RavenCommand<void> implements IRaftCommand {
    private readonly _sorterName: string;

    public constructor(sorterName: string) {
        super();

        if (!sorterName) {
            throwError("InvalidArgumentException", "IndexName cannot be null");
        }

        this._sorterName = sorterName;
    }

    public createRequest(node: ServerNode): HttpRequestParameters {
        const uri = node.Url + "/databases/" + node.Database + "/admin/sorters?name=" + encodeURIComponent(this._sorterName);

        return {
            uri,
            method: "DELETE"
        }
    }

    get isReadRequest(): boolean {
        return false;
    }

    public getRaftUniqueRequestId(): string {
        return RaftIdGenerator.newId();
    }
}